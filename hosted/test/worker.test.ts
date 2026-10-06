// The built Worker (hosted/dist/worker.mjs and checker.mjs, from hosted/build/build.ts) running in
// workerd through Miniflare, with Miniflare's local D1 and R2 and GitHub answering from recorded
// responses. Acceptance (iv): uninstalling deletes the installation's records and keys. Also: the
// bundle runs on the Workers runtime as configured in wrangler.toml, every request it makes is on the
// allowlist, retention 0 stores nothing, and the scheduled sweep enforces retention and uninstalls.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  Miniflare,
  type Request as MiniflareRequest,
  Response as MiniflareResponse,
} from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyRecord } from '../../src/record/verify.js';
import { parseStrictJson } from '../../src/spec/json.js';
import { buildHosted, type HostedBuild } from '../build/build.js';
import { setRetentionSql } from '../scripts/set-retention.js';
import type { Database, RecordBucket } from '../src/env.js';
import { checkRoute } from '../src/transport.js';
import { webhookSignature } from '../src/webhook.js';
import {
  appKey,
  fakeNetwork,
  INSTALLATION,
  installationPayload,
  issueKey,
  migrate,
  PR,
  REPO,
  ROOT,
  recordedGitHub,
  SIGNER,
  scenarioReport,
  sshSigningKey,
  WEBHOOK_SECRET,
} from './support.js';

const ORIGIN = 'https://hosted.test';
const OTHER = 2;

let built: HostedBuild;
let mf: Miniflare;
let DB: Database;
let RECORDS: RecordBucket;
const signing = sshSigningKey();
const outbound: { method: string; url: string; accept: string | null; body?: string }[] = [];

function wranglerSetting(name: string): string {
  const toml = readFileSync(join(ROOT, 'hosted/wrangler.toml'), 'utf8');
  const match = new RegExp(`^${name} = (.+)$`, 'm').exec(toml);
  if (match === null) throw new Error(`wrangler.toml has no ${name}`);
  return match[1] as string;
}

async function call(path: string, init: RequestInit = {}) {
  const response = await mf.dispatchFetch(`${ORIGIN}${path}`, init as never);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function deliver(event: string, payload: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  return call('/v0.1/webhooks/github', {
    method: 'POST',
    headers: {
      'x-github-event': event,
      'x-hub-signature-256': await webhookSignature(secret, body),
    },
    body,
  });
}

async function check(key: string) {
  return call('/v0.1/check', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: JSON.stringify({ repository: REPO, pullRequest: PR, report: scenarioReport() }),
  });
}

async function stored(prefix = 'records/'): Promise<string[]> {
  return (await RECORDS.list({ prefix })).objects.map((o) => o.key).sort();
}

async function keyCount(installationId: number): Promise<number> {
  const row = await DB.prepare('SELECT count(*) AS n FROM api_keys WHERE installation_id = ?')
    .bind(installationId)
    .first<{ n: number }>();
  return row?.n ?? -1;
}

beforeAll(async () => {
  built = await buildHosted(mkdtempSync(join(tmpdir(), 'dunstan-hosted-build-')));
  const answers = recordedGitHub();
  const github = fakeNetwork(answers);
  mf = new Miniflare({
    modules: true,
    scriptPath: built.workerPath,
    modulesRoot: dirname(built.workerPath),
    compatibilityDate: JSON.parse(wranglerSetting('compatibility_date')),
    compatibilityFlags: JSON.parse(wranglerSetting('compatibility_flags')),
    d1Databases: ['DB'],
    r2Buckets: ['RECORDS'],
    bindings: {
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY: appKey().privateKey,
      GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RECORD_SIGNING_KEY: signing.privateKey,
      RECORD_SIGNER: SIGNER,
    },
    outboundService: async (request: MiniflareRequest) => {
      const body = request.method === 'GET' ? undefined : await request.text();
      outbound.push({
        method: request.method,
        url: request.url,
        accept: request.headers.get('accept'),
        ...(body === undefined ? {} : { body }),
      });
      const answer = await github.fetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        ...(body === undefined ? {} : { body }),
      });
      return new MiniflareResponse(await answer.text(), {
        status: answer.status,
        headers: Object.fromEntries(answer.headers),
      });
    },
  });
  DB = (await mf.getD1Database('DB')) as unknown as Database;
  RECORDS = (await mf.getR2Bucket('RECORDS')) as unknown as RecordBucket;
  await migrate(DB);
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

describe('the built Worker on the Workers runtime', () => {
  it('reports the digest of the bundle it runs from', async () => {
    const { status, body } = await call('/v0.1/health');
    expect(status).toBe(200);
    expect(body).toEqual({
      status: 'ok',
      checker: { name: 'dunstan', version: '0.1.1', digest: { sha256: built.digest } },
      spec: '0.1.1',
    });
  });

  it('refuses a webhook whose signature does not verify', async () => {
    const { status } = await deliver('installation', installationPayload('created'), 'wrong');
    expect(status).toBe(401);
    expect(await DB.prepare('SELECT * FROM installations').all()).toMatchObject({ results: [] });
  });

  it('checks a pull request: a signed record that verifies, read only through the allowlist', async () => {
    expect((await deliver('installation', installationPayload('created'))).status).toBe(202);
    const key = await issueKey(DB);
    outbound.length = 0;
    const { status, body } = await check(key);
    expect(status).toBe(200);
    expect(body.verdict).toBe('pass');
    const record = parseStrictJson(body.record as string) as {
      predicate: { checker: { digest: { sha256: string } } };
    };
    expect(verifyRecord(record).problems).toEqual([]);
    expect(record.predicate.checker.digest.sha256).toBe(built.digest);

    const dir = mkdtempSync(join(tmpdir(), 'dunstan-hosted-sig-'));
    writeFileSync(join(dir, 'record.json'), body.record as string);
    writeFileSync(join(dir, 'record.json.sig'), body.signature as string);
    const verified = execFileSync(
      'ssh-keygen',
      [
        '-Y',
        'verify',
        '-f',
        signing.allowedSigners,
        '-I',
        SIGNER,
        '-n',
        'dunstan-record',
        '-s',
        join(dir, 'record.json.sig'),
      ],
      {
        input: readFileSync(join(dir, 'record.json')),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    expect(verified).toContain('Good "dunstan-record" signature');

    expect(outbound.map((r) => `${r.method} ${new URL(r.url).pathname}`).sort()).toEqual([
      'GET /repos/example-org/example-repo/compare/7638417db6d59f3c431d3e1f261cc637155684cd...6dcb09b5b57875f334f61aebed695e2e4193db5e',
      'GET /repos/example-org/example-repo/git/commits/7638417db6d59f3c431d3e1f261cc637155684cd',
      'GET /repos/example-org/example-repo/pulls/1347',
      'GET /repos/example-org/example-repo/pulls/1347/files',
      'POST /app/installations/1/access_tokens',
      'POST /graphql',
    ]);
    for (const r of outbound) {
      expect(() => checkRoute(r.method, r.url, r.body, r.accept)).not.toThrow();
    }
    expect(await stored(`records/${INSTALLATION}/`)).toEqual([
      `records/${INSTALLATION}/${body.id as string}.json`,
    ]);
  });

  it('answers 404 with no record for a pull request the installation cannot read', async () => {
    const key = await issueKey(DB);
    const before = await stored();
    const { status, body } = await call('/v0.1/check', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: JSON.stringify({ repository: REPO, pullRequest: 999, report: scenarioReport() }),
    });
    expect(status).toBe(404);
    expect(body).not.toHaveProperty('verdict');
    expect(await stored()).toEqual(before);
  });

  // Acceptance (iv).
  it('deletes an installation’s records and keys when it is uninstalled, and only its own', async () => {
    expect((await deliver('installation', installationPayload('created', OTHER))).status).toBe(202);
    const mine = await issueKey(DB);
    const theirs = await issueKey(DB, OTHER);
    await check(mine);
    expect((await check(theirs)).status).toBe(404); // another account's repository: nothing stored
    await RECORDS.put(`records/${OTHER}/${'c'.repeat(64)}.json`, '{"record":"","signature":""}');
    expect((await stored(`records/${INSTALLATION}/`)).length).toBeGreaterThanOrEqual(2);
    expect(await keyCount(INSTALLATION)).toBeGreaterThanOrEqual(1);

    const { status, body } = await deliver('installation', installationPayload('deleted'));
    expect(status).toBe(202);
    expect(body.recordsDeleted).toBeGreaterThanOrEqual(2);
    expect(await stored(`records/${INSTALLATION}/`)).toEqual([]);
    expect(await keyCount(INSTALLATION)).toBe(0);
    expect(
      await DB.prepare('SELECT id FROM installations WHERE id = ?').bind(INSTALLATION).first(),
    ).toBeNull();
    expect((await check(mine)).status).toBe(401);

    expect(await stored(`records/${OTHER}/`)).toHaveLength(1);
    expect(await keyCount(OTHER)).toBe(1);
  });

  it('stores nothing for an installation whose retention is 0', async () => {
    expect((await deliver('installation', installationPayload('created'))).status).toBe(202);
    await DB.prepare(setRetentionSql(INSTALLATION, 0)).run();
    const key = await issueKey(DB);
    const { status, body } = await check(key);
    expect(status).toBe(200);
    expect(body.verdict).toBe('pass');
    expect(body.id).toBeNull();
    expect(await stored(`records/${INSTALLATION}/`)).toEqual([]);
  });

  it('sweeps: deletes records past retention, finishes uninstalls GitHub reports, and orphans', async () => {
    await DB.prepare(setRetentionSql(INSTALLATION, 90)).run();
    const key = await issueKey(DB);
    const kept = (await check(key)).body.id as string;
    await RECORDS.put(`records/77/${'d'.repeat(64)}.json`, '{}'); // no installation owns it
    // Installation 2's App installation is gone at GitHub (the recorded GitHub answers 404 for it),
    // as if its installation.deleted webhook had never arrived.
    // The Worker's scheduled() entry, as Cloudflare's cron trigger calls it.
    const worker = (await mf.getWorker()) as unknown as {
      scheduled(options: { cron: string }): Promise<unknown>;
    };
    await worker.scheduled({ cron: '17 3 * * *' });
    expect(await stored(`records/${INSTALLATION}/`)).toEqual([
      `records/${INSTALLATION}/${kept}.json`,
    ]);
    expect(await stored(`records/${OTHER}/`)).toEqual([]);
    expect(await keyCount(OTHER)).toBe(0);
    expect(await stored('records/77/')).toEqual([]);

    // Retention lowered to 0: the next sweep deletes what was kept.
    await DB.prepare(setRetentionSql(INSTALLATION, 0)).run();
    await worker.scheduled({ cron: '17 3 * * *' });
    expect(await stored()).toEqual([]);
  });
});

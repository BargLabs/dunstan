// The hosted API in process, with D1 and R2 from Miniflare and GitHub answering from recorded
// responses: a check returns a signed record that verifies; errors are HTTP errors with no verdict
// and no record (acceptance iii); retention 0 stores nothing.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { githubReaders } from '../../src/pipeline/check-pull-request.js';
import { verifyRecord } from '../../src/record/verify.js';
import { canonicalize } from '../../src/spec/jcs.js';
import { type JsonValue, parseStrictJson } from '../../src/spec/json.js';
import { setRetentionSql } from '../scripts/set-retention.js';
import { type Deps, handle } from '../src/app.js';
import { utf8 } from '../src/encoding.js';
import { verifySsh } from '../src/sshsig.js';
import {
  type Answer,
  checkRequest,
  type Emulated,
  emulators,
  fakeNetwork,
  INSTALLATION,
  installationPayload,
  issueKey,
  PR,
  REPO,
  recorded,
  recordedGitHub,
  SCENARIO_BLOCK,
  scenarioReport,
  webhook,
} from './support.js';

const CHECKER = { name: 'dunstan', version: '0.1.5', digest: { sha256: 'a'.repeat(64) } };
const NOW = new Date('2026-10-04T12:00:00Z');

let emulated: Emulated;
let key: string;

function deps(answers?: Map<string, Answer>): Deps & { requests: { url: string }[] } {
  const network = fakeNetwork(answers);
  return {
    checker: CHECKER,
    network: network.fetch,
    now: () => NOW,
    sleep: async () => {},
    requests: network.requests,
  };
}

async function storedCount(): Promise<number> {
  return (await emulated.env.RECORDS.list({ prefix: 'records/' })).objects.length;
}

beforeAll(async () => {
  emulated = await emulators();
});
afterAll(async () => {
  await emulated.mf.dispose();
});
beforeEach(async () => {
  const env = emulated.env;
  await env.DB.prepare('DELETE FROM api_keys').run();
  await env.DB.prepare('DELETE FROM installations').run();
  const listed = await env.RECORDS.list({ prefix: 'records/' });
  if (listed.objects.length > 0) await env.RECORDS.delete(listed.objects.map((o) => o.key));
  const created = await handle(
    await webhook('installation', installationPayload('created')),
    env,
    deps(),
  );
  expect(created.status).toBe(202);
  key = await issueKey(env.DB);
});

describe('POST /v0.1/check', () => {
  it('returns a signed record that verifies offline, and stores it for 90 days', async () => {
    const response = await handle(
      checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
      emulated.env,
      deps(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, string>;
    expect(body.verdict).toBe('pass');
    const record = parseStrictJson(body.record as string);
    expect(canonicalize(record)).toBe(body.record);
    expect(verifyRecord(record).problems).toEqual([]);
    const p = (record as { predicate: Record<string, JsonValue> }).predicate;
    expect(p.assurance).toMatchObject({ status: 'signed', issuer: 'dunstan-hosted@barglabs.ai' });
    expect(p.report).toMatchObject({ source: { kind: 'api', locator: 'POST /v0.1/check#report' } });
    const signature = await verifySsh(
      utf8.encode(body.record as string),
      body.signature as string,
      'dunstan-record',
    );
    expect(signature.ok).toBe(true);
    expect(body.claimsTable).toContain('pass');
    expect(body.expiresAt).toBe('2027-01-02T12:00:00.000Z');
    expect(body.rerun).toMatchObject({
      file: `dunstan-example-org-example-repo-${PR}.json`,
      offline: `dunstan verify dunstan-example-org-example-repo-${PR}.json --sig dunstan-example-org-example-repo-${PR}.json.sig --allowed-signers record-signers`,
    });

    const fetched = await handle(
      new Request(`https://hosted.test/v0.1/records/${body.id}`, {
        headers: { authorization: `Bearer ${key}` },
      }),
      emulated.env,
      deps(),
    );
    expect(fetched.status).toBe(200);
    const again = (await fetched.json()) as Record<string, string>;
    expect(again.record).toBe(body.record);
    expect(again.signature).toBe(body.signature);
  });

  it('gives the same record for a posted block as for its embedding as a report', async () => {
    const viaBlock = (await (
      await handle(
        checkRequest(key, { repository: REPO, pullRequest: PR, block: SCENARIO_BLOCK }),
        emulated.env,
        deps(),
      )
    ).json()) as { record: string };
    const viaReport = (await (
      await handle(
        checkRequest(key, {
          repository: REPO,
          pullRequest: PR,
          report: `\`\`\`dunstan-handback\n${canonicalize(SCENARIO_BLOCK)}\n\`\`\`\n`,
          reportSource: 'POST /v0.1/check#block',
        }),
        emulated.env,
        deps(),
      )
    ).json()) as { record: string };
    const strip = (text: string) => {
      const r = JSON.parse(text);
      r.predicate.evidence.sources = [];
      return canonicalize(r);
    };
    expect(strip(viaBlock.record)).toBe(strip(viaReport.record));
  });

  it('with retention 0 returns the record and stores nothing', async () => {
    await emulated.env.DB.prepare(setRetentionSql(INSTALLATION, 0)).run();
    const response = await handle(
      checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
      emulated.env,
      deps(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.verdict).toBe('pass');
    expect(body.id).toBeNull();
    expect(body.expiresAt).toBeNull();
    expect(await storedCount()).toBe(0);
  });

  it('refuses a request without a valid key, with no verdict', async () => {
    const response = await handle(
      checkRequest(`dunstan_${'x'.repeat(43)}`, { repository: REPO, pullRequest: PR, report: '' }),
      emulated.env,
      deps(),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty('verdict');
  });

  // Acceptance (iii): a pull request the installation cannot read is an error, never a verdict.
  for (const [status, expected] of [
    [404, 404],
    [403, 403],
    [500, 502],
  ] as const) {
    it(`answers ${expected}, with no record stored, when the pull request read answers ${status}`, async () => {
      const answers = recordedGitHub();
      answers.set(`GET /repos/${REPO}/pulls/${PR}`, { status, body: recorded('not-found') });
      const response = await handle(
        checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
        emulated.env,
        deps(answers),
      );
      expect(response.status).toBe(expected);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).not.toHaveProperty('verdict');
      expect(body).not.toHaveProperty('record');
      expect(await storedCount()).toBe(0);
    });
  }

  it('answers 404 when the repository is not in the installation (the token request is refused)', async () => {
    const answers = recordedGitHub();
    answers.set(`POST /app/installations/${INSTALLATION}/access_tokens`, {
      status: 422,
      body: '{"message":"There is at least one repository that does not exist or is not accessible to the parent installation."}',
    });
    const response = await handle(
      checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
      emulated.env,
      deps(answers),
    );
    expect(response.status).toBe(404);
    expect(await storedCount()).toBe(0);
  });

  it('answers 404 for a repository of another account without asking GitHub', async () => {
    const d = deps();
    const response = await handle(
      checkRequest(key, { repository: 'other-org/example-repo', pullRequest: PR, report: '' }),
      emulated.env,
      d,
    );
    expect(response.status).toBe(404);
    expect(d.requests).toEqual([]);
  });

  for (const [name, body] of [
    ['both block and report', { repository: REPO, pullRequest: PR, report: '', block: {} }],
    ['neither block nor report', { repository: REPO, pullRequest: PR }],
    ['a bad repository', { repository: 'nope', pullRequest: PR, report: '' }],
    ['a repository named ..', { repository: 'example-org/..', pullRequest: PR, report: '' }],
    ['a bad pull request', { repository: REPO, pullRequest: 0, report: '' }],
    ['an unknown member', { repository: REPO, pullRequest: PR, report: '', extra: 1 }],
  ] as const) {
    it(`answers 400 for ${name}`, async () => {
      const response = await handle(checkRequest(key, body), emulated.env, deps());
      expect(response.status).toBe(400);
    });
  }

  it('answers 400 for a body with a duplicate member', async () => {
    const request = new Request('https://hosted.test/v0.1/check', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: `{"repository":"${REPO}","repository":"${REPO}","pullRequest":${PR},"report":""}`,
    });
    expect((await handle(request, emulated.env, deps())).status).toBe(400);
  });

  it('answers 413 for a streamed body over 1 MiB, without a length', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 20) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const request = new Request('https://hosted.test/v0.1/check', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body,
      duplex: 'half',
    } as RequestInit);
    expect((await handle(request, emulated.env, deps())).status).toBe(413);
    expect(sent).toBeLessThan(20);
  });

  it('stores nothing and returns no verdict when the App is uninstalled during the check', async () => {
    const response = await handle(
      checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
      emulated.env,
      {
        ...deps(),
        readers: (client) => {
          const real = githubReaders(client);
          return {
            pullRequest: async (repository, number) => {
              await emulated.env.DB.prepare('UPDATE installations SET deleting = 1').run();
              return real.pullRequest(repository, number);
            },
            evidence: real.evidence,
            pathObjects: real.pathObjects,
          };
        },
      },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('verdict');
    expect(await storedCount()).toBe(0);
  });
});

describe('GET /v0.1/records/:id', () => {
  it('does not serve a record past retention, and deletes it', async () => {
    const stored = (await (
      await handle(
        checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
        emulated.env,
        deps(),
      )
    ).json()) as { id: string };
    expect(await storedCount()).toBe(1);
    const later = { ...deps(), now: () => new Date(Date.now() + 91 * 86_400_000) };
    const response = await handle(
      new Request(`https://hosted.test/v0.1/records/${stored.id}`, {
        headers: { authorization: `Bearer ${key}` },
      }),
      emulated.env,
      later,
    );
    expect(response.status).toBe(404);
    expect(await storedCount()).toBe(0);
  });

  it('does not serve another installation a record', async () => {
    const stored = (await (
      await handle(
        checkRequest(key, { repository: REPO, pullRequest: PR, report: scenarioReport() }),
        emulated.env,
        deps(),
      )
    ).json()) as { id: string };
    await handle(
      await webhook('installation', installationPayload('created', 2)),
      emulated.env,
      deps(),
    );
    const other = await issueKey(emulated.env.DB, 2);
    const response = await handle(
      new Request(`https://hosted.test/v0.1/records/${stored.id}`, {
        headers: { authorization: `Bearer ${other}` },
      }),
      emulated.env,
      deps(),
    );
    expect(response.status).toBe(404);
  });
});

describe('GET /v0.1/health', () => {
  it('reports the checker and the spec version', async () => {
    const response = await handle(
      new Request('https://hosted.test/v0.1/health'),
      emulated.env,
      deps(),
    );
    expect(await response.json()).toEqual({ status: 'ok', checker: CHECKER, spec: '0.1.2' });
  });
});

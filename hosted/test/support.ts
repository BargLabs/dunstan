// Shared by the hosted tests: keys (an ed25519 signing key from ssh-keygen, an RSA App key), the D1
// and R2 emulators (Miniflare), and a GitHub that answers from the recorded responses in recorded/.

import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { issueKeySql, newApiKey } from '../scripts/issue-key.js';
import type { Database, Env, RecordBucket } from '../src/env.js';
import { webhookSignature } from '../src/webhook.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REPO = 'example-org/example-repo';
export const PR = 1347;
export const HEAD = '6dcb09b5b57875f334f61aebed695e2e4193db5e';
export const CITED = '7638417db6d59f3c431d3e1f261cc637155684cd';
export const INSTALLATION = 1;
export const SIGNER = 'dunstan-hosted@barglabs.ai';
export const WEBHOOK_SECRET = 'test-webhook-secret';

export function recorded(name: string): string {
  return readFileSync(new URL(`recorded/${name}.json`, import.meta.url), 'utf8');
}

// ---------------------------------------------------------------- keys

export interface SigningKey {
  dir: string;
  privateKey: string;
  publicLine: string;
  allowedSigners: string;
}

export function sshSigningKey(principal = SIGNER): SigningKey {
  const dir = mkdtempSync(join(tmpdir(), 'dunstan-key-'));
  const path = join(dir, 'signer');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', principal, '-f', path]);
  const publicLine = readFileSync(`${path}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ');
  const allowedSigners = join(dir, 'allowed_signers');
  writeFileSync(allowedSigners, `${principal} namespaces="dunstan-record" ${publicLine}\n`);
  return { dir, privateKey: readFileSync(path, 'utf8'), publicLine, allowedSigners };
}

// An RSA key in the PKCS#1 PEM GitHub issues for an App.
export function appKey(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

// ---------------------------------------------------------------- the emulators

export function migrationStatements(): string[] {
  const dir = join(ROOT, 'hosted/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .flatMap((f) =>
      readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
    );
}

export async function migrate(db: Database): Promise<void> {
  await db.batch(migrationStatements().map((s) => db.prepare(s)));
}

export interface Emulated {
  mf: Miniflare;
  env: Env;
  signing: SigningKey;
  app: { privateKey: string; publicKey: string };
}

// D1 and R2 from Miniflare, used from Node by the in-process handler.
export async function emulators(): Promise<Emulated> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null, { status: 404 }); } }',
    d1Databases: ['DB'],
    r2Buckets: ['RECORDS'],
  });
  const DB = (await mf.getD1Database('DB')) as unknown as Database;
  const RECORDS = (await mf.getR2Bucket('RECORDS')) as unknown as RecordBucket;
  await migrate(DB);
  const signing = sshSigningKey();
  const app = appKey();
  return {
    mf,
    signing,
    app,
    env: {
      DB,
      RECORDS,
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY: app.privateKey,
      GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RECORD_SIGNING_KEY: signing.privateKey,
      RECORD_SIGNER: SIGNER,
    },
  };
}

export async function webhook(
  event: string,
  payload: unknown,
  secret = WEBHOOK_SECRET,
): Promise<Request> {
  const body = JSON.stringify(payload);
  return new Request('https://hosted.test/v0.1/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-hub-signature-256': await webhookSignature(secret, body),
    },
    body,
  });
}

export function installationPayload(action: 'created' | 'deleted', id = INSTALLATION) {
  return { action, installation: { id, account: { login: 'example-org', type: 'Organization' } } };
}

// A key issued the way the operator's script issues one, against the emulated D1.
export async function issueKey(db: Database, installationId = INSTALLATION): Promise<string> {
  const { key, hash } = newApiKey();
  const sql = issueKeySql(installationId, hash, '2026-10-04T00:00:00.000Z');
  const { meta } = await db.prepare(sql).run();
  if (meta.changes !== 1) throw new Error(`no key issued for installation ${installationId}`);
  return key;
}

export function checkRequest(key: string, body: unknown): Request {
  return new Request('https://hosted.test/v0.1/check', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------- GitHub

export interface Answer {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

const json = (body: string, status = 200): Answer => ({ status, body });

// The answers for the scenario block below, keyed by method and path with query.
export function recordedGitHub(): Map<string, Answer> {
  const repo = `/repos/${REPO}`;
  return new Map<string, Answer>([
    [
      `POST /app/installations/${INSTALLATION}/access_tokens`,
      json(recorded('installation-token'), 201),
    ],
    [`GET /app/installations/${INSTALLATION}`, json(recorded('installation'))],
    [`GET ${repo}/pulls/${PR}`, json(recorded('pull'))],
    [`GET ${repo}/pulls/${PR}/files?per_page=100&page=1`, json(recorded('pull-files'))],
    ['POST /graphql', json(recorded('closing-references'))],
    [`GET ${repo}/git/commits/${CITED}`, json(recorded('git-commit'))],
    [`GET ${repo}/compare/${CITED}...${HEAD}?per_page=1`, json(recorded('compare'))],
  ]);
}

export interface FakeNetwork {
  fetch: typeof fetch;
  requests: { method: string; url: string; authorization: string | null }[];
}

export function fakeNetwork(answers: Map<string, Answer> = recordedGitHub()): FakeNetwork {
  const requests: FakeNetwork['requests'] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    requests.push({ method, url: url.href, authorization: request.headers.get('authorization') });
    const answer = answers.get(`${method} ${url.pathname}${url.search}`) ?? {
      status: 404,
      body: recorded('not-found'),
    };
    return new Response(answer.body, {
      status: answer.status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...answer.headers },
    });
  };
  return { fetch: fake as typeof fetch, requests };
}

// The scenario's report: a block every claim of which the recorded responses answer.
export const SCENARIO_BLOCK = {
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: ['file1.txt'],
  references: [
    { issue: '#1346', relation: 'closes' },
    { commit: CITED, relation: 'cites' },
  ],
};

export function scenarioReport(): string {
  return `Done.\n\n\`\`\`dunstan-handback\n${JSON.stringify(SCENARIO_BLOCK, null, 2)}\n\`\`\`\n`;
}

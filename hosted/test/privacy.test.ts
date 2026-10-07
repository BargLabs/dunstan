// What the hosted tier keeps (docs/hosted.md, "What is kept, and for how long"): commit author
// names and emails never enter the snapshot, and report text is never stored. GitHub answers from
// recorded responses that carry author and committer names and emails, diff patches and file URLs;
// none of them reaches the record, the stored object or the response.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitHubClient } from '../../src/evidence/http.js';
import { checkPullRequest, githubReaders } from '../../src/pipeline/check-pull-request.js';
import { serializeRecord } from '../../src/record/build.js';
import { handle } from '../src/app.js';
import { GuardedTransport } from '../src/transport.js';
import {
  checkRequest,
  type Emulated,
  emulators,
  fakeNetwork,
  installationPayload,
  issueKey,
  PR,
  REPO,
  recorded,
  SCENARIO_BLOCK,
  webhook,
} from './support.js';

const CHECKER = { name: 'dunstan', version: '0.1.0', digest: { sha256: 'e'.repeat(64) } };
const REPORT_SENTENCE = 'The quarterly migration for the Lisbon office finished at 14:02.';

// Every author or committer name and email in the recorded responses, and the content they carry.
function personalAndContent(): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key = ''): void => {
    if (Array.isArray(value)) {
      for (const v of value) walk(v);
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    } else if (typeof value === 'string' && ['name', 'email', 'patch', 'message'].includes(key)) {
      found.add(value);
    }
  };
  for (const name of ['git-commit', 'compare', 'pull-files']) walk(JSON.parse(recorded(name)));
  // Keep only values that are personal data or content, not ordinary words the record also holds.
  return [...found].filter((v) => v.includes('@') || v.includes(' '));
}

let emulated: Emulated;
let response: string;
let storedObjects: string[];

beforeAll(async () => {
  emulated = await emulators();
  const deps = { checker: CHECKER, network: fakeNetwork().fetch, now: () => new Date() };
  await handle(await webhook('installation', installationPayload('created')), emulated.env, deps);
  const key = await issueKey(emulated.env.DB);
  const report = `${REPORT_SENTENCE}\n\n\`\`\`dunstan-handback\n${JSON.stringify(SCENARIO_BLOCK)}\n\`\`\`\n`;
  const answer = await handle(
    checkRequest(key, { repository: REPO, pullRequest: PR, report }),
    emulated.env,
    deps,
  );
  expect(answer.status).toBe(200);
  response = await answer.text();
  const listed = await emulated.env.RECORDS.list({ prefix: 'records/' });
  storedObjects = await Promise.all(
    listed.objects.map(async (o) => (await emulated.env.RECORDS.get(o.key))?.text() ?? ''),
  );
});
afterAll(async () => {
  await emulated.mf.dispose();
});

describe('what the hosted tier keeps', () => {
  const needles = personalAndContent();

  it('has author names, emails and patches in the recorded responses to look for', () => {
    expect(needles).toEqual(
      expect.arrayContaining(['Monalisa Octocat', 'octocat@github.com', 'support@github.com']),
    );
    expect(needles.some((n) => n.startsWith('@@'))).toBe(true);
  });

  it('stores exactly one object, and it holds no author name, email, patch or commit message', () => {
    expect(storedObjects).toHaveLength(1);
    for (const needle of needles) expect(storedObjects[0]).not.toContain(needle);
  });

  it('returns no author name, email, patch or commit message', () => {
    for (const needle of needles) expect(response).not.toContain(needle);
  });

  it('never stores the report text, only its SHA-256', () => {
    expect(storedObjects[0]).not.toContain(REPORT_SENTENCE);
    expect(storedObjects[0]).not.toContain('quarterly migration');
    const record = JSON.parse(JSON.parse(storedObjects[0] as string).record);
    expect(record.predicate.report.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores the record bytes and the signature and nothing else', () => {
    expect(Object.keys(JSON.parse(storedObjects[0] as string)).sort()).toEqual([
      'record',
      'signature',
    ]);
  });
});

// Comparison 0.3.0: the advisory's path query, sent through the guarded transport, brings back the
// type of the object at the head and nothing else. Here GitHub answers it with a blob's content
// beside its type; none of it reaches the record.
describe('the path query keeps only the type', () => {
  const CONTENT = 'const PRIVATE_LINE = "never in a record";';
  const OID = '0123abcd'.repeat(5);

  it('records Blob, Tree or null for each path, and no content, size or object id', async () => {
    const base = fakeNetwork();
    const network = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('object(expression')) {
        const object = {
          __typename: 'Blob',
          text: CONTENT,
          byteSize: CONTENT.length,
          isBinary: false,
          oid: OID,
        };
        return new Response(JSON.stringify({ data: { repository: { object } } }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      return base.fetch(input, init);
    }) as typeof fetch;
    const transport = new GuardedTransport(network, async () => {});
    const client = new GitHubClient({
      token: 'ghs_x',
      fetch: transport.fetch,
      sleep: transport.sleep,
      warn: () => {},
    });
    const report = `I changed file1.txt and updated docs/notes.md.\n\n\`\`\`dunstan-handback\n${JSON.stringify(SCENARIO_BLOCK)}\n\`\`\`\n`;
    const record = await checkPullRequest({
      readers: githubReaders(client),
      repository: REPO,
      number: PR,
      report: async () => ({
        bytes: new TextEncoder().encode(report),
        source: { kind: 'api', locator: 'POST /v0.1/check#report' },
      }),
      checker: CHECKER,
      recordFile: 'r.json',
      advisory: true,
    });
    // The query was on the allowlist, and was asked once, for the path not among the changed files.
    expect(transport.refused).toEqual([]);
    expect(record.predicate.advisory?.pathsAtHead).toEqual([
      { path: 'docs/notes.md', status: 'ok', object: 'Blob' },
    ]);
    const bytes = serializeRecord(record);
    for (const needle of [CONTENT, 'PRIVATE_LINE', 'byteSize', 'isBinary', OID]) {
      expect(bytes).not.toContain(needle);
    }
  });
});

// A pull request that moves while it is checked. The pull request is read first; the files, the
// closing references and the pull request's commits are then read by its number, at whatever head
// it has when they run. A push in between, with the same number of changed files, gave a record
// that named the first head and held the files of the second (security review of 411180d, finding
// 3). The check reads the pull request again after the evidence: if it moved, the check runs once
// more from a fresh read, and if it moves again no record is written.

import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { readEvidence, readPullRequest } from '../evidence/github.js';
import { GitHubClient } from '../evidence/http.js';
import type { Report } from '../evidence/report.js';
import {
  buildRecord,
  type DunstanRecord,
  recordBlock,
  rerunCommands,
  serializeRecord,
} from '../record/build.js';
import { checkerIdentity } from '../record/checker.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { sha256Hex } from '../spec/jcs.js';
import { checkPullRequest, githubReaders } from './check-pull-request.js';

const PUSHED = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';
const AGAIN = 'c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0';
const PR_READ = `GET /repos/${REPO}/pulls/7`;

const blockText = (head: string, extra = '') =>
  `Done.\n\n\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${head}","filesChanged":["src/a.ts","src/b.ts"]${extra}}\n\`\`\`\n`;

// One state of the pull request: its REST answer and the files listed at it.
interface State {
  pr: Record<string, unknown>;
  files: Record<string, unknown>[];
}

const atHead = (sha: string, files: string[], overrides: Record<string, unknown> = {}): State => ({
  pr: basePullRequest({
    head: { sha },
    base: { ref: 'main', repo: { full_name: REPO } },
    changed_files: files.length,
    ...overrides,
  }),
  files: files.map((filename) => ({ filename, status: 'modified' })),
});

const FIRST = atHead(HEAD, ['src/a.ts', 'src/b.ts']);
// A push: another head, another file, the same number of files.
const PUSH = atHead(PUSHED, ['src/a.ts', 'src/c.ts']);
const PUSH_AGAIN = atHead(AGAIN, ['src/a.ts', 'src/d.ts']);

// The n-th read of the pull request answers states[n], the last once they run out; every other read
// answers from the state the pull request was last read in.
function moving(states: State[], extra: Omit<Scenario, 'pr' | 'files'> = {}) {
  const scenario: Scenario = { ...extra, pr: states[0]?.pr ?? {}, files: states[0]?.files ?? [] };
  const fake = fakeGitHub(scenario);
  let reads = 0;
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname === `/repos/${REPO}/pulls/7`) {
      const state = states[Math.min(reads, states.length - 1)] as State;
      reads++;
      scenario.pr = state.pr;
      scenario.files = state.files;
    }
    return fake.fetch(input, init);
  };
  return { fetch: fetchFn as typeof fetch, requests: fake.requests };
}

const client = (fetchFn: typeof fetch) =>
  new GitHubClient({
    token: 't',
    fetch: fetchFn,
    sleep: async () => {},
    now: () => new Date('2026-10-15T09:00:00Z'),
    warn: () => {},
  });

const fileReport = (text: string) => async (): Promise<Report> => ({
  bytes: new TextEncoder().encode(text),
  source: { kind: 'file', locator: 'report.md' },
});

async function check(
  fetchFn: typeof fetch,
  report: () => Promise<Report> = fileReport(blockText(HEAD)),
): Promise<DunstanRecord> {
  return checkPullRequest({
    readers: githubReaders(client(fetchFn)),
    repository: REPO,
    number: 7,
    report,
    checker: checkerIdentity(import.meta.url),
    recordFile: 'record.json',
  });
}

const paths = (record: DunstanRecord) => {
  const files = record.predicate.evidence.files;
  return files?.status === 'ok' ? files.entries.map((e) => e.path) : files;
};

describe('a pull request that moves while it is checked', () => {
  it('a push with the same file count never gives a record of the first head with the files of the second', async () => {
    const gh = moving([FIRST, PUSH]);
    const record = await check(gh.fetch);
    // Run again from a fresh read: every section is of the second head, and the head claim fails.
    expect(record.predicate.subject.headSha).toBe(PUSHED);
    expect(record.predicate.evidence.pullRequest.headSha).toBe(PUSHED);
    expect(paths(record)).toEqual(['src/a.ts', 'src/c.ts']);
    expect(record.predicate.claims[0]).toMatchObject({
      check: 'head',
      observed: PUSHED,
      verdict: 'fail',
      reason: 'head_mismatch',
    });
    // Read, the evidence, read again (moved); read, the evidence, read again (held).
    expect(gh.requests.filter((r) => r === PR_READ)).toHaveLength(4);
  });

  it('a push, then another: no record, pull_request_moved', async () => {
    const gh = moving([FIRST, PUSH, PUSH, PUSH_AGAIN]);
    await expect(check(gh.fetch)).rejects.toThrow(/pull_request_moved/);
    await expect(check(moving([FIRST, PUSH, PUSH, PUSH_AGAIN]).fetch)).rejects.toThrow(
      `head ${PUSHED} -> ${AGAIN}`,
    );
  });

  it('a base branch changed while it was read: run again; changed again: no record', async () => {
    const release = atHead(HEAD, ['src/a.ts', 'src/b.ts'], {
      base: { ref: 'release', repo: { full_name: REPO } },
    });
    const hotfix = atHead(HEAD, ['src/a.ts', 'src/b.ts'], {
      base: { ref: 'hotfix', repo: { full_name: REPO } },
    });
    const once = moving([FIRST, release]);
    const record = await check(once.fetch);
    expect(record.predicate.verdict).toBe('pass');
    expect(once.requests.filter((r) => r === PR_READ)).toHaveLength(4);

    await expect(check(moving([FIRST, release, release, hotfix]).fetch)).rejects.toThrow(
      /base release -> hotfix.*pull_request_moved/,
    );
  });

  it('closed or merged while it was read: run again; moved again: no record', async () => {
    const merged = atHead(HEAD, ['src/a.ts', 'src/b.ts'], {
      state: 'closed',
      merged: true,
      merged_at: '2026-10-15T09:00:00Z',
      merge_commit_sha: 'feedface00000000000000000000000000000001',
    });
    const closed = atHead(HEAD, ['src/a.ts', 'src/b.ts'], { state: 'closed' });
    const record = await check(moving([FIRST, merged]).fetch);
    expect(record.predicate.evidence.pullRequest).toMatchObject({ state: 'closed', merged: true });

    await expect(check(moving([FIRST, closed, closed, FIRST]).fetch)).rejects.toThrow(
      /state closed -> open.*pull_request_moved/,
    );
    await expect(check(moving([FIRST, closed, closed, merged]).fetch)).rejects.toThrow(
      /state closed -> merged.*pull_request_moved/,
    );
  });

  it('a second run keeps no source the first run read', async () => {
    // The body is the report. At the second head it names that head and declares checks, so the
    // first run reads the check runs at one commit and the second at another.
    const checks = ',"checks":{"total":0}';
    const first = atHead(HEAD, ['src/a.ts', 'src/b.ts'], { body: blockText(HEAD, checks) });
    const pushed = atHead(PUSHED, ['src/a.ts', 'src/b.ts'], { body: blockText(PUSHED, checks) });
    const gh = moving([first, pushed]);
    const c = client(gh.fetch);
    const record = await checkPullRequest({
      readers: githubReaders(c),
      repository: REPO,
      number: 7,
      report: async (pr) => ({
        bytes: new TextEncoder().encode(pr.body ?? ''),
        source: { kind: 'pr-body', locator: `GET /repos/${REPO}/pulls/7#body` },
      }),
      checker: checkerIdentity(import.meta.url),
      recordFile: 'record.json',
    });
    const locators = record.predicate.evidence.sources.map((s) => s.locator);
    expect(gh.requests.some((r) => r.includes(`/commits/${HEAD}/check-runs`))).toBe(true);
    expect(locators.some((l) => l.includes(HEAD))).toBe(false);
    expect(locators.some((l) => l.includes(`/commits/${PUSHED}/check-runs`))).toBe(true);
    expect(record.predicate.block.value?.headCommit).toBe(PUSHED);
  });
});

describe('a pull request that holds still while it is checked', () => {
  it("writes today's record byte for byte, and the one new request is the pull request read again, last", async () => {
    const today = moving([FIRST]);
    const c = client(today.fetch);
    const pr = await readPullRequest(c, REPO, 7);
    const text = blockText(HEAD);
    const block = recordBlock(extractHandbackBlock(text));
    const evidence = await readEvidence(c, {
      repository: pr.repository,
      pullRequest: pr,
      block: block.status === 'found' ? block.value : null,
    });
    const expected = buildRecord({
      checker: checkerIdentity(import.meta.url),
      report: {
        sha256: sha256Hex(new TextEncoder().encode(text)),
        source: { kind: 'file', locator: 'report.md' },
      },
      block,
      repository: pr.repository,
      evidence,
      rerun: rerunCommands('record.json'),
    });

    const gh = moving([FIRST]);
    const record = await check(gh.fetch);
    expect(serializeRecord(record)).toBe(serializeRecord(expected));
    expect(gh.requests).toEqual([...today.requests, PR_READ]);
    // The read again is not a source: the record holds the first read alone.
    expect(record.predicate.evidence.sources.filter((s) => s.kind === 'pull_request')).toEqual([
      expect.objectContaining({ locator: PR_READ }),
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  junitXml,
  MERGE,
  makeZip,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { runChecks } from '../check/index.js';
import type { Block, Evidence } from '../check/types.js';
import { validateRecord } from '../spec/schema.js';
import {
  PATH_QUERY,
  PullRequestUnreadable,
  readEvidence,
  readPathObjects,
  readPullRequest,
} from './github.js';
import { GitHubClient } from './http.js';

const CITED = 'c17ed00000000000000000000000000000000001';
const LATER = '1a7e500000000000000000000000000000000001';
const JUNIT = {
  kind: 'junit',
  workflow: '.github/workflows/ci.yml',
  job: 'test',
  artifact: 'junit-report',
  path: 'reports/junit.xml',
} as const;

function client(scenario: Scenario, warnings: string[] = []) {
  const fake = fakeGitHub(scenario);
  return {
    fake,
    client: new GitHubClient({
      token: 't',
      fetch: fake.fetch,
      sleep: async () => {},
      now: () => new Date('2026-10-04T12:00:00Z'),
      warn: (m) => warnings.push(m),
    }),
  };
}

async function read(scenario: Scenario, block: Block | null, excluded: number[] = []) {
  const { client: c, fake } = client(scenario);
  const pr = await readPullRequest(c, REPO, scenario.pr.number as number);
  const evidence = await readEvidence(c, {
    repository: pr.repository,
    pullRequest: pr,
    block,
    excludedCheckRunIds: excluded,
  });
  return { evidence, fake, pr };
}

// Checks a snapshot against the record schema by wrapping it in an otherwise valid record.
function evidenceSchemaErrors(evidence: Evidence) {
  const sha = 'a'.repeat(64);
  return validateRecord({
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: `git+https://github.com/${REPO}@${HEAD}`, digest: { gitCommit: HEAD } }],
    predicateType: 'https://barglabs.ai/dunstan/record/v0.1',
    predicate: {
      spec: '0.1.0',
      checker: { name: 'dunstan', version: '0.1.0', digest: { sha256: sha } },
      report: { sha256: sha, source: { kind: 'file', locator: 'r.md' } },
      block: { status: 'missing', reason: 'block_missing', sha256: null, value: null },
      subject: { repository: REPO, pullRequest: 7, headSha: HEAD, mergeSha: null },
      evidence,
      claims: [],
      verdict: 'unverifiable',
      digests: { claims: sha, evidence: sha },
      rerun: { offline: 'x', online: 'y' },
      assurance: { status: 'unsigned', issuer: 'self-generated' },
    },
  });
}

const FULL_BLOCK: Block = {
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: ['src/a.ts', 'src/b.ts'],
  tests: [{ command: 'pnpm test', count: 3, failures: 1, record: JUNIT }],
  checks: { total: 2, allSucceeded: true },
  references: [
    { issue: '#3', relation: 'closes' },
    { issue: '#4', relation: 'cites' },
    { issue: 'other-org/docs#9', relation: 'cites' },
    { commit: CITED, relation: 'cites' },
  ],
  mergedAt: '2026-10-01T14:05:09Z',
  deployedAt: { at: '2026-10-01T14:20:00Z', environment: 'production' },
};

function fullScenario(): Scenario {
  return {
    pr: basePullRequest({
      state: 'closed',
      merged: true,
      merged_at: '2026-10-01T14:05:09Z',
      merge_commit_sha: MERGE,
    }),
    files: [
      { filename: 'src/b.ts', status: 'added' },
      { filename: 'src/a.ts', status: 'renamed', previous_filename: 'src/old-a.ts' },
    ],
    closing: [`${REPO}#3`],
    issues: { [`${REPO}#4`]: 200, 'other-org/docs#9': 200 },
    repositories: { 'other-org/docs': 200 },
    commits: { [CITED]: 200 },
    compare: { [`${CITED}...${HEAD}`]: 0, [`${MERGE}...${LATER}`]: 0 },
    checkRuns: [
      { id: 12, name: 'test', status: 'completed', conclusion: 'success' },
      { id: 11, name: 'lint', status: 'completed', conclusion: 'success' },
    ],
    workflowRuns: [
      { id: 501, run_attempt: 2, path: '.github/workflows/ci.yml', head_sha: HEAD },
      { id: 502, run_attempt: 1, path: '.github/workflows/other/ci.yml', head_sha: HEAD },
    ],
    jobs: { 501: ['lint', 'test'], 502: ['test'] },
    artifacts: { 501: [{ id: 9001, name: 'junit-report', expired: false }] },
    zips: {
      9001: makeZip({ 'reports/junit.xml': junitXml(['pass', 'fail', 'error', 'skip', 'pass']) }),
    },
    deployments: [
      {
        id: 71,
        sha: 'deadbeef00000000000000000000000000000001',
        environment: 'production',
        created_at: '2026-10-01T13:00:00Z',
      },
      { id: 72, sha: LATER, environment: 'production', created_at: '2026-10-01T14:10:00Z' },
      { id: 73, sha: LATER, environment: 'production', created_at: '2026-10-01T15:00:00Z' },
    ],
    statuses: {
      72: [
        { state: 'success', created_at: '2026-10-01T14:15:00Z' },
        { state: 'in_progress', created_at: '2026-10-01T14:11:00Z' },
      ],
    },
  };
}

describe('readPullRequest', () => {
  it('reads state, merge, head and canonical repository name', async () => {
    const { client: c } = client(fullScenario());
    const pr = await readPullRequest(c, 'EXAMPLE-ORG/example-repo', 7).catch(() => null);
    // The fake answers only the canonical path, as a case-sensitive server would.
    expect(pr).toBeNull();
    const ok = await readPullRequest(client(fullScenario()).client, REPO, 7);
    expect(ok.evidence).toEqual({
      status: 'ok',
      number: 7,
      state: 'closed',
      merged: true,
      mergedAt: '2026-10-01T14:05:09Z',
      headSha: HEAD,
      mergeSha: MERGE,
      changedFiles: 2,
    });
    expect(ok.repository).toBe(REPO);
  });

  it('records no merge commit for an open pull request (its merge_commit_sha is a test merge)', async () => {
    const pr = await readPullRequest(client({ pr: basePullRequest() }).client, REPO, 7);
    expect(pr.evidence.mergeSha).toBeNull();
  });

  it('refuses to go on when the pull request cannot be read', async () => {
    await expect(
      readPullRequest(client({ pr: basePullRequest() }).client, REPO, 8),
    ).rejects.toThrow(PullRequestUnreadable);
  });
});

describe('readEvidence', () => {
  it('reads every section a full block needs, and the checks pass on it', async () => {
    const { evidence } = await read(fullScenario(), FULL_BLOCK);
    expect(evidenceSchemaErrors(evidence)).toEqual([]);
    expect(evidence.files).toEqual({
      status: 'ok',
      complete: true,
      entries: [
        { path: 'src/a.ts', status: 'renamed', previousPath: 'src/old-a.ts' },
        { path: 'src/b.ts', status: 'added' },
      ],
    });
    expect(evidence.closingReferences).toEqual({ status: 'ok', issues: [`${REPO}#3`] });
    expect(evidence.references).toEqual([
      { kind: 'issue', ref: `${REPO}#4`, status: 'ok', exists: true },
      { kind: 'issue', ref: 'other-org/docs#9', status: 'ok', exists: true },
      { kind: 'commit', ref: CITED, status: 'ok', exists: true, reachableFromHead: true },
    ]);
    expect(evidence.checkRuns).toMatchObject({ status: 'ok', commit: HEAD, excludedIds: [] });
    expect(evidence.testRecords).toEqual([
      {
        record: JUNIT,
        status: 'ok',
        runs: [{ runId: 501, runAttempt: 2, executed: 4, failed: 2 }],
      },
    ]);
    expect(evidence.deployments).toEqual([
      {
        environment: 'production',
        status: 'ok',
        deployments: [
          { id: 72, sha: LATER, relation: 'descendant', successAt: '2026-10-01T14:15:00Z' },
        ],
      },
    ]);
    const block = {
      ...FULL_BLOCK,
      tests: [{ ...FULL_BLOCK.tests?.[0], count: 4, failures: 2 }],
    } as Block;
    const claims = runChecks(block, evidence, REPO);
    expect(claims.filter((c) => c.verdict !== 'pass')).toEqual([]);
  });

  it('writes sources in code-unit order of kind, then locator, with digests and no error', async () => {
    const { evidence } = await read(fullScenario(), FULL_BLOCK);
    const keys = evidence.sources.map((s) => `${s.kind} ${s.locator}`);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      evidence.sources.every((s) => /^[0-9a-f]{64}$/.test(s.sha256) && s.error === undefined),
    ).toBe(true);
    expect(keys).toContain(
      `artifact GET /repos/${REPO}/actions/artifacts/9001/zip#reports/junit.xml`,
    );
    expect(keys).toContain(
      `closing_references POST /graphql repository(${REPO}).pullRequest(7).closingIssuesReferences`,
    );
  });

  it('reads only the pull request when there is no block', async () => {
    const { evidence, fake } = await read(fullScenario(), null);
    expect(Object.keys(evidence).sort()).toEqual(['pullRequest', 'sources']);
    expect(fake.requests).toEqual([`GET /repos/${REPO}/pulls/7`]);
  });

  it('reads only what the block declares', async () => {
    const block: Block = { dunstan: '0.1', headCommit: HEAD, filesChanged: ['src/a.ts'] };
    const { evidence } = await read(fullScenario(), block);
    expect(Object.keys(evidence).sort()).toEqual(['files', 'pullRequest', 'sources']);
  });

  it('marks the file list incomplete when it is shorter than changed_files', async () => {
    const s = fullScenario();
    s.pr.changed_files = 5;
    const { evidence } = await read(s, { dunstan: '0.1', headCommit: HEAD, filesChanged: [] });
    expect(evidence.files).toMatchObject({ status: 'ok', complete: false });
  });

  it('paginates files to the end', async () => {
    const s = fullScenario();
    s.files = Array.from({ length: 250 }, (_, i) => ({
      filename: `f/${String(i).padStart(3, '0')}`,
      status: 'added',
    }));
    s.pr.changed_files = 250;
    const { evidence } = await read(s, { dunstan: '0.1', headCommit: HEAD, filesChanged: [] });
    expect(evidence.files).toMatchObject({ status: 'ok', complete: true });
    expect(evidence.files?.status === 'ok' && evidence.files.entries.length).toBe(250);
  });

  it('records an absent closingIssuesReferences as unpopulated, never as empty', async () => {
    const s = fullScenario();
    s.closing = null;
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.closingReferences).toEqual({
      status: 'unpopulated',
      field: 'closingIssuesReferences',
    });
    delete s.closing;
    const again = await read(s, FULL_BLOCK);
    expect(again.evidence.closingReferences).toEqual({
      status: 'unpopulated',
      field: 'closingIssuesReferences',
    });
  });

  it('reads no issue for a closes the closing references list', async () => {
    const { fake } = await read(fullScenario(), FULL_BLOCK);
    expect(fake.requests).not.toContain(`GET /repos/${REPO}/issues/3`);
  });

  describe('a closes missing from the closing references is read as a cites is', () => {
    const CLOSES: Block = {
      dunstan: '0.1',
      headCommit: HEAD,
      filesChanged: ['src/a.ts', 'src/b.ts'],
      references: [{ issue: 'private-org/oncall#11', relation: 'closes' }],
    };
    const row = (evidence: Evidence) => runChecks(CLOSES, evidence, REPO)[3];

    it('in a repository that answers 404: unreadable, and the claim is unverifiable', async () => {
      const s = fullScenario();
      s.closing = [];
      const { evidence } = await read(s, CLOSES);
      expect(evidenceSchemaErrors(evidence)).toEqual([]);
      expect(evidence.references).toEqual([
        { kind: 'issue', ref: 'private-org/oncall#11', status: 'unreadable', source: 'repository' },
      ]);
      expect(row(evidence)).toMatchObject({
        id: 'reference:/references/0',
        verdict: 'unverifiable',
        reason: 'source_unreadable:repository',
      });
    });

    it('that answers 404 in a readable repository: absent, and the claim fails not_found', async () => {
      const s = fullScenario();
      s.closing = [];
      s.repositories = { 'private-org/oncall': 200 };
      const { evidence } = await read(s, CLOSES);
      expect(evidence.references).toEqual([
        { kind: 'issue', ref: 'private-org/oncall#11', status: 'ok', exists: false },
      ]);
      expect(row(evidence)).toMatchObject({
        verdict: 'fail',
        reason: 'not_found',
        observed: { closing: [], exists: false },
      });
    });

    it('that exists and is not linked: the claim fails not_closing', async () => {
      const s = fullScenario();
      s.closing = [];
      s.repositories = { 'private-org/oncall': 200 };
      s.issues = { 'private-org/oncall#11': 200 };
      const { evidence } = await read(s, CLOSES);
      expect(evidence.references).toEqual([
        { kind: 'issue', ref: 'private-org/oncall#11', status: 'ok', exists: true },
      ]);
      expect(row(evidence)).toMatchObject({
        verdict: 'fail',
        reason: 'not_closing',
        observed: { closing: [] },
      });
    });

    it('whose read errors: unreadable issue, and the claim is unverifiable', async () => {
      const s = fullScenario();
      s.closing = [];
      s.repositories = { 'private-org/oncall': 200 };
      s.issues = { 'private-org/oncall#11': 500 };
      const { evidence } = await read(s, CLOSES);
      expect(row(evidence)).toMatchObject({
        verdict: 'unverifiable',
        reason: 'source_unreadable:issue',
      });
    });

    // Spec 0.1.3: GitHub answers the old name of an issue transferred to another repository with
    // its new identity, which the reader records as `resolvedAs`.
    describe('on an issue transferred to another repository', () => {
      const OLD = 'private-org/oncall#11';
      const MOVED = 'private-org/tracker#4';
      const transferred = (closing: string[]) => {
        const s = fullScenario();
        s.closing = closing;
        s.repositories = { 'private-org/oncall': 200 };
        s.issues = { [OLD]: 200 };
        s.transferred = { [OLD]: MOVED };
        return s;
      };

      it('records the identity GitHub answers with, and the claim passes on it', async () => {
        const { evidence, fake } = await read(transferred([MOVED]), CLOSES);
        expect(evidenceSchemaErrors(evidence)).toEqual([]);
        expect(evidence.references).toEqual([
          { kind: 'issue', ref: OLD, status: 'ok', exists: true, resolvedAs: MOVED },
        ]);
        // The old name is read; nothing is read under the new one.
        expect(fake.requests).toContain('GET /repos/private-org/oncall/issues/11');
        expect(fake.requests.some((r) => r.includes('private-org/tracker'))).toBe(false);
        expect(row(evidence)).toMatchObject({
          verdict: 'pass',
          observed: { closing: [MOVED], ref: OLD, resolvedAs: MOVED },
        });
      });

      it('that the closing references do not list: not_closing, as before', async () => {
        const { evidence } = await read(transferred(['private-org/tracker#5']), CLOSES);
        expect(evidence.references).toEqual([
          { kind: 'issue', ref: OLD, status: 'ok', exists: true, resolvedAs: MOVED },
        ]);
        expect(row(evidence)).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
      });

      it('records no resolvedAs when GitHub answers under the name read, in any case', async () => {
        const s = transferred([MOVED]);
        s.transferred = {};
        s.issueBodies = {
          [OLD]: { number: 11, repository_url: 'https://api.github.com/repos/Private-Org/OnCall' },
        };
        const { evidence } = await read(s, CLOSES);
        expect(evidence.references).toEqual([
          { kind: 'issue', ref: OLD, status: 'ok', exists: true },
        ]);
        expect(row(evidence)).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
      });

      it('whose answer does not say what it is: unreadable, never a guess', async () => {
        for (const body of [
          { number: 4 },
          { repository_url: 'https://api.github.com/repos/private-org/tracker' },
          { number: '4', repository_url: 'https://api.github.com/repos/private-org/tracker' },
          { number: 4, repository_url: 'https://api.github.com/repos/private-org' },
          { number: 4, repository_url: 'https://api.github.com/repos/private-org/tracker/x' },
          { number: 4, repository_url: 'https://api.github.com/repos/private-org/../x' },
          { number: 4, repository_url: 'https://api.github.com/repositories/42' },
          { number: 4, repository_url: 'repos/private-org/tracker' },
          { number: 4, repository_url: 'https://api.github.com/repos/private-org/tracker?x=1' },
          { number: 0, repository_url: 'https://api.github.com/repos/private-org/tracker' },
          [],
        ]) {
          const s = transferred([MOVED]);
          s.issueBodies = { [OLD]: body };
          const { evidence } = await read(s, CLOSES);
          expect(evidence.references, JSON.stringify(body)).toEqual([
            { kind: 'issue', ref: OLD, status: 'unreadable', source: 'issue' },
          ]);
          expect(evidence.sources.find((x) => x.kind === 'issue')?.error).toBe('parse');
          expect(row(evidence)).toMatchObject({
            verdict: 'unverifiable',
            reason: 'source_unreadable:issue',
          });
        }
      });

      it('whose redirect cannot be read: unreadable issue, and the claim is unverifiable', async () => {
        const s = transferred([MOVED]);
        s.issues = { [OLD]: 502 };
        const { evidence } = await read(s, CLOSES);
        expect(evidence.references).toEqual([
          { kind: 'issue', ref: OLD, status: 'unreadable', source: 'issue' },
        ]);
        expect(row(evidence)).toMatchObject({
          verdict: 'unverifiable',
          reason: 'source_unreadable:issue',
        });
      });
    });

    it('is not read when the closing references themselves could not be read', async () => {
      const s = fullScenario();
      s.closing = null;
      const { evidence, fake } = await read(s, CLOSES);
      expect(evidence.references).toBeUndefined();
      expect(fake.requests.some((r) => r.includes('private-org'))).toBe(false);
      expect(row(evidence)).toMatchObject({
        verdict: 'unverifiable',
        reason: 'evidence_field_unpopulated:closingIssuesReferences',
      });
    });
  });

  it('records a cited issue that answers 404 in a readable repository as absent', async () => {
    const s = fullScenario();
    s.issues = { 'other-org/docs#9': 200 };
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.references?.[0]).toEqual({
      kind: 'issue',
      ref: `${REPO}#4`,
      status: 'ok',
      exists: false,
    });
  });

  it('records a cited issue in a repository that answers 404 as unreadable, never absent', async () => {
    const s = fullScenario();
    s.repositories = {};
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.references?.[1]).toEqual({
      kind: 'issue',
      ref: 'other-org/docs#9',
      status: 'unreadable',
      source: 'repository',
    });
  });

  it('records a cited issue whose read errors (500) as unreadable', async () => {
    const s = fullScenario();
    s.issues = { [`${REPO}#4`]: 500, 'other-org/docs#9': 200 };
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.references?.[0]).toEqual({
      kind: 'issue',
      ref: `${REPO}#4`,
      status: 'unreadable',
      source: 'issue',
    });
  });

  it('records a commit the git database answers 404 for as absent, and an unreachable one as such', async () => {
    const s = fullScenario();
    s.commits = {};
    const missing = await read(s, FULL_BLOCK);
    expect(missing.evidence.references?.[2]).toEqual({
      kind: 'commit',
      ref: CITED,
      status: 'ok',
      exists: false,
      reachableFromHead: false,
    });
    const t = fullScenario();
    t.compare = { [`${CITED}...${HEAD}`]: 3 };
    const unreachable = await read(t, FULL_BLOCK);
    expect(unreachable.evidence.references?.[2]).toMatchObject({
      exists: true,
      reachableFromHead: false,
    });
  });

  it('records a failed compare as unreadable compare', async () => {
    const s = fullScenario();
    s.compare = { [`${CITED}...${HEAD}`]: 502, [`${MERGE}...${LATER}`]: 0 };
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.references?.[2]).toEqual({
      kind: 'commit',
      ref: CITED,
      status: 'unreadable',
      source: 'compare',
    });
  });

  it('lists excluded check runs and keeps every run', async () => {
    const s = fullScenario();
    s.checkRuns?.push({ id: 13, name: 'dunstan', status: 'in_progress', conclusion: null });
    const { evidence } = await read(s, FULL_BLOCK, [13]);
    expect(evidence.checkRuns).toMatchObject({ excludedIds: [13] });
    const claims = runChecks(FULL_BLOCK, evidence, REPO);
    expect(claims.find((c) => c.id === 'count:/checks/allSucceeded')?.verdict).toBe('pass');
  });

  it('records unreadable check runs, and their claims are unverifiable', async () => {
    const s = fullScenario();
    s.checkRunsStatus = 403;
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.checkRuns).toEqual({ status: 'unreadable', source: 'check_runs' });
    expect(evidence.sources.find((x) => x.kind === 'check_runs')?.error).toBe('http_403');
    const claims = runChecks(FULL_BLOCK, evidence, REPO);
    expect(claims.find((c) => c.id === 'count:/checks/total')).toMatchObject({
      verdict: 'unverifiable',
      reason: 'source_unreadable:check_runs',
    });
  });

  it('records an expired artifact as unreadable, never as absent', async () => {
    const s = fullScenario();
    s.artifacts = { 501: [{ id: 9001, name: 'junit-report', expired: true }] };
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.testRecords?.[0]).toEqual({
      record: JUNIT,
      status: 'unreadable',
      source: 'artifact',
    });
  });

  it('records a malformed JUnit file as an unreadable artifact with a parse error', async () => {
    const s = fullScenario();
    s.zips = { 9001: makeZip({ 'reports/junit.xml': '<testsuites><testcase></testsuites>' }) };
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.testRecords?.[0]).toEqual({
      record: JUNIT,
      status: 'unreadable',
      source: 'artifact',
    });
    expect(evidence.sources.find((x) => x.kind === 'artifact')?.error).toBe('parse');
  });

  it('treats a run without the job, the artifact or the file as no candidate', async () => {
    const s = fullScenario();
    s.zips = { 9001: makeZip({ 'other/junit.xml': junitXml(['pass']) }) };
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.testRecords?.[0]).toEqual({ record: JUNIT, status: 'ok', runs: [] });
  });

  it('treats a workflow file the repository does not have as no candidate run', async () => {
    const s = fullScenario();
    delete s.workflowRuns;
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidence.testRecords?.[0]).toEqual({ record: JUNIT, status: 'ok', runs: [] });
  });

  it('relates deployments: unrelated when the merge is not an ancestor, unknown when compare fails', async () => {
    const s = fullScenario();
    s.compare = { [`${CITED}...${HEAD}`]: 0, [`${MERGE}...${LATER}`]: 2 };
    const unrelated = await read(s, FULL_BLOCK);
    expect(unrelated.evidence.deployments?.[0]).toMatchObject({
      deployments: [{ id: 72, relation: 'unrelated' }],
    });
    s.compare = { [`${CITED}...${HEAD}`]: 0, [`${MERGE}...${LATER}`]: 500 };
    const unknown = await read(s, FULL_BLOCK);
    expect(unknown.evidence.deployments?.[0]).toMatchObject({
      deployments: [{ id: 72, relation: 'unknown' }],
    });
  });

  it('retries a rate-limited read with bounded backoff, then records it', async () => {
    const s = fullScenario();
    s.flaky = { [`/repos/${REPO}/pulls/7/files`]: [403, 502] };
    const warnings: string[] = [];
    const { client: c, fake } = client(s, warnings);
    const pr = await readPullRequest(c, REPO, 7);
    const evidence = await readEvidence(c, {
      repository: REPO,
      pullRequest: pr,
      block: { dunstan: '0.1', headCommit: HEAD, filesChanged: [] },
    });
    expect(evidence.files).toMatchObject({ status: 'ok' });
    expect(fake.requests.filter((r) => r.includes('/files')).length).toBe(3);
    expect(warnings).toEqual([]);
  });

  it('gives up loudly after the bound and records the source as unreadable', async () => {
    const s = fullScenario();
    s.flaky = { [`/repos/${REPO}/pulls/7/files`]: [502, 502, 502, 502, 502] };
    const warnings: string[] = [];
    const { client: c } = client(s, warnings);
    const pr = await readPullRequest(c, REPO, 7);
    const evidence = await readEvidence(c, {
      repository: REPO,
      pullRequest: pr,
      block: { dunstan: '0.1', headCommit: HEAD, filesChanged: [] },
    });
    expect(evidence.files).toEqual({ status: 'unreadable', source: 'pull_request_files' });
    expect(warnings.join('\n')).toMatch(/giving up with HTTP 502/);
  });
});

// The advisory's existence query (comparison 0.3.0): one fixed GraphQL query per path, which
// reads the type of the object at `<head>:<path>` and never its content.
describe('readPathObjects', () => {
  const pr = { pr: basePullRequest() };
  const ask = async (scenario: Scenario, paths: string[]) => {
    const { client: c, fake } = client(scenario);
    const answers = await readPathObjects(c, { repository: REPO, headSha: HEAD, paths });
    return { answers, fake, c };
  };

  it('sends the one fixed query per path, the head and the path as its expression', async () => {
    const { fake } = await ask(pr, ['src/a.ts', 'docs']);
    expect(fake.requests).toEqual(['POST /graphql', 'POST /graphql']);
    expect(fake.graphql.map((b) => JSON.parse(b))).toEqual([
      {
        query: PATH_QUERY,
        variables: { owner: 'example-org', name: 'example-repo', expression: `${HEAD}:src/a.ts` },
      },
      {
        query: PATH_QUERY,
        variables: { owner: 'example-org', name: 'example-repo', expression: `${HEAD}:docs` },
      },
    ]);
    // It asks for the type and nothing else: no field of a blob or a tree.
    expect(PATH_QUERY.replace(/\s+/g, ' ')).toContain(
      'object(expression: $expression) { __typename }',
    );
    expect(PATH_QUERY).not.toMatch(/\.\.\.|text|oid|byteSize|entries|isBinary/);
  });

  it('records Blob, Tree or no object, and nothing else of the answer', async () => {
    const secret = 'export const SECRET_LINE = 1;';
    const { answers } = await ask(
      {
        ...pr,
        objects: {
          [`${HEAD}:src/a.ts`]: {
            __typename: 'Blob',
            text: secret,
            byteSize: 29,
            oid: 'f'.repeat(40),
          },
          [`${HEAD}:src`]: { __typename: 'Tree', entries: [{ name: 'SECRET_NAME.ts' }] },
        },
      },
      ['src/a.ts', 'src', 'gone.ts'],
    );
    expect(answers).toEqual([
      { path: 'src/a.ts', status: 'ok', object: 'Blob' },
      { path: 'src', status: 'ok', object: 'Tree' },
      { path: 'gone.ts', status: 'ok', object: null },
    ]);
    expect(JSON.stringify(answers)).not.toMatch(/SECRET|byteSize|oid|entries/);
  });

  it('is unreadable on an HTTP error, a GraphQL error, another type or an unexpected shape', async () => {
    const statuses = await ask(
      { ...pr, objects: { [`${HEAD}:a.ts`]: 502, [`${HEAD}:b.ts`]: 404 } },
      ['a.ts', 'b.ts'],
    );
    expect(statuses.answers).toEqual([
      { path: 'a.ts', status: 'unreadable' },
      { path: 'b.ts', status: 'unreadable' },
    ]);
    const types = await ask(
      {
        ...pr,
        objects: {
          [`${HEAD}:vendor/lib`]: { __typename: 'Commit' },
          [`${HEAD}:x.ts`]: { text: 'no type' },
        },
      },
      ['vendor/lib', 'x.ts'],
    );
    expect(types.answers).toEqual([
      { path: 'vendor/lib', status: 'unreadable' },
      { path: 'x.ts', status: 'unreadable' },
    ]);
    for (const body of [
      { errors: [{ message: 'Something went wrong' }], data: { repository: { object: null } } },
      { data: { repository: null } },
      { data: null },
      [],
    ]) {
      const c = new GitHubClient({
        token: 't',
        fetch: (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch,
        sleep: async () => {},
        warn: () => {},
      });
      expect(
        await readPathObjects(c, { repository: REPO, headSha: HEAD, paths: ['a.ts'] }),
      ).toEqual([{ path: 'a.ts', status: 'unreadable' }]);
    }
  });

  it('records no evidence source: its answers belong to the advisory section', async () => {
    const { c } = await ask(pr, ['src/a.ts']);
    expect(c.sortedSources()).toEqual([]);
  });

  it('asks nothing for a value that is not a repository path, and records it unreadable', async () => {
    const { answers, fake } = await ask(pr, ['../etc/passwd', 'a b.ts']);
    expect(fake.requests).toEqual([]);
    expect(answers).toEqual([
      { path: '../etc/passwd', status: 'unreadable' },
      { path: 'a b.ts', status: 'unreadable' },
    ]);
  });
});

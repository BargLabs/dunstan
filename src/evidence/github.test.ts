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
import { countingBody, MiB, oversizedArchive } from '../__tests__/streams.js';
import { runChecks } from '../check/index.js';
import type { Block, CheckRun, Evidence } from '../check/types.js';
import { validateRecord } from '../spec/schema.js';
import {
  CLOSE_BASE_QUERY,
  CLOSE_EVENTS_QUERY,
  CLOSING_QUERY,
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
      {
        id: 501,
        check_suite_id: 5010,
        run_attempt: 2,
        event: 'pull_request',
        path: '.github/workflows/ci.yml',
        head_sha: HEAD,
      },
      {
        id: 502,
        check_suite_id: 5020,
        run_attempt: 1,
        event: 'push',
        path: '.github/workflows/other/ci.yml',
        head_sha: HEAD,
      },
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

    it('that exists and is not linked, nor closed by the pull request: the claim fails not_closing', async () => {
      const s = fullScenario();
      s.closing = [];
      s.repositories = { 'private-org/oncall': 200 };
      s.issues = { 'private-org/oncall#11': 200 };
      const { evidence } = await read(s, CLOSES);
      expect(evidence.references).toEqual([
        { kind: 'issue', ref: 'private-org/oncall#11', status: 'ok', exists: true },
      ]);
      // Spec 0.1.4: who closed it is read before the claim can fail.
      expect(evidence.closeEvents).toEqual({
        pullRequest: { status: 'ok', baseRef: 'main', defaultBranch: 'main', commits: [HEAD] },
        targets: [
          { ref: 'private-org/oncall#11', status: 'ok', type: 'issue', state: 'open', events: [] },
        ],
      });
      expect(row(evidence)).toMatchObject({
        verdict: 'fail',
        reason: 'not_closing',
        observed: { closing: [], state: 'open', events: [] },
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

    // Spec 0.1.4: the closing references are not the only record of a close. Each ClosedEvent of
    // the target names its closer, a pull request or a commit; the pull request's base, default
    // branch and commits are read beside them.
    describe('who closed it', () => {
      const TARGET = 'private-org/oncall#11';
      const COMMIT = 'c0de000000000000000000000000000000000001';
      const linked = (closeEvents: Scenario['closeEvents'] = {}) => {
        const s = fullScenario();
        s.closing = [];
        s.repositories = { 'private-org/oncall': 200 };
        s.issues = { [TARGET]: 200 };
        s.closeEvents = closeEvents;
        return s;
      };
      const closedBy = (closer: unknown, createdAt = '2026-10-01T14:05:11Z') => ({
        createdAt,
        closer,
      });
      const thisPr = { __typename: 'PullRequest', number: 7, repository: { nameWithOwner: REPO } };

      it('records every ClosedEvent and its closer, and the claim passes on this pull request', async () => {
        const { evidence, fake } = await read(
          linked({
            [TARGET]: {
              state: 'CLOSED',
              events: [
                closedBy(null, '2026-09-01T00:00:00Z'),
                closedBy({ __typename: 'ProjectV2', id: 'P_1' }, '2026-09-02T00:00:00Z'),
                closedBy({ __typename: 'Commit', oid: COMMIT }, '2026-09-03T00:00:00Z'),
                closedBy(thisPr),
              ],
            },
          }),
          CLOSES,
        );
        expect(evidenceSchemaErrors(evidence)).toEqual([]);
        expect(evidence.closeEvents?.targets).toEqual([
          {
            ref: TARGET,
            status: 'ok',
            type: 'issue',
            state: 'closed',
            events: [
              { at: '2026-09-01T00:00:00Z', closer: null },
              { at: '2026-09-02T00:00:00Z', closer: { kind: 'other' } },
              { at: '2026-09-03T00:00:00Z', closer: { kind: 'commit', oid: COMMIT } },
              {
                at: '2026-10-01T14:05:11Z',
                closer: { kind: 'pull_request', ref: `${REPO}#7` },
              },
            ],
          },
        ]);
        expect(row(evidence)).toMatchObject({
          verdict: 'pass',
          observed: {
            closing: [],
            closedBy: {
              at: '2026-10-01T14:05:11Z',
              closer: { kind: 'pull_request', ref: `${REPO}#7` },
            },
          },
        });
        // The two fixed queries, each with its own variables, and nothing else.
        expect(fake.graphql.map((b) => JSON.parse(b))).toEqual([
          {
            query: CLOSING_QUERY,
            variables: { owner: 'example-org', name: 'example-repo', number: 7, after: null },
          },
          {
            query: CLOSE_BASE_QUERY,
            variables: { owner: 'example-org', name: 'example-repo', number: 7, after: null },
          },
          {
            query: CLOSE_EVENTS_QUERY,
            variables: { owner: 'private-org', name: 'oncall', number: 11, after: null },
          },
        ]);
        expect(evidence.sources.map((x) => `${x.kind} ${x.locator}`)).toEqual(
          expect.arrayContaining([
            `issue POST /graphql repository(private-org/oncall).issueOrPullRequest(11).timelineItems(CLOSED_EVENT)`,
            `pull_request_commits POST /graphql repository(${REPO}).pullRequest(7).commits`,
          ]),
        );
      });

      it('records a pull request target and its state, so a closes of a pull request it supersedes passes', async () => {
        const block: Block = { ...CLOSES, references: [{ issue: '#8', relation: 'closes' }] };
        const s = linked({
          [`${REPO}#8`]: { type: 'PullRequest', state: 'CLOSED', events: [closedBy(thisPr)] },
        });
        // The issues API answers for a pull request number too, so it exists.
        s.issues = { [`${REPO}#8`]: 200 };
        const { evidence } = await read(s, block);
        expect(evidence.references).toEqual([
          { kind: 'issue', ref: `${REPO}#8`, status: 'ok', exists: true },
        ]);
        expect(evidence.closeEvents?.targets).toEqual([
          {
            ref: `${REPO}#8`,
            status: 'ok',
            type: 'pull_request',
            state: 'closed',
            events: [
              { at: '2026-10-01T14:05:11Z', closer: { kind: 'pull_request', ref: `${REPO}#7` } },
            ],
          },
        ]);
        expect(runChecks(block, evidence, REPO)[3]).toMatchObject({ verdict: 'pass' });
        s.closeEvents = { [`${REPO}#8`]: { type: 'PullRequest', state: 'MERGED' } };
        const merged = await read(s, block);
        expect(merged.evidence.closeEvents?.targets[0]).toMatchObject({ state: 'merged' });
      });

      it('reads every commit of the pull request across pages, and a commit closer among them passes', async () => {
        const commits = Array.from({ length: 230 }, (_, i) => i.toString(16).padStart(40, '0'));
        const s = linked({
          [TARGET]: {
            state: 'CLOSED',
            events: [closedBy({ __typename: 'Commit', oid: commits[150] })],
          },
        });
        s.prCommits = commits;
        const { evidence } = await read(s, CLOSES);
        expect(evidence.closeEvents?.pullRequest).toEqual({
          status: 'ok',
          baseRef: 'main',
          defaultBranch: 'main',
          commits: [...commits].sort(),
        });
        expect(row(evidence)).toMatchObject({
          verdict: 'pass',
          observed: { closedBy: { closer: { kind: 'commit', oid: commits[150] } } },
        });
      });

      it('records a commit list shorter than GitHub counts as unreadable, never as complete', async () => {
        const s = linked({
          [TARGET]: { state: 'CLOSED', events: [closedBy({ __typename: 'Commit', oid: COMMIT })] },
        });
        s.prCommits = [HEAD];
        s.prCommitsTotal = 251;
        const { evidence } = await read(s, CLOSES);
        expect(evidence.closeEvents?.pullRequest).toEqual({
          status: 'unreadable',
          source: 'pull_request_commits',
        });
        expect(row(evidence)).toMatchObject({
          verdict: 'unverifiable',
          reason: 'source_unreadable:pull_request_commits',
        });
        delete s.prCommitsTotal;
        s.prCommitsStatus = 502;
        const failed = await read(s, CLOSES);
        expect(failed.evidence.closeEvents?.pullRequest).toEqual({
          status: 'unreadable',
          source: 'pull_request_commits',
        });
      });

      it('records the base and the default branch, and a merge elsewhere with the target open is closing_base_not_default', async () => {
        const s = linked();
        s.baseRef = 'release-2.0';
        const { evidence } = await read(s, CLOSES);
        expect(evidenceSchemaErrors(evidence)).toEqual([]);
        expect(evidence.closeEvents?.pullRequest).toMatchObject({
          baseRef: 'release-2.0',
          defaultBranch: 'main',
        });
        expect(row(evidence)).toMatchObject({
          verdict: 'unverifiable',
          reason: 'closing_base_not_default',
        });
        s.defaultBranch = null;
        s.baseRef = 'main';
        const none = await read(s, CLOSES);
        expect(none.evidence.closeEvents?.pullRequest).toMatchObject({ defaultBranch: null });
        expect(evidenceSchemaErrors(none.evidence)).toEqual([]);
      });

      it('records close events over the page budget as unreadable, and the claim is unverifiable', async () => {
        const many = Array.from({ length: 1001 }, () => closedBy(null));
        const s = linked({ [TARGET]: { state: 'CLOSED', events: many } });
        const { evidence, fake } = await read(s, CLOSES);
        expect(evidence.closeEvents?.targets).toEqual([
          { ref: TARGET, status: 'unreadable', source: 'issue' },
        ]);
        expect(fake.graphql.filter((b) => b.includes('issueOrPullRequest'))).toHaveLength(10);
        expect(row(evidence)).toMatchObject({
          verdict: 'unverifiable',
          reason: 'source_unreadable:issue',
        });
        // Within the budget every page is read.
        s.closeEvents = { [TARGET]: { state: 'CLOSED', events: many.slice(0, 1000) } };
        const within = await read(s, CLOSES);
        expect(within.evidence.closeEvents?.targets[0]).toMatchObject({ status: 'ok' });
      });

      it('is unreadable on an HTTP error, a GraphQL error or an unexpected shape, and unpopulated on no item', async () => {
        const answers: [Scenario['closeEvents'], unknown][] = [
          [{ [TARGET]: 502 }, { ref: TARGET, status: 'unreadable', source: 'issue' }],
          [{ [TARGET]: { state: 'SHUT' } }, { ref: TARGET, status: 'unreadable', source: 'issue' }],
          [
            { [TARGET]: { type: 'Discussion' } },
            { ref: TARGET, status: 'unreadable', source: 'issue' },
          ],
          [
            { [TARGET]: { state: 'CLOSED', events: [{ createdAt: 'yesterday', closer: null }] } },
            { ref: TARGET, status: 'unreadable', source: 'issue' },
          ],
          [
            {
              [TARGET]: {
                state: 'CLOSED',
                events: [closedBy({ __typename: 'Commit', oid: 'abc' })],
              },
            },
            { ref: TARGET, status: 'unreadable', source: 'issue' },
          ],
          [{ [TARGET]: null }, { ref: TARGET, status: 'unpopulated', field: 'issueOrPullRequest' }],
        ];
        for (const [closeEvents, expected] of answers) {
          const { evidence } = await read(linked(closeEvents), CLOSES);
          expect(evidence.closeEvents?.targets, JSON.stringify(closeEvents)).toEqual([expected]);
          expect(evidenceSchemaErrors(evidence)).toEqual([]);
          expect(row(evidence)?.verdict).toBe('unverifiable');
        }
      });

      it('reads a transferred issue under the identity GitHub resolves it to', async () => {
        const MOVED = 'private-org/tracker#4';
        const s = linked({ [MOVED]: { state: 'CLOSED', events: [closedBy(thisPr)] } });
        s.transferred = { [TARGET]: MOVED };
        const { evidence, fake } = await read(s, CLOSES);
        expect(evidence.closeEvents?.targets).toMatchObject([{ ref: MOVED, status: 'ok' }]);
        expect(fake.graphql.at(-1)).toContain('"owner":"private-org","name":"tracker","number":4');
        expect(row(evidence)).toMatchObject({
          verdict: 'pass',
          observed: { ref: TARGET, resolvedAs: MOVED },
        });
      });

      it('reads nothing for a closes the closing references list, a cites, or a target that is not found', async () => {
        const listed = await read(fullScenario(), FULL_BLOCK);
        expect(listed.evidence.closeEvents).toBeUndefined();
        expect(listed.fake.graphql.some((b) => b.includes('issueOrPullRequest'))).toBe(false);
        const s = linked();
        s.issues = {};
        const missing = await read(s, CLOSES);
        expect(missing.evidence.closeEvents).toBeUndefined();
        expect(row(missing.evidence)).toMatchObject({ verdict: 'fail', reason: 'not_found' });
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

  // Spec section 6, "Not found": the commit read is the git-database endpoint, which answers 404
  // for a commit the repository does not have (the commits endpoint answers 422). Only 404 or 410
  // is not found; a 422 or any other failed answer is unreadable, and a repository is never absent.
  it('reads a commit at the git-database endpoint, and counts only 404 or 410 as not found', async () => {
    const { fake } = await read(fullScenario(), FULL_BLOCK);
    expect(fake.requests).toContain(`GET /repos/${REPO}/git/commits/${CITED}`);
    expect(fake.requests).not.toContain(`GET /repos/${REPO}/commits/${CITED}`);

    const cites: Block = {
      dunstan: '0.1',
      headCommit: HEAD,
      filesChanged: ['src/a.ts', 'src/b.ts'],
      references: [
        { issue: '#4', relation: 'cites' },
        { commit: CITED, relation: 'cites' },
        { issue: 'other-org/docs#9', relation: 'cites' },
      ],
    };
    const rows = (evidence: Evidence) =>
      runChecks(cites, evidence, REPO)
        .filter((c) => c.check === 'reference')
        .map((c) => [c.verdict, c.reason]);
    for (const status of [404, 410]) {
      const s = fullScenario();
      s.issues = { [`${REPO}#4`]: status, 'other-org/docs#9': 200 };
      s.commits = { [CITED]: status };
      const { evidence } = await read(s, cites);
      expect(evidence.references?.slice(0, 2), String(status)).toEqual([
        { kind: 'issue', ref: `${REPO}#4`, status: 'ok', exists: false },
        { kind: 'commit', ref: CITED, status: 'ok', exists: false, reachableFromHead: false },
      ]);
      expect(rows(evidence).slice(0, 2)).toEqual([
        ['fail', 'not_found'],
        ['fail', 'not_found'],
      ]);
    }
    for (const status of [422, 403]) {
      const s = fullScenario();
      s.issues = { [`${REPO}#4`]: status, 'other-org/docs#9': 200 };
      s.commits = { [CITED]: status };
      const { evidence } = await read(s, cites);
      expect(evidence.references?.slice(0, 2), String(status)).toEqual([
        { kind: 'issue', ref: `${REPO}#4`, status: 'unreadable', source: 'issue' },
        { kind: 'commit', ref: CITED, status: 'unreadable', source: 'commit' },
      ]);
      expect(rows(evidence).slice(0, 2)).toEqual([
        ['unverifiable', 'source_unreadable:issue'],
        ['unverifiable', 'source_unreadable:commit'],
      ]);
    }
    for (const status of [404, 410, 422]) {
      const s = fullScenario();
      s.repositories = { 'other-org/docs': status };
      const { evidence } = await read(s, cites);
      expect(evidence.references?.[2], String(status)).toEqual({
        kind: 'issue',
        ref: 'other-org/docs#9',
        status: 'unreadable',
        source: 'repository',
      });
      expect(rows(evidence)[2]).toEqual(['unverifiable', 'source_unreadable:repository']);
    }
  });

  // Spec section 6, "Sources": GitHub answers a GraphQL error with HTTP 200. The read is recorded
  // as a parse error and its section is unreadable, never an answer, even beside the data.
  it('records a GraphQL error answered with HTTP 200 as parse, and the read unreadable', async () => {
    const s = fullScenario();
    s.closing = [];
    s.issues = { [`${REPO}#3`]: 200 };
    const closes: Block = {
      dunstan: '0.1',
      headCommit: HEAD,
      filesChanged: ['src/a.ts', 'src/b.ts'],
      references: [{ issue: '#3', relation: 'closes' }],
    };
    const withGraphqlError = async (marker: string) => {
      const fake = fakeGitHub(s);
      const fetch: typeof globalThis.fetch = async (input, init) => {
        const answer = await fake.fetch(input, init);
        if (typeof init?.body !== 'string' || !init.body.includes(marker)) return answer;
        const body = (await answer.json()) as Record<string, unknown>;
        const errors = [{ type: 'FORBIDDEN', message: 'Resource not accessible' }];
        return new Response(JSON.stringify({ ...body, errors }), { status: 200 });
      };
      const c = new GitHubClient({ token: 't', fetch, sleep: async () => {}, warn: () => {} });
      const pr = await readPullRequest(c, REPO, 7);
      return readEvidence(c, { repository: REPO, pullRequest: pr, block: closes });
    };
    const failedReads = (evidence: Evidence) =>
      evidence.sources.filter((x) => x.error !== undefined).map((x) => [x.kind, x.error]);
    const row = (evidence: Evidence) => runChecks(closes, evidence, REPO)[3];

    const closing = await withGraphqlError('closingIssuesReferences');
    expect(closing.closingReferences).toEqual({
      status: 'unreadable',
      source: 'closing_references',
    });
    expect(failedReads(closing)).toEqual([['closing_references', 'parse']]);
    expect(row(closing)).toMatchObject({
      verdict: 'unverifiable',
      reason: 'source_unreadable:closing_references',
    });

    const base = await withGraphqlError('baseRefName');
    expect(base.closeEvents?.pullRequest).toEqual({
      status: 'unreadable',
      source: 'pull_request_commits',
    });
    expect(failedReads(base)).toEqual([['pull_request_commits', 'parse']]);
    expect(row(base)).toMatchObject({
      verdict: 'unverifiable',
      reason: 'source_unreadable:pull_request_commits',
    });

    const target = await withGraphqlError('issueOrPullRequest');
    expect(target.closeEvents?.targets).toEqual([
      { ref: `${REPO}#3`, status: 'unreadable', source: 'issue' },
    ]);
    expect(failedReads(target)).toEqual([['issue', 'parse']]);
    expect(row(target)).toMatchObject({
      verdict: 'unverifiable',
      reason: 'source_unreadable:issue',
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

  it("records each check run's check suite and app, and counts two workflows' `test` apart", async () => {
    const s = fullScenario();
    s.checkRuns = [
      {
        id: 21,
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        check_suite: { id: 70 },
        app: { slug: 'github-actions', name: 'GitHub Actions' },
      },
      {
        id: 22,
        name: 'test',
        status: 'completed',
        conclusion: 'success',
        check_suite: { id: 80 },
        app: { slug: 'github-actions' },
      },
      // A run whose answer names no check suite or app is recorded without them.
      { id: 23, name: 'lint', status: 'completed', conclusion: 'success', check_suite: null },
    ];
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidenceSchemaErrors(evidence)).toEqual([]);
    expect(evidence.checkRuns).toEqual({
      status: 'ok',
      commit: HEAD,
      excludedIds: [],
      runs: [
        {
          id: 21,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          checkSuiteId: 70,
          appSlug: 'github-actions',
        },
        {
          id: 22,
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          checkSuiteId: 80,
          appSlug: 'github-actions',
        },
        { id: 23, name: 'lint', status: 'completed', conclusion: 'success' },
      ],
    });
    const claims = runChecks(FULL_BLOCK, evidence, REPO);
    expect(claims.find((c) => c.id === 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
  });

  it('leaves out an app slug that is not a non-empty string, and reads the run', async () => {
    const s = fullScenario();
    s.checkRuns = [
      { id: 21, name: 'test', status: 'completed', conclusion: 'success', app: { slug: 7 } },
      { id: 22, name: 'lint', status: 'completed', conclusion: 'success', app: 'github-actions' },
    ];
    const { evidence } = await read(s, FULL_BLOCK);
    expect(evidenceSchemaErrors(evidence)).toEqual([]);
    expect(evidence.checkRuns).toEqual({
      status: 'ok',
      commit: HEAD,
      excludedIds: [],
      runs: [
        { id: 21, name: 'test', status: 'completed', conclusion: 'success' },
        { id: 22, name: 'lint', status: 'completed', conclusion: 'success' },
      ],
    });
  });

  it('records the check runs unreadable when a check suite id is not a positive integer', async () => {
    for (const check_suite of [{ id: 0 }, {}, { id: '70' }]) {
      const s = fullScenario();
      s.checkRuns = [
        { id: 21, name: 'test', status: 'completed', conclusion: 'success', check_suite },
      ];
      const { evidence } = await read(s, FULL_BLOCK);
      expect(evidence.checkRuns).toEqual({ status: 'unreadable', source: 'check_runs' });
    }
  });

  // Spec 0.1.4, amended 2026-10-13: each run of a workflow is a check suite of its own, so the
  // workflow runs at the head name the workflow each Actions check run belongs to.
  describe('the workflow of each check run', () => {
    const CI = '.github/workflows/ci.yml';
    const actions = (id: number, name: string, conclusion: string, suite: number) => ({
      id,
      name,
      status: 'completed',
      conclusion,
      check_suite: { id: suite },
      app: { slug: 'github-actions' },
    });
    const workflowRun = (id: number, suite: number, event: string, path = CI) => ({
      id,
      check_suite_id: suite,
      run_attempt: 1,
      event,
      path,
      head_sha: HEAD,
    });
    // ci.yml on push (suite 70) and on pull_request (suite 80); the push run's `test` failed and
    // the pull_request run's passed. An external app's run has a suite and no workflow.
    const twiceOnOneHead = () => {
      const s = fullScenario();
      s.checkRuns = [
        actions(21, 'test', 'failure', 70),
        actions(22, 'lint', 'success', 70),
        actions(23, 'test', 'success', 80),
        actions(24, 'lint', 'success', 80),
        {
          id: 25,
          name: 'preview',
          status: 'completed',
          conclusion: 'success',
          check_suite: { id: 90 },
          app: { slug: 'example-deploys' },
        },
      ];
      s.workflowRuns = [
        workflowRun(100, 70, 'push'),
        workflowRun(101, 80, 'pull_request'),
        ...(s.workflowRuns ?? []),
      ];
      return s;
    };
    const CHECKS: Block = { ...FULL_BLOCK, checks: { total: 3, allSucceeded: true } };

    it("records each run's workflow path, run and attempt, and counts a workflow run twice once", async () => {
      const { evidence, fake } = await read(twiceOnOneHead(), CHECKS);
      expect(evidenceSchemaErrors(evidence)).toEqual([]);
      expect(fake.requests).toContain(
        `GET /repos/${REPO}/actions/runs?head_sha=${HEAD}&per_page=100&page=1`,
      );
      const at = (suite: number, runId: number) => ({
        checkSuiteId: suite,
        appSlug: 'github-actions',
        workflowPath: CI,
        workflowRunId: runId,
        runAttempt: 1,
      });
      expect(evidence.checkRuns).toEqual({
        status: 'ok',
        commit: HEAD,
        excludedIds: [],
        runs: [
          { id: 21, name: 'test', status: 'completed', conclusion: 'failure', ...at(70, 100) },
          { id: 22, name: 'lint', status: 'completed', conclusion: 'success', ...at(70, 100) },
          { id: 23, name: 'test', status: 'completed', conclusion: 'success', ...at(80, 101) },
          { id: 24, name: 'lint', status: 'completed', conclusion: 'success', ...at(80, 101) },
          {
            id: 25,
            name: 'preview',
            status: 'completed',
            conclusion: 'success',
            checkSuiteId: 90,
            appSlug: 'example-deploys',
          },
        ],
      });
      const claims = runChecks(CHECKS, evidence, REPO);
      expect(claims.find((c) => c.id === 'count:/checks/total')).toMatchObject({
        verdict: 'pass',
        observed: 3,
      });
      expect(claims.find((c) => c.id === 'count:/checks/allSucceeded')).toMatchObject({
        verdict: 'pass',
        observed: true,
      });
    });

    it('the record schema takes a workflow path, run and attempt only together, with a suite', async () => {
      const { evidence } = await read(twiceOnOneHead(), CHECKS);
      if (evidence.checkRuns?.status !== 'ok') throw new Error('unread');
      const first = evidence.checkRuns.runs[0] as CheckRun;
      for (const drop of ['checkSuiteId', 'workflowRunId', 'runAttempt', 'workflowPath'] as const) {
        const run: CheckRun = { ...first };
        delete run[drop];
        const errors = evidenceSchemaErrors({
          ...evidence,
          checkRuns: { ...evidence.checkRuns, runs: [run] },
        });
        expect(errors.map((e) => e.keyword)).toContain('dependentRequired');
      }
    });

    it('records a workflow path without the ref GitHub may give after `@`', async () => {
      const s = twiceOnOneHead();
      s.workflowRuns = [
        workflowRun(100, 70, 'push', `${CI}@refs/heads/main`),
        workflowRun(101, 80, 'pull_request'),
      ];
      const { evidence } = await read(s, CHECKS);
      const runs = evidence.checkRuns?.status === 'ok' ? evidence.checkRuns.runs : [];
      expect(runs.map((r) => r.workflowPath)).toEqual([CI, CI, CI, CI, undefined]);
    });

    // Spec 0.1.5: the same listing gives each workflow run's `name`, recorded as it is given.
    it("records the workflow's name as the listing gives it, never the run's title", async () => {
      const s = twiceOnOneHead();
      s.workflowRuns = [
        { ...workflowRun(100, 70, 'push'), name: 'Continuous Integration', display_title: 'Fix' },
        { ...workflowRun(101, 80, 'pull_request'), name: ' ci ' },
      ];
      const { evidence } = await read(s, CHECKS);
      expect(evidenceSchemaErrors(evidence)).toEqual([]);
      const runs = evidence.checkRuns?.status === 'ok' ? evidence.checkRuns.runs : [];
      expect(runs.map((r) => r.workflowName)).toEqual([
        'Continuous Integration',
        'Continuous Integration',
        ' ci ',
        ' ci ',
        undefined,
      ]);
      expect(runs.map((r) => r.workflowPath)).toEqual([CI, CI, CI, CI, undefined]);
      // The 0.1 gate reads nothing new.
      const claims = runChecks(CHECKS, evidence, REPO);
      expect(claims.find((c) => c.id === 'count:/checks/total')).toMatchObject({
        verdict: 'pass',
        observed: 3,
      });
    });

    it('records no workflow name where the listing gives none, null or the empty string', async () => {
      for (const name of [undefined, null, '']) {
        const s = twiceOnOneHead();
        s.workflowRuns = [
          { ...workflowRun(100, 70, 'push'), name },
          { ...workflowRun(101, 80, 'pull_request'), name },
        ];
        const { evidence } = await read(s, CHECKS);
        expect(evidenceSchemaErrors(evidence)).toEqual([]);
        const runs = evidence.checkRuns?.status === 'ok' ? evidence.checkRuns.runs : [];
        expect(runs.map((r) => r.workflowPath)).toEqual([CI, CI, CI, CI, undefined]);
        for (const run of runs) expect('workflowName' in run, String(name)).toBe(false);
      }
    });

    it('records the check runs unreadable when a workflow name is not a string', async () => {
      for (const name of [7, true, ['CI'], { name: 'CI' }]) {
        const s = twiceOnOneHead();
        s.workflowRuns = [{ ...workflowRun(100, 70, 'push'), name }];
        const { evidence } = await read(s, CHECKS);
        expect(evidence.checkRuns).toEqual({ status: 'unreadable', source: 'workflow_runs' });
      }
    });

    it('the record schema takes a workflow name only beside a workflow path, and never empty', async () => {
      const s = twiceOnOneHead();
      s.workflowRuns = [
        { ...workflowRun(100, 70, 'push'), name: 'CI' },
        { ...workflowRun(101, 80, 'pull_request'), name: 'CI' },
      ];
      const { evidence } = await read(s, CHECKS);
      const section = evidence.checkRuns;
      if (section?.status !== 'ok') throw new Error('unread');
      const first = section.runs[0] as CheckRun;
      const errorsWith = (run: CheckRun) =>
        evidenceSchemaErrors({ ...evidence, checkRuns: { ...section, runs: [run] } });
      const pathless: CheckRun = { ...first };
      delete pathless.workflowPath;
      delete pathless.workflowRunId;
      delete pathless.runAttempt;
      expect(errorsWith(pathless).map((e) => e.keyword)).toContain('dependentRequired');
      expect(errorsWith({ ...first, workflowName: '' }).map((e) => e.keyword)).toContain(
        'minLength',
      );
      // A 0.1.4 record's run, with a path and no name, stays valid.
      const unnamed: CheckRun = { ...first };
      delete unnamed.workflowName;
      expect(errorsWith(unnamed)).toEqual([]);
    });

    it('records the check runs unreadable when the workflow runs cannot be read, never counted per suite', async () => {
      const s = twiceOnOneHead();
      s.workflowRunsStatus = 502;
      const { evidence } = await read(s, CHECKS);
      expect(evidence.checkRuns).toEqual({ status: 'unreadable', source: 'workflow_runs' });
      expect(
        evidence.sources.find((x) => x.locator.includes('/actions/runs?head_sha='))?.error,
      ).toBe('http_502');
      const claims = runChecks(CHECKS, evidence, REPO);
      for (const id of ['count:/checks/total', 'count:/checks/allSucceeded']) {
        expect(claims.find((c) => c.id === id)).toMatchObject({
          verdict: 'unverifiable',
          observed: null,
          reason: 'source_unreadable:workflow_runs',
        });
      }
    });

    it('records the check runs unreadable when two workflow runs name one check suite', async () => {
      const s = twiceOnOneHead();
      s.workflowRuns = [workflowRun(100, 70, 'push'), workflowRun(101, 70, 'pull_request')];
      const { evidence } = await read(s, CHECKS);
      expect(evidence.checkRuns).toEqual({ status: 'unreadable', source: 'workflow_runs' });
    });

    it('records the check runs unreadable when a workflow run answers in another shape', async () => {
      for (const odd of [
        { check_suite_id: 0 },
        { check_suite_id: '70' },
        { path: '' },
        { path: '@refs/heads/main' },
        { run_attempt: 0 },
        { id: 0 },
      ]) {
        const s = twiceOnOneHead();
        s.workflowRuns = [{ ...workflowRun(100, 70, 'push'), ...odd }];
        const { evidence } = await read(s, CHECKS);
        expect(evidence.checkRuns).toEqual({ status: 'unreadable', source: 'workflow_runs' });
      }
    });

    it('reads no workflow runs when no check run names a check suite', async () => {
      const { evidence, fake } = await read(fullScenario(), FULL_BLOCK);
      expect(evidence.checkRuns?.status).toBe('ok');
      expect(fake.requests.some((r) => r.includes('/actions/runs?'))).toBe(false);
    });
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
    // Spec section 7.5: its counts are unverifiable as unreadable, never record_not_found, since
    // the run did upload the record. So are an archive whose download fails (an expired one
    // answers 410).
    const counts = (e: Evidence) =>
      runChecks(FULL_BLOCK, e, REPO)
        .filter((c) => c.id.startsWith('count:/tests/'))
        .map((c) => [c.verdict, c.reason]);
    const unreadableCounts = [
      ['unverifiable', 'source_unreadable:artifact'],
      ['unverifiable', 'source_unreadable:artifact'],
    ];
    expect(counts(evidence)).toEqual(unreadableCounts);
    const gone = fullScenario();
    gone.zips = {};
    const download = await read(gone, FULL_BLOCK);
    expect(download.evidence.testRecords?.[0]).toEqual({
      record: JUNIT,
      status: 'unreadable',
      source: 'artifact',
    });
    expect(download.evidence.sources.find((x) => x.kind === 'artifact')?.error).toBe('http_410');
    expect(counts(download.evidence)).toEqual(unreadableCounts);
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

  // Security review of 411180d, finding 1: an archive is read against its budget, so one far larger
  // whose selected entry is small is cancelled near the budget, never held whole, and is unreadable.
  it('cancels an oversized artifact archive near its budget and records it unreadable', async () => {
    const s = fullScenario();
    const archive = countingBody(
      oversizedArchive('reports/junit.xml', junitXml(['pass']), 96 * MiB),
    );
    const fake = fakeGitHub(s);
    const fetch = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/actions/artifacts/9001/zip')
        ? new Response(archive.stream)
        : fake.fetch(input, init)) as typeof globalThis.fetch;
    const c = new GitHubClient({ token: 't', fetch, sleep: async () => {}, warn: () => {} });
    const pr = await readPullRequest(c, REPO, 7);
    const evidence = await readEvidence(c, {
      repository: REPO,
      pullRequest: pr,
      block: FULL_BLOCK,
      excludedCheckRunIds: [],
    });
    expect(evidence.testRecords?.[0]).toEqual({
      record: JUNIT,
      status: 'unreadable',
      source: 'artifact',
    });
    expect(evidence.sources.find((x) => x.kind === 'artifact')?.error).toBe('parse');
    expect(archive.pulled).toBeLessThanOrEqual(73 * MiB);
    expect(archive.cancelled).toBe(true);
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

  // Spec section 7.6: the deployments of the head are those of the observed head,
  // pullRequest.headSha, not of the declared headCommit, which then fails the head row.
  it('reads the deployments of the observed head, not the declared headCommit', async () => {
    const DECLARED = 'dec1a2ed00000000000000000000000000000001';
    const success = [{ state: 'success', created_at: '2026-10-01T13:05:00Z' }];
    const s: Scenario = {
      pr: basePullRequest({ changed_files: 1 }),
      files: [{ filename: 'src/a.ts', status: 'modified' }],
      deployments: [
        { id: 81, sha: HEAD, environment: 'preview', created_at: '2026-10-01T13:00:00Z' },
        { id: 82, sha: DECLARED, environment: 'preview', created_at: '2026-10-01T13:00:00Z' },
      ],
      statuses: { 81: success, 82: success },
    };
    const block: Block = {
      dunstan: '0.1',
      headCommit: DECLARED,
      filesChanged: ['src/a.ts'],
      deployedAt: { at: '2026-10-01T14:00:00Z', environment: 'preview' },
    };
    const { evidence, fake } = await read(s, block);
    expect(fake.requests).toContain(
      `GET /repos/${REPO}/deployments?environment=preview&sha=${HEAD}&per_page=100&page=1`,
    );
    expect(fake.requests.some((r) => r.includes(DECLARED))).toBe(false);
    expect(evidence.deployments).toEqual([
      {
        environment: 'preview',
        status: 'ok',
        deployments: [{ id: 81, sha: HEAD, relation: 'head', successAt: '2026-10-01T13:05:00Z' }],
      },
    ]);
    expect(runChecks(block, evidence, REPO).map((c) => [c.id, c.verdict, c.reason])).toEqual([
      ['head:/headCommit', 'fail', 'head_mismatch'],
      ['scope:/filesChanged/0', 'pass', undefined],
      ['time:/deployedAt', 'pass', undefined],
    ]);
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

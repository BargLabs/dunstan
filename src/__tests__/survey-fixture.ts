// The survey's fixture repository (tests only): fourteen closed pull requests, thirteen of them by
// agent-bot, covering every column and every way a pull request can come out. Each is described
// beside it, with the claim rows the record gives it; survey.test.ts counts the rates by hand from
// these descriptions.

import { basePullRequest, junitXml, makeZip, REPO, type Scenario } from './fake-github.js';
import type { ListedFixture, SurveyWorld } from './fake-survey.js';

export const AGENT = 'agent-bot';
export const NOW = new Date('2026-11-02T12:00:00Z');

export const sha = (n: number) => `${'5'.repeat(37)}${n}`;
const mergeSha = (n: number) => `${'7'.repeat(37)}${n}`;
const createdAt = (n: number) => `2026-10-${String(n - 90).padStart(2, '0')}T09:00:00Z`;
const MERGED_AT = '2026-10-30T10:00:00Z';

const JUNIT = {
  kind: 'junit',
  workflow: '.github/workflows/ci.yml',
  job: 'test',
  artifact: 'junit-report',
  path: 'reports/junit.xml',
};

const fence = (block: Record<string, unknown>) =>
  `\`\`\`dunstan-handback\n${JSON.stringify({ dunstan: '0.1', ...block })}\n\`\`\``;

function pull(n: number, body: string, files: string[], extra: Partial<Scenario> = {}): Scenario {
  return {
    pr: basePullRequest({
      number: n,
      state: 'closed',
      merged: true,
      merged_at: MERGED_AT,
      merge_commit_sha: mergeSha(n),
      head: { sha: sha(n) },
      changed_files: files.length,
      body,
    }),
    files: files.map((filename) => ({ filename, status: 'modified' })),
    ...extra,
  };
}

// A CI run at the head that uploaded a JUnit report of these cases as artifact n * 100.
function junitRun(n: number, cases: ('pass' | 'fail')[]): Partial<Scenario> {
  return {
    workflowRuns: [
      {
        id: n * 10,
        check_suite_id: n * 10 + 1,
        run_attempt: 1,
        event: 'pull_request',
        path: JUNIT.workflow,
        head_sha: sha(n),
      },
    ],
    jobs: { [n * 10]: ['test'] },
    artifacts: { [n * 10]: [{ id: n * 100, name: JUNIT.artifact, expired: false }] },
    zips: { [n * 100]: makeZip({ [JUNIT.path]: junitXml(cases) }) },
  };
}

const listed = (
  n: number,
  scenario: Scenario | undefined,
  rest: Partial<ListedFixture> = {},
): ListedFixture => ({
  number: n,
  createdAt: createdAt(n),
  author: AGENT,
  merged: true,
  ...(scenario === undefined ? {} : { scenario }),
  ...rest,
});

const done = (block: Record<string, unknown>) => `Done.\n\n${fence(block)}\n`;

export function surveyWorld(): SurveyWorld {
  return {
    pullRequests: [
      // Passing: head, two files, merged at. 4 supported (T1, T2 x2, T7).
      listed(
        113,
        pull(
          113,
          done({
            headCommit: sha(113),
            filesChanged: ['src/a.ts', 'src/b.ts'],
            mergedAt: MERGED_AT,
          }),
          ['src/a.ts', 'src/b.ts'],
        ),
      ),
      // Opened by someone else: listed, never selected under --author agent-bot, never read.
      listed(112, pull(112, done({ headCommit: sha(112), filesChanged: [] }), []), {
        author: 'human-dev',
      }),
      // Passing with tests and checks: a JUnit record of 3 cases, two check runs that succeeded.
      // 6 supported (T1, T2, T3, T4, T5, T6).
      listed(
        111,
        pull(
          111,
          done({
            headCommit: sha(111),
            filesChanged: ['src/a.ts'],
            tests: [{ command: 'pnpm test', count: 3, failures: 0, record: JUNIT }],
            checks: { total: 2, allSucceeded: true },
          }),
          ['src/a.ts'],
          {
            ...junitRun(111, ['pass', 'pass', 'pass']),
            checkRuns: [
              { id: 1111, name: 'lint', status: 'completed', conclusion: 'success' },
              { id: 1112, name: 'test', status: 'completed', conclusion: 'success' },
            ],
          },
        ),
      ),
      // A planted wrong file: declares src/x.ts, which it did not change, and leaves out src/b.ts,
      // which it did. 2 supported (T1, T2 src/a.ts), 2 contradicted (T2 x2).
      listed(
        110,
        pull(110, done({ headCommit: sha(110), filesChanged: ['src/a.ts', 'src/x.ts'] }), [
          'src/a.ts',
          'src/b.ts',
        ]),
      ),
      // A planted wrong count: declares 5 tests, the JUnit record holds 4 (1 failure, as declared).
      // 3 supported (T1, T2, T4), 1 contradicted (T3).
      listed(
        109,
        pull(
          109,
          done({
            headCommit: sha(109),
            filesChanged: ['src/a.ts'],
            tests: [{ command: 'pnpm test', count: 5, failures: 1, record: JUNIT }],
          }),
          ['src/a.ts'],
          junitRun(109, ['pass', 'pass', 'fail', 'pass']),
        ),
      ),
      // Tests with no record: a JUnit record no CI run uploaded, and a local run. 2 supported
      // (T1, T2), 3 not record-checkable (T3 and T4 record_not_found, T3
      // no_comparable_record_field).
      listed(
        108,
        pull(
          108,
          done({
            headCommit: sha(108),
            filesChanged: ['src/a.ts'],
            tests: [
              { command: 'pnpm test', count: 3, failures: 0, record: JUNIT },
              { command: 'pnpm test:local', count: 7, record: { kind: 'local' } },
            ],
          }),
          ['src/a.ts'],
          { workflowRuns: [] },
        ),
      ),
      // An artifact read that answers 401, as GitHub answers an anonymous reader. 2 supported (T1,
      // T2), 2 unverifiable (T3 and T4 source_unreadable:artifact).
      listed(
        107,
        pull(
          107,
          done({
            headCommit: sha(107),
            filesChanged: ['src/a.ts'],
            tests: [{ command: 'pnpm test', count: 2, failures: 0, record: JUNIT }],
          }),
          ['src/a.ts'],
          junitRun(107, ['pass', 'pass']),
        ),
      ),
      // Prose only, twice: block_missing, no claim rows. The advisory reader reads them.
      listed(
        106,
        pull(106, 'Updated src/a.ts and src/b.ts to handle the empty case. Closes #5.', [
          'src/a.ts',
          'src/b.ts',
        ]),
      ),
      listed(
        105,
        // src/d.ts is a file at the head and not among the changed files: a possible
        // disagreement, unverified.
        pull(105, 'I changed src/c.ts and src/d.ts. All tests pass.', ['src/c.ts'], {
          objects: { [`${sha(105)}:src/d.ts`]: { __typename: 'Blob' } },
        }),
      ),
      // An invalid block: block_invalid, no claim rows.
      listed(
        104,
        pull(104, `Done.\n\n${fence({ headCommit: 'not-a-commit', filesChanged: [] })}\n`, []),
      ),
      // A pull request every read of which answers 404: no record, pull_request_unreadable.
      listed(103, undefined),
      // A reference and checks still running. 3 supported (T1, T2, R), 1 unverifiable (T6
      // checks_incomplete).
      listed(
        102,
        pull(
          102,
          done({
            headCommit: sha(102),
            filesChanged: ['src/a.ts'],
            references: [{ issue: '#3', relation: 'cites' }],
            checks: { allSucceeded: true },
          }),
          ['src/a.ts'],
          {
            checkRuns: [{ id: 1021, name: 'test', status: 'in_progress', conclusion: null }],
          },
        ),
      ),
      // Rate-limited past waiting: no record, rate_limited.
      listed(101, undefined, { rateLimited: true }),
      // Two blocks: block_ambiguous, no claim rows.
      listed(
        100,
        pull(
          100,
          `Done.\n\n${fence({ headCommit: sha(100), filesChanged: [] })}\n\n${fence({ headCommit: sha(100), filesChanged: [] })}\n`,
          [],
        ),
      ),
    ],
    shared: { issues: { [`${REPO}#3`]: 200, [`${REPO}#5`]: 200 } },
    anonymousArtifacts: [10700],
  };
}

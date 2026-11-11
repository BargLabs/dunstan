// A test record the pull request's own CI wrote (spec 0.1.10, checker 0.1.17). On `pull_request`,
// GitHub runs the workflow file as the pull request has it, so a pull request that changes the
// workflow a `junit` record names can make its CI publish any count it likes. Such a claim is
// `unverifiable` with `record_producer_changed_by_pr`, whatever the counts. The rule reads only the
// changed-file list the checker already reads; where that list is not complete, it cannot show the
// workflow unchanged, and the rows take the list's own reason. Each case runs `dunstan check` end to
// end on the fake GitHub.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  junitXml,
  makeZip,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import type { Block, Claim, JunitRecord } from '../check/types.js';
import { main } from '../cli/main.js';
import { remedyFor } from '../remedy/remedies.js';

const WORKFLOW = '.github/workflows/ci.yml';
const JOB = 'Test';
const RECORD: JunitRecord = {
  kind: 'junit',
  workflow: WORKFLOW,
  job: JOB,
  artifact: 'dunstan-junit',
  path: 'junit.xml',
};
const RUN_ID = 802;
const ARTIFACT_ID = 9802;
const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee01';
// The record the run uploaded: 142 executed, 0 failed.
const PASSING = junitXml(Array<'pass'>(142).fill('pass'));

type FileEntry = { filename: string; status: string; previous_filename?: string };

const SOURCE: FileEntry[] = [
  { filename: 'src/a.ts', status: 'modified' },
  { filename: 'src/b.ts', status: 'added' },
];

function scenario(
  files: FileEntry[],
  tests: Block['tests'],
  changedFiles = files.length,
): Scenario {
  const block: Block = {
    dunstan: '0.1',
    headCommit: HEAD,
    // Every listed path is declared, so the scope rows pass and only the tests rows are in question.
    filesChanged: files.map((f) => f.filename),
    ...(tests === undefined ? {} : { tests }),
  };
  return {
    pr: basePullRequest({
      head: { sha: HEAD },
      changed_files: changedFiles,
      body: `142 tests passed.\n\n\`\`\`dunstan-handback\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`,
    }),
    files,
    workflowRuns: [
      {
        id: RUN_ID,
        check_suite_id: 8020,
        run_attempt: 1,
        name: 'CI',
        event: 'pull_request',
        status: 'completed',
        path: WORKFLOW,
        head_sha: HEAD,
      },
    ],
    jobs: { [RUN_ID]: [JOB] },
    artifacts: { [RUN_ID]: [{ id: ARTIFACT_ID, name: 'dunstan-junit', expired: false }] },
    zips: { [ARTIFACT_ID]: makeZip({ 'junit.xml': PASSING }) },
    artifactNeedsToken: true,
  };
}

const ciTests = (count: number, failures?: number): Block['tests'] => [
  { command: 'pnpm test', count, ...(failures === undefined ? {} : { failures }), record: RECORD },
];

async function check(s: Scenario) {
  const file = join(mkdtempSync(join(tmpdir(), 'dunstan-producer-')), 'record.json');
  let out = '';
  const fake = fakeGitHub(s);
  const code = await main(
    ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', file],
    {
      out: (t) => {
        out += t;
      },
      err: () => {},
      env: { GITHUB_TOKEN: 'test-token' },
      artifact: import.meta.url,
      fetch: fake.fetch,
      readStdin: () => new Uint8Array(),
    },
  );
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const claims = record.predicate.claims as Claim[];
  const tests = claims
    .filter((c) => c.field.startsWith('/tests/'))
    .map((c) => [c.id, c.verdict, c.reason]);
  return { code, out, record, claims, tests, file, requests: fake.requests };
}

const PRODUCER_CHANGED = [
  ['count:/tests/0/count', 'unverifiable', 'record_producer_changed_by_pr'],
  ['count:/tests/0/failures', 'unverifiable', 'record_producer_changed_by_pr'],
];

describe('1. the pull request changes the workflow its record names', () => {
  it('is unverifiable with record_producer_changed_by_pr, although the counts match', async () => {
    const r = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(142, 0)),
    );
    expect(r.tests).toEqual(PRODUCER_CHANGED);
    expect(r.record.predicate.verdict).toBe('unverifiable');
    // Every other row passes: the producer rule touches only the tests rows.
    expect(r.claims.filter((c) => !c.field.startsWith('/tests/')).map((c) => c.verdict)).toEqual(
      Array(r.claims.length - 2).fill('pass'),
    );
    expect(r.code).toBe(2);
  });

  it('is never a fail: a count the record contradicts is unverifiable too', async () => {
    const r = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(9999, 7)),
    );
    expect(r.tests).toEqual(PRODUCER_CHANGED);
    expect(r.record.predicate.verdict).toBe('unverifiable');
  });

  it('gives one row when failures is not declared', async () => {
    const r = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(142)),
    );
    expect(r.tests).toEqual([PRODUCER_CHANGED[0]]);
  });

  it('prints the remedy under each row', async () => {
    const r = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(142, 0)),
    );
    const lines = r.out.split('\n');
    for (const id of ['count:/tests/0/count', 'count:/tests/0/failures']) {
      const claim = r.claims.find((c) => c.id === id) as Claim;
      const line = remedyFor(claim, { hasToken: true, caller: 'cli' });
      expect(line).toBe(
        'This pull request changes the workflow that produced the test record, so the record is its own evidence. Land the workflow change separately, then declare the counts.',
      );
      expect(lines[lines.findIndex((l) => l.includes(id)) + 1]).toBe(`  remedy: ${line}`);
    }
  });

  it('adds no read: the evidence is what it would be with the workflow unchanged', async () => {
    const changed = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(142, 0)),
    );
    const unchanged = await check(
      scenario([...SOURCE, { filename: 'docs/ci.md', status: 'modified' }], ciTests(142, 0)),
    );
    const paths = (q: string[]) => q.map((x) => x.replace(/\?.*$/, ''));
    expect(paths(changed.requests)).toEqual(paths(unchanged.requests));
    expect(changed.record.predicate.evidence.testRecords).toEqual(
      unchanged.record.predicate.evidence.testRecords,
    );
  });

  it('writes a record that verifies offline', async () => {
    const r = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(142, 0)),
    );
    let out = '';
    const code = await main(['verify', r.file], {
      out: (t) => {
        out += t;
      },
      err: () => {},
      env: {},
      artifact: import.meta.url,
      fetch: fakeGitHub(scenario(SOURCE, undefined)).fetch,
      readStdin: () => new Uint8Array(),
    });
    expect(out).toMatch(/^verified: /);
    expect(code).toBe(0);
  });
});

describe('2. the pull request renames a workflow into that path', () => {
  it('is unverifiable with record_producer_changed_by_pr', async () => {
    const r = await check(
      scenario(
        [
          ...SOURCE,
          {
            filename: WORKFLOW,
            status: 'renamed',
            previous_filename: '.github/workflows/old-ci.yml',
          },
        ],
        ciTests(142, 0),
      ),
    );
    expect(r.tests).toEqual(PRODUCER_CHANGED);
    expect(r.record.predicate.verdict).toBe('unverifiable');
  });

  it('and the same when it renames the workflow away from that path', async () => {
    const r = await check(
      scenario(
        [
          ...SOURCE,
          {
            filename: '.github/workflows/renamed.yml',
            status: 'renamed',
            previous_filename: WORKFLOW,
          },
        ],
        ciTests(142, 0),
      ),
    );
    expect(r.tests).toEqual(PRODUCER_CHANGED);
  });
});

describe('3. the workflow unchanged: decided as before', () => {
  const other: FileEntry[] = [
    ...SOURCE,
    // Another workflow, and a path that only starts with the record's: neither is the producer.
    { filename: '.github/workflows/lint.yml', status: 'modified' },
    { filename: `${WORKFLOW}.bak`, status: 'added' },
  ];

  it('passes on a match', async () => {
    const r = await check(scenario(other, ciTests(142, 0)));
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'pass', undefined],
      ['count:/tests/0/failures', 'pass', undefined],
    ]);
    expect(r.record.predicate.verdict).toBe('pass');
    expect(r.code).toBe(0);
  });

  it('fails on a mismatch', async () => {
    const r = await check(scenario(other, ciTests(143, 0)));
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'fail', 'count_mismatch'],
      ['count:/tests/0/failures', 'pass', undefined],
    ]);
    expect(r.record.predicate.verdict).toBe('fail');
  });
});

describe('4. a changed-file list that cannot show the workflow unchanged', () => {
  it('incomplete: unverifiable with file_list_truncated', async () => {
    // GitHub counts three changed files and lists two.
    const r = await check(scenario(SOURCE, ciTests(142, 0), 3));
    expect(r.record.predicate.evidence.files.complete).toBe(false);
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'unverifiable', 'file_list_truncated'],
      ['count:/tests/0/failures', 'unverifiable', 'file_list_truncated'],
    ]);
    expect(r.record.predicate.verdict).toBe('unverifiable');
  });

  it('incomplete, but the listed part holds the workflow: record_producer_changed_by_pr', async () => {
    const r = await check(
      scenario([...SOURCE, { filename: WORKFLOW, status: 'modified' }], ciTests(142, 0), 4),
    );
    expect(r.record.predicate.evidence.files.complete).toBe(false);
    expect(r.tests).toEqual(PRODUCER_CHANGED);
  });

  it('unreadable: unverifiable with source_unreadable:pull_request_files', async () => {
    const s = scenario(SOURCE, ciTests(142, 0));
    s.flaky = { [`/repos/${REPO}/pulls/7/files`]: [422] };
    const r = await check(s);
    expect(r.record.predicate.evidence.files.status).toBe('unreadable');
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'unverifiable', 'source_unreadable:pull_request_files'],
      ['count:/tests/0/failures', 'unverifiable', 'source_unreadable:pull_request_files'],
    ]);
  });
});

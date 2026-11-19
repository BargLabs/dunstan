// The baseline (DRAFT 0.2.0, spec D.13): with base tests on, each declared junit record's counts,
// with skipped test cases, at the pull request's base commit and at the head. Off, the evidence and
// every request are as before. The record that holds a baseline is a DRAFT record, verifies offline,
// and its verdict and claims are those of the same evidence without it.

import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  junitXml,
  makeZip,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import type { Block, Evidence } from '../check/types.js';
import { contextFlags, contextText } from '../cli/context.js';
import { buildRecord, type DunstanRecord, recordBlock } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';
import { DRAFT_PREDICATE_TYPE, PREDICATE_TYPE } from '../spec/constants.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { readEvidence, readPullRequest } from './github.js';
import { GitHubClient } from './http.js';
import { countJunitWithSkipped } from './junit.js';

const BASE = 'ba5e000000000000000000000000000000000001';
const JUNIT = {
  kind: 'junit',
  workflow: '.github/workflows/ci.yml',
  job: 'test',
  artifact: 'junit-report',
  path: 'reports/junit.xml',
} as const;
const BLOCK: Block = {
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: ['src/a.ts'],
  tests: [{ command: 'pnpm test', count: 2, failures: 0, record: JUNIT }],
};

function run(id: number, sha: string, event: string) {
  return {
    id,
    check_suite_id: id * 10,
    run_attempt: 1,
    event,
    path: JUNIT.workflow,
    head_sha: sha,
  };
}

// The head's run skips two of five cases; the base's, at BASE, executes all five.
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    pr: basePullRequest({
      changed_files: 1,
      base: { ref: 'main', sha: BASE, repo: { full_name: REPO } },
    }),
    files: [{ filename: 'src/a.ts', status: 'modified' }],
    workflowRuns: [run(601, HEAD, 'pull_request'), run(602, BASE, 'push')],
    jobs: { 601: ['test'], 602: ['test'] },
    artifacts: {
      601: [{ id: 9601, name: 'junit-report', expired: false }],
      602: [{ id: 9602, name: 'junit-report', expired: false }],
    },
    zips: {
      9601: makeZip({ 'reports/junit.xml': junitXml(['pass', 'pass', 'pass', 'skip', 'skip']) }),
      9602: makeZip({ 'reports/junit.xml': junitXml(['pass', 'pass', 'pass', 'pass', 'pass']) }),
    },
    ...overrides,
  };
}

async function read(s: Scenario, baseTests: boolean) {
  const fake = fakeGitHub(s);
  const client = new GitHubClient({
    token: 't',
    fetch: fake.fetch,
    sleep: async () => {},
    now: () => new Date('2026-11-17T12:00:00Z'),
    warn: () => {},
  });
  const pr = await readPullRequest(client, REPO, 7);
  const evidence = await readEvidence(client, {
    repository: pr.repository,
    pullRequest: pr,
    block: BLOCK,
    ...(baseTests ? { baseTests: true } : {}),
  });
  return { evidence, requests: fake.requests };
}

function record(evidence: Evidence): DunstanRecord {
  return buildRecord({
    checker: { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: '0'.repeat(64) } },
    report: { sha256: '1'.repeat(64), source: { kind: 'stdin', locator: '-' } },
    block: recordBlock(
      extractHandbackBlock(`\`\`\`dunstan-handback
${JSON.stringify(BLOCK)}
\`\`\`
`),
    ),
    repository: REPO,
    evidence,
    rerun: { offline: 'dunstan verify r.json', online: 'dunstan rerun r.json' },
  });
}

describe('countJunitWithSkipped', () => {
  it('counts skipped test cases beside the executed and failed ones', () => {
    expect(countJunitWithSkipped(junitXml(['pass', 'fail', 'error', 'skip', 'pass']))).toEqual({
      executed: 4,
      skipped: 1,
      failed: 2,
    });
  });
});

describe('readEvidence with base tests', () => {
  it('off: no baseline, no read at the base, and the 0.1 test record as before', async () => {
    const { evidence, requests } = await read(scenario(), false);
    expect(evidence.baseline).toBeUndefined();
    expect(requests.some((q) => q.includes(BASE))).toBe(false);
    expect(evidence.testRecords).toEqual([
      {
        record: JUNIT,
        status: 'ok',
        runs: [{ runId: 601, runAttempt: 1, executed: 3, failed: 0 }],
      },
    ]);
  });

  it('on: reads the base commit by the same rule, and keeps skipped out of the 0.1 section', async () => {
    const off = await read(scenario(), false);
    const on = await read(scenario(), true);
    expect(on.evidence.testRecords).toEqual(off.evidence.testRecords);
    expect(on.evidence.baseline).toEqual({
      baseSha: BASE,
      testRecords: [
        {
          record: JUNIT,
          head: {
            status: 'ok',
            runs: [{ runId: 601, runAttempt: 1, executed: 3, skipped: 2, failed: 0 }],
          },
          base: {
            status: 'ok',
            runs: [{ runId: 602, runAttempt: 1, executed: 5, skipped: 0, failed: 0 }],
          },
        },
      ],
    });
    // The head is read once, as without a baseline.
    const headListings = (q: string[]) => q.filter((x) => x.includes(`head_sha=${HEAD}`)).length;
    expect(headListings(on.requests)).toBe(headListings(off.requests));
    expect(on.requests.some((q) => q.includes(`head_sha=${BASE}`))).toBe(true);
  });

  it('on: a base with no run of the workflow has no candidate run', async () => {
    const { evidence } = await read(
      scenario({ workflowRuns: [run(601, HEAD, 'pull_request')] }),
      true,
    );
    expect(evidence.baseline?.testRecords[0]?.base).toEqual({ status: 'ok', runs: [] });
  });

  it('on: a pull request read that gives no base sha leaves the base unpopulated', async () => {
    const { evidence } = await read(scenario({ pr: basePullRequest({ changed_files: 1 }) }), true);
    expect(evidence.baseline?.baseSha).toBeNull();
    expect(evidence.baseline?.testRecords[0]?.base).toEqual({
      status: 'unpopulated',
      field: 'base.sha',
    });
  });
});

describe('a record with a baseline', () => {
  it('is DRAFT 0.2.0, verifies offline, and has the claims and verdict of the record without it', async () => {
    const off = record((await read(scenario(), false)).evidence);
    const on = record((await read(scenario(), true)).evidence);
    expect(off.predicateType).toBe(PREDICATE_TYPE);
    expect(on.predicateType).toBe(DRAFT_PREDICATE_TYPE);
    expect(on.predicate.spec).toBe('0.2.0-draft');
    expect(on.predicate.claims).toEqual(off.predicate.claims);
    expect(on.predicate.verdict).toBe(off.predicate.verdict);
    expect(on.predicate.digests.claims).toBe(off.predicate.digests.claims);
    expect(verifyRecord(JSON.parse(JSON.stringify(on))).problems).toEqual([]);
  });

  it('prints the counts and the rise in skipped and fall in executed tests as context', async () => {
    const on = record((await read(scenario(), true)).evidence);
    expect(contextFlags(on).map(contextText)).toEqual([
      'tests in .github/workflows/ci.yml / test: at base ba5e00000000, 5 executed, 0 skipped, 0 failed; at head, 3 executed, 2 skipped, 0 failed',
      'skipped tests rose from 0 at base to 2 at head in .github/workflows/ci.yml / test',
      'executed tests fell from 5 at base to 3 at head in .github/workflows/ci.yml / test',
    ]);
  });

  it('says why a side settles no counts, and compares nothing then', async () => {
    const none = record(
      (await read(scenario({ workflowRuns: [run(601, HEAD, 'pull_request')] }), true)).evidence,
    );
    expect(contextFlags(none).map(contextText)).toEqual([
      'tests in .github/workflows/ci.yml / test: at base ba5e00000000, none settled (record_not_found); at head, 3 executed, 2 skipped, 0 failed',
    ]);
    const two = await read(
      scenario({
        workflowRuns: [
          run(601, HEAD, 'pull_request'),
          run(602, BASE, 'push'),
          run(603, BASE, 'push'),
        ],
        jobs: { 601: ['test'], 602: ['test'], 603: ['test'] },
        artifacts: {
          601: [{ id: 9601, name: 'junit-report', expired: false }],
          602: [{ id: 9602, name: 'junit-report', expired: false }],
          603: [{ id: 9603, name: 'junit-report', expired: false }],
        },
        zips: {
          9601: makeZip({ 'reports/junit.xml': junitXml(['pass', 'skip']) }),
          9602: makeZip({ 'reports/junit.xml': junitXml(['pass', 'pass']) }),
          9603: makeZip({ 'reports/junit.xml': junitXml(['pass']) }),
        },
      }),
      true,
    );
    expect(contextFlags(record(two.evidence)).map(contextText)).toEqual([
      'tests in .github/workflows/ci.yml / test: at base ba5e00000000, none settled (record_ambiguous); at head, 1 executed, 1 skipped, 0 failed',
    ]);
  });
});

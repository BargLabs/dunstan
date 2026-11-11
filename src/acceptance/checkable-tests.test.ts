// Test claims a reader can check (spec 0.1.9, checker 0.1.14). One fixture repository, on the fake
// GitHub, whose CI run at the head uploaded `dunstan-junit/junit.xml` with 142 executed and 0
// failed test cases. Each case runs the command line end to end: `dunstan check` reads the record
// the block names, `dunstan template --tests-ci` reads the same record to declare the counts, and
// `dunstan junit-merge` writes the file a several-file reporter's record holds.

import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  junitXml,
  makeZip,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { featureRepository, isolateGit } from '../__tests__/git-repo.js';
import type { Block, Claim, JunitRecord } from '../check/types.js';
import { main } from '../cli/main.js';
import { remedyFor } from '../remedy/remedies.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { loadCases, runCase } from './fixtures.js';

isolateGit();

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW = '.github/workflows/ci.yml';
const JOB = 'Test';
const RECORD: JunitRecord = {
  kind: 'junit',
  workflow: WORKFLOW,
  job: JOB,
  artifact: 'dunstan-junit',
  path: 'junit.xml',
};
const RUN_ID = 801;
const ARTIFACT_ID = 9801;
const PASSING = junitXml(Array<'pass'>(142).fill('pass'));

interface Ci {
  // Whether the run uploaded the artifact; true unless given.
  uploaded?: boolean;
  // The JUnit file inside it.
  xml?: string;
  // The run's status as the listing gives it.
  status?: string;
}

function scenario(head: string, block: Block | null, ci: Ci = {}): Scenario {
  const report =
    block === null
      ? 'no block yet'
      : `142 tests passed.\n\n\`\`\`dunstan-handback\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
  return {
    pr: basePullRequest({ head: { sha: head }, body: report }),
    files: [
      { filename: 'src/a.ts', status: 'modified' },
      { filename: 'src/b.ts', status: 'added' },
    ],
    workflowRuns: [
      {
        id: RUN_ID,
        check_suite_id: 8010,
        run_attempt: 1,
        name: 'CI',
        event: 'pull_request',
        status: ci.status ?? 'completed',
        path: WORKFLOW,
        head_sha: head,
      },
    ],
    jobs: { [RUN_ID]: [JOB] },
    artifacts: {
      [RUN_ID]:
        ci.uploaded === false ? [] : [{ id: ARTIFACT_ID, name: 'dunstan-junit', expired: false }],
    },
    zips: { [ARTIFACT_ID]: makeZip({ 'junit.xml': ci.xml ?? PASSING }) },
    // As GitHub does: an artifact download needs a token, even on a public repository.
    artifactNeedsToken: true,
  };
}

const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';

const blockWith = (tests: Block['tests'], head = HEAD): Block => ({
  dunstan: '0.1',
  headCommit: head,
  filesChanged: ['src/a.ts', 'src/b.ts'],
  ...(tests === undefined ? {} : { tests }),
});

const ciTests = (count: number, failures: number, record: JunitRecord = RECORD): Block['tests'] => [
  { command: 'pnpm test', count, failures, record },
];

async function run(
  argv: string[],
  s: Scenario,
  { token = true, cwd }: { token?: boolean; cwd?: string } = {},
) {
  let out = '';
  let err = '';
  const fake = fakeGitHub(s);
  const code = await main(argv, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env: token ? { GITHUB_TOKEN: 'test-token' } : {},
    artifact: import.meta.url,
    fetch: fake.fetch,
    readStdin: () => new Uint8Array(),
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { code, out, err, requests: fake.requests };
}

async function check(s: Scenario, options: { token?: boolean } = {}) {
  const out = join(mkdtempSync(join(tmpdir(), 'dunstan-tests-')), 'record.json');
  const r = await run(
    ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out],
    s,
    options,
  );
  const record = JSON.parse(readFileSync(out, 'utf8'));
  const claims = record.predicate.claims as Claim[];
  const tests = claims
    .filter((c) => c.field.startsWith('/tests/'))
    .map((c) => [c.id, c.verdict, c.reason]);
  return { ...r, record, claims, tests, file: out };
}

// The block a template printed, which must be found and valid.
function blockIn(text: string): Block {
  const found = extractHandbackBlock(text);
  if (found.status !== 'found') throw new Error(`no block: ${found.status}`);
  return found.value as unknown as Block;
}

// The remedy line the claims table prints under a row.
const remedyLine = (claim: Claim, hasToken: boolean) =>
  `  remedy: ${remedyFor(claim, { hasToken, caller: 'cli' })}`;

describe('1. "142 tests passed", declared against the CI record', () => {
  it('passes both rows', async () => {
    const r = await check(scenario(HEAD, blockWith(ciTests(142, 0))));
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'pass', undefined],
      ['count:/tests/0/failures', 'pass', undefined],
    ]);
    expect(r.record.predicate.verdict).toBe('pass');
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/remedy:/);
  });
});

describe('2. a count one more than the record', () => {
  it('fails with count_mismatch', async () => {
    const r = await check(scenario(HEAD, blockWith(ciTests(143, 0))));
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'fail', 'count_mismatch'],
      ['count:/tests/0/failures', 'pass', undefined],
    ]);
    expect(r.claims.find((c) => c.id === 'count:/tests/0/count')?.observed).toBe(142);
    expect(r.code).toBe(1);
    // A fail is a fact about the work, not a missing record: no remedy line.
    expect(r.out).not.toMatch(/remedy:/);
  });
});

describe('3. no run uploaded the artifact', () => {
  it('is unverifiable with record_not_found, and prints the remedy under each row', async () => {
    const r = await check(scenario(HEAD, blockWith(ciTests(142, 0)), { uploaded: false }));
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'unverifiable', 'record_not_found'],
      ['count:/tests/0/failures', 'unverifiable', 'record_not_found'],
    ]);
    const row = r.claims.find((c) => c.id === 'count:/tests/0/count') as Claim;
    expect(remedyFor(row, { hasToken: true, caller: 'cli' })).toMatch(/docs\/ci-test-records\.md/);
    const lines = r.out.split('\n');
    for (const id of ['count:/tests/0/count', 'count:/tests/0/failures']) {
      const at = lines.findIndex((l) => l.includes(id));
      expect(lines[at + 1]).toBe(remedyLine(r.claims.find((c) => c.id === id) as Claim, true));
    }
    expect(r.code).toBe(2);
  });
});

describe('4. a local test record', () => {
  it('is unverifiable with local_run_not_in_record, reads no workflow, and prints the remedy', async () => {
    const r = await check(
      scenario(
        HEAD,
        blockWith([{ command: 'pnpm test', count: 142, failures: 0, record: { kind: 'local' } }]),
      ),
    );
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'unverifiable', 'local_run_not_in_record'],
      ['count:/tests/0/failures', 'unverifiable', 'local_run_not_in_record'],
    ]);
    expect(r.requests.filter((q) => q.includes('/actions/'))).toEqual([]);
    expect(r.record.predicate.evidence.testRecords).toBeUndefined();
    const row = r.claims.find((c) => c.id === 'count:/tests/0/count') as Claim;
    expect(remedyFor(row, { hasToken: true, caller: 'cli' })).toMatch(/--tests-ci/);
    expect(r.out).toContain(remedyLine(row, true));
    expect(r.code).toBe(2);
  });

  it('keeps no_comparable_record_field for every other kind that is not junit', async () => {
    const r = await check(
      scenario(
        HEAD,
        blockWith([{ command: 'pytest', count: 142, record: { kind: 'tap', file: 'x' } }]),
      ),
    );
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'unverifiable', 'no_comparable_record_field'],
    ]);
    expect(r.out).toContain(
      remedyLine(r.claims.find((c) => c.id === 'count:/tests/0/count') as Claim, true),
    );
  });
});

describe('5. dunstan template --tests-ci', () => {
  const ORIGIN = `https://github.com/${REPO}.git`;
  const flags = [
    '--tests-ci',
    '--tests-command',
    'pnpm test',
    '--tests-workflow',
    WORKFLOW,
    '--tests-job',
    JOB,
  ];

  it('declares exactly the counts check then reads, and check passes', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const t = await run(['template', ...flags], scenario(head, null), { cwd: dir });
    expect(t.code).toBe(0);
    const found = extractHandbackBlock(t.out);
    expect(found.status).toBe('found');
    const block = blockIn(t.out);
    expect(block.headCommit).toBe(head);
    expect(block.tests).toEqual(ciTests(142, 0));
    expect(t.err).toMatch(
      /tests: 142 executed and 0 failed in junit\.xml in the artifact dunstan-junit of job Test in \.github\/workflows\/ci\.yml at /,
    );

    const c = await check(scenario(head, block));
    expect(c.tests).toEqual([
      ['count:/tests/0/count', 'pass', undefined],
      ['count:/tests/0/failures', 'pass', undefined],
    ]);
    expect(c.record.predicate.verdict).toBe('pass');
  });

  it('reads the record check reads: the same requests, with the token', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const t = await run(['template', ...flags], scenario(head, null), { cwd: dir });
    const c = await check(scenario(head, blockWith(ciTests(142, 0), head)));
    const reads = (q: string[]) => q.filter((x) => x.includes('/actions/'));
    expect(reads(t.requests)).toEqual(reads(c.requests));
    expect(reads(t.requests).length).toBeGreaterThan(0);
  });

  it('prints no tests, with the note and its remedy, when no run uploaded the record (exit 2)', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const t = await run(['template', ...flags], scenario(head, null, { uploaded: false }), {
      cwd: dir,
    });
    expect(t.code).toBe(2);
    const block = blockIn(t.out);
    expect(block.headCommit).toBe(head);
    expect(block.tests).toBeUndefined();
    expect(t.err).toMatch(
      /tests are not declared: no run of \.github\/workflows\/ci\.yml at .* uploaded the artifact dunstan-junit .*\(record_not_found\)/,
    );
    expect(t.err).toMatch(/remedy: .*docs\/ci-test-records\.md/);
  });

  it('says CI has not finished when the run is still in progress', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const t = await run(
      ['template', ...flags],
      scenario(head, null, { uploaded: false, status: 'in_progress' }),
      { cwd: dir },
    );
    expect(t.code).toBe(2);
    expect(blockIn(t.out).tests).toBeUndefined();
    expect(t.err).toMatch(/CI has not finished/);
  });

  it('reads nothing and declares no tests without a token', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const t = await run(['template', ...flags], scenario(head, null), { cwd: dir, token: false });
    expect(t.code).toBe(2);
    expect(t.requests).toEqual([]);
    expect(blockIn(t.out).tests).toBeUndefined();
    expect(t.err).toMatch(/GITHUB_TOKEN is not set/);
  });

  it('reads nothing and declares no tests when HEAD is not pushed', async () => {
    const { dir, head } = featureRepository(ORIGIN, { pushed: false });
    const t = await run(['template', ...flags], scenario(head, null), { cwd: dir });
    expect(t.code).toBe(2);
    expect(t.requests).toEqual([]);
    expect(t.err).toMatch(/HEAD .* is not on any remote-tracking branch/);
  });

  it('declares no tests when the runs disagree, or the artifact cannot be read', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const s = scenario(head, null);
    s.zips = {};
    const t = await run(['template', ...flags], s, { cwd: dir });
    expect(t.code).toBe(2);
    expect(t.err).toMatch(/\(source_unreadable:artifact\)/);
  });

  it('takes --repo over origin, and refuses an origin that is not github.com', async () => {
    const { dir, head } = featureRepository(
      'https://gitlab.example.com/example-org/example-repo.git',
    );
    const refused = await run(['template', ...flags], scenario(head, null), { cwd: dir });
    expect(refused.code).toBe(3);
    expect(refused.out).toBe('');
    expect(refused.err).toMatch(
      /origin .*gitlab\.example\.com.* is not a github\.com repository: pass --repo <owner\/name>/,
    );
    const given = await run(['template', ...flags, '--repo', REPO], scenario(head, null), {
      cwd: dir,
    });
    expect(given.code).toBe(0);
    expect(blockIn(given.out).tests).toEqual(ciTests(142, 0));
  });

  it('reads an ssh origin as its github.com repository', async () => {
    const { dir, head } = featureRepository(`git@github.com:${REPO}.git`);
    const t = await run(['template', ...flags], scenario(head, null), { cwd: dir });
    expect(t.code).toBe(0);
  });
});

describe('6. an artifact download read anonymously', () => {
  it('is unverifiable with source_unreadable:artifact, and the remedy names the token', async () => {
    const r = await check(scenario(HEAD, blockWith(ciTests(142, 0))), { token: false });
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'unverifiable', 'source_unreadable:artifact'],
      ['count:/tests/0/failures', 'unverifiable', 'source_unreadable:artifact'],
    ]);
    expect(
      r.record.predicate.evidence.sources.find((s: { kind: string }) => s.kind === 'artifact')
        .error,
    ).toBe('http_401');
    const row = r.claims.find((c) => c.id === 'count:/tests/0/count') as Claim;
    expect(remedyFor(row, { hasToken: false, caller: 'cli' })).toMatch(/GITHUB_TOKEN/);
    expect(remedyFor(row, { hasToken: false, caller: 'cli' })).not.toBe(
      remedyFor(row, { hasToken: true, caller: 'cli' }),
    );
    expect(r.out).toContain(remedyLine(row, false));
  });

  it('with a token, the same artifact is read and the remedy is the other wording', async () => {
    const s = scenario(HEAD, blockWith(ciTests(142, 0)));
    s.zips = {};
    const r = await check(s);
    const row = r.claims.find((c) => c.id === 'count:/tests/0/count') as Claim;
    expect(row.reason).toBe('source_unreadable:artifact');
    expect(r.out).toContain(remedyLine(row, true));
    expect(r.out).not.toContain(remedyLine(row, false));
  });
});

describe('7. junit-merge of Surefire and Gradle files', () => {
  it('writes one file whose counts are the sum, and it settles a block to pass', async () => {
    const samples = join(ROOT, 'test/junit-reporters');
    const inputs = [
      'maven-surefire/target/surefire-reports',
      'gradle/build/test-results/test',
    ].flatMap((d) =>
      readdirSync(join(samples, d))
        .filter((f) => f.endsWith('.xml'))
        .map((f) => join(samples, d, f)),
    );
    expect(inputs).toHaveLength(4);
    const out = join(mkdtempSync(join(tmpdir(), 'dunstan-merge-')), 'junit.xml');
    const merged = await run(['junit-merge', ...inputs, '--out', out], scenario(HEAD, null));
    expect(merged.code).toBe(0);
    expect(merged.err).toMatch(/4 files, 8 test cases executed, 2 failed/);

    const r = await check(
      scenario(HEAD, blockWith(ciTests(8, 2)), { xml: readFileSync(out, 'utf8') }),
    );
    expect(r.tests).toEqual([
      ['count:/tests/0/count', 'pass', undefined],
      ['count:/tests/0/failures', 'pass', undefined],
    ]);
    expect(r.record.predicate.verdict).toBe('pass');
  });
});

describe('8. records', () => {
  it('verify passes on the new example record', async () => {
    const r = await run(
      ['verify', join(ROOT, 'spec/examples/records/unverifiable.local-test-run.json')],
      scenario(HEAD, null),
    );
    expect(r.out).toMatch(/^verified: /);
    expect(r.code).toBe(0);
  });

  it('verify passes on a record check writes for each case above', async () => {
    for (const s of [
      scenario(HEAD, blockWith(ciTests(142, 0))),
      scenario(HEAD, blockWith(ciTests(142, 0)), { uploaded: false }),
      scenario(HEAD, blockWith([{ command: 'x', count: 1, record: { kind: 'local' } }])),
    ]) {
      const c = await check(s);
      const v = await run(['verify', c.file], s);
      expect(v.out).toMatch(/^verified: /);
    }
  });

  it('every acceptance fixture keeps its verdict and rows', () => {
    for (const c of [...loadCases('controls'), ...loadCases('planted')]) {
      const record = runCase(c);
      expect(record.predicate.verdict, c.name).toBe(c.expected.verdict);
      expect(
        record.predicate.claims.map((x) => ({
          id: x.id,
          verdict: x.verdict,
          ...(x.reason === undefined ? {} : { reason: x.reason }),
        })),
        c.name,
      ).toEqual(c.expected.claims);
    }
  });
});

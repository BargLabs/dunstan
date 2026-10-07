// Study 2's tools, on synthetic fixtures only: a fake GitHub for select.mjs, two fake checkers for
// run.mjs, and constructed records, labels and bodies. No test reaches the network: fetch throws.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BASELINE,
  CANDIDATE,
  M1_SEED,
  M1_SIZE,
  PATH_NOTES,
  paths,
  ROOT,
  readJson,
  readJsonl,
  STUDY,
  STUDY1_SELECTION,
  sha256,
  wilson,
  writeJson,
  writeJsonl,
} from './common.mjs';
import { BAR, computeFigures, MissingLabels, REFUTE, writeFigures } from './figures.mjs';
import { checkAll, identityFault, indexAll } from './run.mjs';
import { writeSample } from './sample.mjs';
import {
  AGENTS,
  EXCLUDED_REPOSITORIES,
  HttpError,
  MIN_BODY,
  MIN_STARS,
  QUALIFIERS,
  RESULT_CAP,
  select,
  study1Repositories,
  WANTED,
  WEEKS,
  writeSelection,
} from './select.mjs';
import { buildWorksheet, publishLabels } from './worksheet.mjs';

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('a test reached for the network');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const scratch = () => paths(mkdtempSync(join(tmpdir(), 'study2-')));
const SHA = 'a'.repeat(40);
const longBody = (n) => 'x'.repeat(n);
const prereg = readFileSync(join(STUDY, 'preregistration.md'), 'utf8');

// ---------------------------------------------------------------------------------------------
// A fake GitHub: per week start and agent, an ordered list of search items; per repository, its
// metadata.

function fakeGitHub({ weekItems = {}, repos = {} }) {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith('/search/issues?')) {
      const params = new URLSearchParams(path.slice('/search/issues?'.length));
      const q = params.get('q');
      const agent = AGENTS.find((a) => q.endsWith(a.qualifier));
      const week = q.match(/ merged:(\d{4}-\d{2}-\d{2})\.\./)[1];
      const all = weekItems[week]?.[agent.id] ?? [];
      const page = Number(params.get('page'));
      const per = Number(params.get('per_page'));
      return {
        total_count: all.length,
        incomplete_results: false,
        items: all.slice(0, RESULT_CAP).slice((page - 1) * per, page * per),
      };
    }
    const repo = repos[path.slice('/repos/'.length)];
    if (repo === undefined) throw new HttpError(path, 404, 'Not Found');
    return { private: false, archived: false, fork: false, stargazers_count: 5000, ...repo };
  };
  return { get, calls };
}

let counter = 0;
const item = (repository, body = longBody(MIN_BODY)) => {
  counter++;
  return {
    html_url: `https://github.com/${repository}/pull/${counter}`,
    repository_url: `https://api.github.com/repos/${repository}`,
    number: counter,
    user: { login: 'agent[bot]' },
    created_at: '2026-08-17T00:00:00Z',
    pull_request: { merged_at: '2026-08-18T00:00:00Z' },
    body,
  };
};
const reposOf = (...lists) =>
  Object.fromEntries(lists.flat().map((i) => [i.repository_url.split('/repos/')[1], {}]));
const searches = (calls) =>
  calls
    .filter((c) => c.startsWith('/search/issues?'))
    .map((c) => new URLSearchParams(c.split('?')[1]));

let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 8, 0, 0, tick++)).toISOString();

describe('select.mjs: the selection rule', () => {
  it('takes positions 3 to 19 of amendment 1, the 17 weeks wave 2 never queried', () => {
    expect(WEEKS).toHaveLength(17);
    expect(WEEKS.map((w) => w.position)).toEqual(Array.from({ length: 17 }, (_, i) => i + 3));
    expect(WEEKS.map((w) => w.start)).toEqual([
      '2026-08-17',
      '2026-06-22',
      '2026-08-31',
      '2026-07-06',
      '2026-09-28',
      '2026-08-24',
      '2026-09-07',
      '2026-10-05',
      '2026-09-21',
      '2026-07-20',
      '2026-08-10',
      '2026-06-29',
      '2026-06-08',
      '2026-09-14',
      '2026-08-03',
      '2026-06-15',
      '2026-07-27',
    ]);
    // The two weeks wave 2 queried are not among them.
    const wave2 = readJson(join(ROOT, STUDY1_SELECTION.path)).wave2.weeks.map((w) => w.start);
    expect(wave2).toEqual(['2026-07-13', '2026-06-01']);
    expect(WEEKS.some((w) => wave2.includes(w.start))).toBe(false);
  });

  it('is the week table preregistration.md lists', () => {
    const rows = [...prereg.matchAll(/^\| (\d+) \| (\S+) \| (\S+) \| `([0-9a-f]{64})` \|$/gm)].map(
      (m) => ({ position: Number(m[1]), start: m[2], end: m[3], sha256: m[4] }),
    );
    expect(rows).toEqual(
      WEEKS.map((w) => ({ position: w.position, start: w.start, end: w.end, sha256: w.sha256 })),
    );
  });

  it('queries the weeks in that order, each agent from A, with the week as window', async () => {
    const { get, calls } = fakeGitHub({});
    const { selection } = await select({ get, ruleCommit: SHA, study1: [], now });
    expect(searches(calls).map((p) => p.get('q'))).toEqual(
      WEEKS.flatMap((w) =>
        AGENTS.map((a) => `${QUALIFIERS} merged:${w.start}..${w.end} ${a.qualifier}`),
      ),
    );
    expect(
      searches(calls).every(
        (p) =>
          p.get('sort') === 'created' && p.get('order') === 'asc' && p.get('per_page') === '100',
      ),
    ).toBe(true);
    // The rule ran out: fewer are selected, and nothing is widened.
    expect([selection.complete, selection.finalN, selection.wanted]).toEqual([false, 0, WANTED]);
    expect(selection.weeks.map((w) => w.start)).toEqual(WEEKS.map((w) => w.start));
    for (const w of selection.weeks) {
      expect(w.queries.map((q) => q.agent)).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(w.exhaustedAgents).toEqual(['A', 'B', 'C', 'D', 'E']);
    }
  });

  it("applies the filters in order, study 1's repositories first among the exclusions", async () => {
    const [w] = WEEKS;
    const short = `<!-- ${'c'.repeat(500)} -->  ${'y'.repeat(MIN_BODY - 1)}  `;
    const items = [
      item('BargLabs/anything'),
      item('fluidsynth/FLUIDSYNTH'),
      item('Study1-Org/Repo'),
      item('o/low'),
      item('o/fork'),
      item('o/gone'),
      item('o/short', short),
      item('o/edge'),
      item('O/EDGE'),
    ];
    const repos = {
      'BargLabs/anything': {},
      'fluidsynth/FLUIDSYNTH': {},
      'Study1-Org/Repo': {},
      'o/low': { stargazers_count: MIN_STARS - 1 },
      'o/fork': { fork: true },
      'o/short': {},
      'o/edge': { stargazers_count: MIN_STARS },
      'O/EDGE': { stargazers_count: MIN_STARS },
    };
    const { get, calls } = fakeGitHub({ weekItems: { [w.start]: { A: items } }, repos });
    const { selection, bodies } = await select({
      get,
      ruleCommit: SHA,
      study1: ['study1-org/repo'],
      now,
    });
    expect(selection.candidates.map((c) => [c.repository, c.result])).toEqual([
      ['BargLabs/anything', { rejectedBy: 1, reason: 'repository owner is BargLabs' }],
      [
        'fluidsynth/FLUIDSYNTH',
        { rejectedBy: 1, reason: 'repository is in demo/2026-10/selection.json' },
      ],
      ['Study1-Org/Repo', { rejectedBy: 1, reason: `repository is in ${STUDY1_SELECTION.path}` }],
      ['o/low', { rejectedBy: 2, reason: 'stargazers_count 199 < 200' }],
      ['o/fork', { rejectedBy: 2, reason: 'a fork' }],
      ['o/gone', { rejectedBy: 2, reason: 'repository read returned HTTP 404' }],
      ['o/short', { rejectedBy: 3, reason: 'cleaned body 299 < 300' }],
      ['o/edge', 'selected'],
      ['O/EDGE', { rejectedBy: 4, reason: 'a PR from this repository is already selected' }],
    ]);
    // An excluded repository is rejected before its metadata is read.
    for (const r of ['BargLabs/anything', 'fluidsynth/FLUIDSYNTH', 'Study1-Org/Repo']) {
      expect(calls).not.toContain(`/repos/${r}`);
    }
    const [s] = selection.selected;
    expect(s).toMatchObject({ n: 1, agent: 'A', week: w.start, repository: 'o/edge' });
    expect(s.body.sha256).toBe(sha256(Buffer.from(items[7].body, 'utf8')));
    expect([...bodies.values()]).toEqual([items[7].body]);
    expect(selection.exclusions.study1).toEqual({ ...STUDY1_SELECTION, repositories: 1 });
  });

  it("excludes study 1's 300 repositories, read from the file its digest pins", () => {
    const repositories = study1Repositories();
    expect(repositories).toHaveLength(300);
    expect(new Set(repositories.map((r) => r.toLowerCase())).size).toBe(300);
    expect(STUDY1_SELECTION.sha256).toBe(sha256(readFileSync(join(ROOT, STUDY1_SELECTION.path))));
    const p = scratch();
    writeJson(p.selection, { selected: [{ repository: 'o/r' }] });
    expect(() => study1Repositories(p.selection)).toThrow(/study 2 excludes 1593c3d9/);
    // And the demo's five, as study 1 did.
    const demo = readJson(join(ROOT, 'demo', '2026-10', 'selection.json'));
    expect(EXCLUDED_REPOSITORIES).toEqual(demo.selected.map((s) => s.repository));
  });

  it('selects round-robin within a week, then moves to the next week', async () => {
    const [w1, w2] = WEEKS;
    const weekItems = {
      [w1.start]: { A: [item('a/1'), item('a/2')], C: [item('c/1')] },
      [w2.start]: { B: [item('b/1')], A: [item('a/3')] },
    };
    const all = Object.values(weekItems).flatMap((byAgent) => Object.values(byAgent).flat());
    const { get } = fakeGitHub({ weekItems, repos: reposOf(all) });
    const { selection } = await select({ get, ruleCommit: SHA, study1: [], now });
    expect(selection.selected.map((s) => [s.n, s.week, s.agent, s.repository])).toEqual([
      [1, w1.start, 'A', 'a/1'],
      [2, w1.start, 'C', 'c/1'],
      [3, w1.start, 'A', 'a/2'],
      [4, w2.start, 'A', 'a/3'],
      [5, w2.start, 'B', 'b/1'],
    ]);
  });

  it('stops at 150, queries no later week, and writes selection.json once', async () => {
    const [w1, w2, w3] = WEEKS;
    const first = Array.from({ length: 100 }, (_, i) => item(`f/r${i}`));
    const second = Array.from({ length: 100 }, (_, i) => item(`s/r${i}`));
    const weekItems = { [w1.start]: { A: first }, [w2.start]: { E: second } };
    const { get, calls } = fakeGitHub({ weekItems, repos: reposOf(first, second) });
    const result = await select({ get, ruleCommit: SHA, study1: [], now });
    const { selection } = result;
    expect(selection.selected).toHaveLength(WANTED);
    expect([selection.complete, selection.finalN]).toEqual([true, 150]);
    expect(selection.selected.at(-1).repository).toBe('s/r49');
    expect(selection.weeks.map((w) => w.start)).toEqual([w1.start, w2.start]);
    expect(searches(calls).every((p) => !p.get('q').includes(w3.start))).toBe(true);
    const p = scratch();
    writeSelection(result, p);
    expect(readJson(p.selection)).toEqual(selection);
    const stem = `f-r0-${selection.selected[0].number}`;
    expect(readFileSync(join(p.bodies, `${stem}.md`), 'utf8')).toBe(first[0].body);
    expect(() => writeSelection(result, p)).toThrow(/never redone/);
  });

  it('refuses without the rule commit, reading nothing', async () => {
    const { get, calls } = fakeGitHub({});
    await expect(select({ get, ruleCommit: 'HEAD', study1: [], now })).rejects.toThrow(
      /rule-commit/,
    );
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Two fake checkers: each writes the record its fixtures give for <repo>#<pr>, logs the call, prints
// to stdout and exits 2, or writes nothing and exits 3 when there is no fixture. The role in the
// first line makes the two bundles' bytes, and so their digests, differ.

const fake = (role) => `// role: ${role}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const at = (f) => args[args.indexOf(f) + 1];
const fixtures = JSON.parse(readFileSync(process.env.FAKE_FIXTURES, 'utf8'))['${role}'];
const key = at('--repo') + '#' + at('--pr');
appendFileSync(process.env.FAKE_LOG, '${role} ' + key + '\\n');
process.stdout.write('an advisory table nobody should see\\n');
const f = fixtures[key];
if (f === undefined || args[0] !== 'check' || !args.includes('--advisory') || !args.includes('--report-pr-body')) process.exit(3);
writeFileSync(at('--out'), JSON.stringify({ ...f, env: { github: process.env.GITHUB_TOKEN ?? null, gh: process.env.GH_TOKEN ?? null } }));
process.exit(2);
`;

function record({ instrument, body, advisories }) {
  return {
    predicate: {
      checker: { version: instrument.checkerVersion, digest: { sha256: instrument.bundleSha256 } },
      report: { sha256: sha256(Buffer.from(body, 'utf8')) },
      digests: { advisory: sha256(JSON.stringify(advisories)) },
      advisory: {
        extractor: { version: '0.1.3', digest: { sha256: instrument.extractorDigest } },
        comparison: { version: instrument.comparison },
        precision: null,
        differsAccuracy: null,
        advisories: structuredClone(advisories),
      },
    },
  };
}

const adv = (clause, kind, value, note, observed = null) => ({
  clause,
  kind,
  value,
  observed,
  note,
});

const selectedPr = (n, repository, number, body) => ({
  n,
  agent: 'A',
  week: WEEKS[0].start,
  url: `https://github.com/${repository}/pull/${number}`,
  repository,
  number,
  stargazersCount: 500,
  cleanedBodyLength: MIN_BODY,
  body: { sha256: sha256(Buffer.from(body, 'utf8')), codePoints: [...body].length },
  selectedAt: '2026-10-08T00:00:00.000Z',
});

const BODIES = [
  '🙂 Updated\n  `src/a.ts` and   closes #12.\n\nAlso fixed `src/b.ts`.',
  'Changed the following files: `x.ts`, `y.ts`. All tests pass.',
  'Fixed `docs/z.md` and the `docs/` folder.',
  'Nothing here asserts much, but updated `w.ts`.',
];
const ADVISORIES = [
  [
    adv('Updated `src/a.ts` and closes #12.', 'file_changed', 'src/a.ts', 'agrees', 'src/a.ts'),
    adv('Updated `src/a.ts` and closes #12.', 'reference_closes', '#12', 'differs:not_closing', []),
    adv('Also fixed `src/b.ts`.', 'file_changed', 'src/b.ts', 'differs:declared_not_changed', []),
  ],
  [
    adv('Changed the following files: `x.ts`, `y.ts`.', 'file_changed', 'x.ts', 'agrees_by_name'),
    adv('All tests pass.', 'tests_passed', true, 'unanswered:no_comparable_record_field'),
  ],
  [
    adv(
      'Fixed `docs/z.md` and the `docs/` folder.',
      'file_changed',
      'docs/z.md',
      'differs:declared_not_changed',
      [],
    ),
    adv(
      'Fixed `docs/z.md` and the `docs/` folder.',
      'file_changed',
      'docs/',
      'differs:declared_not_changed',
      [],
    ),
  ],
  [adv('but updated `w.ts`.', 'file_changed', 'w.ts', 'differs:declared_not_changed', [])],
];
// What comparison 0.3.0 notes for the baseline's file differs: a file, nothing, a directory, an
// unreadable answer.
const CANDIDATE_NOTES = {
  '0:2': 'differs:declared_not_changed',
  '2:0': 'unanswered:no_such_path',
  '2:1': 'unanswered:directory',
  '3:0': 'unanswered:source_unreadable:path',
};
const candidateAdvisories = (i) =>
  ADVISORIES[i].map((a, j) => {
    const note = CANDIDATE_NOTES[`${i}:${j}`];
    return note === undefined || note === a.note ? a : { ...a, observed: null, note };
  });

// A scratch study: four selected pull requests, their bodies, two fake checkers and their
// instruments. Returns everything a run needs.
function study() {
  const p = scratch();
  const bundles = {};
  const instruments = {};
  for (const [name, frozen] of [
    ['baseline', BASELINE],
    ['candidate', CANDIDATE],
  ]) {
    bundles[name] = join(p.dir, `fake-${name}.mjs`);
    writeFileSync(bundles[name], fake(name));
    instruments[name] = { ...frozen, bundleSha256: sha256(readFileSync(bundles[name])) };
  }
  const selected = BODIES.map((b, i) =>
    selectedPr(i + 1, `example-org/example-repo-${i}`, 10 + i, b),
  );
  writeJson(p.selection, { selected });
  mkdirSync(p.bodies, { recursive: true });
  selected.forEach((s, i) => {
    writeFileSync(join(p.bodies, `example-org-example-repo-${i}-${s.number}.md`), BODIES[i]);
  });
  const fixtures = {
    baseline: Object.fromEntries(
      selected.map((s, i) => [
        `${s.repository}#${s.number}`,
        record({ instrument: instruments.baseline, body: BODIES[i], advisories: ADVISORIES[i] }),
      ]),
    ),
    candidate: Object.fromEntries(
      selected.map((s, i) => [
        `${s.repository}#${s.number}`,
        record({
          instrument: instruments.candidate,
          body: BODIES[i],
          advisories: candidateAdvisories(i),
        }),
      ]),
    ),
  };
  const fixturesPath = join(p.dir, 'fixtures.json');
  writeJson(fixturesPath, fixtures);
  const log = join(p.dir, 'calls.log');
  writeFileSync(log, '');
  const env = {
    DUNSTAN_READ_TOKEN: 'read-only',
    GH_TOKEN: 'other',
    FAKE_FIXTURES: fixturesPath,
    FAKE_LOG: log,
    PATH: process.env.PATH,
  };
  const run = () => checkAll({ ...bundles, p, env, instruments, now });
  return { p, bundles, instruments, selected, fixturesPath, fixtures, env, log, run };
}

const committed = () => 'c'.repeat(40);
const uncommitted = () => null;

describe('run.mjs: both instruments on one set, sealed, then opened', () => {
  it('freezes both instruments as preregistered', () => {
    expect(BASELINE).toEqual({
      name: 'baseline',
      checkerVersion: '0.1.3',
      bundleSha256: 'fd1377c058a928bf30e54c000bfb19e5eb3cd5eb71408ea4b093cc9ccf7170a5',
      extractorVersion: '0.1.3',
      extractorDigest: '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
      comparison: '0.2.0',
    });
    expect(CANDIDATE).toEqual({
      name: 'candidate',
      checkerVersion: '0.1.5',
      bundleSha256: '978a6f63d5932e2d52c89b73ca9ead3f29628cd847efd50fb4b7eb05daeab8c5',
      extractorVersion: '0.1.3',
      extractorDigest: BASELINE.extractorDigest,
      comparison: '0.3.0',
      sourceCommit: 'e559598ec3c5b1a05e96270e0ba723d5cef6b1a3',
    });
  });

  it('refuses a bundle that is not its instrument, or no read token', () => {
    const { p, bundles, env } = study();
    expect(() => checkAll({ ...bundles, p, env })).toThrow(/the baseline instrument is fd1377c0/);
    const s = study();
    expect(() =>
      checkAll({
        baseline: s.bundles.baseline,
        candidate: s.bundles.baseline,
        p: s.p,
        env: s.env,
        instruments: s.instruments,
      }),
    ).toThrow(/the candidate instrument is/);
    const { DUNSTAN_READ_TOKEN: _, ...rest } = s.env;
    expect(() => checkAll({ ...s.bundles, p: s.p, env: rest, instruments: s.instruments })).toThrow(
      /DUNSTAN_READ_TOKEN/,
    );
  });

  it('runs baseline then candidate on each pull request, seals both and passes only the read token', () => {
    const { p, selected, fixturesPath, fixtures, log, run } = study();
    // The candidate has no record for the last pull request: it is tried twice, and is an error.
    const last = `${selected[3].repository}#${selected[3].number}`;
    delete fixtures.candidate[last];
    writeJson(fixturesPath, fixtures);
    run();
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    expect(calls).toEqual([
      ...selected.flatMap((s) => [
        `baseline ${s.repository}#${s.number}`,
        `candidate ${s.repository}#${s.number}`,
      ]),
      `candidate ${last}`,
    ]);
    for (const name of ['baseline', 'candidate']) {
      const seal = readJson(p.seal(name));
      expect(seal.run).toBe(name);
      expect(seal.records).toHaveLength(4);
      for (const r of seal.records.filter((x) => x.error === undefined)) {
        const bytes = readFileSync(join(p.records, name, r.file));
        expect(r.sha256).toBe(sha256(bytes));
        expect(JSON.parse(bytes.toString('utf8')).env).toEqual({ github: 'read-only', gh: null });
      }
      // A seal holds digests and nothing a record says.
      expect(JSON.stringify(seal)).not.toMatch(/src\/|closes|differs|unanswered/);
    }
    expect(readJson(p.seal('candidate')).records[3]).toEqual({
      pr: last,
      error: 'no record; exit 3',
    });
    expect(run).toThrow(/never redone/);
  });

  it('opens nothing until both seals are committed, then indexes ids, both notes and offsets', () => {
    const { p, instruments, selected, run } = study();
    run();
    expect(() => indexAll({ p, instruments, committed: uncommitted })).toThrow(
      /baseline.seal.json is not committed/,
    );
    const index = indexAll({ p, instruments, committed });
    expect([index.prs.length, index.errors, index.faults]).toEqual([4, [], []]);
    const first = index.prs[0];
    const pr = `${selected[0].repository}#${selected[0].number}`;
    expect(first.pr).toBe(pr);
    expect(first.reportIsSelectedBody).toBe(true);
    expect(first.advisories.map((a) => [a.advisoryId, a.kind, a.notes])).toEqual([
      [`${pr}:0`, 'file_changed', { baseline: 'agrees', candidate: 'agrees' }],
      [
        `${pr}:1`,
        'reference_closes',
        { baseline: 'differs:not_closing', candidate: 'differs:not_closing' },
      ],
      [
        `${pr}:2`,
        'file_changed',
        { baseline: 'differs:declared_not_changed', candidate: 'differs:declared_not_changed' },
      ],
    ]);
    expect(index.prs[2].advisories.map((a) => a.notes.candidate)).toEqual([
      'unanswered:no_such_path',
      'unanswered:directory',
    ]);
    // Offsets are code points: the emoji before the clause is one.
    const { start, end } = first.advisories[0].clause;
    expect([...BODIES[0]].slice(start, end).join('')).toBe(
      'Updated\n  `src/a.ts` and   closes #12.',
    );
    expect(JSON.stringify(readJson(p.index))).not.toMatch(/src\/|`|Updated/);
  });

  it('reports a pull request whose runs propose different advisories as a fault, and an error, and measures neither', () => {
    const { p, instruments, selected, fixturesPath, fixtures, run } = study();
    const second = `${selected[1].repository}#${selected[1].number}`;
    fixtures.candidate[second].predicate.advisory.advisories[0].value = 'y.ts';
    const last = `${selected[3].repository}#${selected[3].number}`;
    delete fixtures.baseline[last];
    writeJson(fixturesPath, fixtures);
    run();
    const index = indexAll({ p, instruments, committed });
    expect(index.prs.map((x) => x.pr)).not.toContain(second);
    expect(index.prs.map((x) => x.pr)).not.toContain(last);
    expect(index.faults).toEqual([{ pr: second, reason: 'advisory 0: the value differs' }]);
    expect(index.errors).toEqual([{ pr: last, instruments: ['baseline'] }]);
  });

  it('refuses a record that is not the sealed one or not its instrument', () => {
    const { p, instruments, run } = study();
    run();
    const seal = readJson(p.seal('candidate'));
    const path = join(p.records, 'candidate', seal.records[0].file);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, `${original} `);
    expect(() => indexAll({ p, instruments, committed })).toThrow(/not the record the seal holds/);
    writeFileSync(path, original);
    expect(indexAll({ p, instruments, committed }).prs).toHaveLength(4);

    // A candidate record from comparison 0.2.0, sealed as it stands, is still refused.
    const q = study();
    for (const key of Object.keys(q.fixtures.candidate)) {
      q.fixtures.candidate[key].predicate.advisory.comparison.version = '0.2.0';
    }
    writeJson(q.fixturesPath, q.fixtures);
    q.run();
    expect(() => indexAll({ p: q.p, instruments: q.instruments, committed })).toThrow(
      /comparison 0.2.0, not 0.3.0/,
    );
  });
});

describe('run.mjs: advisory identity', () => {
  const report = 'r'.repeat(64);
  const pair = (a, b, reports = [report, report]) =>
    identityFault({ report: reports[0], advisories: a }, { report: reports[1], advisories: b });
  const file = adv('Fixed `a.ts`.', 'file_changed', 'a.ts', 'differs:declared_not_changed', []);

  it('accepts the same advisories, and the file note change comparison 0.3.0 makes', () => {
    expect(pair(ADVISORIES[0], ADVISORIES[0])).toBeNull();
    for (const note of PATH_NOTES) expect(pair([file], [{ ...file, note }])).toBeNull();
    expect(PATH_NOTES).toEqual([
      'differs:declared_not_changed',
      'unanswered:no_such_path',
      'unanswered:directory',
      'unanswered:source_unreadable:path',
    ]);
  });

  it('refuses any other difference', () => {
    expect(pair([file], [file], [report, 's'.repeat(64)])).toBe(
      'the two runs read different report bodies',
    );
    expect(pair([file], [])).toBe('1 advisories against 0');
    expect(pair([file], [{ ...file, kind: 'commit' }])).toBe('advisory 0: the kind differs');
    expect(pair([file], [{ ...file, clause: 'Fixed `b.ts`.' }])).toBe(
      'advisory 0: the clause differs',
    );
    expect(pair([file], [{ ...file, note: 'agrees' }])).toMatch(/not a comparison 0.3.0 change/);
    const ref = ADVISORIES[0][1];
    expect(pair([ref], [{ ...ref, note: 'unanswered:no_such_path' }])).toMatch(/not a comparison/);
    const agreed = ADVISORIES[0][0];
    expect(pair([agreed], [{ ...agreed, note: 'unanswered:no_such_path' }])).toMatch(
      /not a comparison/,
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe('sample.mjs: one M1 sample', () => {
  it('takes the first 60 by SHA-256 of seed and id, is written once, then checked', () => {
    const p = scratch();
    mkdirSync(p.runs, { recursive: true });
    const advisories = Array.from({ length: 100 }, (_, i) => ({
      advisoryId: `o/r#1:${i}`,
      kind: 'file_changed',
      clause: null,
      notes: { baseline: 'agrees', candidate: 'agrees' },
    }));
    writeJson(p.index, { prs: [{ pr: 'o/r#1', advisories }], errors: [], faults: [] });
    const { sample, wrote } = writeSample({ p });
    expect(M1_SEED).toBe('open-source-advisory-2026-10-study2/M1/2026-10-07');
    expect([wrote, sample.seed, sample.size, sample.population]).toEqual([
      true,
      M1_SEED,
      M1_SIZE,
      100,
    ]);
    expect(sample.advisoryIds).toHaveLength(60);
    const keys = sample.advisoryIds.map((id) => sha256(Buffer.from(`${M1_SEED}:${id}`, 'utf8')));
    expect(keys).toEqual(keys.toSorted());
    expect(sample).not.toHaveProperty('run');
    expect(writeSample({ p }).wrote).toBe(false);
    writeJson(p.sample, { ...sample, advisoryIds: [] });
    expect(() => writeSample({ p })).toThrow(/differs/);
  });
});

// ---------------------------------------------------------------------------------------------

describe('worksheet.mjs: the worksheet, blind to the candidate, and the published labels', () => {
  function opened() {
    const s = study();
    s.run();
    indexAll({ p: s.p, instruments: s.instruments, committed });
    writeSample({ p: s.p });
    return s;
  }

  it("lists the M1 sample blind to every note, and every baseline differs, never the candidate's note", () => {
    const { p } = opened();
    const { lines } = buildWorksheet({ p });
    const all = readJson(p.index).prs.flatMap((x) => x.advisories);
    const m1 = lines.filter((l) => l.measure === 'M1');
    const m2 = lines.filter((l) => l.measure === 'M2');
    expect(m1).toHaveLength(all.length);
    expect(m2.map((l) => l.advisoryId)).toEqual(
      all.filter((a) => a.notes.baseline.startsWith('differs:')).map((a) => a.advisoryId),
    );
    // Five baseline differs, of which the candidate keeps two.
    expect(m2).toHaveLength(5);
    for (const l of m1) {
      expect(l).not.toHaveProperty('note');
      expect(l).not.toHaveProperty('observed');
    }
    for (const l of m2) expect(l.note).toMatch(/^differs:/);
    expect(JSON.stringify(lines)).not.toMatch(/unanswered:(no_such_path|directory|source)|notes/);
    expect(lines.every((l) => l.record.includes(join('records', 'baseline')))).toBe(true);
  });

  it('publishes labelled lines without text, keeps labels on rebuild and never changes one', () => {
    const { p } = opened();
    const { path, lines } = buildWorksheet({ p });
    const m2 = lines.findIndex((l) => l.measure === 'M2');
    lines[m2].label = 'false_claim';
    lines[m2].adjudicatedAt = '2026-10-20T10:00:00Z';
    writeJsonl(path, lines);
    expect(buildWorksheet({ p }).lines[m2].label).toBe('false_claim');
    const { labelled, open } = publishLabels({ p });
    expect([labelled, open]).toEqual([1, lines.length - 1]);
    const [published] = readJsonl(p.labelFile);
    expect(Object.keys(published)).toEqual([
      'pr',
      'advisoryId',
      'clause',
      'measure',
      'label',
      'adjudicatedAt',
    ]);
    lines[m2].label = 'claim_holds';
    writeJsonl(path, lines);
    expect(() => publishLabels({ p })).toThrow(/never changed/);
    lines[m2].label = null;
    writeJsonl(path, lines);
    expect(() => publishLabels({ p })).toThrow(/never withdrawn/);
    lines[m2].label = 'maybe';
    writeJsonl(path, lines);
    expect(() => publishLabels({ p })).toThrow(/is not one of/);
  });

  it('refuses an advisory that is a claim under one measure and not under the other', () => {
    const p = scratch();
    mkdirSync(p.worksheets, { recursive: true });
    const line = (measure, label) => ({
      pr: 'o/r#1',
      advisoryId: 'o/r#1:0',
      clause: null,
      measure,
      label,
      adjudicatedAt: '2026-10-20T10:00:00Z',
    });
    writeJsonl(p.worksheet, [line('M1', 'real'), line('M2', 'not_a_claim')]);
    expect(() => publishLabels({ p })).toThrow(/disagree/);
    writeJsonl(p.worksheet, [line('M1', 'not_real'), line('M2', 'not_a_claim')]);
    expect(publishLabels({ p }).labelled).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------

const notes = (baseline, candidate = baseline) => ({ baseline, candidate });
const FD = 'differs:declared_not_changed';
const prOf = (pr, rows) => ({
  pr,
  reportIsSelectedBody: true,
  advisories: rows.map(([kind, n], i) => ({
    advisoryId: `${pr}:${i}`,
    kind,
    clause: { start: i, end: i + 1 },
    notes: n,
  })),
});
const ix = (prs) => ({
  instruments: { baseline: BASELINE, candidate: CANDIDATE },
  prs,
  errors: [],
  faults: [],
});
const label = (advisoryId, measure, l) => ({
  pr: advisoryId.split(':')[0],
  advisoryId,
  clause: null,
  measure,
  label: l,
  adjudicatedAt: '2026-10-20T10:00:00Z',
});

describe('figures.mjs: both instruments, LOST, the bar and the refutation tests', () => {
  // o/a#1: a file false claim at a file, a file misread at no path, a reference false claim.
  // o/b#2: a file false claim at no path (LOST), a file misread at a file, a reference claim that
  // holds, and an agreeing claim. o/c#3: a test claim no record answers.
  const index = ix([
    prOf('o/a#1', [
      ['file_changed', notes(FD)],
      ['file_changed', notes(FD, 'unanswered:no_such_path')],
      ['reference_closes', notes('differs:not_closing')],
    ]),
    prOf('o/b#2', [
      ['file_changed', notes(FD, 'unanswered:no_such_path')],
      ['file_changed', notes(FD)],
      ['reference_closes', notes('differs:not_closing')],
      ['file_changed', notes('agrees')],
    ]),
    prOf('o/c#3', [['tests_passed', notes('unanswered:no_comparable_record_field')]]),
  ]);
  const sample = { advisoryIds: ['o/a#1:0', 'o/b#2:3', 'o/c#3:0'] };
  const labels = [
    label('o/a#1:0', 'M1', 'real'),
    label('o/b#2:3', 'M1', 'real'),
    label('o/c#3:0', 'M1', 'not_real'),
    label('o/a#1:0', 'M2', 'false_claim'),
    label('o/a#1:1', 'M2', 'not_a_claim'),
    label('o/a#1:2', 'M2', 'false_claim'),
    label('o/b#2:0', 'M2', 'false_claim'),
    label('o/b#2:1', 'M2', 'not_a_claim'),
    label('o/b#2:2', 'M2', 'claim_holds'),
  ];

  it('computes M1 once, and M2 and M3 for each instrument from one set of labels', () => {
    const f = computeFigures({ index, sample, labels });
    expect(f.M1).toMatchObject({ k: 2, n: 3 });
    expect(f.baseline.M2.differs).toBe(6);
    expect([
      f.baseline.M2.false_claim.k,
      f.baseline.M2.claim_holds.k,
      f.baseline.M2.not_a_claim.k,
    ]).toEqual([3, 1, 2]);
    expect(f.baseline.M3).toMatchObject({ falseAccusations: 3, checkable: 7, k: 3, n: 7 });
    expect(f.candidate.M2.differs).toBe(4);
    expect([
      f.candidate.M2.false_claim.k,
      f.candidate.M2.claim_holds.k,
      f.candidate.M2.not_a_claim.k,
    ]).toEqual([2, 1, 1]);
    expect(f.candidate.M3).toMatchObject({ falseAccusations: 2, checkable: 5, k: 2, n: 5 });
    expect(f.candidate.M3.wilson95).toEqual(wilson(2, 5));
    expect(f.candidate.comparison).toBe('0.3.0');
    expect(f.candidate.descriptive.notes).toEqual({
      agrees: 1,
      'differs:declared_not_changed': 2,
      'differs:not_closing': 2,
      'unanswered:no_comparable_record_field': 1,
      'unanswered:no_such_path': 2,
    });
    expect(f.descriptive.falseAccusationsRemoved).toMatchObject({ k: 1, n: 3 });
    expect(f.descriptive.fileDiffersByCandidateNote).toEqual({
      [FD]: { false_claim: 1, not_a_claim: 1 },
      'unanswered:no_such_path': { not_a_claim: 1, false_claim: 1 },
    });
  });

  it("counts LOST over the baseline's false claims, with its Wilson interval", () => {
    const f = computeFigures({ index, sample, labels });
    expect(f.LOST).toMatchObject({
      k: 1,
      n: 3,
      wilson95: wilson(1, 3),
      byNote: { 'unanswered:no_such_path': 1 },
      advisoryIds: ['o/b#2:0'],
    });
  });

  it('decides the bar on the candidate, on the three conditions only', () => {
    expect(BAR).toEqual({ m3WilsonHighAtMost: 0.05, m2FalseClaimShareAtLeast: 0.8, lostAtMost: 1 });
    const f = computeFigures({ index, sample, labels });
    expect(f.bar).toMatchObject({ m3Met: false, m2Met: false, lostMet: true, met: false });

    // 80 agreeing advisories, then the candidate's differs: k false claims and fa false accusations,
    // and `lost` baseline false claims the candidate leaves unanswered.
    const big = ({ fc, fa, lost }) => {
      const rows = [
        ...Array.from({ length: 80 }, () => ['reference_closes', notes('agrees')]),
        ...Array.from({ length: fc }, () => ['file_changed', notes(FD)]),
        ...Array.from({ length: fa }, () => ['file_changed', notes(FD)]),
        ...Array.from({ length: lost }, () => [
          'file_changed',
          notes(FD, 'unanswered:no_such_path'),
        ]),
      ];
      const ls = rows.slice(80).map((_, i) => {
        const id = `o/a#1:${80 + i}`;
        return label(id, 'M2', i >= fc && i < fc + fa ? 'not_a_claim' : 'false_claim');
      });
      return computeFigures({
        index: ix([prOf('o/a#1', rows)]),
        sample: { advisoryIds: [] },
        labels: ls,
      });
    };
    expect(big({ fc: 5, fa: 0, lost: 1 }).bar).toMatchObject({
      m3Met: true,
      m2Met: true,
      lostMet: true,
      met: true,
    });
    // Each condition alone fails the bar.
    const m3 = big({ fc: 9, fa: 1, lost: 0 });
    expect(m3.candidate.M3.wilson95.high).toBeGreaterThan(0.05);
    expect(m3.candidate.M2.false_claim.value).toBeGreaterThanOrEqual(0.8);
    expect(m3.bar).toMatchObject({ m3Met: false, m2Met: true, lostMet: true, met: false });
    expect(big({ fc: 5, fa: 0, lost: 2 }).bar).toMatchObject({
      m3Met: true,
      m2Met: true,
      lostMet: false,
      met: false,
    });
    // No differs: the false-claim share is undefined and the bar is not met.
    const none = big({ fc: 0, fa: 0, lost: 1 });
    expect(none.candidate.M2.false_claim.value).toBeNull();
    expect(none.bar).toMatchObject({ m2Met: false, met: false });
  });

  it('computes each refutation test, and calls one with too few cases not decidable', () => {
    expect(REFUTE).toEqual({
      notAClaim: { shareAtLeast: 0.3, minimum: 5 },
      accusationsAtAFile: { shareAtLeast: 0.5, minimum: 6 },
      falseClaimsLost: { shareAtLeast: 0.5, minimum: 4 },
    });
    const small = computeFigures({ index, sample, labels }).refutations;
    expect(small.notAClaim).toMatchObject({ k: 1, n: 4, decidable: false, refuted: null });
    expect(small.accusationsAtAFile).toMatchObject({ k: 1, n: 2, decidable: false, refuted: null });
    expect(small.falseClaimsLost).toMatchObject({ k: 1, n: 2, decidable: false, refuted: null });
    expect(small.noFewerAccusations).toEqual({
      baseline: 3,
      candidate: 2,
      decidable: true,
      refuted: false,
    });

    // Six file misreads, three at a file; four file false claims, two lost; the candidate's differs
    // are three misreads and two false claims.
    const rows = [
      ...Array.from({ length: 3 }, () => ['file_changed', notes(FD)]),
      ...Array.from({ length: 3 }, () => ['file_changed', notes(FD, 'unanswered:no_such_path')]),
      ...Array.from({ length: 2 }, () => ['file_changed', notes(FD)]),
      ...Array.from({ length: 2 }, () => ['file_changed', notes(FD, 'unanswered:directory')]),
    ];
    const ls = rows.map((_, i) => label(`o/a#1:${i}`, 'M2', i < 6 ? 'not_a_claim' : 'false_claim'));
    const r = computeFigures({
      index: ix([prOf('o/a#1', rows)]),
      sample: { advisoryIds: [] },
      labels: ls,
    }).refutations;
    expect(r.notAClaim).toMatchObject({ k: 3, n: 5, decidable: true, refuted: true });
    expect(r.accusationsAtAFile).toMatchObject({ k: 3, n: 6, decidable: true, refuted: true });
    expect(r.falseClaimsLost).toMatchObject({ k: 2, n: 4, decidable: true, refuted: true });
    expect(r.noFewerAccusations).toMatchObject({ baseline: 6, candidate: 3, refuted: false });
  });

  it('refuses, computing nothing, when a label is missing, extra or doubled, or the index is unsound', () => {
    const missing = labels.filter((l) => !(l.advisoryId === 'o/b#2:2' && l.measure === 'M2'));
    expect(() => computeFigures({ index, sample, labels: missing })).toThrow(MissingLabels);
    try {
      computeFigures({ index, sample, labels: missing });
    } catch (e) {
      expect(e.missing).toEqual(['o/b#2:2 M2']);
    }
    expect(() =>
      computeFigures({ index, sample, labels: [...labels, label('o/b#2:3', 'M2', 'false_claim')] }),
    ).toThrow(/which no measure needs/);
    expect(() => computeFigures({ index, sample, labels: [...labels, labels[0]] })).toThrow(
      /labelled twice/,
    );
    const unsound = ix([prOf('o/a#1', [['file_changed', notes('agrees', FD)]])]);
    expect(() =>
      computeFigures({ index: unsound, sample: { advisoryIds: [] }, labels: [] }),
    ).toThrow(/differs under the candidate only/);
  });

  it('writes figures/figures.json from the files', () => {
    const p = scratch();
    for (const d of [p.runs, p.samples, p.labels]) mkdirSync(d, { recursive: true });
    writeJson(p.index, index);
    writeJson(p.sample, sample);
    writeJsonl(p.labelFile, labels);
    const f = writeFigures({ p });
    expect(readJson(p.figureFile)).toEqual(f);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the preregistration states what the tools do', () => {
  it.each([
    ['the queries', `${QUALIFIERS} merged:<start>..<end> <qualifier>`],
    ['the stars threshold', '`stargazers_count >= 200`'],
    ['the body minimum', 'least 300 characters'],
    ['the number wanted', 'Stop at 150'],
    ['the M1 sample size', String(M1_SIZE)],
    ['the seed', M1_SEED],
    ['the baseline bundle', BASELINE.bundleSha256],
    ['the candidate bundle', CANDIDATE.bundleSha256],
    ['the grammar', BASELINE.extractorDigest],
    ['the candidate source', CANDIDATE.sourceCommit],
    ["study 1's selection", STUDY1_SELECTION.sha256],
    ['the bar', '**0.05**'],
    ['the bar', '**0.80**'],
    ['the bar', '**LOST is at most 1**'],
    ['the bar', 'decided on these three conditions only'],
    ...PATH_NOTES.map((n) => ['a path note', `\`${n}\``]),
    ...AGENTS.map((a) => ['an agent qualifier', a.qualifier]),
    ...EXCLUDED_REPOSITORIES.map((r) => ['an excluded repository', r]),
  ])('%s: %s', (_, text) => {
    expect(prereg).toContain(text);
  });
});

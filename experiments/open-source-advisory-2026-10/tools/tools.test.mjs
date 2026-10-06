// The study's tools, on synthetic fixtures only: a fake GitHub for select.mjs, a fake checker for
// run.mjs, and constructed records, labels and bodies. No test reaches the network: fetch throws.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BASELINE,
  M1_SEED,
  M1_SIZE,
  paths,
  ROOT,
  readJson,
  readJsonl,
  STUDY,
  sha256,
  wilson,
  writeJson,
  writeJsonl,
} from './common.mjs';
import { BAR, computeFigures, MissingLabels, writeFigures } from './figures.mjs';
import { checkHalf, freeze, indexHalf, instrumentFor, locateClause } from './run.mjs';
import { drawSample, writeSample } from './sample.mjs';
import {
  AGENTS,
  EXCLUDED_REPOSITORIES,
  HttpError,
  MIN_BODY,
  MIN_STARS,
  QUERY_PREFIX,
  RESULT_CAP,
  select,
  WANTED,
  writeSelection,
} from './select.mjs';
import { halfOf, recordSplit, selectedIn, split } from './split.mjs';
import { buildWorksheet, publishLabels } from './worksheet.mjs';

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('a test reached for the network');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const scratch = () => paths(mkdtempSync(join(tmpdir(), 'study-')));
const SHA = 'a'.repeat(40);
const longBody = (n, tag = '') => `${tag}${'x'.repeat(n - tag.length)}`;

// ---------------------------------------------------------------------------------------------
// A fake GitHub: per agent, an ordered list of search items; per repository, its metadata.

function fakeGitHub({ items, repos }) {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith('/search/issues?')) {
      const params = new URLSearchParams(path.slice('/search/issues?'.length));
      const q = params.get('q');
      const agent = AGENTS.find((a) => q.endsWith(a.qualifier));
      const all = items[agent.id] ?? [];
      const page = Number(params.get('page'));
      const per = Number(params.get('per_page'));
      const reachable = all.slice(0, RESULT_CAP);
      return {
        total_count: all.length,
        incomplete_results: false,
        items: reachable.slice((page - 1) * per, page * per),
      };
    }
    const name = path.slice('/repos/'.length);
    const repo = repos[name];
    if (repo === undefined) throw new HttpError(path, 404, 'Not Found');
    return {
      private: false,
      archived: false,
      fork: false,
      stargazers_count: 5000,
      ...repo,
    };
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
    created_at: '2026-06-02T00:00:00Z',
    pull_request: { merged_at: '2026-07-01T00:00:00Z' },
    body,
  };
};

let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 8, 0, 0, tick++)).toISOString();

describe('select.mjs: the selection rule', () => {
  it('queries each agent with the window, the demo qualifiers and the demo order', async () => {
    const { get, calls } = fakeGitHub({ items: {}, repos: {} });
    const { selection } = await select({ get, ruleCommit: SHA, now });
    expect(AGENTS.map((a) => a.qualifier)).toEqual([
      'author:app/copilot-swe-agent',
      'author:app/devin-ai-integration',
      'author:app/claude',
      'author:app/chatgpt-codex-connector',
      'author:app/google-labs-jules',
    ]);
    expect(QUERY_PREFIX).toBe('is:pr is:merged is:public merged:2026-06-01..2026-10-06');
    expect(selection.queries.map((q) => q.q)).toEqual(
      AGENTS.map((a) => `${QUERY_PREFIX} ${a.qualifier}`),
    );
    expect(calls.every((c) => c.includes('sort=created') && c.includes('order=asc'))).toBe(true);
    expect(selection.complete).toBe(false);
    expect(selection.selected).toEqual([]);
    expect(selection.exhaustedAgents).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('applies the filters in order and records which rejected each candidate', async () => {
    const short = `<!-- ${'c'.repeat(500)} -->  ${'y'.repeat(MIN_BODY - 1)}  `;
    const exact = `<!-- note -->${'é'.repeat(MIN_BODY)}`;
    const items = {
      A: [
        item('BargLabs/anything'),
        item('fluidsynth/FLUIDSYNTH'),
        item('o/low'),
        item('o/fork'),
        item('o/archived'),
        item('o/gone'),
        item('o/short', short),
        item('o/edge', exact),
        item('o/edge'),
      ],
    };
    const repos = {
      'BargLabs/anything': {},
      'fluidsynth/FLUIDSYNTH': {},
      'o/low': { stargazers_count: MIN_STARS - 1 },
      'o/fork': { fork: true },
      'o/archived': { archived: true },
      'o/short': {},
      'o/edge': { stargazers_count: MIN_STARS },
    };
    const { get, calls } = fakeGitHub({ items, repos });
    const { selection, bodies } = await select({ get, ruleCommit: SHA, now });
    const results = selection.candidates.map((c) => [c.repository, c.result]);
    expect(results).toEqual([
      ['BargLabs/anything', { rejectedBy: 1, reason: 'repository owner is BargLabs' }],
      [
        'fluidsynth/FLUIDSYNTH',
        { rejectedBy: 1, reason: 'repository is in demo/2026-10/selection.json' },
      ],
      ['o/low', { rejectedBy: 2, reason: 'stargazers_count 199 < 200' }],
      ['o/fork', { rejectedBy: 2, reason: 'a fork' }],
      ['o/archived', { rejectedBy: 2, reason: 'archived' }],
      ['o/gone', { rejectedBy: 2, reason: 'repository read returned HTTP 404' }],
      ['o/short', { rejectedBy: 3, reason: 'cleaned body 299 < 300' }],
      ['o/edge', 'selected'],
      ['o/edge', { rejectedBy: 4, reason: 'a PR from this repository is already selected' }],
    ]);
    // An excluded owner or repository is rejected before its metadata is read.
    expect(calls).not.toContain('/repos/BargLabs/anything');
    expect(calls).not.toContain('/repos/fluidsynth/FLUIDSYNTH');
    const [s] = selection.selected;
    expect(s.cleanedBodyLength).toBe(MIN_BODY);
    expect(s.body).toEqual({
      sha256: sha256(Buffer.from(exact, 'utf8')),
      codePoints: [...exact].length,
    });
    expect([...bodies.values()]).toEqual([exact]);
  });

  it('excludes every repository of the demo selection', () => {
    const demo = readJson(join(ROOT, 'demo', '2026-10', 'selection.json'));
    expect(EXCLUDED_REPOSITORIES).toEqual(demo.selected.map((s) => s.repository));
  });

  it('selects round-robin, skipping an agent whose results run out', async () => {
    const items = {
      A: [item('a/1'), item('a/2'), item('a/3')],
      B: [item('b/1')],
      C: [item('c/1'), item('c/2')],
      E: [item('e/1'), item('e/2')],
    };
    const repos = Object.fromEntries(
      Object.values(items)
        .flat()
        .map((i) => [i.repository_url.split('/repos/')[1], {}]),
    );
    const { get } = fakeGitHub({ items, repos });
    const { selection } = await select({ get, ruleCommit: SHA, now });
    expect(selection.selected.map((s) => `${s.agent} ${s.repository}`)).toEqual([
      'A a/1',
      'B b/1',
      'C c/1',
      'E e/1',
      'A a/2',
      'C c/2',
      'E e/2',
      'A a/3',
    ]);
    expect(selection.selected.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Fewer than 300 qualify: the rule selects fewer and says so; it never widens.
    expect(selection.complete).toBe(false);
    expect(selection.wanted).toBe(WANTED);
  });

  it('reads no further than the 1,000-result cap, page by page', async () => {
    const many = Array.from({ length: 1200 }, () => item('o/low'));
    const { get, calls } = fakeGitHub({
      items: { A: many },
      repos: { 'o/low': { stargazers_count: 1 } },
    });
    const { selection } = await select({ get, ruleCommit: SHA, now });
    const pages = calls
      .filter((c) => c.includes('copilot-swe-agent'))
      .map((c) => new URLSearchParams(c.split('?')[1]).get('page'));
    expect(pages).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(selection.candidates).toHaveLength(RESULT_CAP);
    // The repository is read once, however many of its pull requests are examined.
    expect(calls.filter((c) => c === '/repos/o/low')).toHaveLength(1);
  });

  it('stops at 300 and writes selection.json once', async () => {
    const items = { A: Array.from({ length: WANTED + 5 }, (_, i) => item(`o/r${i}`)) };
    const repos = Object.fromEntries(
      items.A.map((i) => [i.repository_url.split('/repos/')[1], {}]),
    );
    const { get } = fakeGitHub({ items, repos });
    const result = await select({ get, ruleCommit: SHA, now });
    expect(result.selection.selected).toHaveLength(WANTED);
    expect(result.selection.complete).toBe(true);
    const p = scratch();
    writeSelection(result, p);
    expect(readJson(p.selection).selected).toHaveLength(WANTED);
    expect(
      readFileSync(join(p.bodies, `o-r0-${result.selection.selected[0].number}.md`), 'utf8'),
    ).toBe(items.A[0].body);
    expect(() => writeSelection(result, p)).toThrow(/never redone/);
  });

  it('refuses without the rule commit', async () => {
    const { get } = fakeGitHub({ items: {}, repos: {} });
    await expect(select({ get, ruleCommit: 'HEAD', now })).rejects.toThrow(/rule-commit/);
  });
});

// ---------------------------------------------------------------------------------------------

const selectedPr = (n, repository, number = n, body = `body ${n}`) => ({
  n,
  agent: 'A',
  url: `https://github.com/${repository}/pull/${number}`,
  repository,
  number,
  stargazersCount: 500,
  cleanedBodyLength: MIN_BODY,
  body: { sha256: sha256(Buffer.from(body, 'utf8')), codePoints: [...body].length },
  selectedAt: '2026-10-08T00:00:00.000Z',
});

describe('split.mjs: the hash split', () => {
  it('orders by the SHA-256 of the lower-cased key and halves 150/150', () => {
    const selected = Array.from({ length: 300 }, (_, i) =>
      selectedPr(i + 1, `Example-Org/Repo-${i}`, i + 7),
    );
    const s = split(selected);
    expect(s.dev).toHaveLength(150);
    expect(s.test).toHaveLength(150);
    const all = [...s.dev, ...s.test];
    expect(all[0].key).toBe(all[0].key.toLowerCase());
    for (const o of all) expect(o.sha256).toBe(sha256(Buffer.from(o.key, 'utf8')));
    expect(all.map((o) => o.sha256)).toEqual(all.map((o) => o.sha256).toSorted());
    // The order of the selection does not matter, only the keys.
    expect(split([...selected].reverse())).toEqual(s);
  });

  it('gives dev ceil(N/2) on a shortfall', () => {
    const s = split(Array.from({ length: 7 }, (_, i) => selectedPr(i + 1, `o/r${i}`)));
    expect([s.dev.length, s.test.length]).toEqual([4, 3]);
  });

  it('is written to selection.json once, then checked', () => {
    const p = scratch();
    const selected = Array.from({ length: 4 }, (_, i) => selectedPr(i + 1, `o/r${i}`));
    writeJson(p.selection, { selected });
    expect(recordSplit(p).wrote).toBe(true);
    expect(recordSplit(p).wrote).toBe(false);
    const selection = readJson(p.selection);
    expect(selection.split.dev.length + selection.split.test.length).toBe(4);
    const [first] = selectedIn(selection, 'dev');
    expect(halfOf(selection, first)).toBe('dev');
    [selection.split.dev[0], selection.split.test[0]] = [
      selection.split.test[0],
      selection.split.dev[0],
    ];
    writeJson(p.selection, selection);
    expect(() => recordSplit(p)).toThrow(/differs/);
  });
});

// ---------------------------------------------------------------------------------------------
// A fake checker: writes the record a fixture gives for <repo>#<pr>, prints to stdout, and exits 2,
// or writes nothing and exits 3 when there is no fixture.

const FAKE = `import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const at = (f) => args[args.indexOf(f) + 1];
const fixtures = JSON.parse(readFileSync(process.env.FAKE_FIXTURES, 'utf8'));
const f = fixtures[at('--repo') + '#' + at('--pr')];
process.stdout.write('an advisory table nobody should see\\n');
if (f === undefined || args[0] !== 'check' || !args.includes('--advisory') || !args.includes('--report-pr-body')) process.exit(3);
writeFileSync(at('--out'), JSON.stringify({ ...f, env: { github: process.env.GITHUB_TOKEN ?? null, gh: process.env.GH_TOKEN ?? null } }));
process.exit(2);
`;

const EXTRACTOR = 'e'.repeat(64);

function record({ bundle, body, advisories, extractor = EXTRACTOR, comparison = '0.2.0' }) {
  return {
    predicate: {
      checker: { version: '0.1.4', digest: { sha256: bundle } },
      report: { sha256: sha256(Buffer.from(body, 'utf8')) },
      digests: { advisory: sha256(JSON.stringify(advisories)) },
      advisory: {
        extractor: { version: '0.1.4', digest: { sha256: extractor } },
        comparison: { version: comparison },
        precision: null,
        differsAccuracy: null,
        advisories,
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

// A scratch study: four selected pull requests split 2/2, their bodies, a fake checker and a frozen
// fixed instrument. Returns everything a run needs.
function study() {
  const p = scratch();
  const dunstan = join(p.dir, 'fake-dunstan.mjs');
  writeFileSync(dunstan, FAKE);
  const bundle = sha256(readFileSync(dunstan));
  const bodies = [
    '🙂 Updated\n  `src/a.ts` and   closes #12.\n\nAlso fixed `src/b.ts`.',
    'Changed the following files: `x.ts`, `y.ts`. All tests pass.',
    'Merged at: 2026-07-01T00:00:00Z. Fixed `docs/z.md`.',
    'Nothing here asserts much, but updated `w.ts`.',
  ];
  const selected = bodies.map((b, i) =>
    selectedPr(i + 1, `example-org/example-repo-${i}`, 10 + i, b),
  );
  writeJson(p.selection, { selected, split: split(selected) });
  mkdirSync(p.bodies, { recursive: true });
  selected.forEach((s, i) => {
    writeFileSync(join(p.bodies, `example-org-example-repo-${i}-${s.number}.md`), bodies[i]);
  });
  const advisories = [
    [
      adv('Updated `src/a.ts` and closes #12.', 'file_changed', 'src/a.ts', 'agrees', 'src/a.ts'),
      adv(
        'Updated `src/a.ts` and closes #12.',
        'reference_closes',
        '#12',
        'differs:not_closing',
        [],
      ),
      adv('Also fixed `src/b.ts`.', 'file_changed', 'src/b.ts', 'differs:declared_not_changed', []),
    ],
    [
      adv(
        'Changed the following files: `x.ts`, `y.ts`.',
        'file_changed',
        'x.ts',
        'agrees_by_name',
        'p/x.ts',
      ),
      adv('All tests pass.', 'tests_passed', true, 'unanswered:no_comparable_record_field'),
    ],
    [
      adv('Merged at: 2026-07-01T00:00:00Z.', 'merged_at', '2026-07-01T00:00:00Z', 'agrees'),
      adv('Fixed `docs/z.md`.', 'file_changed', 'docs/z.md', 'differs:declared_not_changed', []),
    ],
    [],
  ];
  const fixtures = Object.fromEntries(
    selected.map((s, i) => [
      `${s.repository}#${s.number}`,
      record({ bundle, body: bodies[i], advisories: advisories[i] }),
    ]),
  );
  const fixturesPath = join(p.dir, 'fixtures.json');
  writeJson(fixturesPath, fixtures);
  const env = {
    DUNSTAN_READ_TOKEN: 'read-only',
    GH_TOKEN: 'other',
    FAKE_FIXTURES: fixturesPath,
    PATH: process.env.PATH,
  };
  freeze({
    dunstan,
    checkerVersion: '0.1.4',
    extractorVersion: '0.1.4',
    extractorDigest: EXTRACTOR,
    sourceCommit: SHA,
    p,
    now,
  });
  return { p, dunstan, bundle, bodies, selected, fixturesPath, env };
}

const committed = () => 'c'.repeat(40);
const uncommitted = () => null;

describe('run.mjs: the instrument, sealed per half', () => {
  it('pins the baseline to public v0.1.3', () => {
    expect(BASELINE).toEqual({
      name: 'baseline',
      checkerVersion: '0.1.3',
      bundleSha256: 'fd1377c058a928bf30e54c000bfb19e5eb3cd5eb71408ea4b093cc9ccf7170a5',
      extractorVersion: '0.1.3',
      extractorDigest: '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
      comparison: '0.2.0',
    });
  });

  it('refuses a bundle that is not the instrument', () => {
    const { p, dunstan, env } = study();
    expect(() =>
      checkHalf({ instrument: 'baseline', half: 'dev', dunstan, p, env, committed }),
    ).toThrow(/the baseline instrument is fd1377c0/);
  });

  it('refuses the fixed instrument until frozen.json is committed', () => {
    const { p, dunstan, env } = study();
    expect(() =>
      checkHalf({ instrument: 'fixed', half: 'dev', dunstan, p, env, committed: uncommitted }),
    ).toThrow(/not committed/);
    expect(instrumentFor('fixed', p, committed).frozenCommit).toBe('c'.repeat(40));
    expect(() =>
      freeze({
        dunstan,
        checkerVersion: 'x',
        extractorVersion: 'x',
        extractorDigest: EXTRACTOR,
        sourceCommit: SHA,
        p,
      }),
    ).toThrow(/never redone/);
  });

  it('refuses without the read-only token', () => {
    const { p, dunstan, env } = study();
    const { DUNSTAN_READ_TOKEN: _, ...rest } = env;
    expect(() =>
      checkHalf({ instrument: 'fixed', half: 'dev', dunstan, p, env: rest, committed }),
    ).toThrow(/DUNSTAN_READ_TOKEN/);
  });

  it('runs each pull request of the half, seals the records and passes only the read token', () => {
    const { p, dunstan, env, selected, fixturesPath } = study();
    // One test pull request has no fixture: the fake checker writes nothing, and it is tried twice.
    const fixtures = readJson(fixturesPath);
    const missing = selectedIn(readJson(p.selection), 'test')[0];
    delete fixtures[`${missing.repository}#${missing.number}`];
    writeJson(fixturesPath, fixtures);
    for (const half of ['dev', 'test']) {
      checkHalf({ instrument: 'fixed', half, dunstan, p, env, committed, now });
    }
    const seal = readJson(join(p.runs, 'fixed-dev.seal.json'));
    expect(seal.records).toHaveLength(2);
    for (const r of seal.records) {
      const bytes = readFileSync(join(p.records, 'fixed-dev', r.file));
      expect(r.sha256).toBe(sha256(bytes));
      expect(r.exit).toBe(2);
      expect(JSON.parse(bytes.toString('utf8')).env).toEqual({ github: 'read-only', gh: null });
    }
    const testSeal = readJson(join(p.runs, 'fixed-test.seal.json'));
    expect(
      testSeal.records.find((r) => r.pr === `${missing.repository}#${missing.number}`),
    ).toEqual({
      pr: `${missing.repository}#${missing.number}`,
      error: 'no record; exit 3',
    });
    // The seal holds digests and nothing a record says.
    expect(JSON.stringify(testSeal)).not.toMatch(/src\/|closes|differs/);
    expect(() =>
      checkHalf({ instrument: 'fixed', half: 'dev', dunstan, p, env, committed }),
    ).toThrow(/never redone/);
    expect(selected).toHaveLength(4);
  });

  it('opens a sealed run: ids, notes and clause offsets, and no text', () => {
    const { p, dunstan, env, bodies, selected } = study();
    checkHalf({ instrument: 'fixed', half: 'dev', dunstan, p, env, committed, now });
    checkHalf({ instrument: 'fixed', half: 'test', dunstan, p, env, committed, now });
    expect(() =>
      indexHalf({ instrument: 'fixed', half: 'test', p, committed: uncommitted }),
    ).toThrow(/opened only after frozen.json is committed/);
    const dev = indexHalf({ instrument: 'fixed', half: 'dev', p, committed });
    const test = indexHalf({ instrument: 'fixed', half: 'test', p, committed });
    const all = [...dev.prs, ...test.prs];
    expect(all).toHaveLength(4);
    const first = all.find((x) => x.pr === `${selected[0].repository}#${selected[0].number}`);
    expect(first.reportIsSelectedBody).toBe(true);
    expect(first.advisories.map((a) => [a.advisoryId, a.kind, a.note])).toEqual([
      [`fixed:${first.pr}:0`, 'file_changed', 'agrees'],
      [`fixed:${first.pr}:1`, 'reference_closes', 'differs:not_closing'],
      [`fixed:${first.pr}:2`, 'file_changed', 'differs:declared_not_changed'],
    ]);
    // Offsets are code points: the emoji before the clause is one.
    const cp = [...bodies[0]];
    const { start, end } = first.advisories[0].clause;
    expect(cp.slice(start, end).join('')).toBe('Updated\n  `src/a.ts` and   closes #12.');
    expect(JSON.stringify(readJson(join(p.runs, 'fixed-dev.json')))).not.toMatch(/src\/|`|Updated/);
  });

  it('refuses a record that is not the sealed one or not the instrument', () => {
    const { p, dunstan, env, fixturesPath } = study();
    checkHalf({ instrument: 'fixed', half: 'dev', dunstan, p, env, committed, now });
    const seal = readJson(join(p.runs, 'fixed-dev.seal.json'));
    const path = join(p.records, 'fixed-dev', seal.records[0].file);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, `${original} `);
    expect(() => indexHalf({ instrument: 'fixed', half: 'dev', p, committed })).toThrow(
      /not the record the seal holds/,
    );
    writeFileSync(path, original);
    expect(indexHalf({ instrument: 'fixed', half: 'dev', p, committed }).prs).toHaveLength(2);

    // A record from another extractor, sealed as it stands, is still refused.
    const q = study();
    const fixtures = readJson(q.fixturesPath);
    for (const key of Object.keys(fixtures))
      fixtures[key].predicate.advisory.extractor.digest.sha256 = 'f'.repeat(64);
    writeJson(q.fixturesPath, fixtures);
    checkHalf({
      instrument: 'fixed',
      half: 'dev',
      dunstan: q.dunstan,
      p: q.p,
      env: q.env,
      committed,
      now,
    });
    expect(() => indexHalf({ instrument: 'fixed', half: 'dev', p: q.p, committed })).toThrow(
      /extractor f{64}, not/,
    );
    expect(fixturesPath).not.toBe(q.fixturesPath);
  });

  it('locates a clause by its words, however the whitespace ran', () => {
    expect(locateClause('a b\n\tc d', 'b c')).toEqual({ start: 2, end: 6 });
    expect(locateClause('x 😀 y (z) w', '(z) w')).toEqual({ start: 6, end: 11 });
    expect(locateClause('abc', 'not there')).toBeNull();
    // A clause cut at 300 code units is located by what it keeps.
    const words = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    const clause = `${words.slice(0, 299)}…`;
    expect(clause).toHaveLength(300);
    const at = locateClause(`lead ${words.replaceAll(' ', '\n ')}`, clause);
    expect(at.start).toBe(5);
    expect(at.end).toBeGreaterThan(299 + 5);
  });
});

// ---------------------------------------------------------------------------------------------

const index = (run, prs) => ({ run, instrument: {}, prs, errors: [] });
const prOf = (run, pr, notes) => ({
  pr,
  advisories: notes.map((note, i) => ({
    advisoryId: `${run.split('-')[0]}:${pr}:${i}`,
    kind: 'file_changed',
    note,
    clause: { start: i, end: i + 1 },
  })),
});

describe('sample.mjs: M1 sample', () => {
  it('takes the first 60 by SHA-256 of seed and id, and is reproducible', () => {
    const ix = index('baseline-dev', [
      prOf('baseline-dev', 'o/r#1', Array(50).fill('agrees')),
      prOf('baseline-dev', 'o/s#2', Array(50).fill('unanswered:no_comparable_record_field')),
    ]);
    const s = drawSample(ix);
    expect(M1_SEED).toBe('open-source-advisory-2026-10/M1/2026-10-07');
    expect(s.size).toBe(M1_SIZE);
    expect(s.population).toBe(100);
    expect(s.advisoryIds).toHaveLength(60);
    const keys = s.advisoryIds.map((id) => sha256(Buffer.from(`${M1_SEED}:${id}`, 'utf8')));
    expect(keys).toEqual(keys.toSorted());
    expect(drawSample(ix, 'another seed').advisoryIds).not.toEqual(s.advisoryIds);
    expect(
      drawSample(index('baseline-dev', [prOf('baseline-dev', 'o/r#1', ['agrees'])])).advisoryIds,
    ).toHaveLength(1);
  });

  it('is written once, then checked against the seed', () => {
    const p = scratch();
    mkdirSync(p.runs, { recursive: true });
    writeJson(
      join(p.runs, 'baseline-dev.json'),
      index('baseline-dev', [prOf('baseline-dev', 'o/r#1', ['agrees', 'agrees'])]),
    );
    expect(writeSample({ instrument: 'baseline', half: 'dev', p }).wrote).toBe(true);
    expect(writeSample({ instrument: 'baseline', half: 'dev', p }).wrote).toBe(false);
    const path = join(p.samples, 'baseline-dev.m1.json');
    writeJson(path, { ...readJson(path), advisoryIds: [] });
    expect(() => writeSample({ instrument: 'baseline', half: 'dev', p })).toThrow(/differs/);
  });
});

// ---------------------------------------------------------------------------------------------

describe('worksheet.mjs: the adjudication worksheet and the published labels', () => {
  function opened() {
    const s = study();
    checkHalf({
      instrument: 'fixed',
      half: 'dev',
      dunstan: s.dunstan,
      p: s.p,
      env: s.env,
      committed,
      now,
    });
    indexHalf({ instrument: 'fixed', half: 'dev', p: s.p, committed });
    writeSample({ instrument: 'fixed', half: 'dev', p: s.p });
    return s;
  }

  it('lists M1 sample lines blind to the record, and every differs as an M2 line', () => {
    const { p } = opened();
    const { lines } = buildWorksheet({ half: 'dev', p });
    const ix = readJson(join(p.runs, 'fixed-dev.json'));
    const all = ix.prs.flatMap((x) => x.advisories);
    const m1 = lines.filter((l) => l.measure === 'M1');
    const m2 = lines.filter((l) => l.measure === 'M2');
    expect(m1).toHaveLength(all.length);
    expect(m2.map((l) => l.advisoryId).toSorted()).toEqual(
      all
        .filter((a) => a.note.startsWith('differs:'))
        .map((a) => a.advisoryId)
        .toSorted(),
    );
    for (const l of m1) {
      expect(l).not.toHaveProperty('note');
      expect(l).not.toHaveProperty('observed');
      expect(l.allowed).toEqual(['real', 'not_real']);
    }
    for (const l of m2) {
      expect(l.note).toMatch(/^differs:/);
      expect(l.allowed).toEqual(['false_claim', 'claim_holds', 'not_a_claim']);
      expect(l.page).toMatch(/^https:\/\/github\.com\/example-org\/example-repo-\d\/pull\/\d+$/);
    }
  });

  it('publishes labelled lines without text, keeps labels on rebuild and never changes one', () => {
    const { p } = opened();
    const { path, lines } = buildWorksheet({ half: 'dev', p });
    lines[0].label = lines[0].allowed[0];
    lines[0].adjudicatedAt = '2026-10-20T10:00:00Z';
    writeJsonl(path, lines);
    expect(buildWorksheet({ half: 'dev', p }).lines[0].label).toBe(lines[0].allowed[0]);
    const { labelled, open } = publishLabels({ half: 'dev', p });
    expect([labelled, open]).toEqual([1, lines.length - 1]);
    const [published] = readJsonl(join(p.labels, 'dev.jsonl'));
    expect(Object.keys(published)).toEqual([
      'pr',
      'advisoryId',
      'clause',
      'measure',
      'label',
      'adjudicatedAt',
    ]);
    expect(published.clause).toEqual(lines[0].clause);

    lines[0].label = lines[0].allowed[1];
    writeJsonl(path, lines);
    expect(() => publishLabels({ half: 'dev', p })).toThrow(/never changed/);
    lines[0].label = 'maybe';
    writeJsonl(path, lines);
    expect(() => publishLabels({ half: 'dev', p })).toThrow(/is not one of/);
    lines[0].label = lines[0].allowed[0];
    lines[0].adjudicatedAt = 'yesterday';
    writeJsonl(path, lines);
    expect(() => publishLabels({ half: 'dev', p })).toThrow(/adjudicatedAt/);
  });

  it('refuses an advisory that is a claim under one measure and not under the other', () => {
    const p = scratch();
    mkdirSync(p.worksheets, { recursive: true });
    const at = '2026-10-20T10:00:00Z';
    const line = (measure, label) => ({
      pr: 'o/r#1',
      advisoryId: 'fixed:o/r#1:0',
      clause: null,
      measure,
      label,
      adjudicatedAt: at,
    });
    writeJsonl(join(p.worksheets, 'dev.jsonl'), [line('M1', 'real'), line('M2', 'not_a_claim')]);
    expect(() => publishLabels({ half: 'dev', p })).toThrow(/disagree/);
    writeJsonl(join(p.worksheets, 'dev.jsonl'), [
      line('M1', 'not_real'),
      line('M2', 'claim_holds'),
    ]);
    expect(() => publishLabels({ half: 'dev', p })).toThrow(/disagree/);
    writeJsonl(join(p.worksheets, 'dev.jsonl'), [
      line('M1', 'not_real'),
      line('M2', 'not_a_claim'),
    ]);
    expect(publishLabels({ half: 'dev', p }).labelled).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------

describe('figures.mjs: M1 to M3 with Wilson intervals', () => {
  it('computes Wilson 95% intervals that match the published figures', () => {
    // src/advisory/precision.ts carries these to five places.
    expect(wilson(24, 30)).toEqual({ low: 0.62694, high: 0.90495 });
    expect(wilson(0, 20)).toEqual({ low: 0, high: 0.16113 });
    expect(wilson(0, 44)).toEqual({ low: 0, high: 0.0803 });
    // Zero false accusations meets the bar's 0.05 only from 73 checkable advisories.
    expect(wilson(0, 73).high).toBeLessThanOrEqual(0.05);
    expect(wilson(0, 72).high).toBeGreaterThan(0.05);
    expect(wilson(0, 0)).toBeNull();
    expect(() => wilson(3, 2)).toThrow();
  });

  const run = 'fixed-test';
  const ix = index(run, [
    prOf(run, 'o/a#1', ['agrees', 'differs:not_found', 'unanswered:no_comparable_record_field']),
    prOf(run, 'o/b#2', ['differs:declared_not_changed', 'differs:not_closing', 'agrees_by_name']),
    prOf(run, 'o/c#3', []),
    prOf(run, 'o/d#4', ['unanswered:no_comparable_record_field']),
  ]);
  const sample = { advisoryIds: ['fixed:o/a#1:0', 'fixed:o/a#1:2', 'fixed:o/b#2:1'] };
  const label = (advisoryId, measure, l) => ({
    pr: advisoryId.split(':')[1],
    advisoryId,
    clause: null,
    measure,
    label: l,
    adjudicatedAt: '2026-10-20T10:00:00Z',
  });
  const labels = [
    label('fixed:o/a#1:0', 'M1', 'real'),
    label('fixed:o/a#1:2', 'M1', 'not_real'),
    label('fixed:o/b#2:1', 'M1', 'real'),
    label('fixed:o/a#1:1', 'M2', 'false_claim'),
    label('fixed:o/b#2:0', 'M2', 'claim_holds'),
    label('fixed:o/b#2:1', 'M2', 'not_a_claim'),
    // Another run's label in the same half's file is not this run's.
    label('baseline:o/a#1:0', 'M1', 'real'),
  ];

  it('computes M1, M2, M3 and the descriptive figures', () => {
    const f = computeFigures({ index: ix, sample, labels });
    expect(f.M1).toMatchObject({ k: 2, n: 3, value: 0.66667 });
    expect(f.M2.differs).toBe(3);
    expect([f.M2.false_claim.k, f.M2.claim_holds.k, f.M2.not_a_claim.k]).toEqual([1, 1, 1]);
    expect(f.M3).toMatchObject({ falseAccusations: 2, checkable: 5, k: 2, n: 5, value: 0.4 });
    expect(f.M3.wilson95).toEqual(wilson(2, 5));
    expect(f.descriptive.advisories).toBe(7);
    expect(f.descriptive.advisoriesPerPr).toEqual({
      mean: 1.75,
      median: 2,
      max: 3,
      histogram: { 0: 1, 1: 1, 3: 2 },
    });
    expect(f.descriptive.checkableShare).toMatchObject({ k: 5, n: 7 });
    expect(f.descriptive.prsWithCheckable).toMatchObject({ k: 2, n: 4 });
    expect(f.bar).toMatchObject({ applies: true, m3Met: false, m2Met: false, met: false });
  });

  it('refuses, computing nothing, when a label is missing, extra or doubled', () => {
    const missing = labels.filter((l) => l.advisoryId !== 'fixed:o/b#2:0');
    expect(() => computeFigures({ index: ix, sample, labels: missing })).toThrow(MissingLabels);
    try {
      computeFigures({ index: ix, sample, labels: missing });
    } catch (e) {
      expect(e.missing).toEqual(['fixed:o/b#2:0 M2']);
    }
    expect(() =>
      computeFigures({
        index: ix,
        sample,
        labels: [...labels, label('fixed:o/a#1:0', 'M2', 'false_claim')],
      }),
    ).toThrow(/no measure of fixed-test needs/);
    expect(() => computeFigures({ index: ix, sample, labels: [...labels, labels[0]] })).toThrow(
      /labelled twice/,
    );
  });

  it('meets the bar only on fixed-test, with the M3 bound at most 0.05 and false claims at least 0.80', () => {
    expect(BAR).toEqual({ m3WilsonHighAtMost: 0.05, m2FalseClaimShareAtLeast: 0.8 });
    // 80 checkable, 5 differs of which 4 are false claims and 1 a false accusation.
    const notes = [...Array(75).fill('agrees'), ...Array(5).fill('differs:not_found')];
    const big = (r) => index(r, [prOf(r, 'o/a#1', notes)]);
    const m2 = (r, fa) =>
      [0, 1, 2, 3, 4].map((i) =>
        label(
          `${r.split('-')[0]}:o/a#1:${75 + i}`,
          'M2',
          i < 5 - fa ? 'false_claim' : 'not_a_claim',
        ),
      );
    const empty = { advisoryIds: [] };
    const met = computeFigures({
      index: big('fixed-test'),
      sample: empty,
      labels: m2('fixed-test', 0),
    });
    expect(met.bar).toMatchObject({ m3Met: true, m2Met: true, met: true });
    const one = computeFigures({
      index: big('fixed-test'),
      sample: empty,
      labels: m2('fixed-test', 1),
    });
    expect(one.M3.wilson95.high).toBeGreaterThan(0.05);
    expect(one.bar.met).toBe(false);
    expect(
      computeFigures({ index: big('fixed-dev'), sample: empty, labels: m2('fixed-dev', 0) }).bar,
    ).toEqual({ applies: false });
    expect(
      computeFigures({ index: big('baseline-test'), sample: empty, labels: m2('baseline-test', 0) })
        .bar,
    ).toEqual({
      applies: false,
    });
    // No differs: the false-claim share is undefined and the bar is not met.
    const none = computeFigures({
      index: index('fixed-test', [prOf('fixed-test', 'o/a#1', Array(80).fill('agrees'))]),
      sample: empty,
      labels: [],
    });
    expect(none.M2.false_claim.value).toBeNull();
    expect(none.bar.met).toBe(false);
  });

  it('writes figures/<run>.json from the files', () => {
    const p = scratch();
    for (const d of [p.runs, p.samples, p.labels]) mkdirSync(d, { recursive: true });
    writeJson(join(p.runs, `${run}.json`), ix);
    writeJson(join(p.samples, `${run}.m1.json`), sample);
    writeJsonl(join(p.labels, 'test.jsonl'), labels);
    const f = writeFigures({ instrument: 'fixed', half: 'test', p });
    expect(readJson(join(p.figures, `${run}.json`))).toEqual(f);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the preregistration states what the tools do', () => {
  const prereg = readFileSync(join(STUDY, 'preregistration.md'), 'utf8');
  it.each([
    ['the window', 'merged:2026-06-01..2026-10-06'],
    ['the stars threshold', '`stargazers_count >= 200`'],
    ['the body minimum', 'at least 300'],
    ['the sample size', String(M1_SIZE)],
    ['the seed', M1_SEED],
    ['the baseline bundle', BASELINE.bundleSha256],
    ['the baseline grammar', BASELINE.extractorDigest],
    ['the bar', '0.05'],
    ['the bar', '0.80'],
    ...AGENTS.map((a) => ['an agent qualifier', a.qualifier]),
    ...EXCLUDED_REPOSITORIES.map((r) => ['an excluded repository', r]),
  ])('%s: %s', (_, text) => {
    expect(prereg).toContain(text);
  });
});

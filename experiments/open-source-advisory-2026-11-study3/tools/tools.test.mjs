// Study 3's tools, on synthetic fixtures only: a fake GitHub (search and repository metadata) for
// select.mjs, a fake checker that writes records for run.mjs, and scratch git checkouts. No test
// reaches the network: fetch throws.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXCLUDED_REPOSITORIES } from '../../open-source-advisory-2026-10/tools/select.mjs';
import {
  AGENTS,
  BAR,
  BLOCKS,
  blockWeeks,
  DEMO_SELECTION,
  fileStem,
  INSTRUMENT,
  KINDS,
  M1_SIZE,
  mostAccusedAllowed,
  paths,
  prName,
  QUALIFIERS,
  REFUTE,
  REPLICATES,
  ROOT,
  RULE,
  readJson,
  readJsonl,
  SIGNING_DATE,
  STUDY,
  STUDY1_SELECTION,
  STUDY2_SELECTION,
  seed,
  sha256,
  share,
  signingDate,
  WANTED,
  WEEKS,
  WORK_DONE,
  wilson,
  writeJson,
  writeJsonl,
} from './common.mjs';
import {
  bootstrap,
  computeFigures,
  drawIndex,
  MissingLabels,
  quantile,
  writeFigures,
} from './figures.mjs';
import {
  CLOSES_ROWS,
  checkAll,
  checkInstrument,
  closesRow,
  indexAll,
  instrumentFault,
} from './run.mjs';
import { drawM1, drawPrimary, writeSamples } from './sample.mjs';
import {
  demoRepositories,
  HttpError,
  MIN_BODY,
  MIN_STARS,
  nextBlock,
  pinnedRepositories,
  RESULT_CAP,
  ruleRefusal,
  selectBlock,
  writeSelection,
} from './select.mjs';
import { buildWorksheets, outputFault, publishLabels } from './worksheet.mjs';

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('a test reached for the network');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const scratch = () => paths(mkdtempSync(join(tmpdir(), 'study3-')));
const SHA = 'a'.repeat(40);
const SIGNED = '2026-10-20';
const prereg = readFileSync(join(STUDY, 'preregistration.md'), 'utf8');

// A git command in `cwd` that can commit in a scratch checkout.
const gitAt =
  (cwd) =>
  (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=study3',
        '-c',
        'user.email=study3@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

// ---------------------------------------------------------------------------------------------
// A fake GitHub: per week start and agent, an ordered list of search items; per repository, its
// metadata. Every path asked for is logged.

function fakeGitHub({ weekItems = {}, repos = {} } = {}) {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    if (path.startsWith('/search/issues?')) {
      const params = new URLSearchParams(path.slice('/search/issues?'.length));
      const q = params.get('q');
      const agent = AGENTS.find((a) => q.endsWith(` ${a.qualifier}`));
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

// Each body holds a marker word, so a test can show no file copies a body.
const MARK = 'Quokka';
const longBody = (n = MIN_BODY) => `${MARK} ${'x'.repeat(n - MARK.length - 1)}`;
let counter = 0;
const item = (repository, body = longBody()) => {
  counter++;
  return {
    html_url: `https://github.com/${repository}/pull/${counter}`,
    repository_url: `https://api.github.com/repos/${repository}`,
    number: counter,
    user: { login: 'agent[bot]' },
    created_at: '2026-10-08T00:00:00Z',
    pull_request: { merged_at: '2026-10-09T00:00:00Z' },
    body,
  };
};
const reposOf = (...lists) =>
  Object.fromEntries(lists.flat().map((i) => [i.repository_url.split('/repos/')[1], {}]));
const searches = (calls) =>
  calls
    .filter((c) => c.startsWith('/search/issues?'))
    .map((c) => new URLSearchParams(c.split('?')[1]));

// A clock from `start`, one second a tick.
const clock = (start) => {
  let t = Date.parse(start);
  return () => {
    const at = new Date(t).toISOString();
    t += 1000;
    return at;
  };
};
const BLOCK1_DAY = '2026-11-09T00:00:00Z';
const BLOCK2_DAY = '2026-11-23T00:00:00Z';
const block1Weeks = WEEKS.filter((w) => w.block === 1);
const block2Weeks = WEEKS.filter((w) => w.block === 2);

// One block, with the study's exclusions replaced by small lists, signed and with the rule commit
// accepted, unless a test says otherwise.
const run = (get, opts = {}) =>
  selectBlock({
    get,
    block: 1,
    ruleCommit: SHA,
    signed: SIGNED,
    ruleCheck: () => null,
    study1: [],
    study2: [],
    demo: EXCLUDED_REPOSITORIES,
    now: clock(BLOCK1_DAY),
    ...opts,
  });

describe('common.mjs: the fixed constants', () => {
  it('is the weeks table preregistration.md lists, digest for digest', () => {
    const rows = [
      ...prereg.matchAll(
        /^\| (\d) \| (\d) \| (\d{4}-\d{2}-\d{2}) \| (\d{4}-\d{2}-\d{2}) \| `([0-9a-f]{64})` \|$/gm,
      ),
    ].map((m) => ({
      block: Number(m[1]),
      order: Number(m[2]),
      start: m[3],
      end: m[4],
      sha256: m[5],
    }));
    expect(rows).toHaveLength(7);
    expect(rows).toEqual(
      WEEKS.map((w) => ({
        block: w.block,
        order: w.order,
        start: w.start,
        end: w.end,
        sha256: w.sha256,
      })),
    );
    for (const w of WEEKS) expect(w.sha256).toBe(sha256(Buffer.from(`week:${w.start}`, 'utf8')));
  });

  it('cuts each block into the partial week, then Monday-to-Sunday weeks, covering it exactly', () => {
    expect(BLOCKS).toEqual([
      { block: 1, start: '2026-10-07', end: '2026-11-08', searchFrom: '2026-11-09' },
      { block: 2, start: '2026-11-09', end: '2026-11-22', searchFrom: '2026-11-23' },
    ]);
    expect(blockWeeks(BLOCKS[0])).toEqual([
      { start: '2026-10-07', end: '2026-10-11' },
      { start: '2026-10-12', end: '2026-10-18' },
      { start: '2026-10-19', end: '2026-10-25' },
      { start: '2026-10-26', end: '2026-11-01' },
      { start: '2026-11-02', end: '2026-11-08' },
    ]);
    expect(blockWeeks(BLOCKS[1])).toEqual([
      { start: '2026-11-09', end: '2026-11-15' },
      { start: '2026-11-16', end: '2026-11-22' },
    ]);
    // Block 2 follows block 1, whatever the digests.
    expect(WEEKS.map((w) => w.block)).toEqual([1, 1, 1, 1, 1, 2, 2]);
    // Every week but the partial first one runs Monday to Sunday.
    const day = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
    for (const w of WEEKS.filter((x) => x.start !== BLOCKS[0].start)) {
      expect([day(w.start), day(w.end)]).toEqual([1, 0]);
    }
  });

  it('pins the instrument as preregistered', () => {
    expect(INSTRUMENT).toEqual({
      name: 'instrument',
      package: 'dunstan@0.1.7',
      checkerVersion: '0.1.7',
      bundleSha256: 'e735da0a9348ee515e061df164daa11ba78d2ffd1ae50031f21c70b50ff73707',
      extractorVersion: '0.1.3',
      extractorDigest: '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
      comparison: '0.4.0',
      spec: '0.1.4',
      sourceRepository: 'BargLabs/dunstan',
      sourceTag: 'v0.1.7',
      sourceCommit: 'a2989e56842cbf5b1d3fb1fbeb1a94371511b2ef',
    });
    expect(WANTED).toBe(350);
  });

  it('holds the date the operator signed on, as the "Signature" block states it, and every tool refuses an unsigned date', () => {
    const signature = prereg.slice(prereg.indexOf('\n## Signature\n'));
    expect(SIGNING_DATE).toBe(signature.match(/^Date: (\d{4}-\d{2}-\d{2})$/m)?.[1]);
    expect(signingDate()).toBe(SIGNING_DATE);
    expect(() => signingDate(null)).toThrow(/not signed/);
    expect(() => signingDate('20 October')).toThrow(/YYYY-MM-DD/);
    expect(signingDate(SIGNED)).toBe(SIGNED);
  });

  it('prints what each N can show: the most accused pull requests the bar allows', () => {
    expect(BAR).toEqual({ p2WilsonHighAtMost: 0.05, p1AtLeastTimesP2: 4 });
    const rows = [72, 73, 108, 130, 381].map((n) => {
      const most = mostAccusedAllowed(n);
      const next = most === null ? 0 : most + 1;
      return { n, most, next, nextHigh: wilson(next, n).high };
    });
    process.stdout.write(
      `Reachability, Wilson 95% upper bound at most ${BAR.p2WilsonHighAtMost}:\n${rows
        .map(
          (r) =>
            `  N ${r.n}: allows ${r.most ?? 'none, not even 0'}; ${r.next} accused gives an upper bound of ${r.nextHigh}\n`,
        )
        .join('')}`,
    );
    // "Size": cannot be met below 73 even with none; 0 at 108, 1 at 130, 10 at 381.
    expect(rows.map((r) => [r.n, r.most])).toEqual([
      [72, null],
      [73, 0],
      [108, 0],
      [130, 1],
      [381, 10],
    ]);
    for (const r of rows) expect(r.nextHigh).toBeGreaterThan(BAR.p2WilsonHighAtMost);
  });
});

// ---------------------------------------------------------------------------------------------

describe('select.mjs: the selection rule', () => {
  it('queries each week of block 1 in the hashed order, each agent from A, exactly as preregistered', async () => {
    const { get, calls } = fakeGitHub();
    const { selection } = await run(get);
    expect(searches(calls).map((p) => p.get('q'))).toEqual(
      block1Weeks.flatMap((w) =>
        AGENTS.map((a) => `is:pr is:merged is:public merged:${w.start}..${w.end} ${a.qualifier}`),
      ),
    );
    for (const p of searches(calls)) {
      expect([p.get('sort'), p.get('order'), p.get('per_page'), p.get('page')]).toEqual([
        'created',
        'asc',
        '100',
        '1',
      ]);
    }
    expect(selection.blocks.map((b) => b.block)).toEqual([1]);
    expect(selection.blocks[0].weeks.map((w) => w.start)).toEqual(block1Weeks.map((w) => w.start));
    for (const w of selection.blocks[0].weeks) {
      expect(w.queries.map((q) => q.agent)).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(w.exhaustedAgents).toEqual(['A', 'B', 'C', 'D', 'E']);
    }
    expect([selection.awaitingBlock2, selection.complete, selection.finalN]).toEqual([
      true,
      false,
      0,
    ]);
  });

  it('applies the filters in order, recording the first that fails, and reads no metadata of an excluded repository', async () => {
    const [w] = block1Weeks;
    const astral = (n) => `<!-- ${'c'.repeat(400)} -->\n ${MARK}${'😀'.repeat(n - MARK.length)} \n`;
    const short = `<!-- ${'c'.repeat(500)} -->  ${'y'.repeat(MIN_BODY - 1)}  `;
    const items = [
      item('BargLabs/anything'),
      item('fluidsynth/FLUIDSYNTH'),
      item('STUDY1-ORG/repo'),
      item('study2-org/REPO'),
      item('o/low'),
      item('o/fork'),
      item('o/archived'),
      item('o/private'),
      item('o/gone'),
      item('o/lowshort', short),
      item('o/short', short),
      item('o/astral', astral(MIN_BODY - 1)),
      item('o/edge', astral(MIN_BODY)),
      item('O/Edge', short),
      item('O/EDGE'),
    ];
    const repos = {
      'BargLabs/anything': {},
      'fluidsynth/FLUIDSYNTH': {},
      'STUDY1-ORG/repo': {},
      'study2-org/REPO': {},
      'o/low': { stargazers_count: MIN_STARS - 1 },
      'o/fork': { fork: true },
      'o/archived': { archived: true },
      'o/private': { private: true },
      'o/lowshort': { stargazers_count: MIN_STARS - 1 },
      'o/short': {},
      'o/astral': {},
      'o/edge': { stargazers_count: MIN_STARS },
      'O/Edge': {},
      'O/EDGE': {},
    };
    const { get, calls } = fakeGitHub({ weekItems: { [w.start]: { A: items } }, repos });
    const { selection, bodies } = await run(get, {
      study1: ['study1-org/Repo'],
      study2: ['Study2-Org/repo'],
    });
    expect(selection.candidates.map((c) => [c.repository, c.result])).toEqual([
      ['BargLabs/anything', { rejectedBy: 1, reason: 'repository owner is BargLabs' }],
      [
        'fluidsynth/FLUIDSYNTH',
        { rejectedBy: 1, reason: `repository is in ${DEMO_SELECTION.path}` },
      ],
      ['STUDY1-ORG/repo', { rejectedBy: 1, reason: `repository is in ${STUDY1_SELECTION.path}` }],
      ['study2-org/REPO', { rejectedBy: 1, reason: `repository is in ${STUDY2_SELECTION.path}` }],
      ['o/low', { rejectedBy: 2, reason: 'stargazers_count 199 < 200' }],
      ['o/fork', { rejectedBy: 2, reason: 'a fork' }],
      ['o/archived', { rejectedBy: 2, reason: 'archived' }],
      ['o/private', { rejectedBy: 2, reason: 'not public' }],
      ['o/gone', { rejectedBy: 2, reason: 'repository read returned HTTP 404' }],
      ['o/lowshort', { rejectedBy: 2, reason: 'stargazers_count 199 < 200' }],
      ['o/short', { rejectedBy: 3, reason: 'cleaned body 299 < 300' }],
      // 299 code points, 597 UTF-16 code units: code points are what is counted.
      ['o/astral', { rejectedBy: 3, reason: 'cleaned body 299 < 300' }],
      ['o/edge', 'selected'],
      ['O/Edge', { rejectedBy: 3, reason: 'cleaned body 299 < 300' }],
      ['O/EDGE', { rejectedBy: 4, reason: 'a PR from this repository is already selected' }],
    ]);
    for (const r of [
      'BargLabs/anything',
      'fluidsynth/FLUIDSYNTH',
      'STUDY1-ORG/repo',
      'study2-org/REPO',
    ]) {
      expect(calls).not.toContain(`/repos/${r}`);
    }
    // Only search results and repository metadata are read.
    for (const c of calls) expect(c).toMatch(/^\/search\/issues\?|^\/repos\/[^/]+\/[^/]+$/);
    const [s] = selection.selected;
    expect(s).toMatchObject({
      n: 1,
      block: 1,
      week: w.start,
      agent: 'A',
      repository: 'o/edge',
      stargazersCount: MIN_STARS,
      cleanedBodyLength: MIN_BODY,
      body: {
        sha256: sha256(Buffer.from(items[12].body, 'utf8')),
        codePoints: [...items[12].body].length,
      },
    });
    expect([...bodies.values()]).toEqual([items[12].body]);
    expect(selection.exclusions).toEqual({
      owners: ['BargLabs'],
      demo: { ...DEMO_SELECTION, repositories: EXCLUDED_REPOSITORIES },
      study1: { ...STUDY1_SELECTION, repositories: 1 },
      study2: { ...STUDY2_SELECTION, repositories: 1 },
    });
    expect(JSON.stringify(selection)).not.toContain(MARK);
  });

  it("excludes study 1's and study 2's repositories, read from the files their digests pin, and the demo's five", () => {
    const one = pinnedRepositories(STUDY1_SELECTION);
    expect(one).toHaveLength(300);
    expect(sha256(readFileSync(join(ROOT, STUDY1_SELECTION.path)))).toBe(
      '1593c3d9ac1c4dba9c6d00b0f8c150b69729969b95991a71bb7e931bb0566c36',
    );
    const two = pinnedRepositories(STUDY2_SELECTION);
    expect(two).toHaveLength(150);
    expect(new Set(two.map((r) => r.toLowerCase())).size).toBe(150);
    expect(sha256(readFileSync(join(ROOT, STUDY2_SELECTION.path)))).toBe(
      '9e9afd2efef95c3120934d56f6401fec997561c6a2e5700768472aafe903987d',
    );
    const p = scratch();
    writeJson(p.selection, { selected: [{ repository: 'o/r' }] });
    expect(() => pinnedRepositories(STUDY1_SELECTION, p.selection)).toThrow(
      /excludes .* at 1593c3d9/,
    );
    expect(() => pinnedRepositories(STUDY2_SELECTION, p.selection)).toThrow(
      /excludes .* at 9e9afd2e/,
    );
    expect(demoRepositories()).toEqual(EXCLUDED_REPOSITORIES);
    expect(EXCLUDED_REPOSITORIES).toHaveLength(5);
    expect(() => demoRepositories(p.selection)).toThrow(/not the five/);
  });

  it('selects round-robin within a week, skips an agent whose results ran out, then moves to the next week', async () => {
    const [w1, w2] = block1Weeks;
    const weekItems = {
      [w1.start]: {
        A: [item('BargLabs/x'), item('a/1'), item('a/2'), item('a/3')],
        B: [item('b/1')],
        E: [item('e/1'), item('e/2')],
      },
      [w2.start]: { B: [item('b/2')], A: [item('a/4')] },
    };
    const all = Object.values(weekItems).flatMap((byAgent) => Object.values(byAgent).flat());
    const { get } = fakeGitHub({ weekItems, repos: reposOf(all) });
    const { selection } = await run(get);
    expect(selection.selected.map((s) => [s.n, s.week, s.agent, s.repository])).toEqual([
      [1, w1.start, 'A', 'a/1'],
      [2, w1.start, 'B', 'b/1'],
      [3, w1.start, 'E', 'e/1'],
      [4, w1.start, 'A', 'a/2'],
      [5, w1.start, 'E', 'e/2'],
      [6, w1.start, 'A', 'a/3'],
      [7, w2.start, 'A', 'a/4'],
      [8, w2.start, 'B', 'b/2'],
    ]);
  });

  it('reads pages in order up to the 1,000-result cap, recording each page and its time', async () => {
    const [w] = block1Weeks;
    const many = Array.from({ length: 1200 }, (_, i) => item(`BargLabs/r${i}`));
    const { get, calls } = fakeGitHub({ weekItems: { [w.start]: { A: many } } });
    const { selection } = await run(get);
    const pagesA = searches(calls)
      .filter((p) => p.get('q').endsWith(AGENTS[0].qualifier) && p.get('q').includes(w.start))
      .map((p) => Number(p.get('page')));
    expect(pagesA).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const query = selection.blocks[0].weeks[0].queries[0];
    expect(query).toMatchObject({ agent: 'A', sort: 'created', order: 'asc', perPage: 100 });
    expect(query.pages.map((x) => [x.page, x.totalCount, x.items])).toEqual(
      Array.from({ length: 10 }, (_, i) => [i + 1, 1200, 100]),
    );
    expect(query.pages.every((x) => /^2026-11-09T/.test(x.runAt))).toBe(true);
    expect(selection.candidates).toHaveLength(RESULT_CAP);
  });

  it('stops at 350, queries no later week, never searches block 2, and writes selection.json once', async () => {
    const [w1, w2, w3] = block1Weeks;
    const first = Array.from({ length: 250 }, (_, i) => item(`f/r${i}`));
    const second = Array.from({ length: 150 }, (_, i) => item(`s/r${i}`));
    const weekItems = { [w1.start]: { A: first }, [w2.start]: { E: second } };
    const { get, calls } = fakeGitHub({ weekItems, repos: reposOf(first, second) });
    const result = await run(get);
    const { selection } = result;
    expect(selection.selected).toHaveLength(WANTED);
    expect([selection.complete, selection.awaitingBlock2, selection.finalN]).toEqual([
      true,
      false,
      350,
    ]);
    expect(selection.selected.at(-1).repository).toBe('s/r99');
    expect(selection.blocks[0].weeks.map((w) => w.start)).toEqual([w1.start, w2.start]);
    expect(searches(calls).some((p) => p.get('q').includes(w3.start))).toBe(false);
    // E's second page is never read: the stop came first.
    const e = selection.blocks[0].weeks[1].queries.find((q) => q.agent === 'E');
    expect(e.pages.map((x) => x.page)).toEqual([1]);
    expect(selection.rule).toEqual({ path: RULE, commit: SHA });

    const p = scratch();
    writeSelection(result, p);
    expect(readJson(p.selection)).toEqual(selection);
    const stem = `f-r0-${selection.selected[0].number}`;
    expect(readFileSync(join(p.bodies, `${stem}.md`), 'utf8')).toBe(first[0].body);
    expect(readFileSync(p.selection, 'utf8')).not.toContain(MARK);
    expect(() => writeSelection(result, p)).toThrow(/never redone/);

    // Block 2 is not searched once block 1 reached 350.
    expect(() => nextBlock(selection)).toThrow(/final/);
    const later = fakeGitHub();
    await expect(
      run(later.get, { block: 2, previous: selection, now: clock(BLOCK2_DAY) }),
    ).rejects.toThrow(/block 1 selected 350; block 2 runs only on fewer than 350/);
    expect(later.calls).toEqual([]);
  });

  it('searches block 2 only after a shortfall in block 1, keeps filter 4 across both, and writes the shortfall as "complete": false', async () => {
    const [b1w] = block1Weeks;
    const [b2w1, b2w2] = block2Weeks;
    const one = [item('k/1'), item('k/2')];
    const two = [item('K/1'), item('k/3')];
    const weekItems = { [b1w.start]: { C: one }, [b2w1.start]: { D: two } };
    const { get, calls } = fakeGitHub({ weekItems, repos: reposOf(one, two) });
    const first = await run(get);
    expect(first.selection).toMatchObject({ awaitingBlock2: true, complete: false, finalN: 2 });
    const p = scratch();
    writeSelection(first, p);
    expect(nextBlock(readJson(p.selection))).toBe(2);

    calls.length = 0;
    const second = await run(get, {
      block: 2,
      previous: readJson(p.selection),
      now: clock(BLOCK2_DAY),
    });
    expect(searches(calls).map((q) => q.get('q').match(/merged:(\S+)/)[1])).toEqual(
      [b2w1, b2w2].flatMap((w) => AGENTS.map(() => `${w.start}..${w.end}`)),
    );
    const { selection } = second;
    expect(selection.blocks.map((b) => [b.block, b.selected])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(selection.selected.map((s) => [s.n, s.block, s.repository])).toEqual([
      [1, 1, 'k/1'],
      [2, 1, 'k/2'],
      [3, 2, 'k/3'],
    ]);
    expect(selection.candidates.filter((c) => c.block === 2).map((c) => c.result)).toEqual([
      { rejectedBy: 4, reason: 'a PR from this repository is already selected' },
      'selected',
    ]);
    expect([selection.awaitingBlock2, selection.complete, selection.finalN]).toEqual([
      false,
      false,
      3,
    ]);
    // Block 2 is written only over the block 1 it ran on.
    const q = scratch();
    writeJson(q.selection, { ...first.selection, finalN: 1 });
    expect(() => writeSelection(second, q)).toThrow(/not the block 1/);
    writeSelection(second, p);
    expect(readJson(p.selection)).toEqual(selection);
    expect(() => nextBlock(selection)).toThrow(/final; nothing is widened/);
    await expect(
      run(get, { block: 2, previous: selection, now: clock(BLOCK2_DAY) }),
    ).rejects.toThrow(/already holds block 2/);
  });

  it('refuses each block before its date, and block 2 without block 1 or on another rule commit, reading nothing', async () => {
    const { get, calls } = fakeGitHub();
    await expect(run(get, { now: clock('2026-11-08T23:59:59Z') })).rejects.toThrow(
      /block 1 is searched no earlier than 2026-11-09/,
    );
    const short = (await run(get)).selection;
    calls.length = 0;
    await expect(
      run(get, { block: 2, previous: short, now: clock('2026-11-22T23:59:59Z') }),
    ).rejects.toThrow(/block 2 is searched no earlier than 2026-11-23/);
    await expect(run(get, { block: 2, now: clock(BLOCK2_DAY) })).rejects.toThrow(/block 1 first/);
    await expect(run(get, { previous: short })).rejects.toThrow(/block 1 is never redone/);
    await expect(
      run(get, { block: 2, previous: short, ruleCommit: 'b'.repeat(40), now: clock(BLOCK2_DAY) }),
    ).rejects.toThrow(/block 1 ran on rule commit a{40}, not b{40}/);
    await expect(run(get, { block: 3 })).rejects.toThrow(/blocks 1 and 2/);
    expect(calls).toEqual([]);
    expect(
      (await run(get, { block: 2, previous: short, now: clock(BLOCK2_DAY) })).selection.blocks,
    ).toHaveLength(2);
  });

  it('refuses before signing, and without a rule commit preregistration.md stands at, reading nothing', async () => {
    const { get, calls } = fakeGitHub();
    await expect(run(get, { signed: null })).rejects.toThrow(/not signed/);
    await expect(run(get, { ruleCommit: 'HEAD', ruleCheck: ruleRefusal })).rejects.toThrow(
      /rule-commit <40-hex sha>/,
    );
    await expect(run(get, { ruleCheck: () => 'not at that commit' })).rejects.toThrow(
      /not at that commit/,
    );
    expect(calls).toEqual([]);
  });

  it('accepts as the rule commit only the first SSH-signed commit carrying preregistration.md as it stands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'study3-git-'));
    const git = gitAt(dir);
    const path = 'x/preregistration.md';
    const at = (c) => ruleRefusal(c, { cwd: dir, path });
    // Commits the index with an SSH signature header, as `git commit -S` with an SSH key writes it.
    // The check reads the header, not the signature.
    const sign = (message) => {
      const body = [
        `tree ${git('write-tree')}`,
        `parent ${git('rev-parse', 'HEAD')}`,
        'author study3 <study3@example.com> 1791910651 +0000',
        'committer study3 <study3@example.com> 1791910651 +0000',
        'gpgsig -----BEGIN SSH SIGNATURE-----',
        ' U1NIU0lH',
        ' -----END SSH SIGNATURE-----',
        '',
        message,
        '',
      ].join('\n');
      const commit = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
        cwd: dir,
        input: body,
        encoding: 'utf8',
      }).trim();
      git('update-ref', 'HEAD', commit);
      return commit;
    };
    git('init', '-q');
    mkdirSync(join(dir, 'x'));
    writeFileSync(join(dir, path), 'rule, unsigned\n');
    git('add', '.');
    git('commit', '-q', '-m', 'unsigned');
    const unsigned = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, path), 'rule, signed\n');
    git('add', '.');
    const signed = sign('signed');
    writeFileSync(join(dir, 'other.txt'), 'other\n');
    git('add', '.');
    const again = sign('other, signed');
    writeFileSync(join(dir, 'other.txt'), 'other, again\n');
    git('commit', '-q', '-am', 'other');
    const later = git('rev-parse', 'HEAD');
    git('switch', '-q', '-c', 'side');
    git('commit', '-q', '--allow-empty', '-m', 'side');
    const side = git('rev-parse', 'HEAD');
    git('switch', '-q', '-');

    expect(at(signed)).toBeNull();
    expect(at(again)).toBe(`${again} is not the first commit carrying ${path}: its parent is`);
    expect(at(later)).toBe(`${later} is not SSH-signed`);
    expect(at(unsigned)).toBe(`${path} at ${unsigned} is not ${path} as it stands`);
    expect(at('f'.repeat(40))).toBe(`${'f'.repeat(40)} is not a commit here`);
    expect(at(side)).toBe(`${side} is not in the history of HEAD`);
    expect(at('abc')).toBe('--rule-commit <40-hex sha>');
    writeFileSync(join(dir, path), 'rule, signed, then edited\n');
    expect(at(signed)).toBe(`${path} has uncommitted changes`);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------------------------
// A fake checker: writes the record its fixtures give for <repo>#<pr>, with the tokens it was given,
// logs the call, prints to stdout and exits 2; or writes nothing and exits 3 when there is no
// fixture.

const FAKE = `// a fake dunstan
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const at = (f) => args[args.indexOf(f) + 1];
const fixtures = JSON.parse(readFileSync(process.env.FAKE_FIXTURES, 'utf8'));
const key = at('--repo') + '#' + at('--pr');
appendFileSync(process.env.FAKE_LOG, key + '\\n');
process.stdout.write('an advisory table nobody should see\\n');
const f = fixtures[key];
if (f === undefined || args[0] !== 'check' || !args.includes('--advisory') || !args.includes('--report-pr-body')) process.exit(3);
const env = (k) => process.env[k] ?? null;
writeFileSync(at('--out'), JSON.stringify({ ...f, env: { github: env('GITHUB_TOKEN'), gh: env('GH_TOKEN'), read: env('DUNSTAN_READ_TOKEN') } }));
process.exit(2);
`;

const adv = (clause, kind, value, note, observed = null) => ({
  clause,
  kind,
  value,
  observed,
  note,
});

function record({ frozen, repository, number, body, advisories, evidence = {} }) {
  return {
    predicate: {
      spec: '0.1.4',
      checker: {
        name: 'dunstan',
        version: frozen.checkerVersion,
        digest: { sha256: frozen.bundleSha256 },
      },
      report: { sha256: sha256(Buffer.from(body, 'utf8')) },
      subject: { repository, pullRequest: number },
      evidence,
      advisory: {
        extractor: { version: frozen.extractorVersion, digest: { sha256: frozen.extractorDigest } },
        comparison: { version: frozen.comparison },
        precision: null,
        differsAccuracy: null,
        pathsAtHead: [],
        advisories: structuredClone(advisories),
      },
    },
  };
}

const REPO = (i) => `example-org/example-repo-${i}`;
const ok = (ref, exists = true) => ({ kind: 'issue', ref, status: 'ok', exists });
const closed = (closer) => ({ at: '2026-10-08T12:00:00Z', closer });

// Each body holds the marker word; the first has an emoji before its clauses, so code-point offsets
// differ from UTF-16 ones.
const BODIES = [
  `🙂 ${MARK}. Closes #1. Closes #2. Closes #3. Closes #4. Closes #5. Closes #6. Closes #7. Closes #8. Closes #9. Closes #11. Closes #12.\n\nUpdated   \`src/a.ts\`.`,
  `${MARK}. Closes #1. All tests pass.`,
  `${MARK}. Closes #3.`,
  `${MARK}. Closes #1.`,
  `${MARK}. Closes #9.`,
];
const SELF = `${REPO(0)}#10`;
const COMMIT = 'c'.repeat(40);

// Per pull request: its advisories, its evidence and the row each closes advisory comes from.
const CASES = [
  {
    // Merged into the default branch: rows 1, 2, 3, 6 (three ways), 7 and 8, and three notes from
    // the steps before the table.
    advisories: [
      [adv('Closes #1.', 'reference_closes', '#1', 'agrees', { closing: [`${REPO(0)}#1`] }), 1],
      [
        adv('Closes #2.', 'reference_closes', '#2', 'agrees', {
          closing: [`${REPO(0)}#1`],
          closedBy: closed({ kind: 'pull_request', ref: SELF }),
        }),
        2,
      ],
      [
        adv('Closes #3.', 'reference_closes', '#3', 'agrees', {
          closing: [`${REPO(0)}#1`],
          closedBy: closed({ kind: 'commit', oid: COMMIT }),
        }),
        3,
      ],
      [adv('Closes #4.', 'reference_closes', '#4', 'unanswered:closing_event_unsettled'), 7],
      [adv('Closes #5.', 'reference_closes', '#5', 'differs:not_closing', { closing: [] }), 8],
      [adv('Closes #6.', 'reference_closes', '#6', 'unanswered:source_unreadable:issue'), 6],
      [
        adv(
          'Closes #7.',
          'reference_closes',
          '#7',
          'unanswered:source_unreadable:pull_request_commits',
        ),
        6,
      ],
      [
        adv('Closes #8.', 'reference_closes', '#8', 'differs:not_found', {
          closing: [],
          exists: false,
        }),
        null,
      ],
      [adv('Closes #9.', 'reference_closes', '#9', 'unanswered:source_unreadable:issue'), null],
      [
        adv(
          'Closes #11.',
          'reference_closes',
          '#11',
          'unanswered:evidence_field_unpopulated:closeEvents',
        ),
        6,
      ],
      [
        adv(
          'Closes #12.',
          'reference_closes',
          '#12',
          'unanswered:evidence_field_unpopulated:references',
        ),
        null,
      ],
      [adv('Updated `src/a.ts`.', 'file_changed', 'src/a.ts', 'agrees', 'src/a.ts'), undefined],
    ],
    evidence: {
      closingReferences: { status: 'ok', issues: [`${REPO(0)}#1`] },
      references: [
        ...[2, 3, 4, 5, 6, 7, 11].map((n) => ok(`${REPO(0)}#${n}`)),
        ok(`${REPO(0)}#8`, false),
        { kind: 'issue', ref: `${REPO(0)}#9`, status: 'unreadable', source: 'issue' },
      ],
    },
  },
  {
    // Open: row 4, and a kind with no record field.
    advisories: [
      [adv('Closes #1.', 'reference_closes', '#1', 'unanswered:closing_link_unsettled'), 4],
      [
        adv('All tests pass.', 'tests_passed', true, 'unanswered:no_comparable_record_field'),
        undefined,
      ],
    ],
    evidence: {
      closingReferences: { status: 'ok', issues: [] },
      references: [ok(`${REPO(1)}#1`)],
    },
  },
  {
    // Merged into a branch other than the default, the target open: row 5. Its body was edited
    // after selection.
    advisories: [
      [adv('Closes #3.', 'reference_closes', '#3', 'unanswered:closing_base_not_default'), 5],
    ],
    evidence: {
      closingReferences: { status: 'ok', issues: [] },
      references: [ok(`${REPO(2).toUpperCase()}#3`)],
    },
    edited: true,
  },
  {
    // The closing references unread: no row.
    advisories: [
      [
        adv(
          'Closes #1.',
          'reference_closes',
          '#1',
          'unanswered:source_unreadable:closing_references',
        ),
        null,
      ],
    ],
    evidence: { closingReferences: { status: 'unreadable', source: 'closing_references' } },
  },
  // The checker writes no record, twice: an error.
  { advisories: [], evidence: {}, none: true },
];

// A scratch study: the selected pull requests, their bodies, a fake checker and its instrument.
function study() {
  const p = scratch();
  const bundle = join(p.dir, 'fake-dunstan.mjs');
  writeFileSync(bundle, FAKE);
  const frozen = { ...INSTRUMENT, bundleSha256: sha256(readFileSync(bundle)) };
  const selected = BODIES.map((body, i) => ({
    n: i + 1,
    block: 1,
    week: block1Weeks[0].start,
    agent: 'A',
    url: `https://github.com/${REPO(i)}/pull/${10 + i}`,
    repository: REPO(i),
    number: 10 + i,
    stargazersCount: 500,
    cleanedBodyLength: [...body].length,
    body: { sha256: sha256(Buffer.from(body, 'utf8')), codePoints: [...body].length },
    selectedAt: '2026-11-09T00:00:00.000Z',
  }));
  writeJson(p.selection, { awaitingBlock2: false, complete: false, selected });
  mkdirSync(p.bodies, { recursive: true });
  selected.forEach((s, i) => {
    writeFileSync(join(p.bodies, `example-org-example-repo-${i}-${s.number}.md`), BODIES[i]);
  });
  const fixtures = Object.fromEntries(
    CASES.flatMap((c, i) =>
      c.none
        ? []
        : [
            [
              `${REPO(i)}#${10 + i}`,
              record({
                frozen,
                repository: REPO(i),
                number: 10 + i,
                body: c.edited ? `${BODIES[i]} Edited.` : BODIES[i],
                advisories: c.advisories.map(([a]) => a),
                evidence: c.evidence,
              }),
            ],
          ],
    ),
  );
  const fixturesPath = join(p.dir, 'fixtures.json');
  writeJson(fixturesPath, fixtures);
  const log = join(p.dir, 'calls.log');
  writeFileSync(log, '');
  const env = {
    DUNSTAN_READ_TOKEN: 'read-only',
    GH_TOKEN: 'other',
    GITHUB_TOKEN: 'a-write-token',
    FAKE_FIXTURES: fixturesPath,
    FAKE_LOG: log,
    PATH: process.env.PATH,
  };
  const check = () => checkAll({ instrument: bundle, p, env, frozen, now: clock(BLOCK2_DAY) });
  return { p, bundle, frozen, selected, fixtures, fixturesPath, env, log, check };
}

const committed = () => 'c'.repeat(40);
const uncommitted = () => null;

// A scratch checkout of the instrument's source: one commit, dist/ ignored as the real one ignores
// it. Returns the checkout, its commit and a build that writes `bytes` as the bundle.
function checkout() {
  const dir = mkdtempSync(join(tmpdir(), 'study3-dunstan-'));
  const git = gitAt(dir);
  git('init', '-q');
  writeFileSync(join(dir, '.gitignore'), 'dist/\n');
  writeFileSync(join(dir, 'package.json'), '{}\n');
  git('add', '.');
  git('commit', '-q', '-m', 'v0.1.7');
  const head = git('rev-parse', 'HEAD');
  const build =
    (bytes, status = 0) =>
    (cwd) => {
      if (bytes !== null) {
        mkdirSync(join(cwd, 'dist'), { recursive: true });
        writeFileSync(join(cwd, 'dist', 'dunstan.mjs'), bytes);
      }
      return status;
    };
  return { dir, head, build };
}

describe('run.mjs: the instrument', () => {
  // preregistration.md, "Instrument": the run tool's first test checks that the build of the
  // source commit reproduces the digest. It needs a checkout of BargLabs/dunstan at v0.1.7 with
  // its dependencies installed, so it runs only when STUDY3_DUNSTAN_CHECKOUT names one.
  it.skipIf(!process.env.STUDY3_DUNSTAN_CHECKOUT)(
    'builds the pinned bundle from BargLabs/dunstan at the source commit',
    () => {
      const result = checkInstrument({ checkout: process.env.STUDY3_DUNSTAN_CHECKOUT });
      expect(result).toMatchObject({
        sourceCommit: INSTRUMENT.sourceCommit,
        sha256: INSTRUMENT.bundleSha256,
      });
    },
    600_000,
  );

  it('accepts a checkout at the source commit, unchanged, whose build writes the pinned bundle', () => {
    const c = checkout();
    const bytes = 'the bundle\n';
    const frozen = { ...INSTRUMENT, sourceCommit: c.head, bundleSha256: sha256(bytes) };
    expect(checkInstrument({ checkout: c.dir, frozen, build: c.build(bytes) })).toEqual({
      bundle: join(c.dir, 'dist', 'dunstan.mjs'),
      sourceCommit: c.head,
      sha256: sha256(bytes),
    });
  });

  it('refuses another commit, a changed checkout, a failed build, no bundle or another digest', () => {
    const c = checkout();
    const bytes = 'the bundle\n';
    const frozen = { ...INSTRUMENT, sourceCommit: c.head, bundleSha256: sha256(bytes) };
    expect(() => checkInstrument({ checkout: c.dir, build: c.build(bytes) })).toThrow(
      `is at ${c.head}; the instrument's source is ${INSTRUMENT.sourceCommit}`,
    );
    writeFileSync(join(c.dir, 'package.json'), '{"changed": true}\n');
    expect(() => checkInstrument({ checkout: c.dir, frozen, build: c.build(bytes) })).toThrow(
      /has changes/,
    );
    gitAt(c.dir)('checkout', '-q', '--', 'package.json');
    expect(() => checkInstrument({ checkout: c.dir, frozen, build: c.build(bytes, 1) })).toThrow(
      /exited 1/,
    );
    const empty = checkout();
    expect(() =>
      checkInstrument({
        checkout: empty.dir,
        frozen: { ...frozen, sourceCommit: empty.head },
        build: empty.build(null),
      }),
    ).toThrow(/wrote no dist/);
    expect(() =>
      checkInstrument({ checkout: c.dir, frozen, build: c.build('another bundle\n') }),
    ).toThrow(`has SHA-256 ${sha256('another bundle\n')}; the instrument is ${sha256(bytes)}`);
    const notGit = mkdtempSync(join(tmpdir(), 'study3-plain-'));
    expect(() => checkInstrument({ checkout: notGit, frozen })).toThrow(/not a git checkout/);
    expect(() => checkInstrument({})).toThrow(/--checkout/);
  });
});

describe('run.mjs: check, then the seal', () => {
  it('refuses a bundle that is not the instrument, no read token, or a selection awaiting block 2', () => {
    const s = study();
    expect(() => checkAll({ instrument: s.bundle, p: s.p, env: s.env })).toThrow(
      `the instrument is ${INSTRUMENT.bundleSha256}`,
    );
    const { DUNSTAN_READ_TOKEN: _, ...rest } = s.env;
    expect(() => checkAll({ instrument: s.bundle, p: s.p, env: rest, frozen: s.frozen })).toThrow(
      /DUNSTAN_READ_TOKEN/,
    );
    writeJson(s.p.selection, { ...readJson(s.p.selection), awaitingBlock2: true });
    expect(s.check).toThrow(/awaits block 2/);
    expect(readFileSync(s.log, 'utf8')).toBe('');
  });

  it('runs each pull request once in selection order, retries one with no record after the rest, and passes only the read token', () => {
    const { p, selected, log, check } = study();
    const seal = check();
    const last = `${selected[4].repository}#${selected[4].number}`;
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      ...selected.map((s) => `${s.repository}#${s.number}`),
      last,
    ]);
    expect(seal.records).toHaveLength(5);
    for (const r of seal.records.slice(0, 4)) {
      const bytes = readFileSync(join(p.records, r.file));
      expect(r).toMatchObject({ sha256: sha256(bytes), attempts: 1, exit: 2 });
      expect(JSON.parse(bytes.toString('utf8')).env).toEqual({
        github: 'read-only',
        gh: null,
        read: null,
      });
    }
    expect(seal.records[4]).toEqual({ pr: last, error: 'no record; exit 3', attempts: 2 });
    expect(seal).toMatchObject({
      run: 'instrument',
      command:
        'node <dunstan> check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>',
    });
    // The seal holds digests, names and numbers, and nothing a record holds.
    expect(JSON.stringify(seal)).not.toMatch(/Quokka|Closes|src\/|differs|agrees|unanswered/);
    expect(check).toThrow(/never redone/);
  });

  it('keeps a record an interrupted run wrote, without checking that pull request again', () => {
    const { p, selected, fixtures, log, check } = study();
    const first = `${selected[0].repository}#${selected[0].number}`;
    mkdirSync(p.records, { recursive: true });
    writeJson(join(p.records, 'example-org-example-repo-0-10.json'), fixtures[first]);
    const seal = check();
    expect(readFileSync(log, 'utf8')).not.toContain(`${first}\n`);
    expect(seal.records[0]).toEqual({
      pr: first,
      file: 'example-org-example-repo-0-10.json',
      sha256: sha256(readFileSync(join(p.records, 'example-org-example-repo-0-10.json'))),
      attempts: 0,
    });
  });

  it('refuses a record whose checker, extractor digest or comparison version is not the instrument, sealing nothing', () => {
    expect(instrumentFault(record({ frozen: INSTRUMENT, body: '', advisories: [] }))).toBeNull();
    for (const [change, message] of [
      [
        (r) => {
          r.predicate.checker.version = '0.1.6';
        },
        /checker 0.1.6, not 0.1.7; nothing is sealed/,
      ],
      [
        (r) => {
          r.predicate.checker.digest.sha256 = 'd'.repeat(64);
        },
        /checker digest d{64}, not/,
      ],
      [
        (r) => {
          r.predicate.advisory.extractor.digest.sha256 = 'e'.repeat(64);
        },
        /extractor e{64}, not 2f9a1ed7/,
      ],
      [
        (r) => {
          r.predicate.advisory.comparison.version = '0.3.0';
        },
        /comparison 0.3.0, not 0.4.0/,
      ],
      [
        (r) => {
          delete r.predicate.advisory;
        },
        /no advisory section/,
      ],
    ]) {
      const s = study();
      change(s.fixtures[`${REPO(2)}#12`]);
      writeJson(s.fixturesPath, s.fixtures);
      expect(s.check).toThrow(message);
      expect(() => readFileSync(s.p.seal)).toThrow();
    }
  });
});

describe('run.mjs: the index', () => {
  it('opens nothing until the seal is committed, then indexes ids, kinds, notes, offsets, rows, errors and edited bodies, with no text', () => {
    const { p, frozen, selected, check } = study();
    check();
    expect(() => indexAll({ p, frozen, committed: uncommitted })).toThrow(
      /instrument.seal.json is not committed/,
    );
    const index = indexAll({ p, frozen, committed });
    expect(readJson(p.index)).toEqual(index);
    const name = (i) => `${selected[i].repository}#${selected[i].number}`;
    expect(index.prs.map((x) => x.pr)).toEqual([0, 1, 2, 3].map(name));
    expect(index.errors).toEqual([{ pr: name(4), error: 'no record; exit 3' }]);
    expect(index.editedSinceSelection).toEqual([name(2)]);
    expect(index.prs.map((x) => x.reportIsSelectedBody)).toEqual([true, true, false, true]);
    index.prs.forEach((x, i) => {
      expect(x.advisories.map((a) => [a.advisoryId, a.kind, a.note, a.closesRow])).toEqual(
        CASES[i].advisories.map(([a, row], j) => [`${name(i)}:${j}`, a.kind, a.note, row]),
      );
      for (const a of x.advisories) {
        if (a.kind !== 'reference_closes') expect(a).not.toHaveProperty('closesRow');
      }
    });
    // Every row of section 7.4's table, 1 to 8, is reached.
    const rows = index.prs.flatMap((x) => x.advisories.map((a) => a.closesRow));
    expect([...new Set(rows.filter((r) => typeof r === 'number'))].sort()).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(Object.keys(index.closesRow.rows)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(index.closesRow.rows).toEqual(CLOSES_ROWS);
    // Offsets are code points: the emoji before the clauses is one.
    const file = index.prs[0].advisories.at(-1).clause;
    expect([...BODIES[0]].slice(file.start, file.end).join('')).toBe('Updated   `src/a.ts`.');
    const first = index.prs[0].advisories[0].clause;
    expect([...BODIES[0]].slice(first.start, first.end).join('')).toBe('Closes #1.');
    expect(JSON.stringify(index)).not.toMatch(/Quokka|Closes #|src\/a|`/);
  });

  it('refuses a record that is not the sealed one, a seal of another instrument, or a seal of another selection', () => {
    const { p, frozen, check } = study();
    check();
    const seal = readJson(p.seal);
    const path = join(p.records, seal.records[0].file);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, `${original} `);
    expect(() => indexAll({ p, frozen, committed })).toThrow(/not the record the seal holds/);
    writeFileSync(path, original);
    expect(indexAll({ p, frozen, committed }).prs).toHaveLength(4);
    expect(() => indexAll({ p, committed })).toThrow(/the seal's instrument is not the instrument/);
    const selection = readJson(p.selection);
    writeJson(p.selection, { ...selection, selected: selection.selected.slice(1) });
    expect(() => indexAll({ p, frozen, committed })).toThrow(/selection order/);
  });
});

describe("run.mjs: each closes note's section 7.4 row", () => {
  const evidence = CASES[0].evidence;
  const row = (note, value = '#5', observed = null, e = evidence) =>
    closesRow(adv('Closes.', 'reference_closes', value, note, observed), e, REPO(0));

  it('maps every row of the table and every step before it', () => {
    expect(row('agrees', '#1', { closing: [`${REPO(0)}#1`] })).toBe(1);
    // A target transferred to an issue among the closing references: still row 1.
    expect(
      row('agrees', '#5', {
        closing: ['other/repo#2'],
        ref: `${REPO(0)}#5`,
        resolvedAs: 'other/repo#2',
      }),
    ).toBe(1);
    expect(
      row('agrees', '#2', { closing: [], closedBy: closed({ kind: 'pull_request', ref: SELF }) }),
    ).toBe(2);
    expect(
      row('agrees', '#3', { closing: [], closedBy: closed({ kind: 'commit', oid: COMMIT }) }),
    ).toBe(3);
    expect(row('unanswered:closing_link_unsettled')).toBe(4);
    expect(row('unanswered:closing_base_not_default')).toBe(5);
    expect(row('unanswered:source_unreadable:issue', '#6')).toBe(6);
    expect(row('unanswered:evidence_field_unpopulated:issueOrPullRequest', '#6')).toBe(6);
    expect(row('unanswered:closing_event_unsettled')).toBe(7);
    expect(row('differs:not_closing')).toBe(8);
    expect(row('differs:not_found', '#8')).toBeNull();
    expect(row('unanswered:source_unreadable:issue', '#9')).toBeNull();
    expect(row('unanswered:evidence_field_unpopulated:references', '#40')).toBeNull();
    expect(
      row('unanswered:evidence_field_unpopulated:closingReferences', '#1', null, {}),
    ).toBeNull();
    expect(
      row('unanswered:evidence_field_unpopulated:closingIssuesReferences', '#1', null, {
        closingReferences: { status: 'unpopulated', field: 'closingIssuesReferences' },
      }),
    ).toBeNull();
    expect(row('unanswered:no_comparable_record_field', 12)).toBeNull();
    // Owner and repository compare without regard to case; a qualified value is read as given.
    expect(row('differs:not_closing', `${REPO(0).toUpperCase()}#5`)).toBe(8);
  });

  it('refuses a note the record could not have given', () => {
    expect(() => row('differs:something_else')).toThrow(/no step of section 7.4/);
    expect(() => row('agrees', '#2', { closing: [], closedBy: closed({ kind: 'other' }) })).toThrow(
      /closer of kind other/,
    );
    expect(() => row('agrees', '#1', { closing: [] }, {})).toThrow(/closing references are unread/);
    expect(() => row('differs:not_found', '#5')).toThrow(/the target exists/);
    expect(() => row('differs:not_closing', '#9')).toThrow(/did not reach it/);
    expect(() => row('differs:not_closing', '#8')).toThrow(/did not reach it/);
    expect(() => row('unanswered:source_unreadable:repository', '#9')).toThrow(/another reason/);
    expect(() => row('unanswered:source_unreadable:issue', '#8')).toThrow(/does not exist/);
    expect(() => row('unanswered:source_unreadable:issue', '#1', null, {})).toThrow(
      /closing references give another reason/,
    );
    expect(() => row('agrees', 12)).toThrow(/not a reference/);
  });
});

// ---------------------------------------------------------------------------------------------
// An opened study: the sealed records written directly (the check above is tested already), then
// indexed by run.mjs. Pull request 0 has three differs advisories of three kinds, pull request 1
// three file differs, so its primary advisory is one of three; 2 has only an unanswered advisory and
// 3 none.

const OPEN_BODIES = [
  `🙂 ${MARK}. Updated \`src/a.ts\` and \`src/b.ts\`. Closes #5. All checks pass.`,
  `${MARK}. Updated \`src/c.ts\`, \`src/d.ts\` and \`src/e.ts\`.`,
  `${MARK}. All tests pass.`,
  `${MARK}. Nothing here is a claim the extractor reads.`,
];
const OPEN_CASES = [
  {
    advisories: [
      adv('Updated `src/a.ts`', 'file_changed', 'src/a.ts', 'agrees', 'src/a.ts'),
      adv('`src/b.ts`', 'file_changed', 'src/b.ts', 'differs:declared_not_changed'),
      adv('Closes #5.', 'reference_closes', '#5', 'differs:not_closing', { closing: [] }),
      adv('All checks pass.', 'checks_succeeded', true, 'differs:all_succeeded_mismatch', {
        allSucceeded: false,
      }),
    ],
    evidence: {
      closingReferences: { status: 'ok', issues: [] },
      references: [ok(`${REPO(0)}#5`)],
    },
  },
  {
    advisories: ['c', 'd', 'e'].map((f) =>
      adv(`\`src/${f}.ts\``, 'file_changed', `src/${f}.ts`, 'differs:declared_not_changed'),
    ),
  },
  {
    advisories: [
      adv('All tests pass.', 'tests_passed', true, 'unanswered:no_comparable_record_field'),
    ],
  },
  { advisories: [] },
];
const NOTE_WORDS = /differs|agrees|unanswered|declared_not_changed|not_closing|allSucceeded/;

function openStudy() {
  const p = scratch();
  const selected = OPEN_BODIES.map((body, i) => ({
    n: i + 1,
    repository: REPO(i),
    number: 10 + i,
    body: { sha256: sha256(Buffer.from(body, 'utf8')), codePoints: [...body].length },
  }));
  writeJson(p.selection, { awaitingBlock2: false, complete: true, selected });
  for (const dir of [p.bodies, p.records, p.runs]) mkdirSync(dir, { recursive: true });
  const records = selected.map((s, i) => {
    const file = `${fileStem(s)}.json`;
    const bytes = JSON.stringify(
      record({
        frozen: INSTRUMENT,
        repository: s.repository,
        number: s.number,
        body: OPEN_BODIES[i],
        advisories: OPEN_CASES[i].advisories,
        evidence: OPEN_CASES[i].evidence ?? {},
      }),
    );
    writeFileSync(join(p.records, file), bytes);
    writeFileSync(join(p.bodies, `${fileStem(s)}.md`), OPEN_BODIES[i]);
    return { pr: prName(s), file, sha256: sha256(bytes), attempts: 1 };
  });
  writeJson(p.seal, { run: 'instrument', instrument: INSTRUMENT, records });
  const index = indexAll({ p, committed });
  return { p, index };
}

const id = (i, j) => `${REPO(i)}#${10 + i}:${j}`;
const ALL_IDS = [id(0, 0), id(0, 1), id(0, 2), id(0, 3), id(1, 0), id(1, 1), id(1, 2), id(2, 0)];
const M2_LABELS = {
  [id(0, 1)]: 'not_a_claim',
  [id(0, 2)]: 'false_claim',
  [id(0, 3)]: 'claim_holds',
  [id(1, 0)]: 'false_claim',
  [id(1, 1)]: 'claim_holds',
  [id(1, 2)]: 'false_claim',
};
const LABELLED_AT = '2026-11-24T10:00:00Z';
const DONE_AT = '2026-11-24T11:00:00Z';

// Fills every worksheet line as the adjudicator would; `edit` may change any line after.
function label(p, edit = {}) {
  const fill = (name, f) => writeJsonl(p.sheets[name], readJsonl(p.sheets[name]).map(f));
  fill('M2', (l) => ({ ...l, label: M2_LABELS[l.advisoryId], adjudicatedAt: LABELLED_AT }));
  fill('M1', (l) => ({
    ...l,
    label: M2_LABELS[l.advisoryId] === 'not_a_claim' ? 'not_real' : 'real',
    adjudicatedAt: LABELLED_AT,
  }));
  fill('workDone', (l) => ({ ...l, label: 'done', adjudicatedAt: DONE_AT }));
  for (const [name, f] of Object.entries(edit)) fill(name, f);
}

// The digest a seeded draw orders by, computed here from the seed string, not by the tools.
const byHand = (s, x) => createHash('sha256').update(`${s}:${x}`, 'utf8').digest('hex');
const least = (s, xs) => [...xs].sort((a, b) => (byHand(s, a) < byHand(s, b) ? -1 : 1))[0];

describe('sample.mjs: the primary advisories and M1', () => {
  it('draws each from its seed string, reproduced here by hand', () => {
    const { index } = openStudy();
    const primarySeed = `open-source-advisory-2026-11-study3/primary/${SIGNED}`;
    const m1Seed = `open-source-advisory-2026-11-study3/M1/${SIGNED}`;
    expect(seed('primary', SIGNED)).toBe(primarySeed);
    expect(seed('M1', SIGNED)).toBe(m1Seed);
    expect(seed('bootstrap', SIGNED)).toBe(
      `open-source-advisory-2026-11-study3/bootstrap/${SIGNED}`,
    );
    const primary = drawPrimary(index, SIGNED);
    expect(primary.seed).toBe(primarySeed);
    expect(primary.differs).toBe(6);
    // At most one per pull request and kind, the least digest among its differs of that kind.
    expect(primary.primary).toEqual([
      { pr: `${REPO(0)}#10`, kind: 'file_changed', advisoryId: id(0, 1) },
      { pr: `${REPO(0)}#10`, kind: 'reference_closes', advisoryId: id(0, 2) },
      { pr: `${REPO(0)}#10`, kind: 'checks_succeeded', advisoryId: id(0, 3) },
      {
        pr: `${REPO(1)}#11`,
        kind: 'file_changed',
        advisoryId: least(primarySeed, [id(1, 0), id(1, 1), id(1, 2)]),
      },
    ]);
    // M1: every advisory, by digest, the first 60, so all eight here.
    const m1 = drawM1(index, SIGNED);
    expect(m1).toMatchObject({ seed: m1Seed, size: M1_SIZE, population: 8 });
    expect(m1.advisoryIds).toEqual(
      [...ALL_IDS].sort((a, b) => (byHand(m1Seed, a) < byHand(m1Seed, b) ? -1 : 1)),
    );
    expect(m1).not.toHaveProperty('run');
    // With more than 60, the first 60 by digest.
    const big = {
      prs: [
        {
          pr: 'o/r#1',
          advisories: Array.from({ length: 75 }, (_, j) => ({
            advisoryId: `o/r#1:${j}`,
            kind: 'commit',
            note: 'agrees',
          })),
        },
      ],
    };
    const ids = big.prs[0].advisories.map((a) => a.advisoryId);
    expect(drawM1(big, SIGNED).advisoryIds).toEqual(
      ids.sort((a, b) => (byHand(m1Seed, a) < byHand(m1Seed, b) ? -1 : 1)).slice(0, 60),
    );
  });

  it('refuses while unsigned and on an unknown kind, writes both files once, then checks them', () => {
    const { p, index } = openStudy();
    expect(() => writeSamples({ p, signed: null })).toThrow(/not signed/);
    expect(() => drawPrimary(index, null)).toThrow(/not signed/);
    expect(existsSync(p.primary)).toBe(false);
    const odd = structuredClone(index);
    odd.prs[0].advisories[0].kind = 'files';
    expect(() => drawPrimary(odd, SIGNED)).toThrow(/kind files is not a kind/);

    const first = writeSamples({ p, signed: SIGNED });
    expect(first.wrote).toEqual(['samples/primary.json', 'samples/m1.json']);
    expect(readJson(p.primary)).toEqual(drawPrimary(index, SIGNED));
    expect(readJson(p.m1)).toEqual(drawM1(index, SIGNED));
    expect(writeSamples({ p, signed: SIGNED }).wrote).toEqual([]);
    // Another signing date draws other samples: refused, and nothing is written.
    expect(() => writeSamples({ p, signed: '2026-10-21' })).toThrow(/differs from what its seed/);
    expect(readJson(p.primary)).toEqual(drawPrimary(index, SIGNED));
    expect(readFileSync(p.primary, 'utf8')).not.toMatch(/Quokka|src\//);
  });

  it('draws with SIGNING_DATE when given no date, as the CLIs are', () => {
    const { p, index } = openStudy();
    expect(drawPrimary(index).seed).toBe(
      `open-source-advisory-2026-11-study3/primary/${SIGNING_DATE}`,
    );
    expect(drawPrimary(index)).toEqual(drawPrimary(index, SIGNING_DATE));
    expect(drawM1(index)).toEqual(drawM1(index, SIGNING_DATE));
    writeSamples({ p });
    expect(readJson(p.primary)).toEqual(drawPrimary(index, SIGNING_DATE));
    expect(readJson(p.m1)).toEqual(drawM1(index, SIGNING_DATE));
    expect(buildWorksheets({ p })).toEqual(buildWorksheets({ p, signed: SIGNING_DATE }));
  });
});

describe('worksheet.mjs: the blind worksheets', () => {
  it('shows nothing of the draw in the M2 worksheet, no note in M1, and no advisory in "work done"', () => {
    const { p } = openStudy();
    writeSamples({ p, signed: SIGNED });
    expect(() => buildWorksheets({ p, signed: null })).toThrow(/not signed/);
    const { sheets } = buildWorksheets({ p, signed: SIGNED });
    const primary = new Set(readJson(p.primary).primary.map((x) => x.advisoryId));

    // M2: every differs advisory, in index order, each line with the same fields, primary or not.
    expect(sheets.M2.map((l) => l.advisoryId)).toEqual(Object.keys(M2_LABELS));
    const fields = (l) => Object.keys(l).filter((k) => k !== 'closesRow');
    for (const l of sheets.M2) expect(fields(l)).toEqual(fields(sheets.M2[0]));
    expect(sheets.M2.filter((l) => primary.has(l.advisoryId))).toHaveLength(4);
    const m2Text = readFileSync(p.sheets.M2, 'utf8');
    expect(m2Text).not.toMatch(/primary/i);
    for (const s of [seed('primary', SIGNED)]) expect(m2Text).not.toContain(s);
    // The M2 worksheet does not depend on the draw: another seed gives the same bytes.
    const q = openStudy().p;
    writeSamples({ p: q, signed: '2026-12-01' });
    buildWorksheets({ p: q, signed: '2026-12-01' });
    expect(readFileSync(q.sheets.M2, 'utf8').replaceAll(q.dir, '')).toBe(
      m2Text.replaceAll(p.dir, ''),
    );
    expect(sheets.M2.find((l) => l.kind === 'reference_closes').closesRow).toBe(8);
    expect(sheets.M2[0]).toMatchObject({
      clauseText: '`src/b.ts`',
      note: 'differs:declared_not_changed',
      page: `https://github.com/${REPO(0)}/pull/10`,
    });

    // M1: the sample, without its note, its observed value or its record.
    expect(sheets.M1.map((l) => l.advisoryId).sort()).toEqual([...ALL_IDS].sort());
    for (const l of sheets.M1) {
      expect(Object.keys(l)).toEqual([
        'measure',
        'pr',
        'advisoryId',
        'clause',
        'clauseText',
        'kind',
        'value',
        'body',
        'page',
        'allowed',
        'label',
        'adjudicatedAt',
      ]);
    }
    expect(readFileSync(p.sheets.M1, 'utf8')).not.toMatch(NOTE_WORDS);
    expect(readFileSync(p.sheets.M1, 'utf8')).not.toMatch(/primary|records/);

    // "Work done": one line per pull request with a primary advisory, and no advisory.
    expect(sheets.workDone.map((l) => l.pr)).toEqual([`${REPO(0)}#10`, `${REPO(1)}#11`]);
    expect(readFileSync(p.sheets.workDone, 'utf8')).not.toMatch(/advisory|:\d|primary/);
    for (const l of sheets.workDone) expect(l.allowed).toEqual(WORK_DONE);

    // Every worksheet is under .work/.
    for (const path of Object.values(p.sheets)) expect(path.startsWith(p.work)).toBe(true);
  });

  it('keeps labels already written when built again', () => {
    const { p } = openStudy();
    writeSamples({ p, signed: SIGNED });
    buildWorksheets({ p, signed: SIGNED });
    label(p);
    const { sheets } = buildWorksheets({ p, signed: SIGNED });
    expect(sheets.M2.map((l) => l.label)).toEqual(Object.values(M2_LABELS));
    expect(sheets.workDone.map((l) => l.label)).toEqual(['done', 'done']);
  });
});

describe('worksheet.mjs: publish', () => {
  const ready = (edit) => {
    const { p } = openStudy();
    writeSamples({ p, signed: SIGNED });
    buildWorksheets({ p, signed: SIGNED });
    label(p, edit);
    return p;
  };
  const publish = (p) => () => publishLabels({ p, signed: SIGNED });
  const nothingPublished = (p) => {
    expect(existsSync(p.labelFile)).toBe(false);
    expect(existsSync(p.workDoneFile)).toBe(false);
  };

  it('publishes names, numbers and offsets only, with each closes row, then refuses to overwrite', () => {
    const p = ready();
    const { labels, workDone } = publishLabels({ p, signed: SIGNED });
    expect(readJsonl(p.labelFile)).toEqual(labels);
    expect(readJsonl(p.workDoneFile)).toEqual(workDone);
    expect(labels).toHaveLength(6 + 8);
    expect(labels.filter((l) => l.measure === 'M2').map((l) => [l.advisoryId, l.label])).toEqual(
      Object.entries(M2_LABELS),
    );
    for (const l of labels) {
      expect(outputFault(l)).toBeNull();
      if (l.advisoryId === id(0, 2)) expect(l.closesRow).toBe(8);
      else expect(l).not.toHaveProperty('closesRow');
    }
    // Code points: the emoji is one.
    expect(labels.find((l) => l.advisoryId === id(0, 0)).clause).toEqual({ start: 10, end: 28 });
    expect(workDone).toEqual([
      { pr: `${REPO(0)}#10`, label: 'done', adjudicatedAt: DONE_AT },
      { pr: `${REPO(1)}#11`, label: 'done', adjudicatedAt: DONE_AT },
    ]);
    for (const path of [p.labelFile, p.workDoneFile]) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/Quokka|src\/|Closes|`/);
      expect(readFileSync(path, 'utf8')).not.toMatch(NOTE_WORDS);
    }
    expect(publish(p)).toThrow(/labels.jsonl exists: published labels are final/);
    rmSync(p.labelFile);
    expect(publish(p)).toThrow(/work-done.jsonl exists: published labels are final/);
  });

  it('refuses a missing label, under each measure, and a line no measure needs', () => {
    for (const [edit, message] of [
      [
        { M2: (l) => (l.advisoryId === id(1, 1) ? { ...l, label: null } : l) },
        /M2 .*#11:1: missing label/,
      ],
      [
        { M1: (l) => (l.advisoryId === id(2, 0) ? { ...l, label: null } : l) },
        /M1 .*#12:0: missing label/,
      ],
      [{ workDone: (l) => ({ ...l, label: null }) }, /work done .*#10: missing label/],
    ]) {
      const p = ready(edit);
      expect(publish(p)).toThrow(message);
      nothingPublished(p);
    }
    const p = ready();
    writeJsonl(p.sheets.M2, readJsonl(p.sheets.M2).slice(1));
    expect(publish(p)).toThrow(/M2 .*#10:1: missing label/);
    const q = ready();
    const lines = readJsonl(q.sheets.M2);
    writeJsonl(q.sheets.M2, [...lines, { ...lines[0], advisoryId: id(0, 0) }]);
    expect(publish(q)).toThrow(/#10:0: no measure needs it/);
    nothingPublished(q);
  });

  it('refuses a label outside its set, and an adjudication time that is not UTC ISO 8601', () => {
    for (const [edit, message] of [
      [{ M2: (l) => ({ ...l, label: 'real' }) }, /label "real" is not one of false_claim/],
      [{ M1: (l) => ({ ...l, label: 'false_claim' }) }, /label "false_claim" is not one of real/],
      [{ workDone: (l) => ({ ...l, label: 'partly' }) }, /label "partly" is not one of done/],
      [{ M2: (l) => ({ ...l, adjudicatedAt: '24 November' }) }, /UTC ISO 8601/],
    ]) {
      const p = ready(edit);
      expect(publish(p)).toThrow(message);
      nothingPublished(p);
    }
  });

  it('refuses an advisory whose not_real and not_a_claim disagree', () => {
    const p = ready({ M1: (l) => (l.advisoryId === id(0, 1) ? { ...l, label: 'real' } : l) });
    expect(publish(p)).toThrow(/#10:1: M1 real and M2 not_a_claim disagree/);
    nothingPublished(p);
    const q = ready({ M1: (l) => (l.advisoryId === id(0, 2) ? { ...l, label: 'not_real' } : l) });
    expect(publish(q)).toThrow(/#10:2: M1 not_real and M2 false_claim disagree/);
  });

  it('refuses a "work done" label not written after its pull request\'s M2 labels', () => {
    const p = ready({ workDone: (l) => ({ ...l, adjudicatedAt: LABELLED_AT }) });
    expect(publish(p)).toThrow(/work done .*#10: labelled at .*, not after its M2 label/);
    nothingPublished(p);
  });

  it('refuses any text in the output', () => {
    for (const edit of [
      { M2: (l) => (l.advisoryId === id(0, 1) ? { ...l, clause: '`src/b.ts`' } : l) },
      {
        M2: (l) =>
          l.advisoryId === id(0, 1) ? { ...l, clause: { start: 1, end: 2, text: 'b' } } : l,
      },
      { M1: (l) => (l.advisoryId === id(0, 0) ? { ...l, pr: 'Updated src/a.ts' } : l) },
      { M2: (l) => (l.advisoryId === id(0, 1) ? { ...l, adjudicatedAt: `${LABELLED_AT} ok` } : l) },
    ]) {
      const p = ready(edit);
      expect(publish(p)).toThrow(/no text is published|UTC ISO 8601/);
      nothingPublished(p);
    }
    // Offsets edited to other numbers are refused as not the index's.
    const p = ready({
      M2: (l) => (l.advisoryId === id(0, 1) ? { ...l, clause: { start: 0, end: 1 } } : l),
    });
    expect(publish(p)).toThrow(/not the index's/);
    // Each field of a published row is from a closed set.
    const good = {
      pr: 'o/r#1',
      advisoryId: 'o/r#1:0',
      clause: null,
      measure: 'M2',
      label: 'false_claim',
      adjudicatedAt: LABELLED_AT,
    };
    expect(outputFault(good)).toBeNull();
    expect(outputFault({ ...good, closesRow: 8 })).toBeNull();
    for (const [change, fault] of [
      [{ note: 'differs:x' }, 'field note'],
      [{ advisoryId: 'o/r#1:first' }, 'advisoryId'],
      [{ advisoryId: 'o/s#1:0' }, 'advisoryId'],
      [{ clause: 'Closes #1.' }, 'clause'],
      [{ clause: { start: 3, end: 1 } }, 'clause'],
      [{ label: 'a false claim' }, 'label'],
      [{ closesRow: 'row 8' }, 'closesRow'],
      [{ pr: 'o/r#1 ', advisoryId: 'o/r#1 :0' }, 'pr'],
    ]) {
      expect(outputFault({ ...good, ...change })).toBe(fault);
    }
    expect(outputFault({ pr: 'o/r#1', label: 'done', adjudicatedAt: LABELLED_AT })).toBeNull();
    expect(outputFault({ pr: 'o/r#1', label: 'done', adjudicatedAt: LABELLED_AT, why: 'x' })).toBe(
      'field why',
    );
  });

  it('feeds figures.mjs, which computes from the published labels', () => {
    const p = ready();
    publishLabels({ p, signed: SIGNED });
    expect(() => writeFigures({ p, signed: null })).toThrow(/not signed/);
    const f = writeFigures({ p, signed: SIGNED });
    expect(readJson(p.figureFile)).toEqual(f);
    // (b): pull requests 0 and 1; (a): 0 to 3.
    expect([f.primary.b.pullRequests, f.primary.a.pullRequests]).toEqual([2, 4]);
    expect(f.advisoryLevel.falseClaimShare).toMatchObject({ k: 3, n: 6, value: 0.5 });
    expect(f.advisoryLevel.M1).toMatchObject({ k: 7, n: 8 });
    expect(f.descriptive.workDone).toEqual({ done: 2, not_done: 0, cannot_tell: 0 });
    expect(f.descriptive.closesNotesByRow).toEqual({ 8: { 'differs:not_closing': 1 } });
    expect(JSON.stringify(f)).not.toMatch(/Quokka|src\//);
    expect(existsSync(join(p.dir, 'result.md'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Synthetic indexes for figures.mjs: each pull request a list of advisories, each [kind, note, its
// M2 label, its closes row]. M1 labels follow M2 (not_real exactly for not_a_claim), real
// otherwise; every pull request with a primary advisory is "done".

const DIFFERS_NOTE = {
  file_changed: 'differs:declared_not_changed',
  reference_closes: 'differs:not_closing',
  checks_succeeded: 'differs:all_succeeded_mismatch',
};
const A = (kind = 'file_changed') => [kind, 'agrees', null, kind === 'reference_closes' ? 1 : null];
const D = (labelled, kind = 'file_changed') => [
  kind,
  DIFFERS_NOTE[kind],
  labelled,
  kind === 'reference_closes' ? 8 : null,
];
const U = () => ['tests_passed', 'unanswered:no_comparable_record_field', null, null];
const prOf = (i) => `${REPO(i)}#${i + 1}`;

function synthetic(prs, { errors = 0, signed = SIGNED } = {}) {
  const index = {
    prs: prs.map((advisories, i) => ({
      pr: prOf(i),
      reportIsSelectedBody: true,
      advisories: advisories.map(([kind, note, , row], j) => ({
        advisoryId: `${prOf(i)}:${j}`,
        kind,
        note,
        clause: null,
        ...(kind === 'reference_closes' ? { closesRow: row } : {}),
      })),
    })),
    errors: Array.from({ length: errors }, (_, i) => ({
      pr: `example-org/errored-${i}#1`,
      error: 'no record; exit 3',
    })),
    editedSinceSelection: [],
  };
  const primary = drawPrimary(index, signed);
  const m1 = drawM1(index, signed);
  const m2 = new Map();
  const labels = [];
  const row = (a) => (a.kind === 'reference_closes' ? { closesRow: a.closesRow } : {});
  index.prs.forEach((pr, i) => {
    pr.advisories.forEach((a, j) => {
      if (!a.note.startsWith('differs:')) return;
      const l = prs[i][j][2];
      m2.set(a.advisoryId, l);
      labels.push({ pr: pr.pr, advisoryId: a.advisoryId, measure: 'M2', label: l, ...row(a) });
    });
  });
  const kinds = new Map(index.prs.flatMap((pr) => pr.advisories.map((a) => [a.advisoryId, a])));
  for (const advisoryId of m1.advisoryIds) {
    const a = kinds.get(advisoryId);
    labels.push({
      pr: advisoryId.slice(0, advisoryId.lastIndexOf(':')),
      advisoryId,
      measure: 'M1',
      label: m2.get(advisoryId) === 'not_a_claim' ? 'not_real' : 'real',
      ...row(a),
    });
  }
  const workDone = [...new Set(primary.primary.map((x) => x.pr))].map((pr) => ({
    pr,
    label: 'done',
  }));
  return { index, primary, m1, labels, workDone };
}
const figures = (prs, { replicates = 10, ...opts } = {}) =>
  computeFigures({ ...synthetic(prs, opts), signed: SIGNED, replicates });
const many = (n, advisories) => Array.from({ length: n }, () => advisories);

// Denominator (b) is pull requests 0 to 3; (a) adds 4 (only an unanswered advisory) and 5 (none);
// the two errors are in neither.
const MIXED = [
  [D('false_claim')],
  [D('claim_holds', 'checks_succeeded')],
  [D('false_claim'), D('not_a_claim', 'checks_succeeded')],
  [A()],
  [U()],
  [],
];

describe('figures.mjs: P1 and P2', () => {
  it('counts pull requests over denominator (b), and over (a) beside it, never the errors', () => {
    const f = figures(MIXED, { errors: 2 });
    expect([f.pullRequests, f.errors]).toEqual([6, 2]);
    expect(f.primary.b).toEqual({
      pullRequests: 4,
      P1: share(2, 4),
      P2: share(2, 4),
      halfWidth: {
        P1: Math.round(((wilson(2, 4).high - wilson(2, 4).low) / 2) * 1e5) / 1e5,
        P2: Math.round(((wilson(2, 4).high - wilson(2, 4).low) / 2) * 1e5) / 1e5,
      },
    });
    expect(f.primary.a).toEqual({ pullRequests: 6, P1: share(2, 6), P2: share(2, 6) });
    expect(f.seeds).toEqual({
      primary: seed('primary', SIGNED),
      M1: seed('M1', SIGNED),
      bootstrap: seed('bootstrap', SIGNED),
    });
  });

  it('counts one advisory per pull request and kind, and every differs advisory under "any"', () => {
    // Two file differs on one pull request, one a genuine catch and one a false accusation.
    const two = [[D('false_claim'), D('claim_holds')]];
    const s = seed('primary', SIGNED);
    const chosen = least(s, [`${prOf(0)}:0`, `${prOf(0)}:1`]);
    const f = figures(two);
    const caughtByPrimary = chosen === `${prOf(0)}:0`;
    expect(f.primary.b.P1.k).toBe(caughtByPrimary ? 1 : 0);
    expect(f.primary.b.P2.k).toBe(caughtByPrimary ? 0 : 1);
    expect([f.any.b.P1.k, f.any.b.P2.k, f.any.a.P1.n]).toEqual([1, 1, 1]);
  });

  it('reports each kind over the pull requests with a checkable advisory of it, and a kind with none as such', () => {
    const f = figures(MIXED);
    expect(Object.keys(f.byKind)).toEqual(KINDS);
    expect(f.byKind.file_changed).toEqual({
      pullRequests: 3,
      P1: share(2, 3),
      P2: share(0, 3),
    });
    expect(f.byKind.checks_succeeded).toEqual({
      pullRequests: 2,
      P1: share(0, 2),
      P2: share(2, 2),
    });
    for (const kind of ['reference_closes', 'tests_passed', 'test_count', 'merged_at']) {
      expect(f.byKind[kind]).toEqual({ pullRequests: 0, none: true });
    }
  });

  it("matches study 2's committed Wilson intervals, and the by-pull-request figures the preregistration gives for it", () => {
    const committed2 = readJson(
      join(ROOT, 'experiments/open-source-advisory-2026-10-study2/figures/figures.json'),
    );
    expect(share(58, 60)).toEqual(committed2.M1);
    expect(share(22, 31)).toEqual(committed2.baseline.M2.false_claim);
    // "Background": 4 of 56 [0.028, 0.170] and 5 of 56 [0.039, 0.193] over (b); 4 and 5 of 150.
    const f = figures([
      ...many(4, [D('false_claim')]),
      ...many(5, [D('claim_holds')]),
      ...many(47, [A()]),
      ...many(94, [U()]),
    ]);
    const three = (s) => [s.value, s.wilson95.low, s.wilson95.high].map((x) => x.toFixed(3));
    expect(three(f.primary.b.P1)).toEqual(['0.071', '0.028', '0.170']);
    expect(three(f.primary.b.P2)).toEqual(['0.089', '0.039', '0.193']);
    expect([f.primary.a.P1.value, f.primary.a.P2.value].map((x) => x.toFixed(3))).toEqual([
      '0.027',
      '0.033',
    ]);
  });

  it('refuses while unsigned, on a sample its seed did not draw, and on a missing, extra or doubled label', () => {
    const s = synthetic(MIXED);
    expect(() => computeFigures({ ...s, signed: null })).toThrow(/not signed/);
    // Given no date, as the CLI is, it computes with SIGNING_DATE's seeds.
    const t = synthetic(MIXED, { signed: SIGNING_DATE });
    expect(computeFigures({ ...t, replicates: 1 })).toEqual(
      computeFigures({ ...t, signed: SIGNING_DATE, replicates: 1 }),
    );
    expect(() => computeFigures({ ...s, replicates: 1 })).toThrow(
      /differs from what its seed draws/,
    );
    const tampered = structuredClone(s.primary);
    tampered.primary.pop();
    expect(() => computeFigures({ ...s, primary: tampered, signed: SIGNED })).toThrow(
      /primary.json differs from what its seed draws/,
    );
    const missing = () =>
      computeFigures({ ...s, labels: s.labels.slice(1), signed: SIGNED, replicates: 1 });
    expect(missing).toThrow(MissingLabels);
    expect(() =>
      computeFigures({ ...s, workDone: s.workDone.slice(1), signed: SIGNED, replicates: 1 }),
    ).toThrow(/work done/);
    expect(() =>
      computeFigures({
        ...s,
        labels: [...s.labels, s.labels[0]],
        signed: SIGNED,
        replicates: 1,
      }),
    ).toThrow(/labelled twice/);
    expect(() =>
      computeFigures({
        ...s,
        labels: [...s.labels, { ...s.labels[0], advisoryId: `${prOf(3)}:0` }],
        signed: SIGNED,
        replicates: 1,
      }),
    ).toThrow(/which no measure needs/);
  });
});

// bootstrap() of six pull requests, two of them with no differs advisory, under the bootstrap seed
// of SIGNED: computed once and fixed here, so a change to the draw or the percentiles shows.
const FIXED_BOOTSTRAP = {
  seed: `open-source-advisory-2026-11-study3/bootstrap/${SIGNED}`,
  replicates: 10_000,
  pullRequests: 6,
  setAside: 17,
  interval95: { low: 0.25, high: 0.9 },
};

describe('figures.mjs: the PR-cluster bootstrap', () => {
  const s = seed('bootstrap', SIGNED);

  it('draws pull request floor(u * m / 2^48), u the first 6 bytes of SHA-256 of "<seed>:<r>:<j>", reproduced by hand', () => {
    for (const [r, j, m] of [
      [0, 0, 4],
      [0, 3, 4],
      [9999, 129, 130],
      [17, 2, 7],
    ]) {
      const digest = createHash('sha256').update(`${s}:${r}:${j}`, 'utf8').digest();
      const u = digest.readUIntBE(0, 6);
      expect(drawIndex(s, r, j, m)).toBe(Math.floor((u * m) / 2 ** 48));
    }
    // Exact past 2^53: u * m is computed as an integer.
    const u = createHash('sha256').update(`${s}:1:1`, 'utf8').digest().readUIntBE(0, 6);
    const m = 350;
    expect(drawIndex(s, 1, 1, m)).toBe(Number((BigInt(u) * BigInt(m)) / 2n ** 48n));
    expect(quantile([0, 1, 2, 3, 4], 0.25)).toBe(1);
    expect(quantile([0, 10], 0.025)).toBeCloseTo(0.25, 12);
  });

  it('gives a fixed result from a fixed seed, and sets aside the replicates with a zero denominator', () => {
    const clusters = [
      { k: 1, n: 2 },
      { k: 0, n: 0 },
      { k: 0, n: 0 },
      { k: 3, n: 3 },
      { k: 0, n: 1 },
      { k: 2, n: 5 },
    ];
    const result = bootstrap(clusters, s);
    expect(result).toEqual(FIXED_BOOTSTRAP);
    // Recomputed by hand: a replicate whose six draws are all of the empty pull requests.
    let aside = 0;
    for (let r = 0; r < REPLICATES; r++) {
      const drawn = [0, 1, 2, 3, 4, 5].map((j) => drawIndex(s, r, j, 6));
      if (drawn.every((i) => i === 1 || i === 2)) aside++;
    }
    expect(result.setAside).toBe(aside);
    expect(aside).toBeGreaterThan(0);
    expect(bootstrap(clusters, s)).toEqual(result);
    expect(bootstrap([], s, 5)).toMatchObject({ pullRequests: 0, setAside: 5, interval95: null });
  });

  it('bootstraps the false_claim share over (b) and M1 over the sampled pull requests, with no Wilson interval', () => {
    const f = figures(MIXED, { replicates: REPLICATES });
    const fc = f.advisoryLevel.falseClaimShare;
    expect(fc).toMatchObject({ k: 2, n: 4, value: 0.5 });
    expect(fc.bootstrap).toMatchObject({ seed: s, replicates: 10_000, pullRequests: 4 });
    expect(fc.bootstrap.setAside).toBeGreaterThan(0);
    expect(fc.bootstrap.interval95.low).toBeLessThanOrEqual(0.5);
    expect(fc.bootstrap.interval95.high).toBeGreaterThanOrEqual(0.5);
    // M1: all six advisories, on five pull requests, one not_real.
    expect(f.advisoryLevel.M1).toMatchObject({ k: 5, n: 6, value: 0.83333 });
    expect(f.advisoryLevel.M1.bootstrap).toMatchObject({ pullRequests: 5, setAside: 0 });
    expect(JSON.stringify(f.advisoryLevel)).not.toContain('wilson');
  });
});

describe('figures.mjs: the dominant-PR sensitivity', () => {
  const s = seed('primary', SIGNED);

  it('takes the pull request with the most differs advisories, a tie broken by the least SHA-256 under the primary seed', () => {
    // Pull requests 0 and 1 tie with two each.
    const tie = [
      [D('false_claim'), D('false_claim')],
      [D('claim_holds'), D('claim_holds')],
      [D('false_claim')],
    ];
    const expected = least(s, [prOf(0), prOf(1)]);
    expect(figures(tie).sensitivity.largest).toMatchObject({ pr: expected, differs: 2 });
    // A clear largest wins whatever its digest.
    const clear = [[D('false_claim')], [D('claim_holds'), D('claim_holds'), D('claim_holds')]];
    expect(figures(clear).sensitivity.largest).toMatchObject({ pr: prOf(1), differs: 3 });
    expect(figures([[A()]]).sensitivity.largest).toBeNull();
    expect(figures([[A()]]).sensitivity.withoutLargest).toBeNull();
  });

  it('reports the leave-one-out range, every primary outcome without the largest, and the largest share of genuine catches', () => {
    const f = figures(MIXED);
    const third = Math.round((1 / 3) * 1e5) / 1e5;
    const twoThirds = Math.round((2 / 3) * 1e5) / 1e5;
    expect(f.sensitivity.leaveOneOut).toEqual({
      pullRequests: 4,
      P1: { least: third, greatest: twoThirds },
      P2: { least: third, greatest: twoThirds },
      falseClaimShare: { least: third, greatest: twoThirds },
    });
    expect(f.sensitivity.largest).toMatchObject({ pr: prOf(2), differs: 2 });
    const w = f.sensitivity.withoutLargest;
    expect(w.primary.b).toMatchObject({ pullRequests: 3, P1: share(1, 3), P2: share(1, 3) });
    expect(w.primary.a).toMatchObject({ pullRequests: 5, P1: share(1, 5), P2: share(1, 5) });
    expect(w.byKind.checks_succeeded).toEqual({
      pullRequests: 1,
      P1: share(0, 1),
      P2: share(1, 1),
    });
    // Pull requests 0 and 2 hold one genuine catch each: the tie-break names one.
    const top = least(s, [prOf(0), prOf(2)]);
    expect(f.sensitivity.largestShareOfGenuineCatches).toEqual({
      advisoryLevel: { pr: top, k: 1, n: 2, value: 0.5 },
      primaryLevel: { pr: top, k: 1, n: 2, value: 0.5 },
    });
    const none = figures([[A()]]).sensitivity;
    expect(none.largestShareOfGenuineCatches.advisoryLevel).toEqual({
      pr: null,
      k: 0,
      n: 0,
      value: null,
    });
    expect(figures([]).sensitivity.leaveOneOut).toEqual({
      pullRequests: 0,
      P1: null,
      P2: null,
      falseClaimShare: null,
    });
  });
});

describe('figures.mjs: the bar', () => {
  it('is met when P2 has a Wilson upper bound of at most 0.05 and P1 is at least four times P2', () => {
    const f = figures([[D('false_claim')], ...many(79, [A()])]);
    expect(f.bar).toEqual({
      condition1: { p2WilsonHigh: wilson(0, 80).high, atMost: 0.05, computable: true, met: true },
      condition2: { P1: share(1, 80).value, P2: 0, atLeastTimes: 4, computable: true, met: true },
      met: true,
    });
    expect(wilson(0, 80).high).toBeLessThanOrEqual(0.05);
  });

  it('is not met when either condition fails', () => {
    const wide = figures(many(10, [A()]));
    expect([wide.bar.condition1.met, wide.bar.condition2.met, wide.bar.met]).toEqual([
      false,
      true,
      false,
    ]);
    // At 130, one accused pull request meets condition 1; one catch is not four times one.
    const f = figures([[D('false_claim')], [D('claim_holds')], ...many(128, [A()])]);
    expect([f.bar.condition1.met, f.bar.condition2.met, f.bar.met]).toEqual([true, false, false]);
    const g = figures([...many(4, [D('false_claim')]), [D('claim_holds')], ...many(125, [A()])]);
    expect([g.bar.condition1.met, g.bar.condition2.met, g.bar.met]).toEqual([true, true, true]);
  });

  it('is not met when it cannot be computed: no pull request in (b)', () => {
    const f = figures([[U()], []]);
    expect(f.primary.b.pullRequests).toBe(0);
    expect(f.bar).toEqual({
      condition1: { p2WilsonHigh: null, atMost: 0.05, computable: false, met: false },
      condition2: { P1: null, P2: null, atLeastTimes: 4, computable: false, met: false },
      met: false,
    });
  });
});

describe('figures.mjs: the refutation tests', () => {
  it('dominance: refuted, not refuted, and not decidable below 5 genuine catches', () => {
    const refuted = figures([many(4, D('false_claim')), [D('false_claim')]]).refutations.dominance;
    expect(refuted).toMatchObject({
      ...REFUTE.dominance,
      pr: prOf(0),
      k: 4,
      n: 5,
      value: 0.8,
      outcome: 'refuted',
    });
    expect(figures(many(5, [D('false_claim')])).refutations.dominance).toMatchObject({
      k: 1,
      n: 5,
      outcome: 'not_refuted',
    });
    expect(figures([many(4, D('false_claim'))]).refutations.dominance).toMatchObject({
      k: 4,
      n: 4,
      outcome: 'not_decidable',
    });
  });

  it("file claims: refuted, not refuted, and not decidable below 5 of P2's pull requests", () => {
    expect(figures(many(5, [D('not_a_claim')])).refutations.fileClaims).toMatchObject({
      ...REFUTE.fileClaims,
      ...share(5, 5),
      outcome: 'refuted',
    });
    // Half is enough.
    const half = [
      ...many(3, [D('claim_holds')]),
      ...many(3, [D('claim_holds', 'checks_succeeded')]),
    ];
    expect(figures(half).refutations.fileClaims).toMatchObject({ k: 3, n: 6, outcome: 'refuted' });
    expect(
      figures(many(5, [D('claim_holds', 'checks_succeeded'), D('false_claim')])).refutations
        .fileClaims,
    ).toMatchObject({ k: 0, n: 5, outcome: 'not_refuted' });
    expect(figures(many(4, [D('not_a_claim')])).refutations.fileClaims).toMatchObject({
      k: 4,
      n: 4,
      outcome: 'not_decidable',
    });
  });

  it('closes: refuted above 0.05, not refuted at 0.05, and not decidable below 20 pull requests', () => {
    const closes = (accused, n) => [
      ...many(accused, [D('claim_holds', 'reference_closes')]),
      ...many(n - accused, [A('reference_closes')]),
    ];
    expect(figures(closes(2, 20)).refutations.closes).toMatchObject({
      ...REFUTE.closes,
      ...share(2, 20),
      outcome: 'refuted',
    });
    expect(figures(closes(1, 20)).refutations.closes).toMatchObject({
      k: 1,
      n: 20,
      outcome: 'not_refuted',
    });
    expect(figures(closes(5, 19)).refutations.closes).toMatchObject({
      k: 5,
      n: 19,
      outcome: 'not_decidable',
    });
    expect(figures([[A()]]).refutations.closes).toMatchObject({
      k: 0,
      n: 0,
      outcome: 'not_decidable',
    });
    expect(figures(closes(2, 20)).descriptive.closesNotesByRow).toEqual({
      1: { agrees: 18 },
      8: { 'differs:not_closing': 2 },
    });
  });
});

describe('figures.mjs: descriptive only', () => {
  it('counts advisories per pull request, notes by kind, errors, edited bodies and "work done"', () => {
    const f = figures(MIXED, { errors: 2 });
    expect(f.descriptive).toMatchObject({
      advisories: 6,
      advisoriesPerPr: { mean: 1, median: 1, max: 2, histogram: { 0: 1, 1: 4, 2: 1 } },
      notes: {
        agrees: 1,
        'differs:all_succeeded_mismatch': 2,
        'differs:declared_not_changed': 2,
        'unanswered:no_comparable_record_field': 1,
      },
      errors: 2,
      bodiesEditedSinceSelection: 0,
      workDone: { done: 3, not_done: 0, cannot_tell: 0 },
    });
    expect(f.descriptive.notesByKind.tests_passed).toEqual({
      'unanswered:no_comparable_record_field': 1,
    });
    expect(Object.keys(f.descriptive.notesByKind)).toEqual(KINDS);
    expect(f).not.toHaveProperty('result');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the preregistration states what the tools do', () => {
  it.each([
    ['the query', 'q = is:pr is:merged is:public merged:<start>..<end> <qualifier>'],
    ['the query', '`sort=created`, `order=asc`'],
    ['the query', '`per_page=100`'],
    ['the stars threshold', `\`stargazers_count >= ${MIN_STARS}\``],
    ['the body minimum', `at least ${MIN_BODY}`],
    ['the stop', `Stop at ${WANTED} selected`],
    ['block 1', `merged:${BLOCKS[0].start}..${BLOCKS[0].end}`],
    ['block 2', `merged:${BLOCKS[1].start}..${BLOCKS[1].end}`],
    ['block 1 date', `no earlier than ${BLOCKS[0].searchFrom}`],
    ['block 2 date', `no earlier than ${BLOCKS[1].searchFrom}`],
    ['the bundle', INSTRUMENT.bundleSha256],
    ['the grammar', INSTRUMENT.extractorDigest],
    ['the source', INSTRUMENT.sourceCommit],
    ['the package', `\`${INSTRUMENT.package}\``],
    ['the checker', `checker ${INSTRUMENT.checkerVersion}`],
    ['the comparison', `comparison ${INSTRUMENT.comparison}`],
    ['the extractor', `extractor ${INSTRUMENT.extractorVersion}`],
    ["study 1's selection", STUDY1_SELECTION.sha256],
    ["study 2's selection", STUDY2_SELECTION.sha256],
    ['the demo', DEMO_SELECTION.path],
    [
      'the command',
      'dunstan check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>',
    ],
    ['the advisory id', '"<owner>/<repo>#<n>:<i>"'],
    ['the bar', `at most **${BAR.p2WilsonHighAtMost}**`],
    ['the reachability', 'at 108 it allows 0, at 130 it allows 1, at 381 it allows'],
    ['the agents', QUALIFIERS],
    ...AGENTS.map((a) => ['an agent qualifier', a.qualifier]),
  ])('%s: %s', (_, text) => {
    expect(prereg).toContain(text);
  });

  // Wrapped lines read as one: whitespace runs compare as one space.
  const flat = prereg.replace(/\s+/g, ' ');
  it.each([
    [
      'the primary seed',
      '`open-source-advisory-2026-11-study3/primary/<the signing date, YYYY-MM-DD>`',
    ],
    ['the M1 seed', '`open-source-advisory-2026-11-study3/M1/<the signing date, YYYY-MM-DD>`'],
    [
      'the bootstrap seed',
      '`open-source-advisory-2026-11-study3/bootstrap/<the signing date, YYYY-MM-DD>`',
    ],
    ['the primary key', 'SHA-256 (hex) of the UTF-8 string `"<seed>:<advisoryId>"` is least'],
    ['the tie-break', 'ties broken by the least SHA-256 (hex) of `"<seed>:<owner>/<repo>#<n>"`'],
    ['the M1 size', `seeded sample of ${M1_SIZE} advisories (all, if fewer)`],
    ['the replicates', `${REPLICATES.toLocaleString('en')} replicates`],
    ['the draw', '`floor(u * m / 2^48)`'],
    [
      'the draw',
      'the first 6 bytes, as a big-endian integer, of the SHA-256 of the UTF-8 string `"<seed>:<r>:<j>"`',
    ],
    [
      'the interval',
      'the 2.5th and 97.5th percentiles of the replicates with a non-zero denominator',
    ],
    ['the Wilson z', 'z = 1.959964'],
    ['the bar', 'P1 is at least **four times** P2'],
    [
      'dominance',
      `is above ${REFUTE.dominance.shareAbove}, with at least ${REFUTE.dominance.minimumGenuineCatches} genuine catches`,
    ],
    ['file claims', `with at least ${REFUTE.fileClaims.minimumPrsInP2} pull requests in P2`],
    [
      'closes',
      `is above ${REFUTE.closes.shareAbove}, over at least ${REFUTE.closes.minimumPrs} pull requests`,
    ],
    ['the kinds', KINDS.map((k) => `\`${k}\``).join(', ')],
    [
      'work done',
      WORK_DONE.map((k) => `\`${k}\``)
        .join(', ')
        .replace(/, ([^,]+)$/, ' or $1'),
    ],
  ])('%s: %s', (_, text) => {
    expect(flat).toContain(text);
  });

  it("names the kinds as src/advisory/grammar.ts's ADVISORY_KINDS does", () => {
    const grammar = readFileSync(join(ROOT, 'src/advisory/grammar.ts'), 'utf8');
    const list = grammar.match(/export const ADVISORY_KINDS = \[([^\]]*)\]/)[1];
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual(KINDS);
  });
});

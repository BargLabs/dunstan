// Erratum 1's tools, on synthetic fixtures and on study 2's committed files: a fake GitHub for
// closers.mjs, a scratch study for the worksheet and the ruled figures, and the published figures
// recomputed. No test reaches the network: fetch throws.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { computeFigures } from '../../tools/figures.mjs';
import {
  PAGE_BUDGET,
  PAGE_SIZE,
  PR_QUERY,
  readClosers,
  SCOPE_QUERY,
  scopeCheck,
  TARGET_QUERY,
} from './closers.mjs';
import {
  DOMINANT_PR,
  paths,
  RELATIONS,
  readJson,
  readJsonl,
  sha256,
  writeJson,
  writeJsonl,
} from './common.mjs';
import {
  MissingRulings,
  publishedFigures,
  ruledLabels,
  sensitivity,
  writeErratumFigures,
} from './figures.mjs';
import { buildWorksheet, closerRelation } from './worksheet.mjs';

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('a test reached for the network');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 12, 0, 0, tick++)).toISOString();
const oid = (c) => c.repeat(40);

// ---------------------------------------------------------------------------------------------
// A fake GitHub: pull requests and targets by `owner/repo#n`, served page by page as GraphQL would.

function fakeGitHub({ prs, targets, scopes = '' }) {
  const calls = [];
  const page = (all, after) => {
    const start = after === null ? 0 : Number(after);
    const nodes = all.slice(start, start + PAGE_SIZE);
    const end = start + nodes.length;
    return {
      totalCount: all.length,
      pageInfo: { hasNextPage: end < all.length, endCursor: String(end) },
      nodes,
    };
  };
  const post = async (query, v) => {
    calls.push(query === SCOPE_QUERY ? 'scope' : `${v.owner}/${v.name}#${v.number}`);
    if (query === SCOPE_QUERY) return { body: { data: { rateLimit: { limit: 5000 } } }, scopes };
    const ref = `${v.owner}/${v.name}#${v.number}`;
    if (query === PR_QUERY) {
      const pr = prs[ref];
      const commits = page(
        pr.commits.map((c) => ({ commit: { oid: c } })),
        v.after,
      );
      return {
        body: {
          data: {
            repository: {
              nameWithOwner: `${v.owner}/${v.name}`,
              defaultBranchRef: { name: pr.defaultBranch ?? 'main' },
              pullRequest: {
                number: v.number,
                baseRefName: pr.base ?? 'main',
                state: pr.state ?? 'MERGED',
                merged: (pr.state ?? 'MERGED') === 'MERGED',
                mergedAt: '2026-08-20T00:00:00Z',
                mergeCommit: { oid: pr.mergeCommit },
                commits,
              },
            },
          },
        },
        scopes,
      };
    }
    if (query === TARGET_QUERY) {
      const t = targets[ref];
      if (t === undefined) {
        return {
          body: {
            data: { repository: { issueOrPullRequest: null } },
            errors: [{ type: 'NOT_FOUND', message: `Could not resolve ${ref}` }],
          },
          scopes,
        };
      }
      const [owner, rest] = (t.resolved ?? ref).split('/');
      const [name, number] = rest.split('#');
      return {
        body: {
          // A closer the token cannot see: GraphQL nulls it and says so beside the data.
          ...(t.unseenCloser
            ? {
                errors: [
                  {
                    type: 'NOT_FOUND',
                    path: [
                      'repository',
                      'issueOrPullRequest',
                      'timelineItems',
                      'nodes',
                      0,
                      'closer',
                    ],
                  },
                ],
              }
            : {}),
          data: {
            repository: {
              issueOrPullRequest: {
                __typename: t.typename ?? 'Issue',
                number: Number(number),
                repository: { nameWithOwner: `${owner}/${name}` },
                state: t.state ?? 'CLOSED',
                ...(t.typename === 'PullRequest' ? {} : { stateReason: t.stateReason ?? null }),
                timelineItems: page(t.events ?? [], v.after),
              },
            },
          },
        },
        scopes,
      };
    }
    throw new Error('an unknown query');
  };
  return { post, calls };
}

const closed = (createdAt, closer, actor = 'someone') => ({
  createdAt,
  actor: { login: actor },
  closer,
});
const byPr = (pr) => {
  const [repo, number] = pr.split('#');
  return { __typename: 'PullRequest', number: Number(number), repository: { nameWithOwner: repo } };
};
const byCommit = (c) => ({ __typename: 'Commit', oid: c });

// ---------------------------------------------------------------------------------------------
// A scratch study: an index, a sealed baseline record per pull request in .work/, and labels.

const NC = 'differs:not_closing';
const notes = (baseline, candidate = baseline) => ({ baseline, candidate });

// Each pull request's advisories: kind, claimed value, both notes, and its M2 label when differs.
const STUDY = {
  'o/r#1': [
    ['reference_closes', '#10', notes(NC), 'false_claim'], // closed by this pull request
    ['reference_closes', '#11', notes(NC), 'false_claim'], // by a commit of it
    ['reference_closes', '#12', notes(NC), 'false_claim'], // by its merge commit
    ['reference_closes', 'x/y#13', notes(NC), 'false_claim'], // by another pull request
    ['reference_closes', '#14', notes(NC), 'false_claim'], // by this one, reopened, by another commit
    ['reference_closes', '#15', notes(NC), 'false_claim'], // by an actor, no closer
    ['reference_closes', '#16', notes(NC), 'false_claim'], // still open
    ['reference_closes', '#17', notes(NC), 'not_a_claim'], // a pull request, by this one
    ['file_changed', 'a.ts', notes('agrees'), null], // not a row
    ['reference_closes', '#18', notes('agrees'), null], // a row, needing no ruling
    ['reference_closes', '#19', notes(NC), 'false_claim'], // by another commit only
  ],
  'o/s#2': [['reference_closes', '#5', notes(NC), 'false_claim']], // open, non-default base
  'o/t#3': [
    ['reference_closes', '#6', notes(NC), 'false_claim'], // a commit, the commit list too long
    ['reference_closes', '#9', notes(NC), 'false_claim'], // its merge commit, the list too long
  ],
  'o/u#4': [['reference_closes', '#7', notes(NC), 'false_claim']], // the target is not found
  'o/v#5': [['reference_closes', '#20', notes(NC), 'false_claim']], // closed, no ClosedEvent yet
  'o/w#6': [['reference_closes', '#21', notes(NC), 'false_claim']], // the pull request is open
  'o/x#7': [['reference_closes', '#22', notes(NC), 'false_claim']], // closed unmerged
  'o/y#8': [['reference_closes', '#23', notes(NC), 'false_claim']], // a closer the token cannot see
};

const GITHUB = {
  prs: {
    'o/r#1': { commits: [oid('1'), oid('2')], mergeCommit: oid('9') },
    'o/s#2': { commits: [oid('3')], mergeCommit: oid('8'), base: 'release' },
    'o/t#3': {
      commits: Array.from({ length: PAGE_SIZE * PAGE_BUDGET.commits + 1 }, (_, i) =>
        i.toString(16).padStart(40, '0'),
      ),
      mergeCommit: oid('7'),
    },
    'o/u#4': { commits: [oid('4')], mergeCommit: oid('6') },
    'o/v#5': { commits: [oid('5')], mergeCommit: oid('a') },
    'o/w#6': { commits: [oid('b')], mergeCommit: null, state: 'OPEN' },
    'o/x#7': { commits: [oid('c')], mergeCommit: null, state: 'CLOSED' },
    'o/y#8': { commits: [oid('d')], mergeCommit: oid('e') },
  },
  targets: {
    'o/r#10': { events: [closed('2026-08-20T00:00:00Z', byPr('o/r#1'))] },
    'o/r#11': { events: [closed('2026-08-20T00:00:00Z', byCommit(oid('2')))] },
    'o/r#12': { events: [closed('2026-08-20T00:00:00Z', byCommit(oid('9')))] },
    'x/y#13': { events: [closed('2026-08-20T00:00:00Z', byPr('x/y#99'))] },
    'o/r#14': {
      events: [
        closed('2026-08-20T00:00:00Z', byPr('o/r#1')),
        closed('2026-08-25T00:00:00Z', byCommit(oid('f'))),
      ],
    },
    'o/r#15': {
      stateReason: 'COMPLETED',
      events: [closed('2026-08-01T00:00:00Z', null, 'maintainer')],
    },
    'o/r#16': { state: 'OPEN', stateReason: null },
    'o/r#17': {
      typename: 'PullRequest',
      events: [closed('2026-08-20T00:00:00Z', byPr('o/r#1'), 'dependabot[bot]')],
    },
    'o/r#18': { events: [closed('2026-08-20T00:00:00Z', byPr('o/r#1'))] },
    'o/r#19': { events: [closed('2026-08-25T00:00:00Z', byCommit(oid('f')))] },
    'o/s#5': { state: 'OPEN' },
    'o/t#6': { events: [closed('2026-08-20T00:00:00Z', byCommit(oid('0')))] },
    'o/t#9': { events: [closed('2026-08-20T00:00:00Z', byCommit(oid('7')))] },
    'o/v#20': { events: [] },
    'o/w#21': { state: 'OPEN' },
    'o/x#22': { events: [closed('2026-08-20T00:00:00Z', byPr('o/x#70'))] },
    'o/y#23': { unseenCloser: true, events: [closed('2026-08-20T00:00:00Z', null)] },
  },
};

function scratchStudy() {
  const p = paths(mkdtempSync(join(tmpdir(), 'erratum1-')));
  for (const d of [p.runs, p.samples, p.labels, join(p.records, 'baseline')]) {
    mkdirSync(d, { recursive: true });
  }
  const prs = [];
  const seal = [];
  const labels = [];
  for (const [pr, rows] of Object.entries(STUDY)) {
    const file = `${pr.replace('/', '-').replace('#', '-')}.json`;
    const record = {
      predicate: {
        advisory: {
          advisories: rows.map(([kind, value, n]) => ({
            clause: 'copied text',
            kind,
            value,
            observed: [],
            note: n.baseline,
          })),
        },
      },
    };
    const bytes = JSON.stringify(record);
    writeFileSync(join(p.records, 'baseline', file), bytes);
    seal.push({ pr, file, sha256: sha256(bytes) });
    prs.push({
      pr,
      reportIsSelectedBody: true,
      advisories: rows.map(([kind, , n], i) => ({
        advisoryId: `${pr}:${i}`,
        kind,
        clause: { start: i, end: i + 1 },
        notes: n,
      })),
    });
    rows.forEach(([, , , label], i) => {
      if (label !== null) {
        labels.push({
          pr,
          advisoryId: `${pr}:${i}`,
          clause: { start: i, end: i + 1 },
          measure: 'M2',
          label,
          adjudicatedAt: '2026-10-07T00:00:00Z',
        });
      }
    });
  }
  writeJson(p.index, {
    instruments: { baseline: {}, candidate: {} },
    prs,
    errors: [],
    faults: [],
  });
  writeJson(p.seal('baseline'), { records: seal });
  writeJson(p.sample, { advisoryIds: [] });
  writeJsonl(p.labelFile, labels);
  return p;
}

async function read(options = {}) {
  const p = scratchStudy();
  const gh = fakeGitHub({ ...GITHUB, ...options });
  const closers = await readClosers({ post: gh.post, p, now });
  return { p, closers, calls: gh.calls };
}

// ---------------------------------------------------------------------------------------------

describe('closers.mjs: who closed each closes target', () => {
  it('reads every closes advisory, each pull request and target once, and writes closers.json once', async () => {
    const { p, closers, calls } = await read();
    expect(closers.rows.map((r) => r.advisoryId)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `o/r#1:${i}`),
      'o/r#1:9',
      'o/r#1:10',
      'o/s#2:0',
      'o/t#3:0',
      'o/t#3:1',
      'o/u#4:0',
      'o/v#5:0',
      'o/w#6:0',
      'o/x#7:0',
      'o/y#8:0',
    ]);
    expect(closers.rows[3]).toMatchObject({ claimed: 'x/y#13', target: 'x/y#13' });
    expect(closers.rows[0]).toMatchObject({ claimed: '#10', target: 'o/r#10' });
    // The scope check first; each pull request once, however many rows name it.
    expect(calls[0]).toBe('scope');
    expect(calls.filter((c) => c === 'o/r#1')).toHaveLength(1);
    expect(readJson(p.closers)).toEqual(closers);
    expect(closers.token).toEqual({ scopes: [], check: 'classic token with read:* scopes only' });
    expect(closers.readStartedAt < closers.readFinishedAt).toBe(true);
    expect(closers.pullRequests['o/w#6']).toMatchObject({ state: 'OPEN', merged: false });
    // Names, numbers, oids and times only: nothing copied from a record.
    expect(JSON.stringify(closers)).not.toMatch(/copied text/);
    await expect(readClosers({ post: fakeGitHub(GITHUB).post, p, now })).rejects.toThrow(
      /never redone/,
    );
  });

  it("matches checker 0.1.7's close-event page budget", () => {
    const github = readFileSync(
      new URL('../../../../src/evidence/github.ts', import.meta.url),
      'utf8',
    );
    expect(github).toMatch(new RegExp(`CLOSE_EVENT_PAGES = ${PAGE_BUDGET.closedEvents};`));
  });

  it('marks a connection past its page budget, a target not found, or an error beside the data, incomplete', async () => {
    const { closers } = await read();
    const reason = (pr) => closers.rows.filter((r) => r.pr === pr).map((r) => r.incomplete);
    expect(reason('o/t#3')).toEqual([
      `more than ${PAGE_BUDGET.commits} page(s) of ${PAGE_SIZE}`,
      `more than ${PAGE_BUDGET.commits} page(s) of ${PAGE_SIZE}`,
    ]);
    expect(closers.pullRequests['o/t#3']).toMatchObject({ commits: null, mergeCommit: oid('7') });
    expect(reason('o/u#4')).toEqual(['the target was not found']);
    // A closer the token cannot see is not a null closer: the read keeps no events.
    expect(reason('o/y#8')).toEqual([
      'a GraphQL error beside the data: NOT_FOUND at repository.issueOrPullRequest.timelineItems.nodes.0.closer',
    ]);
    expect(closers.targets['o/y#23']).toMatchObject({
      found: true,
      state: 'CLOSED',
      closedEvents: null,
    });
    expect(closers.rows.filter((r) => r.incomplete !== null)).toHaveLength(4);
  });

  it("refuses a token with a write scope, before reading any target, and records a fine-grained token's", async () => {
    const p = scratchStudy();
    const gh = fakeGitHub({ ...GITHUB, scopes: 'public_repo, read:org' });
    await expect(readClosers({ post: gh.post, p, now })).rejects.toThrow(/scope public_repo/);
    expect(gh.calls).toEqual(['scope']);
    expect(existsSync(p.closers)).toBe(false);
    expect(scopeCheck(null).scopes).toBeNull();
    expect(scopeCheck('read:org').scopes).toEqual(['read:org']);
  });

  it('refuses a record that is not the sealed one', async () => {
    const p = scratchStudy();
    const file = join(p.records, 'baseline', 'o-r-1.json');
    writeFileSync(file, `${readFileSync(file, 'utf8')} `);
    await expect(readClosers({ post: fakeGitHub(GITHUB).post, p, now })).rejects.toThrow(
      /not the record the seal holds/,
    );
  });
});

describe('worksheet.mjs: each advisory beside who closed its target', () => {
  it("relates each target to the pull request by section 7.4's rows, and proposes no ruling", async () => {
    const { p } = await read();
    const lines = buildWorksheet({ p });
    const by = Object.fromEntries(lines.map((l) => [l.advisoryId, l]));
    const relation = (id) => by[id].closerRelation;
    expect(relation('o/r#1:0')).toBe('this_pr');
    expect(relation('o/r#1:1')).toBe('commit_of_this_pr');
    expect(relation('o/r#1:2')).toBe('commit_of_this_pr');
    expect(relation('o/r#1:3')).toBe('other_pr');
    // Row 2 reads every ClosedEvent: closed by this pull request, reopened, closed by another commit.
    expect(by['o/r#1:4']).toMatchObject({
      closerRelation: 'this_pr',
      closedAt: '2026-08-20T00:00:00Z',
      section74: { row: 2, verdict: 'pass', reason: null },
    });
    expect(relation('o/r#1:5')).toBe('no_closer');
    expect(by['o/r#1:5']).toMatchObject({ closedBy: 'maintainer', closer: null });
    expect(relation('o/r#1:6')).toBe('still_open');
    expect(by['o/r#1:10']).toMatchObject({
      closerRelation: 'other_commit',
      section74: { row: 8, verdict: 'fail', reason: 'not_closing' },
    });
    // Row 3 by the merge commit needs no commit list; another commit with no complete list is row 6.
    expect(relation('o/t#3:1')).toBe('commit_of_this_pr');
    expect(by['o/t#3:0']).toMatchObject({
      closerRelation: 'incomplete',
      reason: `more than ${PAGE_BUDGET.commits} page(s) of ${PAGE_SIZE}`,
      section74: { row: 6, verdict: 'unverifiable' },
    });
    expect(by['o/u#4:0']).toMatchObject({
      closerRelation: 'incomplete',
      targetKind: null,
      reason: 'the target was not found',
    });
    expect(relation('o/y#8:0')).toBe('incomplete');
    // Row 7: closed, and the complete read holds no ClosedEvent yet. Never a fail.
    expect(by['o/v#5:0']).toMatchObject({
      closerRelation: 'event_unsettled',
      section74: { row: 7, verdict: 'unverifiable', reason: 'closing_event_unsettled' },
    });
    expect(by['o/w#6:0']).toMatchObject({
      closerRelation: 'pr_open',
      section74: { row: 4, verdict: 'unverifiable', reason: 'closing_link_unsettled' },
    });
    expect(relation('o/x#7:0')).toBe('pr_closed_unmerged');
    for (const l of lines) expect(l.ruling).toBeNull();
    expect(lines.filter((l) => l.needsRuling).map((l) => l.advisoryId)).not.toContain('o/r#1:9');
    expect(by['o/r#1:9']).toMatchObject({ instrument: 'neither', publishedLabel: null });
    expect(by['o/r#1:0']).toMatchObject({ instrument: 'both', publishedLabel: 'false_claim' });
    expect(Object.keys(by['o/r#1:0']).slice(0, 2)).toEqual(['pr', 'advisoryId']);
    expect(Object.keys(by['o/r#1:0']).at(-1)).toBe('ruling');
  });

  it('gives a pull request target its kind', async () => {
    const { p } = await read();
    const l = buildWorksheet({ p }).find((x) => x.advisoryId === 'o/r#1:7');
    expect(l).toMatchObject({
      targetKind: 'pullRequest',
      closerRelation: 'this_pr',
      closedBy: 'dependabot[bot]',
    });
  });

  it('reads a target still open after a merge into a non-default base as row 5, unverifiable', async () => {
    const { p } = await read();
    const lines = buildWorksheet({ p });
    expect(lines.find((x) => x.advisoryId === 'o/s#2:0')).toMatchObject({
      closerRelation: 'open_after_non_default_base',
      section74: { row: 5, verdict: 'unverifiable', reason: 'closing_base_not_default' },
      baseIsDefault: false,
      ruling: null,
    });
    expect(lines.find((x) => x.advisoryId === 'o/r#1:6')).toMatchObject({
      closerRelation: 'still_open',
      baseIsDefault: true,
    });
  });

  it('writes the summary table, and never rebuilds over the rulings', async () => {
    const { p } = await read();
    buildWorksheet({ p });
    const md = readFileSync(p.worksheetTable, 'utf8');
    expect(md).toContain(`| published label | ${RELATIONS.join(' | ')} | total |`);
    expect(md).toContain('| false_claim | 2 | 3 | 1 | 1 | 3 | 1 | 1 | 1 | 1 | 1 | 1 | 16 |');
    expect(md).toContain('| **all** | 4 | 3 | 1 | 1 | 3 | 1 | 1 | 1 | 1 | 1 | 1 | 18 |');
    expect(md).toContain('| o/s#2 | false_claim | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |');
    expect(() => buildWorksheet({ p })).toThrow(/never rebuilt/);
  });

  it('reads a closer of another type as row 8, as the checker does', () => {
    const row = { pr: 'o/r#1', incomplete: null };
    const pr = {
      found: true,
      state: 'MERGED',
      merged: true,
      baseRefName: 'main',
      defaultBranch: 'main',
      commits: { oids: [] },
      mergeCommit: null,
      incomplete: null,
    };
    const event = { createdAt: 't', actor: null, closer: { type: 'ProjectV2' } };
    const target = { found: true, state: 'CLOSED', closedEvents: [event], incomplete: null };
    expect(closerRelation(row, pr, target)).toEqual({ relation: 'no_closer', event, reason: null });
  });
});

describe('figures.mjs: the published figures and the ruled figures', () => {
  it("(i) reproduces study 2's published figures.json byte for byte", () => {
    const p = paths();
    const { figures, reproduced, sha256: digest } = publishedFigures({ p });
    const bytes = readFileSync(p.figureFile);
    expect(Buffer.from(`${JSON.stringify(figures, null, 2)}\n`, 'utf8').equals(bytes)).toBe(true);
    expect(reproduced).toBe(true);
    expect(digest).toBe(sha256(bytes));
  });

  it("(i)'s sensitivity: the published figures without the dominant pull request", () => {
    const { inputs } = publishedFigures({ p: paths() });
    const s = sensitivity(inputs);
    expect(s.withoutDominant.pr).toBe(DOMINANT_PR);
    expect(s.all['baseline M2 false_claim']).toMatchObject({ k: 22, n: 31 });
    expect(s.withoutDominant.measures['baseline M2 false_claim']).toMatchObject({ k: 3, n: 11 });
    expect(s.largestContributor.baseline).toMatchObject({ pr: DOMINANT_PR, k: 19, n: 22 });
    expect(s.leaveOneOut.prs).toBe(150);
    expect(s.leaveOneOut['baseline M2 false_claim'].min).toMatchObject({ pr: DOMINANT_PR });
  });

  async function ruledStudy() {
    const { p } = await read();
    buildWorksheet({ p });
    // The scratch study's figures.json: (i) recomputed, as the published one is.
    mkdirSync(p.figures, { recursive: true });
    const f = computeFigures({
      index: readJson(p.index),
      sample: readJson(p.sample),
      labels: readJsonl(p.labelFile),
    });
    writeFileSync(p.figureFile, `${JSON.stringify(f, null, 2)}\n`);
    return p;
  }
  const rule = (p, ruling) => {
    const lines = readJsonl(p.worksheetRows).map((l) => ({
      ...l,
      ruling: l.needsRuling ? ruling(l) : null,
    }));
    writeJsonl(p.worksheetRows, lines);
    return lines;
  };

  it('(ii) refuses while any ruling is null, computing nothing', async () => {
    const p = await ruledStudy();
    expect(() => writeErratumFigures({ p, dominantPr: 'o/r#1' })).toThrow(MissingRulings);
    rule(p, (l) => (l.advisoryId === 'o/s#2:0' ? null : l.publishedLabel));
    try {
      writeErratumFigures({ p, dominantPr: 'o/r#1' });
    } catch (e) {
      expect(e).toBeInstanceOf(MissingRulings);
      expect(e.missing).toEqual(['o/s#2:0']);
    }
    expect(existsSync(p.erratumFigures)).toBe(false);
  });

  it('(ii) puts each ruling in place of its published label, and writes once', async () => {
    const p = await ruledStudy();
    const closedByThis = ['this_pr', 'commit_of_this_pr'];
    rule(p, (l) =>
      l.publishedLabel === 'false_claim' && closedByThis.includes(l.closerRelation)
        ? 'claim_holds'
        : l.publishedLabel,
    );
    const f = writeErratumFigures({ p, dominantPr: 'o/r#1' });
    expect(f.rulings.changed.map((c) => c.advisoryId)).toEqual([
      'o/r#1:0',
      'o/r#1:1',
      'o/r#1:2',
      'o/r#1:4',
      'o/t#3:1',
    ]);
    expect(f.ruled.baseline.M2.false_claim).toMatchObject({ k: 11, n: 17 });
    expect(f.ruled.baseline.M2.claim_holds).toMatchObject({ k: 5, n: 17 });
    expect(f.sensitivity.published.all['baseline M2 false_claim']).toMatchObject({ k: 16, n: 17 });
    expect(f.sensitivity.ruled.withoutDominant.measures['baseline M2 false_claim']).toMatchObject({
      k: 7,
      n: 8,
    });
    expect(f.sensitivity.ruled.largestContributor.baseline).toMatchObject({
      pr: 'o/r#1',
      k: 4,
      n: 11,
    });
    expect(f.published.reproduced).toBe(true);
    expect(readJson(p.erratumFigures)).toEqual(f);
    expect(() => writeErratumFigures({ p, dominantPr: 'o/r#1' })).toThrow(/never redone/);
  });

  it('(ii) refuses a worksheet changed other than in its rulings, or a ruling no measure needs', async () => {
    const p = await ruledStudy();
    const lines = rule(p, (l) => l.publishedLabel);
    writeJsonl(
      p.worksheetRows,
      lines.map((l, i) => (i === 0 ? { ...l, closerRelation: 'other_pr' } : l)),
    );
    expect(() => writeErratumFigures({ p, dominantPr: 'o/r#1' })).toThrow(
      /differs other than in its ruling/,
    );
    expect(() =>
      ruledLabels({
        labels: [],
        lines: [{ advisoryId: 'o/r#1:9', needsRuling: false, ruling: 'false_claim' }],
      }),
    ).toThrow(/none is needed/);
    expect(() =>
      ruledLabels({
        labels: [],
        lines: [{ advisoryId: 'o/r#1:0', needsRuling: true, ruling: 'maybe' }],
      }),
    ).toThrow(/is not one of/);
    expect(() =>
      ruledLabels({
        labels: [{ advisoryId: 'o/r#1:0', measure: 'M1', label: 'real' }],
        lines: [{ advisoryId: 'o/r#1:0', needsRuling: true, ruling: 'not_a_claim' }],
      }),
    ).toThrow(/disagree/);
  });
});

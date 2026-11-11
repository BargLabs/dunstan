// The survey (DRAFT, docs/survey.md), end to end on the fake GitHub with a fixed clock: the fixture
// repository's record and summary, the rates against counts made by hand, nothing dropped, reads
// only, byte-identical runs, and verify on the record and on tampered copies of it. No live run.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { REPO } from '../__tests__/fake-github.js';
import { fakeSurvey, type SurveyWorld } from '../__tests__/fake-survey.js';
import { AGENT, NOW, surveyWorld } from '../__tests__/survey-fixture.js';
import { main } from '../cli/main.js';
import { survey } from '../pipeline/survey.js';
import { checkerIdentity } from '../record/checker.js';
import { remedyForReason } from '../remedy/remedies.js';
import { parseStrictJson } from '../spec/json.js';
import { rate } from './aggregate.js';
import { claimType, column, mappingDigest, SURVEY_MAPPING_VERSION } from './mapping.js';
import {
  LISTING_READS,
  type SurveyParameters,
  type SurveyRecord,
  selectPullRequests,
} from './record.js';
import { ANONYMOUS, renderSurveySummary } from './summary.js';
import { verifySurveyRecord } from './verify.js';

const GOLDEN = new URL('./testdata/fixture-summary.md', import.meta.url);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dunstan-survey-'));
});

async function cli(argv: string[], world: SurveyWorld = surveyWorld(), token = 'test-token') {
  let out = '';
  let err = '';
  const fake = fakeSurvey(world);
  const code = await main(argv, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env: token === '' ? {} : { GITHUB_TOKEN: token },
    artifact: import.meta.url,
    fetch: fake.fetch,
    now: () => NOW,
    readStdin: () => new Uint8Array(),
  });
  return { code, out, err, requests: fake.requests };
}

const FIXTURE_ARGS = ['--repo', REPO, '--last', '13', '--author', AGENT, '--advisory'];

async function fixtureRun(into = dir) {
  const out = join(into, 'survey.json');
  const summary = join(into, 'survey.md');
  const r = await cli(['survey', ...FIXTURE_ARGS, '--out', out, '--summary', summary]);
  return {
    ...r,
    out,
    summary,
    bytes: readFileSync(out, 'utf8'),
    markdown: readFileSync(summary, 'utf8'),
    record: JSON.parse(readFileSync(out, 'utf8')) as SurveyRecord,
  };
}

async function verifyFile(path: string) {
  return cli(['verify', path]);
}

describe('the fixture repository', () => {
  it('gives the summary in the golden file', async () => {
    const run = await fixtureRun();
    expect(run.code).toBe(0);
    expect(run.markdown).toBe(readFileSync(GOLDEN, 'utf8'));
    expect(renderSurveySummary(run.record)).toBe(run.markdown);
  });

  it('gives the rates counted by hand from the fixture', async () => {
    const { record } = await fixtureRun();
    const a = record.aggregate;
    // Supported: 113 (4), 111 (6), 110 (2), 109 (3), 108 (2), 107 (2), 102 (3).
    const supported = 4 + 6 + 2 + 3 + 2 + 2 + 3;
    // Contradicted: 110 (2 files), 109 (1 count). Unverifiable: 107 (2 artifact), 102 (1 checks).
    // Not record-checkable: 108 (2 record_not_found, 1 local_run_not_in_record: its second test
    // record is `{"kind": "local"}`, no_comparable_record_field before spec 0.1.9).
    const contradicted = 3;
    const unverifiable = 3;
    const notRecordCheckable = 3;
    const total = supported + contradicted + unverifiable + notRecordCheckable;
    expect(a.claims).toEqual({
      total,
      supported,
      unverifiable,
      notRecordCheckable,
      contradicted,
    });
    expect(a.cannotSettle).toMatchObject({ numerator: 6, denominator: total });
    expect(a.cannotSettle.value).toBe((6 / 31).toFixed(4));
    expect(a.contradictedOfSettled).toMatchObject({ numerator: 3, denominator: 25 });
    expect(a.contradictedOfSettled.value).toBe((3 / 25).toFixed(4));
    expect(a.byType).toEqual([
      { type: 'T1', supported: 7, unverifiable: 0, notRecordCheckable: 0, contradicted: 0 },
      { type: 'T2', supported: 8, unverifiable: 0, notRecordCheckable: 0, contradicted: 2 },
      { type: 'T3', supported: 1, unverifiable: 1, notRecordCheckable: 2, contradicted: 1 },
      { type: 'T4', supported: 2, unverifiable: 1, notRecordCheckable: 1, contradicted: 0 },
      { type: 'T5', supported: 1, unverifiable: 0, notRecordCheckable: 0, contradicted: 0 },
      { type: 'T6', supported: 1, unverifiable: 1, notRecordCheckable: 0, contradicted: 0 },
      { type: 'T7', supported: 1, unverifiable: 0, notRecordCheckable: 0, contradicted: 0 },
      { type: 'T8', supported: 0, unverifiable: 0, notRecordCheckable: 0, contradicted: 0 },
      { type: 'R', supported: 1, unverifiable: 0, notRecordCheckable: 0, contradicted: 0 },
    ]);
    expect(a.unsettled.map((u) => [u.reason, u.column, u.count])).toEqual([
      ['record_not_found', 'notRecordCheckable', 2],
      ['source_unreadable:artifact', 'unverifiable', 2],
      ['checks_incomplete', 'unverifiable', 1],
      ['local_run_not_in_record', 'notRecordCheckable', 1],
    ]);
    expect(a.pullRequests).toEqual({
      listed: 14,
      selected: 13,
      withRecord: 11,
      blockFound: 7,
      blockMissing: 2,
      blockInvalid: 1,
      blockAmbiguous: 1,
      noRecord: [
        { reason: 'pull_request_unreadable', count: 1 },
        { reason: 'rate_limited', count: 1 },
      ],
    });
  });

  it('keeps every selected pull request, once, in selection order', async () => {
    const { record } = await fixtureRun();
    const selected = [113, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100];
    expect(record.selection.selected).toEqual(selected);
    expect(record.entries.map((e) => e.pullRequest)).toEqual(selected);
    expect(record.selection.listing.end).toBe('selection_full');
    expect(record.selection.listing.pullRequests.map((p) => p.number)).toContain(112);
    expect(record.entries.filter((e) => e.record === null)).toEqual([
      { pullRequest: 103, record: null, reason: 'pull_request_unreadable' },
      { pullRequest: 101, record: null, reason: 'rate_limited' },
    ]);
  });

  it('only reads: GET, and the check’s fixed GraphQL queries', async () => {
    const run = await fixtureRun();
    const other = run.requests.filter((r) => !r.startsWith('GET ') && r !== 'POST /graphql');
    expect(other).toEqual([]);
    expect(run.requests[0]).toBe(
      `GET /repos/${REPO}/pulls?state=closed&sort=created&direction=desc&per_page=100&page=1`,
    );
    // The pull request opened by someone else is listed, never read.
    expect(run.requests.some((r) => r.includes('/pulls/112'))).toBe(false);
  });

  it('writes the same bytes twice, and verify passes on them', async () => {
    const one = await fixtureRun(mkdtempSync(join(tmpdir(), 'dunstan-survey-one-')));
    const two = await fixtureRun(mkdtempSync(join(tmpdir(), 'dunstan-survey-two-')));
    expect(two.bytes).toBe(one.bytes);
    expect(two.markdown).toBe(one.markdown);
    const v = await verifyFile(one.out);
    expect(v.out).toMatch(/^verified: .*survey of 13 pull requests/);
    expect(v.code).toBe(0);
  });
});

describe('verify on a tampered survey record', () => {
  async function tampered(edit: (r: SurveyRecord) => void) {
    const run = await fixtureRun();
    const record = JSON.parse(run.bytes) as SurveyRecord;
    edit(record);
    const path = join(dir, 'tampered.json');
    writeFileSync(path, JSON.stringify(record, null, 2));
    return verifyFile(path);
  }

  it('names an embedded verdict that was changed', async () => {
    const v = await tampered((r) => {
      // #110's third row: src/x.ts, declared and not changed.
      const claim = r.entries[2]?.record?.predicate.claims[2];
      if (claim === undefined) throw new Error('no such claim');
      claim.verdict = 'pass';
      claim.observed = 'src/x.ts';
      delete claim.reason;
    });
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/NOT verified/);
    expect(v.out).toContain('/entries/2/record/predicate/claims/2: recorded');
    // The aggregate recomputes from the tampered row, so it no longer matches either.
    expect(v.out).toContain('/aggregate/claims/contradicted: recorded 3, recomputed 2');
  });

  it('names an aggregate count that was changed', async () => {
    const v = await tampered((r) => {
      r.aggregate.claims.contradicted = 2;
    });
    expect(v.code).toBe(1);
    expect(v.out).toContain('/aggregate/claims/contradicted: recorded 2, recomputed 3');
  });

  it('names a listed pull request that was changed', async () => {
    const v = await tampered((r) => {
      const listed = r.selection.listing.pullRequests.find((p) => p.number === 112);
      if (listed) listed.author = AGENT;
    });
    expect(v.code).toBe(1);
    expect(v.out).toContain('/selection/selected');
    expect(v.out).toContain('/digest/sha256');
  });

  it('names a digest that does not recompute', async () => {
    const v = await tampered((r) => {
      r.selection.listing.pullRequests[0] = {
        ...(r.selection.listing
          .pullRequests[0] as SurveyRecord['selection']['listing']['pullRequests'][number]),
        merged: false,
      };
    });
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/\/digest\/sha256: recorded "[0-9a-f]{64}", recomputed "[0-9a-f]{64}"/);
  });

  it('names an entry dropped from the survey', async () => {
    const v = await tampered((r) => {
      r.entries.splice(9, 1);
    });
    expect(v.code).toBe(1);
    expect(v.out).toContain('/entries/pullRequests/9');
  });

  it('refuses an entry repeated in the entries and the selection', async () => {
    const v = await tampered((r) => {
      const first = r.entries[0];
      if (first === undefined) throw new Error('no entry');
      r.entries.splice(1, 0, structuredClone(first));
      r.selection.selected.splice(1, 0, first.pullRequest);
    });
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/NOT verified/);
    expect(v.out).toContain('/selection/selected: schema_violation (uniqueItems)');
    expect(v.out).toContain('/entries: schema_violation (uniqueItems)');
  });

  it('names a pull request the listing holds twice, even when its copies differ', async () => {
    const v = await tampered((r) => {
      const { listing } = r.selection;
      const first = listing.pullRequests[0];
      const page = listing.pages[0];
      if (first === undefined || page === undefined) throw new Error('no listing');
      // A second copy that differs, so the schema's uniqueItems does not catch it, with the page's
      // count raised so the counts still add up.
      listing.pullRequests.splice(1, 0, { ...first, merged: !first.merged });
      page.items += 1;
    });
    expect(v.code).toBe(1);
    expect(v.out).toContain(
      '/selection/listing/pullRequests/1: pull request 113 is listed again (first at /selection/listing/pullRequests/0)',
    );
    // The selection keeps the first occurrence, so it still selects #113 once.
    expect(v.out).not.toContain('/selection/selected');
  });

  it('names a reader that was changed, and the remedy line it no longer words', async () => {
    const run = await fixtureRun();
    const at = run.record.aggregate.unsettled.findIndex(
      (u) => u.reason === 'source_unreadable:artifact',
    );
    expect(at).toBeGreaterThanOrEqual(0);
    const v = await tampered((r) => {
      r.selection.reader.authenticated = false;
    });
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/NOT verified/);
    // The aggregate recomputes the artifact line for an anonymous reader, so the recorded one differs.
    expect(v.out).toContain(`/aggregate/unsettled/${at}/remedy: recorded "the run uploaded`);
    expect(v.out).toContain('recomputed "GitHub answers an artifact download only with a token');
    expect(v.out).toContain('/digest/sha256');
  });

  it('refuses a reader that records more than whether a token was set', async () => {
    const v = await tampered((r) => {
      (r.selection.reader as unknown as Record<string, unknown>).token = 'ghp_example';
    });
    expect(v.code).toBe(1);
    expect(v.out).toContain('/selection/reader');
  });
});

describe('the reader', () => {
  it('is authenticated when GITHUB_TOKEN is set, and the summary says so with no caveat', async () => {
    const { record, markdown } = await fixtureRun();
    expect(record.selection.reader).toEqual({ authenticated: true });
    const head = markdown.split('\n').slice(0, 8).join('\n');
    expect(head).toContain('GitHub was read with a token (GITHUB_TOKEN set).');
    expect(markdown).not.toContain(ANONYMOUS);
    expect(JSON.stringify(record)).not.toContain('test-token');
  });

  it('words the artifact remedy for the reader, and verify recomputes it from the record', async () => {
    const world = surveyWorld();
    world.anonymousArtifacts = [];
    world.authenticatedArtifacts = [11100, 10900, 10700];
    const out = join(dir, 'anonymous.json');
    const anonymous = await cli(['survey', ...FIXTURE_ARGS, '--out', out], world, '');
    expect(anonymous.code).toBe(0);
    const record = parseStrictJson(readFileSync(out, 'utf8')) as unknown as SurveyRecord;
    const { record: tokened } = await fixtureRun();
    const line = (r: SurveyRecord) =>
      r.aggregate.unsettled.find((u) => u.reason === 'source_unreadable:artifact')?.remedy;
    expect(line(record)).toBe(
      remedyForReason('source_unreadable:artifact', { hasToken: false, caller: 'cli' }),
    );
    expect(line(tokened)).toBe(
      remedyForReason('source_unreadable:artifact', { hasToken: true, caller: 'cli' }),
    );
    expect(line(record)).not.toBe(line(tokened));
    const v = await verifyFile(out);
    expect(v.out).toMatch(/^verified: /);
    expect(v.code).toBe(0);
  });
});

const PARAMETERS: SurveyParameters = {
  repository: REPO,
  last: 30,
  since: null,
  authors: [AGENT],
  report: { kind: 'pr-body' },
  advisory: false,
};

// A listing of `count` pull requests opened by someone else, newest first.
function others(count: number): SurveyWorld {
  return {
    pullRequests: Array.from({ length: count }, (_, i) => ({
      number: count - i,
      createdAt: new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString().replace('.000', ''),
      author: 'human-dev',
      merged: false,
    })),
  };
}

async function collect(world: SurveyWorld, parameters = PARAMETERS, pageBound?: number) {
  const fake = fakeSurvey(world);
  const record = await survey({
    parameters,
    checker: checkerIdentity(import.meta.url),
    out: 'survey.json',
    token: 't',
    fetch: fake.fetch,
    now: () => NOW,
    warn: () => {},
    ...(pageBound === undefined ? {} : { pageBound }),
  });
  return { record, requests: fake.requests };
}

describe('the listing', () => {
  it('records reaching the page bound before N pull requests were selected', async () => {
    const { record, requests } = await collect(others(250), PARAMETERS, 2);
    expect(record.selection.listing.end).toBe('page_bound');
    expect(record.selection.listing.pages.map((p) => p.items)).toEqual([100, 100]);
    expect(record.selection.selected).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(verifySurveyRecord(record).problems).toEqual([]);
    const summary = renderSurveySummary(record);
    expect(summary).toContain('no further because it reached the bound of 2 pages');
    expect(summary).toContain('0 pull requests were selected, fewer than the 30 asked for.');
  });

  it('reads to its end, and no further', async () => {
    const { record } = await collect(others(150));
    expect(record.selection.listing.end).toBe('listing_ended');
    expect(record.selection.listing.pages).toHaveLength(2);
    expect(verifySurveyRecord(record).ok).toBe(true);
  });

  it('stops at a pull request created before --since', async () => {
    const { record } = await collect(others(250), {
      ...PARAMETERS,
      authors: [],
      since: '2026-10-01',
    });
    expect(record.selection.listing.end).toBe('since_reached');
    expect(record.selection.listing.pages).toHaveLength(1);
    expect(verifySurveyRecord(record).ok).toBe(true);
  });

  it('records a page that could not be read, and selects from the pages before it', async () => {
    const world = { ...others(250), listingStatus: { 2: 404 } };
    const { record } = await collect(world);
    expect(record.selection.listing.end).toBe('listing_unreadable');
    expect(record.selection.listing.pages[1]).toMatchObject({
      page: 2,
      error: 'http_404',
      items: 0,
    });
    expect(verifySurveyRecord(record).ok).toBe(true);
  });

  it('checks and counts once a pull request a later page lists again', async () => {
    // 101 pull requests; page 2 starts one item early in every read, as it does after a pull
    // request closed between the two reads, so it repeats page 1's last item, #2, the only one
    // AGENT opened. The first two reads are abandoned there; the third keeps the repeat.
    const world = others(101);
    const two = world.pullRequests[99];
    if (two === undefined) throw new Error('no #2');
    two.author = AGENT;
    world.listingShift = { 2: 1 };
    const { record, requests } = await collect(world);
    const { listing } = record.selection;
    expect(listing.abandoned.map((r) => r.pages.map((p) => [p.items, p.duplicates]))).toEqual([
      [
        [100, 0],
        [2, 1],
      ],
      [
        [100, 0],
        [2, 1],
      ],
    ]);
    expect(requests.filter((r) => r.startsWith(`GET /repos/${REPO}/pulls?`))).toHaveLength(6);
    expect(listing.pages.map((p) => [p.items, p.duplicates])).toEqual([
      [100, 0],
      [2, 1],
    ]);
    expect(listing.duplicates).toBe(1);
    expect(listing.pullRequests).toHaveLength(101);
    expect(listing.pullRequests.filter((p) => p.number === 2)).toHaveLength(1);
    expect(listing.end).toBe('listing_ended');
    expect(record.selection.selected).toEqual([2]);
    expect(record.entries).toEqual([
      { pullRequest: 2, record: null, reason: 'pull_request_unreadable' },
    ]);
    expect(record.aggregate.pullRequests).toMatchObject({ listed: 101, selected: 1 });
    expect(requests.filter((r) => r === `GET /repos/${REPO}/pulls/2`)).toHaveLength(1);
    expect(verifySurveyRecord(record).problems).toEqual([]);
    expect(renderSurveySummary(record)).toContain(
      'The listing named 1 pull request again on a later page, so it changed while it was read: most likely 1 pull request closed meanwhile and was not listed, and the selection may be missing it. Each repeated pull request is listed, selected and counted once: the pages held 102 items for 101 pull requests.',
    );
  });

  it('reads the listing again from page 1 when a page repeats, and lists the pull request that closed', async () => {
    // 101 closed pull requests, and #102, created after all of them and opened by AGENT, which
    // closes once the listing has answered its first page request. The first read's page 2 repeats
    // #2 and leaves #102 out; the second read lists #102 on page 1 and repeats nothing.
    const world = others(101);
    world.pullRequests.unshift({
      number: 102,
      createdAt: '2026-10-02T00:00:00Z',
      author: AGENT,
      merged: true,
    });
    world.closesAfterListingRequests = { 102: 1 };
    const { record, requests } = await collect(world);
    const { listing } = record.selection;
    expect(listing.abandoned).toHaveLength(1);
    expect(listing.abandoned[0]?.pages.map((p) => [p.page, p.items, p.duplicates])).toEqual([
      [1, 100, 0],
      [2, 2, 1],
    ]);
    expect(listing.pages.map((p) => [p.page, p.items, p.duplicates])).toEqual([
      [1, 100, 0],
      [2, 2, 0],
    ]);
    expect(listing.duplicates).toBe(0);
    expect(listing.end).toBe('listing_ended');
    expect(listing.pullRequests).toHaveLength(102);
    expect(listing.pullRequests[0]?.number).toBe(102);
    expect(record.selection.selected).toEqual([102]);
    expect(record.entries.map((e) => e.pullRequest)).toEqual([102]);
    expect(requests.filter((r) => r.startsWith(`GET /repos/${REPO}/pulls?`))).toEqual([
      `GET /repos/${REPO}/pulls?state=closed&sort=created&direction=desc&per_page=100&page=1`,
      `GET /repos/${REPO}/pulls?state=closed&sort=created&direction=desc&per_page=100&page=2`,
      `GET /repos/${REPO}/pulls?state=closed&sort=created&direction=desc&per_page=100&page=1`,
      `GET /repos/${REPO}/pulls?state=closed&sort=created&direction=desc&per_page=100&page=2`,
    ]);
    expect(verifySurveyRecord(record).problems).toEqual([]);
    const summary = renderSurveySummary(record);
    expect(summary).toContain(
      'The listing moved while it was read: 1 read was abandoned at a repeated pull request and the listing was read again from the first page. The read used repeated no pull request.',
    );
    expect(summary).not.toContain('again on a later page');
  });

  it('keeps the third read’s repeat when the listing moves during every read', async () => {
    // #102, #103 and #104 close after the listing has answered 1, 3 and 5 page requests: during
    // each read's page 2.
    const world = others(101);
    world.pullRequests.unshift(
      ...[104, 103, 102].map((number) => ({
        number,
        createdAt: `2026-10-02T00:00:0${number - 100}Z`,
        author: AGENT,
        merged: false,
      })),
    );
    world.closesAfterListingRequests = { 102: 1, 103: 3, 104: 5 };
    const { record, requests } = await collect(world);
    const { listing } = record.selection;
    expect(listing.abandoned.map((r) => r.pages.map((p) => [p.items, p.duplicates]))).toEqual([
      [
        [100, 0],
        [2, 1],
      ],
      [
        [100, 0],
        [3, 1],
      ],
    ]);
    expect(listing.pages.map((p) => [p.items, p.duplicates])).toEqual([
      [100, 0],
      [4, 1],
    ]);
    expect(listing.duplicates).toBe(1);
    expect(listing.pullRequests.map((p) => p.number)).not.toContain(104);
    expect(record.selection.selected).toEqual([103, 102]);
    expect(requests.filter((r) => r.startsWith(`GET /repos/${REPO}/pulls?`))).toHaveLength(6);
    expect(verifySurveyRecord(record).problems).toEqual([]);
    expect(renderSurveySummary(record)).toContain(
      'The listing named 1 pull request again on a later page, so it changed while it was read: most likely 1 pull request closed meanwhile and was not listed, and the selection may be missing it. Each repeated pull request is listed, selected and counted once: the pages held 104 items for 103 pull requests. It was read 3 times, from the first page each time, and moved during every read.',
    );
  });

  it('says how many the read used repeated when it repeated more than one', async () => {
    // As above, but #104 and #105 both close during the third read's page 2, so it repeats two.
    const world = others(101);
    world.pullRequests.unshift(
      ...[105, 104, 103, 102].map((number) => ({
        number,
        createdAt: `2026-10-02T00:00:0${number - 100}Z`,
        author: AGENT,
        merged: false,
      })),
    );
    world.closesAfterListingRequests = { 102: 1, 103: 3, 104: 5, 105: 5 };
    const { record } = await collect(world);
    const { listing } = record.selection;
    expect(listing.abandoned).toHaveLength(2);
    expect(listing.pages.map((p) => [p.items, p.duplicates])).toEqual([
      [100, 0],
      [5, 2],
    ]);
    expect(verifySurveyRecord(record).problems).toEqual([]);
    expect(renderSurveySummary(record)).toContain(
      'The listing named 2 pull requests again on a later page, so it changed while it was read: most likely 2 pull requests closed meanwhile and were not listed, and the selection may be missing them. Each repeated pull request is listed, selected and counted once: the pages held 105 items for 103 pull requests. It was read 3 times, from the first page each time, and moved during every read.',
    );
  });

  it('reads the listing once when nothing moves', async () => {
    const run = await fixtureRun();
    expect(run.record.selection.listing.abandoned).toEqual([]);
    expect(run.requests.filter((r) => r.startsWith(`GET /repos/${REPO}/pulls?`))).toHaveLength(1);
    expect(run.markdown).not.toContain('The listing moved while it was read');
  });

  describe('verify on a tampered reread', () => {
    async function recovered() {
      const world = others(101);
      world.pullRequests.unshift({
        number: 102,
        createdAt: '2026-10-02T00:00:00Z',
        author: AGENT,
        merged: true,
      });
      world.closesAfterListingRequests = { 102: 1 };
      return (await collect(world)).record;
    }
    async function neverStill() {
      const world = { ...others(101), listingShift: { 2: 1 } };
      return (await collect(world)).record;
    }
    const membersOf = (record: SurveyRecord) =>
      verifySurveyRecord(record).problems.map((p) => p.member);

    it('names an abandoned read whose last page repeated nothing', async () => {
      const record = await recovered();
      const page = record.selection.listing.abandoned[0]?.pages[1];
      if (page === undefined) throw new Error('no abandoned page');
      page.duplicates = 0;
      expect(membersOf(record)).toContain('/selection/listing/abandoned/0/pages/1/duplicates');
    });

    it('names an abandoned read that repeated before its last page', async () => {
      const record = await recovered();
      const page = record.selection.listing.abandoned[0]?.pages[0];
      if (page === undefined) throw new Error('no abandoned page');
      page.duplicates = 1;
      expect(membersOf(record)).toContain('/selection/listing/abandoned/0/pages/0/duplicates');
    });

    it('refuses three abandoned reads', async () => {
      const record = await neverStill();
      const { abandoned } = record.selection.listing;
      abandoned.push(structuredClone(abandoned[0] as (typeof abandoned)[number]));
      const problems = verifySurveyRecord(record).problems;
      expect(problems.map((p) => p.member)).toContain('/selection/listing/abandoned');
      expect(problems[0]?.message).toMatch(/schema_violation \(maxItems\)/);
    });

    it('holds the abandoned reads to the reread bound in the schema', () => {
      // The schema alone refuses a record past the bound, so its maxItems and LISTING_READS must
      // agree: changing either without the other fails here.
      const schema = JSON.parse(
        readFileSync(
          new URL('../../spec/schema/survey-0.1-draft.schema.json', import.meta.url),
          'utf8',
        ),
      );
      expect(schema.$defs.listing.properties.abandoned.maxItems).toBe(LISTING_READS - 1);
    });

    it('names a used read that repeated with only one read abandoned before it', async () => {
      const record = await neverStill();
      record.selection.listing.abandoned.pop();
      const problems = verifySurveyRecord(record).problems;
      expect(problems.map((p) => p.member)).toContain('/selection/listing/abandoned');
      expect(problems.map((p) => p.message).join('\n')).toContain(
        '1 reads abandoned, but the read used repeated 1 items',
      );
    });

    it('names an abandoned page read after the used read’s first page', async () => {
      const record = await recovered();
      const page = record.selection.listing.abandoned[0]?.pages[1];
      if (page === undefined) throw new Error('no abandoned page');
      page.readAt = new Date(NOW.getTime() + 1000).toISOString();
      expect(membersOf(record)).toContain('/selection/listing/abandoned/0/pages/1/readAt');
    });

    it('names an abandoned read with a gap in its pages', async () => {
      const record = await recovered();
      const page = record.selection.listing.abandoned[0]?.pages[1];
      if (page === undefined) throw new Error('no abandoned page');
      page.page = 3;
      expect(membersOf(record)).toContain('/selection/listing/abandoned/0/pages/1/page');
    });
  });

  it('selects a number a listing repeats once', () => {
    const listed = [1, 2, 2, 3].map((number) => ({
      number,
      createdAt: '2026-10-01T00:00:00Z',
      author: AGENT,
      merged: false,
    }));
    expect(selectPullRequests(PARAMETERS, listed)).toEqual([1, 2, 3]);
  });

  it('fails verify on a duplicate count that does not recompute from the pages', async () => {
    const world = { ...others(101), listingShift: { 2: 1 } };
    const { record } = await collect(world);
    const edited = structuredClone(record);
    edited.selection.listing.duplicates = 0;
    const members = verifySurveyRecord(edited).problems.map((p) => p.member);
    expect(members).toContain('/selection/listing/duplicates');
    expect(members).toContain('/selection/listing/pullRequests/length');
  });

  it('fails verify on a listing read past its end', async () => {
    const { record } = await collect(others(250), PARAMETERS, 3);
    const cut = structuredClone(record);
    cut.selection.listing.end = 'listing_ended';
    (cut.selection.listing.pages[0] as { items: number }).items = 50;
    const problems = verifySurveyRecord(cut).problems.map((p) => p.member);
    expect(problems).toContain('/selection/listing/pages/1');
  });
});

describe('an anonymous survey', () => {
  it('reads no artifact: GitHub serves none to an anonymous reader', async () => {
    const world = surveyWorld();
    world.anonymousArtifacts = [];
    world.authenticatedArtifacts = [11100, 10900, 10700];
    const out = join(dir, 'anonymous.json');
    const r = await cli(['survey', ...FIXTURE_ARGS, '--out', out], world, '');
    expect(r.code).toBe(0);
    expect(r.err).toContain('GITHUB_TOKEN is not set; reading anonymously');
    const record = parseStrictJson(readFileSync(out, 'utf8')) as unknown as SurveyRecord;
    const tests = record.entries.flatMap((e) =>
      (e.record?.predicate.claims ?? []).filter((c) => c.field.startsWith('/tests/')),
    );
    const reasons = new Set(tests.map((c) => c.reason));
    expect(reasons).toEqual(
      new Set(['source_unreadable:artifact', 'record_not_found', 'local_run_not_in_record']),
    );
    // Without --summary the summary is standard output.
    expect(r.out).toBe(renderSurveySummary(record));
  });

  it('records an anonymous reader, and its summary says the cannot-settle share is higher', async () => {
    const out = join(dir, 'anonymous.json');
    const r = await cli(['survey', ...FIXTURE_ARGS, '--out', out], surveyWorld(), '');
    expect(r.code).toBe(0);
    const record = parseStrictJson(readFileSync(out, 'utf8')) as unknown as SurveyRecord;
    expect(record.selection.reader).toEqual({ authenticated: false });
    const head = r.out.split('\n').slice(0, 8).join('\n');
    expect(head).toContain(`GitHub was read without a token (GITHUB_TOKEN not set). ${ANONYMOUS}`);
    expect(ANONYMOUS).toBe(
      'Without a token, every tests claim naming a JUnit record and every `closes` claim cannot be settled, so the cannot-settle share is higher than an authenticated read of the same repository would give.',
    );
    expect(r.out.split(ANONYMOUS)).toHaveLength(2);
  });
});

describe('the command line', () => {
  it.each([
    [['survey', '--repo', REPO], /--out <survey.json> is required/],
    [['survey', '--out', 'x.json'], /--repo <owner\/name> is required/],
    [['survey', '--repo', REPO, '--out', 'x.json', '--last', '201'], /--last is at most 200/],
    [['survey', '--repo', REPO, '--out', 'x.json', '--last', '0'], /--last must be a positive/],
    [
      ['survey', '--repo', REPO, '--out', 'x.json', '--since', '2026-02-30'],
      /--since must be a date/,
    ],
    [
      ['survey', '--repo', REPO, '--out', 'x.json', '--since', '2026-13-01'],
      /--since must be a date/,
    ],
    [
      ['survey', '--repo', REPO, '--out', 'x.json', '--author', 'a b'],
      /--author must be a GitHub login/,
    ],
  ])('refuses %j', async (argv, message) => {
    const r = await cli(argv as string[]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(message);
    expect(r.requests).toEqual([]);
  });

  it('names the survey in the usage', async () => {
    const r = await cli(['--help']);
    expect(r.out).toContain('dunstan survey --repo <owner/name> --out <survey.json>');
  });
});

describe('the mapping', () => {
  it('is version 0.3, pinned to a digest of every type, column and remedy', () => {
    expect(SURVEY_MAPPING_VERSION).toBe('0.3');
    // A change to the mapping or to a remedy line, in either reader's wording, changes this digest:
    // bump the version with it.
    expect(mappingDigest()).toBe(
      'f5ca2dba20b198ad773fda60ace7133bf57a18d73bfd4d632bd0051c19de339b',
    );
  });

  it.each([
    ['head', '/headCommit', 'T1'],
    ['scope', '/filesChanged/0', 'T2'],
    ['scope', '/filesChanged', 'T2'],
    ['count', '/tests/0/count', 'T3'],
    ['count', '/tests/12/failures', 'T4'],
    ['count', '/checks/total', 'T5'],
    ['count', '/checks/allSucceeded', 'T6'],
    ['count', '/checks/noneFailed', 'T6'],
    ['time', '/mergedAt', 'T7'],
    ['time', '/deployedAt', 'T8'],
    ['reference', '/references/0', 'R'],
  ] as const)('types %s %s as %s', (check, field, type) => {
    expect(claimType({ check, field })).toBe(type);
  });

  it.each([
    [{ verdict: 'pass' }, 'supported'],
    [{ verdict: 'fail', reason: 'count_mismatch' }, 'contradicted'],
    [{ verdict: 'unverifiable', reason: 'record_not_found' }, 'notRecordCheckable'],
    [{ verdict: 'unverifiable', reason: 'no_comparable_record_field' }, 'notRecordCheckable'],
    [{ verdict: 'unverifiable', reason: 'local_run_not_in_record' }, 'notRecordCheckable'],
    [{ verdict: 'unverifiable', reason: 'source_unreadable:artifact' }, 'unverifiable'],
    [{ verdict: 'unverifiable', reason: 'checks_incomplete' }, 'unverifiable'],
  ] as const)('puts %j in %s', (claim, col) => {
    expect(column(claim)).toBe(col);
  });
});

describe('the rates', () => {
  it('give the Wilson 95% interval as fixed decimals', () => {
    // 0 of 10: the upper bound is z^2/n / (1 + z^2/n) = 0.38416 / 1.38416.
    expect(rate(0, 10)).toEqual({
      numerator: 0,
      denominator: 10,
      value: '0.0000',
      wilson95: { low: '0.0000', high: '0.2775' },
    });
    expect(rate(10, 10).wilson95).toEqual({ low: '0.7225', high: '1.0000' });
    expect(rate(1, 240)).toEqual({
      numerator: 1,
      denominator: 240,
      value: '0.0042',
      wilson95: { low: '0.0007', high: '0.0232' },
    });
    expect(rate(0, 0)).toEqual({ numerator: 0, denominator: 0, value: null, wilson95: null });
  });
});

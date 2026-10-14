// The retrieval challenge set (test/retrieval-challenge/; docs/retrieval.md, "Challenge set"): typed
// claims against record items built to be confused with the right one. Each case states the
// candidates Arm A should propose first, the ones the check must not read, and the check's verdict.
// This test records what Arm A and the check do today, exactly (the snapshot), and lists every case
// where that differs from the case's expectation as a known miss. It passes on today's code. A new
// miss or a fixed one fails it until KNOWN_MISSES and the snapshot are updated, so every change in
// retrieval shows as a diff. It measures; it fixes nothing.
//
// Arm B is not run: Dunstan ships no embedding provider, and the test double in retrieval-fixtures.ts
// is a hashed bag of words, not a model.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareAdvisory } from '../advisory/advise.js';
import type { Evidence, Verdict } from '../check/types.js';
import { loadCorpus } from '../eval/retrieval.js';
import type { JsonValue } from '../spec/json.js';
import { type ItemSnapshot, recordItems } from './items.js';
import {
  combinedCandidates,
  namedWorkflowRuns,
  READER_CLAIM_KINDS,
  readReaderClaim,
} from './reader-claims.js';
import { BM25_FLOOR, retrieve } from './retrieve.js';
import type { Candidate } from './types.js';

const DIR = fileURLToPath(new URL('../../test/retrieval-challenge/', import.meta.url));
const FAMILIES = ['checks', 'closes', 'lexical', 'numbers', 'paths', 'shas', 'tests'];

// The 0.1 sections a closes case's check reads (spec section 7.4), for that case alone: its pull
// request's state over the family's, and its closing references, references and close events. A
// checks case may carry its own check runs, and a tests case its own items, in place of the
// family's, which retrieval reads too.
type CaseEvidence = Partial<
  Pick<Evidence, 'closingReferences' | 'references' | 'closeEvents' | 'checkRuns' | 'items'>
> & {
  pullRequest?: Partial<Evidence['pullRequest']>;
};

interface ChallengeClaim {
  id: string;
  // What the confusable is, in one line.
  confusion: string;
  text: string;
  kind: string;
  declaredValue: JsonValue;
  evidence?: CaseEvidence;
  // The ids the check should read first, in this order: the head of Arm A's list.
  expectCandidates: string[];
  // The ids the check must not read: no identifier match, and no score at or above the floor.
  forbidCandidates: string[];
  // reason and observed are compared when given.
  expectCheck: { verdict: Verdict; reason?: string; observed?: JsonValue };
}

interface ChallengeFamily {
  repository: string;
  family: string;
  evidence: ItemSnapshot;
  claims: ChallengeClaim[];
}

// What a miss reaches: a wrong verdict or reason, a wrong observed value under the right verdict, or
// only a wrong candidate (a confusable the check reads, or the right item ranked below another).
type Effect = 'verdict' | 'observed' | 'candidates';

// Every case where today's behaviour differs from the case's expectation, keyed family/case. Each is
// for a later change to fix, or to keep with a reason. Since 10X an identifier match closes the set
// the check combines (docs/retrieval.md, "Exact identifiers close the set"), so a lexical candidate
// read beside one is no longer a miss. Since 10X2 a claim with no identifier match whose top
// candidates tie and disagree on the outcome is unverifiable (docs/retrieval.md, "Ties that
// disagree are ambiguous"), and the check reads none of its candidates. Since 10Z a
// reference_closes claim is the 0.1 gate's 7.4 row (docs/retrieval.md, "Closing claims"); the closes
// family has no miss. Since 10Y2 a check_succeeded claim that names its job's workflow reads that
// workflow's runs, or is unverifiable when the record cannot tell which run is that workflow's
// (docs/retrieval.md, "A job named with its workflow"). Since 10X3 a bare test name held under two
// or more classnames names only the cases whose classname the text also names (docs/retrieval.md,
// "A classname named apart from the name"); the tests family has no miss. Since 10Y3 a job named
// with its workflow may carry its event, `<workflow> / <job> (<event>)`, and a classname shorter
// than MIN_NAME_LENGTH never restricts a name. Since 10Y4 (spec 0.1.5) a run's evidence carries
// its workflow's name, and a workflow is named by its path or its name; a name held by two paths,
// or a job followed by a parenthesis the record does not hold, is unverifiable.
const KNOWN_MISSES = new Map<string, { effect: Effect; reason: string }>([
  // checks
  [
    'checks/short-name',
    {
      effect: 'candidates',
      reason: "ci-docs (232) shares the token ci and is read; ci's failure decides anyway.",
    },
  ],
  // lexical
  [
    'lexical/api-version-later',
    {
      effect: 'verdict',
      reason:
        'Kept on purpose. "version 2" matches neither v1 nor v2, so they tie and disagree, and the claim is unverifiable, which fails closed. Making "version 2" name v2 would be a guessed expansion.',
    },
  ],
  // paths
  [
    'paths/sibling-not-changed',
    {
      effect: 'candidates',
      reason: 'The changed siblings are read; the verdict stays unverifiable.',
    },
  ],
  [
    'paths/monorepo-not-changed',
    {
      effect: 'candidates',
      reason:
        'packages/a and packages/c index.ts tie and are both read; the verdict stays unverifiable.',
    },
  ],
  [
    'paths/rename-old-path-reused',
    {
      effect: 'observed',
      reason:
        'The renamed src/text/format.ts matches on previousPath, comes first by record order and is observed.',
    },
  ],
  // shas
  [
    'shas/prefix7-later-commit',
    {
      effect: 'observed',
      reason:
        'Both commits match the 7-hex prefix; record order puts the lint commit first and it is observed.',
    },
  ],
  [
    'shas/full-declared-short-text',
    {
      effect: 'candidates',
      reason: "The text's 7-hex prefix names the lint commit too, ahead of the declared one.",
    },
  ],
  [
    'shas/full-not-in-pull-request',
    {
      effect: 'candidates',
      reason: "The text's 7-hex prefix names both commits, though the declared SHA is neither.",
    },
  ],
]);

// The family files are read by the corpus loader; a challenge case extends a corpus claim.
const families = loadCorpus(DIR) as unknown as Map<string, ChallengeFamily>;

const READER = { name: 'challenge-set', version: '0.0.0' };

function evidenceOf(snapshot: ItemSnapshot, own: CaseEvidence = {}): Evidence {
  const { pullRequest, ...sections } = own;
  return {
    pullRequest: {
      status: 'ok',
      number: 7,
      state: 'open',
      merged: false,
      mergedAt: null,
      headSha: '0'.repeat(40),
      mergeSha: null,
      changedFiles: snapshot.files?.status === 'ok' ? snapshot.files.entries.length : 0,
      ...pullRequest,
    },
    ...snapshot,
    ...sections,
    sources: [],
  };
}

interface Run {
  key: string;
  family: ChallengeFamily;
  claim: ChallengeClaim;
  // Arm A, unfilled: the identifier matches and the candidates at or above the floor.
  armA: Candidate[];
  // The candidates the check reads: Arm A's identifier matches if there are any, which close the
  // set, and otherwise all of Arm A; of a job named with its workflow, that workflow's runs only. A
  // claim the check finds ambiguous, or whose named workflow the record cannot place, reads none.
  combined: Candidate[];
  evidence: Evidence;
  recorded: ReturnType<typeof readReaderClaim>;
}

const runs: Run[] = [...families].flatMap(([name, family]) =>
  family.claims.map((claim) => {
    const type = READER_CLAIM_KINDS.get(claim.kind);
    const query = { text: claim.text, declaredValue: claim.declaredValue };
    const evidence = evidenceOf(family.evidence, claim.evidence);
    const armA = retrieve(query, recordItems(evidence), {
      repository: family.repository,
      ...(type === undefined ? {} : { types: [type] }),
    });
    const recorded = readReaderClaim(
      { text: claim.text, kind: claim.kind, declaredValue: claim.declaredValue, reader: READER },
      evidence,
      family.repository,
    );
    const closed = combinedCandidates(armA, BM25_FLOOR);
    const scoped = type === 'check_run' ? namedWorkflowRuns(claim.text, closed, evidence) : closed;
    const combined =
      recorded.reason === 'ambiguous_candidates' || !Array.isArray(scoped) ? [] : scoped;
    return { key: `${name}/${claim.id}`, family, claim, armA, combined, evidence, recorded };
  }),
);

// How today's behaviour falls short of the case's expectation, if it does: the effect, and each
// shortfall in words.
function shortfalls({ claim, armA, combined, recorded }: Run): {
  effect: Effect;
  found: string[];
} | null {
  const ids = armA.map((c) => c.id);
  const readIds = combined.map((c) => c.id);
  const want = claim.expectCheck;
  const found: string[] = [];
  let effect: Effect = 'candidates';

  if (
    recorded.verdict !== want.verdict ||
    (want.reason !== undefined && recorded.reason !== want.reason)
  ) {
    effect = 'verdict';
    found.push(
      `check ${recorded.verdict}/${recorded.reason ?? '-'}, expected ${want.verdict}/${want.reason ?? 'any'}`,
    );
  } else if (
    want.observed !== undefined &&
    JSON.stringify(recorded.observed) !== JSON.stringify(want.observed)
  ) {
    effect = 'observed';
    found.push(
      `observed ${JSON.stringify(recorded.observed)}, expected ${JSON.stringify(want.observed)}`,
    );
  }
  const head = ids.slice(0, claim.expectCandidates.length);
  if (JSON.stringify(head) !== JSON.stringify(claim.expectCandidates)) {
    found.push(`first ${JSON.stringify(head)}, expected ${JSON.stringify(claim.expectCandidates)}`);
  }
  const read = claim.forbidCandidates.filter((id) => readIds.includes(id));
  if (read.length > 0) found.push(`the check reads ${JSON.stringify(read)}`);
  return found.length === 0 ? null : { effect, found };
}

// One line per candidate, as recorded (filled ones too): id, then its score, or the field an
// identifier match named. A candidate at or above the floor that an identifier match leaves out of
// the set the check combines is marked so.
function summary({ combined, recorded }: Run) {
  const notCombined = (c: Candidate) =>
    c.score !== null && c.score >= BM25_FLOOR && !combined.some((x) => x.id === c.id);
  return {
    candidates: recorded.candidates.map(
      (c) =>
        `${c.id} ${c.score === null ? `= ${c.matchedField}` : c.score}${notCombined(c) ? ' (not combined)' : ''}`,
    ),
    verdict: recorded.verdict,
    reason: recorded.reason ?? null,
    observed: recorded.observed,
  };
}

describe('the retrieval challenge set', () => {
  it('has seven families of at least three cases, each naming items its record holds', () => {
    expect([...families.keys()]).toEqual(FAMILIES);
    for (const [name, family] of families) {
      expect(family.family).toBe(name);
      expect(family.claims.length).toBeGreaterThanOrEqual(3);
      for (const claim of family.claims) {
        const items = recordItems(evidenceOf(family.evidence, claim.evidence));
        const type = READER_CLAIM_KINDS.get(claim.kind);
        expect(type, `${name}/${claim.id}`).toBeDefined();
        const ids = new Set(items.filter((i) => i.type === type).map((i) => i.id));
        for (const id of [...claim.expectCandidates, ...claim.forbidCandidates]) {
          expect(ids.has(id), `${name}/${claim.id}: ${id}`).toBe(true);
        }
        expect(claim.confusion.length).toBeGreaterThan(0);
      }
    }
    expect(new Set(runs.map((r) => r.key)).size).toBe(runs.length);
  });

  it.each(runs)('$key: Arm A and the check, as they stand', (run) => {
    // The check reads exactly Arm A's unfilled list: the recorded list filled to k has it as its head.
    const read = run.recorded.candidates.filter((c) => c.score === null || c.score >= BM25_FLOOR);
    expect(read).toEqual(run.armA);
    expect(summary(run)).toMatchSnapshot();
  });

  it('misses exactly the known misses', () => {
    const found = new Map<string, { effect: Effect; found: string[] }>();
    for (const run of runs) {
      const miss = shortfalls(run);
      if (miss !== null) found.set(run.key, miss);
    }
    const effects = (m: ReadonlyMap<string, { effect: Effect }>) =>
      Object.fromEntries([...m].map(([key, v]) => [key, v.effect]));
    expect(effects(found), JSON.stringify(Object.fromEntries(found), null, 2)).toEqual(
      effects(KNOWN_MISSES),
    );
  });

  // A reference_closes claim and a reference_closes advisory are both the 0.1 gate's 7.4 row for a
  // block that declares the one closes, so on every closes case the two say the same.
  it('decides each closes case as advisory comparison 0.4.0 notes it', () => {
    const closes = runs.filter((r) => r.claim.kind === 'reference_closes');
    expect(closes.length).toBeGreaterThan(0);
    for (const { key, claim, evidence, family, recorded } of closes) {
      const advisory = compareAdvisory(
        { kind: 'reference_closes', value: claim.declaredValue as string },
        evidence,
        family.repository,
        [],
      );
      const note =
        recorded.verdict === 'pass'
          ? 'agrees'
          : `${recorded.verdict === 'fail' ? 'differs' : 'unanswered'}:${recorded.reason}`;
      expect({ note, observed: recorded.observed }, key).toEqual(advisory);
    }
  });

  it('gives each known miss a family it belongs to and a reason', () => {
    for (const [key, miss] of KNOWN_MISSES) {
      expect(FAMILIES).toContain(key.split('/')[0]);
      expect(miss.reason.length, key).toBeGreaterThan(0);
    }
  });

  // docs/retrieval.md states the counts; this keeps its table in step with the cases and the list.
  it('has the counts docs/retrieval.md states', () => {
    const misses = [...KNOWN_MISSES];
    const of = (family: string) => (key: string) => key.startsWith(`${family}/`);
    const row = (name: string, cases: number, known: [string, { effect: Effect }][]) =>
      `| ${name} | ${cases} | ${known.length} | ${known.filter(([, m]) => m.effect === 'verdict').length} |`;
    const table = [
      '| Family | Cases | Known misses | Of which a wrong verdict |',
      '| --- | --- | --- | --- |',
      ...FAMILIES.map((family) =>
        row(
          `\`${family}\``,
          runs.filter((r) => of(family)(r.key)).length,
          misses.filter(([key]) => of(family)(key)),
        ),
      ),
      row('All', runs.length, misses),
    ].join('\n');
    const docs = readFileSync(new URL('../../docs/retrieval.md', import.meta.url), 'utf8');
    expect(docs).toContain(table);
  });
});

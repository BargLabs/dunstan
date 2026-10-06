import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { caseEvidence, REPO } from '../__tests__/retrieval-fixtures.js';
import { main } from '../cli/main.js';
import { buildRecord, type DunstanRecord, recordBlock, serializeRecord } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';
import { DRAFT_PREDICATE_TYPE, DRAFT_SPEC_VERSION, PREDICATE_TYPE } from '../spec/constants.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { validateDraftRecord, validateRecord } from '../spec/schema.js';
import { recordItems } from './items.js';
import {
  checkReaderClaim,
  READER_CLAIM_K,
  READER_CLAIM_KINDS,
  type ReaderClaimInput,
  readReaderClaim,
} from './reader-claims.js';
import { BM25_FLOOR, FILL_TO_K, retrieve } from './retrieve.js';

// Offline verification must recompute reader verdicts from the recorded candidates and never run a
// fresh retrieval. While `forbid` is set, retrieval throws.
const guard = vi.hoisted(() => ({ forbid: false }));
vi.mock('./retrieve.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./retrieve.js')>();
  return {
    ...actual,
    retrieve: (...args: Parameters<typeof actual.retrieve>) => {
      if (guard.forbid) throw new Error('retrieval ran during offline verification');
      return actual.retrieve(...args);
    },
  };
});

const READER = { name: 'example-reader', version: '0.0.1' };
const claim = (
  text: string,
  kind: string,
  declaredValue: ReaderClaimInput['declaredValue'],
  probability?: number,
): ReaderClaimInput =>
  probability === undefined
    ? { text, kind, declaredValue, reader: READER }
    : { text, kind, declaredValue, reader: READER, probability };

const storage = caseEvidence('storage-retry');
const read = (input: ReaderClaimInput, evidence = storage) =>
  readReaderClaim(input, evidence, REPO);

describe('reader claims', () => {
  it('passes a changed file the claim names', () => {
    const c = read(
      claim('Renamed blobs.ts to blob-store.ts', 'file_changed', 'src/storage/blob-store.ts'),
    );
    expect(c).toMatchObject({ verdict: 'pass', observed: 'src/storage/blob-store.ts' });
    expect(c.candidates[0]).toMatchObject({ type: 'file', score: null });
  });

  it('is unverifiable with no_matching_record_item when no candidate reaches the floor, and states the floor', () => {
    const c = read(claim('Rewrote the onboarding wizard', 'file_changed', 'app/wizard.rb'));
    expect(c.candidates.every((x) => x.score !== null && x.score < BM25_FLOOR)).toBe(true);
    expect(c).toMatchObject({
      verdict: 'unverifiable',
      reason: 'no_matching_record_item',
      observed: null,
      retrieval: { arm: 'A-fill', floor: BM25_FLOOR, k: READER_CLAIM_K },
    });
  });

  it('never passes a declared item that is not among the candidates', () => {
    const c = read(claim('Updated the retry module', 'file_changed', 'src/storage/retry-old.ts'));
    expect(c.candidates.length).toBeGreaterThan(0);
    expect(c).toMatchObject({
      verdict: 'unverifiable',
      reason: 'declared_item_not_among_candidates',
    });
  });

  it('fails a check the candidate run contradicts, reading no filled candidate', () => {
    const c = read(claim('The typecheck job passes', 'check_succeeded', true));
    // 103 is the identifier match; 101 and 102 fill the list and are not read.
    expect(c.candidates.map((x) => [x.id, x.score === null || x.score >= BM25_FLOOR])).toEqual([
      ['103', true],
      ['101', false],
      ['102', false],
    ]);
    expect(c).toMatchObject({ verdict: 'fail', reason: 'all_succeeded_mismatch', observed: false });
  });

  it('fails a test the candidate test case contradicts, and passes one it supports', () => {
    expect(read(claim('The upload test passes now', 'test_passed', true))).toMatchObject({
      verdict: 'fail',
      reason: 'test_outcome_mismatch',
    });
    expect(
      read(claim('The test for giving up after five attempts passes', 'test_passed', true)),
    ).toMatchObject({ verdict: 'pass', observed: true });
  });

  it('passes a commit and a reference the record holds', () => {
    expect(read(claim('Commit 0f1e2d3 renames it', 'commit_present', '0f1e2d3'))).toMatchObject({
      verdict: 'pass',
      observed: '0f1e2d3c4b5a69788796a5b4c3d2e1f001234567',
    });
    expect(read(claim('Fixes #41', 'reference_in_timeline', '#41'))).toMatchObject({
      verdict: 'pass',
      observed: { event: 'cross-referenced', ref: `${REPO}#41` },
    });
  });

  it('never reads the probability: the same claim gets the same check at any probability', () => {
    const low = read(claim('The typecheck job passes', 'check_succeeded', true, 0.01));
    const high = read(claim('The typecheck job passes', 'check_succeeded', true, 0.99));
    const none = read(claim('The typecheck job passes', 'check_succeeded', true));
    for (const c of [low, high]) {
      expect({ ...c, probability: undefined }).toEqual({ ...none, probability: undefined });
    }
    expect(low.probability).toBe(0.01);
    expect(none).not.toHaveProperty('probability');
  });

  it('is unverifiable for a kind it has no check for, or a declared value of the wrong type', () => {
    expect(read(claim('Deployed to staging', 'deployed', 'staging'))).toMatchObject({
      verdict: 'unverifiable',
      reason: 'no_comparable_record_field',
    });
    expect(read(claim('The typecheck job passes', 'check_succeeded', 'yes'))).toMatchObject({
      reason: 'no_comparable_record_field',
    });
  });

  it('is unverifiable with the source when the section it needs was not read', () => {
    const ci = caseEvidence('ci-matrix');
    expect(read(claim('The macOS tests pass', 'test_passed', true), ci)).toMatchObject({
      verdict: 'unverifiable',
      reason: 'source_unreadable:artifact',
    });
    const { items: _, ...withoutItems } = storage;
    expect(read(claim('Fixes #41', 'reference_in_timeline', '#41'), withoutItems)).toMatchObject({
      reason: 'evidence_field_unpopulated:items.timeline',
    });
  });

  it('says file_list_truncated when the file list is incomplete and the file is not among the candidates', () => {
    const files = storage.files;
    if (files?.status !== 'ok') throw new Error('fixture');
    const truncated = { ...storage, files: { ...files, complete: false } };
    for (const declared of ['app/wizard.rb', 'src/wizard.ts']) {
      expect(read(claim('Rewrote the wizard', 'file_changed', declared), truncated)).toMatchObject({
        verdict: 'unverifiable',
        reason: 'file_list_truncated',
      });
    }
  });

  it('refuses a recorded candidate the evidence does not hold', () => {
    const c = read(claim('The typecheck job passes', 'check_succeeded', true));
    const forged = {
      ...c,
      candidates: [{ type: 'check_run' as const, id: '999', score: null, matchedField: 'name' }],
    };
    expect(checkReaderClaim(forged, storage, REPO)).toEqual({
      observed: null,
      verdict: 'unverifiable',
      reason: 'candidate_not_in_evidence',
    });
  });
});

describe('candidates filled to k', () => {
  // A reader claim's candidates are filled to k by default. A filled candidate (below the floor) is
  // a place to look and never evidence: the check reads only identifier matches and candidates at or
  // above the recorded floor, so filling changes no verdict. For the identity kinds a pass also
  // needs the declared item itself, and an item the claim names is an identifier match, never a fill.
  const unfilledAndFilled = (text: string, kind: string, declaredValue: boolean | string) => {
    const type = READER_CLAIM_KINDS.get(kind);
    const opts = { repository: REPO, ...(type === undefined ? {} : { types: [type] }) };
    const query = { text, declaredValue };
    return [
      retrieve(query, recordItems(storage), opts),
      retrieve(query, recordItems(storage), { ...opts, limit: READER_CLAIM_K, fill: FILL_TO_K }),
    ];
  };

  it('fills a reader claim to k by default, the unfilled list first', () => {
    const recorded = read(claim('Updated the retry module', 'file_changed', 'src/storage/x.ts'));
    const [unfilled, filled] = unfilledAndFilled(
      'Updated the retry module',
      'file_changed',
      'src/storage/x.ts',
    );
    expect(unfilled?.length).toBeGreaterThan(0);
    expect(unfilled?.length).toBeLessThan(4);
    // Four files in the record, fewer than k: every one is a candidate, the unfilled list first.
    expect(recorded.candidates).toHaveLength(4);
    expect(recorded.candidates).toEqual(filled);
    expect(recorded.candidates.slice(0, unfilled?.length)).toEqual(unfilled);
    expect(recorded.retrieval).toEqual({ arm: 'A-fill', floor: BM25_FLOOR, k: READER_CLAIM_K });
  });

  it('keeps every candidate at or above the floor when more than k reach it', () => {
    const files = storage.files;
    if (files?.status !== 'ok') throw new Error('fixture');
    const template = files.entries[0];
    if (template === undefined) throw new Error('fixture');
    const paths = Array.from({ length: READER_CLAIM_K + 2 }, (_, i) => `src/part${i}.ts`);
    const many = {
      ...storage,
      files: { ...files, entries: paths.map((path) => ({ ...template, path })) },
    };
    const last = paths[paths.length - 1] as string;
    const c = read(claim(`Changed ${paths.join(', ')}.`, 'file_changed', last), many);
    expect(c.candidates.map((x) => x.id)).toEqual(paths);
    expect(c).toMatchObject({ verdict: 'pass', observed: last });
  });

  const cases: [string, string, string][] = [
    ['Rewrote the onboarding wizard', 'file_changed', 'app/wizard.rb'],
    ['Landed the onboarding wizard commit', 'commit_present', 'abc1234'],
    ['Closes the onboarding wizard issue', 'reference_in_timeline', '#99'],
  ];
  for (const [text, kind, declaredValue] of cases) {
    it(`never makes ${kind} pass without the declared item`, () => {
      const [unfilled, filled] = unfilledAndFilled(text, kind, declaredValue);
      expect(unfilled).toEqual([]);
      expect(filled?.length).toBeGreaterThan(0);
      expect(filled?.every((c) => c.score !== null && c.score < BM25_FLOOR)).toBe(true);
      const recorded = read(claim(text, kind, declaredValue));
      expect(recorded.candidates).toEqual(filled);
      expect(recorded).toMatchObject({
        observed: null,
        verdict: 'unverifiable',
        reason: 'no_matching_record_item',
      });
      // Even read as evidence (a floor of 0), a fill cannot make an identity kind pass.
      const asEvidence = { kind, declaredValue, candidates: filled ?? [], retrieval: { floor: 0 } };
      expect(checkReaderClaim(asEvidence, storage, REPO)).toEqual({
        observed: null,
        verdict: 'unverifiable',
        reason: 'declared_item_not_among_candidates',
      });
    });
  }

  // check_succeeded and test_passed aggregate over their candidates, so a fill read as evidence
  // would decide them. Recorded, it is skipped, and the claim stays unverifiable.
  for (const [kind, declaredValue] of [
    ['check_succeeded', true],
    ['check_succeeded', false],
    ['test_passed', true],
    ['test_passed', false],
  ] as const) {
    it(`never lets a filled candidate decide ${kind} (${declaredValue})`, () => {
      const text = 'Rewrote the onboarding wizard';
      const [unfilled, filled] = unfilledAndFilled(text, kind, declaredValue);
      expect(unfilled).toEqual([]);
      const recorded = read(claim(text, kind, declaredValue));
      expect(recorded.candidates.length).toBeGreaterThan(0);
      expect(recorded.candidates).toEqual(filled);
      expect(recorded).toMatchObject({
        observed: null,
        verdict: 'unverifiable',
        reason: 'no_matching_record_item',
      });
      const asEvidence = { ...recorded, retrieval: { floor: 0 } };
      expect(checkReaderClaim(asEvidence, storage, REPO).verdict).not.toBe('unverifiable');
    });
  }

  it('finds a declared item the record holds as an identifier match, not a fill', () => {
    const candidates = retrieve(
      { text: 'Rewrote the onboarding wizard', declaredValue: 'src/storage/retry.ts' },
      recordItems(storage),
      { repository: REPO, types: ['file'], limit: 5, fill: FILL_TO_K },
    );
    expect(candidates[0]).toMatchObject({ id: 'src/storage/retry.ts', score: null });
  });
});

describe('a record with reader claims (DRAFT 0.2.0)', () => {
  const report = Buffer.from(
    'The agent says it renamed the blob module and that typecheck passes.\n',
  );
  const build = (readerClaims?: ReaderClaimInput[]): DunstanRecord =>
    buildRecord({
      checker: { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: '0'.repeat(64) } },
      report: { sha256: '1'.repeat(64), source: { kind: 'stdin', locator: '-' } },
      block: recordBlock(extractHandbackBlock(report.toString('utf8'))),
      repository: REPO,
      evidence: storage,
      rerun: { offline: 'dunstan verify r.json', online: 'dunstan rerun r.json' },
      ...(readerClaims === undefined ? {} : { readerClaims }),
    });
  const claims = [
    claim('Renamed blobs.ts to blob-store.ts', 'file_changed', 'src/storage/blob-store.ts', 0.9),
    claim('The typecheck job passes', 'check_succeeded', true, 0.8),
    claim('Rewrote the onboarding wizard', 'file_changed', 'app/wizard.rb'),
  ];

  it('is written to the draft, validates against its schema, and verifies offline', () => {
    const record = JSON.parse(JSON.stringify(build(claims))) as DunstanRecord;
    expect(record.predicateType).toBe(DRAFT_PREDICATE_TYPE);
    expect(record.predicate.spec).toBe(DRAFT_SPEC_VERSION);
    expect(record.predicate.readerClaims?.map((c) => c.verdict)).toEqual([
      'pass',
      'fail',
      'unverifiable',
    ]);
    // The unverifiable claim carries its fill: candidates below the floor, recorded.
    expect(record.predicate.readerClaims?.[2]?.candidates.length).toBeGreaterThan(0);
    expect(validateDraftRecord(record)).toEqual([]);
    expect(validateRecord(record)).not.toEqual([]);
    guard.forbid = true;
    try {
      // The guard is live: building a reader claim would retrieve, and throws.
      expect(() => read(claims[0] as ReaderClaimInput)).toThrow('retrieval ran');
      expect(verifyRecord(record).problems).toEqual([]);
    } finally {
      guard.forbid = false;
    }
  });

  it('verifies with `dunstan verify`, and names a tampered reader claim', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dunstan-draft-'));
    try {
      const path = join(dir, 'r.json');
      const record = build(claims);
      writeFileSync(path, serializeRecord(record));
      let out = '';
      const io = {
        out: (t: string) => {
          out += t;
        },
        err: (t: string) => {
          out += t;
        },
        env: {},
        artifact: import.meta.url,
        readStdin: () => new Uint8Array(),
      };
      expect(await main(['verify', path], io)).toBe(0);
      expect(out).toContain('verified:');
      const tampered = JSON.parse(serializeRecord(record)) as DunstanRecord;
      const last = tampered.predicate.readerClaims?.[2];
      if (last === undefined) throw new Error('fixture');
      last.verdict = 'pass';
      delete last.reason;
      writeFileSync(path, JSON.stringify(tampered));
      out = '';
      expect(await main(['verify', path], io)).toBe(1);
      expect(out).toContain('/predicate/readerClaims/2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves the 0.1 verdict, claims and digests exactly as without reader claims', () => {
    const plain = build();
    const draft = build(claims);
    expect(plain.predicateType).toBe(PREDICATE_TYPE);
    expect(plain.predicate).not.toHaveProperty('readerClaims');
    expect(draft.predicate.verdict).toBe(plain.predicate.verdict);
    expect(draft.predicate.claims).toEqual(plain.predicate.claims);
    expect(draft.predicate.digests.claims).toBe(plain.predicate.digests.claims);
    expect(draft.predicate.digests.evidence).toBe(plain.predicate.digests.evidence);
  });

  it('names the reader claim whose recorded verdict does not recompute', () => {
    const record = JSON.parse(JSON.stringify(build(claims))) as DunstanRecord;
    const typecheck = record.predicate.readerClaims?.[1];
    if (typecheck === undefined) throw new Error('fixture');
    typecheck.verdict = 'pass';
    delete typecheck.reason;
    const members = verifyRecord(record).problems.map((p) => p.member);
    expect(members).toContain('/predicate/readerClaims/1');
    expect(members).toContain('/predicate/digests/readerClaims');
  });

  it('recomputes from the recorded candidates, not from a fresh retrieval', () => {
    // Drop the typecheck run from the recorded candidates: the check now sees no matching item,
    // although a fresh retrieval would find it again.
    const record = JSON.parse(JSON.stringify(build(claims))) as DunstanRecord;
    const typecheck = record.predicate.readerClaims?.[1];
    if (typecheck === undefined) throw new Error('fixture');
    typecheck.candidates = [];
    expect(checkReaderClaim(typecheck, storage, REPO)).toMatchObject({
      reason: 'no_matching_record_item',
    });
    expect(verifyRecord(record).problems.map((p) => p.member)).toContain(
      '/predicate/readerClaims/1',
    );
  });

  it('validates a claim recorded unfilled, as before filling was the default, and refuses a fill without k', () => {
    const record = JSON.parse(JSON.stringify(build(claims))) as DunstanRecord;
    const first = record.predicate.readerClaims?.[0];
    const last = record.predicate.readerClaims?.[2];
    if (first === undefined || last === undefined) throw new Error('fixture');
    first.retrieval = { arm: 'A', floor: BM25_FLOOR };
    expect(validateDraftRecord(record)).toEqual([]);
    last.retrieval = { arm: 'A-fill', floor: BM25_FLOOR } as unknown as typeof last.retrieval;
    const pointers = validateDraftRecord(record).map((e) => e.pointer);
    expect(pointers).toContain('/predicate/readerClaims/2/retrieval');
  });

  it('refuses a probability outside [0, 1] and a pass that carries a reason', () => {
    const record = JSON.parse(JSON.stringify(build(claims))) as DunstanRecord;
    const first = record.predicate.readerClaims?.[0];
    if (first === undefined) throw new Error('fixture');
    first.probability = 1.5;
    first.reason = 'no_matching_record_item';
    const pointers = validateDraftRecord(record).map((e) => e.pointer);
    expect(pointers).toContain('/predicate/readerClaims/0/probability');
    expect(pointers).toContain('/predicate/readerClaims/0');
  });
});

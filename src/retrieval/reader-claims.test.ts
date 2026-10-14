import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { caseEvidence, REPO } from '../__tests__/retrieval-fixtures.js';
import { checkReferences, closesBlock } from '../check/checks.js';
import type { CheckRun, CloseEvent, Evidence } from '../check/types.js';
import { main } from '../cli/main.js';
import { buildRecord, type DunstanRecord, recordBlock, serializeRecord } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';
import { DRAFT_PREDICATE_TYPE, DRAFT_SPEC_VERSION, PREDICATE_TYPE } from '../spec/constants.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { validateDraftRecord, validateRecord } from '../spec/schema.js';
import { CHECK_RUN_EVENTS, unheldSuffixJobs, workflowJobs } from './identifiers.js';
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

  it('combines only the identifier matches when there is one: a lexical candidate never decides', () => {
    // 101 (lint) succeeded, 103 (typecheck) failed.
    const run = (id: string, score: number | null) => ({
      type: 'check_run' as const,
      id,
      score,
      matchedField: 'name',
    });
    const check = (candidates: ReturnType<typeof run>[], declaredValue: boolean) =>
      checkReaderClaim(
        {
          text: 'The lint job passes',
          kind: 'check_succeeded',
          declaredValue,
          candidates,
          retrieval: { floor: BM25_FLOOR },
        },
        storage,
        REPO,
      );
    // Named exactly, lint passes, though the failed typecheck run is a lexical match well above the
    // floor and is recorded.
    expect(check([run('101', null), run('103', 4)], true)).toEqual({
      observed: true,
      verdict: 'pass',
    });
    // With no identifier match, every candidate at or above the floor is combined, as before.
    expect(check([run('101', 4), run('103', 3)], true)).toEqual({
      observed: false,
      verdict: 'fail',
      reason: 'all_succeeded_mismatch',
    });
    // Two identifier matches are both combined.
    expect(check([run('101', null), run('103', null)], true)).toMatchObject({ verdict: 'fail' });
  });

  describe('ties that disagree are ambiguous', () => {
    const candidate = (type: 'check_run' | 'test') => (id: string, score: number | null) => ({
      type,
      id,
      score,
      matchedField: 'name',
    });
    const run = candidate('check_run');
    const test = candidate('test');
    const check = (
      kind: string,
      candidates: ReturnType<typeof run>[],
      declaredValue: boolean,
      evidence = storage,
    ) =>
      checkReaderClaim(
        { text: 'It passes', kind, declaredValue, candidates, retrieval: { floor: BM25_FLOOR } },
        evidence,
        REPO,
      );
    const ambiguous = { observed: null, verdict: 'unverifiable', reason: 'ambiguous_candidates' };
    const tests = storage.items?.tests;
    const checkRuns = storage.checkRuns;
    if (tests?.status !== 'ok' || checkRuns?.status !== 'ok') throw new Error('fixture');

    it('reads neither of two tied runs that disagree, whatever the claim declares', () => {
      // 101 (lint) succeeded and 103 (typecheck) failed. Combined, the failed run would decide both
      // claims: "fails" would pass on a run the claim may not be about.
      for (const declared of [true, false]) {
        expect(check('check_succeeded', [run('101', 4), run('103', 4)], declared)).toEqual(
          ambiguous,
        );
      }
      // A third tied run that agrees with one of them does not settle it.
      expect(check('check_succeeded', [run('101', 4), run('102', 4), run('103', 4)], true)).toEqual(
        ambiguous,
      );
    });

    it('reads neither of two tied test cases that disagree', () => {
      const failed = 'storage.blobStore.uploads a blob';
      const passed = 'storage.retry.gives up after five attempts';
      for (const declared of [true, false]) {
        expect(check('test_passed', [test(failed, 2), test(passed, 2)], declared)).toEqual(
          ambiguous,
        );
      }
    });

    it('combines tied candidates that agree, as before', () => {
      expect(check('check_succeeded', [run('101', 4), run('102', 4)], true)).toEqual({
        observed: true,
        verdict: 'pass',
      });
      const passed = [
        'storage.retry.gives up after five attempts',
        'storage.retry.waits longer after each failure',
      ];
      expect(
        check(
          'test_passed',
          passed.map((id) => test(id, 2)),
          false,
        ),
      ).toEqual({
        observed: true,
        verdict: 'fail',
        reason: 'test_outcome_mismatch',
      });
    });

    it('counts a run that did not complete, or a skipped test, as an outcome of its own', () => {
      const pending = {
        ...storage,
        checkRuns: {
          ...checkRuns,
          runs: checkRuns.runs.map((r) =>
            r.id === 102 ? { ...r, status: 'in_progress', conclusion: null } : r,
          ),
        },
      };
      // Succeeded beside not completed, and failed beside not completed.
      expect(check('check_succeeded', [run('101', 4), run('102', 4)], true, pending)).toEqual(
        ambiguous,
      );
      expect(check('check_succeeded', [run('103', 4), run('102', 4)], false, pending)).toEqual(
        ambiguous,
      );
      const skipped = {
        ...storage,
        items: {
          ...storage.items,
          tests: {
            ...tests,
            entries: tests.entries.map((t) =>
              t.name === 'waits longer after each failure'
                ? { ...t, outcome: 'skipped' as const }
                : t,
            ),
          },
        },
      } as typeof storage;
      const ids = [
        'storage.retry.gives up after five attempts',
        'storage.retry.waits longer after each failure',
      ];
      expect(
        check(
          'test_passed',
          ids.map((id) => test(id, 2)),
          true,
          skipped,
        ),
      ).toEqual(ambiguous);
    });

    it('compares rounded scores exactly: a near-tie is not a tie, and a tie below the top is not read as one', () => {
      // Equal once rounded to SCORE_DECIMALS.
      expect(check('check_succeeded', [run('101', 4.0000001), run('103', 4)], true)).toEqual(
        ambiguous,
      );
      // No margin: one millionth apart, both are combined and the failed run decides.
      const combined = { observed: false, verdict: 'fail', reason: 'all_succeeded_mismatch' };
      expect(check('check_succeeded', [run('101', 4), run('103', 3.999999)], true)).toEqual(
        combined,
      );
      // Only the top score counts: 101 and 103 tie below 102.
      expect(check('check_succeeded', [run('102', 5), run('101', 4), run('103', 4)], true)).toEqual(
        combined,
      );
    });

    it('leaves identifier matches and filled candidates as they were', () => {
      // Two identifier matches that disagree are combined: the claim names both.
      expect(check('check_succeeded', [run('101', null), run('103', null)], true)).toMatchObject({
        verdict: 'fail',
      });
      // Tied below the floor, nothing is combined.
      expect(check('check_succeeded', [run('101', 0.5), run('103', 0.5)], true)).toMatchObject({
        reason: 'no_matching_record_item',
      });
    });
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

describe('a job named with its workflow (`<workflow> / <job>`)', () => {
  const CHECKS = '.github/workflows/checks.yml';
  const NIGHTLY = '.github/workflows/nightly.yml';
  const legacy = (id: number, name: string, conclusion: string): CheckRun => ({
    id,
    name,
    status: 'completed',
    conclusion,
  });
  const ofWorkflow = (
    id: number,
    name: string,
    conclusion: string,
    workflowPath: string,
    workflowRunId: number,
  ): CheckRun => ({
    ...legacy(id, name, conclusion),
    checkSuiteId: workflowRunId - 8000,
    appSlug: 'github-actions',
    workflowPath,
    workflowRunId,
    runAttempt: 1,
  });
  const withRuns = (runs: CheckRun[]): Evidence => {
    if (storage.checkRuns?.status !== 'ok') throw new Error('fixture');
    return { ...storage, checkRuns: { ...storage.checkRuns, runs } };
  };
  const check = (text: string, evidence: Evidence, declared = true) =>
    read(claim(text, 'check_succeeded', declared), evidence);
  const cannot = { observed: null, verdict: 'unverifiable', reason: 'workflow_not_in_record' };
  const pass = { observed: true, verdict: 'pass' };
  const fail = { observed: false, verdict: 'fail', reason: 'all_succeeded_mismatch' };

  const unrecorded = withRuns([legacy(201, 'test', 'success'), legacy(205, 'test', 'failure')]);
  const recorded = withRuns([
    ofWorkflow(201, 'test', 'success', CHECKS, 9001),
    ofWorkflow(205, 'test', 'failure', NIGHTLY, 9002),
  ]);

  it('reads the form only: a workflow, a space, a slash, a space and a job named whole', () => {
    const names = ['test', 'test (ubuntu-latest)', 'build', 'build-docs'];
    expect(workflowJobs('Checks / test passes.', names)).toEqual([
      { workflow: 'Checks', job: 'test' },
    ]);
    expect(workflowJobs(`${CHECKS} / test (ubuntu-latest) passes`, names)).toEqual([
      { workflow: CHECKS, job: 'test (ubuntu-latest)' },
    ]);
    expect(workflowJobs('CI / build-docs passes', names)).toEqual([
      { workflow: 'CI', job: 'build-docs' },
    ]);
    expect(workflowJobs('CI / a / test and Nightly / build pass', names)).toEqual([
      { workflow: 'a', job: 'test' },
      { workflow: 'Nightly', job: 'build' },
    ]);
    for (const text of ['CI/test passes', 'CI / builder passes', 'the test job in CI passes']) {
      expect(workflowJobs(text, names), text).toEqual([]);
    }
  });

  it('reads `<workflow> / <job> (<event>)` for the four events only, and a leg first', () => {
    const names = ['test', 'test (ubuntu-latest)', 'test (push)', 'build'];
    for (const event of CHECK_RUN_EVENTS.filter((e) => e !== 'push')) {
      expect(workflowJobs(`CI / build (${event}) passes`, names), event).toEqual([
        { workflow: 'CI', job: 'build' },
      ]);
    }
    // `test (push)` is a run name of the record, so it names that run, as a leg.
    expect(workflowJobs('CI / test (push) passes', names)).toEqual([
      { workflow: 'CI', job: 'test (push)' },
    ]);
    // A leg with its event, as GitHub shows a matrix job.
    expect(workflowJobs('CI / test (ubuntu-latest) (pull_request) passes', names)).toEqual([
      { workflow: 'CI', job: 'test (ubuntu-latest)' },
    ]);
    for (const text of [
      'CI / build (schedule) passes',
      'CI / build (workflow_dispatch) passes',
      'CI / build (Pull_request) passes',
      'CI / build (pull_request passes',
      'CI / build (pull) passes',
      'CI / test (macos-latest) passes',
    ]) {
      expect(workflowJobs(text, names), text).toEqual([]);
    }
  });

  it('reads a job named with its workflow and event as one named with its workflow', () => {
    expect(check(`${CHECKS} / test (pull_request) passes.`, recorded)).toMatchObject(pass);
    expect(check(`${NIGHTLY} / test (push) passes.`, recorded)).toMatchObject(fail);
    expect(check('Checks / test (pull_request) fails.', recorded, false)).toMatchObject(cannot);
    expect(check('CI / test (merge_group) passes.', unrecorded)).toMatchObject(cannot);
    // With no workflow, the event is read as today: the bare job is not named.
    expect(check('test (pull_request) passes.', recorded)).toMatchObject({
      verdict: 'unverifiable',
    });
  });

  it('is unverifiable where two runs share the job name and one carries no workflow', () => {
    expect(check('Checks / test passes.', unrecorded)).toMatchObject(cannot);
    expect(check('Checks / test fails.', unrecorded, false)).toMatchObject(cannot);
    // A re-run in one workflow looks the same, so naming its workflow does not settle it either.
    expect(check('CI / test passes.', unrecorded)).toMatchObject(cannot);
    // A run of no workflow beside a workflow's run of the same name.
    const mixed = withRuns([
      ofWorkflow(201, 'test', 'success', CHECKS, 9001),
      { ...legacy(207, 'test', 'failure'), checkSuiteId: 99, appSlug: 'other-app' },
    ]);
    expect(check(`${CHECKS} / test passes.`, mixed)).toMatchObject(cannot);
  });

  it('leaves a claim that names no workflow as it was', () => {
    expect(check('The test job passes.', unrecorded)).toMatchObject(fail);
    expect(check(`The test job in ${CHECKS} passes.`, recorded)).toMatchObject(fail);
    // A job held by one run with no workflow is read as before, workflow named or not.
    const alone = withRuns([legacy(231, 'deploy', 'success')]);
    expect(check('CI / deploy passes.', alone)).toMatchObject(pass);
  });

  it("reads the named workflow's runs only, matched by path, the latest of a re-run", () => {
    expect(check(`${CHECKS} / test passes.`, recorded)).toMatchObject(pass);
    expect(check(`${NIGHTLY} / test passes.`, recorded)).toMatchObject(fail);
    // The record holds the path, never the workflow's display name, and no file name is guessed.
    expect(check('Checks / test passes.', recorded)).toMatchObject(cannot);
    expect(check('checks.yml / test passes.', recorded)).toMatchObject(cannot);
    // checks.yml ran twice; its later workflow run (9003) succeeded.
    const rerun = withRuns([
      ofWorkflow(201, 'test', 'failure', CHECKS, 9001),
      ofWorkflow(205, 'test', 'failure', NIGHTLY, 9002),
      ofWorkflow(206, 'test', 'success', CHECKS, 9003),
    ]);
    expect(check(`${CHECKS} / test passes.`, rerun)).toMatchObject(pass);
  });

  it('restricts each job named with a workflow, and no other', () => {
    const both = withRuns([
      ofWorkflow(201, 'test', 'success', CHECKS, 9001),
      ofWorkflow(205, 'test', 'failure', NIGHTLY, 9002),
      ofWorkflow(211, 'lint', 'success', CHECKS, 9001),
      ofWorkflow(215, 'lint', 'failure', NIGHTLY, 9002),
    ]);
    expect(check(`${CHECKS} / test and ${CHECKS} / lint pass.`, both)).toMatchObject(pass);
    // lint is named with no workflow, so both workflows' lint runs are read, as before.
    expect(check(`${CHECKS} / test and lint pass.`, both)).toMatchObject(fail);
  });

  it("is declared_item_not_among_candidates when the workflow's run is counted and not combined", () => {
    const candidates = [
      { type: 'check_run' as const, id: '205', score: null, matchedField: 'name' },
    ];
    expect(
      checkReaderClaim(
        {
          text: `${CHECKS} / test passes.`,
          kind: 'check_succeeded',
          declaredValue: true,
          candidates,
          retrieval: { floor: BM25_FLOOR },
        },
        recorded,
        REPO,
      ),
    ).toEqual({
      observed: null,
      verdict: 'unverifiable',
      reason: 'declared_item_not_among_candidates',
    });
  });

  // Spec 0.1.5: a run of a workflow carries that workflow's name beside its path.
  const named = (run: CheckRun, workflowName: string): CheckRun => ({ ...run, workflowName });
  const byName = withRuns([
    named(ofWorkflow(201, 'test', 'success', CHECKS, 9001), 'Checks'),
    named(ofWorkflow(205, 'test', 'failure', NIGHTLY, 9002), 'Nightly'),
  ]);
  const ambiguous = { observed: null, verdict: 'unverifiable', reason: 'workflow_name_ambiguous' };
  const unheld = { observed: null, verdict: 'unverifiable', reason: 'no_matching_record_item' };

  it('reads a workflow the record names, the longest held whole before the slash, or else the word there', () => {
    const names = ['test', 'build'];
    const workflows = ['CI', 'Continuous Integration', 'Integration', CHECKS];
    expect(workflowJobs('Continuous Integration / build passes', names, workflows)).toEqual([
      { workflow: 'Continuous Integration', job: 'build' },
    ]);
    expect(workflowJobs('(CI / test) passes', names, workflows)).toEqual([
      { workflow: 'CI', job: 'test' },
    ]);
    expect(workflowJobs(`\`${CHECKS} / test\` passes`, names, workflows)).toEqual([
      { workflow: CHECKS, job: 'test' },
    ]);
    // Not whole: a name continued by a path character before it is not that name.
    for (const text of ['MyCI / test passes', 'x.CI / test passes', 'pre-CI / test passes']) {
      expect(workflowJobs(text, names, workflows)[0]?.workflow, text).toBe(text.split(' ')[0]);
    }
    expect(workflowJobs('Continuous Integration / build passes', names)).toEqual([
      { workflow: 'Integration', job: 'build' },
    ]);
  });

  it('reads a workflow by its name or its path, exactly, with or without its event', () => {
    expect(check('Checks / test passes.', byName)).toMatchObject(pass);
    expect(check('Nightly / test passes.', byName)).toMatchObject(fail);
    expect(check('Nightly / test (push) passes.', byName)).toMatchObject(fail);
    expect(check(`${CHECKS} / test passes.`, byName)).toMatchObject(pass);
    // Case is not folded, and a file name is not guessed.
    for (const text of ['checks / test passes.', 'checks.yml / test passes.']) {
      expect(check(text, byName), text).toMatchObject(cannot);
    }
    const spaced = withRuns([
      named(
        ofWorkflow(210, 'build', 'success', '.github/workflows/ci.yml', 9001),
        'Continuous Integration',
      ),
      named(ofWorkflow(214, 'build', 'failure', '.github/workflows/release.yml', 9002), 'Release'),
    ]);
    expect(check('Continuous Integration / build passes.', spaced)).toMatchObject(pass);
    expect(check('Release / build passes.', spaced)).toMatchObject(fail);
  });

  it('is workflow_name_ambiguous where the name is held by two workflow paths', () => {
    const twoCi = withRuns([
      named(ofWorkflow(201, 'test', 'success', '.github/workflows/ci.yml', 9001), 'CI'),
      named(ofWorkflow(205, 'test', 'failure', '.github/workflows/ci-nightly.yml', 9002), 'CI'),
    ]);
    expect(check('CI / test passes.', twoCi)).toMatchObject(ambiguous);
    expect(check('CI / test fails.', twoCi, false)).toMatchObject(ambiguous);
    // A path names one of them.
    expect(check('.github/workflows/ci.yml / test passes.', twoCi)).toMatchObject(pass);
    // One workflow of that name run twice on the head is one path, so one workflow.
    const rerun = withRuns([
      named(ofWorkflow(201, 'test', 'failure', '.github/workflows/ci.yml', 9001), 'CI'),
      named(ofWorkflow(206, 'test', 'success', '.github/workflows/ci.yml', 9003), 'CI'),
    ]);
    expect(check('CI / test passes.', rerun)).toMatchObject(pass);
  });

  it('cannot place a workflow that is no path where a run of the job has a path and no name', () => {
    const half = withRuns([
      named(ofWorkflow(201, 'test', 'success', CHECKS, 9001), 'Checks'),
      ofWorkflow(205, 'test', 'failure', NIGHTLY, 9002),
    ]);
    expect(check('Checks / test passes.', half)).toMatchObject(cannot);
    // A path is still placed.
    expect(check(`${CHECKS} / test passes.`, half)).toMatchObject(pass);
    // A record written before 0.1.5 holds no names.
    expect(check('Checks / test passes.', recorded)).toMatchObject(cannot);
  });

  it('names no run where a job named with its workflow is followed by a parenthesis the record does not hold', () => {
    const names = ['test', 'test (ubuntu-latest)', 'build'];
    for (const text of [
      'CI / test (workflow_dispatch) passes',
      'CI / build (schedule) passes',
      'CI / test (macos-latest) passes',
      'CI / test () passes',
    ]) {
      expect(unheldSuffixJobs(text, names), text).toHaveLength(1);
    }
    for (const text of [
      'CI / test (ubuntu-latest) passes',
      'CI / test (pull_request) passes',
      'CI / test (ubuntu-latest) (merge_group) passes',
      'CI / test (pull_request passes',
      'CI / test passes (on push)',
      'test (workflow_dispatch) passes',
      'CI / deploy (schedule) passes',
    ]) {
      expect(unheldSuffixJobs(text, names), text).toEqual([]);
    }
    expect(check(`${CHECKS} / test (workflow_dispatch) fails.`, recorded, false)).toMatchObject(
      unheld,
    );
    expect(
      check(`The test job, ${CHECKS} / test (workflow_dispatch), fails.`, recorded, false),
    ).toMatchObject(unheld);
    expect(check('Checks / test (schedule) passes.', byName)).toMatchObject(unheld);
    // The four events are read as before, and a leg that is a run names that run.
    expect(check('Checks / test (pull_request) passes.', byName)).toMatchObject(pass);
    const leg = withRuns([
      named(ofWorkflow(240, 'test (ubuntu-latest)', 'success', CHECKS, 9001), 'Checks'),
      named(ofWorkflow(241, 'test', 'failure', CHECKS, 9001), 'Checks'),
    ]);
    expect(check('Checks / test (ubuntu-latest) passes.', leg)).toMatchObject(pass);
  });
});

// storage-retry's timeline cross-references #41. Merged into the default branch, the closing
// references do not list #41, and #41 was closed by the event given.
const merged = (events: CloseEvent[]): Evidence => ({
  ...storage,
  pullRequest: {
    ...storage.pullRequest,
    state: 'closed',
    merged: true,
    mergedAt: '2026-10-01T12:00:00Z',
    mergeSha: 'feedface00000000000000000000000000000001',
  },
  closingReferences: { status: 'ok', issues: [] },
  references: [{ kind: 'issue', ref: `${REPO}#41`, status: 'ok', exists: true }],
  closeEvents: {
    pullRequest: { status: 'ok', baseRef: 'main', defaultBranch: 'main', commits: [] },
    targets: [{ ref: `${REPO}#41`, status: 'ok', type: 'issue', state: 'closed', events }],
  },
});
const byOther = merged([{ at: '2026-10-02T09:00:00Z', closer: null }]);
const byThis = merged([
  { at: '2026-10-01T12:00:05Z', closer: { kind: 'pull_request', ref: `${REPO}#7` } },
]);
const fixes = claim('Fixes #41', 'reference_closes', '#41');

describe('reference_closes: the 7.4 closes check decides it, never a candidate', () => {
  const notClosing = { verdict: 'fail', reason: 'not_closing' };

  it('fails a closing claim the timeline only mentions, where reference_in_timeline passes', () => {
    const c = read(fixes, byOther);
    expect(c.candidates[0]).toMatchObject({ type: 'timeline_event', id: 'evt-1', score: null });
    expect(c).toMatchObject(notClosing);
    expect(read(claim('Fixes #41', 'reference_in_timeline', '#41'), byOther)).toMatchObject({
      verdict: 'pass',
    });
    expect(read(fixes, byThis)).toMatchObject({
      verdict: 'pass',
      observed: { closing: [], closedBy: { closer: { kind: 'pull_request', ref: `${REPO}#7` } } },
    });
  });

  it("gives the gate's own row for a block that declares the closes", () => {
    for (const evidence of [byOther, byThis, storage]) {
      const row = checkReferences(
        closesBlock('#41', evidence.pullRequest.headSha),
        evidence,
        REPO,
      )[0];
      const c = read(fixes, evidence);
      expect(c.verdict).toBe(row?.verdict);
      expect(c.reason).toBe(row?.reason);
      expect(c.observed).toEqual(row?.observed ?? null);
    }
    // storage read no closing references: unverifiable with the gate's reason, never pass.
    expect(read(fixes)).toMatchObject({
      verdict: 'unverifiable',
      reason: 'evidence_field_unpopulated:closingReferences',
    });
  });

  it('reads no candidate: none, a forged one or an unread timeline changes nothing', () => {
    const recorded = read(fixes, byOther);
    const forged = [
      { type: 'timeline_event' as const, id: 'evt-9', score: null, matchedField: 'ref' },
    ];
    for (const candidates of [[], forged]) {
      expect(checkReaderClaim({ ...recorded, candidates }, byOther, REPO)).toMatchObject(
        notClosing,
      );
      expect(checkReaderClaim({ ...recorded, candidates }, byThis, REPO)).toMatchObject({
        verdict: 'pass',
      });
    }
    const { items: _, ...noTimeline } = byOther;
    expect(checkReaderClaim(recorded, noTimeline, REPO)).toMatchObject(notClosing);
  });

  it('is unverifiable with no_comparable_record_field for a value that is not an issue reference', () => {
    for (const declaredValue of ['41', 'example-org/example-repo', '#0', true]) {
      expect(read(claim('Fixes it', 'reference_closes', declaredValue), byThis)).toMatchObject({
        verdict: 'unverifiable',
        reason: 'no_comparable_record_field',
      });
    }
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
      const asEvidence = {
        text,
        kind,
        declaredValue,
        candidates: filled ?? [],
        retrieval: { floor: 0 },
      };
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
      // The fills all score 0 and disagree, so read as they are they tie and are ambiguous. With
      // the first lifted out of the tie, they would decide the claim.
      const [first, ...rest] = recorded.candidates;
      if (first === undefined) throw new Error('fixture');
      const asEvidence = {
        ...recorded,
        candidates: [{ ...first, score: 0.5 }, ...rest],
        retrieval: { floor: 0 },
      };
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
  const build = (readerClaims?: ReaderClaimInput[], evidence = storage): DunstanRecord =>
    buildRecord({
      checker: { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: '0'.repeat(64) } },
      report: { sha256: '1'.repeat(64), source: { kind: 'stdin', locator: '-' } },
      block: recordBlock(extractHandbackBlock(report.toString('utf8'))),
      repository: REPO,
      evidence,
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

  it('accepts ambiguous_candidates as an unverifiable reason, and refuses an unknown one', () => {
    const record = JSON.parse(JSON.stringify(build(claims))) as DunstanRecord;
    const last = record.predicate.readerClaims?.[2];
    if (last === undefined) throw new Error('fixture');
    last.reason = 'ambiguous_candidates';
    expect(validateDraftRecord(record)).toEqual([]);
    last.reason = 'ambiguous';
    const pointers = validateDraftRecord(record).map((e) => e.pointer);
    expect(pointers).toContain('/predicate/readerClaims/2/reason');
  });

  it('validates and verifies offline a claim whose workflow the record cannot place, and reads its text to do so', () => {
    if (storage.checkRuns?.status !== 'ok') throw new Error('fixture');
    const run = (id: number, conclusion: string) => ({
      id,
      name: 'typecheck',
      status: 'completed',
      conclusion,
    });
    const twice = {
      ...storage,
      checkRuns: { ...storage.checkRuns, runs: [run(103, 'success'), run(104, 'failure')] },
    };
    const named = claim('CI / typecheck passes', 'check_succeeded', true);
    const record = JSON.parse(JSON.stringify(build([named], twice))) as DunstanRecord;
    expect(record.predicate.readerClaims?.[0]).toMatchObject({
      verdict: 'unverifiable',
      reason: 'workflow_not_in_record',
    });
    expect(validateDraftRecord(record)).toEqual([]);
    expect(verifyRecord(record).problems).toEqual([]);
    // The same candidates under a text that names no workflow recompute to the latest run's fail.
    const first = record.predicate.readerClaims?.[0];
    if (first === undefined) throw new Error('fixture');
    first.text = 'The typecheck job passes';
    expect(verifyRecord(record).problems.map((p) => p.member)).toContain(
      '/predicate/readerClaims/0',
    );
  });

  it('validates and verifies offline a claim naming a workflow by a name two workflow paths hold', () => {
    if (storage.checkRuns?.status !== 'ok') throw new Error('fixture');
    const run = (id: number, conclusion: string, workflowPath: string, workflowRunId: number) => ({
      id,
      name: 'typecheck',
      status: 'completed',
      conclusion,
      checkSuiteId: workflowRunId - 8000,
      workflowPath,
      workflowName: 'CI',
      workflowRunId,
      runAttempt: 1,
    });
    const twoCi = {
      ...storage,
      checkRuns: {
        ...storage.checkRuns,
        runs: [
          run(103, 'success', '.github/workflows/ci.yml', 9001),
          run(104, 'failure', '.github/workflows/ci-nightly.yml', 9002),
        ],
      },
    };
    const named = claim('CI / typecheck passes', 'check_succeeded', true);
    const record = JSON.parse(JSON.stringify(build([named], twoCi))) as DunstanRecord;
    expect(record.predicate.readerClaims?.[0]).toMatchObject({
      verdict: 'unverifiable',
      reason: 'workflow_name_ambiguous',
    });
    expect(validateDraftRecord(record)).toEqual([]);
    expect(verifyRecord(record).problems).toEqual([]);
  });

  it('validates and verifies offline a closing claim, and accepts each reason the closes check gives', () => {
    for (const evidence of [byOther, byThis, storage]) {
      const record = JSON.parse(JSON.stringify(build([fixes], evidence))) as DunstanRecord;
      expect(validateDraftRecord(record)).toEqual([]);
      expect(verifyRecord(record).problems).toEqual([]);
    }
    const record = JSON.parse(JSON.stringify(build([fixes], byOther))) as DunstanRecord;
    const closes = record.predicate.readerClaims?.[0];
    if (closes === undefined) throw new Error('fixture');
    expect(closes).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
    for (const reason of [
      'not_found',
      'closing_link_unsettled',
      'closing_base_not_default',
      'closing_event_unsettled',
      'evidence_field_unpopulated:closeEvents',
      'source_unreadable:closing_references',
      'source_unreadable:repository',
      'source_unreadable:issue',
      'source_unreadable:pull_request_commits',
    ]) {
      closes.reason = reason;
      expect(validateDraftRecord(record), reason).toEqual([]);
    }
    closes.reason = 'source_unreadable:deployments';
    expect(validateDraftRecord(record).map((e) => e.pointer)).toContain(
      '/predicate/readerClaims/0/reason',
    );
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

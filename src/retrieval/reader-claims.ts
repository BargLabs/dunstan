// Typed claims from a reader (spec/claim-format.md, "DRAFT 0.2.0"). A reader turns a prose report
// into claims; retrieval proposes the record items each is about; the check here decides, from the
// recorded candidates and the evidence alone. Retrieval narrows where to look; it is never evidence.
// The reader's probability is recorded as the reader's output and is read by nothing in this file.
// A claim with no candidate at or above the floor is unverifiable, never pass.

import { countedCheckRuns, qualifyIssue, sameIssue } from '../check/checks.js';
import { absentSection } from '../check/rows.js';
import type {
  CheckRun,
  Evidence,
  FileEntry,
  ItemsUnread,
  Unread,
  Verdict,
} from '../check/types.js';
import type { JsonValue } from '../spec/json.js';
import { recordItems, testId } from './items.js';
import { type ARM_A, ARM_A_FILL, BM25_FLOOR, FILL_TO_K, retrieve } from './retrieve.js';
import type { Candidate, ItemType, RetrieveOptions } from './types.js';

// A reader claim's candidates are filled to this many when fewer reach the floor.
export const READER_CLAIM_K = 5;

// Each kind a reader may type a claim as, and the one item type it is about. A claim of any other
// kind is recorded, with its candidates, and is unverifiable with no_comparable_record_field.
export const READER_CLAIM_KINDS: ReadonlyMap<string, ItemType> = new Map<string, ItemType>([
  ['file_changed', 'file'],
  ['commit_present', 'commit'],
  ['reference_in_timeline', 'timeline_event'],
  ['check_succeeded', 'check_run'],
  ['test_passed', 'test'],
]);

export interface ReaderInfo {
  name: string;
  version: string;
}

export interface ReaderClaimInput {
  text: string;
  kind: string;
  declaredValue: JsonValue;
  reader: ReaderInfo;
  // The reader's own output, recorded as given. No check reads it.
  probability?: number;
}

export interface ReaderCheck {
  observed: JsonValue;
  verdict: Verdict;
  reason?: string;
}

export interface ReaderClaim extends ReaderClaimInput, ReaderCheck {
  // Arm A unfilled (as recorded before filling was the default), or filled to k.
  retrieval:
    | { arm: typeof ARM_A; floor: number }
    | { arm: typeof ARM_A_FILL; floor: number; k: number };
  candidates: Candidate[];
}

function unread(section: Unread | ItemsUnread): string {
  return section.status === 'unreadable'
    ? `source_unreadable:${section.source}`
    : `evidence_field_unpopulated:${section.field}`;
}

function verdictOf(verdict: Verdict, observed: JsonValue, reason?: string): ReaderCheck {
  return reason === undefined ? { observed, verdict } : { observed, verdict, reason };
}

const unverifiable = (reason: string): ReaderCheck => verdictOf('unverifiable', null, reason);

// Why the evidence cannot answer a claim about items of this type, if it cannot.
function sectionReason(type: ItemType, evidence: Evidence): string | undefined {
  const items = evidence.items;
  switch (type) {
    case 'file':
      if (evidence.files === undefined) return absentSection('files');
      return evidence.files.status === 'ok' ? undefined : unread(evidence.files);
    case 'check_run':
      if (evidence.checkRuns === undefined) return absentSection('checkRuns');
      return evidence.checkRuns.status === 'ok' ? undefined : unread(evidence.checkRuns);
    case 'commit':
      if (items === undefined) return absentSection('items.commits');
      return items.commits.status === 'ok' ? undefined : unread(items.commits);
    case 'timeline_event':
      if (items === undefined) return absentSection('items.timeline');
      return items.timeline.status === 'ok' ? undefined : unread(items.timeline);
    case 'test':
      if (items === undefined) return absentSection('items.tests');
      return items.tests.status === 'ok' ? undefined : unread(items.tests);
  }
}

// The evidence entry each candidate names, by type and id. A candidate the evidence does not hold
// is undefined: a record that names an item it did not read cannot rest a verdict on it.
function lookup(type: ItemType, evidence: Evidence): Map<string, JsonValue> {
  const entries = new Map<string, JsonValue>();
  const put = (id: string, value: object) => entries.set(id, value as JsonValue);
  const items = evidence.items;
  if (type === 'file' && evidence.files?.status === 'ok') {
    for (const f of evidence.files.entries) put(f.path, f);
  } else if (type === 'check_run' && evidence.checkRuns?.status === 'ok') {
    for (const r of countedCheckRuns(evidence.checkRuns.runs, evidence.checkRuns.excludedIds))
      put(String(r.id), r);
  } else if (type === 'commit' && items?.commits.status === 'ok') {
    for (const c of items.commits.entries) put(c.sha, c);
  } else if (type === 'timeline_event' && items?.timeline.status === 'ok') {
    for (const e of items.timeline.entries) put(e.id, e);
  } else if (type === 'test' && items?.tests.status === 'ok') {
    for (const t of items.tests.entries) put(testId(t), t);
  }
  return entries;
}

const ISSUE_REF = /^(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9}$/;

// The check for one reader claim: a pure function of the claim (its kind, declared value, recorded
// candidates and recorded floor) and the evidence. It never runs retrieval, so offline verification
// recomputes it from the record even where a fresh retrieval would rank differently.
export function checkReaderClaim(
  claim: Pick<ReaderClaim, 'kind' | 'declaredValue' | 'candidates'> & {
    retrieval: { floor: number };
  },
  evidence: Evidence,
  repository: string,
): ReaderCheck {
  const type = READER_CLAIM_KINDS.get(claim.kind);
  if (type === undefined) return unverifiable('no_comparable_record_field');
  const declared = claim.declaredValue;
  const wantsBoolean = type === 'check_run' || type === 'test';
  if (wantsBoolean ? typeof declared !== 'boolean' : typeof declared !== 'string') {
    return unverifiable('no_comparable_record_field');
  }

  const missing = sectionReason(type, evidence);
  if (missing !== undefined) return unverifiable(missing);

  const entries = lookup(type, evidence);
  const typed = claim.candidates.filter((c) => c.type === type);
  if (typed.some((c) => entries.get(c.id) === undefined)) {
    return unverifiable('candidate_not_in_evidence');
  }
  // A candidate below the floor was filled in to make up k: a place to look, never evidence. The
  // check reads identifier matches and candidates at or above the floor only, so filling cannot
  // change a verdict, including for the kinds that aggregate over their candidates.
  const floor = claim.retrieval.floor;
  const relevant = typed.filter((c) => c.score === null || c.score >= floor);
  const observed = relevant.map((c) => entries.get(c.id));

  // A file missing from an incomplete list may be among the files that could not be listed.
  const truncated = type === 'file' && evidence.files?.status === 'ok' && !evidence.files.complete;
  if (relevant.length === 0) {
    // The floor is stated beside the candidates, in the claim's retrieval member.
    return unverifiable(truncated ? 'file_list_truncated' : 'no_matching_record_item');
  }

  switch (type) {
    case 'file': {
      const files = observed as unknown as FileEntry[];
      const match = files.find((f) => f.path === declared || f.previousPath === declared);
      if (match !== undefined) return verdictOf('pass', match.path);
      return unverifiable(truncated ? 'file_list_truncated' : 'declared_item_not_among_candidates');
    }
    case 'commit': {
      const sha = (declared as string).toLowerCase();
      const match = /^[0-9a-f]{7,40}$/.test(sha)
        ? relevant.find((c) => c.id.startsWith(sha))
        : undefined;
      return match === undefined
        ? unverifiable('declared_item_not_among_candidates')
        : verdictOf('pass', match.id);
    }
    case 'timeline_event': {
      const ref = declared as string;
      const events = observed as unknown as { event: string; ref?: string }[];
      const match = ISSUE_REF.test(ref)
        ? events.find((e) => e.ref !== undefined && sameIssue(qualifyIssue(ref, repository), e.ref))
        : undefined;
      return match === undefined
        ? unverifiable('declared_item_not_among_candidates')
        : verdictOf('pass', { event: match.event, ref: match.ref ?? null });
    }
    case 'check_run': {
      // The 0.1 allSucceeded rule (spec section 7.5), over the candidate runs.
      const runs = observed as unknown as CheckRun[];
      let succeeded: boolean | undefined;
      if (runs.some((r) => r.status === 'completed' && r.conclusion !== 'success'))
        succeeded = false;
      else if (runs.some((r) => r.status !== 'completed')) succeeded = undefined;
      else succeeded = true;
      if (succeeded === undefined) return unverifiable('checks_incomplete');
      return succeeded === declared
        ? verdictOf('pass', succeeded)
        : verdictOf('fail', succeeded, 'all_succeeded_mismatch');
    }
    case 'test': {
      const tests = observed as unknown as { outcome: string }[];
      const executed = tests.filter((t) => t.outcome !== 'skipped');
      if (executed.length === 0) return unverifiable('test_not_executed');
      const passed = executed.every((t) => t.outcome === 'passed');
      return passed === declared
        ? verdictOf('pass', passed)
        : verdictOf('fail', passed, 'test_outcome_mismatch');
    }
  }
}

// Retrieves a reader claim's candidates from the evidence and checks it: the readerClaims entry a
// record carries. Every candidate at or above the floor is kept, so the check sees them all; when
// fewer than k reach it, the list is filled to k (FILL_TO_K) with the next items below the floor.
export function readReaderClaim(
  input: ReaderClaimInput,
  evidence: Evidence,
  repository: string,
): ReaderClaim {
  const type = READER_CLAIM_KINDS.get(input.kind);
  const opts: RetrieveOptions = type === undefined ? { repository } : { repository, types: [type] };
  const query = { text: input.text, declaredValue: input.declaredValue };
  const items = recordItems(evidence);
  const unfilled = retrieve(query, items, opts);
  // Filled to k, the head of the list is the unfilled list, so a fill never drops a candidate.
  const candidates =
    unfilled.length >= READER_CLAIM_K
      ? unfilled
      : retrieve(query, items, { ...opts, limit: READER_CLAIM_K, fill: FILL_TO_K });
  const retrieval = { arm: ARM_A_FILL, floor: BM25_FLOOR, k: READER_CLAIM_K } as const;
  const claim: ReaderClaim = {
    text: input.text,
    kind: input.kind,
    declaredValue: input.declaredValue,
    reader: { name: input.reader.name, version: input.reader.version },
    retrieval,
    candidates,
    ...checkReaderClaim(
      { kind: input.kind, declaredValue: input.declaredValue, candidates, retrieval },
      evidence,
      repository,
    ),
  };
  if (input.probability !== undefined) claim.probability = input.probability;
  return claim;
}

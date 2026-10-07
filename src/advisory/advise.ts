// Advisories (spec/claim-format.md, "DRAFT 0.2.0", D.11): each claim the extractor proposed,
// compared with the evidence by the same 0.1 gate check a block's claim of that field gets. The
// check's row becomes a note: `agrees`, `differs:<reason>` or `unanswered:<reason>`. A file named in
// prose may be a bare name or a partial path, so a file claim is also matched by name (D.11.4):
// `agrees_by_name` or `unanswered:ambiguous_path`. A file claim that is still not among the changed
// files is a disagreement only when its path is a file at the head (D.11.4, comparison 0.3.0): the
// evidence reader asks GitHub for the type of the object there, and the answers are recorded in the
// section as `pathsAtHead`. An advisory has no verdict. It never enters the record's `verdict` or
// `claims`, and it is never `fail`.

import { checkCounts, checkHead, checkReferences, checkScope, checkTime } from '../check/checks.js';
import { compareCodeUnits } from '../check/rows.js';
import type { Block, Claim, Evidence, Reference } from '../check/types.js';
import { BLOCK_VERSION } from '../spec/constants.js';
import { sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import type { ProposedClaim } from './extract.js';
import { type AdvisoryKind, EXTRACTOR, type ExtractorIdentity } from './grammar.js';
import {
  type DiffersAccuracy,
  differsAccuracyFor,
  type Precision,
  precisionFor,
} from './precision.js';

export interface Advisory {
  clause: string;
  kind: AdvisoryKind;
  value: ProposedClaim['value'];
  observed: JsonValue;
  note: string;
}

// The version of the comparison from a proposed claim to its note, separate from the extractor's:
// 0.1.0 compared a file claim by exact path only; 0.2.0 also matches it by name; 0.3.0 also asks
// whether a path not among the changed files exists at the head. A record names the comparison its
// notes came from, as it names the grammar that proposed them.
export const COMPARISON_VERSION = '0.3.0';

export interface ComparisonIdentity {
  version: string;
}

export const COMPARISON: ComparisonIdentity = { version: COMPARISON_VERSION };

// What GitHub answered for the object at `<head>:<path>`: its type only (`Blob`, a file; `Tree`, a
// directory), or null when there is none. A read that failed, or answered in any other shape or
// type, is unreadable. Never the object's content, size or id.
export type PathObject = 'Blob' | 'Tree' | null;

export type PathAnswer =
  | { path: string; status: 'ok'; object: PathObject }
  | { path: string; status: 'unreadable' };

export interface AdvisorySection {
  extractor: ExtractorIdentity;
  comparison: ComparisonIdentity;
  precision: Precision | null;
  differsAccuracy: DiffersAccuracy | null;
  // Comparison 0.3.0: one answer per path in `pathsToRead`, in code-unit order of path.
  pathsAtHead: PathAnswer[];
  advisories: Advisory[];
}

const HEX = /^[0-9a-f]{7,40}$/;

// The block a gate check is given for one proposed claim: the head the evidence read, no files, and
// the one field the claim declares.
function blockFor(
  kind: AdvisoryKind,
  value: ProposedClaim['value'],
  headSha: string,
): Block | undefined {
  const base: Block = { dunstan: BLOCK_VERSION, headCommit: headSha, filesChanged: [] };
  switch (kind) {
    case 'file_changed':
      return typeof value === 'string' ? { ...base, filesChanged: [value] } : undefined;
    case 'reference_closes':
      return typeof value === 'string'
        ? { ...base, references: [{ issue: value, relation: 'closes' }] }
        : undefined;
    case 'commit':
      // Only a full SHA can be read as a cited commit; a short one is answered only by the head.
      return typeof value === 'string' && value.length === 40
        ? { ...base, references: [{ commit: value, relation: 'cites' }] }
        : undefined;
    case 'head_commit':
      return typeof value === 'string' ? { ...base, headCommit: value } : undefined;
    case 'checks_succeeded':
      return typeof value === 'boolean' ? { ...base, checks: { allSucceeded: value } } : undefined;
    case 'check_count':
      return typeof value === 'number' ? { ...base, checks: { total: value } } : undefined;
    case 'test_count':
      // Prose names no test record, so the count has no record field to meet (section 7.5). It is
      // never compared with a check-run count.
      return typeof value === 'number'
        ? { ...base, tests: [{ command: '', count: value, record: { kind: 'report-prose' } }] }
        : undefined;
    case 'merged_at':
      return typeof value === 'string' ? { ...base, mergedAt: value } : undefined;
    case 'tests_passed':
      return undefined;
  }
}

function rowFor(
  kind: AdvisoryKind,
  value: ProposedClaim['value'],
  evidence: Evidence,
  repository: string,
): Claim | undefined {
  const head = evidence.pullRequest.headSha;
  if (
    (kind === 'commit' || kind === 'head_commit') &&
    typeof value === 'string' &&
    HEX.test(value) &&
    head.startsWith(value)
  ) {
    // A SHA the head starts with names the head.
    return checkHead({ dunstan: BLOCK_VERSION, headCommit: head, filesChanged: [] }, evidence)[0];
  }
  const block = blockFor(kind, value, head);
  if (block === undefined) return undefined;
  switch (kind) {
    case 'file_changed':
      return checkScope(block, evidence)[0];
    case 'reference_closes':
    case 'commit':
      return checkReferences(block, evidence, repository)[0];
    case 'head_commit':
      return checkHead(block, evidence)[0];
    case 'checks_succeeded':
    case 'check_count':
    case 'test_count':
      return checkCounts(block, evidence)[0];
    case 'merged_at':
      return checkTime(block, evidence)[0];
    case 'tests_passed':
      return undefined;
  }
}

// The changed paths a file named in prose may mean: each entry whose path or previous path is the
// value, or ends in '/' and the value. For a bare name that is every path whose last segment is the
// name; for a partial path it is a suffix on segment boundaries, so `ab/cli.ts` never matches
// `xab/cli.ts`. Case-sensitive, as paths are. Each entry is its current path, once, in code-unit
// order.
function byName(value: string, evidence: Evidence): string[] {
  const files = evidence.files;
  if (files === undefined || files.status !== 'ok') return [];
  const names = (p: string) => p === value || p.endsWith(`/${value}`);
  const matches = files.entries
    .filter((e) => names(e.path) || (e.previousPath !== undefined && names(e.previousPath)))
    .map((e) => e.path);
  return [...new Set(matches)].sort(compareCodeUnits);
}

// The note comparison 0.3.0 leaves to the existence query: a file claim that the changed files,
// read in full, hold neither at its path nor by name.
const NOT_CHANGED = 'differs:declared_not_changed';

// The comparison for one advisory: a pure function of its kind, its value, the evidence and the
// recorded answers of the existence query. A file claim noted `differs:declared_not_changed` by the
// changed files keeps that note only when its path is a file at the head (a `Blob`). No object
// there is `unanswered:no_such_path`, a directory `unanswered:directory`, and an answer that is
// unreadable or missing `unanswered:source_unreadable:path`: never `differs`, never `agrees`.
export function compareAdvisory(
  claim: Pick<Advisory, 'kind' | 'value'>,
  evidence: Evidence,
  repository: string,
  pathsAtHead: readonly PathAnswer[],
): { observed: JsonValue; note: string } {
  const compared = compareByList(claim, evidence, repository);
  if (claim.kind !== 'file_changed' || compared.note !== NOT_CHANGED) return compared;
  const answer = pathsAtHead.find((p) => p.path === claim.value);
  if (answer === undefined || answer.status !== 'ok') {
    return { observed: null, note: 'unanswered:source_unreadable:path' };
  }
  if (answer.object === null) return { observed: null, note: 'unanswered:no_such_path' };
  if (answer.object === 'Tree') return { observed: null, note: 'unanswered:directory' };
  return compared;
}

// The paths the existence query is asked for: each distinct value of a file claim the changed
// files note `differs:declared_not_changed`, in code-unit order. Nothing else is asked: not a
// claim on a changed path, a name match, or a file list not read in full.
export function pathsToRead(
  claims: readonly Pick<Advisory, 'kind' | 'value'>[],
  evidence: Evidence,
  repository: string,
): string[] {
  const paths = claims
    .filter(
      (c) =>
        c.kind === 'file_changed' &&
        typeof c.value === 'string' &&
        compareByList(c, evidence, repository).note === NOT_CHANGED,
    )
    .map((c) => c.value as string);
  return [...new Set(paths)].sort(compareCodeUnits);
}

// The answers a record carries: one per path to read, in that order, taken from what the reader
// answered. A path it did not answer is unreadable.
function answersFor(paths: readonly string[], answered: readonly PathAnswer[]): PathAnswer[] {
  return paths.map((path) => {
    const answer = answered.find((a) => a.path === path);
    if (answer === undefined || answer.status !== 'ok') return { path, status: 'unreadable' };
    return { path, status: 'ok', object: answer.object };
  });
}

// Comparison 0.2.0: the gate check of the claim's field, then a match by name for a file claim.
function compareByList(
  claim: Pick<Advisory, 'kind' | 'value'>,
  evidence: Evidence,
  repository: string,
): { observed: JsonValue; note: string } {
  const row = rowFor(claim.kind, claim.value, evidence, repository);
  if (row === undefined) return { observed: null, note: 'unanswered:no_comparable_record_field' };
  const observed = (row.observed ?? null) as JsonValue;
  // A file list not read in full never gives a name match: it stays unanswered, as before.
  if (
    claim.kind === 'file_changed' &&
    typeof claim.value === 'string' &&
    row.verdict !== 'unverifiable'
  ) {
    // A bare name is always matched by name, never read as a path at the root. A value with a '/'
    // that is a changed path agrees; one that is not may still be a partial path.
    const bare = !claim.value.includes('/');
    if (bare || row.verdict === 'fail') {
      const candidates = byName(claim.value, evidence);
      if (candidates.length === 1)
        return { observed: candidates[0] as string, note: 'agrees_by_name' };
      if (candidates.length > 1) return { observed: candidates, note: 'unanswered:ambiguous_path' };
    }
  }
  if (row.verdict === 'pass') return { observed, note: 'agrees' };
  return {
    observed,
    note: `${row.verdict === 'fail' ? 'differs' : 'unanswered'}:${row.reason as string}`,
  };
}

// The block whose evidence the checker reads: the report's own block, plus the fields the proposed
// claims need read. Reading more never changes a block's claim rows: each row reads only the
// evidence of its own field. Null when the report has no block and no claim needs more than the
// pull request.
export function readingBlock(
  block: Block | null,
  proposed: readonly ProposedClaim[],
  headSha: string,
): Block | null {
  const references = proposed.flatMap((p): Reference[] => {
    if (p.kind === 'reference_closes' && typeof p.value === 'string') {
      return [{ issue: p.value, relation: 'closes' }];
    }
    if (p.kind === 'commit' && typeof p.value === 'string' && p.value.length === 40) {
      return [{ commit: p.value, relation: 'cites' }];
    }
    return [];
  });
  const needsChecks = proposed.some(
    (p) => p.kind === 'checks_succeeded' || p.kind === 'check_count',
  );
  const needsFiles = proposed.some((p) => p.kind === 'file_changed');
  if (block === null && references.length === 0 && !needsChecks && !needsFiles) return null;
  const base: Block = block ?? { dunstan: BLOCK_VERSION, headCommit: headSha, filesChanged: [] };
  const reading: Block = { ...base };
  if (references.length > 0) reading.references = [...(base.references ?? []), ...references];
  if (needsChecks && base.checks === undefined) reading.checks = {};
  return reading;
}

function sameClaim(
  a: Pick<Advisory, 'kind' | 'value'>,
  b: Pick<Advisory, 'kind' | 'value'>,
  repository: string,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'reference_closes' && typeof a.value === 'string' && typeof b.value === 'string') {
    const q = (v: string) => (v.startsWith('#') ? `${repository}${v}` : v).toLowerCase();
    return q(a.value) === q(b.value);
  }
  return a.value === b.value;
}

// One advisory per distinct proposed claim, in the order the report makes them. An empty list
// means the extractor proposed nothing; it never stands for "everything agreed".
export function adviseClaims(
  proposed: readonly ProposedClaim[],
  evidence: Evidence,
  repository: string,
  pathsAtHead: readonly PathAnswer[] = [],
): Advisory[] {
  const out: Advisory[] = [];
  for (const p of proposed) {
    if (out.some((a) => sameClaim(a, p, repository))) continue;
    out.push({
      clause: p.clause,
      kind: p.kind,
      value: p.value,
      ...compareAdvisory(p, evidence, repository, pathsAtHead),
    });
  }
  return out;
}

// `answered` is what the evidence reader's existence query answered for `pathsToRead(proposed)`.
export function advisorySection(
  proposed: readonly ProposedClaim[],
  evidence: Evidence,
  repository: string,
  answered: readonly PathAnswer[],
): AdvisorySection {
  const pathsAtHead = answersFor(pathsToRead(proposed, evidence, repository), answered);
  return {
    extractor: { version: EXTRACTOR.version, digest: { sha256: EXTRACTOR.digest.sha256 } },
    comparison: { version: COMPARISON.version },
    precision: precisionFor(EXTRACTOR.digest.sha256),
    differsAccuracy: differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON.version),
    pathsAtHead,
    advisories: adviseClaims(proposed, evidence, repository, pathsAtHead),
  };
}

export function advisoryDigest(section: AdvisorySection): string {
  return sha256Canonical(section as unknown as JsonValue);
}

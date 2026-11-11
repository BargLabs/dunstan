// The survey mapping (DRAFT, docs/survey.md): which claim type a claim row is, and which column it
// falls in. A survey's aggregate is a pure function of its entries and this mapping, and the record
// names the mapping's version. Any change to a type, a column or a remedy line (src/remedy/) is a new
// version; src/survey/survey.test.ts pins the version to a digest of the whole mapping.
//
// 0.2: the remedy lines are one table with the claims table's (the four tests reasons take its
// wording), each a function of the reader the survey record names (`selection.reader`); and
// `local_run_not_in_record` is not record-checkable.
//
// 0.3: a remedy line for `record_producer_changed_by_pr` (spec 0.1.10). It is unverifiable, not
// not-record-checkable: the record exists, and the pull request wrote it.

import type { Claim } from '../check/types.js';
import { remedyTable } from '../remedy/remedies.js';
import { sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';

export const SURVEY_MAPPING_VERSION = '0.3';

export type ClaimType = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'R';

// In the order the summary lists them; R, a row the study's table did not have, is last.
export const CLAIM_TYPES: readonly { type: ClaimType; label: string }[] = [
  { type: 'T1', label: 'head commit' },
  { type: 'T2', label: 'files changed' },
  { type: 'T3', label: 'test count' },
  { type: 'T4', label: 'test failures' },
  { type: 'T5', label: 'check run total' },
  { type: 'T6', label: 'checks succeeded / none failed' },
  { type: 'T7', label: 'merged at' },
  { type: 'T8', label: 'deployed at' },
  { type: 'R', label: 'references (a row the original study did not have)' },
];

export type Column = 'supported' | 'unverifiable' | 'notRecordCheckable' | 'contradicted';

export const COLUMNS: readonly Column[] = [
  'supported',
  'unverifiable',
  'notRecordCheckable',
  'contradicted',
];

// An unverifiable claim with one of these reasons is one the record cannot check at all: the tests
// ran where the record cannot see them (no CI run uploaded the named record, or the block declares
// a local run), or against a record kind no check reads.
export const NOT_RECORD_CHECKABLE: readonly string[] = [
  'record_not_found',
  'no_comparable_record_field',
  'local_run_not_in_record',
];

// The claim type of a claim row, from its check and its field (spec section 7.1).
export function claimType(claim: Pick<Claim, 'check' | 'field'>): ClaimType {
  const { check, field } = claim;
  if (check === 'head') return 'T1';
  if (check === 'scope') return 'T2';
  if (check === 'reference') return 'R';
  if (check === 'count') {
    if (/^\/tests\/[0-9]+\/count$/.test(field)) return 'T3';
    if (/^\/tests\/[0-9]+\/failures$/.test(field)) return 'T4';
    if (field === '/checks/total') return 'T5';
    if (field === '/checks/allSucceeded' || field === '/checks/noneFailed') return 'T6';
  }
  if (check === 'time') {
    if (field === '/mergedAt') return 'T7';
    if (field === '/deployedAt') return 'T8';
  }
  throw new Error(`no claim type for ${check} ${field}`);
}

export function column(claim: Pick<Claim, 'verdict' | 'reason'>): Column {
  if (claim.verdict === 'pass') return 'supported';
  if (claim.verdict === 'fail') return 'contradicted';
  return NOT_RECORD_CHECKABLE.includes(claim.reason ?? '') ? 'notRecordCheckable' : 'unverifiable';
}

// Everything the mapping decides, as one value: its digest changes when any of it does. The remedy
// lines are a function of the reader, so both readers' lines are in it. The survey is read from the
// command line or the Action, so its lines are the command line's.
export function mappingDigest(): string {
  return sha256Canonical({
    version: SURVEY_MAPPING_VERSION,
    types: CLAIM_TYPES,
    columns: COLUMNS,
    notRecordCheckable: NOT_RECORD_CHECKABLE,
    remedies: {
      authenticated: remedyTable({ hasToken: true, caller: 'cli' }),
      anonymous: remedyTable({ hasToken: false, caller: 'cli' }),
    },
  } as unknown as JsonValue);
}

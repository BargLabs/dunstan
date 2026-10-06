// The shapes retrieval reads and writes (docs/retrieval.md; spec/claim-format.md, "DRAFT 0.2.0").
// Retrieval proposes the record items a claim is about. It never decides a verdict: the check in
// reader-claims.ts does, from the recorded candidates.

import type { JsonValue } from '../spec/json.js';

export type ItemType = 'commit' | 'timeline_event' | 'check_run' | 'file' | 'test';

// One record item as retrieval sees it: its identifier and the text fields it is matched on, in a
// fixed order per type. Built from the evidence snapshot only (items.ts), never from file contents.
export interface RecordItem {
  type: ItemType;
  id: string;
  fields: readonly (readonly [name: string, text: string])[];
}

// What retrieval is asked about: the claim's text, and the value a reader typed from it.
export interface ClaimQuery {
  text: string;
  declaredValue?: JsonValue;
}

export interface Candidate {
  type: ItemType;
  id: string;
  // null for an exact identifier match, which ranks above every lexical match; otherwise the BM25
  // score, rounded to SCORE_DECIMALS places.
  score: number | null;
  matchedField: string;
}

export interface RetrieveOptions {
  // The subject repository, owner/repo: `#N` in a claim names an issue there.
  repository: string;
  // Only items of these types are candidates. Every item still counts toward BM25's statistics.
  types?: readonly ItemType[];
  // At most this many candidates, after ranking. Unset: every candidate at or above the floor.
  limit?: number;
  // 'to-k': after the identifier matches and the candidates at or above the floor, fill the places
  // left up to `limit` with the next items by BM25 score, below the floor too, so that there are
  // min(limit, pool) candidates, where the pool is every item of the allowed types. Ties break as
  // above. Requires `limit`. Unset: nothing below the floor. For measurement (dunstan-eval
  // --fill-to-k); no record carries filled candidates.
  fill?: 'to-k';
}

// Arm A: deterministic retrieval with no model. Exact identifiers first, then BM25 over the items'
// text. Ties break by record order, then by id. Nothing below the floor is a candidate, unless the
// caller asks to fill to k (FILL_TO_K). Reader claims (reader-claims.ts) and measurement do; the
// default here does not.

import { compareCodeUnits } from '../check/rows.js';
import { Bm25Index, tokenize } from './bm25.js';
import { claimTexts, identifierMatches } from './identifiers.js';
import type { Candidate, ClaimQuery, RecordItem, RetrieveOptions } from './types.js';

export const ARM_A = 'A';

// Arm A filled to k: the same ranking with the floor lifted for the places left below k. A filled
// candidate is one whose score is below the floor. It says where to look and is never evidence.
export const FILL_TO_K = 'to-k';
export const ARM_A_FILL = 'A-fill';

// The lowest BM25 score that makes an item a candidate (docs/retrieval.md, "The floor"). With
// k1 = 1.2 and b = 0.75, one query term occurring once in an item of average length contributes
// exactly its IDF, and IDF reaches 1 when the term occurs in at most about N / e of the N items
// (37%). So the floor admits an item that shares one distinctive term with the claim, or several
// weaker ones, and refuses an item of average length whose only link to the claim is one word that
// appears across more than a third of the pull request's record. Length normalisation lifts shorter
// items and lowers longer ones. An identifier match does not depend on the floor.
export const BM25_FLOOR = 1;

// Scores are rounded before they are compared, recorded or held against the floor, so that a
// difference in the last bits of a logarithm on another runtime cannot reorder candidates.
export const SCORE_DECIMALS = 6;

function round(score: number): number {
  const scale = 10 ** SCORE_DECIMALS;
  return Math.round(score * scale) / scale;
}

// The field that best explains a lexical match: the one holding the greatest total IDF of the
// claim's terms. Ties go to the earlier field.
function bestField(item: RecordItem, terms: ReadonlySet<string>, index: Bm25Index): string {
  let best = item.fields[0]?.[0] ?? 'id';
  let bestWeight = -1;
  for (const [name, text] of item.fields) {
    let weight = 0;
    for (const t of new Set(tokenize(text))) if (terms.has(t)) weight += index.idf(t);
    if (weight > bestWeight) {
      best = name;
      bestWeight = weight;
    }
  }
  return best;
}

export function itemTokens(item: RecordItem): string[] {
  return item.fields.flatMap(([, text]) => tokenize(text));
}

interface Ranked {
  order: number;
  candidate: Candidate;
}

// Identifier matches (score null) first, then by score descending, then record order, then id.
function compareRanked(a: Ranked, b: Ranked): number {
  const sa = a.candidate.score;
  const sb = b.candidate.score;
  if (sa === null && sb !== null) return -1;
  if (sa !== null && sb === null) return 1;
  if (sa !== null && sb !== null && sa !== sb) return sb - sa;
  return a.order - b.order || compareCodeUnits(a.candidate.id, b.candidate.id);
}

export function retrieve(
  claim: ClaimQuery,
  items: readonly RecordItem[],
  opts: RetrieveOptions,
): Candidate[] {
  const fill = opts.fill === FILL_TO_K;
  if (fill && opts.limit === undefined) throw new Error(`fill '${FILL_TO_K}' needs a limit (k)`);
  const allowed = opts.types === undefined ? undefined : new Set(opts.types);
  const exact = identifierMatches(claim, items, opts.repository);
  const index = new Bm25Index(items.map(itemTokens));
  const query = claimTexts(claim).flatMap(tokenize);
  const terms = new Set(query);
  const scores = index.scores(query);

  const ranked: Ranked[] = [];
  items.forEach((item, order) => {
    if (allowed !== undefined && !allowed.has(item.type)) return;
    const field = exact.get(order);
    if (field !== undefined) {
      ranked.push({
        order,
        candidate: { type: item.type, id: item.id, score: null, matchedField: field },
      });
      return;
    }
    const score = round(scores[order] ?? 0);
    // Filling ranks every item of an allowed type; the same order puts every item at or above the
    // floor before every item below it, so the first k are the unfilled list, then the fill.
    if (!fill && score < BM25_FLOOR) return;
    ranked.push({
      order,
      candidate: {
        type: item.type,
        id: item.id,
        score,
        matchedField: bestField(item, terms, index),
      },
    });
  });
  ranked.sort(compareRanked);
  const out = ranked.map((r) => r.candidate);
  return opts.limit === undefined ? out : out.slice(0, opts.limit);
}

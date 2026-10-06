// The seam for Arm B, retrieval by embeddings. Dunstan ships no provider: Arm B is added only if the
// retrieval measurement shows it closes a gap Arm A leaves. A provider is passed in at run time, for
// example to `dunstan-eval retrieval --provider`, and its identity is reported beside every result it
// contributes to. Embedding scores can differ in the last digits across hardware, so like BM25
// scores they only rank candidates; a check never reads them.

import { compareCodeUnits } from '../check/rows.js';
import { SCORE_DECIMALS } from './retrieve.js';
import type { Candidate, ClaimQuery, ItemType, RecordItem } from './types.js';

export interface EmbeddingProvider {
  // What produced the vectors: a model name and the digest of its weights, quantisation and runtime.
  readonly identity: { name: string; digest: string };
  // One vector per text, in order. Vectors from one provider share a dimension.
  embed(texts: readonly string[]): Promise<number[][]>;
}

export const ARM_B = 'B';
export const ARM_AB = 'A+B';

// Reciprocal rank fusion's constant (Cormack, Clarke and Buettcher, 2009).
export const RRF_K = 60;

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function itemText(item: RecordItem): string {
  return item.fields.map(([, text]) => text).join('\n');
}

// Every item of an allowed type, ranked by cosine similarity to the claim's text. No floor: a floor
// for Arm B is for the measurement to set, not for this seam.
export async function retrieveByEmbedding(
  claim: ClaimQuery,
  items: readonly RecordItem[],
  provider: EmbeddingProvider,
  types?: readonly ItemType[],
): Promise<Candidate[]> {
  const allowed = types === undefined ? undefined : new Set<string>(types);
  const pool = items
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => allowed === undefined || allowed.has(item.type));
  if (pool.length === 0) return [];
  const vectors = await provider.embed([claim.text, ...pool.map(({ item }) => itemText(item))]);
  const query = vectors[0] ?? [];
  const scale = 10 ** SCORE_DECIMALS;
  return pool
    .map(({ item, order }, i) => ({
      order,
      candidate: {
        type: item.type,
        id: item.id,
        score: Math.round(cosine(query, vectors[i + 1] ?? []) * scale) / scale,
        matchedField: 'text',
      } satisfies Candidate,
    }))
    .sort(
      (a, b) =>
        (b.candidate.score ?? 0) - (a.candidate.score ?? 0) ||
        a.order - b.order ||
        compareCodeUnits(a.candidate.id, b.candidate.id),
    )
    .map((r) => r.candidate);
}

// A and B together: Arm A's identifier matches first, in their order, then every other candidate of
// either list by reciprocal rank fusion. Ties break by first appearance (A's list, then B's), then id.
export function fuse(armA: readonly Candidate[], armB: readonly Candidate[]): Candidate[] {
  const key = (c: Candidate) => `${c.type}\u0000${c.id}`;
  const exact = armA.filter((c) => c.score === null);
  const seen = new Set(exact.map(key));
  const fused = new Map<string, { candidate: Candidate; rrf: number; first: number }>();
  let appearance = 0;
  for (const list of [armA.filter((c) => c.score !== null), armB]) {
    list.forEach((c, rank) => {
      const k = key(c);
      if (seen.has(k)) return;
      const entry = fused.get(k) ?? { candidate: c, rrf: 0, first: appearance++ };
      entry.rrf += 1 / (RRF_K + rank + 1);
      fused.set(k, entry);
    });
  }
  const rest = [...fused.values()].sort(
    (a, b) =>
      b.rrf - a.rrf || a.first - b.first || compareCodeUnits(a.candidate.id, b.candidate.id),
  );
  return [...exact, ...rest.map((r) => r.candidate)];
}

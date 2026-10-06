// The record rules that are pure functions of the record itself (spec sections 4 and 6): the
// overall verdict from the claim rows, and the two digests. The checks that produce claim rows are
// the checker's (src/check/), not this module's.

import { sha256Canonical } from './jcs.js';
import type { JsonValue } from './json.js';

export type Verdict = 'pass' | 'fail' | 'unverifiable';
export type BlockStatus = 'found' | 'missing' | 'ambiguous' | 'invalid';

export function overallVerdict(
  blockStatus: BlockStatus,
  claims: readonly { verdict: Verdict }[],
): Verdict {
  if (claims.some((c) => c.verdict === 'fail')) return 'fail';
  // An empty result is a claim: zero rows never passes.
  if (blockStatus !== 'found' || claims.length === 0) return 'unverifiable';
  if (claims.some((c) => c.verdict === 'unverifiable')) return 'unverifiable';
  return 'pass';
}

// Removes every member named readAt, at any depth. The evidence digest covers what was read, not
// when, so a re-run on another machine reproduces it.
export function withoutReadAt(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(withoutReadAt);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'readAt')
        .map(([key, v]) => [key, withoutReadAt(v)]),
    );
  }
  return value;
}

// Removes the top-level sources member. sources is provenance (response digests, ETags, read times);
// the evidence digest covers the snapshot the claims are computed from (spec section 10, decided
// 2026-10-04), so an online re-run reports evidence_changed only when a claim's input moved.
export function withoutSources(evidence: JsonValue): JsonValue {
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) return evidence;
  return Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'sources'));
}

export function evidenceDigest(evidence: JsonValue): string {
  return sha256Canonical(withoutSources(evidence));
}

export function claimsDigest(claims: JsonValue): string {
  return sha256Canonical(claims);
}

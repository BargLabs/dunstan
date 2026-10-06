// Claim-row constructors shared by the checks. A pass row carries no reason; a fail or unverifiable
// row always does (spec section 7.1). An unverifiable row's observed value is null.

import type { CheckName, Claim, Unread } from './types.js';

export function pass(check: CheckName, field: string, declared: unknown, observed: unknown): Claim {
  return { id: `${check}:${field}`, check, field, declared, observed, verdict: 'pass' };
}

export function fail(
  check: CheckName,
  field: string,
  declared: unknown,
  observed: unknown,
  reason: string,
): Claim {
  return { id: `${check}:${field}`, check, field, declared, observed, verdict: 'fail', reason };
}

export function unverifiable(
  check: CheckName,
  field: string,
  declared: unknown,
  reason: string,
): Claim {
  return {
    id: `${check}:${field}`,
    check,
    field,
    declared,
    observed: null,
    verdict: 'unverifiable',
    reason,
  };
}

export function unreadReason(unread: Unread): string {
  return unread.status === 'unreadable'
    ? `source_unreadable:${unread.source}`
    : `evidence_field_unpopulated:${unread.field}`;
}

// A section the block needs but the evidence does not carry at all. The reader always writes the
// sections a block needs, so this arises only from a hand-made or truncated snapshot; it is no
// evidence, and fails closed the same way as a source that answered without the field.
export function absentSection(section: string): string {
  return `evidence_field_unpopulated:${section}`;
}

// Times are compared to the second (spec section 7.6). Both the block schema and the evidence schema
// fix the shape YYYY-MM-DDTHH:MM:SS[.fff]Z, so the first 19 characters order the same way the
// instants do.
export function toSecond(timestamp: string): string {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(timestamp)) {
    throw new Error(`not an RFC 3339 UTC timestamp: ${timestamp}`);
  }
  return timestamp.slice(0, 19);
}

export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

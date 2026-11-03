// The survey's aggregate (DRAFT, docs/survey.md): a pure function of the entries and the mapping
// (src/survey/mapping.ts). Every number in it is an exact integer or a fixed-decimal string, so two
// machines write the same bytes. No rate reads an advisory note.

import type { DunstanRecord } from '../record/build.js';
import { remedyForReason } from '../remedy/remedies.js';
import {
  CLAIM_TYPES,
  type ClaimType,
  type Column,
  claimType,
  column,
  SURVEY_MAPPING_VERSION,
} from './mapping.js';

// Why a selected pull request has no record: it could not be read, it moved while it was checked
// and again when checked once more, GitHub rate-limited its reads, or the named report could not
// be read.
export type NoRecordReason =
  | 'pull_request_unreadable'
  | 'pull_request_moved'
  | 'rate_limited'
  | 'report_unavailable';

export type SurveyEntry =
  | { pullRequest: number; record: DunstanRecord }
  | { pullRequest: number; record: null; reason: NoRecordReason };

export interface Rate {
  numerator: number;
  denominator: number;
  // numerator / denominator to four decimals; null when the denominator is 0.
  value: string | null;
  // The Wilson score interval at 95% (z = 1.96), to four decimals; null when the denominator is 0.
  wilson95: { low: string; high: string } | null;
}

export type ColumnCounts = Record<Column, number>;

// Whether the survey read GitHub with a token (GITHUB_TOKEN was set). The token is never recorded.
export interface SurveyReader {
  authenticated: boolean;
}

export interface SurveyAggregate {
  mapping: { version: string };
  pullRequests: {
    listed: number;
    selected: number;
    withRecord: number;
    blockFound: number;
    blockMissing: number;
    blockInvalid: number;
    blockAmbiguous: number;
    noRecord: { reason: NoRecordReason; count: number }[];
  };
  claims: { total: number } & ColumnCounts;
  byType: ({ type: ClaimType } & ColumnCounts)[];
  // (unverifiable + not record-checkable) / all claims.
  cannotSettle: Rate;
  // contradicted / (supported + contradicted).
  contradictedOfSettled: Rate;
  // Each reason a claim could not be settled for, most frequent first, with its remedy line as
  // worded for the survey's reader.
  unsettled: { reason: string; column: Column; count: number; remedy: string | null }[];
  // Only when the survey ran the advisory reader: its notes by exact note, never in a rate.
  advisory?: { pullRequests: number; notes: { note: string; count: number }[] };
}

const Z = 1.96;
const DECIMALS = 4;

function fixed(x: number): string {
  return Math.min(1, Math.max(0, x)).toFixed(DECIMALS);
}

export function rate(numerator: number, denominator: number): Rate {
  if (denominator === 0) return { numerator, denominator, value: null, wilson95: null };
  const n = denominator;
  const p = numerator / n;
  const z2 = Z * Z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return {
    numerator,
    denominator,
    value: fixed(p),
    wilson95: {
      low: numerator === 0 ? fixed(0) : fixed(centre - half),
      high: numerator === n ? fixed(1) : fixed(centre + half),
    },
  };
}

const zero = (): ColumnCounts => ({
  supported: 0,
  unverifiable: 0,
  notRecordCheckable: 0,
  contradicted: 0,
});

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function aggregate(
  entries: readonly SurveyEntry[],
  listed: number,
  advisory: boolean,
  reader: SurveyReader,
): SurveyAggregate {
  const context = { hasToken: reader.authenticated };
  const totals = zero();
  const types = new Map<ClaimType, ColumnCounts>(CLAIM_TYPES.map((t) => [t.type, zero()]));
  const unsettled = new Map<string, { column: Column; count: number }>();
  const noRecord = new Map<NoRecordReason, number>();
  const notes = new Map<string, number>();
  const blocks = { found: 0, missing: 0, invalid: 0, ambiguous: 0 };
  let withRecord = 0;
  let advised = 0;

  for (const entry of entries) {
    if (entry.record === null) {
      noRecord.set(entry.reason, (noRecord.get(entry.reason) ?? 0) + 1);
      continue;
    }
    withRecord++;
    const p = entry.record.predicate;
    blocks[p.block.status]++;
    for (const claim of p.claims) {
      const col = column(claim);
      totals[col]++;
      (types.get(claimType(claim)) as ColumnCounts)[col]++;
      if (col === 'unverifiable' || col === 'notRecordCheckable') {
        const reason = claim.reason as string;
        const seen = unsettled.get(reason) ?? { column: col, count: 0 };
        seen.count++;
        unsettled.set(reason, seen);
      }
    }
    if (p.advisory !== undefined) {
      advised++;
      for (const a of p.advisory.advisories) notes.set(a.note, (notes.get(a.note) ?? 0) + 1);
    }
  }

  const total =
    totals.supported + totals.unverifiable + totals.notRecordCheckable + totals.contradicted;
  const result: SurveyAggregate = {
    mapping: { version: SURVEY_MAPPING_VERSION },
    pullRequests: {
      listed,
      selected: entries.length,
      withRecord,
      blockFound: blocks.found,
      blockMissing: blocks.missing,
      blockInvalid: blocks.invalid,
      blockAmbiguous: blocks.ambiguous,
      noRecord: [...noRecord.entries()]
        .sort(([a], [b]) => byCodeUnit(a, b))
        .map(([reason, count]) => ({ reason, count })),
    },
    claims: { total, ...totals },
    byType: CLAIM_TYPES.map((t) => ({ type: t.type, ...(types.get(t.type) as ColumnCounts) })),
    cannotSettle: rate(totals.unverifiable + totals.notRecordCheckable, total),
    contradictedOfSettled: rate(totals.contradicted, totals.supported + totals.contradicted),
    unsettled: [...unsettled.entries()]
      .sort(([a, x], [b, y]) => y.count - x.count || byCodeUnit(a, b))
      .map(([reason, { column: col, count }]) => ({
        reason,
        column: col,
        count,
        remedy: remedyForReason(reason, context) ?? null,
      })),
  };
  if (advisory) {
    result.advisory = {
      pullRequests: advised,
      notes: [...notes.entries()]
        .sort(([a], [b]) => byCodeUnit(a, b))
        .map(([note, count]) => ({ note, count })),
    };
  }
  return result;
}

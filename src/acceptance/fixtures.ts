// Runs the preregistered fixtures (docs/acceptance/preregistration-0.1.md) through block extraction,
// runChecks and the record builder, and compares each with its expected.json. Shared by the
// acceptance test, the determinism test (criterion d) and the results table in the pull request.

import { readdirSync, readFileSync } from 'node:fs';
import type { Evidence } from '../check/types.js';
import { buildRecord, type DunstanRecord, recordBlock } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { canonicalize, sha256Hex } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';

export const FIXTURES = new URL('../../fixtures/', import.meta.url);
export const FIXTURE_REPOSITORY = 'example-org/example-repo';
export type FixtureSet = 'planted' | 'controls';

export interface ExpectedRow {
  id: string;
  verdict: string;
  reason?: string;
}

export interface Expected {
  description: string;
  blockStatus: string;
  blockErrors?: string[];
  blockCount?: number;
  verdict: string;
  claims: ExpectedRow[];
}

export interface FixtureCase {
  set: FixtureSet;
  name: string;
  report: Buffer;
  evidence: Evidence;
  expected: Expected;
}

export function loadCases(set: FixtureSet): FixtureCase[] {
  const dir = new URL(`${set}/`, FIXTURES);
  return readdirSync(dir)
    .sort()
    .map((name) => {
      const read = (file: string) => readFileSync(new URL(`${name}/${file}`, dir));
      return {
        set,
        name,
        report: read('report.md'),
        evidence: JSON.parse(read('evidence.json').toString('utf8')) as Evidence,
        expected: JSON.parse(read('expected.json').toString('utf8')) as Expected,
      };
    });
}

// The checker digest is outside every digest the record carries; fixtures use a fixed placeholder.
const FIXTURE_CHECKER = {
  name: CHECKER_NAME,
  version: CHECKER_VERSION,
  digest: { sha256: '0'.repeat(64) },
};

export function runCase(c: FixtureCase): DunstanRecord {
  const locator = `fixtures/${c.set}/${c.name}/report.md`;
  return buildRecord({
    checker: FIXTURE_CHECKER,
    report: { sha256: sha256Hex(c.report), source: { kind: 'file', locator } },
    block: recordBlock(extractHandbackBlock(c.report.toString('utf8'))),
    repository: FIXTURE_REPOSITORY,
    evidence: c.evidence,
    rerun: { offline: `dunstan verify ${c.name}.json`, online: `dunstan rerun ${c.name}.json` },
  });
}

// What the record says, in expected.json's shape.
export function observedOf(record: DunstanRecord): Omit<Expected, 'description'> {
  const p = record.predicate;
  const observed: Omit<Expected, 'description'> = {
    blockStatus: p.block.status,
    verdict: p.verdict,
    claims: p.claims.map((c) => {
      const row: ExpectedRow = { id: c.id, verdict: c.verdict };
      if (c.reason !== undefined) row.reason = c.reason;
      return row;
    }),
  };
  if (p.block.status === 'invalid')
    observed.blockErrors = [...new Set(p.block.errors.map((e) => e.code))];
  if (p.block.status === 'ambiguous') observed.blockCount = p.block.count;
  return observed;
}

export function matches(c: FixtureCase, record: DunstanRecord): boolean {
  const { description: _, ...expected } = c.expected;
  return (
    canonicalize(observedOf(record) as unknown as JsonValue) ===
    canonicalize(expected as unknown as JsonValue)
  );
}

// One line per case: the members criterion (d) compares across machines.
export function determinismLine(c: FixtureCase, record: DunstanRecord): string {
  const p = record.predicate;
  return canonicalize({
    case: `${c.set}/${c.name}`,
    block: p.block.sha256,
    verdict: p.verdict,
    claims: p.claims,
    digests: p.digests,
  } as unknown as JsonValue);
}

// The rows that decide a case's verdict, for the results table: every non-pass row as id=reason.
export function namedReasons(
  rows: readonly ExpectedRow[],
  expected: Omit<Expected, 'description'>,
): string {
  const named = rows.filter((r) => r.verdict !== 'pass').map((r) => `${r.id} ${r.reason}`);
  if (named.length > 0) return named.join('; ');
  if (expected.blockStatus !== 'found') {
    const detail =
      expected.blockErrors?.join(',') ??
      (expected.blockCount !== undefined ? `count ${expected.blockCount}` : '');
    return `block ${expected.blockStatus}${detail ? ` (${detail})` : ''}`;
  }
  return 'all rows pass';
}

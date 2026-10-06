// Acceptance criterion (c), as preregistered in docs/acceptance/preregistration-0.1.md: every planted
// defect is caught with its named reason and none passes; every positive control passes. Plus the
// golden digests of the controls, which fail on drift.
//
// DUNSTAN_RESULTS_OUT=<file> also writes the results table (case, expected, observed, match).

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyRecord } from '../record/verify.js';
import { validateRecord } from '../spec/schema.js';
import {
  FIXTURES,
  type FixtureCase,
  loadCases,
  matches,
  namedReasons,
  observedOf,
  runCase,
} from './fixtures.js';

const planted = loadCases('planted');
const controls = loadCases('controls');

describe('acceptance (c): planted defects', () => {
  it('covers every case the preregistration names', () => {
    const names = planted.map((c) => c.name);
    for (const required of [
      'head-mismatch',
      'closes-not-linked',
      'cites-nonexistent-issue',
      'cites-unreachable-commit',
      'test-count-wrong',
      'test-failures-understated',
      'checks-total-wrong',
      'all-succeeded-with-failed-check',
      'declared-file-not-changed',
      'undeclared-changed-file',
      'merged-at-premature',
      'merged-at-unmerged',
      'deployed-at-no-deployment',
      'block-missing',
      'two-blocks',
      'malformed-block',
      'unsupported-version',
      'source-unreadable',
      'unsupported-test-record-kind',
      'minimal-block-omits-file',
      // Spec 0.1.1: a closes missing from the closing references.
      'closes-repository-unreadable',
      'closes-nonexistent-issue',
    ]) {
      expect(names).toContain(required);
    }
  });

  it.each(planted.map((c) => [c.name, c] as const))('%s is caught, never passed', (_, c) => {
    const record = runCase(c);
    expect(record.predicate.verdict).not.toBe('pass');
    expect(record.predicate.verdict).toBe(c.expected.verdict);
    const { description: _d, ...expected } = c.expected;
    expect(observedOf(record)).toEqual(expected);
  });
});

describe('acceptance (c): positive controls', () => {
  it('has at least the three controls the preregistration names', () => {
    expect(controls.map((c) => c.name)).toEqual(
      expect.arrayContaining(['full', 'minimal', 'rename']),
    );
  });

  it.each(controls.map((c) => [c.name, c] as const))('%s passes', (_, c) => {
    const record = runCase(c);
    expect(record.predicate.verdict).toBe('pass');
    const { description: _d, ...expected } = c.expected;
    expect(observedOf(record)).toEqual(expected);
  });
});

describe('every fixture record', () => {
  it.each([...planted, ...controls].map((c) => [`${c.set}/${c.name}`, c] as const))(
    '%s validates against the record schema and verifies offline',
    (_, c) => {
      const record = JSON.parse(JSON.stringify(runCase(c)));
      expect(validateRecord(record)).toEqual([]);
      expect(verifyRecord(record).problems).toEqual([]);
    },
  );
});

interface Golden {
  block: string;
  claims: string;
  evidence: string;
}

describe('golden digests of the positive controls', () => {
  const golden = () =>
    JSON.parse(readFileSync(new URL('golden-digests.json', FIXTURES), 'utf8')) as Record<
      string,
      Golden
    >;

  it('has an entry for every control and no other', () => {
    expect(Object.keys(golden()).sort()).toEqual(controls.map((c) => c.name).sort());
  });

  it.each(controls.map((c) => [c.name, c] as const))('%s has not drifted', (name, c) => {
    const p = runCase(c).predicate;
    expect({
      block: p.block.sha256,
      claims: p.digests.claims,
      evidence: p.digests.evidence,
    }).toEqual(golden()[name]);
  });
});

function resultRow(c: FixtureCase): string {
  const record = runCase(c);
  const observed = observedOf(record);
  const { description: _, ...expected } = c.expected;
  const cell = (o: typeof observed) => `\`${o.verdict}\`: ${namedReasons(o.claims, o)}`;
  const ok =
    matches(c, record) &&
    (c.set === 'controls' ? observed.verdict === 'pass' : observed.verdict !== 'pass');
  return `| ${c.set === 'controls' ? 'control' : 'planted'} | \`${c.name}\` | ${cell(expected)} | ${cell(observed)} | ${ok ? 'yes' : '**NO**'} |`;
}

const out = process.env.DUNSTAN_RESULTS_OUT;
if (out !== undefined && out !== '') {
  it('writes the results table', () => {
    const lines = [
      '| Set | Case | Expected | Observed | Match |',
      '| --- | --- | --- | --- | --- |',
      ...controls.map(resultRow),
      ...planted.map(resultRow),
    ];
    writeFileSync(out, `${lines.join('\n')}\n`);
  });
}

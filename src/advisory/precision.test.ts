// The published figures (2026-10-05) and what each is bound to. A figure is returned only
// for the exact extractor digest, and for `differs` the exact comparison version too, that it was
// measured on. Any other version is unmeasured: it never inherits a figure.

import { describe, expect, it } from 'vitest';
import { COMPARISON_VERSION } from './advise.js';
import { EXTRACTOR } from './grammar.js';
import {
  countOf,
  differsAccuracyFor,
  differsAccuracyText,
  type Figure,
  PUBLISHED_DIFFERS_ACCURACY,
  PUBLISHED_PRECISION,
  precisionFor,
  precisionText,
  UNMEASURED,
} from './precision.js';

// The grammar the figures were measured on: extractor 0.1.1. The extractor that runs is 0.1.4 (0.1.2
// and 0.1.3 before it), which no figure is published for.
const DIGEST = 'ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360';
const SOURCE = 'operator-adjudicated, Barg Labs internal corpus, 2026-10-05';

// The Wilson score interval at 95% (z = 1.96).
function wilson(k: number, n: number): [number, number] {
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const round = (x: number, places: number) => Number(x.toFixed(places));

describe('the published figures', () => {
  it('are bound to extractor 0.1.1 by its digest, and differs to comparison 0.2.0 too', () => {
    expect(PUBLISHED_PRECISION.map((p) => p.extractorDigest)).toEqual([DIGEST]);
    expect(PUBLISHED_DIFFERS_ACCURACY.map((p) => [p.extractorDigest, p.comparisonVersion])).toEqual(
      [[DIGEST, '0.2.0']],
    );
    expect(COMPARISON_VERSION).toBe('0.2.0');
  });

  it('state the operator-signed values, n and intervals', () => {
    const precision = precisionFor(DIGEST);
    const differs = differsAccuracyFor(DIGEST, COMPARISON_VERSION);
    if (precision === null || differs === null) throw new Error('unpublished');
    const shown = (f: Figure) => [
      countOf(f),
      f.n,
      round(f.value, 2),
      round(f.interval.low, 3),
      round(f.interval.high, 3),
      f.pullRequests,
    ];
    expect(shown(precision)).toEqual([24, 30, 0.8, 0.627, 0.905, 170]);
    expect(shown(differs)).toEqual([0, 20, 0, 0, 0.161, 170]);
    expect(shown(differs.baseRate)).toEqual([0, 44, 0, 0, 0.08, 170]);
  });

  it('carry each interval as the Wilson 95% interval of its count, to five places', () => {
    const differs = differsAccuracyFor(DIGEST, COMPARISON_VERSION);
    const precision = precisionFor(DIGEST);
    if (precision === null || differs === null) throw new Error('unpublished');
    for (const f of [precision, differs, differs.baseRate]) {
      const [low, high] = wilson(countOf(f), f.n);
      expect(f.interval).toEqual({
        method: 'wilson',
        level: 0.95,
        low: round(low, 5),
        high: round(high, 5),
      });
      expect(countOf(f) / f.n).toBe(f.value);
    }
  });

  it('carry value, n, interval and method with the source note, and nothing private', () => {
    const differs = differsAccuracyFor(DIGEST, COMPARISON_VERSION);
    const precision = precisionFor(DIGEST);
    if (precision === null || differs === null) throw new Error('unpublished');
    for (const f of [precision, differs.baseRate]) {
      expect(Object.keys(f).sort()).toEqual(
        ['interval', 'method', 'n', 'pullRequests', 'source', 'value'].sort(),
      );
    }
    expect(Object.keys(differs).sort()).toEqual(
      ['baseRate', 'interval', 'method', 'n', 'pullRequests', 'source', 'value'].sort(),
    );
    const text = JSON.stringify([PUBLISHED_PRECISION, PUBLISHED_DIFFERS_ACCURACY]);
    for (const f of [precision, differs, differs.baseRate]) expect(f.source).toBe(SOURCE);
    // No path, no pull request number, no repository, no link.
    expect(text).not.toMatch(/github|https?:|#\d|\/[a-z]|\.md\b|\.json\b/i);
  });
});

describe('the binding: a changed digest or comparison is unmeasured', () => {
  const OTHER_DIGEST = `${DIGEST.slice(0, 63)}${DIGEST.endsWith('0') ? '1' : '0'}`;

  it('extraction precision is the published figure for this digest only', () => {
    expect(precisionFor(DIGEST)).not.toBeNull();
    expect(precisionText(precisionFor(DIGEST))).toBe(`0.8 over 30 adjudicated (${SOURCE})`);
    for (const digest of [OTHER_DIGEST, DIGEST.toUpperCase(), DIGEST.slice(0, 12), '']) {
      expect(precisionFor(digest)).toBeNull();
      expect(precisionText(precisionFor(digest))).toBe(UNMEASURED);
    }
  });

  it('the differs figure is the published one for this digest and this comparison only', () => {
    expect(differsAccuracyText(differsAccuracyFor(DIGEST, '0.2.0'))).toBe(
      `0 of 20 marked a false claim, base rate 0 of 44 (${SOURCE})`,
    );
    for (const [digest, comparison] of [
      [OTHER_DIGEST, '0.2.0'],
      [DIGEST, '0.1.0'],
      [DIGEST, '0.3.0'],
      [DIGEST, '0.2'],
      [DIGEST, ''],
      [OTHER_DIGEST, '0.1.0'],
    ] as const) {
      expect(differsAccuracyFor(digest, comparison)).toBeNull();
      expect(differsAccuracyText(differsAccuracyFor(digest, comparison))).toBe(UNMEASURED);
    }
  });

  it('a changed comparison leaves extraction precision measured, since the grammar is the same', () => {
    expect(precisionFor(DIGEST)).not.toBeNull();
    expect(differsAccuracyFor(DIGEST, '0.3.0')).toBeNull();
  });

  // Extractors 0.1.2, 0.1.3 and then 0.1.4 changed the grammar. The figures stay bound to 0.1.1
  // and are not rebound: 0.1.2, 0.1.3 and 0.1.4 show "unmeasured" until measured anew.
  it('extractor 0.1.4, the one that runs, is unmeasured: it inherits nothing from 0.1.1', () => {
    expect(EXTRACTOR.version).toBe('0.1.4');
    expect(EXTRACTOR.digest.sha256).toBe(
      '78b92a682063464faf3cf1de13123d2b232bb3575effd5f31f0e12905643d45c',
    );
    expect(EXTRACTOR.digest.sha256).not.toBe(DIGEST);
    // Nor anything for 0.1.2 and 0.1.3, the extractors before it.
    for (const before of [
      'dfd6563a934667a80448e49b7133ade6d2473e5e13cd9d05fd52c761a1a1780b',
      '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
    ]) {
      expect(precisionFor(before)).toBeNull();
    }
    expect(precisionFor(EXTRACTOR.digest.sha256)).toBeNull();
    expect(differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON_VERSION)).toBeNull();
    expect(precisionText(precisionFor(EXTRACTOR.digest.sha256))).toBe(UNMEASURED);
    expect(
      differsAccuracyText(differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON_VERSION)),
    ).toBe(UNMEASURED);
  });
});

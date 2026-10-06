// The advisory layer's measured figures, carried beside its advisories (published 2026-10-05). A
// record carries a figure only from a published measurement, and only for what the measurement was
// taken on:
//
// - extraction precision, the share of proposed claims that are claims the report really makes, is
//   bound to the extractor digest;
// - the accuracy of `differs` notes, the share that marked a genuinely false claim, is bound to the
//   extractor digest and the comparison version, and always carries the corpus's base rate beside
//   it.
//
// A change to the grammar or the comparison finds no figure here, so the record says null until the
// new version is measured anew. Null is shown as "unmeasured", never as a number. Only the value, n,
// interval and method are published; the rows, the clauses and the labels are not.

export interface Interval {
  // A Wilson score interval at 95% (z = 1.96), each bound to five decimal places.
  method: 'wilson';
  level: 0.95;
  low: number;
  high: number;
}

export interface Figure {
  // The measured share, in [0, 1].
  value: number;
  // How many items the share is over.
  n: number;
  interval: Interval;
  // How many merged pull requests the corpus held.
  pullRequests: number;
  // How the items were drawn and adjudicated.
  method: string;
  // Who adjudicated, on what, and when. Never a path, a pull request number, a row or a label.
  source: string;
}

export type Precision = Figure;

export interface DiffersAccuracy extends Figure {
  // The share of all advisories on the same corpus that were genuinely false completion claims. A
  // `differs` figure means nothing without it: 0 of 20 where the record found no false claim among
  // the advisories it could check is not a check that failed to find one.
  baseRate: Figure;
}

export interface PublishedPrecision {
  // The extractor digest (EXTRACTOR.digest.sha256) the measurement was taken on.
  extractorDigest: string;
  precision: Precision;
}

export interface PublishedDiffersAccuracy {
  extractorDigest: string;
  // The comparison version (COMPARISON.version) the notes were given by.
  comparisonVersion: string;
  differsAccuracy: DiffersAccuracy;
}

const SOURCE = 'operator-adjudicated, Barg Labs internal corpus, 2026-10-05';
const CORPUS = "170 of Barg Labs' own merged agent pull requests";
const EXTRACTOR_0_1_1 = 'ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360';

export const PUBLISHED_PRECISION: readonly PublishedPrecision[] = [
  {
    extractorDigest: EXTRACTOR_0_1_1,
    precision: {
      value: 0.8,
      n: 30,
      interval: { method: 'wilson', level: 0.95, low: 0.62694, high: 0.90495 },
      pullRequests: 170,
      method: `A seeded held-out sample of 30 of the 149 advisories extractor 0.1.1 proposed on ${CORPUS}, each adjudicated as a real claim of the report or not.`,
      source: SOURCE,
    },
  },
];

export const PUBLISHED_DIFFERS_ACCURACY: readonly PublishedDiffersAccuracy[] = [
  {
    extractorDigest: EXTRACTOR_0_1_1,
    comparisonVersion: '0.2.0',
    differsAccuracy: {
      value: 0,
      n: 20,
      interval: { method: 'wilson', level: 0.95, low: 0, high: 0.16113 },
      pullRequests: 170,
      method: `A census of every differs advisory, under extractor 0.1.1 and comparison 0.2.0, on ${CORPUS}, each adjudicated as marking a genuinely false claim or not.`,
      source: SOURCE,
      baseRate: {
        value: 0,
        n: 44,
        interval: { method: 'wilson', level: 0.95, low: 0, high: 0.0803 },
        pullRequests: 170,
        method: `The 44 of the 149 advisories extractor 0.1.1 proposed on ${CORPUS} that the record could check (24 agreed with it; the 20 differs were adjudicated): none was a genuinely false completion claim. The other 105 could not be compared with the record and were not judged.`,
        source: SOURCE,
      },
    },
  },
];

export const UNMEASURED = 'unmeasured';

// The precision a record carries for an extractor: the published one if it was measured on that
// very grammar, else null.
export function precisionFor(
  extractorDigest: string,
  published: readonly PublishedPrecision[] = PUBLISHED_PRECISION,
): Precision | null {
  return published.find((p) => p.extractorDigest === extractorDigest)?.precision ?? null;
}

// The accuracy of `differs` notes a record carries: the published one if it was measured on that
// very grammar and that very comparison, else null.
export function differsAccuracyFor(
  extractorDigest: string,
  comparisonVersion: string,
  published: readonly PublishedDiffersAccuracy[] = PUBLISHED_DIFFERS_ACCURACY,
): DiffersAccuracy | null {
  return (
    published.find(
      (p) => p.extractorDigest === extractorDigest && p.comparisonVersion === comparisonVersion,
    )?.differsAccuracy ?? null
  );
}

// How many of the n items the share is: the figures are counts over n, published as shares.
export function countOf(figure: Figure): number {
  return Math.round(figure.value * figure.n);
}

export function precisionText(precision: Precision | null): string {
  return precision === null
    ? UNMEASURED
    : `${precision.value} over ${precision.n} adjudicated (${precision.source})`;
}

export function differsAccuracyText(figure: DiffersAccuracy | null): string {
  return figure === null
    ? UNMEASURED
    : `${countOf(figure)} of ${figure.n} marked a false claim, base rate ${countOf(figure.baseRate)} of ${figure.baseRate.n} (${figure.source})`;
}

// How a reader is shown an advisory note. The rule preregistered before `differs` notes were
// measured fired: a `differs` note is shown as a possible disagreement, unverified, never as an
// accusation. This is presentation only. The record's `note` stays `differs:<reason>`, so
// `dunstan verify` recomputes every record as before; only the words a person reads change
// (docs/advisory.md, "How a differs note is shown"). The fixed line states the measured figures when the record carries them
// (docs/advisory.md, "Measured figures").

import { countOf, type DiffersAccuracy, type Precision } from './precision.js';

export const POSSIBLE_DISAGREEMENT = 'possible disagreement, unverified';

// The fixed line each surface prints near its advisories when the record carries no figure: a later
// extractor or comparison, not yet measured.
export const ADVISORY_LINE =
  'Advisories never affect the verdict. A possible disagreement is unverified: on the reports measured so far it usually reflected a misread of the report, not a false claim.';

const two = (x: number) => x.toFixed(2);

// The fixed line for a record's advisory section (published 2026-10-05). With the figures published
// for its extractor and comparison it states them, filled from the record; without either, it is
// ADVISORY_LINE. The wording "none was a false claim" holds only for a base rate of zero, so any
// other base rate also gives ADVISORY_LINE.
export function advisoryLine(section: {
  precision: Precision | null;
  differsAccuracy: DiffersAccuracy | null;
}): string {
  const p = section.precision;
  const d = section.differsAccuracy;
  if (p === null || d === null || countOf(d.baseRate) !== 0) return ADVISORY_LINE;
  return [
    'Advisories never affect the verdict.',
    `Extraction precision ${two(p.value)} (${countOf(p)}/${p.n}, 95% CI ${two(p.interval.low)}–${two(p.interval.high)}).`,
    `A possible disagreement is unverified: on ${d.pullRequests} of our own agent PRs, ${countOf(d)} of ${d.n} marked a false claim, and of the ${d.baseRate.n} advisories the record could check there, none was a false claim (${countOf(d.baseRate)} of ${d.baseRate.n}).`,
  ].join(' ');
}

// What the record holds, for each reason a `differs` note can carry (spec section 16). Each says
// what the record shows, not what the agent did, and none repeats a reason code: three of them hold
// "mismatch".
export const RECORD_SHOWS: Readonly<Record<string, string>> = {
  declared_not_changed: 'not among the changed files',
  not_closing: 'not among the closing references',
  not_found: 'not found in the record',
  not_reachable: 'not reachable from the head',
  head_mismatch: 'the head is another commit',
  all_succeeded_mismatch: 'the check runs read otherwise',
  count_mismatch: 'the record holds another count',
  not_merged: 'the pull request is not merged',
  premature: 'the recorded merge time is later',
};

// A note in the words a reader is shown: a `differs` note becomes the possible disagreement and what
// the record shows; every other note is shown as written.
export function noteText(note: string): string {
  if (!note.startsWith('differs:')) return note;
  const shows = RECORD_SHOWS[note.slice('differs:'.length)] ?? 'see the record';
  return `${POSSIBLE_DISAGREEMENT}: ${shows}`;
}

export function isPossibleDisagreement(note: string): boolean {
  return note.startsWith('differs:');
}

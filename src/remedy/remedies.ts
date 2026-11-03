// What would let the record settle a claim it could not: one line per reason code, keyed by the
// reason as a record writes it. Every reason in spec section 16 has an entry, and a reason that
// decides a claim (a `fail` reason) or is a block status says so in its own words: the record
// decided, and there is nothing to fix in the record. src/remedy/remedies.test.ts reads section 16
// and fails when a reason has no entry. The survey's own reasons for a pull request it has no record
// of have an entry too.
//
// Each entry is a function of the reader's context; most ignore it. GitHub answers an artifact
// download only with a token (401 "Requires authentication" anonymously, observed 2026-11-02), so
// the artifact remedy is worded for each.
//
// Presentation only: no 0.1 record holds a remedy and no verdict reads one. Two kinds of caller:
//
// - the claims table of the CLI, the Action's summary and the MCP tool's text print a line under
//   each tests row the record could not settle for one of TESTS_REMEDY_REASONS (remedyFor), and
//   `dunstan template --tests-ci` prints one for the reason it declared no count (remedyForReason);
// - the survey's aggregate carries the line for each reason a claim could not be settled, computed
//   with the context its record names (`selection.reader`), so `dunstan verify` recomputes it. A
//   change to a line is a change to the survey mapping (src/survey/mapping.ts) and bumps its
//   version.
//
// A reason with a variable part (`source_unreadable:<kind>`, `evidence_field_unpopulated:<field>`)
// is looked up whole first, then by its prefix with `*`.

import type { Claim } from '../check/types.js';

export interface RemedyContext {
  // Whether the reads were made with a token.
  hasToken: boolean;
}

export type Remedy = (context: RemedyContext) => string;

export const NO_REMEDY = 'no remedy: the record decides';

const RECIPE = 'docs/ci-test-records.md';

// A line that reads the same for every reader.
function line(text: string): Remedy {
  return () => text;
}
const decided: Remedy = line(NO_REMEDY);

export const REMEDIES: Readonly<Record<string, Remedy>> = {
  // The block (spec section 5). No claim row carries these; the survey counts them per pull request.
  block_missing: line(
    'The report has no dunstan-handback block: declare the claims in one (dunstan template writes it).',
  ),
  block_ambiguous: line('The report has more than one dunstan-handback block: keep exactly one.'),
  block_invalid: line(
    'The block failed validation: check it against spec/schema/handback-block-0.1.schema.json before handing back.',
  ),

  // Unverifiable, a tests row: the record holds no count to compare, or could not read it. These are
  // TESTS_REMEDY_REASONS, the lines the claims table prints under a tests row.
  record_not_found: line(
    `no run of the named workflow at the head uploaded that artifact from that job. Publish the JUnit record from CI (${RECIPE}), then check that the record's workflow, job, artifact and path are the ones the run used: dunstan template --tests-ci fills them.`,
  ),
  no_comparable_record_field: line(
    `this record's kind has nothing Dunstan can compare. Name a junit record a CI run uploaded (${RECIPE}); for a run that left no record in CI, declare {"kind": "local"}.`,
  ),
  local_run_not_in_record: line(
    `these counts are from a local run. Publish the JUnit record from CI (${RECIPE}), and run dunstan template --tests-ci after CI has finished on your last push.`,
  ),
  'source_unreadable:artifact': ({ hasToken }) =>
    hasToken
      ? 'the run uploaded the record, but it could not be read: it expired, was uploaded outside the latest attempt of the named job, the job had not completed, or the file is not well-formed JUnit. Re-run the job to upload it again, or check again once the job completes.'
      : 'GitHub answers an artifact download only with a token (401 without one, even on a public repository). Check again with GITHUB_TOKEN set to a token that can read the repository, with actions: read.',

  // Unverifiable, any other row: the record could not settle the claim.
  record_ambiguous: line('Several runs at the head disagree on the count.'),
  checks_incomplete: line('CI had not finished when the record was read: check again once it has.'),
  no_check_runs: line('There were no check runs at the head: declare checks only where CI runs.'),
  no_succeeded_check_runs: line(
    'No check run at the head succeeded and none failed: nothing ran to settle the claim.',
  ),
  check_runs_not_at_head: line(
    'The check runs were read at another commit: declare the pull request head as headCommit.',
  ),
  file_list_truncated: line(
    'GitHub lists at most 3,000 changed files: split the change, or declare no more than it lists.',
  ),
  closing_link_unsettled: line(
    'GitHub had not yet linked the issue to the open pull request: check again once it has.',
  ),
  closing_base_not_default: line(
    'The pull request merged into a branch other than the default: the issue may close on a later merge.',
  ),
  closing_event_unsettled: line(
    'The issue is closed but its timeline does not yet show who closed it: check again later.',
  ),
  'source_unreadable:*': line('The source did not answer: rerun later or with a token.'),
  'evidence_field_unpopulated:*': line('GitHub answered without the field the claim needs.'),

  // Fail: the record decided the claim; nothing in the record is missing.
  head_mismatch: decided,
  declared_not_changed: decided,
  undeclared_file: decided,
  not_closing: decided,
  not_found: decided,
  not_reachable: decided,
  count_mismatch: decided,
  all_succeeded_mismatch: decided,
  none_failed_mismatch: decided,
  not_merged: decided,
  premature: decided,
  no_deployment: decided,

  // The survey's own reasons for a pull request it has no record of (docs/survey.md).
  pull_request_unreadable: line('The pull request could not be read: rerun later or with a token.'),
  pull_request_moved: line(
    'The pull request moved twice while it was checked: rerun once it holds still.',
  ),
  rate_limited: line(
    'GitHub rate-limited the reads: rerun later, or with a token for a higher limit.',
  ),
  report_unavailable: line(
    'The named report could not be read: the author has no comment on the pull request, or the comments could not be listed.',
  ),
};

// The reasons a tests row prints a remedy for in the claims table, the Action's summary and the MCP
// text. Any other reason prints none there, though it has a line here for the survey.
export const TESTS_REMEDY_REASONS: readonly string[] = [
  'record_not_found',
  'no_comparable_record_field',
  'local_run_not_in_record',
  'source_unreadable:artifact',
];

// The remedy line for a reason in a context, or undefined when there is none.
export function remedyForReason(reason: string, context: RemedyContext): string | undefined {
  const exact = REMEDIES[reason];
  if (exact !== undefined) return exact(context);
  const colon = reason.indexOf(':');
  return colon === -1 ? undefined : REMEDIES[`${reason.slice(0, colon)}:*`]?.(context);
}

// The remedy for one claim row, or undefined: only a tests row (`/tests/<i>/count` or `/failures`)
// that is unverifiable with one of TESTS_REMEDY_REASONS has one. A row that passes or fails gets
// none: a fail is a fact about the work, not a missing record.
export function remedyFor(claim: Claim, context: RemedyContext): string | undefined {
  if (claim.verdict !== 'unverifiable' || claim.reason === undefined) return undefined;
  if (!TESTS_REMEDY_REASONS.includes(claim.reason)) return undefined;
  if (!/^\/tests\/[0-9]+\/(?:count|failures)$/.test(claim.field)) return undefined;
  return remedyForReason(claim.reason, context);
}

// Every line in one context, keyed by reason: what the survey mapping's digest covers.
export function remedyTable(context: RemedyContext): Record<string, string> {
  return Object.fromEntries(Object.entries(REMEDIES).map(([reason, r]) => [reason, r(context)]));
}

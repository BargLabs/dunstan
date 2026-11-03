// The survey record (DRAFT `dunstan-survey-0.1-draft`, spec "DRAFT survey 0.1", docs/survey.md,
// spec/schema/survey-0.1-draft.schema.json): the checker that ran, the selection parameters and the
// pull request listing they were applied to, one entry per selected pull request with the record
// `dunstan check` writes for it (or the reason there is none), the aggregate, and the commands to
// re-run it. Its digest is the SHA-256 of its JCS bytes without the digest member, as a record's
// digests are computed (spec section 10). Everything here is pure, so `dunstan verify` recomputes
// the selection and the aggregate offline.

import type { CheckerIdentity } from '../record/build.js';
import { sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import {
  aggregate,
  type SurveyAggregate,
  type SurveyEntry,
  type SurveyReader,
} from './aggregate.js';

export const SURVEY_FORMAT = 'dunstan-survey-0.1-draft';

// The pulls listing's page size, and the default and largest --last.
export const LISTING_PER_PAGE = 100;
// How many times, at most, the listing is read from its first page (readListing): a page that
// repeats an earlier item abandons its read for a new one, except in the last read allowed.
export const LISTING_READS = 3;
export const DEFAULT_LAST = 30;
export const MAX_LAST = 200;

export type SurveyReportSource = { kind: 'pr-body' } | { kind: 'pr-comment'; author: string };

export interface SurveyParameters {
  repository: string;
  last: number;
  // YYYY-MM-DD, UTC: only pull requests created on or after it.
  since: string | null;
  // Only pull requests opened by these logins (compared without case, as GitHub compares them);
  // empty for any author.
  authors: string[];
  report: SurveyReportSource;
  advisory: boolean;
}

export interface ListedPullRequest {
  number: number;
  createdAt: string;
  author: string | null;
  merged: boolean;
}

// One page of the listing as read: its request, the SHA-256 of its body as received, when it was
// read, how many pull requests it held, how many of those an earlier item of the listing already
// held, and the error when it could not be read. The listing is paginated by offset, newest created
// first, so it can move between two page reads. A pull request created after the last item already
// read that closes meanwhile shifts every later item back by one: the item at the boundary is
// listed again on the next page, and the pull request that closed is not listed. A pull request
// that reopens meanwhile, inside the range already read, shifts the later items forward: the next
// page skips one, with no repeat to show it. Each listed number is kept once (appendListed). A repeat
// abandons the read and the listing is read again from page 1 (Listing.abandoned), so the pull
// request that closed is listed in its place; the last read allowed keeps its repeats.
export interface ListingPage {
  page: number;
  locator: string;
  sha256: string;
  readAt: string;
  items: number;
  duplicates: number;
  error?: string;
}

// Why the listing was read no further: enough pull requests were selected, a pull request created
// before --since was listed (the listing is newest first), a page held fewer than a full page, a
// page could not be read, or the page bound was reached first.
export type ListingEnd =
  | 'selection_full'
  | 'since_reached'
  | 'listing_ended'
  | 'listing_unreadable'
  | 'page_bound';

// `pullRequests` holds each listed number once, at its first occurrence, in listing order;
// `duplicates` is how many listed items repeated an earlier one, the sum of the pages' duplicates,
// so the pages' items are `pullRequests.length + duplicates`. Everything but `abandoned` is of the
// read used, the last one; `abandoned` holds the pages of each read before it, in order, each ended
// at its first page that repeated an earlier item, and contributes nothing to the selection.
export interface Listing {
  pageBound: number;
  pages: ListingPage[];
  abandoned: AbandonedRead[];
  pullRequests: ListedPullRequest[];
  duplicates: number;
  end: ListingEnd;
}

// A read of the listing abandoned at a page that repeated an earlier item: its pages, the last of
// them the one that repeated. Only digests and counts, as for the read used; no pull request list.
export interface AbandonedRead {
  pages: ListingPage[];
}

// Appends a page's items to the listed pull requests, keeping the first occurrence of each number,
// and returns how many of them were already listed.
export function appendListed(
  listed: ListedPullRequest[],
  seen: Set<number>,
  items: readonly ListedPullRequest[],
): number {
  let duplicates = 0;
  for (const item of items) {
    if (seen.has(item.number)) duplicates++;
    else {
      seen.add(item.number);
      listed.push(item);
    }
  }
  return duplicates;
}

export interface SurveyRecord {
  format: typeof SURVEY_FORMAT;
  checker: CheckerIdentity;
  // `reader`: whether GITHUB_TOKEN was set, which words the remedy lines (src/remedy/remedies.ts)
  // and which the summary states. The token is never recorded.
  selection: {
    parameters: SurveyParameters;
    reader: SurveyReader;
    listing: Listing;
    selected: number[];
  };
  entries: SurveyEntry[];
  aggregate: SurveyAggregate;
  rerun: { offline: string; online: string };
  digest: { sha256: string };
}

const sinceStart = (since: string) => `${since}T00:00:00Z`;

// The selected pull requests, newest first: --since and --author applied to the listing, then the
// first --last of what is left. The collector's listing holds each number once (Listing); a number
// a hand-edited listing repeats is still selected only at its first occurrence, and verify names
// the repeat.
export function selectPullRequests(
  parameters: SurveyParameters,
  listed: readonly ListedPullRequest[],
): number[] {
  const authors = new Set(parameters.authors.map((a) => a.toLowerCase()));
  const seen = new Set<number>();
  return listed
    .filter((pr) => {
      if (seen.has(pr.number)) return false;
      seen.add(pr.number);
      return true;
    })
    .filter((pr) => parameters.since === null || pr.createdAt >= sinceStart(parameters.since))
    .filter(
      (pr) => authors.size === 0 || (pr.author !== null && authors.has(pr.author.toLowerCase())),
    )
    .slice(0, parameters.last)
    .map((pr) => pr.number);
}

// Whether the listing, read this far, is read far enough, and why; null to read the next page. The
// collector asks after each page, and verify asks again of every prefix of the recorded pages.
export function listingStop(
  parameters: SurveyParameters,
  pages: readonly ListingPage[],
  listed: readonly ListedPullRequest[],
): Exclude<ListingEnd, 'page_bound'> | null {
  const last = pages.at(-1);
  if (last === undefined) return null;
  if (last.error !== undefined) return 'listing_unreadable';
  if (selectPullRequests(parameters, listed).length >= parameters.last) return 'selection_full';
  const since = parameters.since;
  if (since !== null && listed.some((pr) => pr.createdAt < sinceStart(since))) {
    return 'since_reached';
  }
  if (last.items < LISTING_PER_PAGE) return 'listing_ended';
  return null;
}

export function surveyCommand(parameters: SurveyParameters, out: string): string {
  const words = [
    'dunstan',
    'survey',
    '--repo',
    parameters.repository,
    '--last',
    `${parameters.last}`,
  ];
  if (parameters.since !== null) words.push('--since', parameters.since);
  for (const author of parameters.authors) words.push('--author', author);
  if (parameters.report.kind === 'pr-comment') {
    words.push('--report-comment-author', parameters.report.author);
  }
  if (parameters.advisory) words.push('--advisory');
  words.push('--out', out);
  return words.join(' ');
}

export function surveyRerun(
  parameters: SurveyParameters,
  out: string,
): { offline: string; online: string } {
  return { offline: `dunstan verify ${out}`, online: surveyCommand(parameters, out) };
}

export function surveyDigest(record: Omit<SurveyRecord, 'digest'> | SurveyRecord): string {
  const { digest: _, ...rest } = record as SurveyRecord;
  return sha256Canonical(rest as unknown as JsonValue);
}

export interface BuildSurveyInput {
  checker: CheckerIdentity;
  parameters: SurveyParameters;
  reader: SurveyReader;
  listing: Listing;
  entries: SurveyEntry[];
  out: string;
}

export function buildSurveyRecord(input: BuildSurveyInput): SurveyRecord {
  const unsigned: Omit<SurveyRecord, 'digest'> = {
    format: SURVEY_FORMAT,
    checker: input.checker,
    selection: {
      parameters: input.parameters,
      reader: { authenticated: input.reader.authenticated },
      listing: input.listing,
      selected: selectPullRequests(input.parameters, input.listing.pullRequests),
    },
    entries: input.entries,
    aggregate: aggregate(
      input.entries,
      input.listing.pullRequests.length,
      input.parameters.advisory,
      input.reader,
    ),
    rerun: surveyRerun(input.parameters, input.out),
  };
  return { ...unsigned, digest: { sha256: surveyDigest(unsigned) } };
}

export function serializeSurvey(record: SurveyRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function isSurveyRecord(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { format?: unknown }).format === SURVEY_FORMAT
  );
}

// The survey's reads (DRAFT, docs/survey.md): the closed pull requests listing, newest first, page
// by page up to the listings' bound, and for each selected pull request exactly the check
// `dunstan check` runs (checkPullRequest), each with a client of its own so no source of one pull
// request enters another's record. Every read is a GET, except the fixed GraphQL queries the check
// already makes. No selected pull request is dropped: one the check cannot write a record for gets
// an entry with the reason.

import { MAX_PAGES, PullRequestMoved, PullRequestUnreadable } from '../evidence/github.js';
import { GitHubClient } from '../evidence/http.js';
import {
  type Report,
  ReportUnavailable,
  reportFromComment,
  reportFromPullRequestBody,
} from '../evidence/report.js';
import type { CheckerIdentity } from '../record/build.js';
import { sha256Hex } from '../spec/jcs.js';
import type { NoRecordReason, SurveyEntry } from '../survey/aggregate.js';
import {
  appendListed,
  buildSurveyRecord,
  LISTING_PER_PAGE,
  type ListedPullRequest,
  type Listing,
  type ListingEnd,
  type ListingPage,
  listingStop,
  type SurveyParameters,
  type SurveyRecord,
  selectPullRequests,
} from '../survey/record.js';
import { checkPullRequest, githubReaders } from './check-pull-request.js';

// The file name `dunstan check` writes a record under when none is named (src/cli/check.ts), which
// an embedded record's rerun commands name: extracted to that file, it verifies and reruns as one.
const recordFileName = (repository: string, number: number) =>
  `dunstan-${repository.replace('/', '-')}-${number}.json`;

export interface SurveyInput {
  parameters: SurveyParameters;
  checker: CheckerIdentity;
  // The survey record's file name, which its rerun commands name.
  out: string;
  token?: string | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  warn?: (message: string) => void;
  // The listing's page bound: MAX_PAGES unless a test gives a lower one.
  pageBound?: number;
}

// Whether GitHub answered as a rate limit does (spec section 6; src/evidence/http.ts retries these
// and records the read failed when it gives up).
function rateLimited(response: Response): boolean {
  const s = response.status;
  return (
    s === 429 ||
    (s === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.get('retry-after') !== null))
  );
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// One listing item, as the survey records it; null when it is not the documented shape.
function listedOf(item: unknown): ListedPullRequest | null {
  if (item === null || typeof item !== 'object') return null;
  const pr = item as Record<string, unknown>;
  const createdAt = str(pr.created_at);
  if (
    typeof pr.number !== 'number' ||
    !Number.isSafeInteger(pr.number) ||
    pr.number < 1 ||
    createdAt === null ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(createdAt)
  ) {
    return null;
  }
  const user = pr.user as Record<string, unknown> | null | undefined;
  const login = str(user?.login);
  return {
    number: pr.number,
    createdAt,
    author: login === '' ? null : login,
    merged: pr.merged_at !== null && pr.merged_at !== undefined,
  };
}

// A pull request a page lists again (Listing) is recorded once, at its first occurrence, and counted
// in that page's duplicates, so it is selected, checked and counted once.
export async function readListing(
  client: GitHubClient,
  parameters: SurveyParameters,
  now: () => Date,
  pageBound: number,
): Promise<Listing> {
  const pages: ListingPage[] = [];
  const pullRequests: ListedPullRequest[] = [];
  const seen = new Set<number>();
  const done = (end: ListingEnd): Listing => ({
    pageBound,
    pages,
    pullRequests,
    duplicates: pages.reduce((sum, p) => sum + p.duplicates, 0),
    end,
  });
  for (let page = 1; page <= pageBound; page++) {
    const path = `/repos/${parameters.repository}/pulls?state=closed&sort=created&direction=desc&per_page=${LISTING_PER_PAGE}&page=${page}`;
    const read = await client.read('pull_request', path, { record: false });
    const entry: ListingPage = {
      page,
      locator: `GET ${path}`,
      sha256: sha256Hex(read.body),
      readAt: now().toISOString(),
      items: 0,
      duplicates: 0,
    };
    if (!read.ok) {
      entry.error = read.error;
    } else {
      const items = Array.isArray(read.json) ? read.json.map(listedOf) : null;
      if (items === null || items.some((i) => i === null)) entry.error = 'parse';
      else {
        entry.items = items.length;
        entry.duplicates = appendListed(pullRequests, seen, items as ListedPullRequest[]);
      }
    }
    pages.push(entry);
    const end = listingStop(parameters, pages, pullRequests);
    if (end !== null) return done(end);
  }
  return done('page_bound');
}

export async function survey(input: SurveyInput): Promise<SurveyRecord> {
  const { parameters } = input;
  const now = input.now ?? (() => new Date());
  // The paths GitHub rate-limited, so a read that gave up on one is told apart from one that failed.
  const limited = new Set<string>();
  const baseFetch = input.fetch ?? fetch;
  const watched = (async (resource: string | URL | Request, init?: RequestInit) => {
    const response = await baseFetch(resource, init);
    if (rateLimited(response)) {
      const url =
        typeof resource === 'string'
          ? resource
          : resource instanceof URL
            ? resource.href
            : resource.url;
      limited.add(new URL(url).pathname);
    }
    return response;
  }) as typeof fetch;
  const newClient = () =>
    new GitHubClient({
      token: input.token,
      fetch: watched,
      now,
      ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
      ...(input.warn === undefined ? {} : { warn: input.warn }),
    });

  const listingClient = newClient();
  // Every client here is made with the same token, so the listing's says whether the reads had one.
  const reader = { authenticated: listingClient.hasToken };
  const listing = await readListing(listingClient, parameters, now, input.pageBound ?? MAX_PAGES);
  const entries: SurveyEntry[] = [];
  for (const number of selectPullRequests(parameters, listing.pullRequests)) {
    const client = newClient();
    const repository = parameters.repository;
    const pullPath = `/repos/${repository}/pulls/${number}`;
    const commentsPath = `/repos/${repository}/issues/${number}/comments`;
    const report = parameters.report;
    try {
      const record = await checkPullRequest({
        readers: githubReaders(client),
        repository,
        number,
        report: async (pr): Promise<Report> =>
          report.kind === 'pr-body'
            ? reportFromPullRequestBody(pr.repository, pr)
            : reportFromComment(client, pr.repository, number, report.author),
        checker: input.checker,
        recordFile: recordFileName(repository, number),
        advisory: parameters.advisory,
      });
      entries.push({ pullRequest: number, record });
    } catch (e) {
      let reason: NoRecordReason;
      if (e instanceof PullRequestMoved) reason = 'pull_request_moved';
      else if (e instanceof PullRequestUnreadable) {
        reason = limited.has(pullPath) ? 'rate_limited' : 'pull_request_unreadable';
      } else if (e instanceof ReportUnavailable) {
        reason = limited.has(commentsPath) ? 'rate_limited' : 'report_unavailable';
      } else throw e;
      entries.push({ pullRequest: number, record: null, reason });
    }
  }
  return buildSurveyRecord({
    checker: input.checker,
    parameters,
    reader,
    listing,
    entries,
    out: input.out,
  });
}

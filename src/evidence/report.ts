// Reads the report the invocation names (spec section 3: which text is the report is decided by the
// invocation, never guessed). The report is not evidence: its reads are not recorded as sources, and
// the record keeps only its digest.

import type { ReportSourceKind } from '../record/build.js';
import { MAX_PAGES, PER_PAGE, type PullRequestRead } from './github.js';
import type { GitHubClient } from './http.js';

export class ReportUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportUnavailable';
  }
}

export interface Report {
  bytes: Uint8Array;
  source: { kind: ReportSourceKind; locator: string };
}

// The pull request body as the API returned it, encoded as UTF-8. A pull request with no body has an
// empty report, which carries no block.
export function reportFromPullRequestBody(repository: string, pr: PullRequestRead): Report {
  return {
    bytes: new TextEncoder().encode(pr.body ?? ''),
    source: {
      kind: 'pr-body',
      locator: `GET /repos/${repository}/pulls/${pr.evidence.number}#body`,
    },
  };
}

// The most recent issue comment on the pull request by `login` (latest created_at, then highest id).
// The locator names the comment, so a re-run of the record never re-resolves which comment it was.
// The listing has the evidence listings' bound. It does not page through readAllPages, which records
// each page as a source and keeps no reason for a failure: the report is not evidence, and its error
// says why it could not be read.
export async function reportFromComment(
  client: GitHubClient,
  repository: string,
  number: number,
  login: string,
): Promise<Report> {
  let latest: { id: number; createdAt: string; body: string } | undefined;
  for (let page = 1; ; page++) {
    // A listing that reaches the bound has not ended, and the latest comment may lie beyond it.
    if (page > MAX_PAGES) {
      throw new ReportUnavailable(
        `cannot list comments on ${repository}#${number} (more than ${MAX_PAGES} pages)`,
      );
    }
    const read = await client.read(
      'pull_request',
      `/repos/${repository}/issues/${number}/comments?per_page=${PER_PAGE}&page=${page}`,
      { record: false },
    );
    if (!read.ok) {
      throw new ReportUnavailable(
        `cannot list comments on ${repository}#${number} (${read.error})`,
      );
    }
    if (!Array.isArray(read.json))
      throw new ReportUnavailable('comments answered in an unexpected shape');
    for (const item of read.json as Record<string, unknown>[]) {
      const user = item.user as Record<string, unknown> | null | undefined;
      if (typeof user?.login !== 'string' || user.login.toLowerCase() !== login.toLowerCase())
        continue;
      const id = item.id as number;
      const createdAt = item.created_at as string;
      if (
        latest === undefined ||
        createdAt > latest.createdAt ||
        (createdAt === latest.createdAt && id > latest.id)
      ) {
        latest = { id, createdAt, body: typeof item.body === 'string' ? item.body : '' };
      }
    }
    if (read.json.length < PER_PAGE) break;
  }
  if (latest === undefined) {
    throw new ReportUnavailable(`${login} has no comment on ${repository}#${number}`);
  }
  return {
    bytes: new TextEncoder().encode(latest.body),
    source: {
      kind: 'pr-comment',
      locator: `GET /repos/${repository}/issues/comments/${latest.id}#body`,
    },
  };
}

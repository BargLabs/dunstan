// A fake GitHub for surveys: the closed pull requests listing, and one fake-github.ts scenario per
// listed pull request, each answering the reads of its own pull request. A request is routed to the
// pull request it is about: by number, by head commit, by workflow run or by artifact. Anything no
// pull request owns goes to a shared scenario (issues, commits and repositories a reference names).
// Every request is logged, with its method, so a test can assert the survey only reads.

import { fakeGitHub, REPO, type Scenario } from './fake-github.js';

export interface ListedFixture {
  number: number;
  createdAt: string;
  author: string;
  merged: boolean;
  // The pull request's own reads. Absent: the listing names it and every read of it answers 404.
  scenario?: Scenario;
  // Every read of the pull request answers as a rate limit that resets far too late to wait for.
  rateLimited?: boolean;
}

export interface SurveyWorld {
  pullRequests: ListedFixture[];
  shared?: Omit<Scenario, 'pr'>;
  // Artifact downloads that answer 401 to a request without a token, as GitHub answers an
  // anonymous reader, even on a public repository.
  authenticatedArtifacts?: number[];
  // Artifact downloads that answer 401 whatever the request carries: the answer an anonymous
  // reader gets, planted on one pull request of a survey read with a token.
  anonymousArtifacts?: number[];
  // Listing pages that answer this HTTP status.
  listingStatus?: Record<number, number>;
  // Listing pages that start this many items earlier than their offset, as a page does after that
  // many pull requests closed between its read and the one before: it repeats the previous page's
  // last items.
  listingShift?: Record<number, number>;
}

export interface FakeSurvey {
  fetch: typeof fetch;
  requests: string[];
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', etag: `"${status}"`, ...headers },
  });
}

export function fakeSurvey(world: SurveyWorld): FakeSurvey {
  const requests: string[] = [];
  const owners = world.pullRequests.map((p) => ({
    fixture: p,
    fake: p.scenario === undefined ? undefined : fakeGitHub(p.scenario),
  }));
  const shared = fakeGitHub({ ...(world.shared ?? {}), pr: { number: 0 } });
  const base = `/repos/${REPO}`;
  const head = (o: (typeof owners)[number]) =>
    (o.fixture.scenario?.pr.head as { sha?: string } | undefined)?.sha;
  const byNumber = (n: number) => owners.find((o) => o.fixture.number === n);
  const byHead = (sha: string | null | undefined) => owners.find((o) => head(o) === sha);
  const byRun = (id: number) =>
    owners.find((o) => (o.fixture.scenario?.workflowRuns ?? []).some((r) => r.id === id));
  const byArtifact = (id: number) =>
    owners.find((o) =>
      Object.values(o.fixture.scenario?.artifacts ?? {}).some((list) =>
        list.some((a) => a.id === id),
      ),
    );

  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const path = url.pathname;
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${path}${url.search}`);

    if (path === `${base}/pulls`) {
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const status = world.listingStatus?.[pageNumber];
      if (status !== undefined) return json(status, { message: 'error' });
      const perPage = Number(url.searchParams.get('per_page') ?? '30');
      const start = (pageNumber - 1) * perPage - (world.listingShift?.[pageNumber] ?? 0);
      const listed = [...world.pullRequests]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .slice(start, start + perPage)
        .map((p) => ({
          number: p.number,
          state: 'closed',
          created_at: p.createdAt,
          merged_at: p.merged ? p.createdAt : null,
          user: { login: p.author },
        }));
      return json(200, listed);
    }

    let owner: (typeof owners)[number] | undefined;
    const pull =
      /^\/repos\/[^/]+\/[^/]+\/pulls\/([0-9]+)(?:\/files)?$/.exec(path) ??
      /^\/repos\/[^/]+\/[^/]+\/issues\/([0-9]+)\/comments$/.exec(path);
    const checkRuns = /\/commits\/([0-9a-f]{40})\/check-runs$/.exec(path);
    const run = /\/actions\/runs\/([0-9]+)\/(?:jobs|artifacts)$/.exec(path);
    const zip = /\/actions\/artifacts\/([0-9]+)\/zip$/.exec(path);
    if (pull !== null) {
      owner = byNumber(Number(pull[1]));
      if (owner?.fixture.rateLimited === true) {
        return json(
          403,
          { message: 'API rate limit exceeded' },
          { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '9999999999' },
        );
      }
      if (owner?.fake === undefined) return json(404, { message: 'Not Found' });
    } else if (path === '/graphql') {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        query?: string;
        variables?: { number?: number; expression?: string };
      };
      const v = body.variables ?? {};
      if (body.query?.includes('object(expression') === true) {
        owner = byHead(v.expression?.split(':')[0]);
      } else if (body.query?.includes('issueOrPullRequest') !== true && v.number !== undefined) {
        owner = byNumber(v.number);
      }
    } else if (checkRuns !== null) {
      owner = byHead(checkRuns[1]);
    } else if (/\/actions\/(?:workflows\/[^/]+\/)?runs$/.test(path)) {
      owner = byHead(url.searchParams.get('head_sha'));
    } else if (run !== null) {
      owner = byRun(Number(run[1]));
    } else if (zip !== null) {
      const id = Number(zip[1]);
      const anonymous = new Headers(init?.headers).get('authorization') === null;
      if (
        world.anonymousArtifacts?.includes(id) === true ||
        (anonymous && world.authenticatedArtifacts?.includes(id) === true)
      ) {
        return json(401, { message: 'Requires authentication' });
      }
      owner = byArtifact(id);
    }
    const answer = owner?.fake ?? shared;
    return answer.fetch(input, init);
  };
  return { fetch: fake as typeof fetch, requests };
}

// The hosted tier's only path to the network. Every request the Worker makes, the evidence reader's
// and the GitHub App's own, goes through `GuardedTransport.fetch`, which checks it against a fixed
// allowlist of GitHub API routes before anything is sent. A request that matches no route, or that
// names a route which reads repository contents (a blob, a tree, `contents/`, a readme, an archive,
// a tarball or zipball, raw content), is refused and never made.
//
// The App holds Contents: read because GitHub requires it for the git-database commit and compare
// endpoints (docs/hosted.md, "Contents: read"). This guard is what keeps that permission to commit
// existence and ancestry, and the type of the object at a path: no route that returns a file's
// contents is on the list, and the two GraphQL routes admit only their own fixed query.

import { CLOSING_QUERY, isPathExpression, PATH_QUERY } from '../../src/evidence/github.js';

export const GITHUB_API_ORIGIN = 'https://api.github.com';

// The platform fetch. This module is the only hosted code that names the global, and the Worker
// hands it to nothing but a GuardedTransport (hosted/test/transport.test.ts checks both).
export const platformFetch: typeof fetch = (input, init) => fetch(input, init);

export class RouteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteRefused';
  }
}

export interface Route {
  name: string;
  method: 'GET' | 'POST';
  path: RegExp;
  // The artifact download answers with a redirect to Actions storage, which is followed here.
  followsRedirect?: boolean;
  body?: (text: string) => boolean;
}

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const NAME = '[A-Za-z0-9._-]{1,100}';
const REPO = `${OWNER}/${NAME}`;
const NUM = '[1-9][0-9]{0,15}';
const SHA = '[0-9a-f]{40}';
const PAGE = `per_page=100&page=${NUM}`;
// One encodeURIComponent output: a workflow file name, an artifact or environment name.
const ENCODED = "[A-Za-z0-9\\-_.!~*'()%]{1,300}";

function route(name: string, method: Route['method'], path: string, extra: Partial<Route> = {}) {
  return { name, method, path: new RegExp(`^${path}$`), ...extra };
}

// The variables of a body that is exactly `{query, variables}` with this query, as JSON.stringify
// writes it (so no duplicate member, which parsers resolve differently), or null.
function fixedQueryVariables(text: string, fixed: string): Record<string, unknown> | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object' || JSON.stringify(body) !== text) return null;
  const { query, variables, ...rest } = body as Record<string, unknown>;
  if (query !== fixed || Object.keys(rest).length > 0) return null;
  if (variables === null || typeof variables !== 'object') return null;
  return variables as Record<string, unknown>;
}

// Exactly the body the reader sends: the closing-references query and its four variables.
function isClosingReferencesQuery(text: string): boolean {
  const v = fixedQueryVariables(text, CLOSING_QUERY);
  return (
    v !== null &&
    Object.keys(v).join(',') === 'owner,name,number,after' &&
    typeof v.owner === 'string' &&
    typeof v.name === 'string' &&
    Number.isSafeInteger(v.number) &&
    (v.after === null || typeof v.after === 'string')
  );
}

// Exactly the body the advisory's path query sends (comparison 0.3.0): the query, which asks for
// the type of the object at `<head>:<path>` and nothing else, and its three variables, the
// expression a full commit id and a repository path.
function isPathQuery(text: string): boolean {
  const v = fixedQueryVariables(text, PATH_QUERY);
  return (
    v !== null &&
    Object.keys(v).join(',') === 'owner,name,expression' &&
    typeof v.owner === 'string' &&
    typeof v.name === 'string' &&
    typeof v.expression === 'string' &&
    isPathExpression(v.expression)
  );
}

// Every route the hosted Worker may call. The evidence routes are exactly the reads
// src/evidence/github.ts makes (spec section 6); the last two are the App's own.
export const ROUTES: readonly Route[] = [
  route('pull request', 'GET', `/repos/${REPO}/pulls/${NUM}`),
  route('pull request files', 'GET', `/repos/${REPO}/pulls/${NUM}/files\\?${PAGE}`),
  route('closing references (GraphQL)', 'POST', '/graphql', { body: isClosingReferencesQuery }),
  route('object type at a path (GraphQL)', 'POST', '/graphql', { body: isPathQuery }),
  route('repository', 'GET', `/repos/${REPO}`),
  route('issue', 'GET', `/repos/${REPO}/issues/${NUM}`),
  route('commit (git database)', 'GET', `/repos/${REPO}/git/commits/${SHA}`),
  route('compare', 'GET', `/repos/${REPO}/compare/${SHA}\\.\\.\\.${SHA}\\?per_page=1`),
  route('check runs', 'GET', `/repos/${REPO}/commits/${SHA}/check-runs\\?filter=latest&${PAGE}`),
  route(
    'workflow runs',
    'GET',
    `/repos/${REPO}/actions/workflows/${ENCODED}/runs\\?head_sha=${SHA}&${PAGE}`,
  ),
  route(
    'workflow run jobs',
    'GET',
    `/repos/${REPO}/actions/runs/${NUM}/jobs\\?filter=latest&${PAGE}`,
  ),
  route(
    'workflow run artifacts',
    'GET',
    `/repos/${REPO}/actions/runs/${NUM}/artifacts\\?name=${ENCODED}&${PAGE}`,
  ),
  route('artifact download', 'GET', `/repos/${REPO}/actions/artifacts/${NUM}/zip`, {
    followsRedirect: true,
  }),
  route(
    'deployments',
    'GET',
    `/repos/${REPO}/deployments\\?environment=${ENCODED}(?:&sha=${SHA})?&${PAGE}`,
  ),
  route('deployment statuses', 'GET', `/repos/${REPO}/deployments/${NUM}/statuses\\?${PAGE}`),
  route('installation access token', 'POST', `/app/installations/${NUM}/access_tokens`),
  route('installation', 'GET', `/app/installations/${NUM}`),
];

// Routes that read repository contents. Each is refused by name, before the allowlist is consulted,
// so a future allowlist entry cannot admit one by accident. Under /repos/{owner}/{repo} they are
// matched after the repository, so a repository named `archive` or `raw` is still readable.
export const FORBIDDEN: readonly { name: string; path: RegExp }[] = [
  { name: 'git blob', path: /\/git\/blobs(?:\/|$)/i },
  { name: 'git tree', path: /\/git\/trees(?:\/|$)/i },
  { name: 'contents', path: /\/contents(?:\/|$)/i },
  { name: 'readme', path: /\/readme(?:\/|$)/i },
  { name: 'archive', path: /\/archive(?:\/|$)/i },
  { name: 'tarball', path: /\/tarball(?:\/|$)/i },
  { name: 'zipball', path: /\/zipball(?:\/|$)/i },
  { name: 'raw content', path: /\/raw(?:\/|$)/i },
];

// Where an artifact download may redirect: GitHub Actions' artifact storage.
const REDIRECT_HOSTS = [/\.actions\.githubusercontent\.com$/, /\.blob\.core\.windows\.net$/];
const MAX_REDIRECTS = 3;

function isDotSegment(segment: string): boolean {
  const decoded = segment.replace(/%2e/gi, '.');
  return decoded === '.' || decoded === '..';
}

// The one media type a request may ask for. Others turn metadata routes into content: a pull
// request read as `application/vnd.github.diff` is its diff, a commit as `.patch` its patch.
export const MEDIA_TYPE = 'application/vnd.github+json';

// The route a request to `rawUrl` may take, or a RouteRefused naming why not. The URL is checked as
// written, before parsing: a parser resolves dot segments and backslashes, so `/repos/a/../issues/1`
// would otherwise be checked as the different route it normalises to.
export function checkRoute(
  method: string,
  rawUrl: string,
  body: string | undefined,
  accept: string | null,
): Route {
  const written = /^https:\/\/api\.github\.com(\/[^?#]*)(\?[^#]*)?$/.exec(rawUrl);
  if (written === null) throw new RouteRefused(`${method} ${rawUrl}: not the GitHub API`);
  const path = written[1] as string;
  const target = `${path}${written[2] ?? ''}`;
  // Encoded separators, backslashes and dot segments could make GitHub route a request somewhere
  // its text does not say.
  if (/%2f|%5c|\\/i.test(path) || path.split('/').some(isDotSegment)) {
    throw new RouteRefused(`${method} ${target}: encoded separator or dot segment`);
  }
  const url = new URL(rawUrl);
  if (url.origin !== GITHUB_API_ORIGIN || `${url.pathname}${url.search}` !== target) {
    throw new RouteRefused(`${method} ${target}: the URL normalises to another request`);
  }
  if (accept !== MEDIA_TYPE) {
    throw new RouteRefused(`${method} ${target}: media type ${accept} is not ${MEDIA_TYPE}`);
  }
  const scoped = /^\/repos\/[^/]+\/[^/]+(\/.*)?$/.exec(path);
  const routePart = scoped === null ? path : (scoped[1] ?? '');
  for (const forbidden of FORBIDDEN) {
    if (forbidden.path.test(routePart)) {
      throw new RouteRefused(`${method} ${target}: ${forbidden.name} reads repository contents`);
    }
  }
  // Two routes share POST /graphql; each admits only its own fixed body.
  const routes = ROUTES.filter((r) => r.method === method && r.path.test(target));
  if (routes.length === 0) throw new RouteRefused(`${method} ${target}: not on the allowlist`);
  const match = routes.find(
    (r) => r.body === undefined || (body !== undefined && r.body(body) === true),
  );
  if (match === undefined) {
    throw new RouteRefused(`${method} ${target}: request body is not the one allowed`);
  }
  if (match.body === undefined && body !== undefined && method === 'GET') {
    throw new RouteRefused(`${method} ${target}: a GET carries no body`);
  }
  return match;
}

function checkRedirect(location: URL): void {
  if (location.protocol !== 'https:' || !REDIRECT_HOSTS.some((h) => h.test(location.hostname))) {
    throw new RouteRefused(`redirect to ${location.origin}: not Actions artifact storage`);
  }
}

function bodyText(body: RequestInit['body']): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  throw new RouteRefused('only a string request body is allowed');
}

export class GuardedTransport {
  // Every refusal, so the caller can fail the request even when a reader would have recorded the
  // refusal as an unreadable source.
  readonly refused: string[] = [];
  readonly #network: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;

  // `network` is the platform fetch. Nothing else in the hosted code is given it.
  constructor(
    network: typeof fetch,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.#network = network;
    this.#sleep = sleep;
  }

  // The evidence reader's backoff. The reader retries a failed fetch as a network error; after a
  // refusal it stops at once instead, and the refusal propagates out of the read.
  readonly sleep = (ms: number): Promise<void> =>
    this.refused.length > 0
      ? Promise.reject(new RouteRefused(this.refused[0] as string))
      : this.#sleep(ms);

  #refuse(e: unknown): never {
    if (e instanceof RouteRefused) this.refused.push(e.message);
    throw e;
  }

  readonly fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (input instanceof Request) this.#refuse(new RouteRefused('pass a URL, not a Request'));
    let route: Route;
    let url: URL;
    const method = (init?.method ?? 'GET').toUpperCase();
    try {
      const accept = new Headers(init?.headers).get('accept');
      route = checkRoute(method, String(input), bodyText(init?.body), accept);
      url = new URL(String(input));
    } catch (e) {
      this.#refuse(e);
    }
    let response = await this.#network(url.href, { ...init, method, redirect: 'manual' });
    for (let hop = 0; route.followsRedirect === true && isRedirect(response.status); hop++) {
      const location = response.headers.get('location');
      if (hop === MAX_REDIRECTS || location === null) break;
      const next = new URL(location, url);
      try {
        checkRedirect(next);
      } catch (e) {
        this.#refuse(e);
      }
      // Storage is addressed by a signed URL; the GitHub token is not sent to it.
      response = await this.#network(next.href, { method: 'GET', redirect: 'manual' });
    }
    return response;
  }) as typeof fetch;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

// Reads who closed each `closes` target of study 2, and writes erratum-1/closers.json. Operator-run.
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/erratum-1/tools/closers.mjs
//
// The rows are every advisory of runs/index.json whose claim is a `closes` relation or whose note,
// under either instrument, is differs:not_closing. Each row's target is the claim's value in the
// baseline record under the git-ignored .work/records/, checked against runs/baseline.seal.json; a
// bare `#n` names an issue or pull request of the row's own repository.
//
// For each target, GraphQL repository.issueOrPullRequest(number): its type, number and repository
// as GitHub resolves them, its state and (an issue's) stateReason, and every ClosedEvent: createdAt,
// actor.login and the closer, a pull request (number and repository) or a commit (oid). For each
// row's pull request: state, baseRefName, the repository's default branch, merged, mergedAt,
// mergeCommit.oid and every commit oid. The fields checker 0.1.7 reads are the ones its
// CLOSE_BASE_QUERY and CLOSE_EVENTS_QUERY ask for (src/evidence/github.ts), within the same page
// budget for close events; the others are for the operator. A connection read past its page budget,
// a commit list shorter than its totalCount, or an answer with any GraphQL error beside its data
// marks its rows incomplete, and an incomplete read keeps no events or commits; nothing is guessed.
//
// DUNSTAN_READ_TOKEN is sent as a bearer token and is never written anywhere. The first response's
// X-OAuth-Scopes header is the token's scope check: a classic token with any scope that is not
// read:* is refused before any target is read. A fine-grained or app token sends no such header,
// and closers.json says so; whatever the token, the tool posts only its three fixed queries. The
// tool refuses to overwrite closers.json, and copies no text.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  flags,
  isClosesRow,
  isMain,
  paths,
  readJson,
  sha256,
  splitRef,
  writeJson,
} from './common.mjs';

const GRAPHQL = 'https://api.github.com/graphql';
const TOOL = 'experiments/open-source-advisory-2026-10-study2/erratum-1/tools/closers.mjs';

export const PAGE_SIZE = 100;
// GitHub lists at most 250 commits of a pull request; three pages of 100 hold them. Ten pages of
// close events is checker 0.1.7's budget (CLOSE_EVENT_PAGES in src/evidence/github.ts).
export const PAGE_BUDGET = Object.freeze({ commits: 3, closedEvents: 10 });

export const PR_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    defaultBranchRef { name }
    pullRequest(number: $number) {
      number
      state
      baseRefName
      merged
      mergedAt
      mergeCommit { oid }
      commits(first: ${PAGE_SIZE}, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { commit { oid } }
      }
    }
  }
}`;

// No totalCount: whether it counts the filtered item types is not observed, so the read ends on
// hasNextPage, as checker 0.1.7's does.
const CLOSED = `timelineItems(itemTypes: [CLOSED_EVENT], first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          ... on ClosedEvent {
            createdAt
            actor { login }
            closer {
              __typename
              ... on PullRequest { number repository { nameWithOwner } }
              ... on Commit { oid }
            }
          }
        }
      }`;

export const TARGET_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue {
        number
        repository { nameWithOwner }
        state
        stateReason
        ${CLOSED}
      }
      ... on PullRequest {
        number
        repository { nameWithOwner }
        state
        ${CLOSED}
      }
    }
  }
}`;

export const SCOPE_QUERY = 'query { rateLimit { limit } }';

const QUERIES = Object.freeze([SCOPE_QUERY, PR_QUERY, TARGET_QUERY]);

export class HttpError extends Error {
  constructor(status, body) {
    super(`POST /graphql: HTTP ${status} ${body.slice(0, 300)}`);
    this.status = status;
  }
}

// POST one GraphQL query with the read-only token. A rate limit is a wait, not a result; anything
// else that is not 2xx throws. Returns the body and the X-OAuth-Scopes header (null when absent).
export async function githubGraphql(query, variables = {}) {
  const token = process.env.DUNSTAN_READ_TOKEN;
  if (!token) throw new Error('DUNSTAN_READ_TOKEN is not set');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'barglabs-dunstan-study',
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    const limited =
      (res.status === 403 || res.status === 429 || /RATE_LIMITED/.test(text)) &&
      /rate limit/i.test(text) &&
      attempt < 4;
    if (limited) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      const wait = retryAfter || (reset ? Math.max(reset - Date.now(), 0) + 1000 : 60_000);
      process.stderr.write(`rate limited; waiting ${Math.ceil(wait / 1000)}s\n`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new HttpError(res.status, text);
    return { body: JSON.parse(text), scopes: res.headers.get('x-oauth-scopes') };
  }
}

// The token's scope check, from the X-OAuth-Scopes header of one response.
export function scopeCheck(header) {
  if (header === null || header === undefined) {
    return {
      scopes: null,
      check:
        'no X-OAuth-Scopes header: a fine-grained or app token, whose permissions the API does not list',
    };
  }
  const scopes = header
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const write = scopes.filter((s) => !s.startsWith('read:'));
  if (write.length > 0) {
    throw new Error(`DUNSTAN_READ_TOKEN has scope ${write.join(', ')}; only read:* is accepted`);
  }
  return { scopes, check: 'classic token with read:* scopes only' };
}

// The rows: each closes advisory of the index, with its claimed target from the sealed baseline
// record.
export function closesRows(p = paths()) {
  const index = readJson(p.index);
  const seal = readJson(p.seal('baseline'));
  const entries = new Map(seal.records.map((r) => [r.pr, r]));
  const rows = [];
  for (const pr of index.prs) {
    const wanted = pr.advisories.filter(isClosesRow);
    if (wanted.length === 0) continue;
    const entry = entries.get(pr.pr);
    if (entry?.file === undefined) throw new Error(`${pr.pr} has no sealed baseline record`);
    const bytes = readFileSync(join(p.records, 'baseline', entry.file));
    if (sha256(bytes) !== entry.sha256) {
      throw new Error(`baseline/${entry.file} is not the record the seal holds`);
    }
    const advisories = JSON.parse(bytes.toString('utf8')).predicate.advisory.advisories;
    for (const a of wanted) {
      const i = Number(a.advisoryId.slice(a.advisoryId.lastIndexOf(':') + 1));
      const full = advisories[i];
      if (full?.kind !== a.kind)
        throw new Error(`${a.advisoryId}: the record's kind is not the index's`);
      if (
        typeof full.value !== 'string' ||
        !/^([^/#\s]+\/[^/#\s]+)?#[1-9][0-9]*$/.test(full.value)
      ) {
        throw new Error(`${a.advisoryId}: the claimed target is not <owner>/<repo>#<n> or #<n>`);
      }
      const repository = pr.pr.slice(0, pr.pr.lastIndexOf('#'));
      rows.push({
        pr: pr.pr,
        advisoryId: a.advisoryId,
        kind: a.kind,
        notes: a.notes,
        claimed: full.value,
        target: full.value.startsWith('#') ? `${repository}${full.value}` : full.value,
      });
    }
  }
  return { index, seal, rows };
}

// Reads one connection page by page within its budget. `page(after)` returns the connection, null
// when the item is not found, or { incomplete }. Returns its nodes, or the reason it is incomplete.
// A connection with a totalCount must hold that many nodes.
async function readConnection(page, budget) {
  const nodes = [];
  let after = null;
  for (let n = 1; ; n++) {
    const c = await page(after);
    if (c === null) return { incomplete: 'the connection was not returned' };
    if (c.incomplete !== undefined) return c;
    nodes.push(...c.nodes);
    if (!c.pageInfo.hasNextPage) {
      if (c.totalCount !== undefined && nodes.length !== c.totalCount) {
        return { incomplete: `${nodes.length} node(s) read of totalCount ${c.totalCount}` };
      }
      return { nodes };
    }
    if (n >= budget) return { incomplete: `more than ${budget} page(s) of ${PAGE_SIZE}` };
    after = c.pageInfo.endCursor;
  }
}

// A GraphQL answer's item, by `pick(data)`: the item, null when it is not found (no item, and only
// NOT_FOUND errors), or { error, item } when any error comes with the item. A NOT_FOUND inside an item,
// such as a closer the token cannot see, nulls that field alone, so it is never read as the field's
// value. Any other error with no item throws.
function itemOf(body, what, pick) {
  const errors = body.errors ?? [];
  const item = body.data === null || body.data === undefined ? null : (pick(body.data) ?? null);
  if (item === null) {
    const other = errors.filter((e) => e.type !== 'NOT_FOUND');
    if (other.length > 0) throw new Error(`${what}: ${other.map((e) => e.message).join('; ')}`);
    return null;
  }
  if (errors.length > 0) {
    const at = errors.map((e) => `${e.type ?? 'error'} at ${(e.path ?? []).join('.')}`).join('; ');
    return { error: `a GraphQL error beside the data: ${at}`, item };
  }
  return item;
}

export async function readPullRequest(post, ref, now) {
  const { owner, name, number } = splitRef(ref);
  const readAt = now();
  let head;
  const commits = await readConnection(async (after) => {
    const { body } = await post(PR_QUERY, { owner, name, number, after });
    const pr = itemOf(body, ref, (d) => d.repository?.pullRequest);
    if (pr === null) return null;
    head ??= { repository: body.data.repository, pr: pr.item ?? pr };
    if (pr.error !== undefined) return { incomplete: pr.error };
    return pr.commits;
  }, PAGE_BUDGET.commits);
  if (head === undefined)
    return { readAt, found: false, incomplete: 'the pull request was not found' };
  const { repository, pr } = head;
  return {
    readAt,
    found: true,
    state: pr.state,
    baseRefName: pr.baseRefName,
    defaultBranch: repository.defaultBranchRef?.name ?? null,
    merged: pr.merged,
    mergedAt: pr.mergedAt,
    mergeCommit: pr.mergeCommit?.oid ?? null,
    commits:
      commits.incomplete === undefined
        ? { totalCount: commits.nodes.length, oids: commits.nodes.map((c) => c.commit.oid) }
        : null,
    incomplete: commits.incomplete ?? null,
  };
}

const closerOf = (c) => {
  if (c === null || c === undefined) return null;
  if (c.__typename === 'PullRequest') {
    return { type: 'PullRequest', pr: `${c.repository.nameWithOwner}#${c.number}` };
  }
  if (c.__typename === 'Commit') return { type: 'Commit', oid: c.oid };
  return { type: c.__typename };
};

export async function readTarget(post, ref, now) {
  const { owner, name, number } = splitRef(ref);
  const readAt = now();
  let head;
  const events = await readConnection(async (after) => {
    const { body } = await post(TARGET_QUERY, { owner, name, number, after });
    const item = itemOf(body, ref, (d) => d.repository?.issueOrPullRequest);
    if (item === null) return null;
    head ??= item.item ?? item;
    if (item.error !== undefined) return { incomplete: item.error };
    return item.timelineItems;
  }, PAGE_BUDGET.closedEvents);
  if (head === undefined) return { readAt, found: false, incomplete: 'the target was not found' };
  return {
    readAt,
    found: true,
    typename: head.__typename,
    resolved: `${head.repository.nameWithOwner}#${head.number}`,
    state: head.state,
    stateReason: head.stateReason ?? null,
    closedEvents:
      events.incomplete === undefined
        ? events.nodes.map((e) => ({
            createdAt: e.createdAt,
            actor: e.actor?.login ?? null,
            closer: closerOf(e.closer),
          }))
        : null,
    incomplete: events.incomplete ?? null,
  };
}

// The read. `post(query, variables)` returns { body, scopes } or throws. Each pull request and each
// target is read once, however many rows name it.
export async function readClosers({ post, p = paths(), now = () => new Date().toISOString() }) {
  if (existsSync(p.closers)) {
    throw new Error(`${relative(p.dir, p.closers)} exists; a read is never redone`);
  }
  const { rows } = closesRows(p);
  const readStartedAt = now();
  const fixedPost = (query, variables) => {
    if (!QUERIES.includes(query)) throw new Error('closers.mjs posts only its three fixed queries');
    return post(query, variables);
  };
  const first = await fixedPost(SCOPE_QUERY, {});
  if ((first.body.errors ?? []).length > 0 || first.body.data?.rateLimit === undefined) {
    throw new Error('the scope check: the query was not answered');
  }
  const token = scopeCheck(first.scopes);

  const pullRequests = {};
  const targets = {};
  const key = (ref) => ref.toLowerCase();
  const prKey = new Map();
  const targetKey = new Map();
  for (const row of rows) {
    if (!prKey.has(key(row.pr))) {
      prKey.set(key(row.pr), row.pr);
      pullRequests[row.pr] = await readPullRequest(fixedPost, row.pr, now);
    }
    if (!targetKey.has(key(row.target))) {
      targetKey.set(key(row.target), row.target);
      targets[row.target] = await readTarget(fixedPost, row.target, now);
    }
  }
  const out = rows.map((row) => {
    const pr = pullRequests[prKey.get(key(row.pr))];
    const target = targets[targetKey.get(key(row.target))];
    const incomplete = [pr.incomplete, target.incomplete].filter((x) => x !== null);
    return {
      ...row,
      pullRequestRead: prKey.get(key(row.pr)),
      targetRead: targetKey.get(key(row.target)),
      incomplete: incomplete.length === 0 ? null : incomplete.join('; '),
    };
  });
  const closers = {
    tool: TOOL,
    node: process.version,
    readStartedAt,
    readFinishedAt: now(),
    token,
    inputs: {
      index: { path: 'runs/index.json', sha256: sha256(readFileSync(p.index)) },
      seal: { path: 'runs/baseline.seal.json', sha256: sha256(readFileSync(p.seal('baseline'))) },
    },
    pageSize: PAGE_SIZE,
    pageBudget: PAGE_BUDGET,
    rows: out,
    pullRequests,
    targets,
  };
  mkdirSync(p.erratum, { recursive: true });
  writeJson(p.closers, closers);
  return closers;
}

if (isMain(import.meta.url)) {
  flags(process.argv.slice(2));
  const c = await readClosers({ post: githubGraphql });
  const incomplete = c.rows.filter((r) => r.incomplete !== null).length;
  process.stdout.write(
    `${c.rows.length} row(s), ${Object.keys(c.pullRequests).length} pull request(s), ${Object.keys(c.targets).length} target(s) read; ${incomplete} row(s) incomplete\n`,
  );
}

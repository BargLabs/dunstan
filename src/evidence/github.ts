// The GitHub evidence reader (spec section 6). REST plus two fixed GraphQL queries over fetch, with a
// token from GITHUB_TOKEN; no `gh`, so it runs where the GitHub CLI is absent. It reads metadata
// only: pull request state, file lists, commit ids, check runs, closing references, JUnit
// test-report counts and deployments, and, for advisories only, the type of the object at a path
// (comparison 0.3.0). It never reads a repository file.
//
// Every section the block needs is written, as `ok` with its data, `unreadable` with the source kind
// when a read failed, or `unpopulated` with the field when the source answered without it. A failed
// read is never filled in with a guess.

import type { PathAnswer, PathObject } from '../advisory/advise.js';
import { qualifyIssue, sameIssue } from '../check/index.js';
import type {
  Block,
  CheckRun,
  CheckRunsEvidence,
  ClosingReferencesEvidence,
  Deployment,
  DeploymentRelation,
  DeploymentsEvidence,
  Evidence,
  FileEntry,
  FilesEvidence,
  JunitRecord,
  PullRequestEvidence,
  ReferenceEvidence,
  SourceKind,
  TestRecordEvidence,
  TestRecordRun,
} from '../check/types.js';
import { canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import type { GitHubClient, Read } from './http.js';
import { countJunit, JunitError } from './junit.js';
import { readZipEntry, ZipError } from './zip.js';

const PER_PAGE = 100;
// The pull request files API lists at most 3,000 files.
export const FILES_API_LIMIT = 3000;
// A bound on any one paginated listing, so a hostile or runaway answer cannot loop forever. A listing
// that reaches it is unreadable, never silently short.
const MAX_PAGES = 100;

export class PullRequestUnreadable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PullRequestUnreadable';
  }
}

// A body that is not the shape the API documents. The section becomes unreadable (parse).
class ShapeError extends Error {}

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ShapeError();
  return value as Obj;
}
function arr(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError();
  return value;
}
function str(value: unknown): string {
  if (typeof value !== 'string') throw new ShapeError();
  return value;
}
function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new ShapeError();
  return value;
}
function strOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : str(value);
}

function unreadable<K extends SourceKind>(source: K): { status: 'unreadable'; source: K } {
  return { status: 'unreadable', source };
}

function splitRepo(repository: string): { owner: string; name: string } {
  const [owner, name] = repository.split('/');
  return { owner: owner as string, name: name as string };
}

// GitHub times carry no fractional seconds; they are recorded as received.
function timestamp(value: unknown): string {
  const text = str(value);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(text)) {
    throw new ShapeError();
  }
  return text;
}

function second(t: string): string {
  return t.slice(0, 19);
}

// ---------------------------------------------------------------- pull request

export interface PullRequestRead {
  evidence: PullRequestEvidence;
  // The repository's canonical owner/name as GitHub spells it.
  repository: string;
  body: string | null;
}

export async function readPullRequest(
  client: GitHubClient,
  repository: string,
  number: number,
): Promise<PullRequestRead> {
  const read = await client.read('pull_request', `/repos/${repository}/pulls/${number}`);
  if (!read.ok) {
    throw new PullRequestUnreadable(
      `cannot read pull request ${repository}#${number} (${read.error}); no record is written`,
    );
  }
  try {
    const pr = obj(read.json);
    const merged = pr.merged === true;
    const state = str(pr.state);
    if (state !== 'open' && state !== 'closed') throw new ShapeError();
    const base = obj(obj(pr.base).repo);
    return {
      evidence: {
        status: 'ok',
        number: int(pr.number),
        state,
        merged,
        mergedAt:
          pr.merged_at === null || pr.merged_at === undefined ? null : timestamp(pr.merged_at),
        headSha: str(obj(pr.head).sha),
        // For an open pull request merge_commit_sha is a test merge, not a merge.
        mergeSha: merged ? strOrNull(pr.merge_commit_sha) : null,
        changedFiles: int(pr.changed_files),
      },
      repository: str(base.full_name),
      body: strOrNull(pr.body),
    };
  } catch (e) {
    if (e instanceof ShapeError) {
      throw new PullRequestUnreadable(
        `pull request ${repository}#${number} answered in an unexpected shape; no record is written`,
      );
    }
    throw e;
  }
}

// ---------------------------------------------------------------- paginated REST listings

// Reads every page of a listing. Returns null when any page is unreadable (the section is then
// unreadable, spec section 6) or when the bound is reached.
async function readAllPages<T>(
  client: GitHubClient,
  kind: SourceKind,
  pathFor: (page: number) => string,
  itemsOf: (json: unknown) => unknown[],
  map: (item: unknown) => T,
  options: { stop?: (items: T[]) => boolean; notFoundIsEmpty?: boolean } = {},
): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = pathFor(page);
    const read = await client.read(kind, path);
    if (!read.ok && page === 1 && read.status === 404 && options.notFoundIsEmpty === true)
      return [];
    if (!read.ok) return null;
    let items: T[];
    try {
      items = itemsOf(read.json).map(map);
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      client.markParseError(`GET ${path}`);
      return null;
    }
    out.push(...items);
    if (items.length < PER_PAGE || options.stop?.(items)) return out;
  }
  return null;
}

// ---------------------------------------------------------------- files

const FILE_STATUSES = new Set([
  'added',
  'removed',
  'modified',
  'renamed',
  'copied',
  'changed',
  'unchanged',
]);

async function readFiles(
  client: GitHubClient,
  repository: string,
  pr: PullRequestEvidence,
): Promise<FilesEvidence> {
  const entries = await readAllPages(
    client,
    'pull_request_files',
    (page) => `/repos/${repository}/pulls/${pr.number}/files?per_page=${PER_PAGE}&page=${page}`,
    arr,
    (item): FileEntry => {
      const f = obj(item);
      const status = str(f.status);
      if (!FILE_STATUSES.has(status)) throw new ShapeError();
      const entry: FileEntry = { path: str(f.filename), status: status as FileEntry['status'] };
      if (f.previous_filename !== undefined && f.previous_filename !== null) {
        entry.previousPath = str(f.previous_filename);
      }
      return entry;
    },
  );
  if (entries === null) return unreadable('pull_request_files');
  const unique = new Map(entries.map((e) => [e.path, e]));
  const sorted = [...unique.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  return {
    status: 'ok',
    complete: sorted.length >= pr.changedFiles && entries.length < FILES_API_LIMIT,
    entries: sorted,
  };
}

// ---------------------------------------------------------------- closing references (GraphQL)

// The GraphQL query the gate's evidence reads. Exported so the hosted route allowlist admits
// exactly it.
export const CLOSING_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 100, after: $after) {
        nodes { number repository { nameWithOwner } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

async function readClosingReferences(
  client: GitHubClient,
  repository: string,
  number: number,
): Promise<ClosingReferencesEvidence> {
  const { owner, name } = splitRepo(repository);
  const issues: string[] = [];
  let after: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const locator: string = `POST /graphql repository(${repository}).pullRequest(${number}).closingIssuesReferences${after === null ? '' : `(after:${after})`}`;
    const read: Read = await client.read('closing_references', '/graphql', {
      method: 'POST',
      locator,
      requestBody: JSON.stringify({
        query: CLOSING_QUERY,
        variables: { owner, name, number, after },
      }),
    });
    if (!read.ok) return unreadable('closing_references');
    try {
      const body = obj(read.json);
      // GraphQL reports errors with HTTP 200. A partial answer is not evidence.
      if (body.errors !== undefined && body.errors !== null) throw new ShapeError();
      const pr = obj(obj(obj(body.data).repository).pullRequest);
      const connection = pr.closingIssuesReferences;
      // An absent or null connection is no evidence; it is not an empty list.
      if (connection === undefined || connection === null) {
        return { status: 'unpopulated', field: 'closingIssuesReferences' };
      }
      const c = obj(connection);
      for (const node of arr(c.nodes)) {
        const n = obj(node);
        issues.push(`${str(obj(n.repository).nameWithOwner)}#${int(n.number)}`);
      }
      const info = obj(c.pageInfo);
      if (info.hasNextPage !== true) {
        return {
          status: 'ok',
          issues: [...new Set(issues)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        };
      }
      after = str(info.endCursor);
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      client.markParseError(locator);
      return unreadable('closing_references');
    }
  }
  return unreadable('closing_references');
}

// ---------------------------------------------------------------- object type at a path (GraphQL)

// The second GraphQL query, and the only one the advisory section reads (comparison 0.3.0): the
// type of the object at `<head>:<path>`, `Blob`, `Tree` or none, and nothing else. It never asks
// for a blob's content, size or id, or a tree's entries. Exported so the hosted route allowlist
// admits exactly it. It is never asked for the gate.
export const PATH_QUERY = `query($owner: String!, $name: String!, $expression: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) { __typename }
  }
}`;

// An expression the path query may carry: a full commit id, a colon, and a repository path in the
// extractor's characters, with no empty, `.` or `..` segment.
export function isPathExpression(expression: string): boolean {
  const m = /^[0-9a-f]{40}:([A-Za-z0-9_.+/-]{1,1024})$/.exec(expression);
  if (m === null) return false;
  return (m[1] as string).split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

export interface ReadPathObjectsInput {
  repository: string;
  headSha: string;
  paths: readonly string[];
}

// One query per path, in the order given. The answers are not evidence: they are recorded in the
// advisory section, so no source entry is written and `digests.evidence` does not move. A read
// that fails, a GraphQL error, or an answer of any other shape or type is unreadable, never a
// guess. A value that is not a repository path is not asked, and is unreadable.
export async function readPathObjects(
  client: GitHubClient,
  input: ReadPathObjectsInput,
): Promise<PathAnswer[]> {
  const { owner, name } = splitRepo(input.repository);
  const out: PathAnswer[] = [];
  for (const path of input.paths) {
    const expression = `${input.headSha}:${path}`;
    if (!isPathExpression(expression)) {
      out.push({ path, status: 'unreadable' });
      continue;
    }
    const read = await client.read('path', '/graphql', {
      method: 'POST',
      locator: `POST /graphql repository(${input.repository}).object(${expression}).__typename`,
      requestBody: JSON.stringify({ query: PATH_QUERY, variables: { owner, name, expression } }),
      record: false,
    });
    out.push(read.ok ? { path, ...pathObjectOf(read.json) } : { path, status: 'unreadable' });
  }
  return out;
}

function pathObjectOf(
  json: unknown,
): { status: 'ok'; object: PathObject } | { status: 'unreadable' } {
  try {
    const body = obj(json);
    // GraphQL reports errors with HTTP 200. A partial answer is not evidence.
    if (body.errors !== undefined && body.errors !== null) throw new ShapeError();
    const object = obj(obj(body.data).repository).object;
    if (object === null) return { status: 'ok', object: null };
    const type = obj(object).__typename;
    // Only the type is kept. A commit (a submodule) or anything else is not an answer this reads.
    if (type === 'Blob' || type === 'Tree') return { status: 'ok', object: type };
    throw new ShapeError();
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    return { status: 'unreadable' };
  }
}

// ---------------------------------------------------------------- references (cites)

function isNotFound(read: Read): boolean {
  return !read.ok && (read.status === 404 || read.status === 410);
}

// An owner/repo#N as record-0.1.schema.json's issueRef admits it.
const ISSUE_REF = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}#[1-9][0-9]{0,9}$/;

// The issue an issue read answered for, as owner/repo#N: the answer's `number`, and the owner and
// name its `repository_url` ends in (`…/repos/{owner}/{repo}`; the API's host is not checked, as the
// Action reads from GITHUB_API_URL). GitHub answers the read of an issue transferred to another
// repository with a redirect to the issue's new identity, which the client follows (spec 0.1.3).
function answeredIssue(json: unknown): string {
  const issue = obj(json);
  const number = int(issue.number);
  let url: URL;
  try {
    url = new URL(str(issue.repository_url));
  } catch (e) {
    if (e instanceof TypeError) throw new ShapeError();
    throw e;
  }
  const m = /\/repos\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (m === null || url.search !== '' || url.hash !== '' || m[2] === '.' || m[2] === '..') {
    throw new ShapeError();
  }
  const answered = `${m[1]}/${m[2]}#${number}`;
  if (!ISSUE_REF.test(answered)) throw new ShapeError();
  return answered;
}

// base...head: base is an ancestor of head (or equal to it) exactly when head is not behind base.
async function isAncestor(
  client: GitHubClient,
  repository: string,
  base: string,
  head: string,
): Promise<boolean | null> {
  const path = `/repos/${repository}/compare/${base}...${head}?per_page=1`;
  const read = await client.read('compare', path);
  if (!read.ok) return null;
  try {
    return int(obj(read.json).behind_by) === 0;
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    client.markParseError(`GET ${path}`);
    return null;
  }
}

// The references read one by one: every `cites`, and every `closes` issue missing from a closing
// references list that was read. GitHub leaves out of that list any issue its reader cannot see, so
// a missing issue is read as a cited one is (spec section 7.4).
async function readReferences(
  client: GitHubClient,
  block: Block,
  repository: string,
  headSha: string,
  closing: ClosingReferencesEvidence | undefined,
): Promise<ReferenceEvidence[] | undefined> {
  const toRead = (block.references ?? []).filter((r) => {
    if (r.relation === 'cites') return true;
    if (!('issue' in r) || closing?.status !== 'ok') return false;
    const target = qualifyIssue(r.issue, repository);
    return !closing.issues.some((issue) => sameIssue(issue, target));
  });
  if (toRead.length === 0) return undefined;
  const out: ReferenceEvidence[] = [];
  const seen = new Set<string>();
  const repositoryReadable = new Map<string, boolean>([[repository.toLowerCase(), true]]);

  for (const reference of toRead) {
    if ('issue' in reference) {
      const ref = qualifyIssue(reference.issue, repository);
      const key = `issue:${ref.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [repo, num] = ref.split('#') as [string, string];
      // A repository the reader cannot see answers not found; that is unreadable, never absent.
      let readable = repositoryReadable.get(repo.toLowerCase());
      if (readable === undefined) {
        readable = (await client.read('repository', `/repos/${repo}`)).ok;
        repositoryReadable.set(repo.toLowerCase(), readable);
      }
      if (!readable) {
        out.push({ kind: 'issue', ref, ...unreadable('repository') });
        continue;
      }
      const path = `/repos/${repo}/issues/${num}`;
      const read = await client.read('issue', path);
      if (isNotFound(read)) {
        out.push({ kind: 'issue', ref, status: 'ok', exists: false });
        continue;
      }
      if (!read.ok) {
        out.push({ kind: 'issue', ref, ...unreadable('issue') });
        continue;
      }
      let answered: string;
      try {
        answered = answeredIssue(read.json);
      } catch (e) {
        if (!(e instanceof ShapeError)) throw e;
        client.markParseError(`GET ${path}`);
        out.push({ kind: 'issue', ref, ...unreadable('issue') });
        continue;
      }
      // An answer for another issue is the one GitHub resolves the name read to. It is recorded, so
      // the closes check reads it offline too; the issue is not read again under it.
      out.push(
        sameIssue(answered, ref)
          ? { kind: 'issue', ref, status: 'ok', exists: true }
          : { kind: 'issue', ref, status: 'ok', exists: true, resolvedAs: answered },
      );
      continue;
    }

    const ref = reference.commit;
    const key = `commit:${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // The git-database endpoint answers 404 for a commit the repository does not have; the
    // commits endpoint answers 422, which the spec does not count as not found.
    const read = await client.read('commit', `/repos/${repository}/git/commits/${ref}`);
    if (isNotFound(read)) {
      out.push({ kind: 'commit', ref, status: 'ok', exists: false, reachableFromHead: false });
      continue;
    }
    if (!read.ok) {
      out.push({ kind: 'commit', ref, ...unreadable('commit') });
      continue;
    }
    const reachable = ref === headSha ? true : await isAncestor(client, repository, ref, headSha);
    if (reachable === null) out.push({ kind: 'commit', ref, ...unreadable('compare') });
    else
      out.push({ kind: 'commit', ref, status: 'ok', exists: true, reachableFromHead: reachable });
  }
  return out;
}

// ---------------------------------------------------------------- check runs

async function readCheckRuns(
  client: GitHubClient,
  repository: string,
  commit: string,
  excludedIds: readonly number[],
): Promise<CheckRunsEvidence> {
  const runs = await readAllPages(
    client,
    'check_runs',
    (page) =>
      `/repos/${repository}/commits/${commit}/check-runs?filter=latest&per_page=${PER_PAGE}&page=${page}`,
    (json) => arr(obj(json).check_runs),
    (item): CheckRun => {
      const r = obj(item);
      return {
        id: int(r.id),
        name: str(r.name),
        status: str(r.status),
        conclusion: strOrNull(r.conclusion),
      };
    },
  );
  if (runs === null) return unreadable('check_runs');
  return {
    status: 'ok',
    commit,
    excludedIds: [...new Set(excludedIds)].sort((a, b) => a - b),
    runs: [...new Map(runs.map((r) => [r.id, r])).values()].sort((a, b) => a.id - b.id),
  };
}

// ---------------------------------------------------------------- JUnit test records

interface WorkflowRun {
  id: number;
  attempt: number;
  path: string;
}

async function readTestRecord(
  client: GitHubClient,
  repository: string,
  record: JunitRecord,
  headCommit: string,
): Promise<TestRecordEvidence> {
  const workflowFile = record.workflow.split('/').at(-1) as string;
  const runsPath = (page: number) =>
    `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?head_sha=${headCommit}&per_page=${PER_PAGE}&page=${page}`;
  const listed = await readAllPages(
    client,
    'workflow_runs',
    runsPath,
    (json) => arr(obj(json).workflow_runs),
    (item): WorkflowRun => {
      const r = obj(item);
      return { id: int(r.id), attempt: int(r.run_attempt), path: str(r.path) };
    },
    // No workflow with that file name: there is no run, so no candidate run.
    { notFoundIsEmpty: true },
  );
  if (listed === null) return { record, ...unreadable('workflow_runs') };

  const runs: TestRecordRun[] = [];
  // The listing gives each run at its latest attempt. A run of another workflow file with the same
  // base name (or a dynamic run) is not a candidate.
  for (const run of listed.filter((r) => r.path.replace(/@.*$/, '') === record.workflow)) {
    const jobs = await readAllPages(
      client,
      'workflow_runs',
      (page) =>
        `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=${PER_PAGE}&page=${page}`,
      (json) => arr(obj(json).jobs),
      (item) => str(obj(item).name),
    );
    if (jobs === null) return { record, ...unreadable('workflow_runs') };
    if (!jobs.includes(record.job)) continue;

    const artifacts = await readAllPages(
      client,
      'workflow_runs',
      (page) =>
        `/repos/${repository}/actions/runs/${run.id}/artifacts?name=${encodeURIComponent(record.artifact)}&per_page=${PER_PAGE}&page=${page}`,
      (json) => arr(obj(json).artifacts),
      (item) => {
        const a = obj(item);
        return { id: int(a.id), name: str(a.name), expired: a.expired === true };
      },
    );
    if (artifacts === null) return { record, ...unreadable('workflow_runs') };
    const named = artifacts.filter((a) => a.name === record.artifact).sort((a, b) => a.id - b.id);
    if (named.length === 0) continue;
    if (named.length > 1) return { record, ...unreadable('artifact') };
    const artifact = named[0] as { id: number; expired: boolean };
    // The run uploaded the record but it can no longer be downloaded: unreadable, not absent.
    if (artifact.expired) return { record, ...unreadable('artifact') };

    const zipPath = `/repos/${repository}/actions/artifacts/${artifact.id}/zip`;
    const download = await client.read('artifact', zipPath, {
      json: false,
      locatorSuffix: `#${record.path}`,
    });
    if (!download.ok) return { record, ...unreadable('artifact') };
    try {
      const file = readZipEntry(download.body, record.path);
      if (file === null) continue;
      const counts = countJunit(new TextDecoder('utf-8').decode(file));
      runs.push({ runId: run.id, runAttempt: run.attempt, ...counts });
    } catch (e) {
      if (!(e instanceof ZipError || e instanceof JunitError)) throw e;
      client.markParseError(`GET ${zipPath}#${record.path}`);
      return { record, ...unreadable('artifact') };
    }
  }
  return { record, status: 'ok', runs: runs.sort((a, b) => a.runId - b.runId) };
}

// ---------------------------------------------------------------- deployments

interface ListedDeployment {
  id: number;
  sha: string;
  createdAt: string;
}

function mapDeployment(item: unknown): ListedDeployment {
  const d = obj(item);
  return { id: int(d.id), sha: str(d.sha), createdAt: timestamp(d.created_at) };
}

async function readDeployments(
  client: GitHubClient,
  repository: string,
  pr: PullRequestEvidence,
  deployedAt: { at: string; environment: string },
): Promise<DeploymentsEvidence> {
  const environment = deployedAt.environment;
  const env = encodeURIComponent(environment);
  const fail = (source: SourceKind): DeploymentsEvidence => ({
    environment,
    ...unreadable(source),
  });

  const candidates = new Map<number, ListedDeployment>();
  const ofHead = await readAllPages(
    client,
    'deployments',
    (page) =>
      `/repos/${repository}/deployments?environment=${env}&sha=${pr.headSha}&per_page=${PER_PAGE}&page=${page}`,
    arr,
    mapDeployment,
  );
  if (ofHead === null) return fail('deployments');
  for (const d of ofHead) candidates.set(d.id, d);

  // For a merged pull request: every deployment created between the merge and the declared time. The
  // listing is newest first, so it stops at the first page that reaches back past the merge.
  if (pr.merged && pr.mergedAt !== null && pr.mergeSha !== null) {
    const mergedAt = second(pr.mergedAt);
    const at = second(deployedAt.at);
    const window = await readAllPages(
      client,
      'deployments',
      (page) =>
        `/repos/${repository}/deployments?environment=${env}&per_page=${PER_PAGE}&page=${page}`,
      arr,
      mapDeployment,
      { stop: (items) => items.some((d) => second(d.createdAt) < mergedAt) },
    );
    if (window === null) return fail('deployments');
    for (const d of window) {
      const created = second(d.createdAt);
      if (created >= mergedAt && created <= at) candidates.set(d.id, d);
    }
  }

  const deployments: Deployment[] = [];
  const related = new Map<string, DeploymentRelation>();
  for (const d of [...candidates.values()].sort((a, b) => a.id - b.id)) {
    let relation: DeploymentRelation;
    if (d.sha === pr.headSha) relation = 'head';
    else if (d.sha === pr.mergeSha) relation = 'merge';
    else if (!pr.merged || pr.mergeSha === null) relation = 'unrelated';
    else {
      let known = related.get(d.sha);
      if (known === undefined) {
        const ancestor = await isAncestor(client, repository, pr.mergeSha, d.sha);
        known = ancestor === null ? 'unknown' : ancestor ? 'descendant' : 'unrelated';
        related.set(d.sha, known);
      }
      relation = known;
    }
    const statuses = await readAllPages(
      client,
      'deployments',
      (page) =>
        `/repos/${repository}/deployments/${d.id}/statuses?per_page=${PER_PAGE}&page=${page}`,
      arr,
      (item) => {
        const s = obj(item);
        return { state: str(s.state), createdAt: timestamp(s.created_at) };
      },
    );
    if (statuses === null) return fail('deployments');
    const successes = statuses
      .filter((s) => s.state === 'success')
      .map((s) => s.createdAt)
      .sort((a, b) => (second(a) < second(b) ? -1 : second(a) > second(b) ? 1 : 0));
    deployments.push({ id: d.id, sha: d.sha, relation, successAt: successes[0] ?? null });
  }
  return { environment, status: 'ok', deployments };
}

// ---------------------------------------------------------------- the whole snapshot

export interface ReadEvidenceInput {
  repository: string;
  pullRequest: PullRequestRead;
  // The found block, or null when the report has none: then only the pull request is read.
  block: Block | null;
  // Check runs the checker itself executes in (spec section 7.5).
  excludedCheckRunIds?: readonly number[];
}

export async function readEvidence(
  client: GitHubClient,
  input: ReadEvidenceInput,
): Promise<Evidence> {
  const { block, repository } = input;
  const pr = input.pullRequest.evidence;
  const evidence: Evidence = { pullRequest: pr, sources: [] };
  if (block !== null) {
    evidence.files = await readFiles(client, repository, pr);
    if ((block.references ?? []).some((r) => r.relation === 'closes')) {
      evidence.closingReferences = await readClosingReferences(client, repository, pr.number);
    }
    const references = await readReferences(
      client,
      block,
      repository,
      pr.headSha,
      evidence.closingReferences,
    );
    if (references !== undefined) evidence.references = references;
    if (block.checks !== undefined) {
      evidence.checkRuns = await readCheckRuns(
        client,
        repository,
        block.headCommit,
        input.excludedCheckRunIds ?? [],
      );
    }
    const records = new Map<string, JunitRecord>();
    for (const test of block.tests ?? []) {
      if (test.record.kind !== 'junit') continue;
      const record = test.record as JunitRecord;
      records.set(canonicalize(record as unknown as JsonValue), record);
    }
    if (records.size > 0) {
      evidence.testRecords = [];
      for (const record of records.values()) {
        evidence.testRecords.push(
          await readTestRecord(client, repository, record, block.headCommit),
        );
      }
    }
    if (block.deployedAt !== undefined) {
      evidence.deployments = [await readDeployments(client, repository, pr, block.deployedAt)];
    }
  }
  evidence.sources = client.sortedSources();
  return evidence;
}

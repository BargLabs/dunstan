// The GitLab evidence reader (spec/claim-format.md, "DRAFT GitLab profile 0.1"). REST v4 over the
// same client contract as GitHub's (src/evidence/http.ts): every read a source with its SHA-256,
// every listing paginated to its end or to MAX_PAGES, a failed read never filled in with a guess.
// It reads the merge request, its diffs listing, its closing issues, the issues and commits a block
// names, and who closed a `closes` target; for a block that claims them, the head pipeline's jobs
// and bridges, the named job's artifacts archive, and the deployments to the named environment. It
// reads no file but the JUnit file a block's record names, as GitHub's reader reads its artifact.

import { qualifyIssue, sameIssue } from '../check/index.js';
import type {
  Block,
  CheckRun,
  CheckRunsEvidence,
  CloseBaseEvidence,
  CloseEvent,
  CloseEventsEvidence,
  CloseTargetEvidence,
  ClosingReferencesEvidence,
  Deployment,
  DeploymentRelation,
  DeploymentsEvidence,
  Evidence,
  FileEntry,
  JunitRecord,
  PullRequestEvidence,
  ReferenceEvidence,
  SourceKind,
  TestRecordEvidence,
  TestRecordRun,
} from '../check/types.js';
import { canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import {
  closeTargets,
  MAX_PAGES,
  PER_PAGE,
  type PullRequestRead,
  PullRequestUnreadable,
  type ReadEvidenceInput,
} from './github.js';
import type { GitLabClient, Read } from './http.js';
import { countJunit, JunitError } from './junit.js';
import type { Report } from './report.js';
import { readZipEntry, ZipError } from './zip.js';

// The fields an `unpopulated` checkRuns or testRecords entry names when the merge request has no
// head pipeline, or one for a commit other than the block's headCommit (profile G.3). Their claims
// are unverifiable with evidence_field_unpopulated:<field>.
export const NO_HEAD_PIPELINE = 'head_pipeline';
export const HEAD_PIPELINE_ELSEWHERE = 'head_pipeline_not_at_head_commit';

// A target's resource state events are read to at most ten pages, as GitHub's ClosedEvents are.
const CLOSE_EVENT_PAGES = 10;

// A project's full path, `group/subgroup/.../project`, and an issue reference, as the DRAFT GitLab
// schema admits them (profile G.1): up to 20 levels of groups, each segment as GitLab allows one.
// Every path the 0.1 `repository` pattern admits is one of these.
const SEGMENT = '[A-Za-z0-9_][A-Za-z0-9._-]{0,254}';
const FULL_PATH = `${SEGMENT}(?:/${SEGMENT}){0,19}/[A-Za-z0-9._-]{1,255}`;
export const GITLAB_PROJECT = new RegExp(`^${FULL_PATH}$`);
const ISSUE_REF = new RegExp(`^${FULL_PATH}#[1-9][0-9]{0,9}$`);
const COMMIT = /^[0-9a-f]{40}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;
const MERGE_REQUEST_URL = /^https?:\/\/[^/]+\/(.+)\/-\/merge_requests\/([1-9][0-9]{0,9})$/;

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
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ShapeError();
  return value;
}
function strOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : str(value);
}
function timestamp(value: unknown): string {
  const text = str(value);
  if (!TIMESTAMP.test(text)) throw new ShapeError();
  return text;
}
function commitOid(value: unknown): string {
  const text = str(value);
  if (!COMMIT.test(text)) throw new ShapeError();
  return text;
}
function unreadable<K extends SourceKind>(source: K): { status: 'unreadable'; source: K } {
  return { status: 'unreadable', source };
}
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The API path of a project: its full path, URL-encoded, as GitLab names a project by path.
export function projectPath(project: string): string {
  return `/api/v4/projects/${encodeURIComponent(project)}`;
}

function mergeRequestPath(project: string, iid: number): string {
  return `${projectPath(project)}/merge_requests/${iid}`;
}

// Every page of a listing, in order. Null when any page is unreadable or unparseable (the section
// is then unreadable) or when the bound is reached without a short page. `map` is given the
// locator of the page that holds the item.
async function readPages<T>(
  client: GitLabClient,
  kind: SourceKind,
  pathFor: (page: number) => string,
  map: (item: unknown, locator: string) => T,
  options: { maxPages?: number; record?: boolean } = {},
): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 1; page <= (options.maxPages ?? MAX_PAGES); page++) {
    const path = pathFor(page);
    const read = await client.read(kind, path, options.record === false ? { record: false } : {});
    if (!read.ok) return null;
    let items: unknown[];
    try {
      items = arr(read.json);
      out.push(...items.map((item) => map(item, `GET ${path}`)));
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      client.markParseError(`GET ${path}`);
      return null;
    }
    if (items.length < PER_PAGE) return out;
  }
  return null;
}

const pages = (path: string) => (page: number) => `${path}?per_page=${PER_PAGE}&page=${page}`;

// ---------------------------------------------------------------- the merge request

// A merge request read: the pull request read section 6 compares, and the diffs listing read with
// it, from which `changedFiles` and the `files` section come (profile G.3).
export interface MergeRequestRead extends PullRequestRead {
  files: { status: 'ok'; complete: boolean; entries: FileEntry[] };
  // The merge request's `head_pipeline`, its id and commit, or null when GitLab gives none.
  headPipeline: { id: number; sha: string } | null;
}

function headPipeline(value: unknown): { id: number; sha: string } | null {
  if (value === null || value === undefined) return null;
  const p = obj(value);
  const id = int(p.id);
  if (id < 1) throw new ShapeError();
  return { id, sha: commitOid(p.sha) };
}

function diffEntry(item: unknown): FileEntry {
  const f = obj(item);
  const path = str(f.new_path);
  const previous = str(f.old_path);
  const added = bool(f.new_file);
  const removed = bool(f.deleted_file);
  const renamed = bool(f.renamed_file);
  if ([added, removed, renamed].filter(Boolean).length > 1) throw new ShapeError();
  if (added) return { path, status: 'added' };
  if (removed) return { path, status: 'removed' };
  if (renamed) return { path, status: 'renamed', previousPath: previous };
  return { path, status: 'modified' };
}

// The commit a merged merge request put on its target branch (profile G.3, pullRequest): the merge
// commit, `merge_commit_sha`, for a merge with a merge commit, squashed or not; else the squash
// commit, `squash_commit_sha`, for a squash merged by fast-forward; else none. GitLab states no
// merged commit for a fast-forward merge without a squash, so it is null, never the head guessed.
function mergeCommit(mr: Obj): string | null {
  if (mr.merge_commit_sha !== null && mr.merge_commit_sha !== undefined) {
    return commitOid(mr.merge_commit_sha);
  }
  if (mr.squash_commit_sha !== null && mr.squash_commit_sha !== undefined) {
    return commitOid(mr.squash_commit_sha);
  }
  return null;
}

const STATES: Record<string, { state: 'open' | 'closed'; merged: boolean }> = {
  opened: { state: 'open', merged: false },
  closed: { state: 'closed', merged: false },
  merged: { state: 'closed', merged: true },
};

// `record: false` reads the merge request and its diffs again without source entries: the record
// holds the reads its evidence came from. A read that fails, or answers in another shape, gives no
// record (PullRequestUnreadable), and its message names the read and its error, never a token.
export async function readMergeRequest(
  client: GitLabClient,
  project: string,
  iid: number,
  options: { record?: boolean } = {},
): Promise<MergeRequestRead> {
  const path = mergeRequestPath(project, iid);
  const name = `merge request ${project}!${iid}`;
  const record = options.record === false ? { record: false } : {};
  const read = await client.read('pull_request', path, record);
  if (!read.ok) {
    throw new PullRequestUnreadable(`cannot read ${name} (${read.error}); no record is written`);
  }
  let head: Omit<MergeRequestRead, 'files' | 'evidence'> & {
    evidence: Omit<MergeRequestRead['evidence'], 'changedFiles'>;
    changesCount: string | null;
  };
  try {
    const mr = obj(read.json);
    const mapped = STATES[str(mr.state)];
    // `locked` (a merge in progress) and any other state are not mapped: no record.
    if (mapped === undefined) throw new ShapeError();
    const number = int(mr.iid);
    const full = str(obj(mr.references).full);
    const suffix = `!${number}`;
    if (!full.endsWith(suffix)) throw new ShapeError();
    const repository = full.slice(0, -suffix.length);
    if (!GITLAB_PROJECT.test(repository)) throw new ShapeError();
    // The project read must be the project asked for: a path GitLab resolves to another project
    // (one renamed or transferred) gives no record. Paths compare as GitLab compares them,
    // case-insensitively.
    if (repository.toLowerCase() !== project.toLowerCase()) throw new ShapeError();
    const changesCount = mr.changes_count;
    head = {
      evidence: {
        status: 'ok',
        number,
        state: mapped.state,
        merged: mapped.merged,
        mergedAt:
          mr.merged_at === null || mr.merged_at === undefined ? null : timestamp(mr.merged_at),
        headSha: commitOid(mr.sha),
        mergeSha: mapped.merged ? mergeCommit(mr) : null,
      },
      repository,
      baseRef: str(mr.target_branch),
      body: strOrNull(mr.description),
      changesCount: strOrNull(changesCount),
      headPipeline: headPipeline(mr.head_pipeline),
    };
  } catch (e) {
    if (e instanceof ShapeError) {
      throw new PullRequestUnreadable(
        `${name} answered in an unexpected shape; no record is written`,
      );
    }
    throw e;
  }
  const listed = await readPages(client, 'pull_request_files', pages(`${path}/diffs`), diffEntry, {
    record: options.record !== false,
  });
  if (listed === null) {
    throw new PullRequestUnreadable(`cannot read the diffs of ${name}; no record is written`);
  }
  const unique = new Map(listed.map((e) => [e.path, e]));
  const entries = [...unique.values()].sort((a, b) => byCodeUnits(a.path, b.path));
  // changes_count is a string GitLab caps ("1000+"). Only an exact count that the listing matches
  // shows the listing whole.
  const count = head.changesCount;
  const complete = count !== null && /^[0-9]+$/.test(count) && Number(count) === entries.length;
  return {
    evidence: { ...head.evidence, changedFiles: entries.length },
    repository: head.repository,
    baseRef: head.baseRef,
    body: head.body,
    files: { status: 'ok', complete, entries },
    headPipeline: head.headPipeline,
  };
}

// The merge request's description as the API returned it, encoded as UTF-8: the report when the
// invocation names it (profile G.2). A description that is null is an empty report.
export function reportFromMergeRequestDescription(pr: PullRequestRead): Report {
  return {
    bytes: new TextEncoder().encode(pr.body ?? ''),
    source: {
      kind: 'pr-body',
      locator: `GET ${mergeRequestPath(pr.repository, pr.evidence.number)}#description`,
    },
  };
}

// ---------------------------------------------------------------- closing references

async function readClosingReferences(
  client: GitLabClient,
  project: string,
  iid: number,
): Promise<ClosingReferencesEvidence> {
  const issues = await readPages(
    client,
    'closing_references',
    pages(`${mergeRequestPath(project, iid)}/closes_issues`),
    (item) => {
      const ref = str(obj(obj(item).references).full);
      // An external tracker's issue is not an issue the profile can name.
      if (!ISSUE_REF.test(ref)) throw new ShapeError();
      return ref;
    },
  );
  if (issues === null) return unreadable('closing_references');
  return { status: 'ok', issues: [...new Set(issues)].sort(byCodeUnits) };
}

// ---------------------------------------------------------------- references (cites)

// The issue an issue read answered for, which must be the issue read: GitLab answers a moved issue
// as itself, so an answer for another one is not a shape this reads (profile G.3).
function answeredIssue(json: unknown, ref: string): void {
  const full = str(obj(obj(json).references).full);
  if (!sameIssue(full, ref)) throw new ShapeError();
}

function issueState(json: unknown): 'open' | 'closed' {
  const state = str(obj(json).state);
  if (state === 'opened') return 'open';
  if (state === 'closed') return 'closed';
  throw new ShapeError();
}

// Whether `commit` is an ancestor of `head`: their merge base is the commit itself.
async function isAncestor(
  client: GitLabClient,
  project: string,
  commit: string,
  head: string,
): Promise<boolean | null> {
  const path = `${projectPath(project)}/repository/merge_base?refs[]=${commit}&refs[]=${head}`;
  const read = await client.read('compare', path);
  if (!read.ok) return null;
  try {
    return commitOid(obj(read.json).id) === commit;
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    client.markParseError(`GET ${path}`);
    return null;
  }
}

async function readIssue(client: GitLabClient, ref: string): Promise<{ read: Read; path: string }> {
  const [repo, num] = ref.split('#') as [string, string];
  const path = `${projectPath(repo)}/issues/${num}`;
  return { read: await client.read('issue', path), path };
}

// Every `cites`, and every `closes` issue missing from a closing references list that was read, as
// section 7.4 reads them. An issue GitLab answers 404 for is unreadable, never absent: GitLab
// answers so for a confidential issue the reader may not see (profile G.3).
async function readReferences(
  client: GitLabClient,
  block: Block,
  project: string,
  headSha: string,
  closing: ClosingReferencesEvidence | undefined,
): Promise<ReferenceEvidence[] | undefined> {
  const toRead = (block.references ?? []).filter((r) => {
    if (r.relation === 'cites') return true;
    if (!('issue' in r) || closing?.status !== 'ok') return false;
    const target = qualifyIssue(r.issue, project);
    return !closing.issues.some((issue) => sameIssue(issue, target));
  });
  if (toRead.length === 0) return undefined;
  const out: ReferenceEvidence[] = [];
  const seen = new Set<string>();
  const projectReadable = new Map<string, boolean>([[project.toLowerCase(), true]]);

  for (const reference of toRead) {
    if ('issue' in reference) {
      const ref = qualifyIssue(reference.issue, project);
      const key = `issue:${ref.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const repo = ref.split('#')[0] as string;
      let readable = projectReadable.get(repo.toLowerCase());
      if (readable === undefined) {
        readable = (await client.read('repository', projectPath(repo))).ok;
        projectReadable.set(repo.toLowerCase(), readable);
      }
      if (!readable) {
        out.push({ kind: 'issue', ref, ...unreadable('repository') });
        continue;
      }
      const { read, path } = await readIssue(client, ref);
      if (!read.ok) {
        out.push({ kind: 'issue', ref, ...unreadable('issue') });
        continue;
      }
      try {
        answeredIssue(read.json, ref);
      } catch (e) {
        if (!(e instanceof ShapeError)) throw e;
        client.markParseError(`GET ${path}`);
        out.push({ kind: 'issue', ref, ...unreadable('issue') });
        continue;
      }
      out.push({ kind: 'issue', ref, status: 'ok', exists: true });
      continue;
    }

    const ref = reference.commit;
    const key = `commit:${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const read = await client.read('commit', `${projectPath(project)}/repository/commits/${ref}`);
    if (!read.ok && (read.status === 404 || read.status === 410)) {
      out.push({ kind: 'commit', ref, status: 'ok', exists: false, reachableFromHead: false });
      continue;
    }
    if (!read.ok) {
      out.push({ kind: 'commit', ref, ...unreadable('commit') });
      continue;
    }
    const reachable = ref === headSha ? true : await isAncestor(client, project, ref, headSha);
    if (reachable === null) out.push({ kind: 'commit', ref, ...unreadable('compare') });
    else
      out.push({ kind: 'commit', ref, status: 'ok', exists: true, reachableFromHead: reachable });
  }
  return out;
}

// ---------------------------------------------------------------- who closed a closes target

async function readCloseBase(
  client: GitLabClient,
  project: string,
  mr: PullRequestRead,
): Promise<CloseBaseEvidence> {
  const path = projectPath(project);
  const read = await client.read('repository', path);
  if (!read.ok) return unreadable('repository');
  let defaultBranch: string | null;
  try {
    defaultBranch = strOrNull(obj(read.json).default_branch);
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    client.markParseError(`GET ${path}`);
    return unreadable('repository');
  }
  const commits = await readPages(
    client,
    'pull_request_commits',
    pages(`${mergeRequestPath(project, mr.evidence.number)}/commits`),
    (item) => commitOid(obj(item).id),
  );
  if (commits === null) return unreadable('pull_request_commits');
  return {
    status: 'ok',
    baseRef: mr.baseRef,
    defaultBranch,
    commits: [...new Set(commits)].sort(byCodeUnits),
  };
}

// A resource state event: a close as `{at, closer}`, or null for any other state (a reopen).
function closeEvent(item: unknown): CloseEvent | null {
  const e = obj(item);
  if (str(e.state) !== 'closed') return null;
  const at = timestamp(e.created_at);
  const source = e.source_merge_request;
  if (source !== null && source !== undefined) {
    const m = obj(source);
    const iid = int(m.iid);
    const url = MERGE_REQUEST_URL.exec(str(m.web_url));
    if (url === null || Number(url[2]) !== iid) throw new ShapeError();
    const ref = `${url[1]}#${iid}`;
    if (!ISSUE_REF.test(ref)) throw new ShapeError();
    return { at, closer: { kind: 'pull_request', ref } };
  }
  if (e.source_commit !== null && e.source_commit !== undefined) {
    return { at, closer: { kind: 'commit', oid: commitOid(e.source_commit) } };
  }
  return { at, closer: null };
}

async function readCloseTarget(client: GitLabClient, ref: string): Promise<CloseTargetEvidence> {
  const { read, path } = await readIssue(client, ref);
  if (!read.ok) return { ref, ...unreadable('issue') };
  let state: 'open' | 'closed';
  try {
    answeredIssue(read.json, ref);
    state = issueState(read.json);
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    client.markParseError(`GET ${path}`);
    return { ref, ...unreadable('issue') };
  }
  const events = await readPages(
    client,
    'issue',
    pages(`${path}/resource_state_events`),
    closeEvent,
    {
      maxPages: CLOSE_EVENT_PAGES,
    },
  );
  if (events === null) return { ref, ...unreadable('issue') };
  return {
    ref,
    status: 'ok',
    type: 'issue',
    state,
    events: events.filter((e): e is CloseEvent => e !== null),
  };
}

async function readCloseEvents(
  client: GitLabClient,
  project: string,
  mr: PullRequestRead,
  targets: readonly string[],
): Promise<CloseEventsEvidence> {
  const pullRequest = await readCloseBase(client, project, mr);
  const read: CloseTargetEvidence[] = [];
  for (const target of targets) read.push(await readCloseTarget(client, target));
  return { pullRequest, targets: read };
}

// ---------------------------------------------------------------- the head pipeline

type Unpopulated = { status: 'unpopulated'; field: string };

// The merge request's head pipeline, when it is for the block's headCommit; else why it is not read.
function pipelineAt(
  mr: MergeRequestRead,
  headCommit: string,
): { id: number; sha: string } | Unpopulated {
  if (mr.headPipeline === null) return { status: 'unpopulated', field: NO_HEAD_PIPELINE };
  if (mr.headPipeline.sha !== headCommit) {
    return { status: 'unpopulated', field: HEAD_PIPELINE_ELSEWHERE };
  }
  return mr.headPipeline;
}

// A job or bridge of the head pipeline as its listing gives it: its status as GitLab names it, and
// whether it has an artifacts archive, or had one that expired.
interface ListedJob {
  id: number;
  name: string;
  status: string;
  archive: boolean;
  expireAt: string | null;
  // The page that listed it.
  locator: string;
}

function listedJob(item: unknown, locator: string): ListedJob {
  const j = obj(item);
  const id = int(j.id);
  if (id < 1) throw new ShapeError();
  const files = j.artifacts === null || j.artifacts === undefined ? [] : arr(j.artifacts);
  const archive = files.some((f) => str(obj(f).file_type) === 'archive');
  const expires = j.artifacts_expire_at;
  return {
    id,
    name: str(j.name),
    status: str(j.status),
    archive,
    expireAt: expires === null || expires === undefined ? null : timestamp(expires),
    locator,
  };
}

// A job status as section 7.5 reads a check run's (profile G.3, the job status table): a closed
// list. A status not in it makes the check runs unparseable, so their claims are unverifiable.
// `failed` concludes `failure` whether or not the job is allowed to fail, and `manual` (never run)
// concludes `skipped`.
export const GITLAB_JOB_STATUSES: Readonly<
  Record<string, { status: string; conclusion: string | null }>
> = {
  success: { status: 'completed', conclusion: 'success' },
  failed: { status: 'completed', conclusion: 'failure' },
  canceled: { status: 'completed', conclusion: 'cancelled' },
  skipped: { status: 'completed', conclusion: 'skipped' },
  manual: { status: 'completed', conclusion: 'skipped' },
  created: { status: 'queued', conclusion: null },
  pending: { status: 'queued', conclusion: null },
  preparing: { status: 'queued', conclusion: null },
  waiting_for_resource: { status: 'queued', conclusion: null },
  scheduled: { status: 'queued', conclusion: null },
  running: { status: 'in_progress', conclusion: null },
};

function checkRunOf(job: ListedJob): CheckRun | null {
  if (!Object.hasOwn(GITLAB_JOB_STATUSES, job.status)) return null;
  const mapped = GITLAB_JOB_STATUSES[job.status] as { status: string; conclusion: string | null };
  return { id: job.id, name: job.name, ...mapped };
}

// The head pipeline's jobs, each at its latest attempt (`include_retried=false`: a retried job's
// earlier attempts are left out), read once for the check runs and the test records alike.
function jobsReader(
  client: GitLabClient,
  project: string,
  pipeline: number,
): () => Promise<ListedJob[] | null> {
  let read: Promise<ListedJob[] | null> | undefined;
  return () => {
    read ??= readPages(
      client,
      'check_runs',
      (page) =>
        `${projectPath(project)}/pipelines/${pipeline}/jobs?include_retried=false&per_page=${PER_PAGE}&page=${page}`,
      listedJob,
    );
    return read;
  };
}

// The check runs (profile G.3): the head pipeline's jobs and its bridges (trigger jobs), each by its
// own status. A status the table does not list marks the listing that gave it unparseable.
async function readCheckRuns(
  client: GitLabClient,
  project: string,
  pipeline: { id: number; sha: string },
  jobs: () => Promise<ListedJob[] | null>,
  excludedIds: readonly number[],
): Promise<CheckRunsEvidence> {
  const listed = await jobs();
  if (listed === null) return unreadable('check_runs');
  const bridgesPath = `${projectPath(project)}/pipelines/${pipeline.id}/bridges`;
  const bridges = await readPages(client, 'check_runs', pages(bridgesPath), listedJob);
  if (bridges === null) return unreadable('check_runs');
  const runs: CheckRun[] = [];
  for (const job of [...listed, ...bridges]) {
    const run = checkRunOf(job);
    if (run === null) {
      client.markParseError(job.locator);
      return unreadable('check_runs');
    }
    runs.push(run);
  }
  return {
    status: 'ok',
    commit: pipeline.sha,
    excludedIds: [...new Set(excludedIds)].sort((a, b) => a - b),
    runs: [...new Map(runs.map((r) => [r.id, r])).values()].sort((a, b) => a.id - b.id),
  };
}

// ---------------------------------------------------------------- JUnit test records

// The project's CI configuration file, the one its pipelines run (profile G.3): `ci_config_path`,
// or `.gitlab-ci.yml` where that is null or empty. Null when the project read fails, or gives no
// `ci_config_path` member (a reader that may not see it), so the record cannot say which file ran.
async function readCiConfigPath(client: GitLabClient, project: string): Promise<string | null> {
  const path = projectPath(project);
  const read = await client.read('repository', path);
  if (!read.ok) return null;
  try {
    const p = obj(read.json);
    if (!('ci_config_path' in p)) throw new ShapeError();
    const config = strOrNull(p.ci_config_path);
    return config === null || config === '' ? '.gitlab-ci.yml' : config;
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    client.markParseError(`GET ${path}`);
    return null;
  }
}

// The evidence for one `junit` record (profile G.3, testRecords): the head pipeline's job named
// `record.job`, its artifacts archive (`record.artifact` `archive`), and the file at `record.path`
// in it, counted by src/evidence/junit.ts as GitHub's artifact is. GitLab's own parsed test report
// is never read. A job that is not there, an archive it has not got, or a file not in the archive
// is no candidate run (record_not_found); an archive that expired, cannot be downloaded or does not
// parse is unreadable (`artifact`).
async function readTestRecord(
  client: GitLabClient,
  project: string,
  record: JunitRecord,
  jobs: () => Promise<ListedJob[] | null>,
  ciConfig: () => Promise<string | null>,
): Promise<TestRecordEvidence> {
  const config = await ciConfig();
  if (config === null) return { record, ...unreadable('repository') };
  // The record names another file than the one the project's pipelines run: no candidate run.
  if (config !== record.workflow) return { record, status: 'ok', runs: [] };
  const listed = await jobs();
  if (listed === null) return { record, ...unreadable('check_runs') };
  const runs: TestRecordRun[] = [];
  const named = listed.filter((j) => j.name === record.job).sort((a, b) => a.id - b.id);
  for (const job of named) {
    if (record.artifact !== 'archive') continue;
    if (!job.archive) {
      // The job's artifacts had an expiry and the listing gives no archive: they expired.
      if (job.expireAt !== null) return { record, ...unreadable('artifact') };
      continue;
    }
    const zipPath = `${projectPath(project)}/jobs/${job.id}/artifacts`;
    const download = await client.read('artifact', zipPath, {
      json: false,
      locatorSuffix: `#${record.path}`,
    });
    if (!download.ok) return { record, ...unreadable('artifact') };
    try {
      const file = readZipEntry(download.body, record.path, client.maxEntryBytes);
      if (file === null) continue;
      const counts = countJunit(new TextDecoder('utf-8').decode(file));
      // A retried job is a new job with a new id, so the id names the attempt.
      runs.push({ runId: job.id, runAttempt: 1, ...counts });
    } catch (e) {
      if (!(e instanceof ZipError || e instanceof JunitError)) throw e;
      client.markParseError(`GET ${zipPath}#${record.path}`);
      return { record, ...unreadable('artifact') };
    }
  }
  return { record, status: 'ok', runs };
}

// ---------------------------------------------------------------- deployments

// A deployment status (profile G.3, the deployment status table): a closed list. Only `success` is
// a successful deployment; a status not listed makes the listing unparseable.
export const GITLAB_DEPLOYMENT_STATUSES: Readonly<Record<string, boolean>> = {
  success: true,
  created: false,
  running: false,
  failed: false,
  canceled: false,
  skipped: false,
  blocked: false,
};

interface ListedDeployment {
  id: number;
  sha: string;
  createdAt: string;
  // `updated_at` of a `success` deployment, else null.
  successAt: string | null;
}

function second(t: string): string {
  return t.slice(0, 19);
}

function listedDeployment(environment: string) {
  return (item: unknown): ListedDeployment => {
    const d = obj(item);
    const id = int(d.id);
    if (id < 1) throw new ShapeError();
    // The listing is asked for one environment; an item of another is not an answer to it.
    if (str(obj(d.environment).name) !== environment) throw new ShapeError();
    const status = str(d.status);
    if (!Object.hasOwn(GITLAB_DEPLOYMENT_STATUSES, status)) throw new ShapeError();
    const updatedAt = timestamp(d.updated_at);
    return {
      id,
      sha: commitOid(d.sha),
      createdAt: timestamp(d.created_at),
      successAt: GITLAB_DEPLOYMENT_STATUSES[status] === true ? updatedAt : null,
    };
  };
}

// The deployments to the named environment (profile G.3, deployments): every one of the head, and,
// for a merged merge request, every one created between the merge and the declared time, each with
// its relation to the merge request as section 7.6 gives it.
async function readDeployments(
  client: GitLabClient,
  project: string,
  pr: PullRequestEvidence,
  deployedAt: { at: string; environment: string },
): Promise<DeploymentsEvidence> {
  const environment = deployedAt.environment;
  const listed = await readPages(
    client,
    'deployments',
    (page) =>
      `${projectPath(project)}/deployments?environment=${encodeURIComponent(environment)}&order_by=id&sort=desc&per_page=${PER_PAGE}&page=${page}`,
    listedDeployment(environment),
  );
  if (listed === null) return { environment, ...unreadable('deployments') };
  const window =
    pr.merged && pr.mergedAt !== null && pr.mergeSha !== null
      ? { from: second(pr.mergedAt), to: second(deployedAt.at) }
      : null;
  const candidates = new Map<number, ListedDeployment>();
  for (const d of listed) {
    const created = second(d.createdAt);
    const inWindow = window !== null && created >= window.from && created <= window.to;
    if (d.sha === pr.headSha || inWindow) candidates.set(d.id, d);
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
        const ancestor = await isAncestor(client, project, pr.mergeSha, d.sha);
        known = ancestor === null ? 'unknown' : ancestor ? 'descendant' : 'unrelated';
        related.set(d.sha, known);
      }
      relation = known;
    }
    deployments.push({ id: d.id, sha: d.sha, relation, successAt: d.successAt });
  }
  return { environment, status: 'ok', deployments };
}

// ---------------------------------------------------------------- the whole snapshot

export async function readGitLabEvidence(
  client: GitLabClient,
  input: ReadEvidenceInput,
): Promise<Evidence> {
  const { block, repository } = input;
  const mr = input.pullRequest as MergeRequestRead;
  if (mr.files === undefined) throw new Error('the GitLab reader reads a merge request it read');
  const pr = mr.evidence;
  const evidence: Evidence = { pullRequest: pr, sources: [] };
  if (block !== null) {
    evidence.files = mr.files;
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
    const targets = closeTargets(block, repository, evidence.closingReferences, references);
    if (targets.length > 0) {
      evidence.closeEvents = await readCloseEvents(client, repository, mr, targets);
    }
    const pipeline = pipelineAt(mr, block.headCommit);
    const jobs = 'id' in pipeline ? jobsReader(client, repository, pipeline.id) : null;
    if (block.checks !== undefined) {
      evidence.checkRuns =
        'id' in pipeline && jobs !== null
          ? await readCheckRuns(client, repository, pipeline, jobs, input.excludedCheckRunIds ?? [])
          : (pipeline as Unpopulated);
    }
    const records = new Map<string, JunitRecord>();
    for (const test of block.tests ?? []) {
      if (test.record.kind !== 'junit') continue;
      const record = test.record as JunitRecord;
      records.set(canonicalize(record as unknown as JsonValue), record);
    }
    if (records.size > 0) {
      evidence.testRecords = [];
      let config: Promise<string | null> | undefined;
      const ciConfig = () => {
        config ??= readCiConfigPath(client, repository);
        return config;
      };
      for (const record of records.values()) {
        evidence.testRecords.push(
          'id' in pipeline && jobs !== null
            ? await readTestRecord(client, repository, record, jobs, ciConfig)
            : { record, ...(pipeline as Unpopulated) },
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

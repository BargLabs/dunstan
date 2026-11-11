// A small in-memory GitLab for tests: a fetch function that answers the REST reads the GitLab
// evidence reader makes (spec/claim-format.md, "DRAFT GitLab profile 0.1"), from a scenario object.
// Any request the scenario does not cover answers 404, and every request is logged with its headers
// so tests can assert what was (and was not) read, and with what. The project is
// example-org/example-repo: no real project's names are in a fixture.

import { junitXml, makeZip } from './fake-github.js';

export const GL_PROJECT = 'example-org/example-repo';
export const GL_ID = 'example-org%2Fexample-repo';
export const GL_HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
export const GL_MERGE = 'decade00decade00decade00decade00decade00';
export const GL_PARENT = 'face0000face0000face0000face0000face0000';
export const GL_ELSEWHERE = 'beef0000beef0000beef0000beef0000beef0000';

export interface GitLabScenario {
  // The subject project's full path; GL_PROJECT unless given.
  project?: string;
  mr: Record<string, unknown>;
  // A merge request that moves while it is read: the n-th read answers `mr` with mrMoves[n] over
  // it, the last once they run out.
  mrMoves?: Record<string, unknown>[];
  // An HTTP status for the merge request read.
  mrStatus?: number;
  diffs?: Record<string, unknown>[];
  diffsStatus?: number;
  closes?: Record<string, unknown>[];
  closesStatus?: number;
  // `namespace/project#N` -> an HTTP status, or the body the issue read answers with. One not
  // listed answers an open issue that names itself.
  issues?: Record<string, number | Record<string, unknown>>;
  // `namespace/project` -> an HTTP status, or the project body. One not listed answers a project
  // whose default branch is `main`.
  projects?: Record<string, number | Record<string, unknown>>;
  // A commit id -> the HTTP status its read answers; one not listed answers 404.
  commits?: Record<string, number>;
  // A commit id -> the merge base GitLab answers for it and the head, or an HTTP status.
  mergeBase?: Record<string, string | number>;
  mrCommits?: string[];
  mrCommitsStatus?: number;
  // `namespace/project#N` -> its resource state events as GitLab sends them, or an HTTP status.
  stateEvents?: Record<string, Record<string, unknown>[] | number>;
  // The head pipeline's jobs and bridges, as the listings answer them, or an HTTP status. They are
  // answered for any pipeline id; the merge request's `head_pipeline` says which one is read.
  jobs?: Record<string, unknown>[] | number;
  bridges?: Record<string, unknown>[] | number;
  // A job id -> its artifacts archive's bytes, or an HTTP status; one not listed answers 404.
  artifacts?: Record<number, Uint8Array | number>;
  // The project's deployments, every environment's, as GitLab lists them, or an HTTP status. The
  // listing is filtered by `environment` and answered in the order given.
  deployments?: Record<string, unknown>[] | number;
}

export interface LoggedRequest {
  url: string;
  headers: Record<string, string>;
}

export function issueReference(ref: string): Record<string, unknown> {
  const [project, iid] = ref.split('#') as [string, string];
  return {
    iid: Number(iid),
    state: 'opened',
    references: { short: `#${iid}`, relative: `#${iid}`, full: ref },
    web_url: `https://gitlab.com/${project}/-/issues/${iid}`,
  };
}

export function baseMergeRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 9001,
    iid: 1,
    project_id: 42,
    title: 'A change',
    state: 'merged',
    merged_at: '2026-11-01T12:00:00.000Z',
    sha: GL_HEAD,
    merge_commit_sha: GL_MERGE,
    squash_commit_sha: null,
    target_branch: 'main',
    source_branch: 'feature',
    changes_count: '3',
    description: '',
    references: { short: '!1', relative: '!1', full: `${GL_PROJECT}!1` },
    web_url: `https://gitlab.com/${GL_PROJECT}/-/merge_requests/1`,
    ...overrides,
  };
}

// A rename, an addition and a deletion, each with the diff GitLab sends beside it.
export function baseDiffs(): Record<string, unknown>[] {
  return [
    {
      old_path: 'src/old-name.ts',
      new_path: 'src/new-name.ts',
      new_file: false,
      renamed_file: true,
      deleted_file: false,
      diff: '@@ -1 +1 @@\n-FILE-CONTENT-OLD\n+FILE-CONTENT-NEW\n',
    },
    {
      old_path: 'src/added.ts',
      new_path: 'src/added.ts',
      new_file: true,
      renamed_file: false,
      deleted_file: false,
      diff: '@@ -0,0 +1 @@\n+FILE-CONTENT-ADDED\n',
    },
    {
      old_path: 'docs/gone.md',
      new_path: 'docs/gone.md',
      new_file: false,
      renamed_file: false,
      deleted_file: true,
      diff: '@@ -1 +0,0 @@\n-FILE-CONTENT-GONE\n',
    },
  ];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function page<T>(items: readonly T[], url: URL): T[] {
  const perPage = Number(url.searchParams.get('per_page') ?? '20');
  const n = Number(url.searchParams.get('page') ?? '1');
  return items.slice((n - 1) * perPage, n * perPage);
}

export function fakeGitLab(s: GitLabScenario): {
  fetch: typeof fetch;
  requests: LoggedRequest[];
} {
  const requests: LoggedRequest[] = [];
  let mrReads = 0;
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    requests.push({ url: url.toString(), headers });
    const path = url.pathname;
    const m = /^\/api\/v4\/projects\/([^/]+)(\/.*)?$/.exec(path);
    if (m === null) return json(404, { message: '404 Not Found' });
    const project = decodeURIComponent(m[1] as string);
    const rest = m[2] ?? '';

    if (rest === '') {
      const answer = s.projects?.[project];
      if (typeof answer === 'number') return json(answer, { message: 'no' });
      return json(
        200,
        answer ?? { path_with_namespace: project, default_branch: 'main', ci_config_path: null },
      );
    }
    if (project !== (s.project ?? GL_PROJECT) && !rest.startsWith('/issues/')) {
      return json(404, { message: '404 Project Not Found' });
    }
    if (rest === '/merge_requests/1') {
      if (s.mrStatus !== undefined) return json(s.mrStatus, { message: 'no' });
      const moves = s.mrMoves ?? [];
      const over = moves.length === 0 ? {} : moves[Math.min(mrReads, moves.length - 1)];
      mrReads++;
      return json(200, { ...s.mr, ...over });
    }
    if (rest === '/merge_requests/1/diffs') {
      if (s.diffsStatus !== undefined) return json(s.diffsStatus, { message: 'no' });
      return json(200, page(s.diffs ?? [], url));
    }
    if (rest === '/merge_requests/1/closes_issues') {
      if (s.closesStatus !== undefined) return json(s.closesStatus, { message: 'no' });
      return json(200, page(s.closes ?? [], url));
    }
    if (rest === '/merge_requests/1/commits') {
      if (s.mrCommitsStatus !== undefined) return json(s.mrCommitsStatus, { message: 'no' });
      return json(
        200,
        page(
          (s.mrCommits ?? [GL_HEAD]).map((id) => ({ id, short_id: id.slice(0, 8) })),
          url,
        ),
      );
    }
    const commit = /^\/repository\/commits\/([0-9a-f]{40})$/.exec(rest);
    if (commit !== null) {
      const sha = commit[1] as string;
      const status = s.commits?.[sha] ?? 404;
      return status === 200 ? json(200, { id: sha }) : json(status, { message: 'no' });
    }
    if (rest === '/repository/merge_base') {
      const refs = url.searchParams.getAll('refs[]');
      const base = s.mergeBase?.[refs[0] as string];
      if (base === undefined) return json(404, { message: 'no' });
      if (typeof base === 'number') return json(base, { message: 'no' });
      return json(200, { id: base });
    }
    const listing = /^\/pipelines\/([0-9]+)\/(jobs|bridges)$/.exec(rest);
    if (listing !== null) {
      const items = listing[2] === 'jobs' ? s.jobs : s.bridges;
      if (typeof items === 'number') return json(items, { message: 'no' });
      return json(200, page(items ?? [], url));
    }
    const artifacts = /^\/jobs\/([0-9]+)\/artifacts$/.exec(rest);
    if (artifacts !== null) {
      const answer = s.artifacts?.[Number(artifacts[1])];
      if (answer === undefined) return json(404, { message: '404 Not Found' });
      if (typeof answer === 'number') return json(answer, { message: 'no' });
      return new Response(answer, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    }
    if (rest === '/deployments') {
      if (typeof s.deployments === 'number') return json(s.deployments, { message: 'no' });
      const environment = url.searchParams.get('environment');
      const listed = (s.deployments ?? []).filter(
        (d) => environment === null || (d.environment as { name?: string })?.name === environment,
      );
      return json(200, page(listed, url));
    }
    const issue = /^\/issues\/([0-9]+)(\/resource_state_events)?$/.exec(rest);
    if (issue !== null) {
      const ref = `${project}#${issue[1]}`;
      if (issue[2] !== undefined) {
        const events = s.stateEvents?.[ref] ?? [];
        if (typeof events === 'number') return json(events, { message: 'no' });
        return json(200, page(events, url));
      }
      const answer = s.issues?.[ref];
      if (typeof answer === 'number') return json(answer, { message: '404 Not found' });
      return json(200, answer ?? issueReference(ref));
    }
    return json(404, { message: '404 Not Found' });
  };
  return { fetch: fake as typeof fetch, requests };
}

// A job of the head pipeline as the jobs listing gives it. `archive` gives it an artifacts archive.
export function glJob(
  id: number,
  name: string,
  status: string,
  options: { archive?: boolean; expireAt?: string | null; allowFailure?: boolean } = {},
): Record<string, unknown> {
  return {
    id,
    name,
    status,
    stage: 'test',
    allow_failure: options.allowFailure ?? false,
    artifacts:
      options.archive === true
        ? [{ file_type: 'archive', size: 100, filename: 'artifacts.zip', file_format: 'zip' }]
        : [],
    artifacts_expire_at: options.expireAt ?? null,
  };
}

// The job dunstan template's GitLab tests read by default, and its id.
export const GL_TEST_JOB = 'test';
export const GL_TEST_JOB_ID = 7001;

// An open merge request whose head is `head` (a featureRepository's HEAD: it changes src/a.ts and
// adds src/b.ts), its head pipeline at `pipeline.sha` (head unless given; none for null), and the
// jobs given; by default one job `test` whose archive holds junit.xml with 142 passing tests.
export function templateMergeRequest(
  head: string,
  options: {
    pipeline?: { sha: string } | null;
    mrSha?: string;
    jobs?: Record<string, unknown>[];
    artifacts?: Record<number, Uint8Array | number>;
    project?: Record<string, unknown> | number;
    mrStatus?: number;
  } = {},
): GitLabScenario {
  const pipeline =
    options.pipeline === null ? null : { id: 501, sha: options.pipeline?.sha ?? head };
  const passing = junitXml(Array<'pass'>(142).fill('pass'));
  return {
    mr: baseMergeRequest({
      state: 'opened',
      merged_at: null,
      sha: options.mrSha ?? head,
      merge_commit_sha: null,
      changes_count: '2',
      head_pipeline: pipeline,
    }),
    ...(options.mrStatus === undefined ? {} : { mrStatus: options.mrStatus }),
    diffs: [
      {
        old_path: 'src/a.ts',
        new_path: 'src/a.ts',
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        diff: '',
      },
      {
        old_path: 'src/b.ts',
        new_path: 'src/b.ts',
        new_file: true,
        renamed_file: false,
        deleted_file: false,
        diff: '',
      },
    ],
    ...(options.project === undefined ? {} : { projects: { [GL_PROJECT]: options.project } }),
    jobs: options.jobs ?? [glJob(GL_TEST_JOB_ID, GL_TEST_JOB, 'success', { archive: true })],
    artifacts: options.artifacts ?? { [GL_TEST_JOB_ID]: makeZip({ 'junit.xml': passing }) },
  };
}

// A deployment as the deployments listing gives it.
export function glDeployment(
  id: number,
  sha: string,
  status: string,
  createdAt: string,
  updatedAt: string,
  environment = 'production',
): Record<string, unknown> {
  return {
    id,
    iid: id,
    ref: 'main',
    sha,
    status,
    created_at: createdAt,
    updated_at: updatedAt,
    environment: { id: 1, name: environment },
  };
}

// A merge request's closing state event, as GitLab sends one closed by a merge request.
export function closedByMergeRequest(at: string, project: string, iid: number) {
  return {
    id: 1,
    state: 'closed',
    created_at: at,
    resource_type: 'Issue',
    source_commit: null,
    source_merge_request: {
      iid,
      web_url: `https://gitlab.com/${project}/-/merge_requests/${iid}`,
    },
  };
}

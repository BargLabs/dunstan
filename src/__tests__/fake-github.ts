// A small in-memory GitHub for tests: a fetch function that answers the REST and GraphQL reads the
// evidence reader makes, from a scenario object. Any request the scenario does not cover answers 404,
// and every request is logged so tests can assert what was (and was not) read.

import { deflateRawSync } from 'node:zlib';

export const REPO = 'example-org/example-repo';
export const HEAD = 'a11ce5e0c0ffee00d00dfeed0000111122223333';
export const MERGE = 'feedface00000000000000000000000000000001';

export interface Scenario {
  pr: Record<string, unknown>;
  files?: Record<string, unknown>[];
  closing?: string[] | null;
  issues?: Record<string, number>;
  repositories?: Record<string, number>;
  commits?: Record<string, number>;
  // `${base}...${head}` -> behind_by, or an HTTP status when it is >= 400.
  compare?: Record<string, number>;
  checkRuns?: Record<string, unknown>[];
  checkRunsStatus?: number;
  workflowRuns?: Record<string, unknown>[];
  jobs?: Record<number, string[]>;
  artifacts?: Record<number, Record<string, unknown>[]>;
  zips?: Record<number, Uint8Array>;
  deployments?: Record<string, unknown>[];
  statuses?: Record<number, Record<string, unknown>[]>;
  comments?: Record<string, unknown>[];
  // The advisory's path query: `${commit}:${path}` -> the object GitHub answers (its `__typename`
  // and whatever else a test puts beside it), null for no object, or an HTTP status when it is a
  // number. An expression not listed answers null.
  objects?: Record<string, Record<string, unknown> | null | number>;
  // path (without query) -> sequence of statuses to answer before the real answer.
  flaky?: Record<string, number[]>;
}

export function basePullRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 7,
    state: 'open',
    merged: false,
    merged_at: null,
    merge_commit_sha: 'aaaabbbbccccddddeeeeffff0000111122223333',
    changed_files: 2,
    head: { sha: HEAD },
    base: { repo: { full_name: REPO } },
    body: 'no block here',
    ...overrides,
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', etag: `"${status}"`, ...headers },
  });
}

function page<T>(items: T[], url: URL): T[] {
  const perPage = Number(url.searchParams.get('per_page') ?? '30');
  const n = Number(url.searchParams.get('page') ?? '1');
  return items.slice((n - 1) * perPage, n * perPage);
}

export interface FakeGitHub {
  fetch: typeof fetch;
  requests: string[];
  // The body of every GraphQL request, as sent.
  graphql: string[];
}

export function fakeGitHub(scenario: Scenario): FakeGitHub {
  const requests: string[] = [];
  const graphql: string[] = [];
  const flaky = structuredClone(scenario.flaky ?? {});
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const path = url.pathname;
    requests.push(`${init?.method ?? 'GET'} ${path}${url.search}`);
    const pending = flaky[path];
    if (pending !== undefined && pending.length > 0) {
      const status = pending.shift() as number;
      return json(
        status,
        { message: 'flaky' },
        status === 403 ? { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' } : {},
      );
    }
    const base = `/repos/${REPO}`;
    const n = (m: RegExpExecArray) => Number(m[1]);

    if (path === '/graphql') {
      const text = typeof init?.body === 'string' ? init.body : '';
      graphql.push(text);
      const body = JSON.parse(text === '' ? '{}' : text) as {
        query?: string;
        variables?: { expression?: string };
      };
      if (body.query?.includes('object(expression') === true) {
        const answer = scenario.objects?.[body.variables?.expression ?? ''] ?? null;
        if (typeof answer === 'number') return json(answer, { message: 'error' });
        return json(200, { data: { repository: { object: answer } } });
      }
      if (scenario.closing === undefined) {
        return json(200, { data: { repository: { pullRequest: {} } } });
      }
      const connection =
        scenario.closing === null
          ? null
          : {
              nodes: scenario.closing.map((ref) => {
                const [nameWithOwner, number] = ref.split('#');
                return { number: Number(number), repository: { nameWithOwner } };
              }),
              pageInfo: { hasNextPage: false, endCursor: null },
            };
      return json(200, {
        data: { repository: { pullRequest: { closingIssuesReferences: connection } } },
      });
    }
    if (path === `${base}/pulls/${scenario.pr.number}`) return json(200, scenario.pr);
    if (path === `${base}/pulls/${scenario.pr.number}/files`) {
      return json(200, page(scenario.files ?? [], url));
    }
    if (path === `${base}/issues/${scenario.pr.number}/comments`) {
      return json(200, page(scenario.comments ?? [], url));
    }
    if (path === `${base}/deployments`) {
      const sha = url.searchParams.get('sha');
      const env = url.searchParams.get('environment');
      const all = (scenario.deployments ?? [])
        .filter((d) => d.environment === env && (sha === null || d.sha === sha))
        .sort((a, b) => (String(b.created_at) < String(a.created_at) ? -1 : 1));
      return json(200, page(all, url));
    }

    const routes: [RegExp, (m: RegExpExecArray) => Response][] = [
      [
        /^\/repos\/([^/]+\/[^/]+)$/,
        (m) => {
          const status = scenario.repositories?.[m[1] as string] ?? (m[1] === REPO ? 200 : 404);
          return json(status, { full_name: m[1] });
        },
      ],
      [
        /^\/repos\/([^/]+\/[^/]+)\/issues\/([0-9]+)$/,
        (m) => json(scenario.issues?.[`${m[1]}#${m[2]}`] ?? 404, { number: Number(m[2]) }),
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/git\/commits\/([0-9a-f]{40})$/,
        (m) => json(scenario.commits?.[m[1] as string] ?? 404, { sha: m[1] }),
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/compare\/([0-9a-f]{40}\.\.\.[0-9a-f]{40})$/,
        (m) => {
          const answer = scenario.compare?.[m[1] as string];
          if (answer === undefined) return json(404, { message: 'Not Found' });
          return answer >= 400
            ? json(answer, { message: 'error' })
            : json(200, { behind_by: answer });
        },
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/commits\/([0-9a-f]{40})\/check-runs$/,
        () => {
          if (scenario.checkRunsStatus !== undefined) {
            return json(scenario.checkRunsStatus, { message: 'x' });
          }
          const runs = scenario.checkRuns ?? [];
          return json(200, { total_count: runs.length, check_runs: page(runs, url) });
        },
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/actions\/workflows\/([^/]+)\/runs$/,
        (m) => {
          if (scenario.workflowRuns === undefined) return json(404, { message: 'Not Found' });
          const runs = scenario.workflowRuns.filter(
            (r) =>
              String(r.path).endsWith(`/${m[1]}`) &&
              r.head_sha === url.searchParams.get('head_sha'),
          );
          return json(200, { total_count: runs.length, workflow_runs: page(runs, url) });
        },
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/actions\/runs\/([0-9]+)\/jobs$/,
        (m) => {
          const jobs = (scenario.jobs?.[n(m)] ?? []).map((name, i) => ({ id: i + 1, name }));
          return json(200, { total_count: jobs.length, jobs: page(jobs, url) });
        },
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/actions\/runs\/([0-9]+)\/artifacts$/,
        (m) => {
          const name = url.searchParams.get('name');
          const artifacts = (scenario.artifacts?.[n(m)] ?? []).filter(
            (a) => name === null || a.name === name,
          );
          return json(200, { total_count: artifacts.length, artifacts: page(artifacts, url) });
        },
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/actions\/artifacts\/([0-9]+)\/zip$/,
        (m) => {
          const zip = scenario.zips?.[n(m)];
          return zip === undefined ? json(410, { message: 'Gone' }) : new Response(zip);
        },
      ],
      [
        /^\/repos\/[^/]+\/[^/]+\/deployments\/([0-9]+)\/statuses$/,
        (m) => json(200, page(scenario.statuses?.[n(m)] ?? [], url)),
      ],
    ];
    for (const [pattern, answer] of routes) {
      const m = pattern.exec(path);
      if (m !== null) return answer(m);
    }
    return json(404, { message: 'Not Found' });
  };
  return { fetch: fake as typeof fetch, requests, graphql };
}

// A ZIP archive (deflated entries) for artifact downloads.
export function makeZip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

export function junitXml(cases: ('pass' | 'fail' | 'error' | 'skip')[]): string {
  const body = cases
    .map((c, i) => {
      const inner =
        c === 'fail'
          ? '<failure message="x"/>'
          : c === 'error'
            ? '<error/>'
            : c === 'skip'
              ? '<skipped/>'
              : '';
      return `    <testcase name="t${i}" classname="suite">${inner}</testcase>`;
    })
    .join('\n');
  // Suite-level counts deliberately disagree with the test cases: they are never read.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="999" failures="999">\n  <testsuite name="suite" tests="999">\n${body}\n  </testsuite>\n</testsuites>\n`;
}

// The checks probe, on a fake GitHub only: no test reaches the network (fetch throws), and none
// runs the probe against a repository.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  answers,
  BRANCH,
  DEFAULT_RESULTS,
  parseArgs,
  Refused,
  runProbe,
  SANDBOX,
  Session,
  WAIT,
  WORKFLOWS,
} from './probe.mjs';

const INITIAL = 'a'.repeat(40);
const COMMIT = 'c'.repeat(40);

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('no network in tests');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// A small stateful GitHub. Creating the probe's branch starts the three workflows on push, and
// opening the pull request starts the third again on pull_request, in a suite of its own; each run
// reads as in progress for `pending` polls, then completed. `rerunNewSuite` records a re-run
// attempt in a new check suite, and the listing then gives the run with that suite;
// `latestPerName` makes filter=latest keep one run per name across the commit instead of one per
// check suite and name. Both are what the real probe is there to observe.
function fakeGitHub({ branchExists = false, rerunNewSuite = false, latestPerName = false } = {}) {
  const requests = [];
  const runs = [];
  const checkRuns = [];
  let pending = 0;
  const json = (status, body) =>
    new Response(body === undefined ? '' : JSON.stringify(body), { status });
  const run = (id) => runs.find((r) => r.id === id);
  const addJob = (r, id, name, conclusion) => {
    r.jobs.push({ id, run_id: r.id, run_attempt: r.run_attempt, name, conclusion });
    checkRuns.push({
      id,
      name,
      status: 'completed',
      conclusion,
      check_suite: { id: r.check_suite_id },
      app: { slug: 'github-actions' },
      html_url: `https://github.com/${SANDBOX}/actions/runs/${r.id}/job/${id}`,
    });
  };
  const latest = () => {
    const kept = new Map();
    for (const c of checkRuns) {
      const key = latestPerName ? c.name : `${c.check_suite.id}/${c.name}`;
      if (!kept.has(key) || kept.get(key).id < c.id) kept.set(key, c);
    }
    return [...kept.values()];
  };
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const u = new URL(url);
    const path = u.pathname;
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    requests.push({ method, path: `${path}${u.search}`, body });
    const base = `/repos/${SANDBOX}`;
    if (method === 'GET' && path === base) return json(200, { default_branch: 'main' });
    if (method === 'GET' && path === `${base}/branches/${BRANCH}`) {
      return branchExists ? json(200, { commit: { sha: COMMIT } }) : json(404, { message: 'x' });
    }
    if (method === 'GET' && path === `${base}/branches/main`) {
      return json(200, { commit: { sha: INITIAL } });
    }
    if (method === 'GET' && path === `${base}/git/commits/${INITIAL}`) {
      return json(200, { tree: { sha: 't0' } });
    }
    if (method === 'POST' && path === `${base}/git/trees`) return json(201, { sha: 't1' });
    if (method === 'POST' && path === `${base}/git/commits`) return json(201, { sha: COMMIT });
    if (method === 'POST' && path === `${base}/git/refs`) {
      const onPush = (id, path, suite) => ({
        id,
        path,
        event: 'push',
        run_attempt: 1,
        check_suite_id: suite,
      });
      for (const r of [
        onPush(801, WORKFLOWS[0].path, 6001),
        onPush(802, WORKFLOWS[1].path, 6002),
        onPush(803, WORKFLOWS[2].path, 6004),
      ])
        runs.push({ ...r, conclusion: null, jobs: [], attempts: [] });
      addJob(run(801), 9001, 'test', 'failure');
      addJob(run(802), 9002, 'first', 'success');
      addJob(run(802), 9003, 'test', 'success');
      addJob(run(803), 9005, 'build', 'success');
      run(801).attempts.push({ check_suite_id: 6001, conclusion: 'failure' });
      run(801).conclusion = 'failure';
      for (const id of [802, 803]) {
        run(id).attempts.push({ check_suite_id: run(id).check_suite_id, conclusion: 'success' });
        run(id).conclusion = 'success';
      }
      pending = 1;
      return json(201, {});
    }
    if (method === 'POST' && path === `${base}/pulls`) {
      runs.push({
        id: 804,
        path: WORKFLOWS[2].path,
        event: 'pull_request',
        run_attempt: 1,
        check_suite_id: 6005,
        conclusion: 'success',
        jobs: [],
        attempts: [{ check_suite_id: 6005, conclusion: 'success' }],
      });
      addJob(run(804), 9006, 'build', 'success');
      pending = 1;
      return json(201, { number: 1 });
    }
    const rerun = path.match(/\/actions\/runs\/(\d+)\/rerun-failed-jobs$/);
    if (method === 'POST' && rerun) {
      const r = run(Number(rerun[1]));
      r.run_attempt = 2;
      if (rerunNewSuite) r.check_suite_id = 6003;
      addJob(r, 9004, 'test', 'success');
      r.attempts.push({ check_suite_id: r.check_suite_id, conclusion: 'success' });
      r.conclusion = 'success';
      pending = 1;
      return json(201);
    }
    if (method === 'GET' && path === `${base}/actions/runs`) {
      const status = pending > 0 ? 'in_progress' : 'completed';
      if (pending > 0) pending--;
      return json(200, {
        workflow_runs: [
          ...runs.map((r) => ({ ...r, status, jobs: undefined, attempts: undefined })),
          {
            id: 999,
            path: '.github/workflows/ci.yml',
            event: 'push',
            run_attempt: 1,
            check_suite_id: 6999,
            status: 'completed',
          },
        ],
      });
    }
    const attempt = path.match(/\/actions\/runs\/(\d+)\/attempts\/(\d+)$/);
    if (method === 'GET' && attempt) {
      return json(200, run(Number(attempt[1])).attempts[Number(attempt[2]) - 1]);
    }
    const jobs = path.match(/\/actions\/runs\/(\d+)\/jobs$/);
    if (method === 'GET' && jobs) {
      return json(200, {
        jobs: run(Number(jobs[1])).jobs.map((j) => ({ ...j, status: 'completed' })),
      });
    }
    if (method === 'GET' && path === `${base}/commits/${COMMIT}/check-runs`) {
      const filter = u.searchParams.get('filter');
      return json(200, { check_runs: filter === 'latest' ? latest() : checkRuns });
    }
    if (method === 'GET' && path === `${base}/commits/${COMMIT}/check-suites`) {
      const ids = [...new Set(checkRuns.map((c) => c.check_suite.id))];
      return json(200, {
        check_suites: ids.map((id) => ({
          id,
          app: { slug: 'github-actions' },
          status: 'completed',
        })),
      });
    }
    return json(500, { message: `fake: no route for ${method} ${path}` });
  };
  return { fetch, requests };
}

const tempResults = () => join(mkdtempSync(join(tmpdir(), 'checks-probe-')), 'results.json');

function options(fake, overrides = {}) {
  const log = [];
  return {
    log,
    args: {
      repo: SANDBOX,
      execute: true,
      results: tempResults(),
      token: 't',
      fetch: fake.fetch,
      sleep: async () => {},
      log: (m) => log.push(m),
      now: () => '2026-10-12T00:00:00.000Z',
      ...overrides,
    },
  };
}

describe('parseArgs', () => {
  it('is a dry run unless --execute, and writes results.json beside the probe', () => {
    expect(parseArgs(['--repo', SANDBOX])).toEqual({
      repo: SANDBOX,
      execute: false,
      results: DEFAULT_RESULTS,
    });
    expect(parseArgs(['--repo', SANDBOX, '--execute']).execute).toBe(true);
    expect(parseArgs(['--repo', SANDBOX, '--execute', '--dry-run']).execute).toBe(false);
  });

  it('refuses a missing repository, any repository but the sandbox, and an unknown argument', () => {
    expect(() => parseArgs([])).toThrow(Refused);
    expect(() => parseArgs(['--repo', 'example-org/example-repo'])).toThrow(/not the sandbox/);
    expect(() => parseArgs(['--repo', SANDBOX, '--force'])).toThrow(/unknown argument/);
  });

  it('refuses a session on any repository but the sandbox', () => {
    expect(() => new Session({ repo: 'example-org/example-repo' })).toThrow(Refused);
  });
});

describe('the workflows', () => {
  it('are two with a job named test, the one that fails failing on its first attempt only, and one on push and pull_request', () => {
    expect(WORKFLOWS).toHaveLength(3);
    for (const w of WORKFLOWS) {
      expect(w.path).toMatch(/^\.github\/workflows\/checks-probe-[a-z-]+\.yml$/);
      expect(w.content).toContain(`branches: [${BRANCH}]`);
    }
    for (const w of WORKFLOWS.slice(0, 2)) {
      expect(w.content).toMatch(/\n {2}test:\n/);
      expect(w.events).toEqual(['push']);
    }
    expect(WORKFLOWS[0].content).toContain('test "$GITHUB_RUN_ATTEMPT" != 1');
    expect(WORKFLOWS[1].content).toContain('needs: first');
    // Its job is not `test`, so it bears on no answer about the two above.
    expect(WORKFLOWS[2].content).not.toMatch(/\n {2}test:\n/);
    expect(WORKFLOWS[2].content).toMatch(/\n {2}pull_request:\n/);
    expect(WORKFLOWS[2].events).toEqual(['push', 'pull_request']);
  });
});

describe('runProbe', () => {
  it('a dry run reads only, prints every write and writes nothing', async () => {
    const fake = fakeGitHub();
    const { args, log } = options(fake, { execute: false });
    expect(await runProbe(args)).toBeNull();
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(log.filter((m) => m.startsWith('would write: '))).toHaveLength(5);
    expect(existsSync(args.results)).toBe(false);
  });

  it('refuses when the branch is already there, before any write', async () => {
    const fake = fakeGitHub({ branchExists: true });
    const { args } = options(fake);
    await expect(runProbe(args)).rejects.toThrow(/already has a branch/);
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
  });

  it('refuses an existing results file before any request', async () => {
    const fake = fakeGitHub();
    const { args } = options(fake);
    await runProbe(args);
    const before = fake.requests.length;
    await expect(runProbe(args)).rejects.toThrow(/never overwrites/);
    expect(fake.requests.length).toBe(before);
  });

  it('gives up, writing nothing, when the runs do not complete', async () => {
    const fake = fakeGitHub();
    const stuck = async (url, init) => {
      const response = await fake.fetch(url, init);
      if (!String(url).includes('/actions/runs?')) return response;
      const body = await response.json();
      for (const r of body.workflow_runs) r.status = 'in_progress';
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const { args } = options(fake, { fetch: stuck });
    await expect(runProbe(args)).rejects.toThrow(`${WAIT.polls} polls`);
    expect(existsSync(args.results)).toBe(false);
  });

  it('records both snapshots and the answers when a re-run keeps its suite', async () => {
    const fake = fakeGitHub();
    const { args } = options(fake);
    const out = await runProbe(args);
    expect(JSON.parse(readFileSync(args.results, 'utf8'))).toEqual(out);
    expect(out.commit).toBe(COMMIT);
    expect(out.answers).toEqual({
      rerunKeepsCheckSuite: true,
      latestListsBothWorkflows: true,
      latestDropsEarlierAttempt: true,
      failedHasLowerId: true,
      pushAndPullRequestTwoSuites: true,
      pushAndPullRequestSamePath: true,
      listingNamesLatestAttemptSuite: true,
      everyActionsSuiteListed: true,
    });
    // The checker's read is recorded beside the check runs, every run at the commit as listed.
    expect(out.snapshots.first.workflowRunsAtHead).toEqual([
      { id: 801, path: WORKFLOWS[0].path, event: 'push', runAttempt: 1, checkSuiteId: 6001 },
      { id: 802, path: WORKFLOWS[1].path, event: 'push', runAttempt: 1, checkSuiteId: 6002 },
      { id: 803, path: WORKFLOWS[2].path, event: 'push', runAttempt: 1, checkSuiteId: 6004 },
      {
        id: 804,
        path: WORKFLOWS[2].path,
        event: 'pull_request',
        runAttempt: 1,
        checkSuiteId: 6005,
      },
      {
        id: 999,
        path: '.github/workflows/ci.yml',
        event: 'push',
        runAttempt: 1,
        checkSuiteId: 6999,
      },
    ]);
    const failing = out.snapshots.afterRerun.workflowRuns.find((r) => r.id === 801);
    expect(failing.attempts).toEqual([
      { attempt: 1, checkSuiteId: 6001, conclusion: 'failure' },
      { attempt: 2, checkSuiteId: 6001, conclusion: 'success' },
    ]);
    expect(out.snapshots.first.checkRuns.all[0]).toEqual({
      id: 9001,
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      checkSuiteId: 6001,
      appSlug: 'github-actions',
      htmlUrl: `https://github.com/${SANDBOX}/actions/runs/801/job/9001`,
    });
    expect(
      fake.requests.filter((r) => r.method === 'POST').map((r) => r.path.split('/').pop()),
    ).toEqual(['trees', 'commits', 'refs', 'pulls', 'rerun-failed-jobs']);
  });

  it('answers otherwise when a re-run gets a new suite and filter=latest keeps one run per name', async () => {
    const fake = fakeGitHub({ rerunNewSuite: true, latestPerName: true });
    const { args } = options(fake);
    const out = await runProbe(args);
    expect(out.answers).toEqual({
      rerunKeepsCheckSuite: false,
      latestListsBothWorkflows: false,
      latestDropsEarlierAttempt: true,
      failedHasLowerId: true,
      pushAndPullRequestTwoSuites: true,
      pushAndPullRequestSamePath: true,
      // The listing gives the re-run's new suite, so the first attempt's is no listed run's.
      listingNamesLatestAttemptSuite: true,
      everyActionsSuiteListed: false,
    });
  });
});

describe('answers', () => {
  it('decides nothing from snapshots it does not have', () => {
    expect(answers(null, null)).toEqual({
      rerunKeepsCheckSuite: null,
      latestListsBothWorkflows: null,
      latestDropsEarlierAttempt: null,
      failedHasLowerId: null,
      pushAndPullRequestTwoSuites: null,
      pushAndPullRequestSamePath: null,
      listingNamesLatestAttemptSuite: null,
      everyActionsSuiteListed: null,
    });
  });
});

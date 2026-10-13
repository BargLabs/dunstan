#!/usr/bin/env node
// The checks probe (README.md): how GitHub records two workflows' check runs of one job name, and a
// re-run of one of them. It is run by the operator, never by a session, and only against the
// sandbox repository below, named on the command line too.
//
//   node experiments/checks-probe-2026-10/probe.mjs --repo BargLabs/closes-probe-sandbox            # dry run
//   node experiments/checks-probe-2026-10/probe.mjs --repo BargLabs/closes-probe-sandbox --execute  # writes
//
// The token is GITHUB_TOKEN, a fine-grained token on the sandbox only, with Contents, Actions,
// Workflows and Pull requests read and write and Checks read. A dry run (the default) reads the
// repository to check the probe's branch is not there yet and prints every write it would make; it
// writes nothing, to GitHub or to disk. --execute makes the writes and writes results.json beside
// this file, which it never overwrites.
//
// What it does with --execute, on one new branch, `checks-probe`, and one commit:
//   (i)   the commit adds two workflows that each have a job named `test`: one fails on its first
//         attempt, the other succeeds after a job that runs first, so its `test` is queued later;
//         and a third workflow, on push and on pull_request, with one job `build`. It then opens a
//         pull request from the branch, so the third workflow runs twice on the one commit;
//   (ii)  when all have completed, it re-runs the failed job, which succeeds on its second attempt;
//   (iii) after (i) and after (ii) it reads the check runs at the commit with `filter=latest` and
//         with `filter=all`, the commit's check suites, every workflow run at the commit as the
//         checker lists them (`actions/runs?head_sha=`: ids, paths, events, attempts and check
//         suite ids), and each probe run's attempts and jobs: ids, names, conclusions, check suite
//         ids, app slugs, run ids and attempts.

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROBE = 'checks-probe-2026-10';
// The only repository the probe writes to: the sandbox the closes probe ran on.
export const SANDBOX = 'BargLabs/closes-probe-sandbox';
export const BRANCH = 'checks-probe';
export const DEFAULT_RESULTS = join(dirname(fileURLToPath(import.meta.url)), 'results.json');
const API = 'https://api.github.com';
// How long it waits for the workflow runs to complete, after the push and after the re-run.
export const WAIT = { polls: 60, intervalMs: 10_000 };

// Each workflow, and the events it runs on at the probe's commit.
export const WORKFLOWS = [
  {
    key: 'fails-first',
    path: '.github/workflows/checks-probe-fails-first.yml',
    events: ['push'],
    content: `name: checks probe, fails on its first attempt
on:
  push:
    branches: [${BRANCH}]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: test "$GITHUB_RUN_ATTEMPT" != 1
`,
  },
  {
    key: 'succeeds',
    path: '.github/workflows/checks-probe-succeeds.yml',
    events: ['push'],
    content: `name: checks probe, succeeds
on:
  push:
    branches: [${BRANCH}]
jobs:
  first:
    runs-on: ubuntu-latest
    steps:
      - run: sleep 30
  test:
    needs: first
    runs-on: ubuntu-latest
    steps:
      - run: 'true'
`,
  },
  {
    // One workflow run twice on one commit: on the push, and on the pull request the probe opens.
    // Its job is not named `test`, so it bears on no answer about the two above.
    key: 'push-and-pull-request',
    path: '.github/workflows/checks-probe-push-and-pull-request.yml',
    events: ['push', 'pull_request'],
    content: `name: checks probe, on push and pull_request
on:
  push:
    branches: [${BRANCH}]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: 'true'
`,
  },
];

export class Refused extends Error {
  constructor(message) {
    super(message);
    this.name = 'Refused';
  }
}

export function parseArgs(argv) {
  const out = { repo: undefined, execute: false, results: DEFAULT_RESULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') out.repo = argv[++i];
    else if (a === '--execute') out.execute = true;
    else if (a === '--dry-run') out.execute = false;
    else if (a === '--results') out.results = argv[++i];
    else throw new Refused(`unknown argument ${a}`);
  }
  // Only the sandbox, and only when the command line names it: never a repository taken from a
  // remote or the environment.
  if (out.repo === undefined) throw new Refused(`name the sandbox repository: --repo ${SANDBOX}`);
  if (out.repo !== SANDBOX) throw new Refused(`--repo ${out.repo} is not the sandbox ${SANDBOX}`);
  return out;
}

// A session against the sandbox. A write is printed first, and made only with --execute; in a dry
// run it answers a placeholder, so later steps can still print what they would send.
export class Session {
  constructor({ repo, execute, token, fetch, sleep, log }) {
    if (repo !== SANDBOX) throw new Refused(`${repo} is not the sandbox ${SANDBOX}`);
    this.repo = repo;
    this.execute = execute;
    this.token = token;
    this.fetch = fetch;
    this.sleep = sleep;
    this.log = log;
    this.writes = 0;
  }

  async #request(method, path, body, { notFound } = {}) {
    const response = await this.fetch(`${API}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (response.status === 404 && notFound !== undefined) return notFound;
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text}`);
    return text === '' ? null : JSON.parse(text);
  }

  read(path, options) {
    return this.#request('GET', path, undefined, options);
  }

  async write(method, path, body, placeholder) {
    this.writes++;
    this.log(
      `${this.execute ? 'write' : 'would write'}: ${method} ${path} ${JSON.stringify(body)}`,
    );
    if (!this.execute) return placeholder;
    return this.#request(method, path, body);
  }
}

// The probe starts from the default branch's head, and refuses if its branch is already there: a
// second run would read the first run's check runs.
export async function checkSandbox(s) {
  const repo = await s.read(`/repos/${s.repo}`);
  const existing = await s.read(`/repos/${s.repo}/branches/${BRANCH}`, { notFound: null });
  if (existing !== null) throw new Refused(`${s.repo} already has a branch ${BRANCH}`);
  const head = await s.read(`/repos/${s.repo}/branches/${repo.default_branch}`);
  return { defaultBranch: repo.default_branch, head: head.commit.sha };
}

// (i) One commit adding both workflows, on a new branch: creating the branch is the push.
async function pushWorkflows(s, ctx) {
  const parent = await s.read(`/repos/${s.repo}/git/commits/${ctx.head}`);
  const tree = await s.write(
    'POST',
    `/repos/${s.repo}/git/trees`,
    {
      base_tree: parent.tree.sha,
      tree: WORKFLOWS.map((w) => ({
        path: w.path,
        mode: '100644',
        type: 'blob',
        content: w.content,
      })),
    },
    { sha: '<tree>' },
  );
  const commit = await s.write(
    'POST',
    `/repos/${s.repo}/git/commits`,
    {
      message: 'checks probe: two workflows with a job named test, one on push and pull_request',
      tree: tree.sha,
      parents: [ctx.head],
    },
    { sha: '<commit>' },
  );
  await s.write(
    'POST',
    `/repos/${s.repo}/git/refs`,
    { ref: `refs/heads/${BRANCH}`, sha: commit.sha },
    {},
  );
  return commit.sha;
}

// (i) A pull request from the branch into the default branch: the third workflow's second run on
// the commit, on pull_request. It is left open.
async function openPullRequest(s, ctx) {
  await s.write(
    'POST',
    `/repos/${s.repo}/pulls`,
    {
      title: 'checks probe: one workflow on push and pull_request',
      head: BRANCH,
      base: ctx.defaultBranch,
    },
    { number: '<pull>' },
  );
}

// Every workflow run at the commit, as the checker lists them (spec section 6, "Workflow runs").
async function workflowRunsAt(s, sha) {
  const answer = await s.read(`/repos/${s.repo}/actions/runs?head_sha=${sha}&per_page=100`);
  return answer.workflow_runs;
}

// The workflow runs of the probe's workflows at the commit.
async function probeRuns(s, sha) {
  return (await workflowRunsAt(s, sha)).filter((r) => WORKFLOWS.some((w) => w.path === r.path));
}

// Waits until each probe workflow has a completed run at the commit for each of its events, at
// `attempt` or later for the workflow named. Refuses when the budget ends: nothing is recorded
// half-done.
async function waitForRuns(s, sha, { key, attempt } = {}) {
  for (let i = 0; i < WAIT.polls; i++) {
    const runs = await probeRuns(s, sha);
    const done = WORKFLOWS.every((w) =>
      w.events.every((event) => {
        const run = runs.find((r) => r.path === w.path && r.event === event);
        if (run === undefined || run.status !== 'completed') return false;
        return w.key !== key || run.run_attempt >= attempt;
      }),
    );
    if (done) return runs;
    await s.sleep(WAIT.intervalMs);
  }
  throw new Error(`the probe's workflow runs did not complete in ${WAIT.polls} polls`);
}

const checkRun = (r) => ({
  id: r.id,
  name: r.name,
  status: r.status,
  conclusion: r.conclusion,
  checkSuiteId: r.check_suite?.id ?? null,
  appSlug: r.app?.slug ?? null,
  htmlUrl: r.html_url ?? null,
});

// (iii) Everything the questions need, read at one moment.
async function snapshot(s, sha) {
  if (!s.execute) {
    s.log(
      `would read: check runs (latest and all), check suites, workflow runs, attempts and jobs at ${sha}`,
    );
    return null;
  }
  const base = `/repos/${s.repo}`;
  // The checker's read, beside the check runs: every workflow run at the commit, `path` as given.
  const atHead = (await workflowRunsAt(s, sha)).map((r) => ({
    id: r.id,
    path: r.path,
    event: r.event ?? null,
    runAttempt: r.run_attempt,
    checkSuiteId: r.check_suite_id ?? null,
  }));
  const checkRuns = async (filter) =>
    (
      await s.read(`${base}/commits/${sha}/check-runs?filter=${filter}&per_page=100`)
    ).check_runs.map(checkRun);
  const latest = await checkRuns('latest');
  const all = await checkRuns('all');
  const suites = (
    await s.read(`${base}/commits/${sha}/check-suites?per_page=100`)
  ).check_suites.map((x) => ({
    id: x.id,
    appSlug: x.app?.slug ?? null,
    status: x.status,
    conclusion: x.conclusion,
  }));
  const workflowRuns = [];
  for (const r of await probeRuns(s, sha)) {
    const attempts = [];
    for (let n = 1; n <= r.run_attempt; n++) {
      const a = await s.read(`${base}/actions/runs/${r.id}/attempts/${n}`);
      attempts.push({
        attempt: n,
        checkSuiteId: a.check_suite_id ?? null,
        conclusion: a.conclusion,
      });
    }
    const jobs = (
      await s.read(`${base}/actions/runs/${r.id}/jobs?filter=all&per_page=100`)
    ).jobs.map((j) => ({
      id: j.id,
      runId: j.run_id,
      runAttempt: j.run_attempt,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
    }));
    workflowRuns.push({
      id: r.id,
      path: r.path,
      event: r.event ?? null,
      runAttempt: r.run_attempt,
      checkSuiteId: r.check_suite_id ?? null,
      conclusion: r.conclusion,
      attempts,
      jobs,
    });
  }
  return {
    checkRuns: { latest, all },
    checkSuites: suites,
    workflowRunsAtHead: atHead,
    workflowRuns,
  };
}

// The answers, from the two snapshots alone: a pure function, so they can be recomputed from
// results.json. null where the snapshots do not decide it.
export function answers(first, afterRerun) {
  const runOf = (snap, key) =>
    snap?.workflowRuns.find((r) => r.path === WORKFLOWS.find((w) => w.key === key).path);
  const testJob = (run, attempt) =>
    run?.jobs.find((j) => j.name === 'test' && j.runAttempt === attempt);
  const runById = (runs, id) => runs.find((r) => r.id === id);

  const failed1 = testJob(runOf(afterRerun, 'fails-first'), 1);
  const failed2 = testJob(runOf(afterRerun, 'fails-first'), 2);
  const passed = testJob(runOf(first, 'succeeds'), 1);
  const all = afterRerun?.checkRuns.all ?? [];
  const suite1 = failed1 && runById(all, failed1.id)?.checkSuiteId;
  const suite2 = failed2 && runById(all, failed2.id)?.checkSuiteId;
  const firstFailed = testJob(runOf(first, 'fails-first'), 1);
  const latestFirst = first?.checkRuns.latest ?? [];
  const latestAfter = afterRerun?.checkRuns.latest ?? [];
  const known = (x) => x !== undefined && x !== null;

  // The workflow on push and pull_request: its two runs at the commit, as the checker lists them.
  const twice = WORKFLOWS.find((w) => w.key === 'push-and-pull-request');
  const listedOf = (snap, event) =>
    snap?.workflowRunsAtHead?.find(
      (r) => r.path.replace(/@.*$/, '') === twice.path && r.event === event,
    );
  const onPush = listedOf(first, 'push');
  const onPullRequest = listedOf(first, 'pull_request');
  // After the re-run: the failed workflow's run as listed, and its last attempt as read.
  const failing = runOf(afterRerun, 'fails-first');
  const listedFailing = afterRerun?.workflowRunsAtHead?.find((r) => r.id === failing?.id);
  const lastAttempt = failing?.attempts.at(-1);
  const listedSuites = new Set(
    (afterRerun?.workflowRunsAtHead ?? []).map((r) => r.checkSuiteId).filter(known),
  );
  const actionsRuns = all.filter((r) => r.appSlug === 'github-actions');

  return {
    // Does a re-run attempt of a job keep its check suite?
    rerunKeepsCheckSuite: known(suite1) && known(suite2) ? suite1 === suite2 : null,
    // Does filter=latest list both workflows' `test` runs, before the re-run?
    latestListsBothWorkflows:
      firstFailed && passed
        ? known(runById(latestFirst, firstFailed.id)) && known(runById(latestFirst, passed.id))
        : null,
    // Does filter=latest leave out the first attempt once the re-run has completed?
    latestDropsEarlierAttempt: failed1 && failed2 ? !known(runById(latestAfter, failed1.id)) : null,
    // Did the failed `test` get the lower check run id, as in the false pass the rule closes?
    failedHasLowerId: firstFailed && passed ? firstFailed.id < passed.id : null,
    // Spec 0.1.4, amended 2026-10-13. Is one workflow run on push and on pull_request two check
    // suites at the commit (the wrong fail the workflow-path key closes)?
    pushAndPullRequestTwoSuites:
      known(onPush?.checkSuiteId) && known(onPullRequest?.checkSuiteId)
        ? onPush.checkSuiteId !== onPullRequest.checkSuiteId
        : null,
    // Do its two runs give the same `path`, as given, so the key makes them one workflow?
    pushAndPullRequestSamePath: onPush && onPullRequest ? onPush.path === onPullRequest.path : null,
    // After the re-run, does the listing give the failed run with its last attempt's check suite?
    listingNamesLatestAttemptSuite:
      known(listedFailing?.checkSuiteId) && known(lastAttempt?.checkSuiteId)
        ? listedFailing.checkSuiteId === lastAttempt.checkSuiteId
        : null,
    // After the re-run, is every GitHub Actions check run's suite a listed run's? If not, a run of
    // an earlier attempt has no workflow path in the record and is counted per suite.
    everyActionsSuiteListed:
      actionsRuns.length > 0 && listedSuites.size > 0
        ? actionsRuns.every((r) => listedSuites.has(r.checkSuiteId))
        : null,
  };
}

export async function runProbe({ repo, execute, results, token, fetch, sleep, log, now }) {
  // Refused before anything is read: a results file already written is never overwritten.
  if (existsSync(results)) throw new Refused(`${results} exists; the probe never overwrites it`);
  const s = new Session({ repo, execute, token, fetch, sleep, log });
  const startedAt = now();
  const ctx = await checkSandbox(s);
  log(`${repo}: no branch ${BRANCH}; default branch ${ctx.defaultBranch} at ${ctx.head}`);

  log('(i) two workflows with a job named test, and one on push and pull_request, on one commit');
  const sha = await pushWorkflows(s, ctx);
  await openPullRequest(s, ctx);
  const runs = execute ? await waitForRuns(s, sha) : [];
  const first = await snapshot(s, sha);

  log('(ii) re-run the failed job');
  const failing = runs.find((r) => r.path === WORKFLOWS[0].path);
  await s.write(
    'POST',
    `/repos/${s.repo}/actions/runs/${failing?.id ?? '<run>'}/rerun-failed-jobs`,
    {},
    null,
  );
  if (execute) await waitForRuns(s, sha, { key: 'fails-first', attempt: 2 });
  const afterRerun = await snapshot(s, sha);

  if (!execute) {
    log(`dry run: ${s.writes} writes printed, none made; nothing written to ${results}`);
    return null;
  }
  const out = {
    probe: PROBE,
    repository: repo,
    branch: BRANCH,
    commit: sha,
    startedAt,
    finishedAt: now(),
    workflows: WORKFLOWS.map(({ key, path, events }) => ({ key, path, events })),
    snapshots: { first, afterRerun },
    answers: answers(first, afterRerun),
  };
  // `wx`: fail rather than overwrite, even if the file appeared while the probe ran.
  writeFileSync(results, `${JSON.stringify(out, null, 2)}\n`, { flag: 'wx' });
  log(`wrote ${results}`);
  log(`answers: ${JSON.stringify(out.answers)}`);
  return out;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const token = process.env.GITHUB_TOKEN;
    if (token === undefined || token === '') throw new Refused('set GITHUB_TOKEN for the sandbox');
    await runProbe({
      ...args,
      token,
      fetch: globalThis.fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.log(m),
      now: () => new Date().toISOString(),
    });
  } catch (e) {
    console.error(`probe: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(e instanceof Refused ? 2 : 1);
  }
}

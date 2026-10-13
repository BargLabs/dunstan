#!/usr/bin/env node
// The closes probe (README.md): five cases that observe how GitHub records the close of a `closes`
// target, run by the operator against a sandbox repository the operator created for it. It is never
// run by a session, and never against a repository that is not empty at start or that was not
// named on the command line.
//
//   node experiments/closes-probe-2026-10/probe.mjs --repo <owner/name>            # dry run
//   node experiments/closes-probe-2026-10/probe.mjs --repo <owner/name> --execute  # writes
//   node experiments/closes-probe-2026-10/probe.mjs --repo <owner/name> --reread   # reads only
//
// The token is GITHUB_TOKEN, with Contents, Issues and Pull requests read and write on the sandbox
// only. A dry run (the default) reads the repository to check it is empty and prints every write it
// would make; it writes nothing, to GitHub or to disk. --execute makes the writes and writes
// results.json beside this file, which it never overwrites. --reread makes no write to GitHub: it
// reads again every target an existing results.json names and writes reread-<date>.json beside it,
// which it never overwrites either.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROBE = 'closes-probe-2026-10';
export const DEFAULT_RESULTS = join(dirname(fileURLToPath(import.meta.url)), 'results.json');
const API = 'https://api.github.com';
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
// How long a case waits after a merge for GitHub to close (or not close) its target, and for the
// ClosedEvent of a closed target to show: GitHub sets the state before the timeline shows the event
// (the run of 12 Oct 2026, cases i and ii).
export const SETTLE = { polls: 12, intervalMs: 5000 };

export class Refused extends Error {
  constructor(message) {
    super(message);
    this.name = 'Refused';
  }
}

export function parseArgs(argv) {
  const out = { repo: undefined, execute: false, reread: false, results: DEFAULT_RESULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') out.repo = argv[++i];
    else if (a === '--execute') out.execute = true;
    else if (a === '--dry-run') out.execute = false;
    else if (a === '--reread') out.reread = true;
    else if (a === '--results') out.results = argv[++i];
    else throw new Refused(`unknown argument ${a}`);
  }
  // Only a repository named on the command line, never one taken from a remote or the environment.
  if (out.repo === undefined) throw new Refused('name the sandbox repository: --repo <owner/name>');
  if (!REPOSITORY.test(out.repo)) throw new Refused(`--repo ${out.repo} is not owner/name`);
  if (out.reread && out.execute) throw new Refused('--reread makes no writes: drop --execute');
  return out;
}

// The GraphQL reads. They ask for what the checker's evidence asks for (spec 0.1.4, section 6),
// and the closing references.
const CLOSING = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } }
    }
  }
}`;
const TARGET = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue { state timelineItems(itemTypes: [CLOSED_EVENT], first: 100) { nodes { ...closed } } }
      ... on PullRequest { state timelineItems(itemTypes: [CLOSED_EVENT], first: 100) { nodes { ...closed } } }
    }
  }
}
fragment closed on ClosedEvent {
  createdAt
  closer { __typename ... on PullRequest { number repository { nameWithOwner } } ... on Commit { oid } }
}`;

// A session against one repository. A write is printed first, and made only with --execute; in a
// dry run it answers a placeholder, so later steps can still print what they would send. A
// read-only session (--reread) refuses every write, made or printed.
export class Session {
  constructor({ repo, execute, token, fetch, sleep, log, readOnly = false }) {
    this.repo = repo;
    this.execute = execute;
    this.token = token;
    this.fetch = fetch;
    this.sleep = sleep;
    this.log = log;
    this.readOnly = readOnly;
    this.writes = 0;
  }

  async #request(method, path, body) {
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
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text}`);
    return text === '' ? null : JSON.parse(text);
  }

  read(path) {
    return this.#request('GET', path);
  }

  async graphql(query, variables) {
    const answer = await this.#request('POST', '/graphql', { query, variables });
    if (answer?.errors) throw new Error(`GraphQL: ${JSON.stringify(answer.errors)}`);
    return answer.data;
  }

  async write(method, path, body, placeholder) {
    if (this.readOnly) throw new Refused(`read-only: refused ${method} ${path}`);
    this.writes++;
    this.log(
      `${this.execute ? 'write' : 'would write'}: ${method} ${path} ${JSON.stringify(body)}`,
    );
    if (!this.execute) return placeholder;
    return this.#request(method, path, body);
  }
}

// A repository is empty at start when it has no issue, no pull request and one branch, its default
// (a new repository initialised with a README). Anything else is refused before any write. A
// repository with no branch has no commit for the cases to start from.
export async function checkEmpty(s) {
  const repo = await s.read(`/repos/${s.repo}`);
  const issues = await s.read(`/repos/${s.repo}/issues?state=all&per_page=1`);
  const branches = await s.read(`/repos/${s.repo}/branches?per_page=2`);
  if (issues.length > 0) throw new Refused(`${s.repo} has issues or pull requests: not empty`);
  if (branches.length === 0) {
    throw new Refused(
      `${s.repo} has no commits: create one initial commit on the default branch first`,
    );
  }
  if (branches.length !== 1 || branches[0].name !== repo.default_branch) {
    throw new Refused(`${s.repo} has a branch other than ${repo.default_branch}: not empty`);
  }
  return { defaultBranch: repo.default_branch, head: branches[0].commit.sha };
}

// ---------------------------------------------------------------- the steps of a case

async function issue(s, name) {
  const made = await s.write(
    'POST',
    `/repos/${s.repo}/issues`,
    { title: `closes probe: target ${name}`, body: 'A target of the closes probe.' },
    { number: `<issue ${name}>` },
  );
  return made.number;
}

async function branch(s, name, sha) {
  await s.write('POST', `/repos/${s.repo}/git/refs`, { ref: `refs/heads/${name}`, sha }, {});
}

// One commit on a branch, adding one small file, with the message given.
async function commit(s, branchName, file, message) {
  const made = await s.write(
    'PUT',
    `/repos/${s.repo}/contents/${file}`,
    { message, branch: branchName, content: Buffer.from(`${file}\n`).toString('base64') },
    { commit: { sha: `<commit ${file}>` } },
  );
  return made.commit.sha;
}

async function pull(s, { head, base, title, body }) {
  const made = await s.write(
    'POST',
    `/repos/${s.repo}/pulls`,
    { title, head, base, body },
    { number: `<pull ${head}>` },
  );
  return made.number;
}

// The merge commit's own message names no issue, so only the case's keyword can close anything.
async function merge(s, number, method) {
  const body =
    method === 'squash'
      ? { merge_method: 'squash' }
      : { merge_method: method, commit_title: `closes probe: merge ${number}`, commit_message: '' };
  const made = await s.write('PUT', `/repos/${s.repo}/pulls/${number}/merge`, body, {
    sha: `<merge ${number}>`,
  });
  return made.sha;
}

async function closing(s, number) {
  if (!s.execute) {
    s.log(`would read: closingIssuesReferences of pull request ${number}`);
    return null;
  }
  const [owner, name] = s.repo.split('/');
  const data = await s.graphql(CLOSING, { owner, name, number });
  return data.repository.pullRequest.closingIssuesReferences.nodes.map(
    (n) => `${n.repository.nameWithOwner}#${n.number}`,
  );
}

async function target(s, number) {
  if (!s.execute) {
    s.log(`would read: state and ClosedEvents of ${number}`);
    return null;
  }
  return readTarget(s, number);
}

// A target's type, state and every ClosedEvent's closer. A read, so --reread makes it too.
async function readTarget(s, number) {
  const [owner, name] = s.repo.split('/');
  const data = await s.graphql(TARGET, { owner, name, number });
  const item = data.repository.issueOrPullRequest;
  return {
    type: item.__typename,
    state: item.state,
    closedEvents: item.timelineItems.nodes.map((e) => ({
      at: e.createdAt,
      closer:
        e.closer === null
          ? null
          : e.closer.__typename === 'PullRequest'
            ? { pullRequest: `${e.closer.repository.nameWithOwner}#${e.closer.number}` }
            : e.closer.__typename === 'Commit'
              ? { commit: e.closer.oid }
              : { other: e.closer.__typename },
    })),
  };
}

// A target is settled when it is closed or merged and, if closed, at least one ClosedEvent shows.
// GitHub sets the state before the timeline shows the event, so a closed target with no event is
// not settled. An open target is read for the whole budget: open at its end is what was observed.
export function isSettled(seen) {
  if (seen.state === 'OPEN') return false;
  return seen.state !== 'CLOSED' || seen.closedEvents.length > 0;
}

// After a merge, GitHub closes a target asynchronously: wait until it is settled, or the budget
// ends. A closed target with no ClosedEvent when the budget ends is recorded `unsettled: true`.
async function settled(s, number) {
  let seen = await target(s, number);
  for (let i = 1; s.execute && !isSettled(seen) && i < SETTLE.polls; i++) {
    await s.sleep(SETTLE.intervalMs);
    seen = await target(s, number);
  }
  const unsettled = s.execute && seen.state !== 'OPEN' && !isSettled(seen);
  return { seen, unsettled };
}

// One pull request of a case, opened, observed, merged and observed again.
async function mergeAndObserve(s, spec, targetNumber) {
  const number = await pull(s, spec);
  const closingBefore = await closing(s, number);
  const mergeCommit = await merge(s, number, spec.method);
  const closingAfter = await closing(s, number);
  const { seen, unsettled } = await settled(s, targetNumber);
  return {
    pullRequest: number,
    base: spec.base,
    head: spec.head,
    body: spec.body,
    mergeMethod: spec.method,
    mergeCommit,
    closingBefore,
    closingAfter,
    target: seen,
    ...(unsettled ? { unsettled: true } : {}),
  };
}

// ---------------------------------------------------------------- the five cases

export const CASES = [
  {
    id: 'i',
    what: 'A commit message "Fixes #a"; the pull request body names no issue; merged with a merge commit.',
    async run(s, ctx) {
      const a = await issue(s, 'a');
      await branch(s, 'probe-i', ctx.head);
      const oid = await commit(s, 'probe-i', 'probe/i.txt', `Fixes #${a}`);
      const merged = await mergeAndObserve(
        s,
        {
          head: 'probe-i',
          base: ctx.defaultBranch,
          title: 'closes probe (i)',
          body: 'Case (i).',
          method: 'merge',
        },
        a,
      );
      return { target: { kind: 'issue', number: a }, commits: [oid], steps: [merged] };
    },
  },
  {
    id: 'ii',
    what: "The same as (i), squash-merged: the squash commit carries the one commit's message.",
    async run(s, ctx) {
      const a = await issue(s, 'a2');
      await branch(s, 'probe-ii', ctx.head);
      const oid = await commit(s, 'probe-ii', 'probe/ii.txt', `Fixes #${a}`);
      const merged = await mergeAndObserve(
        s,
        {
          head: 'probe-ii',
          base: ctx.defaultBranch,
          title: 'closes probe (ii)',
          body: 'Case (ii).',
          method: 'squash',
        },
        a,
      );
      return { target: { kind: 'issue', number: a }, commits: [oid], steps: [merged] };
    },
  },
  {
    id: 'iii',
    what: 'A commit message "Fixes #b" on a branch merged into a non-default base, then that base merged into the default branch.',
    async run(s, ctx) {
      const b = await issue(s, 'b');
      await branch(s, 'probe-base-iii', ctx.head);
      await branch(s, 'probe-iii', ctx.head);
      const oid = await commit(s, 'probe-iii', 'probe/iii.txt', `Fixes #${b}`);
      const intoBase = await mergeAndObserve(
        s,
        {
          head: 'probe-iii',
          base: 'probe-base-iii',
          title: 'closes probe (iii) into the base',
          body: 'Case (iii), first merge.',
          method: 'merge',
        },
        b,
      );
      const intoDefault = await mergeAndObserve(
        s,
        {
          head: 'probe-base-iii',
          base: ctx.defaultBranch,
          title: 'closes probe (iii) into the default',
          body: 'Case (iii), second merge.',
          method: 'merge',
        },
        b,
      );
      return {
        target: { kind: 'issue', number: b },
        commits: [oid],
        steps: [intoBase, intoDefault],
      };
    },
  },
  {
    id: 'iv',
    what: 'A pull request body "Closes #c" with a non-default base.',
    async run(s, ctx) {
      const c = await issue(s, 'c');
      await branch(s, 'probe-base-iv', ctx.head);
      await branch(s, 'probe-iv', ctx.head);
      const oid = await commit(s, 'probe-iv', 'probe/iv.txt', 'closes probe (iv)');
      const merged = await mergeAndObserve(
        s,
        {
          head: 'probe-iv',
          base: 'probe-base-iv',
          title: 'closes probe (iv)',
          body: `Closes #${c}`,
          method: 'merge',
        },
        c,
      );
      return { target: { kind: 'issue', number: c }, commits: [oid], steps: [merged] };
    },
  },
  {
    id: 'v',
    what: 'A pull request body "Closes #d" where #d is an open pull request.',
    async run(s, ctx) {
      await branch(s, 'probe-v-target', ctx.head);
      await commit(s, 'probe-v-target', 'probe/v-target.txt', 'closes probe (v) target');
      const d = await pull(s, {
        head: 'probe-v-target',
        base: ctx.defaultBranch,
        title: 'closes probe: target d',
        body: 'A pull request target of the closes probe.',
      });
      await branch(s, 'probe-v', ctx.head);
      const oid = await commit(s, 'probe-v', 'probe/v.txt', 'closes probe (v)');
      const merged = await mergeAndObserve(
        s,
        {
          head: 'probe-v',
          base: ctx.defaultBranch,
          title: 'closes probe (v)',
          body: `Closes #${d}`,
          method: 'merge',
        },
        d,
      );
      return { target: { kind: 'pull_request', number: d }, commits: [oid], steps: [merged] };
    },
  },
];

export async function runProbe({ repo, execute, results, token, fetch, sleep, log, now }) {
  // Refused before anything is read: a results file already written is never overwritten.
  if (existsSync(results)) throw new Refused(`${results} exists; the probe never overwrites it`);
  const s = new Session({ repo, execute, token, fetch, sleep, log });
  const startedAt = now();
  const ctx = await checkEmpty(s);
  log(`${repo} is empty: default branch ${ctx.defaultBranch} at ${ctx.head}`);
  const cases = [];
  for (const c of CASES) {
    log(`case (${c.id}): ${c.what}`);
    cases.push({ case: c.id, what: c.what, ...(await c.run(s, ctx)) });
  }
  if (!execute) {
    log(`dry run: ${s.writes} writes printed, none made; nothing written to ${results}`);
    return null;
  }
  const out = {
    probe: PROBE,
    repository: repo,
    defaultBranch: ctx.defaultBranch,
    initialCommit: ctx.head,
    startedAt,
    finishedAt: now(),
    cases,
  };
  // `wx`: fail rather than overwrite, even if the file appeared while the probe ran.
  writeFileSync(results, `${JSON.stringify(out, null, 2)}\n`, { flag: 'wx' });
  log(`wrote ${results}`);
  return out;
}

// --reread: every target an existing results.json names, read once more, read-only. The repository
// must be the one results.json was written for, and named on the command line too.
export async function runReread({ repo, results, token, fetch, log, now }) {
  const readAt = now();
  const out = join(dirname(results), `reread-${readAt.slice(0, 10)}.json`);
  // Refused before GitHub is read: a re-read already written is never overwritten.
  if (existsSync(out)) throw new Refused(`${out} exists; the probe never overwrites it`);
  if (!existsSync(results)) throw new Refused(`${results} does not exist: nothing to re-read`);
  const recorded = JSON.parse(readFileSync(results, 'utf8'));
  if (recorded.probe !== PROBE) throw new Refused(`${results} is not a ${PROBE} results file`);
  if (recorded.repository !== repo) {
    throw new Refused(`${results} is for ${recorded.repository}, not --repo ${repo}`);
  }
  const s = new Session({ repo, execute: true, token, fetch, sleep: null, log, readOnly: true });
  const targets = [];
  for (const c of recorded.cases) {
    log(`re-read: case (${c.case}), ${c.target.kind} ${c.target.number}`);
    targets.push({
      case: c.case,
      kind: c.target.kind,
      number: c.target.number,
      target: await readTarget(s, c.target.number),
    });
  }
  const reread = { probe: PROBE, repository: repo, results: basename(results), readAt, targets };
  writeFileSync(out, `${JSON.stringify(reread, null, 2)}\n`, { flag: 'wx' });
  log(`wrote ${out}`);
  return reread;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const token = process.env.GITHUB_TOKEN;
    if (token === undefined || token === '') throw new Refused('set GITHUB_TOKEN for the sandbox');
    await (args.reread ? runReread : runProbe)({
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

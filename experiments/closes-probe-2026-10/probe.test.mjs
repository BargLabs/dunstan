// The closes probe, on a fake GitHub only: no test reaches the network (fetch throws), and none
// runs the probe against a repository.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CASES,
  DEFAULT_RESULTS,
  parseArgs,
  Refused,
  runProbe,
  runReread,
  SETTLE,
  Session,
} from './probe.mjs';

const REPO = 'probe-owner/closes-sandbox';
const INITIAL = 'a'.repeat(40);

beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('no network in tests');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

// A small stateful GitHub: issues and pull requests share numbers; a merge with a keyword in the
// merged commit message or, into the default branch, in the body closes the target with a closer.
// As on 12 Oct 2026, the target's state is set at once and its ClosedEvent shows only after
// `eventLag` reads of the target.
function fakeGitHub({ issues = [], branches = ['main'], eventLag = 0 } = {}) {
  const requests = [];
  const items = new Map();
  let next = 1;
  let sha = 0;
  const oid = () => (++sha).toString(16).padStart(40, '0');
  // Each branch's commits, oldest first; its head is the last.
  const history = new Map(branches.map((b) => [b, [INITIAL]]));
  const heads = {
    get: (b) => history.get(b)?.at(-1),
    [Symbol.iterator]: () => [...history].map(([b, h]) => [b, h.at(-1)])[Symbol.iterator](),
  };
  const messages = new Map();
  const pulls = new Map();
  const json = (status, body) =>
    new Response(body === undefined ? '' : JSON.stringify(body), { status });
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const u = new URL(url);
    const path = u.pathname;
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    requests.push({ method, path: `${path}${u.search}`, body });
    const base = `/repos/${REPO}`;
    if (method === 'GET' && path === base) return json(200, { default_branch: 'main' });
    if (method === 'GET' && path === `${base}/issues`) return json(200, issues.slice(0, 1));
    if (method === 'GET' && path === `${base}/branches`) {
      return json(
        200,
        [...heads].slice(0, 2).map(([name, s]) => ({ name, commit: { sha: s } })),
      );
    }
    if (method === 'POST' && path === `${base}/issues`) {
      const number = next++;
      items.set(number, { type: 'Issue', state: 'OPEN', events: [] });
      return json(201, { number });
    }
    if (method === 'POST' && path === `${base}/git/refs`) {
      const from = [...history.values()].find((h) => h.at(-1) === body.sha) ?? [body.sha];
      history.set(body.ref.replace('refs/heads/', ''), [...from]);
      return json(201, {});
    }
    if (method === 'PUT' && path.startsWith(`${base}/contents/`)) {
      const s = oid();
      history.get(body.branch).push(s);
      messages.set(s, body.message);
      return json(201, { commit: { sha: s } });
    }
    if (method === 'POST' && path === `${base}/pulls`) {
      const number = next++;
      const onBase = new Set(history.get(body.base));
      const commits = history.get(body.head).filter((c) => !onBase.has(c));
      pulls.set(number, { ...body, commits });
      items.set(number, { type: 'PullRequest', state: 'OPEN', events: [] });
      return json(201, { number });
    }
    const m = /\/pulls\/([0-9]+)\/merge$/.exec(path);
    if (method === 'PUT' && m !== null) {
      const number = Number(m[1]);
      const pr = pulls.get(number);
      const s = oid();
      history.get(pr.base).push(...pr.commits, s);
      items.get(number).state = 'MERGED';
      const close = (n, closer) => {
        const item = items.get(n);
        if (item === undefined || item.state !== 'OPEN') return;
        item.state = 'CLOSED';
        item.pending = { event: { createdAt: '2026-10-12T10:00:00Z', closer }, reads: eventLag };
      };
      for (const c of pr.commits) {
        const k = /Fixes #([0-9]+)/.exec(messages.get(c) ?? '');
        if (k !== null && pr.base === 'main') close(Number(k[1]), { __typename: 'Commit', oid: c });
      }
      const k = /Closes #([0-9]+)/.exec(pr.body ?? '');
      if (k !== null && pr.base === 'main') {
        close(Number(k[1]), {
          __typename: 'PullRequest',
          number,
          repository: { nameWithOwner: REPO },
        });
      }
      return json(200, { sha: s, merged: true });
    }
    if (method === 'POST' && path === '/graphql') {
      const n = body.variables.number;
      if (body.query.includes('closingIssuesReferences')) {
        return json(200, {
          data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [] } } } },
        });
      }
      const item = items.get(n);
      if (item.pending !== undefined && item.pending.reads-- <= 0) {
        item.events.push(item.pending.event);
        item.pending = undefined;
      }
      return json(200, {
        data: {
          repository: {
            issueOrPullRequest: {
              __typename: item.type,
              state: item.state,
              timelineItems: { nodes: item.events },
            },
          },
        },
      });
    }
    return json(404, { message: 'Not Found' });
  };
  return { fetch, requests };
}

function run(fake, overrides = {}) {
  const log = [];
  const results = join(mkdtempSync(join(tmpdir(), 'closes-probe-')), 'results.json');
  const promise = runProbe({
    repo: REPO,
    execute: false,
    results,
    token: 't',
    fetch: fake.fetch,
    sleep: async () => {},
    log: (m) => log.push(m),
    now: () => '2026-10-12T09:00:00Z',
    ...overrides,
  });
  return { promise, log, results };
}

const writes = (fake) => fake.requests.filter((r) => r.method !== 'GET' && r.path !== '/graphql');

describe('the closes probe', () => {
  it('runs only against a repository named on the command line, dry by default', () => {
    expect(() => parseArgs([])).toThrow(Refused);
    expect(() => parseArgs(['--repo'])).toThrow(Refused);
    expect(() => parseArgs(['--repo', 'not a repo'])).toThrow(Refused);
    expect(() => parseArgs(['--repo', REPO, '--force'])).toThrow(Refused);
    expect(parseArgs(['--repo', REPO])).toMatchObject({ repo: REPO, execute: false });
    expect(parseArgs(['--repo', REPO, '--execute'])).toMatchObject({ execute: true });
  });

  it('a dry run prints every write it would make, and makes none', async () => {
    const fake = fakeGitHub();
    const { promise, log, results } = run(fake);
    expect(await promise).toBeNull();
    expect(writes(fake)).toEqual([]);
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(existsSync(results)).toBe(false);
    const printed = log.filter((l) => l.startsWith('would write: '));
    // Five issues or pull-request targets, their branches, commits, pull requests and merges.
    expect(printed.length).toBeGreaterThan(20);
    expect(printed).toContain(
      `would write: PUT /repos/${REPO}/contents/probe/i.txt ${JSON.stringify({ message: 'Fixes #<issue a>', branch: 'probe-i', content: Buffer.from('probe/i.txt\n').toString('base64') })}`,
    );
    expect(
      printed.some(
        (l) => l.includes('"body":"Closes #<issue c>"') && l.includes('"base":"probe-base-iv"'),
      ),
    ).toBe(true);
    expect(printed.some((l) => l.includes('"body":"Closes #<pull probe-v-target>"'))).toBe(true);
    expect(printed.filter((l) => l.includes('"merge_method":"squash"'))).toHaveLength(1);
    expect(log.at(-1)).toMatch(/^dry run: \d+ writes printed, none made/);
  });

  it('refuses a repository that is not empty at start, before any write', async () => {
    for (const fake of [
      fakeGitHub({ issues: [{ number: 1 }] }),
      fakeGitHub({ branches: ['main', 'feature'] }),
    ]) {
      for (const execute of [false, true]) {
        await expect(run(fake, { execute }).promise).rejects.toThrow(/not empty/);
        expect(writes(fake)).toEqual([]);
      }
    }
  });

  it('refuses to overwrite results.json, before anything is read', async () => {
    const fake = fakeGitHub();
    const { results } = run(fakeGitHub());
    writeFileSync(results, '{}\n');
    await expect(run(fake, { execute: true, results }).promise).rejects.toThrow(/never overwrites/);
    expect(fake.requests).toEqual([]);
    expect(readFileSync(results, 'utf8')).toBe('{}\n');
  });

  it('records, for each case, the closing references before and after merge, the target and every closer', async () => {
    const fake = fakeGitHub();
    const { promise, results } = run(fake, { execute: true });
    const out = await promise;
    expect(JSON.parse(readFileSync(results, 'utf8'))).toEqual(out);
    expect(out).toMatchObject({
      probe: 'closes-probe-2026-10',
      repository: REPO,
      defaultBranch: 'main',
      initialCommit: INITIAL,
    });
    expect(out.cases.map((c) => [c.case, c.target.kind, c.steps.length])).toEqual([
      ['i', 'issue', 1],
      ['ii', 'issue', 1],
      ['iii', 'issue', 2],
      ['iv', 'issue', 1],
      ['v', 'pull_request', 1],
    ]);
    expect(CASES.map((c) => c.id)).toEqual(['i', 'ii', 'iii', 'iv', 'v']);
    for (const c of out.cases) {
      for (const step of c.steps) {
        expect(step.closingBefore).toEqual([]);
        expect(step.closingAfter).toEqual([]);
        expect(step.mergeCommit).toMatch(/^[0-9a-f]{40}$/);
        expect(step.target).toHaveProperty('closedEvents');
      }
      expect(c.commits.every((x) => /^[0-9a-f]{40}$/.test(x))).toBe(true);
    }
    const [i, , iii, iv, v] = out.cases;
    // As this fake closes: by the commit for (i), only after the second merge for (iii), never for
    // (iv), and by the pull request for (v). What GitHub does is what the operator's run records.
    expect(i.steps[0].target.closedEvents).toEqual([
      { at: '2026-10-12T10:00:00Z', closer: { commit: i.commits[0] } },
    ]);
    expect(iii.steps.map((s) => s.target.state)).toEqual(['OPEN', 'CLOSED']);
    expect(iv.steps[0].target).toEqual({ type: 'Issue', state: 'OPEN', closedEvents: [] });
    expect(v.steps[0].target.closedEvents[0].closer).toEqual({
      pullRequest: `${REPO}#${v.steps[0].pullRequest}`,
    });
    // A target left open is polled for the settle budget, never longer.
    const ivReads = fake.requests.filter(
      (r) => r.path === '/graphql' && r.body.variables.number === iv.target.number,
    );
    expect(ivReads).toHaveLength(SETTLE.polls);
    // A second run refuses to overwrite what the first wrote.
    await expect(run(fakeGitHub(), { execute: true, results }).promise).rejects.toThrow(Refused);
  });

  it('settles a closed target only once its ClosedEvent shows, polling for it', async () => {
    const fake = fakeGitHub({ eventLag: 3 });
    const out = await run(fake, { execute: true }).promise;
    const [i, ii, iii, , v] = out.cases;
    for (const step of [i.steps[0], ii.steps[0], iii.steps[1], v.steps[0]]) {
      expect(step.target.state).toBe('CLOSED');
      expect(step.target.closedEvents).toHaveLength(1);
      expect(step).not.toHaveProperty('unsettled');
    }
    // Read closed with no event three times, then with it: four reads, not one.
    const iReads = fake.requests.filter(
      (r) => r.path === '/graphql' && r.body.variables.number === i.target.number,
    );
    expect(iReads).toHaveLength(4);
  });

  it('records a closed target with no ClosedEvent when the budget ends as unsettled, never settled', async () => {
    const fake = fakeGitHub({ eventLag: SETTLE.polls });
    const out = await run(fake, { execute: true }).promise;
    const steps = out.cases.flatMap((c) => c.steps);
    for (const step of steps) {
      const closedNoEvent = step.target.state === 'CLOSED' && step.target.closedEvents.length === 0;
      expect(step.unsettled === true, `pull request ${step.pullRequest}`).toBe(closedNoEvent);
    }
    const [i, , iii, iv] = out.cases;
    expect(i.steps[0]).toMatchObject({
      target: { state: 'CLOSED', closedEvents: [] },
      unsettled: true,
    });
    // Open for the whole budget is what was observed, not unsettled.
    expect(iii.steps[0]).not.toHaveProperty('unsettled');
    expect(iv.steps[0]).not.toHaveProperty('unsettled');
  });

  it('refuses a repository with no branch, saying it has no commits', async () => {
    for (const execute of [false, true]) {
      const fake = fakeGitHub({ branches: [] });
      await expect(run(fake, { execute }).promise).rejects.toThrow(
        `${REPO} has no commits: create one initial commit on the default branch first`,
      );
      expect(writes(fake)).toEqual([]);
    }
  });
});

describe('the closes probe, --reread', () => {
  const reread = (fake, results, overrides = {}) => {
    const log = [];
    const promise = runReread({
      repo: REPO,
      results,
      token: 't',
      fetch: fake.fetch,
      log: (m) => log.push(m),
      now: () => '2026-10-12T11:25:48Z',
      ...overrides,
    });
    return { promise, log };
  };

  it('takes --reread, and refuses it with --execute', () => {
    expect(parseArgs(['--repo', REPO, '--reread'])).toMatchObject({ reread: true, execute: false });
    expect(() => parseArgs(['--repo', REPO, '--reread', '--execute'])).toThrow(/makes no writes/);
  });

  it('reads every target results.json names again, makes no write, and writes reread-<date>.json', async () => {
    const fake = fakeGitHub({ eventLag: SETTLE.polls });
    const { promise, results } = run(fake, { execute: true });
    const out = await promise;
    const before = fake.requests.length;
    const again = await reread(fake, results).promise;
    const requests = fake.requests.slice(before);
    // One GraphQL read per target, and nothing else.
    expect(requests).toHaveLength(out.cases.length);
    for (const r of requests) {
      expect(r).toMatchObject({ method: 'POST', path: '/graphql' });
      expect(r.body.query).toContain('issueOrPullRequest');
    }
    const written = join(dirname(results), 'reread-2026-10-12.json');
    expect(JSON.parse(readFileSync(written, 'utf8'))).toEqual(again);
    expect(again).toMatchObject({
      probe: 'closes-probe-2026-10',
      repository: REPO,
      results: 'results.json',
      readAt: '2026-10-12T11:25:48Z',
    });
    expect(again.targets.map((t) => [t.case, t.kind, t.number])).toEqual(
      out.cases.map((c) => [c.case, c.target.kind, c.target.number]),
    );
    // The event the run's budget missed shows on the re-read.
    expect(again.targets[0].target).toMatchObject({ state: 'CLOSED' });
    expect(again.targets[0].target.closedEvents).toHaveLength(1);
    // A second re-read on the same day refuses before it reads anything.
    const after = fake.requests.length;
    await expect(reread(fake, results).promise).rejects.toThrow(/never overwrites/);
    expect(fake.requests).toHaveLength(after);
  });

  it('refuses a results file for another repository, or none, before reading GitHub', async () => {
    const fake = fakeGitHub();
    const dir = mkdtempSync(join(tmpdir(), 'closes-probe-'));
    const results = join(dir, 'results.json');
    await expect(reread(fake, results).promise).rejects.toThrow(/does not exist/);
    writeFileSync(
      results,
      JSON.stringify({ probe: 'closes-probe-2026-10', repository: 'someone/else', cases: [] }),
    );
    await expect(reread(fake, results).promise).rejects.toThrow(/is for someone\/else/);
    expect(fake.requests).toEqual([]);
    expect(existsSync(join(dir, 'reread-2026-10-12.json'))).toBe(false);
  });

  it('never overwrites the committed re-read of 12 Oct 2026', async () => {
    const fake = fakeGitHub();
    const committed = join(dirname(DEFAULT_RESULTS), 'reread-2026-10-12.json');
    const bytes = readFileSync(committed);
    await expect(reread(fake, DEFAULT_RESULTS).promise).rejects.toThrow(/never overwrites/);
    expect(fake.requests).toEqual([]);
    expect(readFileSync(committed)).toEqual(bytes);
  });

  it('a read-only session refuses every write', async () => {
    const s = new Session({ repo: REPO, execute: true, readOnly: true, log: () => {} });
    await expect(s.write('POST', `/repos/${REPO}/issues`, {}, {})).rejects.toThrow(/read-only/);
    expect(s.writes).toBe(0);
  });
});

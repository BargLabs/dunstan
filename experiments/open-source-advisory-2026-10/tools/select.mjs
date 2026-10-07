// Executes the selection rule of preregistration.md and writes selection.json with its audit record;
// with --wave 2, executes amendment-1.md's second wave and appends it to selection.json.
//
//   pnpm exec node experiments/open-source-advisory-2026-10/tools/select.mjs --rule-commit <sha>
//   pnpm exec node experiments/open-source-advisory-2026-10/tools/select.mjs --wave 2 \
//     --rule-commit <public commit of amendment-1.md>
//
// Reads only what the rule allows before selection: search results, repository metadata and each
// candidate's body as its search result gives it, for filter 3. It writes each selected pull
// request's body, as read, to the git-ignored .work/bodies/ (the label offsets index into it) and its
// SHA-256 to selection.json. It never reads a pull request's files, commits, checks, reviews or
// comments. It refuses to overwrite selection.json, and refuses wave 2 once selection.json has a
// split or a wave 2.
//
// DUNSTAN_READ_TOKEN is sent as a bearer token and is never written anywhere.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fileStem,
  flags,
  isMain,
  paths,
  readJson,
  sha256,
  splitKey,
  writeJson,
} from './common.mjs';

const API = 'https://api.github.com';

// preregistration.md, "Selection rule". The agents, accounts and qualifiers are the demo's.
export const AGENTS = [
  { id: 'A', agent: 'GitHub Copilot coding agent', qualifier: 'author:app/copilot-swe-agent' },
  { id: 'B', agent: 'Devin', qualifier: 'author:app/devin-ai-integration' },
  { id: 'C', agent: 'Claude', qualifier: 'author:app/claude' },
  { id: 'D', agent: 'OpenAI Codex', qualifier: 'author:app/chatgpt-codex-connector' },
  { id: 'E', agent: 'Google Jules', qualifier: 'author:app/google-labs-jules' },
];
export const QUALIFIERS = 'is:pr is:merged is:public';
export const WINDOW = Object.freeze({ start: '2026-06-01', end: '2026-10-06' });
export const QUERY_PREFIX = `${QUALIFIERS} merged:${WINDOW.start}..${WINDOW.end}`;
export const PER_PAGE = 100;
export const RESULT_CAP = 1000;
export const WANTED = 300;
export const MIN_STARS = 200;
export const MIN_BODY = 300;
export const EXCLUDED_OWNERS = ['BargLabs'];
// Every repository in demo/2026-10/selection.json.
export const EXCLUDED_REPOSITORIES = [
  'FluidSynth/fluidsynth',
  'airbytehq/airbyte',
  'AlphaGPU/leetgpu-challenges',
  'cdcseacave/openMVS',
  'QuantEcon/QuantEcon.py',
];

export const AMENDMENT_1 = 'experiments/open-source-advisory-2026-10/amendment-1.md';
const TOOL = 'experiments/open-source-advisory-2026-10/tools/select.mjs';
const DAY = 86_400_000;

// amendment-1.md, "Weekly queries": the window cut into consecutive seven-day sub-windows from its
// first day, both ends inclusive; the last ends on the window's last day and may be shorter.
export function weeks(window = WINDOW) {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const end = Date.parse(`${window.end}T00:00:00Z`);
  const out = [];
  for (let t = Date.parse(`${window.start}T00:00:00Z`); t <= end; t += 7 * DAY) {
    out.push({ start: iso(t), end: iso(Math.min(t + 6 * DAY, end)) });
  }
  return out;
}

// amendment-1.md, "Week order": the weeks in ascending SHA-256 (hex) of the UTF-8 string
// "week:<start>".
export function weekOrder(window = WINDOW) {
  return weeks(window)
    .map((w) => {
      const key = `week:${w.start}`;
      return { ...w, key, sha256: sha256(Buffer.from(key, 'utf8')) };
    })
    .sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0));
}

export class HttpError extends Error {
  constructor(path, status, body) {
    super(`GET ${path}: HTTP ${status} ${body.slice(0, 300)}`);
    this.status = status;
  }
}

// GET from the GitHub API with the read-only token. A secondary rate limit is a wait, not a result;
// anything else that is not 2xx throws.
export async function githubGet(path) {
  const token = process.env.DUNSTAN_READ_TOKEN;
  if (!token) throw new Error('DUNSTAN_READ_TOKEN is not set');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'barglabs-dunstan-study',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.ok) return res.json();
    const text = await res.text();
    const limited =
      (res.status === 403 || res.status === 429) && /rate limit/i.test(text) && attempt < 4;
    if (!limited) throw new HttpError(path, res.status, text);
    const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    const retryAfter = Number(res.headers.get('retry-after')) * 1000;
    const wait = retryAfter || (reset ? Math.max(reset - Date.now(), 0) + 1000 : 60_000);
    process.stderr.write(`rate limited on ${path}; waiting ${Math.ceil(wait / 1000)}s\n`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

// Filter 3's measure: HTML comments removed, whitespace trimmed, length in Unicode code points.
export function cleanBody(body) {
  return (body ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const RULE_COMMIT = /^[0-9a-f]{40}$/;

// The rule's steps, shared by both waves. `get(path)` returns the API's JSON or throws an HttpError;
// `now()` gives the timestamps. `selected` starts with what is already selected, so filter 4 holds
// across it; a candidate whose key (splitKey) is in `skip` was examined in wave 1 and is recorded
// as skipped, with no filter applied and nothing read.
function selector({ get, now, selected = [], skip = new Set() }) {
  const repos = new Map();
  const candidates = [];
  const bodies = new Map();

  // One query's results, read page by page in order, only as far as the round-robin needs. The
  // query and each page read are recorded in `queries`.
  function stream(agent, q, queries) {
    const query = {
      agent: agent.id,
      q,
      sort: 'created',
      order: 'asc',
      perPage: PER_PAGE,
      pages: [],
    };
    queries.push(query);
    let buffer = [];
    let page = 0;
    let exhausted = false;
    return async () => {
      if (buffer.length === 0 && !exhausted) {
        page++;
        const params = new URLSearchParams({
          q,
          sort: 'created',
          order: 'asc',
          per_page: String(PER_PAGE),
          page: String(page),
        });
        const runAt = now();
        const json = await get(`/search/issues?${params}`);
        query.pages.push({
          page,
          runAt,
          totalCount: json.total_count,
          incompleteResults: json.incomplete_results,
          items: json.items.length,
        });
        buffer = [...json.items];
        // The last page: a short one, or the end of the results or of the 1,000-result cap.
        exhausted =
          json.items.length < PER_PAGE || page * PER_PAGE >= Math.min(json.total_count, RESULT_CAP);
      }
      return buffer.shift();
    };
  }

  async function repository(fullName) {
    if (!repos.has(fullName)) {
      const readAt = now();
      try {
        const json = await get(`/repos/${fullName}`);
        repos.set(fullName, {
          readAt,
          status: 200,
          private: json.private,
          archived: json.archived,
          fork: json.fork,
          stargazersCount: json.stargazers_count,
        });
      } catch (e) {
        if (!(e instanceof HttpError) || ![404, 451].includes(e.status)) throw e;
        repos.set(fullName, { readAt, status: e.status });
      }
    }
    return repos.get(fullName);
  }

  // `tag` is what wave 2 adds to each candidate and selected pull request: its wave and week.
  async function examine(agent, item, tag) {
    const fullName = item.repository_url.replace(`${API}/repos/`, '');
    const [owner] = fullName.split('/');
    const candidate = {
      agent: agent.id,
      ...tag,
      url: item.html_url,
      repository: fullName,
      number: item.number,
      author: item.user?.login ?? null,
      createdAt: item.created_at,
      mergedAt: item.pull_request?.merged_at ?? null,
    };
    candidates.push(candidate);
    if (skip.has(splitKey(candidate))) {
      candidate.result = { skipped: 'wave 1' };
      return false;
    }
    if (EXCLUDED_OWNERS.some((o) => same(o, owner))) {
      candidate.result = { rejectedBy: 1, reason: `repository owner is ${owner}` };
      return false;
    }
    if (EXCLUDED_REPOSITORIES.some((r) => same(r, fullName))) {
      candidate.result = { rejectedBy: 1, reason: 'repository is in demo/2026-10/selection.json' };
      return false;
    }
    const repo = await repository(fullName);
    candidate.repositoryReadAt = repo.readAt;
    if (repo.status !== 200) {
      candidate.result = { rejectedBy: 2, reason: `repository read returned HTTP ${repo.status}` };
      return false;
    }
    candidate.stargazersCount = repo.stargazersCount;
    const failed = [
      repo.private !== false && 'not public',
      repo.archived !== false && 'archived',
      repo.fork !== false && 'a fork',
      !(repo.stargazersCount >= MIN_STARS) &&
        `stargazers_count ${repo.stargazersCount} < ${MIN_STARS}`,
    ].filter(Boolean);
    if (failed.length > 0) {
      candidate.result = { rejectedBy: 2, reason: failed.join(', ') };
      return false;
    }
    candidate.cleanedBodyLength = [...cleanBody(item.body)].length;
    if (candidate.cleanedBodyLength < MIN_BODY) {
      candidate.result = {
        rejectedBy: 3,
        reason: `cleaned body ${candidate.cleanedBodyLength} < ${MIN_BODY}`,
      };
      return false;
    }
    if (selected.some((s) => same(s.repository, fullName))) {
      candidate.result = { rejectedBy: 4, reason: 'a PR from this repository is already selected' };
      return false;
    }
    candidate.result = 'selected';
    const body = item.body ?? '';
    const s = {
      n: selected.length + 1,
      agent: agent.id,
      ...tag,
      url: item.html_url,
      repository: fullName,
      number: item.number,
      stargazersCount: repo.stargazersCount,
      cleanedBodyLength: candidate.cleanedBodyLength,
      body: { sha256: sha256(Buffer.from(body, 'utf8')), codePoints: [...body].length },
      selectedAt: now(),
    };
    selected.push(s);
    bodies.set(fileStem(s), body);
    return true;
  }

  // Round-robin from A over one query per agent until WANTED are selected or every query has run
  // out. Returns the agents whose queries ran out.
  async function roundRobin(queryFor, queries, tag = {}) {
    const streams = AGENTS.map((agent) => ({
      agent,
      next: stream(agent, queryFor(agent), queries),
      done: false,
    }));
    while (selected.length < WANTED && streams.some((s) => !s.done)) {
      for (const s of streams) {
        if (selected.length >= WANTED) break;
        if (s.done) continue;
        for (;;) {
          const item = await s.next();
          if (item === undefined) {
            s.done = true;
            break;
          }
          if (await examine(s.agent, item, tag)) break;
        }
      }
    }
    return streams.filter((s) => s.done).map((s) => s.agent.id);
  }

  return { selected, candidates, bodies, roundRobin };
}

// The rule, executed. Returns the selection and the bodies of the selected pull requests, by file
// stem.
export async function select({ get, ruleCommit, now = () => new Date().toISOString() }) {
  if (!RULE_COMMIT.test(ruleCommit ?? '')) throw new Error('--rule-commit <40-hex sha>');
  const startedAt = now();
  const queries = [];
  const run = selector({ get, now });
  const exhaustedAgents = await run.roundRobin((a) => `${QUERY_PREFIX} ${a.qualifier}`, queries);

  const selection = {
    rule: {
      path: 'experiments/open-source-advisory-2026-10/preregistration.md',
      commit: ruleCommit,
    },
    tool: TOOL,
    startedAt,
    finishedAt: now(),
    measures: {
      cleanedBodyLength:
        'Unicode code points of the search result body after removing <!-- ... --> and trimming whitespace',
      body: 'SHA-256 of the search result body as returned, UTF-8, and its length in Unicode code points; label offsets index into this body',
    },
    agents: AGENTS,
    exclusions: { owners: EXCLUDED_OWNERS, repositories: EXCLUDED_REPOSITORIES },
    queries,
    exhaustedAgents,
    wanted: WANTED,
    complete: run.selected.length === WANTED,
    selected: run.selected,
    candidates: run.candidates,
  };
  return { selection, bodies: run.bodies };
}

// Why wave 2 cannot run on `previous`, wave 1's selection.json, or null if it can.
function wave2Refusal(previous, ruleCommit) {
  if (!Array.isArray(previous?.selected) || !Array.isArray(previous?.candidates)) {
    return 'selection.json holds no wave 1';
  }
  if (previous.split !== undefined) return 'selection.json has a split; wave 2 comes before it';
  if (previous.wave2 !== undefined)
    return 'selection.json already holds wave 2; it is never redone';
  if (!RULE_COMMIT.test(ruleCommit ?? '')) {
    return '--rule-commit <40-hex sha of the public commit of amendment-1.md>';
  }
  return null;
}

// amendment-1.md, wave 2, executed on `previous`, wave 1's selection.json: the weekly queries in
// the fixed week order, round-robin within each week, wave 1's candidates skipped, filter 4 across
// both waves, until WANTED are selected in total. Returns selection.json with wave 2 appended and
// the bodies of wave 2's selected pull requests. Refuses, reading nothing, as wave2Refusal says.
export async function selectWave2({
  get,
  ruleCommit,
  previous,
  now = () => new Date().toISOString(),
}) {
  const refusal = wave2Refusal(previous, ruleCommit);
  if (refusal !== null) throw new Error(refusal);
  const startedAt = now();
  const run = selector({
    get,
    now,
    selected: [...previous.selected],
    skip: new Set(previous.candidates.map(splitKey)),
  });
  const weeksRun = [];
  for (const week of weekOrder()) {
    if (run.selected.length >= WANTED) break;
    const prefix = `${QUALIFIERS} merged:${week.start}..${week.end}`;
    const record = { ...week, queries: [] };
    weeksRun.push(record);
    record.exhaustedAgents = await run.roundRobin(
      (a) => `${prefix} ${a.qualifier}`,
      record.queries,
      { wave: 2, week: week.start },
    );
  }

  const finalN = run.selected.length;
  const selection = {
    ...previous,
    complete: finalN === WANTED,
    finalN,
    selected: run.selected,
    wave2: {
      amendment: 'amendment-1.md',
      rule: { path: AMENDMENT_1, commit: ruleCommit },
      tool: TOOL,
      startedAt,
      finishedAt: now(),
      wave1: { selected: previous.selected.length, complete: previous.complete },
      weekOrder: 'ascending SHA-256 (hex) of the UTF-8 string "week:<start>"',
      weeks: weeksRun,
      selected: finalN - previous.selected.length,
      candidates: run.candidates,
    },
  };
  return { selection, bodies: run.bodies };
}

// Writes selection.json and the bodies. Refuses when selection.json exists.
export function writeSelection({ selection, bodies }, p = paths()) {
  if (existsSync(p.selection))
    throw new Error(`${p.selection} exists; a selection is never redone`);
  mkdirSync(p.bodies, { recursive: true });
  for (const [stem, body] of bodies) writeFileSync(join(p.bodies, `${stem}.md`), body);
  writeJson(p.selection, selection);
}

// Writes selection.json with wave 2 appended, and wave 2's bodies. Refuses when selection.json on
// disk can no longer take wave 2, or its wave 1 is not the one wave 2 ran on.
export function writeWave2({ selection, bodies }, p = paths()) {
  const onDisk = readJson(p.selection);
  const refusal = wave2Refusal(onDisk, selection.wave2.rule.commit);
  if (refusal !== null) throw new Error(refusal);
  const wave1 = selection.selected.slice(0, onDisk.selected.length);
  if (JSON.stringify(wave1) !== JSON.stringify(onDisk.selected)) {
    throw new Error(`${p.selection} changed while wave 2 ran`);
  }
  mkdirSync(p.bodies, { recursive: true });
  for (const [stem, body] of bodies) writeFileSync(join(p.bodies, `${stem}.md`), body);
  writeJson(p.selection, selection);
}

if (isMain(import.meta.url)) {
  const args = flags(process.argv.slice(2));
  if (args.wave === undefined) {
    const result = await select({ get: githubGet, ruleCommit: args['rule-commit'] });
    writeSelection(result);
    const { selected, candidates, complete } = result.selection;
    process.stdout.write(
      `${candidates.length} candidate(s) examined; ${selected.length} selected${complete ? '' : ` (fewer than ${WANTED}: the rule ran out)`}\n`,
    );
  } else if (args.wave === '2') {
    const p = paths();
    if (!existsSync(p.selection)) throw new Error(`${p.selection} does not exist: wave 1 first`);
    const result = await selectWave2({
      get: githubGet,
      ruleCommit: args['rule-commit'],
      previous: readJson(p.selection),
    });
    writeWave2(result, p);
    const { wave2, finalN, complete } = result.selection;
    process.stdout.write(
      `wave 2: ${wave2.candidates.length} candidate(s) examined; ${wave2.selected} selected; ${finalN} in total${complete ? '' : ` (fewer than ${WANTED}: wave 2 ran out)`}\n`,
    );
  } else {
    throw new Error(`--wave ${args.wave}: amendment-1.md adds wave 2 only`);
  }
}

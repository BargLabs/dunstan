// Executes the selection rule of preregistration.md and writes selection.json with its audit record.
//
//   pnpm exec node experiments/open-source-advisory-2026-10/tools/select.mjs --rule-commit <sha>
//
// Reads only what the rule allows before selection: search results, repository metadata and each
// candidate's body as its search result gives it, for filter 3. It writes each selected pull
// request's body, as read, to the git-ignored .work/bodies/ (the label offsets index into it) and its
// SHA-256 to selection.json. It never reads a pull request's files, commits, checks, reviews or
// comments. It refuses to overwrite selection.json.
//
// DUNSTAN_READ_TOKEN is sent as a bearer token and is never written anywhere.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileStem, flags, isMain, paths, sha256, writeJson } from './common.mjs';

const API = 'https://api.github.com';

// preregistration.md, "Selection rule". The agents, accounts and qualifiers are the demo's.
export const AGENTS = [
  { id: 'A', agent: 'GitHub Copilot coding agent', qualifier: 'author:app/copilot-swe-agent' },
  { id: 'B', agent: 'Devin', qualifier: 'author:app/devin-ai-integration' },
  { id: 'C', agent: 'Claude', qualifier: 'author:app/claude' },
  { id: 'D', agent: 'OpenAI Codex', qualifier: 'author:app/chatgpt-codex-connector' },
  { id: 'E', agent: 'Google Jules', qualifier: 'author:app/google-labs-jules' },
];
export const QUERY_PREFIX = 'is:pr is:merged is:public merged:2026-06-01..2026-10-06';
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

// The rule, executed. `get(path)` returns the API's JSON or throws an HttpError; `now()` gives the
// timestamps. Returns the selection and the bodies of the selected pull requests, by file stem.
export async function select({ get, ruleCommit, now = () => new Date().toISOString() }) {
  if (!/^[0-9a-f]{40}$/.test(ruleCommit ?? '')) throw new Error('--rule-commit <40-hex sha>');
  const startedAt = now();
  const queries = [];
  const repos = new Map();
  const candidates = [];
  const selected = [];
  const bodies = new Map();

  // One agent's results, read page by page in order, only as far as the round-robin needs.
  function stream(agent) {
    const q = `${QUERY_PREFIX} ${agent.qualifier}`;
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

  async function examine(agent, item) {
    const fullName = item.repository_url.replace(`${API}/repos/`, '');
    const [owner] = fullName.split('/');
    const candidate = {
      agent: agent.id,
      url: item.html_url,
      repository: fullName,
      number: item.number,
      author: item.user?.login ?? null,
      createdAt: item.created_at,
      mergedAt: item.pull_request?.merged_at ?? null,
    };
    candidates.push(candidate);
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

  const streams = AGENTS.map((agent) => ({ agent, next: stream(agent), done: false }));
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
        if (await examine(s.agent, item)) break;
      }
    }
  }

  const selection = {
    rule: {
      path: 'experiments/open-source-advisory-2026-10/preregistration.md',
      commit: ruleCommit,
    },
    tool: 'experiments/open-source-advisory-2026-10/tools/select.mjs',
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
    exhaustedAgents: streams.filter((s) => s.done).map((s) => s.agent.id),
    wanted: WANTED,
    complete: selected.length === WANTED,
    selected,
    candidates,
  };
  return { selection, bodies };
}

// Writes selection.json and the bodies. Refuses when selection.json exists.
export function writeSelection({ selection, bodies }, p = paths()) {
  if (existsSync(p.selection))
    throw new Error(`${p.selection} exists; a selection is never redone`);
  mkdirSync(p.bodies, { recursive: true });
  for (const [stem, body] of bodies) writeFileSync(join(p.bodies, `${stem}.md`), body);
  writeJson(p.selection, selection);
}

if (isMain(import.meta.url)) {
  const args = flags(process.argv.slice(2));
  const result = await select({ get: githubGet, ruleCommit: args['rule-commit'] });
  writeSelection(result);
  const { selected, candidates, complete } = result.selection;
  process.stdout.write(
    `${candidates.length} candidate(s) examined; ${selected.length} selected${complete ? '' : ` (fewer than ${WANTED}: the rule ran out)`}\n`,
  );
}

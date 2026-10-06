// Every GitHub read the demo makes goes through this script (demo/2026-10/README.md).
//
//   pnpm exec node demo/2026-10/tools/select.mjs select --rule-commit <sha>
//     Executes demo/2026-10/selection-rule.md and writes demo/2026-10/selection.json. Reads only
//     what the rule allows before selection: search results, repository metadata and each
//     candidate's body (from its search result), for filter 3.
//
//   pnpm exec node demo/2026-10/tools/select.mjs pr <n>
//     After selection.json is committed: reads selected PR <n>'s pull request and files listing,
//     the inputs to the conversion procedure (demo/2026-10/procedure.md), and writes them to the
//     git-ignored demo/2026-10/.work/<n>/.
//
//   pnpm exec node demo/2026-10/tools/select.mjs repo <owner/name>
//     Prints whether a repository a report names is readable (its HTTP status and visibility).
//
// DUNSTAN_READ_TOKEN is sent as a bearer token and is never written anywhere.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com';
const DEMO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELECTION = join(DEMO, 'selection.json');

const AGENTS = [
  { id: 'A', agent: 'GitHub Copilot coding agent', qualifier: 'author:app/copilot-swe-agent' },
  { id: 'B', agent: 'Devin', qualifier: 'author:app/devin-ai-integration' },
  { id: 'C', agent: 'Claude', qualifier: 'author:app/claude' },
  { id: 'D', agent: 'OpenAI Codex', qualifier: 'author:app/chatgpt-codex-connector' },
  { id: 'E', agent: 'Google Jules', qualifier: 'author:app/google-labs-jules' },
];
const QUERY_PREFIX = 'is:pr is:merged is:public merged:2026-09-01..2026-10-03';
const PER_PAGE = 100;
const RESULT_CAP = 1000;
const WANTED = 5;
const MIN_STARS = 1000;
const MIN_BODY = 300;

class HttpError extends Error {
  constructor(path, status, body) {
    super(`GET ${path}: HTTP ${status} ${body.slice(0, 300)}`);
    this.status = status;
  }
}

async function get(path) {
  const token = process.env.DUNSTAN_READ_TOKEN;
  if (!token) throw new Error('DUNSTAN_READ_TOKEN is not set');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'barglabs-dunstan-demo',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.ok) return { json: await res.json(), headers: res.headers };
    const text = await res.text();
    // A secondary rate limit is a wait, not a result. Anything else stops the run.
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

// One agent's results, read page by page in order, only as far as the round-robin needs.
function agentStream(agent, queries) {
  const q = `${QUERY_PREFIX} ${agent.qualifier}`;
  const query = { agent: agent.id, q, sort: 'created', order: 'asc', perPage: PER_PAGE, pages: [] };
  queries.push(query);
  let buffer = [];
  let page = 0;
  let exhausted = false;
  return async function next() {
    if (buffer.length === 0 && !exhausted) {
      page++;
      const params = new URLSearchParams({
        q,
        sort: 'created',
        order: 'asc',
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const runAt = new Date().toISOString();
      const { json } = await get(`/search/issues?${params}`);
      query.pages.push({
        page,
        runAt,
        totalCount: json.total_count,
        incompleteResults: json.incomplete_results,
        items: json.items.length,
      });
      buffer = json.items;
      // The last page: a short one, or the end of the results or of the 1,000-result cap.
      exhausted =
        json.items.length < PER_PAGE || page * PER_PAGE >= Math.min(json.total_count, RESULT_CAP);
    }
    return buffer.shift();
  };
}

async function select(ruleCommit) {
  if (!/^[0-9a-f]{40}$/.test(ruleCommit ?? '')) throw new Error('--rule-commit <40-hex sha>');
  const startedAt = new Date().toISOString();
  const queries = [];
  const streams = AGENTS.map((agent) => ({
    agent,
    next: agentStream(agent, queries),
    done: false,
  }));
  const repos = new Map();
  const candidates = [];
  const selected = [];

  async function repository(fullName) {
    if (!repos.has(fullName)) {
      const readAt = new Date().toISOString();
      try {
        const { json } = await get(`/repos/${fullName}`);
        repos.set(fullName, {
          readAt,
          status: 200,
          fullName: json.full_name,
          private: json.private,
          visibility: json.visibility,
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
    if (owner.toLowerCase() === 'barglabs') {
      candidate.result = { rejectedBy: 1, reason: 'repository owner is BargLabs' };
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
      !(repo.stargazersCount >= MIN_STARS) && `stargazers_count ${repo.stargazersCount} < 1000`,
    ].filter(Boolean);
    if (failed.length > 0) {
      candidate.result = { rejectedBy: 2, reason: failed.join(', ') };
      return false;
    }
    const cleaned = cleanBody(item.body);
    candidate.cleanedBodyLength = [...cleaned].length;
    if (candidate.cleanedBodyLength < MIN_BODY) {
      candidate.result = {
        rejectedBy: 3,
        reason: `cleaned body ${candidate.cleanedBodyLength} < 300`,
      };
      return false;
    }
    if (selected.some((s) => s.repository.toLowerCase() === fullName.toLowerCase())) {
      candidate.result = { rejectedBy: 4, reason: 'a PR from this repository is already selected' };
      return false;
    }
    candidate.result = 'selected';
    selected.push({
      n: selected.length + 1,
      agent: agent.id,
      url: item.html_url,
      repository: fullName,
      number: item.number,
      stargazersCount: repo.stargazersCount,
      cleanedBodyLength: candidate.cleanedBodyLength,
      selectedAt: new Date().toISOString(),
    });
    return true;
  }

  while (selected.length < WANTED && streams.some((s) => !s.done)) {
    for (const stream of streams) {
      if (selected.length >= WANTED) break;
      if (stream.done) continue;
      for (;;) {
        const item = await stream.next();
        if (item === undefined) {
          stream.done = true;
          break;
        }
        if (await examine(stream.agent, item)) break;
      }
    }
  }

  const selection = {
    rule: { path: 'demo/2026-10/selection-rule.md', commit: ruleCommit },
    tool: 'demo/2026-10/tools/select.mjs',
    startedAt,
    finishedAt: new Date().toISOString(),
    measures: {
      cleanedBodyLength:
        'Unicode code points of the search result body after removing <!-- ... --> and trimming whitespace',
    },
    agents: AGENTS,
    queries,
    exhaustedAgents: streams.filter((s) => s.done).map((s) => s.agent.id),
    complete: selected.length === WANTED,
    selected,
    candidates,
  };
  writeFileSync(SELECTION, `${JSON.stringify(selection, null, 2)}\n`);
  for (const s of selected) {
    process.stdout.write(`${s.n}  ${s.agent}  ${s.url}  stars ${s.stargazersCount}\n`);
  }
  process.stdout.write(`${candidates.length} candidate(s) examined; ${selected.length} selected\n`);
}

// The conversion procedure's inputs for selected PR <n>: the pull request (head.sha, merged_at,
// body) and every filename of its files listing.
async function pullRequest(n) {
  const selection = JSON.parse(readFileSync(SELECTION, 'utf8'));
  const s = selection.selected.find((x) => x.n === Number(n));
  if (s === undefined) throw new Error(`no selected PR ${n}`);
  const readAt = new Date().toISOString();
  const { json: pr } = await get(`/repos/${s.repository}/pulls/${s.number}`);
  const files = [];
  for (let page = 1; ; page++) {
    const { json } = await get(
      `/repos/${s.repository}/pulls/${s.number}/files?per_page=100&page=${page}`,
    );
    files.push(...json);
    if (json.length < 100) break;
  }
  const dir = join(DEMO, '.work', String(s.n));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'body.md'), pr.body ?? '');
  const facts = {
    readAt,
    repository: s.repository,
    number: s.number,
    state: pr.state,
    merged: pr.merged,
    headSha: pr.head.sha,
    mergedAt: pr.merged_at,
    changedFiles: pr.changed_files,
    files: files.map((f) => ({
      filename: f.filename,
      status: f.status,
      ...(f.previous_filename === undefined ? {} : { previousFilename: f.previous_filename }),
    })),
  };
  writeFileSync(join(dir, 'pr.json'), `${JSON.stringify(facts, null, 2)}\n`);
  process.stdout.write(
    `${s.repository}#${s.number} head ${pr.head.sha} merged_at ${pr.merged_at} files ${files.length}/${pr.changed_files}\n`,
  );
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'select') {
  const i = rest.indexOf('--rule-commit');
  await select(i >= 0 ? rest[i + 1] : undefined);
} else if (command === 'pr') {
  await pullRequest(rest[0]);
} else if (command === 'repo') {
  // Whether a repository a report names is readable with the demo's token: for the summaries' notes.
  try {
    const { json } = await get(`/repos/${rest[0]}`);
    process.stdout.write(`${rest[0]}: HTTP 200, visibility ${json.visibility}\n`);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    process.stdout.write(`${rest[0]}: HTTP ${e.status}\n`);
  }
} else {
  process.stderr.write(
    'usage: select.mjs select --rule-commit <sha> | select.mjs pr <n> | select.mjs repo <owner/name>\n',
  );
  process.exit(3);
}

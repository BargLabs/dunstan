// Executes study 2's selection rule (preregistration.md, "Selection") and writes selection.json with
// its audit record.
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/tools/select.mjs \
//     --rule-commit <public commit of preregistration.md>
//
// Adapted from study 1's tools/select.mjs (experiments/open-source-advisory-2026-10/tools/select.mjs):
// its agents, qualifiers, filters, page reading, GitHub reader and week order are imported from
// there unchanged. What differs is written here: the 17 weeks amendment 1's wave 2 never queried, in
// its order; study 1's 300 repositories excluded under filter 1; no wave-1 skips; 150 wanted.
//
// Reads only what the rule allows before selection: search results, repository metadata and each
// candidate's body as its search result gives it, for filter 3. It writes each selected pull
// request's body, as read, to the git-ignored .work/bodies/ (the label offsets index into it) and its
// SHA-256 to selection.json. It never reads a pull request's files, commits, checks, reviews or
// comments. It refuses to overwrite selection.json.
//
// DUNSTAN_READ_TOKEN is sent as a bearer token and is never written anywhere.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGENTS,
  cleanBody,
  EXCLUDED_OWNERS,
  EXCLUDED_REPOSITORIES,
  githubGet,
  HttpError,
  MIN_BODY,
  MIN_STARS,
  PER_PAGE,
  QUALIFIERS,
  RESULT_CAP,
  weekOrder,
} from '../../open-source-advisory-2026-10/tools/select.mjs';
import {
  fileStem,
  flags,
  isMain,
  paths,
  ROOT,
  STUDY1_SELECTION,
  sha256,
  writeJson,
} from './common.mjs';

export {
  AGENTS,
  EXCLUDED_OWNERS,
  EXCLUDED_REPOSITORIES,
  HttpError,
  MIN_BODY,
  MIN_STARS,
  QUALIFIERS,
  RESULT_CAP,
};

export const WANTED = 150;
// preregistration.md, "Weeks": positions 3 to 19 of amendment 1's week order. Wave 2 queried only
// positions 1 and 2.
export const WEEKS = weekOrder()
  .slice(2)
  .map((w, i) => ({ position: i + 3, ...w }));

const API = 'https://api.github.com';
const TOOL = 'experiments/open-source-advisory-2026-10-study2/tools/select.mjs';
const RULE = 'experiments/open-source-advisory-2026-10-study2/preregistration.md';
const RULE_COMMIT = /^[0-9a-f]{40}$/;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// The repositories of study 1's selection.json, read from the file whose SHA-256 this study pins.
export function study1Repositories(path = join(ROOT, STUDY1_SELECTION.path)) {
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== STUDY1_SELECTION.sha256) {
    throw new Error(`${path} has SHA-256 ${digest}; study 2 excludes ${STUDY1_SELECTION.sha256}`);
  }
  return JSON.parse(bytes.toString('utf8')).selected.map((s) => s.repository);
}

// The rule, executed. `get(path)` returns the API's JSON or throws an HttpError; `now()` gives the
// timestamps; `study1` is the list of study 1's repositories. Returns the selection and the bodies of
// the selected pull requests, by file stem.
export async function select({
  get,
  ruleCommit,
  study1 = study1Repositories(),
  now = () => new Date().toISOString(),
}) {
  if (!RULE_COMMIT.test(ruleCommit ?? '')) throw new Error('--rule-commit <40-hex sha>');
  const startedAt = now();
  const selected = [];
  const candidates = [];
  const bodies = new Map();
  const repos = new Map();

  // One query's results, read page by page in order, only as far as the round-robin needs. Each
  // page read is recorded on `query`.
  function stream(q, query) {
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

  async function examine(agent, item, week) {
    const fullName = item.repository_url.replace(`${API}/repos/`, '');
    const [owner] = fullName.split('/');
    const candidate = {
      agent: agent.id,
      week,
      url: item.html_url,
      repository: fullName,
      number: item.number,
      author: item.user?.login ?? null,
      createdAt: item.created_at,
      mergedAt: item.pull_request?.merged_at ?? null,
    };
    candidates.push(candidate);
    const reject = (by, reason) => {
      candidate.result = { rejectedBy: by, reason };
      return false;
    };
    if (EXCLUDED_OWNERS.some((o) => same(o, owner)))
      return reject(1, `repository owner is ${owner}`);
    if (EXCLUDED_REPOSITORIES.some((r) => same(r, fullName))) {
      return reject(1, 'repository is in demo/2026-10/selection.json');
    }
    if (study1.some((r) => same(r, fullName))) {
      return reject(1, `repository is in ${STUDY1_SELECTION.path}`);
    }
    const repo = await repository(fullName);
    candidate.repositoryReadAt = repo.readAt;
    if (repo.status !== 200) return reject(2, `repository read returned HTTP ${repo.status}`);
    candidate.stargazersCount = repo.stargazersCount;
    const failed = [
      repo.private !== false && 'not public',
      repo.archived !== false && 'archived',
      repo.fork !== false && 'a fork',
      !(repo.stargazersCount >= MIN_STARS) &&
        `stargazers_count ${repo.stargazersCount} < ${MIN_STARS}`,
    ].filter(Boolean);
    if (failed.length > 0) return reject(2, failed.join(', '));
    candidate.cleanedBodyLength = [...cleanBody(item.body)].length;
    if (candidate.cleanedBodyLength < MIN_BODY) {
      return reject(3, `cleaned body ${candidate.cleanedBodyLength} < ${MIN_BODY}`);
    }
    if (selected.some((s) => same(s.repository, fullName))) {
      return reject(4, 'a PR from this repository is already selected');
    }
    candidate.result = 'selected';
    const body = item.body ?? '';
    const s = {
      n: selected.length + 1,
      agent: agent.id,
      week,
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

  // Each week in order: round-robin from A over one query per agent, until WANTED are selected or
  // every agent's results for the week have run out. No week after the one that reaches WANTED is
  // queried.
  const weeksRun = [];
  for (const week of WEEKS) {
    if (selected.length >= WANTED) break;
    const record = { ...week, queries: [] };
    weeksRun.push(record);
    const streams = AGENTS.map((agent) => {
      const q = `${QUALIFIERS} merged:${week.start}..${week.end} ${agent.qualifier}`;
      const query = {
        agent: agent.id,
        q,
        sort: 'created',
        order: 'asc',
        perPage: PER_PAGE,
        pages: [],
      };
      record.queries.push(query);
      return { agent, next: stream(q, query), done: false };
    });
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
          if (await examine(s.agent, item, week.start)) break;
        }
      }
    }
    record.exhaustedAgents = streams.filter((s) => s.done).map((s) => s.agent.id);
  }

  const selection = {
    rule: { path: RULE, commit: ruleCommit },
    tool: TOOL,
    startedAt,
    finishedAt: now(),
    measures: {
      cleanedBodyLength:
        'Unicode code points of the search result body after removing <!-- ... --> and trimming whitespace',
      body: 'SHA-256 of the search result body as returned, UTF-8, and its length in Unicode code points; label offsets index into this body',
    },
    agents: AGENTS,
    exclusions: {
      owners: EXCLUDED_OWNERS,
      repositories: EXCLUDED_REPOSITORIES,
      study1: { ...STUDY1_SELECTION, repositories: study1.length },
    },
    weekOrder:
      'positions 3 to 19 of amendment-1.md: ascending SHA-256 (hex) of the UTF-8 string "week:<start>"',
    weeks: weeksRun,
    wanted: WANTED,
    complete: selected.length === WANTED,
    finalN: selected.length,
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

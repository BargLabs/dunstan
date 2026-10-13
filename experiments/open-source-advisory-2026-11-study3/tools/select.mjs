// Executes study 3's selection rule (preregistration.md, "Selection") one block at a time, and
// writes selection.json with its audit record.
//
//   pnpm exec node experiments/open-source-advisory-2026-11-study3/tools/select.mjs \
//     --rule-commit <public commit of preregistration.md> [--block 1|2]
//
// With no selection.json it runs block 1; with a selection.json whose block 1 fell short it runs
// block 2; otherwise it refuses. --block, if given, must name that block. Block 1 is searched no
// earlier than 2026-11-09; block 2 only if block 1 selected fewer than 350, and no earlier than
// 2026-11-23. Nothing is widened beyond block 2: a shortfall then is `"complete": false`.
//
// Adapted from study 2's tools/select.mjs (experiments/open-source-advisory-2026-10-study2/tools/
// select.mjs): the agents, qualifiers, filters' constants, body measure, GitHub reader and page
// reading are study 1's, imported unchanged. What differs is written here: the two blocks and their
// dates, study 1's and study 2's repositories both excluded under filter 1, the demo's read from
// its file, 350 wanted, the rule commit checked against git, and no search before signing.
//
// Reads only what the rule allows before selection.json is committed: search results, repository
// metadata and each candidate's body as its search result gives it, for filter 3. It writes each
// selected pull request's body, as read, to the git-ignored .work/bodies/ (the label offsets index
// into it) and its SHA-256 to selection.json. It never reads a pull request's files, commits,
// checks, reviews or comments. It refuses to overwrite a block.
//
// DUNSTAN_READ_TOKEN is sent as a bearer token and is never written anywhere.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanBody,
  EXCLUDED_OWNERS,
  EXCLUDED_REPOSITORIES,
  githubGet,
  HttpError,
  MIN_BODY,
  MIN_STARS,
  PER_PAGE,
  RESULT_CAP,
} from '../../open-source-advisory-2026-10/tools/select.mjs';
import {
  AGENTS,
  BLOCKS,
  DEMO_SELECTION,
  fileStem,
  flags,
  isMain,
  paths,
  QUALIFIERS,
  ROOT,
  RULE,
  readJson,
  SIGNING_DATE,
  STUDY1_SELECTION,
  STUDY2_SELECTION,
  sha256,
  signingDate,
  WANTED,
  WEEKS,
  writeJson,
} from './common.mjs';

export { EXCLUDED_OWNERS, HttpError, MIN_BODY, MIN_STARS, PER_PAGE, RESULT_CAP };

const API = 'https://api.github.com';
const TOOL = 'experiments/open-source-advisory-2026-11-study3/tools/select.mjs';
const RULE_COMMIT = /^[0-9a-f]{40}$/;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// The repositories of a prior study's selection.json, read from the file whose SHA-256 this study
// pins. Any other bytes are refused.
export function pinnedRepositories(pin, path = join(ROOT, pin.path)) {
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== pin.sha256) {
    throw new Error(`${path} has SHA-256 ${digest}; study 3 excludes ${pin.path} at ${pin.sha256}`);
  }
  return JSON.parse(bytes.toString('utf8')).selected.map((s) => s.repository);
}

// The five repositories of demo/2026-10/selection.json, which must be the five study 1 excluded.
export function demoRepositories(path = join(ROOT, DEMO_SELECTION.path)) {
  const repositories = readJson(path).selected.map((s) => s.repository);
  if (JSON.stringify(repositories) !== JSON.stringify(EXCLUDED_REPOSITORIES)) {
    throw new Error(`${path} is not the five repositories studies 1 and 2 excluded`);
  }
  return repositories;
}

// Why `commit` is not the operator's signing commit of preregistration.md as it is now, or null: it
// must be a commit in this checkout's history, the file there must be the file at HEAD, unchanged,
// it must carry an SSH signature, and it must be the first to carry the file: its first parent
// carries another file, or none. Whether the signature is valid is for GitHub to show, not this
// check.
export function ruleRefusal(commit, { cwd = ROOT, path = RULE } = {}) {
  if (!RULE_COMMIT.test(commit ?? '')) return '--rule-commit <40-hex sha>';
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  const fails = (...args) => {
    try {
      git(...args);
      return false;
    } catch {
      return true;
    }
  };
  if (fails('cat-file', '-e', `${commit}^{commit}`)) return `${commit} is not a commit here`;
  if (fails('merge-base', '--is-ancestor', commit, 'HEAD')) {
    return `${commit} is not in the history of HEAD`;
  }
  if (fails('diff', '--quiet', 'HEAD', '--', path)) return `${path} has uncommitted changes`;
  let at;
  let head;
  try {
    at = git('rev-parse', `${commit}:${path}`);
    head = git('rev-parse', `HEAD:${path}`);
  } catch {
    return `${path} is not committed at ${commit}`;
  }
  if (at !== head) return `${path} at ${commit} is not ${path} as it stands`;
  if (!git('cat-file', 'commit', commit).includes('\ngpgsig -----BEGIN SSH SIGNATURE-----\n')) {
    return `${commit} is not SSH-signed`;
  }
  const parent = `${commit}^:${path}`;
  if (!fails('rev-parse', parent) && git('rev-parse', parent) === head) {
    return `${commit} is not the first commit carrying ${path}: its parent is`;
  }
  return null;
}

// The block a run may take, given selection.json as it stands (null when there is none), or why
// none may run. Reads nothing.
function blockRefusal({ block, previous, ruleCommit, today }) {
  const { searchFrom } = BLOCKS[block - 1];
  if (block === 1 && previous !== null) return 'selection.json exists; block 1 is never redone';
  if (block === 2) {
    if (previous === null) return 'selection.json does not exist: block 1 first';
    if (previous.blocks.length !== 1) return 'selection.json already holds block 2';
    if (previous.selected.length >= WANTED) {
      return `block 1 selected ${previous.selected.length}; block 2 runs only on fewer than ${WANTED}`;
    }
    if (previous.rule.commit !== ruleCommit) {
      return `block 1 ran on rule commit ${previous.rule.commit}, not ${ruleCommit}`;
    }
  }
  if (today < searchFrom) return `block ${block} is searched no earlier than ${searchFrom}`;
  return null;
}

// The block selection.json as it stands calls for.
export function nextBlock(previous) {
  if (previous === null) return 1;
  if (previous.awaitingBlock2) return 2;
  throw new Error('selection.json is final; nothing is widened');
}

// One block of the rule, executed. `get(path)` returns the API's JSON or throws an HttpError;
// `now()` gives the timestamps, and its UTC date is the one the block's date is checked against;
// `previous` is selection.json as it stands, for block 2. Every refusal comes before any read.
// Returns the selection with this block added and the bodies of the pull requests it selected, by
// file stem.
export async function selectBlock({
  get,
  block,
  ruleCommit,
  previous = null,
  signed = SIGNING_DATE,
  ruleCheck = ruleRefusal,
  study1 = pinnedRepositories(STUDY1_SELECTION),
  study2 = pinnedRepositories(STUDY2_SELECTION),
  demo = demoRepositories(),
  now = () => new Date().toISOString(),
}) {
  signingDate(signed);
  if (block !== 1 && block !== 2) throw new Error(`--block ${block}: there are blocks 1 and 2`);
  const ruleProblem = ruleCheck(ruleCommit);
  if (ruleProblem !== null) throw new Error(ruleProblem);
  const startedAt = now();
  const refusal = blockRefusal({ block, previous, ruleCommit, today: startedAt.slice(0, 10) });
  if (refusal !== null) throw new Error(refusal);

  const selected = previous === null ? [] : [...previous.selected];
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

  // The filters in order; the first that fails rejects the candidate and is recorded.
  async function examine(agent, item, week) {
    const fullName = item.repository_url.replace(`${API}/repos/`, '');
    const [owner] = fullName.split('/');
    const candidate = {
      block,
      week,
      agent: agent.id,
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
    if (EXCLUDED_OWNERS.some((o) => same(o, owner))) {
      return reject(1, `repository owner is ${owner}`);
    }
    if (demo.some((r) => same(r, fullName))) {
      return reject(1, `repository is in ${DEMO_SELECTION.path}`);
    }
    if (study1.some((r) => same(r, fullName))) {
      return reject(1, `repository is in ${STUDY1_SELECTION.path}`);
    }
    if (study2.some((r) => same(r, fullName))) {
      return reject(1, `repository is in ${STUDY2_SELECTION.path}`);
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
      block,
      week,
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

  // Each week of the block in order: round-robin from A over one query per agent, until WANTED are
  // selected or every agent's results for the week have run out; an agent whose results run out is
  // skipped for the rest of the week. No week after the one that reaches WANTED is queried.
  const weeksRun = [];
  for (const week of WEEKS.filter((w) => w.block === block)) {
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

  const run = {
    block,
    ...BLOCKS[block - 1],
    startedAt,
    finishedAt: now(),
    weeks: weeksRun,
    selected: selected.length - (previous?.selected.length ?? 0),
  };
  const finalN = selected.length;
  const header =
    previous === null
      ? {
          rule: { path: RULE, commit: ruleCommit },
          tool: TOOL,
          measures: {
            cleanedBodyLength:
              'Unicode code points of the search result body after removing <!-- ... --> and trimming whitespace',
            body: 'SHA-256 of the search result body as returned, UTF-8, and its length in Unicode code points; label offsets index into this body',
          },
          agents: AGENTS,
          exclusions: {
            owners: EXCLUDED_OWNERS,
            demo: { ...DEMO_SELECTION, repositories: demo },
            study1: { ...STUDY1_SELECTION, repositories: study1.length },
            study2: { ...STUDY2_SELECTION, repositories: study2.length },
          },
          weekOrder:
            'within each block, ascending SHA-256 (hex) of the UTF-8 string "week:<start>"; block 2 follows block 1',
          wanted: WANTED,
        }
      : previous;
  const selection = {
    ...header,
    blocks: [...(previous?.blocks ?? []), run],
    // Block 2 is searched only on a shortfall in block 1, and only from its date.
    awaitingBlock2: block === 1 && finalN < WANTED,
    complete: finalN === WANTED,
    finalN,
    selected,
    candidates: [...(previous?.candidates ?? []), ...candidates],
  };
  return { selection, bodies };
}

// Writes selection.json and the block's bodies. Block 1 refuses when selection.json exists; block 2
// refuses unless selection.json on disk is the block 1 it ran on.
export function writeSelection({ selection, bodies }, p = paths()) {
  const block = selection.blocks.length;
  if (block === 1 && existsSync(p.selection)) {
    throw new Error(`${p.selection} exists; a selection is never redone`);
  }
  if (block === 2) {
    const onDisk = existsSync(p.selection) ? readJson(p.selection) : null;
    const ranOn = {
      ...selection,
      blocks: selection.blocks.slice(0, 1),
      awaitingBlock2: true,
      complete: false,
      finalN: selection.blocks[0].selected,
      selected: selection.selected.slice(0, selection.blocks[0].selected),
      candidates: selection.candidates.filter((c) => c.block === 1),
    };
    if (JSON.stringify(onDisk) !== JSON.stringify(ranOn)) {
      throw new Error(`${p.selection} is not the block 1 that block 2 ran on`);
    }
  }
  mkdirSync(p.bodies, { recursive: true });
  for (const [stem, body] of bodies) writeFileSync(join(p.bodies, `${stem}.md`), body);
  writeJson(p.selection, selection);
}

if (isMain(import.meta.url)) {
  const args = flags(process.argv.slice(2));
  const p = paths();
  const previous = existsSync(p.selection) ? readJson(p.selection) : null;
  const block = nextBlock(previous);
  if (args.block !== undefined && Number(args.block) !== block) {
    throw new Error(`--block ${args.block}: selection.json as it stands calls for block ${block}`);
  }
  const result = await selectBlock({
    get: githubGet,
    block,
    ruleCommit: args['rule-commit'],
    previous,
  });
  writeSelection(result, p);
  const { selection } = result;
  const run = selection.blocks.at(-1);
  const examined = selection.candidates.filter((c) => c.block === block).length;
  const state = selection.complete
    ? `${WANTED} selected: complete`
    : selection.awaitingBlock2
      ? `fewer than ${WANTED}: block 2 is searched from ${BLOCKS[1].searchFrom}`
      : `fewer than ${WANTED}: the rule ran out ("complete": false)`;
  process.stdout.write(
    `block ${block}: ${examined} candidate(s) examined; ${run.selected} selected; ${selection.finalN} in total (${state})\n`,
  );
}

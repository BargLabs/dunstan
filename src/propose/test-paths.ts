// A local model's proposal of test paths (DRAFT 0.2.0, spec D.14, "Proposing patterns"). The model
// runs on the user's own machine, behind an Ollama-compatible API on a loopback address; any other
// endpoint is refused, so nothing leaves the machine. It is given the repository's tracked file
// paths, never their contents, and asked for patterns in D.14's syntax. What it answers is a
// proposal only: each pattern is checked as a test path, counted against the paths, and printed
// with the model's name and digest for a person to accept or edit. Nothing here writes a record or
// decides anything.

import { MAX_TEST_PATHS, matchesTestPath, testPathProblem } from '../check/test-paths.js';

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
// The paths sent: the first ones in code-unit order, so the prompt has a bound and is repeatable.
export const MAX_PATHS = 3000;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class ProposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposeError';
  }
}

export interface Proposal {
  proposer: { kind: 'local-model'; model: string; digest: string; endpoint: string };
  // Each accepted pattern with how many of the paths it matches (0: it matches none of them).
  patterns: { pattern: string; matches: number }[];
  // What the model answered that is not a test path, with why.
  rejected: { pattern: string; problem: string }[];
  // How many tracked paths there are, and how many were sent.
  paths: { total: number; sent: number };
  // The largest top-level directories that no accepted pattern matches a path in, at most
  // MAX_UNCOVERED, for the person reviewing the proposal: a directory of tests the model missed
  // shows here. A count of paths, and nothing decided by it.
  uncovered: { dir: string; paths: number }[];
}

export const MAX_UNCOVERED = 10;

// Top-level directories none of whose paths a pattern matches, largest first, then by name.
export function uncoveredDirectories(
  paths: readonly string[],
  patterns: readonly string[],
): { dir: string; paths: number }[] {
  const total = new Map<string, number>();
  const covered = new Set<string>();
  for (const path of paths) {
    const at = path.indexOf('/');
    if (at < 0) continue;
    const dir = `${path.slice(0, at)}/`;
    total.set(dir, (total.get(dir) ?? 0) + 1);
    if (patterns.some((p) => matchesTestPath(p, path))) covered.add(dir);
  }
  return [...total]
    .filter(([dir]) => !covered.has(dir))
    .map(([dir, n]) => ({ dir, paths: n }))
    .sort((a, b) => b.paths - a.paths || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
    .slice(0, MAX_UNCOVERED);
}

// The endpoint, or a refusal unless it is http on a loopback host.
export function loopbackEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ProposeError(`--endpoint ${endpoint} is not a URL`);
  }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname)) {
    throw new ProposeError(
      `--endpoint ${endpoint}: only a model on this machine (http on 127.0.0.1, ::1 or localhost) is used, never a hosted one`,
    );
  }
  return url;
}

export function prompt(paths: readonly string[]): string {
  return [
    'You propose which files of a repository are its tests: test code, test fixtures and test data.',
    'Answer with JSON only, {"patterns": [...]}, at most 50 glob patterns in this syntax:',
    '- a pattern without / matches a file name in any directory (*_test.go);',
    '- a pattern with / matches the whole path from the root (src/**/*.test.ts);',
    '- ** is any number of path segments, * any characters but /, ? one character but /, {a,b} either;',
    '- no leading / or !, no [ ], no . or .. segments.',
    'Prefer few general patterns to many file names. The repository holds these paths:',
    '',
    ...paths,
  ].join('\n');
}

type Fetch = typeof fetch;

async function json(fetchFn: Fetch, url: URL, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (e) {
    throw new ProposeError(
      `the local model at ${url.origin} did not answer (${(e as Error).message}): is it running?`,
    );
  }
  if (!response.ok) throw new ProposeError(`${url.pathname} answered HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new ProposeError(`${url.pathname} answered something other than JSON`);
  }
}

// The model's digest from the list of local models, which names each model with its tag.
async function modelDigest(fetchFn: Fetch, base: URL, model: string): Promise<string> {
  const tags = (await json(fetchFn, new URL('/api/tags', base))) as {
    models?: { name?: unknown; model?: unknown; digest?: unknown }[];
  };
  const names = (m: { name?: unknown; model?: unknown }) => [m.name, m.model];
  const withTag = model.includes(':') ? model : `${model}:latest`;
  const found = (tags.models ?? []).find(
    (m) => names(m).includes(model) || names(m).includes(withTag),
  );
  if (found === undefined || typeof found.digest !== 'string' || found.digest === '') {
    throw new ProposeError(`no local model ${model} with a digest: pull it first`);
  }
  return found.digest;
}

export async function proposeTestPaths(
  allPaths: readonly string[],
  options: { model: string; endpoint?: string; fetch?: Fetch },
): Promise<Proposal> {
  const fetchFn = options.fetch ?? fetch;
  const base = loopbackEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
  const sorted = [...allPaths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sent = sorted.slice(0, MAX_PATHS);
  const digest = await modelDigest(fetchFn, base, options.model);
  const answer = (await json(fetchFn, new URL('/api/generate', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      prompt: prompt(sent),
      stream: false,
      format: 'json',
      options: { temperature: 0 },
    }),
  })) as { response?: unknown };
  let proposed: unknown;
  try {
    proposed = JSON.parse(typeof answer.response === 'string' ? answer.response : '');
  } catch {
    throw new ProposeError('the model did not answer with JSON');
  }
  const list = (proposed as { patterns?: unknown } | null)?.patterns;
  if (!Array.isArray(list)) throw new ProposeError('the model answered no "patterns" list');

  const patterns: Proposal['patterns'] = [];
  const rejected: Proposal['rejected'] = [];
  for (const item of list) {
    const pattern = typeof item === 'string' ? item : JSON.stringify(item);
    const problem = typeof item === 'string' ? testPathProblem(item) : 'is not a string';
    if (problem !== undefined) rejected.push({ pattern, problem });
    else if (patterns.length >= MAX_TEST_PATHS) {
      rejected.push({ pattern, problem: `is past the ${MAX_TEST_PATHS} test paths allowed` });
    } else if (!patterns.some((p) => p.pattern === pattern)) {
      patterns.push({
        pattern,
        matches: sorted.filter((path) => matchesTestPath(pattern, path)).length,
      });
    }
  }
  return {
    proposer: { kind: 'local-model', model: options.model, digest, endpoint: base.origin },
    patterns,
    rejected,
    paths: { total: sorted.length, sent: sent.length },
    uncovered: uncoveredDirectories(
      sorted,
      patterns.map((x) => x.pattern),
    ),
  };
}

export function proposalText(p: Proposal): string {
  const lines = [
    `proposed by ${p.proposer.model} (digest ${p.proposer.digest}) at ${p.proposer.endpoint}, from ${p.paths.sent} of ${p.paths.total} tracked paths, never their contents.`,
    'A proposal only: accept the patterns, or edit them to what this repository calls a test.',
    '',
    ...p.patterns.map(
      (x) =>
        `  ${x.pattern}  (${x.matches === 0 ? 'matches no tracked path' : `${x.matches} paths`})`,
    ),
  ];
  if (p.rejected.length > 0) {
    lines.push(
      '',
      'not test paths, left out:',
      ...p.rejected.map((r) => `  ${r.pattern}  ${r.problem}`),
    );
  }
  if (p.uncovered.length > 0) {
    lines.push(
      '',
      'not covered: no pattern matches a path in these directories, largest first; check whether any',
      'holds tests, fixtures or test data the model missed:',
      ...p.uncovered.map((u) => `  ${u.dir}  (${u.paths} paths)`),
    );
  }
  if (p.patterns.length > 0) {
    lines.push(
      '',
      "For the Action's step, once accepted:",
      '',
      '        with:',
      '          test-paths: |',
      ...p.patterns.map((x) => `            ${x.pattern}`),
    );
  }
  return `${lines.join('\n')}\n`;
}

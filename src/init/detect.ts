// What `dunstan init` reads from a checkout: the test runners its manifests name, anywhere in the
// tree, and the jobs of its GitHub Actions workflows that run them. Local files only, read as text:
// a workflow is scanned line by line, not parsed, because init only points at a job and prints steps
// for it. It never edits a workflow, so a job it misreads costs a wrong pointer, never a broken file.
//
// A job may run the tests through a tool of the project's: a package.json script, a Makefile target
// or a tox environment. init reads what that tool runs, and matches the job only when it runs a
// runner, so `tox -e typing` (mypy) or `make lint` is not taken for the tests. A tool it cannot read
// (nox, just, task, or a script, target or environment it does not find) is matched to the first
// runner found when its line names a test, and the job says so.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { RECIPES, type Recipe, TEST_WRAPPER } from './content.js';

function read(dir: string, path: string): string | undefined {
  try {
    return readFileSync(join(dir, path), 'utf8');
  } catch {
    return undefined;
  }
}

function isFile(dir: string, path: string): boolean {
  try {
    return statSync(join(dir, path)).isFile();
  } catch {
    return false;
  }
}

function packageJson(dir: string, path: string): Record<string, unknown> | undefined {
  const text = read(dir, path);
  if (text === undefined) return undefined;
  try {
    const json = JSON.parse(text) as unknown;
    return json !== null && typeof json === 'object'
      ? (json as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const objectKeys = (v: unknown) => (v !== null && typeof v === 'object' ? Object.keys(v) : []);

// The runners the manifests in one directory name.
function runnersIn(dir: string, at: string): Set<Recipe['id']> {
  const p = (name: string) => (at === '' ? name : `${at}/${name}`);
  const contains = (name: string, text: string) => read(dir, p(name))?.includes(text) ?? false;
  const pkg = packageJson(dir, p('package.json'));
  const deps = new Set(['dependencies', 'devDependencies'].flatMap((k) => objectKeys(pkg?.[k])));
  const found = new Set<Recipe['id']>();
  if (
    isFile(dir, p('pytest.ini')) ||
    isFile(dir, p('conftest.py')) ||
    contains('pyproject.toml', 'pytest') ||
    contains('setup.cfg', '[tool:pytest]') ||
    contains('tox.ini', '[pytest]')
  ) {
    found.add('pytest');
  }
  if (deps.has('jest')) found.add('jest');
  if (deps.has('vitest')) found.add('vitest');
  if (isFile(dir, p('pom.xml'))) found.add('maven');
  if (isFile(dir, p('build.gradle')) || isFile(dir, p('build.gradle.kts'))) found.add('gradle');
  if (isFile(dir, p('go.mod'))) found.add('go');
  return found;
}

// Directories never searched for manifests: dependencies, build output, environments and fixtures.
const SKIPPED = new Set([
  '.git',
  'node_modules',
  'vendor',
  'third_party',
  'target',
  'build',
  'dist',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  'testdata',
  'fixtures',
  '__fixtures__',
]);
export const SEARCH_DEPTH = 4;

function directories(dir: string, at = '', depth = 0): string[] {
  if (depth > SEARCH_DEPTH) return [];
  let entries: string[];
  try {
    entries = readdirSync(join(dir, at), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIPPED.has(e.name) && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const out = [at];
  for (const name of entries)
    out.push(...directories(dir, at === '' ? name : `${at}/${name}`, depth + 1));
  return out;
}

export interface Runner {
  recipe: Recipe;
  // The directories, from the checkout's root, whose manifests name it; '' is the root.
  dirs: string[];
}

// The runners the checkout's manifests name, in RECIPES order, searched to SEARCH_DEPTH levels.
export function detectRunners(dir: string): Runner[] {
  const dirs = new Map<Recipe['id'], string[]>();
  for (const at of directories(dir)) {
    for (const id of runnersIn(dir, at)) dirs.set(id, [...(dirs.get(id) ?? []), at]);
  }
  return RECIPES.filter((r) => dirs.has(r.id)).map((recipe) => ({
    recipe,
    dirs: dirs.get(recipe.id) ?? [],
  }));
}

// ------------------------------------------------------------------ what a project's tool runs

const MAX_DEPTH = 3;

function packageScript(dir: string, at: string, line: string, depth: number): string | undefined {
  const m = /\b(npm|pnpm|yarn|bun)\s+(?:(run|run-script)\s+)?([\w:.-]+)/.exec(line);
  if (m === null || m[3] === undefined) return undefined;
  const [, tool, run, name] = m;
  // `bun test` runs Bun's own runner, and `npm install` is no script.
  if (tool === 'bun' && run === undefined && name === 'test') return undefined;
  // npm runs a script without `run` only for test; pnpm, yarn and bun run any.
  if (tool === 'npm' && run === undefined && !/^(test|t|tst)$/.test(name)) return undefined;
  const scripts = packageJson(dir, posix.join(at, 'package.json'))?.scripts;
  const script = (scripts as Record<string, unknown> | undefined)?.[
    name === 't' || name === 'tst' ? 'test' : name
  ];
  if (typeof script !== 'string') return undefined;
  return expand(dir, at, script, depth + 1) ?? script;
}

// The commands a Makefile target runs: its recipe, or, for a target with none, its prerequisites'
// recipes, with the Makefile's variables put in. A `target: VAR = value` line sets a variable for
// the target, and is no rule.
function makeTarget(dir: string, at: string, line: string, depth: number): string | undefined {
  const m = /(?:^|[\s;&|])(?:make|gmake|\$\(MAKE\)|\$\{MAKE\})((?:\s+-\S+)*)\s+([\w./-]+)/.exec(
    line,
  );
  if (m === null || m[2] === undefined) return undefined;
  const makefile = ['GNUmakefile', 'makefile', 'Makefile']
    .map((f) => read(dir, posix.join(at, f)))
    .find((t) => t !== undefined);
  if (makefile === undefined) return undefined;
  const lines = makefile.split(/\r?\n/);
  const variables = new Map<string, string>();
  for (const l of lines) {
    const v = /^ *(?:export\s+)?([A-Za-z_][\w]*)\s*[:?+!]?=\s*(.*)$/.exec(l);
    if (v !== null && !variables.has(v[1] as string))
      variables.set(v[1] as string, (v[2] ?? '').trim());
  }
  // A target's own variables (`test: FORMAT ?= short`), where no global one is set.
  for (const l of lines) {
    const v = /^[^\t#=:][^=:]*?:\s*(?:export\s+)?([A-Za-z_]\w*)\s*[:?+!]?=\s*(.*)$/.exec(l);
    if (v !== null && !variables.has(v[1] as string))
      variables.set(v[1] as string, (v[2] ?? '').trim());
  }
  const substitute = (text: string) => {
    let out = text;
    for (let i = 0; i < 3; i++) {
      out = out.replace(
        /\$[({]([A-Za-z_]\w*)[)}]/g,
        (all, name: string) => variables.get(name) ?? all,
      );
    }
    return out;
  };
  const commandsOf = (target: string, seen: Set<string>): string[] => {
    if (seen.has(target) || seen.size > 8) return [];
    seen.add(target);
    const recipe: string[] = [];
    const prerequisites: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const rule = /^([^\t#=:][^=:]*?)\s*::?(?!=)(.*)$/.exec(lines[i] ?? '');
      if (rule === null || !(rule[1] ?? '').split(/\s+/).includes(target)) continue;
      const rest = (rule[2] ?? '').split('#')[0] ?? '';
      if (/^\s*(?:export\s+)?[\w.-]+\s*[:?+!]?=/.test(rest)) continue;
      const [deps, inline] = rest.split(';');
      prerequisites.push(
        ...(deps ?? '')
          .trim()
          .split(/\s+/)
          .filter((d) => d !== '' && d !== '|'),
      );
      if (inline !== undefined && inline.trim() !== '') recipe.push(inline.trim());
      for (const l of lines.slice(i + 1)) {
        if (l.startsWith('\t')) recipe.push(l.trim().replace(/^[@+-]+/, ''));
        else if (l.trim() !== '' && !l.trimStart().startsWith('#')) break;
      }
    }
    if (recipe.length > 0) return recipe.map(substitute);
    return prerequisites.flatMap((p) => commandsOf(p, seen));
  };
  const commands = commandsOf(m[2], new Set());
  if (commands.length === 0) return undefined;
  return commands.map((r) => expand(dir, at, r, depth + 1) ?? r).join('\n');
}

// The body of a just recipe: the indented lines under its header, `@` and `-` prefixes dropped.
function justRecipe(dir: string, at: string, line: string, depth: number): string | undefined {
  const m = /(?:^|[\s;&|])just((?:\s+-\S+)*)\s+([\w-]+)/.exec(line);
  if (m === null || m[2] === undefined) return undefined;
  const justfile = ['justfile', 'Justfile', '.justfile']
    .map((f) => read(dir, posix.join(at, f)))
    .find((t) => t !== undefined);
  if (justfile === undefined) return undefined;
  const lines = justfile.split(/\r?\n/);
  const head = lines.findIndex((l) => new RegExp(`^@?${m[2]}(\\s[^:=]*)?:(?!=)`).test(l));
  if (head < 0) return undefined;
  const body: string[] = [];
  for (const l of lines.slice(head + 1)) {
    if (/^\s+\S/.test(l)) body.push(l.trim().replace(/^[@-]+/, ''));
    else if (l.trim() !== '') break;
  }
  return body.map((b) => expand(dir, at, b, depth + 1) ?? b).join('\n');
}

// The commands of a Taskfile task: its `cmds:` items, as strings or as `cmd:` keys.
function taskCommands(dir: string, at: string, line: string, depth: number): string | undefined {
  const m = /(?:^|[\s;&|])(?:task|go-task)((?:\s+-\S+)*)\s+([\w:-]+)/.exec(line);
  if (m === null || m[2] === undefined) return undefined;
  const taskfile = ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml']
    .map((f) => read(dir, posix.join(at, f)))
    .find((t) => t !== undefined);
  if (taskfile === undefined) return undefined;
  const lines = taskfile.split(/\r?\n/);
  const name = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = lines.findIndex((l) => new RegExp(`^\\s+['"]?${name}['"]?:\\s*$`).test(l));
  if (head < 0) return undefined;
  const indent = (lines[head] ?? '').length - (lines[head] ?? '').trimStart().length;
  const cmds: string[] = [];
  for (const l of lines.slice(head + 1)) {
    if (l.trim() !== '' && l.length - l.trimStart().length <= indent) break;
    const item = /^\s*-\s+(?:cmd:\s*)?(.+)$/.exec(l)?.[1] ?? /^\s+cmd:\s*(.+)$/.exec(l)?.[1];
    if (item !== undefined) cmds.push(item.trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return cmds.map((c) => expand(dir, at, c, depth + 1) ?? c).join('\n');
}

// The `session.run(...)` commands of a nox session, or of every session when the line names none.
function noxSessions(dir: string, at: string, line: string): string | undefined {
  if (!/\bnox\b/.test(line)) return undefined;
  const text = read(dir, posix.join(at, 'noxfile.py'));
  if (text === undefined) return undefined;
  const wanted = /\s(?:-s|--session|--sessions)[\s=]+([\w.,-]+)/.exec(line)?.[1]?.split(',');
  const lines = text.split(/\r?\n/);
  const runs: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const def = /^def\s+(\w+)\s*\(/.exec(lines[i] ?? '');
    if (def === null) continue;
    const decorators = lines.slice(Math.max(0, i - 3), i).join('\n');
    if (!/@nox\.session/.test(decorators)) continue;
    const named = /name\s*=\s*["']([\w.-]+)["']/.exec(decorators)?.[1] ?? def[1];
    if (wanted !== undefined && !wanted.includes(named as string)) continue;
    for (const l of lines.slice(i + 1)) {
      if (l.trim() !== '' && !/^\s/.test(l)) break;
      const call = /session\.run\((.*)/.exec(l)?.[1];
      if (call !== undefined) {
        runs.push([...call.matchAll(/["']([^"']*)["']/g)].map((q) => q[1]).join(' '));
      }
    }
  }
  return runs.length > 0 ? runs.join('\n') : undefined;
}

// The `commands` of a tox environment, or of the base environment when it sets none.
function toxCommands(dir: string, at: string, line: string): string | undefined {
  if (!/\btox\b/.test(line)) return undefined;
  const env = /\s-e\s*([^\s]+)/.exec(line)?.[1];
  const envs = env === undefined || env.includes('${{') ? [] : env.split(',');
  const sources: { text: string | undefined; env: (e: string) => RegExp; base: RegExp }[] = [
    {
      text: read(dir, posix.join(at, 'tox.ini')),
      env: (e) => new RegExp(`^\\[testenv:${e}\\]`),
      base: /^\[testenv\]/,
    },
    {
      text: read(dir, posix.join(at, 'tox.toml')),
      env: (e) => new RegExp(`^\\[env\\.${e}\\]`),
      base: /^\[env_run_base\]/,
    },
    {
      text: read(dir, posix.join(at, 'pyproject.toml')),
      env: (e) => new RegExp(`^\\[tool\\.tox\\.env\\.${e}\\]|^\\[testenv:${e}\\]`),
      base: /^\[tool\.tox\.env_run_base\]|^\[testenv\]/,
    },
  ];
  for (const s of sources) {
    if (s.text === undefined) continue;
    const lines = s.text.split(/\r?\n/);
    const commandsOf = (header: RegExp): string | undefined => {
      const at = lines.findIndex((l) => header.test(l));
      if (at < 0) return undefined;
      const body: string[] = [];
      let inCommands = false;
      for (const l of lines.slice(at + 1)) {
        if (/^\[[^[\]"']+\]\s*$/.test(l)) break;
        if (/^\s*commands\s*=/.test(l)) inCommands = true;
        else if (/^[\w.-]+\s*=/.test(l)) inCommands = false;
        if (inCommands) body.push(l);
      }
      return body.length > 0 ? body.join('\n') : undefined;
    };
    const base = commandsOf(s.base);
    const per = envs.map(
      (e) => commandsOf(s.env(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ?? base,
    );
    const all = envs.length === 0 ? [base] : per;
    if (all.every((c) => c !== undefined)) return all.join('\n');
  }
  return undefined;
}

// The commands of a shell script a line runs (`./scripts/test.sh`, `bash ci/test.sh`): its lines,
// without comments, with continuations joined.
function shellScript(dir: string, at: string, line: string, depth: number): string | undefined {
  const m =
    /(?:^|[\s;&|])(?:(?:bash|sh|zsh)\s+(?:-\S+\s+)*)?((?:\.{1,2}\/)?[\w./-]+\.sh|\.\/[\w./-]+)(?=\s|$|;)/.exec(
      line,
    );
  if (m === null || m[1] === undefined) return undefined;
  const text = read(dir, posix.join(at, m[1]));
  if (text === undefined || (!m[1].endsWith('.sh') && !text.startsWith('#!'))) return undefined;
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  const commands = lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  return commands.map((c) => expand(dir, at, c, depth + 1) ?? c).join('\n');
}

// What a run line's tool runs, read from the project's own files, or undefined when it is not a
// tool init reads or init cannot find what it runs.
function expand(dir: string, at: string, line: string, depth = 0): string | undefined {
  if (depth > MAX_DEPTH) return undefined;
  return (
    packageScript(dir, at, line, depth) ??
    makeTarget(dir, at, line, depth) ??
    justRecipe(dir, at, line, depth) ??
    shellScript(dir, at, line, depth) ??
    taskCommands(dir, at, line, depth) ??
    toxCommands(dir, at, line) ??
    noxSessions(dir, at, line)
  );
}

// ------------------------------------------------------------------ workflows

export interface WorkflowJob {
  // The workflow file's path from the checkout's root.
  workflow: string;
  jobId: string;
  // The job's name as a run records it: its `name:` if it sets one, else its id. Undefined when the
  // name is an expression, which only the run can resolve.
  name: string | undefined;
  matrix: boolean;
  // The `run:` line that runs the tests, trimmed, without `run:` or a leading `- `; for a block
  // scalar, the line of it that does.
  runLine: string;
  recipe: Recipe;
  // How the line reaches the runner: it runs it itself ('direct'); through a tool of the project's
  // whose command init read ('tool', with `runs`, the runner's command); or through a tool init
  // could not read, matched by its name only ('unread').
  via: 'direct' | 'tool' | 'workspace' | 'unread';
  runs?: string;
  // For 'workspace': the line runs a script in each workspace package, and these packages' scripts
  // run a runner.
  packages?: WorkspacePackage[];
  // The JUnit file the runner's command already writes, from where the job runs it.
  junit?: string;
  // A GitLab job's stage, `test` when it names none.
  stage?: string;
  // For a matrix job whose matrix init can read: its first leg, with the name a run gives that
  // leg's job. Absent for a matrix with `include`, an expression or a mapping value.
  leg?: Leg;
  // The job's working-directory, when it sets one: its commands, and junit.xml, are there.
  workingDirectory?: string;
  // Whether the job already uploads an artifact named dunstan-junit.
  uploadsRecord: boolean;
  // What pushes run the job's workflow (GitHub only): whether a pull request's base commit, on the
  // default branch, gets a run and so a test record (spec D.13).
  push?: PushTrigger;
}

// The pushes that run a workflow, from its `on:`. 'all': a push to any branch; 'branches': a push
// to a branch that matches one of `patterns`; 'ignore': to any branch but those; 'none': no push to
// a branch (no `push` event, or only tags); 'unknown': init cannot read the `on:` (an expression, a
// flow mapping, a shape it does not know). `paths`: the push event filters on paths, so a push that
// changes none of them does not run it.
export interface PushTrigger {
  kind: 'all' | 'branches' | 'ignore' | 'none' | 'unknown';
  patterns?: string[];
  paths?: boolean;
}

const flowList = (value: string): string[] | undefined =>
  value.startsWith('[') && value.endsWith(']')
    ? value
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter((x) => x !== '')
    : undefined;

export function pushTrigger(text: string): PushTrigger {
  const lines = text.split(/\r?\n/).map(withoutComment);
  const at = lines.findIndex((l) => /^(on|"on"|'on'):/.test(l));
  if (at < 0) return { kind: 'unknown' };
  const inline = (lines[at] as string).replace(/^[^:]+:/, '').trim();
  if (inline !== '') {
    if (inline.startsWith('{')) return { kind: 'unknown' };
    const events = flowList(inline) ?? [unquote(inline)];
    return { kind: events.includes('push') ? 'all' : 'none' };
  }
  const body: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '') continue;
    if (indentOf(line) === 0) break;
    body.push(line);
  }
  const top = body[0] === undefined ? undefined : indentOf(body[0]);
  if (top === undefined) return { kind: 'unknown' };
  if ((body[0] as string).trimStart().startsWith('-')) {
    const events = body
      .filter((l) => indentOf(l) === top)
      .map((l) => unquote(l.trim().replace(/^-\s*/, '')));
    return { kind: events.includes('push') ? 'all' : 'none' };
  }
  const i = body.findIndex((l) => indentOf(l) === top && /^\s*push:/.test(l));
  if (i < 0) return { kind: 'none' };
  const value = (body[i] as string).replace(/^\s*push:/, '').trim();
  if (!['', '{}', 'null', '~'].includes(value)) return { kind: 'unknown' };
  const filters = new Map<string, string[]>();
  let key: string | undefined;
  let keyIndent: number | undefined;
  for (const line of body.slice(i + 1)) {
    if (indentOf(line) <= top) break;
    keyIndent ??= indentOf(line);
    if (indentOf(line) === keyIndent) {
      const m = /^\s*([A-Za-z-]+):\s*(.*)$/.exec(line);
      if (m === null) return { kind: 'unknown' };
      key = m[1] as string;
      const v = (m[2] ?? '').trim();
      const list = v === '' ? [] : flowList(v);
      if (list === undefined) return { kind: 'unknown' };
      filters.set(key, list);
    } else {
      const item = /^\s*-\s*(.+)$/.exec(line);
      if (item === null || key === undefined) return { kind: 'unknown' };
      filters.get(key)?.push(unquote(item[1] as string));
    }
  }
  const paths = filters.has('paths') || filters.has('paths-ignore') ? { paths: true } : {};
  const branches = filters.get('branches');
  if (branches !== undefined) return { kind: 'branches', patterns: branches, ...paths };
  const ignored = filters.get('branches-ignore');
  if (ignored !== undefined) return { kind: 'ignore', patterns: ignored, ...paths };
  // Tags alone: GitHub runs it for no branch push.
  if (filters.has('tags') || filters.has('tags-ignore')) return { kind: 'none' };
  return { kind: 'all', ...paths };
}

// Whether a branch filter pattern matches `branch`: true, false, or undefined when the pattern uses
// a filter character init does not evaluate (`?`, `+`, `[`, or a leading `!`).
export function branchMatches(pattern: string, branch: string): boolean | undefined {
  if (/[?+[\]]/.test(pattern) || pattern.startsWith('!')) return undefined;
  const regex = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((x) => x.replace(/[.^$(){}|\\/]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${regex}$`).test(branch);
}

export const WORKFLOWS_DIR = '.github/workflows';

export function workflowFiles(dir: string): string[] {
  try {
    return readdirSync(join(dir, WORKFLOWS_DIR))
      .filter((f) => /\.ya?ml$/.test(f))
      .sort()
      .map((f) => `${WORKFLOWS_DIR}/${f}`);
  } catch {
    return [];
  }
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
const withoutComment = (line: string) => line.replace(/\s+#.*$/, '');

interface JobText {
  id: string;
  lines: string[];
  indent: number;
}

// The jobs under the top-level `jobs:` key, each with its lines.
function jobsOf(text: string): JobText[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start < 0) return [];
  const jobs: JobText[] = [];
  let jobIndent: number | undefined;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indent = indentOf(line);
    if (indent === 0) break;
    jobIndent ??= indent;
    const key = /^\s*([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
    if (indent === jobIndent && key?.[1] !== undefined) {
      jobs.push({ id: key[1], lines: [], indent });
    } else {
      jobs.at(-1)?.lines.push(line);
    }
  }
  return jobs;
}

// The commands of a job's `run:` keys: the value on the key's line, or each line of a block scalar
// (`run: |`, `run: >-`) under it.
function runLines(lines: string[]): string[] {
  const out: string[] = [];
  let block: number | undefined;
  for (const line of lines) {
    if (block !== undefined) {
      if (line.trim() === '' || indentOf(line) > block) {
        if (line.trim() !== '') out.push(line.trim());
        continue;
      }
      block = undefined;
    }
    const run = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(withoutComment(line));
    if (run === null) continue;
    const value = (run[2] ?? '').trim();
    if (value === '' || /^[|>][-+]?$/.test(value)) block = indentOf(line);
    else out.push(value);
  }
  return out;
}

export interface Leg {
  values: { key: string; value: string; number: boolean }[];
  // The leg's job name as a run records it, or undefined when its name holds an expression other
  // than a matrix value.
  name: string | undefined;
}

// A YAML scalar as GitHub reads it into a matrix value: an unquoted number is a number, so `3.10`
// is 3.1. Undefined for an expression, a mapping or a flow sequence.
function scalar(raw: string): { value: string; number: boolean } | undefined {
  const t = raw.trim();
  if (t === '' || /[{[]|\$\{\{/.test(t)) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return { value: String(Number(t)), number: true };
  return { value: unquote(t), number: false };
}

// The matrix of a job's `strategy:`, keys in order with their values, and its `exclude` entries;
// undefined when init cannot read it whole.
type Value = { value: string; number: boolean };

function matrixOf(
  lines: string[],
): { keys: [string, Value[]][]; excludes: Map<string, string>[] } | undefined {
  const at = lines.findIndex((l) => /^\s*matrix:\s*$/.test(withoutComment(l)));
  if (at < 0) return undefined;
  const base = indentOf(lines[at] ?? '');
  const body: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === '' || l.trimStart().startsWith('#')) continue;
    if (indentOf(l) <= base) break;
    body.push(withoutComment(l));
  }
  const keyIndent = Math.min(...body.map(indentOf));
  const keys: [string, Value[]][] = [];
  const excludes: Map<string, string>[] = [];
  let current: string | undefined;
  for (const l of body) {
    const key = indentOf(l) === keyIndent ? /^\s*([\w-]+):\s*(.*)$/.exec(l) : null;
    if (key !== null) {
      current = key[1] as string;
      const rest = (key[2] ?? '').trim();
      if (current === 'include') return undefined;
      if (current === 'exclude') continue;
      if (rest === '') keys.push([current, []]);
      else if (/^\[.*\]$/.test(rest)) {
        const items = rest
          .slice(1, -1)
          .split(',')
          .map((v) => scalar(v));
        if (items.some((v) => v === undefined)) return undefined;
        keys.push([current, items as Value[]]);
      } else return undefined;
      continue;
    }
    if (current === 'exclude') {
      const item = /^\s*(-\s+)?([\w-]+):\s*(.+)$/.exec(l);
      if (item === null) return undefined;
      if (item[1] !== undefined || excludes.length === 0) excludes.push(new Map());
      const v = scalar(item[3] ?? '');
      if (v === undefined) return undefined;
      excludes.at(-1)?.set(item[2] as string, v.value);
      continue;
    }
    const entry = keys.at(-1);
    const item = /^\s*-\s+(.+)$/.exec(l)?.[1];
    const v = item === undefined ? undefined : scalar(item);
    if (entry === undefined || v === undefined || entry[0] !== current) return undefined;
    entry[1].push(v);
  }
  if (keys.length === 0 || keys.some(([, v]) => v.length === 0)) return undefined;
  return { keys, excludes };
}

// The first leg of a job's matrix that no `exclude` removes, keys varying last-first.
function firstLeg(lines: string[], display: string): Leg | undefined {
  const matrix = matrixOf(lines);
  if (matrix === undefined) return undefined;
  const combos: Value[][] = [[]];
  for (const [, values] of matrix.keys) {
    const next: Value[][] = [];
    for (const c of combos) for (const v of values) next.push([...c, v]);
    combos.splice(0, combos.length, ...next);
  }
  const keys = matrix.keys.map(([k]) => k);
  const leg = combos.find(
    (c) => !matrix.excludes.some((e) => [...e].every(([k, v]) => c[keys.indexOf(k)]?.value === v)),
  );
  if (leg === undefined) return undefined;
  const values = keys.map((key, i) => ({ key, ...(leg[i] as Value) }));
  let name: string | undefined;
  if (display.includes('${{')) {
    const named = display.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g, (all, k: string) =>
      keys.includes(k) ? (leg[keys.indexOf(k)]?.value ?? all) : all,
    );
    name = named.includes('${{') ? undefined : named;
  } else {
    name = `${display} (${values.map((v) => v.value).join(', ')})`;
  }
  return { values, name };
}

// An install line names a runner without running it: `pip install pytest`, `go get`, `npm ci`.
const INSTALL = /\b(install|get)\b|\b(npm|pnpm|yarn|bun|uv|poetry)\s+(ci|add|i)\b/;

// A command as a tool's file writes it, as one would type it: a tox `commands =` key dropped, and a
// TOML array (`["pytest", "-v"],`) joined, without its inline tables (`{ replace = "posargs" }`).
function commandText(command: string): string {
  const text = command.trim().replace(/^commands\s*=\s*/, '');
  if (!/^\[*\s*"/.test(text)) return text;
  const strings = text.replace(/\{\s*[\w-]+\s*=[^}]*\}/g, '').matchAll(/"((?:[^"\\]|\\.)*)"/g);
  return [...strings].map((m) => m[1]).join(' ');
}

export interface WorkspacePackage {
  // The package's directory from the checkout's root.
  dir: string;
  recipe: Recipe;
  // The runner's command in the package's script.
  runs: string;
}

// The script a line runs in every workspace package (turbo, nx, lerna, pnpm -r or --filter, npm
// --workspaces, yarn workspaces), or undefined.
function workspaceScript(line: string): string | undefined {
  const patterns = [
    /\bturbo\s+(?:run\s+)?([\w:.-]+)/,
    /\bnx\s+(?:run-many|affected)\b.*?(?:-t|--targets?)[=\s]+([\w:.-]+)/,
    /\blerna\s+run\s+([\w:.-]+)/,
    /\bpnpm(?:\s+(?:-r|--recursive|--filter[=\s]\S+|-F\s+\S+|--parallel|--stream|-w))+\s+(?:run\s+)?([\w:.-]+)/,
    /\bnpm\s+(?:run\s+)?([\w:.-]+)\b.*\s(?:--workspaces|-ws)\b/,
    /\byarn\s+workspaces\s+(?:foreach\b.*?\s)?run\s+([\w:.-]+)/,
  ];
  for (const p of patterns) {
    const name = p.exec(line)?.[1];
    if (name !== undefined && !name.startsWith('-')) return name;
  }
  return undefined;
}

// The packages below the root whose script `name` runs a runner; `scripted`, whether any package
// has the script at all.
function workspacePackages(
  dir: string,
  name: string,
): { found: WorkspacePackage[]; scripted: boolean } {
  const found: WorkspacePackage[] = [];
  let scripted = false;
  for (const at of directories(dir).filter((d) => d !== '')) {
    const scripts = packageJson(dir, posix.join(at, 'package.json'))?.scripts;
    const script = (scripts as Record<string, unknown> | undefined)?.[name];
    if (typeof script !== 'string') continue;
    scripted = true;
    const text = expand(dir, at, script, 1) ?? script;
    for (const command of text.split('\n')) {
      const recipe = RECIPES.find((r) => r.direct.test(command));
      if (recipe !== undefined) {
        found.push({ dir: at, recipe, runs: commandText(command) });
        break;
      }
    }
  }
  return { found, scripted };
}

interface Match {
  runLine: string;
  recipe: Recipe;
  via: WorkflowJob['via'];
  runs?: string;
  packages?: WorkspacePackage[];
  junit?: string;
}

// The JUnit file a runner's command already writes (`--junitfile`, `--junitxml`, `--junit-xml`,
// `--outputFile.junit`), as a path from where it runs; undefined when it writes none, or names it
// with a variable.
export function junitOutput(command: string): string | undefined {
  const m = /--(?:junitfile|junit-?xml|outputFile\.junit)(?:=|\s+)(['"]?)([^\s'"]+)\1/.exec(
    command,
  );
  const path = m?.[2];
  if (path === undefined || /[$%{]/.test(path)) return undefined;
  return posix.normalize(path).replace(/^\.\//, '');
}

const withJunit = (match: Match, command: string): Match => {
  const junit = junitOutput(command);
  return junit === undefined ? match : { ...match, junit };
};

function matchLine(dir: string, at: string, line: string, runners: Runner[]): Match | undefined {
  const direct = RECIPES.find((r) => r.direct.test(line));
  if (direct !== undefined)
    return withJunit({ runLine: line, recipe: direct, via: 'direct' }, line);
  const text = expand(dir, at, line);
  let notTests = false;
  for (const command of [line, ...(text?.split('\n') ?? [])]) {
    const recipe = command === line ? undefined : RECIPES.find((r) => r.direct.test(command));
    if (recipe !== undefined) {
      return withJunit({ runLine: line, recipe, via: 'tool', runs: commandText(command) }, command);
    }
    const script = workspaceScript(command);
    if (script === undefined) continue;
    const { found, scripted } = workspacePackages(dir, script);
    const first = found[0];
    if (first !== undefined) {
      return { runLine: line, recipe: first.recipe, via: 'workspace', packages: found };
    }
    if (scripted) notTests = true;
  }
  // What the tool runs is read, and runs no runner: a type check, a lint. Unless it hands on to a
  // tool init cannot read, it is not the tests.
  if (notTests || (text !== undefined && !TEST_WRAPPER.test(text))) return undefined;
  const first = runners[0];
  if (TEST_WRAPPER.test(line) && first !== undefined) {
    return { runLine: line, recipe: first.recipe, via: 'unread' };
  }
  return undefined;
}

// The jobs of the checkout's workflows that run tests: a run line that invokes a runner, or a tool
// of the project's that does; failing those, a line that runs a tool init cannot read whose name
// says test (TEST_WRAPPER), matched to the first of `runners`.
export function testJobs(dir: string, runners: Runner[]): WorkflowJob[] {
  const found: WorkflowJob[] = [];
  for (const workflow of workflowFiles(dir)) {
    const text = read(dir, workflow) ?? '';
    for (const job of jobsOf(text)) {
      const keyIndent = Math.min(...job.lines.map(indentOf));
      const name = job.lines
        .filter((l) => indentOf(l) === keyIndent)
        .map((l) => /^\s*name:\s*(.+)$/.exec(withoutComment(l))?.[1])
        .find((n) => n !== undefined);
      const matrix = job.lines.some((l) => /^\s*(strategy|matrix):/.test(l));
      const wd = job.lines
        .map((l) => /^\s*working-directory:\s*(.+)$/.exec(withoutComment(l))?.[1])
        .find((w) => w !== undefined);
      const at = wd === undefined || wd.includes('${{') ? '' : posix.normalize(unquote(wd));
      const workingDirectory = at === '' || at === '.' ? undefined : at.replace(/^\.\//, '');
      const matches = runLines(job.lines)
        .filter((r) => !INSTALL.test(r))
        .map((r) => matchLine(dir, workingDirectory ?? '', r, runners))
        .filter((m): m is Match => m !== undefined);
      const match = matches.find((m) => m.via !== 'unread') ?? matches[0];
      if (match === undefined) continue;
      const display = name === undefined ? job.id : unquote(name);
      const leg = matrix ? firstLeg(job.lines, display) : undefined;
      found.push({
        workflow,
        jobId: job.id,
        name: display.includes('${{') ? undefined : display,
        matrix,
        ...match,
        ...(workingDirectory === undefined ? {} : { workingDirectory }),
        ...(leg === undefined ? {} : { leg }),
        uploadsRecord: job.lines.some((l) => /\bdunstan-junit\b/.test(l)),
        push: pushTrigger(text),
      });
    }
  }
  return found;
}

// Whether a workflow of the checkout already runs the Dunstan Action.
export function runsDunstan(dir: string): string | undefined {
  return workflowFiles(dir).find((w) => /uses:\s*BargLabs\/dunstan@/i.test(read(dir, w) ?? ''));
}

// ------------------------------------------------------------------ GitLab (profile 0.1)

export const GITLAB_CI = '.gitlab-ci.yml';

// Top-level keys of a GitLab CI configuration file that are not jobs.
const GITLAB_KEYWORDS = new Set([
  'default',
  'include',
  'stages',
  'variables',
  'workflow',
  'image',
  'services',
  'cache',
  'before_script',
  'after_script',
  'spec',
]);

// The commands of a GitLab job's script keys: an inline value, each `- ` item, and each line of a
// block scalar item (`- |`).
function gitlabCommands(lines: string[]): string[] {
  const keyIndent = Math.min(...lines.map(indentOf));
  const out: string[] = [];
  let inScript = false;
  let block: number | undefined;
  for (const raw of lines) {
    const line = withoutComment(raw);
    if (line.trim() === '') continue;
    const indent = indentOf(line);
    if (indent === keyIndent) {
      const key = /^\s*([\w-]+):\s*(.*)$/.exec(line);
      inScript = key !== null && /^(before_)?script$/.test(key[1] as string);
      block = undefined;
      const value = (key?.[2] ?? '').trim();
      if (inScript && value !== '' && !/^[|>]/.test(value)) out.push(unquote(value));
      continue;
    }
    if (!inScript) continue;
    if (block !== undefined && indent > block) {
      out.push(line.trim());
      continue;
    }
    block = undefined;
    const item = /^\s*-\s+(.*)$/.exec(line)?.[1]?.trim();
    if (item === undefined) continue;
    if (/^[|>][-+]?$/.test(item)) block = indent;
    else out.push(unquote(item));
  }
  return out;
}

// The jobs of .gitlab-ci.yml that run tests, as testJobs reads a workflow's. A job's name is its
// key; a `parallel: matrix:` job's names carry its values, so it has no name init can give.
// The CI configuration files of the project: .gitlab-ci.yml and the local files it includes,
// two levels deep. A `project:`, `template:`, `remote:` or `component:` include is not the
// project's own file, and a wildcard is not read.
export function gitlabFiles(dir: string): string[] {
  const files: string[] = [];
  const visit = (path: string, depth: number) => {
    if (files.includes(path) || depth > 2) return;
    const text = read(dir, path);
    if (text === undefined) return;
    files.push(path);
    const lines = text.split(/\r?\n/);
    const at = lines.findIndex((l) => /^include:/.test(l));
    if (at < 0) return;
    const inline = /^include:\s*(['"]?)([^\s'"#]+)\1\s*$/.exec(lines[at] ?? '')?.[2];
    const paths: string[] = inline === undefined ? [] : [inline];
    for (const l of lines.slice(at + 1)) {
      if (/^\S/.test(l)) break;
      const local = /^\s*(?:-\s+)?local:\s*(['"]?)([^\s'"#]+)\1/.exec(l)?.[2];
      const bare = /^\s*-\s+(['"]?)([^\s'"#:]+\.ya?ml)\1\s*$/.exec(l)?.[2];
      if (local !== undefined) paths.push(local);
      else if (bare !== undefined) paths.push(bare);
    }
    for (const p of paths) {
      if (!/[*?]/.test(p) && !/^https?:/.test(p)) visit(p.replace(/^\//, ''), depth + 1);
    }
  };
  visit(GITLAB_CI, 0);
  return files;
}

// The jobs of the project's CI configuration files that run tests, as testJobs reads a workflow's.
// A job's name is its key; a `parallel: matrix:` job's names carry its values, so it has no name
// init can give.
export function gitlabTestJobs(dir: string, runners: Runner[]): WorkflowJob[] {
  const found: WorkflowJob[] = [];
  for (const file of gitlabFiles(dir)) {
    const lines = (read(dir, file) ?? '').split(/\r?\n/);
    const jobs: JobText[] = [];
    for (const line of lines) {
      const key = /^([^\s#].*?):\s*(#.*)?$/.exec(line);
      if (key !== null) jobs.push({ id: unquote(key[1] as string), lines: [], indent: 0 });
      else if (/^\S/.test(line)) jobs.push({ id: '', lines: [], indent: 0 });
      else jobs.at(-1)?.lines.push(line);
    }
    for (const job of jobs) {
      if (job.id === '' || job.id.startsWith('.') || GITLAB_KEYWORDS.has(job.id)) continue;
      const body = job.lines.filter((l) => l.trim() !== '');
      if (body.length === 0) continue;
      const matches = gitlabCommands(body)
        .filter((r) => !INSTALL.test(r))
        .map((r) => matchLine(dir, '', r, runners))
        .filter((m): m is Match => m !== undefined);
      const match = matches.find((m) => m.via !== 'unread') ?? matches[0];
      if (match === undefined) continue;
      const matrix = body.some((l) => /^\s*parallel:\s*$/.test(l));
      const kept = artifactPaths(body);
      const stage = body
        .map((l) => /^\s{1,4}stage:\s*(\S+)\s*$/.exec(withoutComment(l))?.[1])
        .find((x) => x !== undefined);
      const record = match.junit ?? 'junit.xml';
      found.push({
        workflow: file,
        jobId: job.id,
        name: matrix ? undefined : job.id,
        matrix,
        ...match,
        uploadsRecord: kept.includes(record),
        stage: stage === undefined ? 'test' : unquote(stage),
      });
    }
  }
  return found;
}

// The paths a GitLab job keeps in its artifacts archive (`artifacts: paths:`).
function artifactPaths(lines: string[]): string[] {
  const at = lines.findIndex((l) => /^\s*artifacts:\s*$/.test(l));
  if (at < 0) return [];
  const base = indentOf(lines[at] ?? '');
  const out: string[] = [];
  let inPaths = false;
  let pathsIndent = 0;
  for (const l of lines.slice(at + 1)) {
    if (indentOf(l) <= base) break;
    const key = /^\s*([\w-]+):\s*(.*)$/.exec(l);
    if (key !== null && !/^\s*-/.test(l)) {
      inPaths = key[1] === 'paths';
      pathsIndent = indentOf(l);
      const flow = /^\[(.*)\]$/.exec((key[2] ?? '').trim())?.[1];
      if (inPaths && flow !== undefined) out.push(...flow.split(',').map((p) => unquote(p)));
      continue;
    }
    const item = inPaths && indentOf(l) >= pathsIndent ? /^\s*-\s+(.+)$/.exec(l)?.[1] : undefined;
    if (item !== undefined) out.push(posix.normalize(unquote(item)).replace(/^\.\//, ''));
  }
  return out;
}

// Whether the project's CI configuration already runs dunstan check, or includes the component.
export function gitlabRunsDunstan(dir: string): boolean {
  return gitlabFiles(dir).some((f) =>
    /dunstan(@[\w.]+)?\s+check|component:\s*gitlab\.com\/barglabs\/dunstan\/dunstan@/.test(
      read(dir, f) ?? '',
    ),
  );
}

// The token permissions the Action documents, held to what Dunstan reads and writes.
// On 4 Oct the documented permissions left out `issues: read`, and every `closes` claim on a private
// repository read as unreadable until someone noticed. Here each kind of GitHub read and each write
// is mapped to the permission it needs. The union must equal, exactly, the permissions stated in
// each of the four places a user copies them from: action.yml's `github-token` input, the two
// `permissions:` blocks in docs/action.md and its `github-token` inputs row. A missing permission
// turns a claim unreadable; an extra one is more than Dunstan uses.
//
// The table's keys are checked against the source: every first argument to a GitHub client's
// `read(…)` in src/ is found by scanning the text, so a literal outside the SourceKind union (such
// as 'path') is caught as well as one inside it.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SourceKind } from '../check/types.js';
import type { GitHubClient } from '../evidence/http.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');

// ---------------------------------------------------------------- permissions

// The keys a workflow's `permissions:` block takes, and `metadata`, which a GitHub App asks for and
// every GITHUB_TOKEN carries without being asked: a `permissions:` block cannot name it.
const WORKFLOW_SCOPES = [
  'actions',
  'attestations',
  'checks',
  'contents',
  'deployments',
  'discussions',
  'id-token',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'repository-projects',
  'security-events',
  'statuses',
] as const;
type Scope = (typeof WORKFLOW_SCOPES)[number] | 'metadata';
type Level = 'read' | 'write';
type Permission = `${Scope}: ${Level}`;

// Every kind a GitHub client's `read` takes: SourceKind, and 'path', the advisory's object-type
// query, which is never recorded as a source and so is not a SourceKind (src/evidence/http.ts).
type ReadKind = Parameters<GitHubClient['read']>[0];

// What each kind of read needs, from GitHub's per-endpoint permission tables for GitHub App
// installation tokens, which is what GITHUB_TOKEN is. A read under several endpoints needs each
// one's permission. Record<SourceKind, …>: the type checker refuses a kind with no entry.
const READ_PERMISSION: Record<SourceKind, readonly Permission[]> = {
  // GET /repos/{o}/{r}/pulls/{n} (the pull request), GET /repos/{o}/{r}/pulls?state=closed (the
  // survey's listing), and GET /repos/{o}/{r}/issues/{n}/comments (a report from a comment): Pull
  // requests: read. GitHub admits the comment listing on Issues: read or Pull requests: read; the
  // number is the pull request's, so Pull requests: read is enough.
  pull_request: ['pull-requests: read'],
  // GET /repos/{o}/{r}/pulls/{n}/files: Pull requests: read.
  pull_request_files: ['pull-requests: read'],
  // GraphQL CLOSE_BASE_QUERY: the pull request's baseRefName and commits (Pull requests: read), and
  // the default branch's Ref and the commits' oids, git data (Contents: read).
  pull_request_commits: ['pull-requests: read', 'contents: read'],
  // GraphQL CLOSING_QUERY, pullRequest.closingIssuesReferences: Pull requests: read for the pull
  // request, Issues: read for the issues it lists. GitHub leaves out an issue the token cannot read,
  // so without Issues: read a private repository's `closes` claims cannot be answered.
  closing_references: ['pull-requests: read', 'issues: read'],
  // GET /repos/{o}/{r} (is a cited issue's repository readable at all): Metadata: read.
  repository: ['metadata: read'],
  // GET /repos/{o}/{r}/issues/{n} (a cited or closed issue) and GraphQL CLOSE_EVENTS_QUERY,
  // issueOrPullRequest.timelineItems(CLOSED_EVENT) (who closed a `closes` target): Issues: read for
  // an issue, Pull requests: read for a pull request.
  issue: ['issues: read', 'pull-requests: read'],
  // GET /repos/{o}/{r}/git/commits/{sha} (a cited commit exists): Contents: read.
  commit: ['contents: read'],
  // GET /repos/{o}/{r}/compare/{base}...{head} (reachable from the head; a deployment's relation):
  // Contents: read.
  compare: ['contents: read'],
  // GET /repos/{o}/{r}/commits/{sha}/check-runs: Checks: read. The Action's POST and PATCH under
  // this kind are writes, in WRITE_PERMISSION.
  check_runs: ['checks: read'],
  // GET /repos/{o}/{r}/actions/runs?head_sha=, …/actions/workflows/{file}/runs, …/actions/runs/{id}/jobs,
  // …/actions/runs/{id}/attempts/{n}/jobs (the Action's own job) and …/actions/runs/{id}/artifacts:
  // Actions: read.
  workflow_runs: ['actions: read'],
  // GET /repos/{o}/{r}/actions/artifacts/{id}/zip (a JUnit record): Actions: read.
  artifact: ['actions: read'],
  // GET /repos/{o}/{r}/deployments and …/deployments/{id}/statuses: Deployments: read.
  deployments: ['deployments: read'],
};

// The reads a GitHub client takes under a kind that is not a SourceKind.
const OTHER_READ_PERMISSION: Record<Exclude<ReadKind, SourceKind>, readonly Permission[]> = {
  // GraphQL PATH_QUERY, repository.object(expression).__typename (the advisory section's type of the
  // object at a path, never its content): Contents: read.
  path: ['contents: read'],
};

const ALL_READS: Record<ReadKind, readonly Permission[]> = {
  ...READ_PERMISSION,
  ...OTHER_READ_PERMISSION,
};

interface Write {
  site: string;
  // For a write through a GitHub client: the method and path as the source spells it, each `${…}`
  // as `{}`.
  call?: { file: string; method: 'POST' | 'PATCH'; path: string };
  permissions: readonly Permission[];
}

// The Action's own writes.
const WRITE_PERMISSION: readonly Write[] = [
  {
    // POST /repos/{o}/{r}/check-runs (createCheckRun): Checks: write.
    site: 'createCheckRun',
    call: { file: 'src/action/check-run.ts', method: 'POST', path: '/repos/{}/check-runs' },
    permissions: ['checks: write'],
  },
  {
    // PATCH /repos/{o}/{r}/check-runs/{id} (completeCheckRun): Checks: write.
    site: 'completeCheckRun',
    call: { file: 'src/action/check-run.ts', method: 'PATCH', path: '/repos/{}/check-runs/{}' },
    permissions: ['checks: write'],
  },
  {
    // uploadArtifact (src/action/artifact.ts): CreateArtifact and FinalizeArtifact at
    // ACTIONS_RESULTS_URL with ACTIONS_RUNTIME_TOKEN, and a PUT to the signed blob URL CreateArtifact
    // returns, which carries its own signature. Neither is the `github-token`: the runner gives every
    // JavaScript action step the runtime token whatever the workflow's `permissions:` block says, as
    // for actions/upload-artifact. So it needs no `github-token` permission.
    site: 'uploadArtifact',
    permissions: [],
  },
];

const LEVELS: Record<Level, number> = { read: 1, write: 2 };

function parsePermission(p: Permission): { scope: Scope; level: Level } {
  const [scope, level] = p.split(': ') as [Scope, Level];
  return { scope, level };
}

// The permissions a `permissions:` block must grant: each scope at the highest level any read or
// write needs, less `metadata`, which a block cannot name.
function requiredPermissions(): string[] {
  const need = new Map<Scope, Level>();
  for (const p of [
    ...Object.values(ALL_READS).flat(),
    ...WRITE_PERMISSION.flatMap((w) => w.permissions),
  ]) {
    const { scope, level } = parsePermission(p);
    const had = need.get(scope);
    if (had === undefined || LEVELS[level] > LEVELS[had]) need.set(scope, level);
  }
  need.delete('metadata');
  return [...need].map(([scope, level]) => `${scope}: ${level}`).sort();
}

// ---------------------------------------------------------------- scanning src/ for reads

function sourceFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.set(relative(ROOT, full).split('\\').join('/'), readFileSync(full, 'utf8'));
      }
    }
  };
  walk(join(ROOT, 'src'));
  return out;
}

// The index of the quote that closes the string opened at `i`. A template's `${…}` is skipped by
// brace depth.
function skipString(src: string, i: number): number {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      j++;
    } else if (quote === '`' && c === '$' && src[j + 1] === '{') {
      let depth = 1;
      for (j += 2; j < src.length && depth > 0; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
      }
      j--;
    } else if (c === quote) {
      return j;
    }
  }
  throw new Error('unclosed string');
}

// The top-level arguments of the call whose `(` is at `open`, as source text, at most `max` of them.
function callArgs(src: string, open: number, max = Number.POSITIVE_INFINITY): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i);
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 1;
    } else if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) {
        const last = src.slice(start, i).trim();
        if (last !== '') args.push(last);
        return args;
      }
      depth--;
    } else if (c === ',' && depth === 0) {
      args.push(src.slice(start, i).trim());
      if (args.length >= max) return args;
      start = i + 1;
    }
  }
  throw new Error('unclosed call');
}

const lineAt = (src: string, at: number) => src.slice(0, at).split('\n').length;

interface ReadSite {
  file: string;
  line: number;
  kind: string;
}

interface ReadScan {
  reads: ReadSite[];
  // GitHub client calls that write: method and path, as the source spells them.
  writes: { file: string; line: number; method: string; path: string }[];
  // A first argument the scan could not resolve to a string literal.
  unresolved: string[];
}

// Every `.read(…)` with arguments in the files given: a GitHub client's read (the stream reader's
// `read()` takes none). A first argument that is a string literal is the kind. One that is a
// parameter declared `<name>: SourceKind` of its enclosing function is resolved at each call of that
// function. Anything else is unresolved.
function scanReads(files: Map<string, string>): ReadScan {
  const scan: ReadScan = { reads: [], writes: [], unresolved: [] };

  const resolve = (arg: string, file: string, at: number, depth: number) => {
    const src = files.get(file) as string;
    const site = `${file}:${lineAt(src, at)}`;
    const literal = /^'([^'\\]*)'$/.exec(arg);
    if (literal !== null) {
      scan.reads.push({ file, line: lineAt(src, at), kind: literal[1] as string });
      return;
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(arg) || depth > 4) {
      scan.unresolved.push(`${site}: ${arg}`);
      return;
    }
    // The enclosing function: the last declaration before the call.
    let fn: { name: string; open: number } | undefined;
    for (const m of src.slice(0, at).matchAll(/function\s+(\w+)\s*(?:<[^>(]*>)?\s*\(/g)) {
      fn = { name: m[1] as string, open: (m.index as number) + m[0].length - 1 };
    }
    const params = fn === undefined ? [] : callArgs(src, fn.open);
    const index = params.findIndex((p) => new RegExp(`^${arg}\\s*:\\s*SourceKind$`).test(p));
    if (fn === undefined || index < 0) {
      scan.unresolved.push(`${site}: ${arg}`);
      return;
    }
    let calls = 0;
    for (const [callFile, callSrc] of files) {
      for (const m of callSrc.matchAll(new RegExp(`\\b${fn.name}\\s*(?:<[^>(]*>)?\\s*\\(`, 'g'))) {
        const start = m.index as number;
        if (/function\s+$/.test(callSrc.slice(Math.max(0, start - 20), start))) continue;
        const args = callArgs(callSrc, start + m[0].length - 1, index + 1);
        calls++;
        resolve(args[index] ?? '', callFile, start, depth + 1);
      }
    }
    if (calls === 0) scan.unresolved.push(`${site}: ${arg} (${fn.name} is never called)`);
  };

  for (const [file, src] of files) {
    for (const m of src.matchAll(/\.read\s*\(/g)) {
      const open = (m.index as number) + m[0].length - 1;
      const args = callArgs(src, open);
      if (args.length === 0) continue;
      resolve(args[0] as string, file, m.index as number, 0);
      const method = /\bmethod:\s*'([A-Z]+)'/.exec(args[2] ?? '')?.[1];
      const path = (args[1] ?? '').replace(/^[`']|[`']$/g, '').replace(/\$\{[^}]*\}/g, '{}');
      if (method !== undefined && method !== 'GET' && path !== '/graphql') {
        scan.writes.push({ file, line: lineAt(src, m.index as number), method, path });
      }
    }
  }
  return scan;
}

// ---------------------------------------------------------------- the four places

// A `permissions:` block in a YAML document: a line `permissions:` and the block mapping under it,
// each entry `<key>: <plain scalar>` at one indent. This is the only YAML form the blocks use; any
// other line inside the block (a comment, a flow mapping, a nested value, a duplicate key) is a
// parse error rather than something read past.
function permissionsBlocks(yaml: string): { entries: [string, string][]; errors: string[] }[] {
  const lines = yaml.split('\n');
  const blocks: { entries: [string, string][]; errors: string[] }[] = [];
  lines.forEach((line, i) => {
    const head = /^( *)permissions:(.*)$/.exec(line);
    if (head === null) return;
    const errors: string[] = [];
    const entries: [string, string][] = [];
    if ((head[2] as string).trim() !== '') errors.push(`inline value: ${line.trim()}`);
    const indent = (head[1] as string).length;
    let at: number | undefined;
    for (const next of lines.slice(i + 1)) {
      const own = (/^ */.exec(next) as RegExpExecArray)[0].length;
      if (next.trim() === '' || own <= indent) break;
      at ??= own;
      const entry = /^ *([a-z][a-z-]*): ([a-z]+)$/.exec(next);
      if (own !== at || entry === null) {
        errors.push(`not a key: value entry: ${next.trim()}`);
        continue;
      }
      if (entries.some(([k]) => k === entry[1])) errors.push(`duplicate key ${entry[1]}`);
      entries.push([entry[1] as string, entry[2] as string]);
    }
    if (entries.length === 0) errors.push('empty block');
    blocks.push({ entries, errors });
  });
  return blocks;
}

function yamlFences(markdown: string): string[] {
  return [...markdown.matchAll(/^```yaml\n([\s\S]*?)^```$/gm)].map((m) => m[1] as string);
}

// The `permissions:` blocks of docs/action.md, in order.
function docBlocks(markdown: string) {
  return yamlFences(markdown).flatMap(permissionsBlocks);
}

// action.yml's `github-token` description, the folded scalar under it joined into one line.
function tokenDescription(actionYml: string): string {
  const lines = actionYml.split('\n');
  const input = lines.indexOf('  github-token:');
  const description = lines.indexOf('    description: >-', input);
  if (input < 0 || description !== input + 1) throw new Error('no github-token description');
  const body: string[] = [];
  for (const line of lines.slice(description + 1)) {
    if (!line.startsWith('      ')) break;
    body.push(line.trim());
  }
  return body.join(' ');
}

// The permissions in action.yml's "Needs a: read, b: read and c: write." sentence. Anything else in
// the sentence is an error, so a permission spelt another way is not passed over.
function actionYmlPermissions(actionYml: string): { list: string[]; errors: string[] } {
  const sentence = /\bNeeds ([^.]*)\./.exec(tokenDescription(actionYml))?.[1];
  if (sentence === undefined) return { list: [], errors: ['no "Needs …." sentence'] };
  const pairs = /\b([a-z][a-z-]*): ([a-z]+)\b/g;
  const list = [...sentence.matchAll(pairs)].map((m) => `${m[1]}: ${m[2]}`);
  const rest = sentence
    .replace(pairs, '')
    .replace(/,|\band\b/g, '')
    .trim();
  return { list, errors: rest === '' ? [] : [`unparsed text in the sentence: ${rest}`] };
}

// The permissions in docs/action.md's `github-token` inputs row, from its "Needs … Nothing else."
// sentence: each `scope: level` in backticks there. The row's later sentences repeat some by name
// and are not read, so a permission dropped from the list is not found again in them.
function docRowPermissions(markdown: string): { list: string[]; errors: string[] } {
  const row = markdown.split('\n').find((l) => l.startsWith('| `github-token` |'));
  const cell = row?.split(' | ')[2];
  const sentence = cell === undefined ? undefined : /\bNeeds (.*?)Nothing else\./.exec(cell)?.[1];
  if (sentence === undefined) return { list: [], errors: ['no "Needs … Nothing else." sentence'] };
  return {
    list: [...sentence.matchAll(/`([a-z][a-z-]*): ([a-z]+)`/g)].map((m) => `${m[1]}: ${m[2]}`),
    errors: [],
  };
}

interface Place {
  name: string;
  file: string;
  read: (content: string) => { list: string[]; errors: string[] };
}

function blockPlace(index: number): Place['read'] {
  return (content) => {
    const blocks = docBlocks(content);
    if (blocks.length !== 2) {
      return { list: [], errors: [`${blocks.length} permissions: blocks, not 2`] };
    }
    const block = blocks[index] as { entries: [string, string][]; errors: string[] };
    const errors = [...block.errors];
    for (const [key, value] of block.entries) {
      if (value !== 'read' && value !== 'write')
        errors.push(`${key}: ${value} is not read or write`);
      if (!(WORKFLOW_SCOPES as readonly string[]).includes(key)) errors.push(`${key} is not a key`);
    }
    return { list: block.entries.map(([k, v]) => `${k}: ${v}`), errors };
  };
}

const PLACES: readonly Place[] = [
  { name: 'action.yml github-token', file: 'action.yml', read: actionYmlPermissions },
  { name: 'docs/action.md quick start', file: 'docs/action.md', read: blockPlace(0) },
  { name: 'docs/action.md inputs row', file: 'docs/action.md', read: docRowPermissions },
  { name: 'docs/action.md pull_request_target', file: 'docs/action.md', read: blockPlace(1) },
];

// What is wrong with one place: its parse errors, then each permission missing from it and each
// extra one, by name.
function problems(place: Place, content: string): string[] {
  const { list, errors } = place.read(content);
  const need = requiredPermissions();
  const out = [...errors];
  for (const p of need) if (!list.includes(p)) out.push(`missing ${p}`);
  for (const p of list) if (!need.includes(p)) out.push(`extra ${p}`);
  const seen = new Set<string>();
  for (const p of list) {
    if (seen.has(p)) out.push(`twice ${p}`);
    seen.add(p);
  }
  return out;
}

// What the hosted App's manifest lacks of the read permissions (its keys spell pull_requests).
function hostedGaps(manifest: { default_permissions: Record<string, string> }): string[] {
  const reads = new Set(Object.values(ALL_READS).flat());
  return [...reads]
    .map(parsePermission)
    .filter(({ scope }) => {
      const granted = manifest.default_permissions[scope.replaceAll('-', '_')];
      return granted !== 'read' && granted !== 'write';
    })
    .map(({ scope, level }) => `${scope}: ${level}`)
    .sort();
}

// The text with the `n`th occurrence of `search` replaced. Throws if there is no such occurrence,
// so a red case never passes on an edit that did not happen.
function replaceNth(content: string, search: string, replacement: string, n = 0): string {
  let at = -1;
  for (let i = 0; i <= n; i++) {
    at = content.indexOf(search, at + 1);
    if (at < 0) throw new Error(`no occurrence ${n} of ${JSON.stringify(search)}`);
  }
  return content.slice(0, at) + replacement + content.slice(at + search.length);
}

// ---------------------------------------------------------------- tests

describe('every GitHub read and write Dunstan makes has a permission', () => {
  const scan = scanReads(sourceFiles());

  it('resolves the first argument of every read in src/ to a string literal', () => {
    expect(scan.unresolved).toEqual([]);
    expect(scan.reads.length).toBeGreaterThan(0);
  });

  it('maps every kind src/ reads, and maps no kind src/ does not read', () => {
    const read = [...new Set(scan.reads.map((r) => r.kind))].sort();
    const unmapped = scan.reads.filter((r) => !Object.hasOwn(ALL_READS, r.kind));
    expect(unmapped.map((r) => `${r.file}:${r.line} ${r.kind}`)).toEqual([]);
    expect(read).toEqual(Object.keys(ALL_READS).sort());
  });

  it('maps every write through a GitHub client, and only those', () => {
    const found = scan.writes.map((w) => `${w.file} ${w.method} ${w.path}`).sort();
    const mapped = WRITE_PERMISSION.flatMap((w) =>
      w.call === undefined ? [] : [`${w.call.file} ${w.call.method} ${w.call.path}`],
    ).sort();
    expect(found).toEqual(mapped);
  });

  it('uploads the artifact with the runtime token, never the github-token', () => {
    const artifact = text('src/action/artifact.ts');
    expect(artifact).toMatch(/env\.ACTIONS_RUNTIME_TOKEN/);
    expect(artifact).not.toMatch(/GITHUB_TOKEN|github-token|GitHubClient/);
    expect(WRITE_PERMISSION.find((w) => w.site === 'uploadArtifact')?.permissions).toEqual([]);
  });

  it('makes network calls only through the GitHub client and the artifact upload', () => {
    const callers = [...sourceFiles()]
      .filter(([, src]) => /\bfetch\s*\(|#fetch\s*\(|\bfetchFn\s*\(|from 'node:https?'/.test(src))
      .map(([file]) => file)
      .sort();
    expect(callers).toEqual(['src/action/artifact.ts', 'src/evidence/http.ts']);
  });

  it('catches a read whose kind is not in the table, or cannot be resolved', () => {
    const planted = scanReads(
      new Map([
        [
          'src/planted.ts',
          [
            "async function a(client: C) { await client.read('timeline', '/x'); }",
            'async function b(client: C, kind: SourceKind) { await client.read(kind, `/y`); }',
            "async function c(client: C) { await b(client, 'commit'); }",
            "async function d(client: C) { await client.read(pick('issue'), '/z'); }",
          ].join('\n'),
        ],
      ]),
    );
    expect(planted.reads.map((r) => r.kind).sort()).toEqual(['commit', 'timeline']);
    expect(Object.hasOwn(ALL_READS, 'timeline')).toBe(false);
    expect(planted.unresolved).toEqual(["src/planted.ts:4: pick('issue')"]);
  });
});

describe('the documented permissions are exactly what Dunstan needs', () => {
  it('needs these permissions', () => {
    expect(requiredPermissions()).toEqual([
      'actions: read',
      'checks: write',
      'contents: read',
      'deployments: read',
      'issues: read',
      'pull-requests: read',
    ]);
  });

  it.each(PLACES.map((p) => [p.name, p] as const))('%s grants exactly that set', (_, place) => {
    expect(problems(place, text(place.file))).toEqual([]);
  });

  it('docs/action.md has exactly two permissions: blocks, each YAML with only read or write', () => {
    const blocks = docBlocks(text('docs/action.md'));
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.errors).toEqual([]);
      expect(block.entries.every(([, v]) => v === 'read' || v === 'write')).toBe(true);
    }
  });

  it('the hosted App grants every read permission', () => {
    const manifest = JSON.parse(text('hosted/github-app-manifest.json'));
    expect(hostedGaps(manifest)).toEqual([]);
  });
});

describe('red: an in-memory copy with one permission removed or one added fails', () => {
  const actionYml = text('action.yml');
  const doc = text('docs/action.md');

  const edits: { place: string; content: string; removed: string; added: string }[] = [
    {
      place: 'action.yml github-token',
      content: actionYml,
      removed: replaceNth(actionYml, 'issues: read, ', ''),
      added: replaceNth(actionYml, 'Needs contents: read', 'Needs statuses: read, contents: read'),
    },
    {
      place: 'docs/action.md quick start',
      content: doc,
      removed: replaceNth(doc, '\n  issues: read\n', '\n', 0),
      added: replaceNth(doc, '\npermissions:\n', '\npermissions:\n  statuses: read\n', 0),
    },
    {
      place: 'docs/action.md inputs row',
      content: doc,
      removed: replaceNth(doc, '`issues: read` (to read an issue a block closes or cites), ', ''),
      added: replaceNth(doc, 'Needs `contents: read`', 'Needs `statuses: read`, `contents: read`'),
    },
    {
      place: 'docs/action.md pull_request_target',
      content: doc,
      removed: replaceNth(doc, '\n  issues: read\n', '\n', 1),
      added: replaceNth(doc, '\npermissions:\n', '\npermissions:\n  statuses: read\n', 1),
    },
  ];
  const placeNamed = (name: string) => PLACES.find((p) => p.name === name) as Place;

  it.each(edits.map((e) => [e.place, e] as const))('%s', (_, edit) => {
    const place = placeNamed(edit.place);
    expect(problems(place, edit.content)).toEqual([]);
    expect(problems(place, edit.removed)).toEqual(['missing issues: read']);
    expect(problems(place, edit.added)).toEqual(['extra statuses: read']);
  });

  it.each([0, 1])('permissions: block %i with a value other than read or write', (n) => {
    const bad = replaceNth(doc, '\n  issues: read\n', '\n  issues: none\n', n);
    const place = placeNamed(
      n === 0 ? 'docs/action.md quick start' : 'docs/action.md pull_request_target',
    );
    expect(problems(place, bad)).toEqual([
      'issues: none is not read or write',
      'missing issues: read',
      'extra issues: none',
    ]);
  });

  it('a permissions: block that is not a block mapping of plain entries', () => {
    const bad = replaceNth(doc, '\n  issues: read\n', '\n  issues: read # comment\n', 0);
    expect(problems(placeNamed('docs/action.md quick start'), bad)).toContain(
      'not a key: value entry: issues: read # comment',
    );
  });

  it('a hosted App manifest without a read permission', () => {
    const manifest = JSON.parse(text('hosted/github-app-manifest.json'));
    delete manifest.default_permissions.issues;
    expect(hostedGaps(manifest)).toEqual(['issues: read']);
  });
});

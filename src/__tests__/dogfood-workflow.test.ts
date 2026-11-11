// The `dunstan` check on this repository's own pull requests runs the default branch's checker and
// Action bundle, never the pull request's own (audit D2). A workflow that checks out the pull request
// and runs `uses: ./` grades a pull request's handback with the checker and bundle that pull request
// changed. So .github/workflows/dunstan.yml checks out the default branch, credential-free, prints
// the commit it checked out, and runs that commit's Action; nothing of the repository runs before it.
// The check itself keeps its name, job, triggers and permissions.
//
// The workflow is read by a strict reader for the YAML subset it uses: block mappings, block
// sequences, plain or quoted scalars, flow sequences of scalars, block scalars and comments. Anything
// else (an anchor, an alias, a tag, a flow mapping, a tab, a duplicate key) is a parse error, so a
// form the reader does not know fails the test rather than being read past.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW = '.github/workflows/dunstan.yml';

// A GitHub Actions expression, `${{ … }}`, as the workflow spells it.
const expr = (inner: string) => `\${{ ${inner} }}`;
const DEFAULT_BRANCH = expr('github.event.repository.default_branch');
const TYPES = ['opened', 'edited', 'synchronize', 'reopened', 'ready_for_review'];
const PERMISSIONS = {
  contents: 'read',
  'pull-requests': 'read',
  issues: 'read',
  deployments: 'read',
  checks: 'write',
  actions: 'read',
};

// ---------------------------------------------------------------- a strict YAML-subset reader

type Yaml = string | boolean | null | Yaml[] | { [key: string]: Yaml };

interface Line {
  no: number;
  indent: number;
  text: string;
}

// The text of a line before a comment: a `#` at the start or after whitespace, outside quotes.
function stripComment(text: string): string {
  let quote: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '#' && (i === 0 || text[i - 1] === ' ')) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
}

function scalar(raw: string, no: number): Yaml {
  const fail = (why: string) => {
    throw new Error(`line ${no}: ${why}: ${raw}`);
  };
  if (raw.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(raw)) fail('unclosed single-quoted scalar');
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  if (raw.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\["\\])*"$/.test(raw))
      fail('double-quoted scalar this reader does not take');
    return raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (raw.startsWith('[')) {
    if (!raw.endsWith(']')) fail('unclosed flow sequence');
    const inner = raw.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => {
      const value = scalar(item.trim(), no);
      if (typeof value !== 'string' && typeof value !== 'boolean') fail('nested flow collection');
      return value;
    });
  }
  if (/^[{&*!%@`|>]/.test(raw)) fail('a form this reader does not take');
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  return raw;
}

function parseYaml(source: string): Yaml {
  const lines: Line[] = [];
  source.split('\n').forEach((full, i) => {
    if (full.includes('\t')) throw new Error(`line ${i + 1}: tab`);
    if (/^(---|\.\.\.)\s*$/.test(full)) throw new Error(`line ${i + 1}: document marker`);
    lines.push({ no: i + 1, indent: (/^ */.exec(full) as RegExpExecArray)[0].length, text: full });
  });
  // The significant lines: not blank, not a comment. A block scalar's lines are read from `lines`.
  const significant = (from: number) => {
    let i = from;
    while (i < lines.length) {
      const t = (lines[i] as Line).text.trim();
      if (t !== '' && !t.startsWith('#')) break;
      i++;
    }
    return i;
  };

  let at = significant(0);

  // A block scalar (`|`, `|-`, `>`, `>-`) after a key at `parent` indent: every following line
  // indented further, or blank.
  const blockScalar = (header: string, parent: number, no: number): string => {
    if (!/^[|>]-?$/.test(header)) throw new Error(`line ${no}: block scalar header ${header}`);
    const body: string[] = [];
    let indent: number | undefined;
    while (at < lines.length) {
      const line = lines[at] as Line;
      if (line.text.trim() === '') {
        body.push('');
        at++;
        continue;
      }
      if (line.indent <= parent) break;
      indent ??= line.indent;
      if (line.indent < indent) throw new Error(`line ${line.no}: block scalar indent`);
      body.push(line.text.slice(indent));
      at++;
    }
    while (body.length > 0 && body[body.length - 1] === '') body.pop();
    at = significant(at);
    const joined = header.startsWith('|') ? body.join('\n') : body.join(' ');
    return header.endsWith('-') ? joined : `${joined}\n`;
  };

  // The value after `key:` on a line at `indent`, whose rest is `rest`. `at` is the line after the
  // key's, not yet past blank or comment lines: a block scalar keeps those.
  const valueAfter = (rest: string, indent: number, no: number): Yaml => {
    if (/^[|>]/.test(rest)) return blockScalar(rest, indent, no);
    at = significant(at);
    if (rest !== '') return scalar(rest, no);
    if (at >= lines.length) return null;
    const next = lines[at] as Line;
    if (next.indent > indent) return block(next.indent);
    // A sequence may sit at its key's own indent.
    if (next.indent === indent && /^- |^-$/.test(next.text.trimStart())) return sequence(indent);
    return null;
  };

  // `key: rest` entries at `indent`, starting with `first` when a sequence item opened the mapping.
  const mapping = (indent: number, first?: { text: string; no: number }): Yaml => {
    const out: { [key: string]: Yaml } = {};
    const entry = (text: string, no: number) => {
      const m = /^([A-Za-z0-9_][A-Za-z0-9_.-]*|'[^']*'|"[^"\\]*"):(?: (.*))?$/.exec(text);
      if (m === null) throw new Error(`line ${no}: not a key: value entry: ${text}`);
      const key = /^['"]/.test(m[1] as string) ? (m[1] as string).slice(1, -1) : (m[1] as string);
      if (Object.hasOwn(out, key)) throw new Error(`line ${no}: duplicate key ${key}`);
      out[key] = valueAfter(stripComment(m[2] ?? '').trim(), indent, no);
    };
    if (first !== undefined) entry(first.text, first.no);
    while (at < lines.length) {
      const line = lines[at] as Line;
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`line ${line.no}: unexpected indent`);
      if (/^- |^-$/.test(line.text.trimStart())) break;
      at++;
      entry(stripComment(line.text.trim()), line.no);
    }
    return out;
  };

  const sequence = (indent: number): Yaml => {
    const out: Yaml[] = [];
    while (at < lines.length) {
      const line = lines[at] as Line;
      if (line.indent !== indent || !/^- |^-$/.test(line.text.trimStart())) {
        if (line.indent > indent) throw new Error(`line ${line.no}: unexpected indent`);
        break;
      }
      const item = stripComment(line.text.trimStart().slice(1)).trim();
      at++;
      if (item === '') {
        at = significant(at);
        const next = lines[at];
        out.push(next !== undefined && next.indent > indent ? block(next.indent) : null);
      } else if (/^([A-Za-z0-9_][A-Za-z0-9_.-]*|'[^']*'|"[^"\\]*"):(?: |$)/.test(item)) {
        // `- key: value`: a mapping whose entries sit two columns in, the first on the dash line.
        out.push(mapping(indent + 2, { text: item, no: line.no }));
      } else {
        at = significant(at);
        out.push(scalar(item, line.no));
      }
    }
    return out;
  };

  const block = (indent: number): Yaml =>
    /^- |^-$/.test((lines[at] as Line).text.trimStart()) ? sequence(indent) : mapping(indent);

  if (at >= lines.length) throw new Error('empty document');
  const first = lines[at] as Line;
  if (first.indent !== 0) throw new Error(`line ${first.no}: document does not start at column 0`);
  const doc = block(0);
  if (at < lines.length) throw new Error(`line ${(lines[at] as Line).no}: not read`);
  return doc;
}

// ---------------------------------------------------------------- the contract

type Map_ = { [key: string]: Yaml };
const isMap = (v: Yaml | undefined): v is Map_ =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// A program the default branch's checkout may not run before the Action: a package manager, a
// JavaScript runtime, or anything of the repository's own (a path, a shell running a file, `make`).
const FORBIDDEN_RUN =
  /(^|[\s;&|(`$])(npm|npx|pnpm|pnpx|yarn|corepack|node|bun|bunx|deno|tsx|make|bash|sh|zsh|source|\.)(?=$|[\s;&|)`])|(^|[\s;&|(`=])\.{0,2}\/|\bscripts\/|\.(sh|mjs|cjs|js|ts|py)\b/;

// Every way the workflow departs from the contract, by name; empty when it holds.
function violations(source: string): string[] {
  let doc: Yaml;
  try {
    doc = parseYaml(source);
  } catch (e) {
    return [`parse: ${(e as Error).message}`];
  }
  const out: string[] = [];
  if (!isMap(doc)) return ['the workflow is not a mapping'];

  // Triggers: pull_request with exactly these types, no filter, no other event.
  const on = doc.on;
  if (!isMap(on) || Object.keys(on).join() !== 'pull_request') {
    out.push('on: is not pull_request alone');
  } else {
    const pr = on.pull_request;
    if (!isMap(pr) || Object.keys(pr).join() !== 'types') {
      out.push('on.pull_request has a key other than types');
    }
    const types = isMap(pr) ? pr.types : undefined;
    if (JSON.stringify(types) !== JSON.stringify(TYPES)) {
      out.push(`on.pull_request.types is ${JSON.stringify(types)}`);
    }
  }

  // Permissions: exactly the six, at the workflow level.
  if (JSON.stringify(doc.permissions) !== JSON.stringify(PERMISSIONS)) {
    out.push(`permissions is ${JSON.stringify(doc.permissions)}`);
  }

  // One job, `handback`, unnamed (so its check run is `handback`), with no condition, no
  // permissions of its own and nothing else that changes what it reports.
  const jobs = doc.jobs;
  if (!isMap(jobs) || Object.keys(jobs).join() !== 'handback') {
    out.push('jobs is not handback alone');
    return out;
  }
  const job = jobs.handback;
  if (!isMap(job)) return [...out, 'jobs.handback is not a mapping'];
  const jobKeys = Object.keys(job).sort().join();
  if (jobKeys !== 'runs-on,steps') out.push(`jobs.handback has keys ${jobKeys}`);
  const steps = job.steps;
  if (!Array.isArray(steps) || !steps.every(isMap)) return [...out, 'steps is not a list of maps'];

  // The Action: `uses: ./`, exactly once, unconditional, reading the pull request body.
  const action = steps.findIndex((s) => s.uses === './');
  if (action < 0 || steps.filter((s) => s.uses === './').length !== 1) {
    return [...out, 'not exactly one step uses ./'];
  }
  const actionStep = steps[action] as Map_;
  if (actionStep.if !== undefined) out.push('the Action step has a condition');
  if (!isMap(actionStep.with) || actionStep.with['report-source'] !== 'pr-body') {
    out.push('the Action step does not read report-source pr-body');
  }

  // The checkout: one, before the Action, of the default branch, without credentials, into the
  // workspace root (so `./` is that checkout), of this repository.
  const before = steps.slice(0, action);
  const checkouts = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout@'));
  if (checkouts.length !== 1 || (checkouts[0] as { i: number }).i >= action) {
    out.push('not exactly one checkout, before the Action');
  } else {
    const checkout = (checkouts[0] as { s: Map_ }).s;
    const w = isMap(checkout.with) ? checkout.with : {};
    if (w.ref !== DEFAULT_BRANCH) out.push(`checkout ref is ${JSON.stringify(w.ref ?? null)}`);
    if (w['persist-credentials'] !== false) out.push('checkout persists credentials');
    const extra = Object.keys(w).filter((k) => k !== 'ref' && k !== 'persist-credentials');
    if (extra.length > 0) out.push(`checkout has ${extra.sort().join(', ')}`);
    if (checkout.if !== undefined) out.push('the checkout has a condition');
  }

  // Before the Action: the checkout, and `run` steps that run nothing of the repository's.
  let prints = false;
  for (const [i, step] of before.entries()) {
    if (typeof step.uses === 'string') {
      if (!step.uses.startsWith('actions/checkout@')) out.push(`step ${i} uses ${step.uses}`);
      continue;
    }
    if (typeof step.run !== 'string') {
      out.push(`step ${i} neither uses nor runs`);
      continue;
    }
    if (step['working-directory'] !== undefined || step.shell !== undefined) {
      out.push(`step ${i} sets a shell or working directory`);
    }
    if (/\$\{\{/.test(step.run)) out.push(`step ${i} interpolates an expression into its script`);
    for (const command of step.run.split('\n')) {
      if (FORBIDDEN_RUN.test(command)) out.push(`step ${i} runs ${command.trim()}`);
    }
    if (/\bgit rev-parse HEAD\b/.test(step.run)) prints = true;
  }
  if (!prints) out.push('no step before the Action prints the commit it checked out');
  return out;
}

// The text with the first occurrence of `search` replaced. Throws if there is none, so a red case
// never passes on an edit that did not happen.
function replace(content: string, search: string, replacement: string): string {
  const at = content.indexOf(search);
  if (at < 0) throw new Error(`no occurrence of ${JSON.stringify(search)}`);
  return content.slice(0, at) + replacement + content.slice(at + search.length);
}

// ---------------------------------------------------------------- tests

const workflow = readFileSync(join(ROOT, WORKFLOW), 'utf8');

describe('the dunstan check runs the default branch checker, never the pull request', () => {
  it(`${WORKFLOW} holds the contract`, () => {
    expect(violations(workflow)).toEqual([]);
  });

  it('says what this costs: a pull request changing the checker is checked by the default branch', () => {
    const comments = workflow
      .split('\n')
      .filter((l) => l.trimStart().startsWith('#'))
      .map((l) => l.replace(/^\s*#\s?/, ''))
      .join(' ');
    expect(comments).toMatch(/default branch/);
    expect(comments).toMatch(/ci\.yml/);
  });
});

describe('the reader', () => {
  it('reads the forms the workflow uses', () => {
    expect(
      parseYaml(
        [
          '# a comment',
          'on:',
          '  pull_request:',
          '    types: [opened, edited] # trailing',
          'a: "x # not a comment"',
          "b: 'it''s'",
          'c: false',
          'jobs:',
          '  j:',
          '    steps:',
          '      - uses: x@1 # v1',
          '        with:',
          '          k: v',
          '      - run: |',
          '          one',
          '',
          '          two',
          'd:',
          '- e',
        ].join('\n'),
      ),
    ).toEqual({
      on: { pull_request: { types: ['opened', 'edited'] } },
      a: 'x # not a comment',
      b: "it's",
      c: false,
      jobs: { j: { steps: [{ uses: 'x@1', with: { k: 'v' } }, { run: 'one\n\ntwo\n' }] } },
      d: ['e'],
    });
  });

  it.each([
    ['an anchor', 'a: &x 1'],
    ['an alias', 'a: *x'],
    ['a tag', 'a: !!str x'],
    ['a flow mapping', 'a: {b: c}'],
    ['a duplicate key', 'a: 1\na: 2'],
    ['a tab', 'a:\n\tb: c'],
    ['a document marker', '---\na: 1'],
    ['an unclosed quote', "a: 'b"],
  ])('refuses %s', (_, source) => {
    expect(() => parseYaml(source)).toThrow();
  });
});

describe('red: an in-memory copy that breaks the contract is caught', () => {
  const REF = `ref: ${DEFAULT_BRANCH}`;
  const ACTION = '      - name: Check the handback block';
  // [case, text replaced, its replacement, the violation expected]. Each edit is made inside its test,
  // and throws if its text is not in the workflow.
  const cases: [string, string, string, string][] = [
    ['no ref (the pull request merge commit)', `${REF}\n`, '', 'checkout ref'],
    ['ref github.sha', REF, `ref: ${expr('github.sha')}`, 'checkout ref'],
    [
      'ref the pull request head',
      REF,
      `ref: ${expr('github.event.pull_request.head.sha')}`,
      'checkout ref',
    ],
    [
      'ref the pull request merge ref',
      REF,
      `ref: refs/pull/${expr('github.event.number')}/merge`,
      'checkout ref',
    ],
    [
      'credentials persisted',
      'persist-credentials: false',
      'persist-credentials: true',
      'checkout persists credentials',
    ],
    [
      "the pull request's repository",
      REF,
      `${REF}\n          repository: ${expr('github.event.pull_request.head.repo.full_name')}`,
      'checkout has repository',
    ],
    [
      'a pnpm step before the Action',
      ACTION,
      `      - run: pnpm install && pnpm build\n\n${ACTION}`,
      'runs pnpm install',
    ],
    [
      'node before the Action',
      ACTION,
      `      - run: node dist/dunstan.mjs check\n\n${ACTION}`,
      'runs node dist/dunstan.mjs check',
    ],
    [
      'a repository script before the Action',
      ACTION,
      `      - run: bash scripts/build.sh\n\n${ACTION}`,
      'runs bash scripts/build.sh',
    ],
    [
      'setup-node before the Action',
      ACTION,
      `      - uses: actions/setup-node@v4\n\n${ACTION}`,
      'uses actions/setup-node@v4',
    ],
    [
      'a path filter',
      '    types: [',
      "    paths: ['src/**']\n    types: [",
      'on.pull_request has a key other than types',
    ],
    ['a trigger type dropped', ', ready_for_review]', ']', 'on.pull_request.types'],
    [
      'a job condition',
      '    runs-on: ubuntu-latest',
      '    if: false\n    runs-on: ubuntu-latest',
      'jobs.handback has keys',
    ],
    ['a permission changed', 'checks: write', 'checks: read', 'permissions is'],
  ];

  it.each(cases)('%s', (_, search, replacement, expected) => {
    const found = violations(replace(workflow, search, replacement));
    expect(
      found.some((v) => v.includes(expected)),
      found.join('; '),
    ).toBe(true);
  });
});

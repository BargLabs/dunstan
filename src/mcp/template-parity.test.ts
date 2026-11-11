// Parity: dunstan_template_handback is `dunstan template` with a different caller. For each case the
// tool's fence is byte for byte what the CLI prints on standard output, and its `note: ` lines are
// the CLI's standard error lines with `dunstan: ` stripped, in the same order, with each pair of the
// phrase table (src/template/wording.ts) replaced: the tool's instructions name its inputs, never a
// flag. The same holds for the errors the tool returns. Both run against the same temporary git
// repository, with GitHub stubbed by fetch.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  junitXml,
  makeZip,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { featureRepository, git, isolateGit } from '../__tests__/git-repo.js';
import { asMcp, NAMES_A_FLAG } from '../__tests__/wording.js';
import { main } from '../cli/main.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { createDunstanMcpServer, TEMPLATE_TOOL_NAME } from './server.js';

isolateGit();

const ORIGIN = `https://github.com/${REPO}.git`;
const WORKFLOW = '.github/workflows/ci.yml';
const JOB = 'Test';
const TOKEN = { GITHUB_TOKEN: 'test-token' };

// One CI run per entry at HEAD: its id, its status and the JUnit file its artifact holds, or no
// artifact at all.
interface Run {
  id: number;
  status?: string;
  xml?: string | null;
}

function ci(head: string, runs: Run[]): Scenario {
  return {
    pr: basePullRequest({ head: { sha: head } }),
    workflowRuns: runs.map((r) => ({
      id: r.id,
      check_suite_id: r.id * 10,
      run_attempt: 1,
      name: 'CI',
      event: 'pull_request',
      status: r.status ?? 'completed',
      path: WORKFLOW,
      head_sha: head,
    })),
    jobs: Object.fromEntries(runs.map((r) => [r.id, [JOB]])),
    artifacts: Object.fromEntries(
      runs.map((r) => [
        r.id,
        r.xml === null ? [] : [{ id: r.id + 9000, name: 'dunstan-junit', expired: false }],
      ]),
    ),
    zips: Object.fromEntries(
      runs
        .filter((r) => r.xml !== null)
        .map((r) => [r.id + 9000, makeZip({ 'junit.xml': r.xml ?? junitXml(['pass']) })]),
    ),
    artifactNeedsToken: true,
  };
}

const passing = (n: number) => junitXml(Array<'pass'>(n).fill('pass'));

interface Case {
  name: string;
  pushed?: boolean;
  env?: Record<string, string>;
  scenario?: (head: string) => Scenario;
  // The CLI's flags and the tool's tests, for the same request.
  flags: (junit: string) => string[];
  tests?: (junit: string) => Record<string, unknown>;
  exit: number;
  line1: string;
  // A word the notes must carry, so each case is the case it names.
  says?: RegExp;
}

const ciFlags = ['--tests-ci', '--tests-command', 'pnpm test', '--tests-workflow', WORKFLOW];
const ciTests = { from: 'ci', command: 'pnpm test', workflow: WORKFLOW, job: JOB };

const CASES: Case[] = [
  { name: 'no tests', flags: () => [], exit: 0, line1: 'tests: none asked' },
  {
    name: 'from: local',
    flags: (junit) => ['--tests-local', junit, '--tests-command', 'pnpm test'],
    tests: (junit) => ({ from: 'local', junit, command: 'pnpm test' }),
    exit: 0,
    line1: 'tests: declared',
    says: /declared as a local run/,
  },
  {
    name: 'from: ci, settled',
    scenario: (head) => ci(head, [{ id: 801, xml: passing(142) }]),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 0,
    line1: 'tests: declared',
    says: /tests: 142 executed and 0 failed/,
  },
  {
    name: 'from: ci, settled, with every record member named',
    scenario: (head) => ci(head, [{ id: 801, xml: passing(3) }]),
    flags: () => [
      ...ciFlags,
      '--tests-job',
      JOB,
      '--tests-artifact',
      'dunstan-junit',
      '--tests-artifact-path',
      'junit.xml',
      '--repo',
      REPO,
    ],
    tests: () => ({
      ...ciTests,
      artifact: 'dunstan-junit',
      artifactPath: 'junit.xml',
      repository: REPO,
    }),
    exit: 0,
    line1: 'tests: declared',
  },
  {
    name: 'from: ci, unsettled: no_token',
    env: {},
    scenario: (head) => ci(head, [{ id: 801 }]),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 2,
    line1: 'tests: not declared',
    says: /\(no_token\)/,
  },
  {
    name: 'from: ci, unsettled: not_pushed',
    pushed: false,
    scenario: (head) => ci(head, [{ id: 801 }]),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 2,
    line1: 'tests: not declared',
    says: /\(not_pushed\)/,
  },
  {
    name: 'from: ci, unsettled: record_not_found',
    scenario: (head) => ci(head, [{ id: 801, xml: null }]),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 2,
    line1: 'tests: not declared',
    says: /\(record_not_found\)/,
  },
  {
    name: 'from: ci, unsettled: CI not finished',
    scenario: (head) => ci(head, [{ id: 801, xml: null, status: 'in_progress' }]),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 2,
    line1: 'tests: not declared',
    says: /CI has not finished/,
  },
  {
    name: 'from: ci, unsettled: record_ambiguous',
    scenario: (head) =>
      ci(head, [
        { id: 801, xml: passing(142) },
        { id: 802, xml: passing(141) },
      ]),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 2,
    line1: 'tests: not declared',
    says: /\(record_ambiguous\)/,
  },
  {
    name: 'from: ci, unsettled: the artifact cannot be read',
    scenario: (head) => ({ ...ci(head, [{ id: 801 }]), zips: {} }),
    flags: () => [...ciFlags, '--tests-job', JOB],
    tests: () => ciTests,
    exit: 2,
    line1: 'tests: not declared',
    says: /\(source_unreadable:artifact\)/,
  },
];

function junitFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'dunstan-junit-')), 'junit.xml');
  writeFileSync(path, junitXml(['pass', 'pass', 'fail', 'skip']));
  return path;
}

async function viaCli(dir: string, args: string[], s: Scenario, env: Record<string, string>) {
  let out = '';
  let err = '';
  const fake = fakeGitHub(s);
  const code = await main(['template', ...args], {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env,
    artifact: import.meta.url,
    fetch: fake.fetch,
    readStdin: () => new Uint8Array(),
    cwd: dir,
  });
  return { code, out, err, requests: fake.requests };
}

async function viaMcp(args: Record<string, unknown>, s: Scenario, env: Record<string, string>) {
  const fake = fakeGitHub(s);
  const server = createDunstanMcpServer({
    artifact: import.meta.url,
    env,
    fetch: fake.fetch,
    warn: () => {},
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'template-parity', version: '0' });
  await client.connect(clientSide);
  const result = (await client.callTool({
    name: TEMPLATE_TOOL_NAME,
    arguments: args,
  })) as CallToolResult;
  await client.close();
  const text = result.content.map((item) => (item.type === 'text' ? item.text : ''));
  return { result, text, requests: fake.requests };
}

describe('dunstan_template_handback parity with dunstan template', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', async (_, c) => {
    const { dir, head } = featureRepository(ORIGIN, { pushed: c.pushed ?? true });
    const junit = junitFile();
    const s = c.scenario?.(head) ?? ci(head, []);
    const env = c.env ?? TOKEN;

    const cli = await viaCli(dir, c.flags(junit), s, env);
    const tests = c.tests?.(junit);
    const mcp = await viaMcp({ directory: dir, ...(tests === undefined ? {} : { tests }) }, s, env);

    expect(cli.code).toBe(c.exit);
    expect(mcp.result.isError).toBeFalsy();
    expect(mcp.text).toHaveLength(2);
    const [head1, fence] = mcp.text as [string, string];

    // The fence, byte for byte.
    expect(extractHandbackBlock(cli.out).status).toBe('found');
    expect(fence).toBe(cli.out);

    // The notes, line for line, in the CLI's order, worded for a tool caller.
    const lines = head1.split('\n');
    expect(lines.at(-1)).toBe('');
    lines.pop();
    expect(lines[0]).toBe(c.line1);
    const unsettled =
      'The block below has no tests. Do not add counts yourself; do what the note says.';
    expect(lines[1] === unsettled).toBe(c.exit === 2);
    const notes = lines.slice(c.exit === 2 ? 2 : 1);
    for (const n of notes) expect(n).toMatch(/^note: /);
    const errLines = cli.err.split('\n');
    expect(errLines.pop()).toBe('');
    for (const e of errLines) expect(e).toMatch(/^dunstan: /);
    const mcpNotes = notes.map((n) => n.slice('note: '.length));
    const cliNotes = errLines.map((e) => e.slice('dunstan: '.length));
    // The same count, in the same order; each the CLI's note with every pair of the phrase table
    // replaced, and nothing else changed. So the two wordings differ only by the table.
    expect(mcpNotes).toHaveLength(cliNotes.length);
    expect(mcpNotes).toEqual(cliNotes.map(asMcp));
    // The table is in use: at least the stale-block note is worded apart.
    expect(mcpNotes.filter((n, i) => n !== cliNotes[i]).length).toBeGreaterThan(0);
    // No flag reaches the tool caller, and the CLI still names its own.
    expect(head1).not.toMatch(NAMES_A_FLAG);
    expect(cli.err).toMatch(/dunstan template /);
    if (c.says !== undefined) expect(notes.join('\n')).toMatch(c.says);

    // The same reads of GitHub.
    expect(mcp.requests).toEqual(cli.requests);
  });
});

// The errors git or the inputs give, each as the CLI prints it and as the tool returns it. `cli` is
// the command line's message, unchanged.
interface ErrorCase {
  name: string;
  setUp?: (dir: string) => void;
  flags: string[];
  input: Record<string, unknown>;
  cli: RegExp;
}

const ERROR_CASES: ErrorCase[] = [
  {
    name: 'no origin remote',
    setUp: (dir) => git(dir, 'remote', 'remove', 'origin'),
    flags: [...ciFlags, '--tests-job', JOB],
    input: { tests: ciTests },
    cli: /^there is no origin remote: pass --repo <owner\/name>$/,
  },
  {
    name: 'origin not on github.com',
    setUp: (dir) => git(dir, 'remote', 'set-url', 'origin', 'https://gitlab.example/o/r.git'),
    flags: [...ciFlags, '--tests-job', JOB],
    input: { tests: ciTests },
    cli: /^origin https:\/\/gitlab\.example\/o\/r\.git is not a github\.com repository: pass --repo <owner\/name>$/,
  },
  {
    name: 'an unresolvable default branch',
    setUp: (dir) => git(dir, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD'),
    flags: [],
    input: {},
    cli: /: pass --base <ref>, or run git remote set-head origin --auto$/,
  },
  {
    name: 'a base that is not a ref',
    flags: ['--base=-x'],
    input: { base: '-x' },
    cli: /^--base -x is not a ref$/,
  },
  {
    name: 'an unreadable tests.junit',
    flags: ['--tests-local', '/nonexistent/junit.xml', '--tests-command', 'pnpm test'],
    input: { tests: { from: 'local', junit: '/nonexistent/junit.xml', command: 'pnpm test' } },
    cli: /^--tests-local \/nonexistent\/junit\.xml: /,
  },
];

describe('dunstan_template_handback errors, worded for a tool caller', () => {
  it.each(ERROR_CASES.map((c) => [c.name, c] as const))('%s', async (_, c) => {
    const { dir, head } = featureRepository(ORIGIN);
    c.setUp?.(dir);
    const s = ci(head, []);

    const cli = await viaCli(dir, c.flags, s, TOKEN);
    const mcp = await viaMcp({ directory: dir, ...c.input }, s, TOKEN);

    expect(cli.code).toBe(3);
    expect(cli.out).toBe('');
    const cliMessage = cli.err.replace(/^dunstan: /, '').replace(/\n$/, '');
    expect(cliMessage).toMatch(c.cli);

    expect(mcp.result.isError).toBe(true);
    expect(mcp.text).toEqual([
      `dunstan: ${asMcp(cliMessage)}\nThis is an error: no block was produced.\n`,
    ]);
    expect(mcp.text[0]).not.toMatch(NAMES_A_FLAG);
    expect(mcp.requests).toEqual([]);
  });
});

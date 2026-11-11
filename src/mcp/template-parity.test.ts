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
import {
  fakeGitLab,
  type GitLabScenario,
  GL_ELSEWHERE,
  GL_PROJECT,
  GL_TEST_JOB,
  GL_TEST_JOB_ID,
  glJob,
  templateMergeRequest,
} from '../__tests__/fake-gitlab.js';
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

// The forge a case reads: GitHub, or a GitLab merge request's project.
type Forge = Scenario | { gitlab: GitLabScenario };
const fakeFor = (s: Forge) => ('gitlab' in s ? fakeGitLab(s.gitlab) : fakeGitHub(s));

async function viaCli(dir: string, args: string[], s: Forge, env: Record<string, string>) {
  let out = '';
  let err = '';
  const fake = fakeFor(s);
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

async function viaMcp(args: Record<string, unknown>, s: Forge, env: Record<string, string>) {
  const fake = fakeFor(s);
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

// One case, CLI and tool, on the same repository and the same forge: the fence byte for byte, the
// notes line for line, the same reads. Returns both runs.
async function parity(c: Case, dir: string, junit: string, s: Forge, env: Record<string, string>) {
  {
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

    // The same reads of the forge.
    expect(mcp.requests).toEqual(cli.requests);
    return { cli, mcp };
  }
}

describe('dunstan_template_handback parity with dunstan template', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', async (_, c) => {
    const { dir, head } = featureRepository(ORIGIN, { pushed: c.pushed ?? true });
    const junit = junitFile();
    const s = c.scenario?.(head) ?? ci(head, []);
    const { cli, mcp } = await parity(c, dir, junit, s, c.env ?? TOKEN);

    // Every GitHub case, CLI and tool, byte for byte as on main (snapshotted before the GitLab
    // form of tests.from "ci" existed), up to the temporary repository's names.
    expect(
      stable({ code: cli.code, out: cli.out, err: cli.err, tool: mcp.text }, dir, junit),
    ).toMatchSnapshot();
  });
});

// The GitLab form (DRAFT GitLab profile 0.1): the declared case and each case that declares none,
// byte for byte between `dunstan template --tests-ci --gitlab-project` and tests.from "ci" with
// gitlabProject. GITLAB_TOKEN only; the origin remote is not read.
const GL_TOKEN = { GITLAB_TOKEN: 'fake-gitlab-token-PARITY-0042' };
const glFlags = [
  '--tests-ci',
  '--gitlab-project',
  GL_PROJECT,
  '--mr',
  '1',
  '--tests-command',
  'pnpm test',
  '--tests-job',
  GL_TEST_JOB,
];
const glTests = {
  from: 'ci',
  gitlabProject: GL_PROJECT,
  mergeRequest: 1,
  command: 'pnpm test',
  job: GL_TEST_JOB,
};

interface GitLabCase {
  name: string;
  pushed?: boolean;
  env?: Record<string, string>;
  scenario?: (head: string) => GitLabScenario;
  extraFlags?: string[];
  extraTests?: Record<string, unknown>;
  exit: number;
  says: RegExp;
}

const GITLAB_CASES: GitLabCase[] = [
  { name: 'declared', exit: 0, says: /tests: 142 executed and 0 failed/ },
  {
    name: 'declared, with every member named',
    scenario: (head) =>
      templateMergeRequest(head, {
        artifacts: { [GL_TEST_JOB_ID]: makeZip({ 'out/junit.xml': junitXml(['pass']) }) },
      }),
    extraFlags: [
      '--gitlab-host',
      'gitlab.example.com',
      '--tests-workflow',
      '.gitlab-ci.yml',
      '--tests-path',
      'out/junit.xml',
    ],
    extraTests: {
      gitlabHost: 'gitlab.example.com',
      workflow: '.gitlab-ci.yml',
      path: 'out/junit.xml',
    },
    exit: 0,
    says: /tests: 1 executed and 0 failed in out\/junit\.xml/,
  },
  { name: 'no_token', env: {}, exit: 2, says: /\(no_token\)/ },
  { name: 'not_pushed', pushed: false, exit: 2, says: /\(not_pushed\)/ },
  {
    name: 'the merge request cannot be read',
    scenario: (head) => templateMergeRequest(head, { mrStatus: 404 }),
    exit: 2,
    says: /\(source_unreadable:pull_request\)/,
  },
  {
    name: 'head_mismatch',
    scenario: (head) => templateMergeRequest(head, { mrSha: GL_ELSEWHERE }),
    exit: 2,
    says: /\(head_mismatch\)/,
  },
  {
    name: 'no head pipeline',
    scenario: (head) => templateMergeRequest(head, { pipeline: null }),
    exit: 2,
    says: /\(evidence_field_unpopulated:head_pipeline\)/,
  },
  {
    name: 'a head pipeline not at HEAD',
    scenario: (head) => templateMergeRequest(head, { pipeline: { sha: GL_ELSEWHERE } }),
    exit: 2,
    says: /\(evidence_field_unpopulated:head_pipeline_not_at_head_commit\)/,
  },
  {
    name: 'record_not_found',
    scenario: (head) =>
      templateMergeRequest(head, { jobs: [glJob(GL_TEST_JOB_ID, 'lint', 'success')] }),
    exit: 2,
    says: /\(record_not_found\)/,
  },
  {
    name: 'source_unreadable:artifact',
    scenario: (head) =>
      templateMergeRequest(head, {
        jobs: [
          glJob(GL_TEST_JOB_ID, GL_TEST_JOB, 'success', { expireAt: '2026-11-01T00:00:00.000Z' }),
        ],
      }),
    exit: 2,
    says: /\(source_unreadable:artifact\)/,
  },
  {
    name: 'source_unreadable:repository',
    scenario: (head) =>
      templateMergeRequest(head, {
        project: { path_with_namespace: GL_PROJECT, default_branch: 'main' },
      }),
    exit: 2,
    says: /\(source_unreadable:repository\)/,
  },
];

describe('dunstan_template_handback parity with dunstan template, on GitLab', () => {
  it.each(GITLAB_CASES.map((c) => [c.name, c] as const))('%s', async (_, c) => {
    const { dir, head } = featureRepository(`https://gitlab.com/${GL_PROJECT}.git`, {
      pushed: c.pushed ?? true,
    });
    const s = { gitlab: c.scenario?.(head) ?? templateMergeRequest(head) };
    const env = c.env ?? GL_TOKEN;
    const { cli, mcp } = await parity(
      {
        name: c.name,
        flags: () => [...glFlags, ...(c.extraFlags ?? [])],
        tests: () => ({ ...glTests, ...(c.extraTests ?? {}) }),
        exit: c.exit,
        line1: c.exit === 0 ? 'tests: declared' : 'tests: not declared',
        says: c.says,
      },
      dir,
      junitFile(),
      s,
      env,
    );
    // Only the GitLab host is read, and no token is in any text.
    const host = c.extraTests?.gitlabHost ?? 'gitlab.com';
    for (const q of cli.requests) {
      const url = typeof q === 'string' ? q : q.url;
      expect(url.startsWith(`https://${host}/api/v4/`)).toBe(true);
    }
    expect(cli.out + cli.err + mcp.text.join('')).not.toContain(GL_TOKEN.GITLAB_TOKEN);
  });
});

// The tool's tests.from "ci" is closed: the GitHub and the GitLab members are never mixed, and a
// GitLab member is checked as `dunstan template --gitlab-project` checks its flag. Each is an input
// error, with nothing read.
const TOOL_REFUSALS: [string, Record<string, unknown>, RegExp][] = [
  ['repository with gitlabProject', { ...glTests, repository: REPO }, /repository/],
  ['artifact with gitlabProject', { ...glTests, artifact: 'archive' }, /artifact/],
  ['artifactPath with gitlabProject', { ...glTests, artifactPath: 'junit.xml' }, /artifactPath/],
  ['path without gitlabProject', { ...ciTests, job: JOB, path: 'junit.xml' }, /path/],
  [
    'gitlabHost without gitlabProject',
    { ...ciTests, job: JOB, gitlabHost: 'gitlab.example.com' },
    /gitlabProject/,
  ],
  [
    'mergeRequest without gitlabProject',
    { ...ciTests, job: JOB, mergeRequest: 1 },
    /gitlabProject/,
  ],
  ['gitlabProject without mergeRequest', { ...glTests, mergeRequest: undefined }, /mergeRequest/],
  [
    'a malformed gitlabProject',
    { ...glTests, gitlabProject: 'https://gitlab.com/x' },
    /gitlabProject/,
  ],
  ['a malformed mergeRequest', { ...glTests, mergeRequest: 0 }, /mergeRequest/],
  ['a malformed gitlabHost', { ...glTests, gitlabHost: 'HTTPS://x' }, /gitlabHost/],
  ['GitHub without workflow', { from: 'ci', command: 'pnpm test', job: JOB }, /workflow/],
];

describe('dunstan_template_handback refuses a mixed or malformed tests.from "ci"', () => {
  it.each(TOOL_REFUSALS)('%s', async (_, tests, message) => {
    const { dir, head } = featureRepository(`https://gitlab.com/${GL_PROJECT}.git`);
    const mcp = await viaMcp(
      { directory: dir, tests },
      { gitlab: templateMergeRequest(head) },
      GL_TOKEN,
    );
    expect(mcp.result.isError).toBe(true);
    expect(mcp.text.join('')).toMatch(message);
    expect(mcp.text.join('')).not.toMatch(NAMES_A_FLAG);
    expect(mcp.requests).toEqual([]);
  });

  it('lists the GitLab members in the tool schema', async () => {
    const server = createDunstanMcpServer({ artifact: import.meta.url, env: {}, warn: () => {} });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'template-parity', version: '0' });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    await client.close();
    const text = JSON.stringify(tools.find((t) => t.name === TEMPLATE_TOOL_NAME)?.inputSchema);
    for (const member of ['gitlabProject', 'mergeRequest', 'gitlabHost', 'path']) {
      expect(text).toContain(`"${member}"`);
    }
    expect(text).toMatch(/GITLAB_TOKEN/);
  });
});

// The run with what differs between runs replaced: the temporary directories and the commits git
// makes in them (their ids hold the time).
function stable(run: Record<string, unknown>, dir: string, junit: string): unknown {
  const commits = git(dir, 'rev-list', '--all').split('\n');
  let text = JSON.stringify(run, null, 2);
  text = text.replaceAll(junit, '<junit>').replaceAll(dir, '<dir>');
  commits.forEach((c, i) => {
    text = text.replaceAll(c, `<commit ${i}>`).replaceAll(c.slice(0, 12), `<short ${i}>`);
  });
  return JSON.parse(text);
}

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
    expect(stable({ err: cli.err, tool: mcp.text }, dir, '<none>')).toMatchSnapshot();
  });
});

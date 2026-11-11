import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  junitXml,
  makeZip,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { featureRepository, isolateGit } from '../__tests__/git-repo.js';
import type { AdvisorySection } from '../advisory/advise.js';
import { extractClaims } from '../advisory/extract.js';
import { ADVISORY_LINE, advisoryLine } from '../advisory/present.js';
import type { Evidence } from '../check/types.js';
import { main } from '../cli/main.js';
import { buildRecord, recordBlock, serializeRecord } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { suggestText } from '../suggest/suggest.js';
import {
  createDunstanMcpServer,
  handbackResult,
  SUGGEST_TOOL_NAME,
  TEMPLATE_TOOL_NAME,
  TOOL_NAME,
} from './server.js';

isolateGit();

const BLOCK = { dunstan: '0.1', headCommit: HEAD, filesChanged: ['src/a.ts', 'src/b.ts'] };
const REPORT = `Done.\n\n\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${HEAD}","filesChanged":["src/a.ts"]}\n\`\`\`\n`;

function scenario(): Scenario {
  return {
    pr: basePullRequest(),
    files: [
      { filename: 'src/a.ts', status: 'modified' },
      { filename: 'src/b.ts', status: 'added' },
    ],
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dunstan-mcp-'));
});

async function connect(s: Scenario = scenario(), env = { GITHUB_TOKEN: 'test-token' }) {
  const fake = fakeGitHub(s);
  let err = '';
  const server = createDunstanMcpServer({
    artifact: import.meta.url,
    env,
    fetch: fake.fetch,
    warn: (text) => {
      err += text;
    },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  const call = async (args: Record<string, unknown>) => {
    const result = (await client.callTool({ name: TOOL_NAME, arguments: args })) as CallToolResult;
    const text = result.content.map((item) => (item.type === 'text' ? item.text : ''));
    return { result, text, err: () => err };
  };
  return { client, call, requests: fake.requests };
}

describe('dunstan_check_handback', () => {
  it('is the check tool, with the subject and exactly one of block or report', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([TOOL_NAME, SUGGEST_TOOL_NAME, TEMPLATE_TOOL_NAME]);
    const schema = tools[0]?.inputSchema as { properties: object; required?: string[] };
    // Either subject: repository and pullRequest, or gitlabProject, mergeRequest and optionally
    // gitlabHost. Which one, and that it is whole, the tool checks (src/mcp/gitlab.test.ts).
    expect(Object.keys(schema.properties).sort()).toEqual(
      [
        'block',
        'gitlabHost',
        'gitlabProject',
        'mergeRequest',
        'outPath',
        'pullRequest',
        'report',
        'repository',
      ].sort(),
    );
    expect(schema.required ?? []).toEqual([]);
  });

  it('checks a report text: the verdict, the claims table and the record', async () => {
    const { call } = await connect();
    const { result, text } = await call({ repository: REPO, pullRequest: 7, report: REPORT });
    expect(result.isError).toBeFalsy();
    expect(text[0]).toMatch(/^verdict: fail\nReport the rows below as they are\./);
    expect(text[0]).toMatch(/record: not written/);
    expect(text[1]).toMatch(
      /fail\s+scope:undeclared:src\/b\.ts\s+null\s+src\/b\.ts\s+undeclared_file/,
    );
    const record = JSON.parse(text[2] as string);
    expect(record.predicate.verdict).toBe('fail');
    expect(record.predicate.report.source).toEqual({
      kind: 'api',
      locator: `mcp ${TOOL_NAME}#report`,
    });
    expect(record.predicate.rerun).toEqual({
      offline: `dunstan verify dunstan-${REPO.replace('/', '-')}-7.json`,
      online: `dunstan rerun dunstan-${REPO.replace('/', '-')}-7.json`,
    });
  });

  it('checks a block given as an object', async () => {
    const { call } = await connect();
    const { result, text } = await call({ repository: REPO, pullRequest: 7, block: BLOCK });
    expect(result.isError).toBeFalsy();
    expect(text[0]).toMatch(/^verdict: pass\n/);
    const record = JSON.parse(text[2] as string);
    expect(record.predicate.block.status).toBe('found');
    // The report is the block's canonical bytes, so its digest is the block's.
    expect(record.predicate.report.sha256).toBe(record.predicate.block.sha256);
    expect(record.predicate.report.source.locator).toBe(`mcp ${TOOL_NAME}#block`);
  });

  it.each([
    ['an unknown member', { ...BLOCK, repository: REPO }, 'schema_violation'],
    ['an unsupported version', { ...BLOCK, dunstan: '0.2' }, 'unsupported_version'],
  ])(
    'reads a block object with %s as invalid: unverifiable, not an error',
    async (_, block, code) => {
      const { call } = await connect();
      const { result, text } = await call({ repository: REPO, pullRequest: 7, block });
      expect(result.isError).toBeFalsy();
      const record = JSON.parse(text[2] as string);
      expect(record.predicate.verdict).toBe('unverifiable');
      expect(record.predicate.block.errors.map((e: { code: string }) => e.code)).toContain(code);
    },
  );

  it('gives unverifiable for a report with no block, and reads only the pull request, and again at the end', async () => {
    const { call, requests } = await connect();
    const { text } = await call({ repository: REPO, pullRequest: 7, report: 'All done.' });
    expect(text[0]).toMatch(/^verdict: unverifiable\n/);
    expect(requests).toEqual([`GET /repos/${REPO}/pulls/7`, `GET /repos/${REPO}/pulls/7`]);
  });

  it('is an error, not a verdict, when the pull request moves on both runs (pull_request_moved)', async () => {
    const head = (sha: string) => ({ head: { sha } });
    const pushed = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';
    const { call } = await connect({
      ...scenario(),
      prMoves: [
        head(HEAD),
        head(pushed),
        head(pushed),
        head('c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0'),
      ],
    });
    const outPath = join(dir, 'moved.json');
    const { result, text } = await call({
      repository: REPO,
      pullRequest: 7,
      report: REPORT,
      outPath,
    });
    expect(result.isError).toBe(true);
    expect(text[0]).toMatch(/^dunstan: pull request .* moved .*pull_request_moved\)\n/);
    expect(text[0]).toContain('This is an error, not a verdict: nothing was checked.');
    expect(existsSync(outPath)).toBe(false);
  });

  it.each([
    ['both block and report', { block: BLOCK, report: REPORT }, /exactly one of block/],
    ['neither block nor report', {}, /exactly one of block/],
  ])('refuses %s as an input error, reading nothing', async (_, given, message) => {
    const { call, requests } = await connect();
    const { result, text } = await call({ repository: REPO, pullRequest: 7, ...given });
    expect(result.isError).toBe(true);
    expect(text.join('')).toMatch(message);
    expect(text.join('')).toMatch(/not a verdict/);
    expect(text.join('')).not.toMatch(/verdict: (pass|fail|unverifiable)/);
    expect(requests).toEqual([]);
  });

  it.each([
    ['a repository that is not owner/name', { repository: 'nope', pullRequest: 7 }],
    ['a pull request that is not a positive integer', { repository: REPO, pullRequest: 0 }],
    ['a block that is not an object', { repository: REPO, pullRequest: 7, block: '{}' }],
  ])('refuses %s as a tool error', async (_, args) => {
    const { call, requests } = await connect();
    const { result } = await call({ report: REPORT, ...args });
    expect(result.isError).toBe(true);
    expect(requests).toEqual([]);
  });

  it('returns an unreadable pull request as a tool error, never a verdict', async () => {
    const { call } = await connect();
    const { result, text } = await call({ repository: REPO, pullRequest: 8, report: REPORT });
    expect(result.isError).toBe(true);
    expect(text.join('')).toMatch(/cannot read pull request .*#8 \(http_404\)/);
    expect(text.join('')).toMatch(/not a verdict/);
  });

  it('only reads: every request is a GET, or the GraphQL query', async () => {
    const s = scenario();
    s.closing = ['example-org/example-repo#3'];
    s.issues = { 'example-org/example-repo#3': 200 };
    const { call, requests } = await connect(s);
    await call({
      repository: REPO,
      pullRequest: 7,
      block: { ...BLOCK, references: [{ issue: '#3', relation: 'closes' }] },
    });
    expect(requests.length).toBeGreaterThan(2);
    for (const request of requests) expect(request).toMatch(/^(GET |POST \/graphql$)/);
  });

  it('writes nothing without outPath, and the returned record to outPath when given', async () => {
    const before = readdirSync(process.cwd());
    const { call } = await connect();
    await call({ repository: REPO, pullRequest: 7, block: BLOCK });
    expect(readdirSync(process.cwd())).toEqual(before);

    const outPath = join(dir, 'record.json');
    const { text } = await call({ repository: REPO, pullRequest: 7, block: BLOCK, outPath });
    expect(text[0]).toContain(`record: ${outPath}`);
    expect(readFileSync(outPath, 'utf8')).toBe(text[2]);
    expect(JSON.parse(text[2] as string).predicate.rerun.offline).toBe(
      'dunstan verify record.json',
    );
  });

  it('never overwrites a file at outPath', async () => {
    const outPath = join(dir, 'taken.json');
    writeFileSync(outPath, 'keep me');
    const { call, requests } = await connect();
    const { result, text } = await call({
      repository: REPO,
      pullRequest: 7,
      block: BLOCK,
      outPath,
    });
    expect(result.isError).toBe(true);
    expect(text.join('')).toMatch(/exists; the tool never overwrites/);
    expect(readFileSync(outPath, 'utf8')).toBe('keep me');
    expect(requests).toEqual([]);
  });

  it('says so when GITHUB_TOKEN is not set', async () => {
    const { call } = await connect(scenario(), {} as { GITHUB_TOKEN: string });
    const r = await call({ repository: REPO, pullRequest: 7, block: BLOCK });
    expect(r.text[0]).toMatch(/note: GITHUB_TOKEN is not set; read anonymously/);
    expect(r.err()).toMatch(/GITHUB_TOKEN is not set/);
  });
});

// The titles and annotations an MCP client and the Claude directory read. Each tool's annotations are
// compared whole, so a removed hint and a flipped one both fail here, on the tool that changed.
// dunstan_check_handback keeps outPath: it writes a file only when outPath is given and never over an
// existing one, so it is not read-only but not destructive either.
describe('tool titles and annotations', () => {
  it('declare each tool honestly', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(
      [TOOL_NAME, SUGGEST_TOOL_NAME, TEMPLATE_TOOL_NAME].sort(),
    );
    expect(byName[TOOL_NAME]?.title).toBe('Check a handback against the record');
    expect(byName[TOOL_NAME]?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(byName[SUGGEST_TOOL_NAME]?.title).toBe('Suggest declarations from the prose');
    expect(byName[SUGGEST_TOOL_NAME]?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    // dunstan_template_handback writes nothing, and with tests.from "ci" reads GitHub.
    expect(byName[TEMPLATE_TOOL_NAME]?.title).toBe('Generate a handback block from git');
    expect(byName[TEMPLATE_TOOL_NAME]?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });
});

describe('dunstan_template_handback', () => {
  const ORIGIN = `https://github.com/${REPO}.git`;
  const WORKFLOW = '.github/workflows/ci.yml';
  const CI = { from: 'ci', command: 'pnpm test', workflow: WORKFLOW, job: 'Test' };

  // A CI run at head whose artifact holds `executed` passing test cases, or none uploaded.
  function ciScenario(head: string, executed: number | null): Scenario {
    return {
      pr: basePullRequest({ head: { sha: head } }),
      workflowRuns: [
        {
          id: 801,
          check_suite_id: 8010,
          run_attempt: 1,
          name: 'CI',
          event: 'pull_request',
          status: 'completed',
          path: WORKFLOW,
          head_sha: head,
        },
      ],
      jobs: { 801: ['Test'] },
      artifacts: {
        801: executed === null ? [] : [{ id: 9801, name: 'dunstan-junit', expired: false }],
      },
      zips: {
        9801: makeZip({ 'junit.xml': junitXml(Array<'pass'>(executed ?? 0).fill('pass')) }),
      },
    };
  }

  // A server whose fetch is the given one: the fake GitHub, or one that throws on any call.
  async function template(args: Record<string, unknown>, fetchImpl: typeof fetch) {
    const server = createDunstanMcpServer({
      artifact: import.meta.url,
      env: { GITHUB_TOKEN: 'test-token' },
      fetch: fetchImpl,
      warn: () => {},
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
    const result = (await client.callTool({
      name: TEMPLATE_TOOL_NAME,
      arguments: args,
    })) as CallToolResult;
    const text = result.content.map((item) => (item.type === 'text' ? item.text : ''));
    return { result, text, client };
  }

  const offline: typeof fetch = async (input) => {
    throw new Error(`dunstan_template_handback must not read the network here: ${String(input)}`);
  };

  it('takes directory, and optionally base and one of two closed forms of tests', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === TEMPLATE_TOOL_NAME);
    const schema = tool?.inputSchema as {
      properties: Record<string, { anyOf?: object[]; oneOf?: object[] }>;
      required: string[];
      additionalProperties?: boolean;
    };
    expect(Object.keys(schema.properties).sort()).toEqual(['base', 'directory', 'tests']);
    expect(schema.required).toEqual(['directory']);
    expect(schema.additionalProperties).toBe(false);
    const forms = (schema.properties.tests?.oneOf ?? schema.properties.tests?.anyOf) as {
      properties: Record<string, { const?: string }>;
      required: string[];
      additionalProperties: boolean;
    }[];
    expect(forms).toHaveLength(2);
    const byFrom = Object.fromEntries(forms.map((f) => [f.properties.from?.const, f]));
    expect(Object.keys(byFrom).sort()).toEqual(['ci', 'local']);
    expect(Object.keys(byFrom.ci?.properties ?? {}).sort()).toEqual(
      [
        'artifact',
        'artifactPath',
        'command',
        'from',
        'job',
        'repository',
        'workflow',
        'gitlabProject',
        'mergeRequest',
        'gitlabHost',
        'path',
      ].sort(),
    );
    // workflow is required on GitHub only, which the tool checks (src/mcp/template-parity.test.ts).
    expect(byFrom.ci?.required.sort()).toEqual(['command', 'from', 'job']);
    expect(Object.keys(byFrom.local?.properties ?? {}).sort()).toEqual([
      'command',
      'from',
      'junit',
    ]);
    expect(byFrom.local?.required.sort()).toEqual(['command', 'from', 'junit']);
    for (const f of forms) expect(f.additionalProperties).toBe(false);
  });

  it.each([
    ['an unknown tests member', { ...CI, record: 'x' }, /record/],
    ['a tests mixing both forms', { ...CI, junit: 'junit.xml' }, /junit/],
    [
      'a local tests with a CI member',
      { from: 'local', junit: 'j.xml', command: 'x', job: 'Test' },
      /job/,
    ],
    ['a ci tests missing job', { from: 'ci', command: 'x', workflow: WORKFLOW }, /job/],
    ['a repository that is not owner/name', { ...CI, repository: 'nope' }, /owner\/name/],
  ])('refuses %s as an input error, reading nothing', async (_, tests, names) => {
    const { dir } = featureRepository(ORIGIN);
    const { result, text } = await template({ directory: dir, tests }, offline);
    expect(result.isError).toBe(true);
    expect(text.join('')).toMatch(names);
    expect(text.join('')).not.toContain('```dunstan-handback');
  });

  it('refuses an unknown member and a relative directory as input errors', async () => {
    const { dir } = featureRepository(ORIGIN);
    const unknown = await template({ directory: dir, repository: REPO }, offline);
    expect(unknown.result.isError).toBe(true);
    expect(unknown.text.join('')).toMatch(/repository/);
    const relative = await template({ directory: 'src' }, offline);
    expect(relative.result.isError).toBe(true);
    expect(relative.text.join('')).toMatch(/directory src is not an absolute path/);
    expect(relative.text.join('')).toContain('This is an error: no block was produced.');
  });

  it('returns a directory that is not a repository as a tool error, not a fence', async () => {
    const { result, text } = await template({ directory: dir, tests: CI }, offline);
    expect(result.isError).toBe(true);
    expect(text).toEqual([
      `dunstan: not a git repository: ${dir}\nThis is an error: no block was produced.\n`,
    ]);
  });

  it('says tests: not declared on line 1 when the CI read does not settle, and returns the block without tests', async () => {
    const { dir: repo, head } = featureRepository(ORIGIN);
    const fake = fakeGitHub(ciScenario(head, null));
    const { result, text } = await template({ directory: repo, tests: CI }, fake.fetch);
    expect(result.isError).toBeFalsy();
    const lines = (text[0] as string).split('\n');
    expect(lines[0]).toBe('tests: not declared');
    expect(lines[1]).toBe(
      'The block below has no tests. Do not add counts yourself; do what the note says.',
    );
    expect(text[0]).toMatch(/note: tests are not declared: .*\(record_not_found\)/);
    const block = extractHandbackBlock(text[1] as string);
    expect(block.status).toBe('found');
    expect((block as { value: Record<string, unknown> }).value.tests).toBeUndefined();
  });

  it('declares the CI counts, and with from: ci every request is a GET', async () => {
    const { dir: repo, head } = featureRepository(ORIGIN);
    const fake = fakeGitHub(ciScenario(head, 5));
    const { result, text } = await template({ directory: repo, tests: CI }, fake.fetch);
    expect(result.isError).toBeFalsy();
    expect((text[0] as string).split('\n')[0]).toBe('tests: declared');
    const block = extractHandbackBlock(text[1] as string) as { value: Record<string, unknown> };
    expect(block.value.tests).toEqual([
      {
        command: 'pnpm test',
        count: 5,
        failures: 0,
        record: {
          kind: 'junit',
          workflow: WORKFLOW,
          job: 'Test',
          artifact: 'dunstan-junit',
          path: 'junit.xml',
        },
      },
    ]);
    expect(fake.requests.length).toBeGreaterThan(0);
    for (const request of fake.requests) expect(request).toMatch(/^GET /);
  });

  it('makes no network call with no tests or with from: local', async () => {
    const { dir: repo } = featureRepository(ORIGIN);
    const none = await template({ directory: repo }, offline);
    expect(none.result.isError).toBeFalsy();
    expect((none.text[0] as string).split('\n')[0]).toBe('tests: none asked');

    writeFileSync(join(repo, 'junit.xml'), junitXml(['pass', 'fail']));
    const local = await template(
      { directory: repo, tests: { from: 'local', junit: 'junit.xml', command: 'pnpm test' } },
      offline,
    );
    expect(local.result.isError).toBeFalsy();
    expect((local.text[0] as string).split('\n')[0]).toBe('tests: declared');
    // A relative junit path resolves against directory.
    const block = extractHandbackBlock(local.text[1] as string) as {
      value: Record<string, unknown>;
    };
    expect(block.value.tests).toEqual([
      { command: 'pnpm test', count: 2, failures: 1, record: { kind: 'local' } },
    ]);
  });
});

describe('dunstan_suggest_declarations', () => {
  const report = `Updated src/a.ts and docs/guide.md. All 42 tests pass.\n\n\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${HEAD}","filesChanged":["src/a.ts"]}\n\`\`\`\n`;

  it('takes only the report, reads nothing and says it is read-only', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === SUGGEST_TOOL_NAME);
    const schema = tool?.inputSchema as { properties: object; required: string[] };
    expect(Object.keys(schema.properties)).toEqual(['report']);
    expect(schema.required).toEqual(['report']);
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
  });

  it('returns exactly what dunstan suggest prints, and reads nothing', async () => {
    const { client, requests } = await connect();
    const result = (await client.callTool({
      name: SUGGEST_TOOL_NAME,
      arguments: { report },
    })) as CallToolResult;
    let out = '';
    const code = await main(['suggest'], {
      out: (t) => {
        out += t;
      },
      err: () => {},
      env: {},
      artifact: import.meta.url,
      readStdin: () => new TextEncoder().encode(report),
    });
    expect(code).toBe(0);
    expect(out).toBe(suggestText(report));
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: out }]);
    expect(out).toContain('The prose appears to make 3 claims the block does not declare:');
    expect(requests).toEqual([]);
  });

  it('with no block, gives the template command, as the CLI does', async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: SUGGEST_TOOL_NAME,
      arguments: { report: 'All done.' },
    })) as CallToolResult;
    expect(result.content).toEqual([{ type: 'text', text: suggestText('All done.') }]);
    expect(suggestText('All done.')).toContain('\n  dunstan template\n');
  });
});

describe('the tool response for a record with advisories', () => {
  // The tool itself never asks for advisories; the response is still worded for one that has them.
  const evidence: Evidence = {
    pullRequest: {
      status: 'ok',
      number: 7,
      state: 'open',
      merged: false,
      mergedAt: null,
      headSha: HEAD,
      mergeSha: null,
      changedFiles: 1,
    },
    files: { status: 'ok', complete: true, entries: [{ path: 'src/a.ts', status: 'modified' }] },
    sources: [],
  };
  const report = `I changed src/a.ts and src/zzz.ts.\n\n\`\`\`dunstan-handback\n${JSON.stringify({ dunstan: '0.1', headCommit: HEAD, filesChanged: ['src/a.ts'] })}\n\`\`\`\n`;
  const record = buildRecord({
    checker: { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: '0'.repeat(64) } },
    report: { sha256: '1'.repeat(64), source: { kind: 'api', locator: `mcp ${TOOL_NAME}#report` } },
    block: recordBlock(extractHandbackBlock(report)),
    repository: REPO,
    evidence,
    rerun: { offline: 'dunstan verify r.json', online: 'dunstan rerun r.json' },
    advisory: extractClaims(report),
    // src/zzz.ts is a file at the head that the pull request did not change (comparison 0.3.0).
    pathsAtHead: [{ path: 'src/zzz.ts', status: 'ok', object: 'Blob' }],
  });

  it('shows a differs note as a possible disagreement, unverified, and returns the record as written', () => {
    const { content } = handbackResult(record, undefined, [], { hasToken: true });
    const text = content.map((item) => (item.type === 'text' ? item.text : ''));
    const [head, table, bytes] = text as [string, string, string];
    expect(head).toMatch(/^verdict: pass\n/);
    expect(table).toContain('possible disagreement, unverified');
    expect(table).toMatch(
      /possible disagreement, unverified: not among the changed files\s+file_changed\s+src\/zzz\.ts\s+null/,
    );
    // Extractor 0.1.3 is unmeasured, as 0.1.2 and 0.1.4 are, so the fixed line states no figure.
    const line = advisoryLine(record.predicate.advisory as AdvisorySection);
    expect(line).toBe(ADVISORY_LINE);
    expect(table).toContain(line);
    // The fixed line itself says "false claim"; outside it, no word of the old wording.
    for (const t of [head, table]) {
      expect(t.replaceAll(line, '')).not.toMatch(/differs|mismatch|false claim/i);
    }
    // The third item is the record's exact bytes, its note unchanged.
    expect(bytes).toBe(serializeRecord(record));
    expect(JSON.parse(bytes).predicate.advisory.advisories[1].note).toBe(
      'differs:declared_not_changed',
    );
  });
});

describe('server.json (draft registry entry)', () => {
  it('names the package, version and mcpName package.json carries', () => {
    const read = (file: string) =>
      JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    const server = read('server.json');
    const pkg = read('package.json');
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(CHECKER_VERSION);
    expect(server.packages).toEqual([
      expect.objectContaining({
        identifier: pkg.name,
        version: CHECKER_VERSION,
        transport: { type: 'stdio' },
        packageArguments: [{ type: 'positional', value: 'mcp' }],
      }),
    ]);
  });
});

describe('dunstan mcp', () => {
  it('serves the tool over stdio, keeps stdout for the protocol, and exits 0 when stdin ends', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = '';
    stdout.on('data', (chunk) => {
      out += chunk;
    });
    let err = '';
    const fake = fakeGitHub(scenario());
    const exit = main(['mcp'], {
      out: () => {
        throw new Error('dunstan mcp must not write to stdout outside the protocol');
      },
      err: (t) => {
        err += t;
      },
      env: { GITHUB_TOKEN: 'test-token' },
      artifact: import.meta.url,
      fetch: fake.fetch,
      readStdin: () => new Uint8Array(),
      stdin,
      stdout,
    });
    const send = (message: object) => stdin.write(`${JSON.stringify(message)}\n`);
    const reply = async (id: number) => {
      for (let i = 0; i < 200; i++) {
        const line = out
          .split('\n')
          .filter((l) => l !== '')
          .map((l) => JSON.parse(l))
          .find((m) => m.id === id);
        if (line !== undefined) return line;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`no reply to ${id}; stderr: ${err}`);
    };
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '0' },
      },
    });
    expect((await reply(1)).result.serverInfo.name).toBe('dunstan');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
    expect((await reply(3)).result.tools.map((t: { name: string }) => t.name)).toEqual([
      TOOL_NAME,
      SUGGEST_TOOL_NAME,
      TEMPLATE_TOOL_NAME,
    ]);
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: TOOL_NAME, arguments: { repository: REPO, pullRequest: 7, block: BLOCK } },
    });
    const call = await reply(2);
    expect(call.result.content[0].text).toMatch(/^verdict: pass\n/);
    stdin.end();
    expect(await exit).toBe(0);
    expect(existsSync(join(process.cwd(), `dunstan-${REPO.replace('/', '-')}-7.json`))).toBe(false);
  });

  it('takes no arguments', async () => {
    let err = '';
    const code = await main(['mcp', '--port', '1'], {
      out: () => {},
      err: (t) => {
        err += t;
      },
      env: {},
      artifact: import.meta.url,
      readStdin: () => new Uint8Array(),
    });
    expect(code).toBe(3);
    expect(err).toMatch(/takes no arguments/);
  });
});

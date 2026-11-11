// Parity: on every acceptance fixture (fixtures/planted and fixtures/controls), with the GitHub
// reader stubbed to answer the fixture's evidence, the MCP tool's claims, verdict and digests are
// byte-identical to `dunstan check`'s. The two records may differ only in the report's source (and,
// for a block given as an object, the report's digest): nothing a claim, verdict or digest reads.
// The remedy lines under the claims table are worded for each caller, and differ only by the phrase
// table (src/template/wording.ts); the record holds no remedy line.

import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { asMcp, NAMES_A_FLAG } from '../__tests__/wording.js';
import {
  FIXTURE_REPOSITORY,
  FIXTURES,
  type FixtureCase,
  loadCases,
  runCase,
} from '../acceptance/fixtures.js';
import type { Block, Evidence } from '../check/types.js';
import { main } from '../cli/main.js';
import { diffPointers } from '../cli/rerun.js';
import type { ReadEvidenceInput } from '../evidence/github.js';
import type { DunstanRecord } from '../record/build.js';
import { remedyFor } from '../remedy/remedies.js';
import { canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { createDunstanMcpServer, TOOL_NAME } from './server.js';

// The reader stub: whatever the caller, it answers the current fixture's evidence, and logs what it
// was asked to read (subject, block, excluded check runs).
const stub = vi.hoisted(() => ({
  evidence: undefined as Evidence | undefined,
  asked: [] as unknown[],
}));

vi.mock('../evidence/github.js', async (original) => ({
  ...(await original<typeof import('../evidence/github.js')>()),
  readPullRequest: async (_client: unknown, repository: string, number: number) => {
    stub.asked.push({ repository, number });
    return {
      evidence: stub.evidence?.pullRequest,
      repository: FIXTURE_REPOSITORY,
      baseRef: 'main',
      body: null,
    };
  },
  readEvidence: async (_client: unknown, input: ReadEvidenceInput) => {
    stub.asked.push(input);
    return structuredClone(stub.evidence);
  },
}));

const cases = [...loadCases('controls'), ...loadCases('planted')];
const dir = mkdtempSync(join(tmpdir(), 'dunstan-parity-'));
mkdirSync(join(dir, 'cli'));
mkdirSync(join(dir, 'mcp'));
mkdirSync(join(dir, 'mcp-block'));

// Both callers run from this file, so the checker digest is the same in both records.
const artifact = import.meta.url;
const canon = (value: unknown) => canonicalize(value as JsonValue);
const number = (c: FixtureCase) => (c.evidence.pullRequest as { number: number }).number;

// The remedy lines each caller printed last (src/remedy/remedies.ts): the CLI's claims table and the
// tool's, for one fixture.
const printed = { cli: [] as string[], mcp: [] as string[] };
const remedies = (text: string) => text.split('\n').filter((l) => /^ {2}remedy: /.test(l));

async function viaCli(c: FixtureCase): Promise<DunstanRecord> {
  stub.evidence = c.evidence;
  let stdout = '';
  const out = join(dir, 'cli', `${c.set}-${c.name}.json`);
  const code = await main(
    [
      'check',
      '--repo',
      FIXTURE_REPOSITORY,
      '--pr',
      String(number(c)),
      '--report-file',
      fileURLToPath(new URL(`${c.set}/${c.name}/report.md`, FIXTURES)),
      '--out',
      out,
    ],
    {
      out: (t) => {
        stdout += t;
      },
      err: () => {},
      env: { GITHUB_TOKEN: 'test-token' },
      artifact,
      readStdin: () => new Uint8Array(),
    },
  );
  expect(code).not.toBe(3);
  printed.cli = remedies(stdout);
  return JSON.parse(readFileSync(out, 'utf8')) as DunstanRecord;
}

let client: Client;
beforeAll(async () => {
  const server = createDunstanMcpServer({
    artifact,
    env: { GITHUB_TOKEN: 'test-token' },
    warn: () => {},
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'parity-test', version: '0' });
  await client.connect(clientSide);
});
afterAll(async () => {
  await client.close();
});

async function viaMcp(
  c: FixtureCase,
  subdir: string,
  given: { report: string } | { block: Block },
): Promise<DunstanRecord> {
  stub.evidence = c.evidence;
  const outPath = join(dir, subdir, `${c.set}-${c.name}.json`);
  const result = (await client.callTool({
    name: TOOL_NAME,
    arguments: { repository: FIXTURE_REPOSITORY, pullRequest: number(c), outPath, ...given },
  })) as CallToolResult;
  expect(result.isError).toBeFalsy();
  const text = result.content.map((item) => (item.type === 'text' ? item.text : ''));
  const record = JSON.parse(text[2] as string) as DunstanRecord;
  printed.mcp = remedies(text[1] as string);
  // The record returned is the record written, byte for byte.
  expect(readFileSync(outPath, 'utf8')).toBe(text[2]);
  expect(text[0]).toMatch(new RegExp(`^verdict: ${record.predicate.verdict}\n`));
  return record;
}

// Every string a record holds, at any depth.
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringsIn);
}

function expectParity(cli: DunstanRecord, mcp: DunstanRecord, differ: string[]): void {
  const a = cli.predicate;
  const b = mcp.predicate;
  expect(canon(b.claims)).toBe(canon(a.claims));
  expect(b.verdict).toBe(a.verdict);
  expect(canon(b.digests)).toBe(canon(a.digests));
  expect(canon(b.block)).toBe(canon(a.block));
  expect(canon(mcp.subject)).toBe(canon(cli.subject));
  expect(diffPointers(cli, mcp).sort()).toEqual(differ.sort());
}

describe('MCP parity with dunstan check, reader stubbed', () => {
  it('runs every acceptance fixture', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(cases.filter((c) => c.set === 'controls').length).toBeGreaterThanOrEqual(3);
  });

  it.each(cases.map((c) => [`${c.set}/${c.name}`, c] as const))(
    '%s: report text gives the CLI claims, verdict and digests',
    async (_, c) => {
      stub.asked = [];
      const cli = await viaCli(c);
      const cliAsked = stub.asked;
      stub.asked = [];
      const mcp = await viaMcp(c, 'mcp', { report: c.report.toString('utf8') });
      expectParity(cli, mcp, ['/predicate/report/source/kind', '/predicate/report/source/locator']);
      // Same report bytes, same digest.
      expect(mcp.predicate.report.sha256).toBe(cli.predicate.report.sha256);
      // Both asked the reader the same questions: the pull request, the evidence, and the pull
      // request again.
      expect(cliAsked).toHaveLength(3);
      expect(stub.asked.map(canon)).toEqual(cliAsked.map(canon));
      // And both agree with the preregistered fixture result.
      expect(mcp.predicate.verdict).toBe(c.expected.verdict);
      expect(canon(mcp.predicate.claims)).toBe(canon(runCase(c).predicate.claims));
      expect(canon(mcp.predicate.digests)).toBe(canon(runCase(c).predicate.digests));
      // The same remedy lines, one under each tests row that has one, in the same order, each worded
      // for its caller: the tool's is the CLI's with the phrase table's pairs replaced, and names no
      // flag (src/template/wording.ts).
      const expected = (caller: 'cli' | 'mcp') =>
        cli.predicate.claims.flatMap((claim) => {
          const remedy = remedyFor(claim, { hasToken: true, caller });
          return remedy === undefined ? [] : [`  remedy: ${remedy}`];
        });
      expect(printed.mcp).toEqual(printed.cli.map(asMcp));
      expect(printed.cli).toEqual(expected('cli'));
      expect(printed.mcp).toEqual(expected('mcp'));
      for (const line of printed.mcp) expect(line).not.toMatch(NAMES_A_FLAG);
      // Neither record holds a remedy line, in either wording: the wording is presentation only.
      const lines = [...printed.cli, ...printed.mcp].map((l) => l.slice('  remedy: '.length));
      for (const record of [cli, mcp]) {
        const strings = stringsIn(record);
        for (const line of lines) expect(strings.some((s) => s.includes(line))).toBe(false);
      }
    },
  );

  it('covers fixtures that print remedy lines', () => {
    const named = cases
      .filter((c) =>
        runCase(c).predicate.claims.some((x) => remedyFor(x, { hasToken: true, caller: 'cli' })),
      )
      .map((c) => c.name);
    expect(named).toEqual(
      expect.arrayContaining(['test-record-not-found', 'unsupported-test-record-kind']),
    );
    // And at least one whose line names the template, so the wording for the tool is exercised.
    const worded = cases.filter((c) =>
      runCase(c).predicate.claims.some(
        (x) =>
          remedyFor(x, { hasToken: true, caller: 'cli' }) !==
          remedyFor(x, { hasToken: true, caller: 'mcp' }),
      ),
    );
    expect(worded.map((c) => c.name)).toContain('test-record-not-found');
  });

  const found = cases.filter((c) => runCase(c).predicate.block.status === 'found');
  it.each(found.map((c) => [`${c.set}/${c.name}`, c] as const))(
    '%s: the block as an object gives the CLI claims, verdict and digests',
    async (_, c) => {
      stub.asked = [];
      const cli = await viaCli(c);
      const cliAsked = stub.asked;
      stub.asked = [];
      const block = cli.predicate.block.value as Block;
      const mcp = await viaMcp(c, 'mcp-block', { block });
      expect(stub.asked.map(canon)).toEqual(cliAsked.map(canon));
      expectParity(cli, mcp, [
        '/predicate/report/sha256',
        '/predicate/report/source/kind',
        '/predicate/report/source/locator',
      ]);
    },
  );
});

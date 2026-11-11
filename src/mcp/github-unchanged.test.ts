// A GitHub subject's output is byte-identical to what dunstan_check_handback gave before it took a
// GitLab subject. The snapshot was written by this test on main (b0de1e4), before the tool changed,
// with the clock and the checker artifact fixed so that every byte of the response is reproducible:
// a later change to a GitHub call's text, notes, table or record fails here.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { createDunstanMcpServer, TOOL_NAME } from './server.js';

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

const dir = mkdtempSync(join(tmpdir(), 'dunstan-mcp-github-unchanged-'));
const artifactFile = join(dir, 'checker.mjs');
writeFileSync(artifactFile, 'a fixed checker artifact\n');
const artifact = pathToFileURL(artifactFile).href;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T09:00:00.000Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

async function call(args: Record<string, unknown>, env: Record<string, string | undefined>) {
  const fake = fakeGitHub(scenario());
  const server = createDunstanMcpServer({ artifact, env, fetch: fake.fetch, warn: () => {} });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'github-unchanged', version: '0' });
  await client.connect(clientSide);
  const result = (await client.callTool({ name: TOOL_NAME, arguments: args })) as CallToolResult;
  await client.close();
  return { result, requests: fake.requests };
}

const TOKEN = { GITHUB_TOKEN: 'test-token' };

describe('dunstan_check_handback on a GitHub subject, byte for byte as on main', () => {
  it.each([
    ['a report text', { repository: REPO, pullRequest: 7, report: REPORT }, TOKEN],
    ['a block object', { repository: REPO, pullRequest: 7, block: BLOCK }, TOKEN],
    ['a report with no block', { repository: REPO, pullRequest: 7, report: 'All done.' }, TOKEN],
    ['no GITHUB_TOKEN', { repository: REPO, pullRequest: 7, block: BLOCK }, {}],
    ['an unreadable pull request', { repository: REPO, pullRequest: 8, report: REPORT }, TOKEN],
    [
      'both block and report',
      { repository: REPO, pullRequest: 7, block: BLOCK, report: REPORT },
      TOKEN,
    ],
  ] as const)('%s', async (_, args, env) => {
    const { result, requests } = await call({ ...args }, { ...env });
    expect({ result, requests }).toMatchSnapshot();
  });
});

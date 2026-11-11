// dunstan_check_handback on a GitLab merge request (DRAFT GitLab profile 0.1), against a fake
// GitLab: exactly one subject, each token only to its own forge's host, and the CLI's record on the
// same evidence. The GitHub cases are in server.test.ts and github-unchanged.test.ts.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  baseDiffs,
  baseMergeRequest,
  fakeGitLab,
  type GitLabScenario,
  GL_HEAD,
  GL_PROJECT,
} from '../__tests__/fake-gitlab.js';
import { DEFAULT_GITLAB_HOST } from '../evidence/http.js';
import { createDunstanMcpServer, TOOL_NAME } from './server.js';

// Not real tokens, and not in either forge's token format.
const GITLAB_TOKEN = 'fake-gitlab-token-MCP-0042';
const GITHUB_TOKEN = 'fake-github-token-MCP-0042';

const BLOCK = {
  dunstan: '0.1',
  headCommit: GL_HEAD,
  filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
};

function scenario(): GitLabScenario {
  return { mr: baseMergeRequest(), diffs: baseDiffs() };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dunstan-mcp-gitlab-'));
});

async function connect(env: Record<string, string | undefined>, s = scenario()) {
  const fake = fakeGitLab(s);
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

const SUBJECT = { gitlabProject: GL_PROJECT, mergeRequest: 1 };

describe('dunstan_check_handback on a GitLab merge request', () => {
  it('takes either subject: none of its members is required', async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === TOOL_NAME)?.inputSchema as {
      properties: Record<string, { description?: string }>;
      required?: string[];
    };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['gitlabProject', 'mergeRequest', 'gitlabHost']),
    );
    expect(schema.required ?? []).toEqual([]);
    expect(schema.properties.gitlabProject?.description).toMatch(/GITLAB_TOKEN/);
    expect(schema.properties.repository?.description).toMatch(/GITHUB_TOKEN/);
  });

  it('tells an agent it can give either subject, and which token each reads', async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();
    const description = tools.find((t) => t.name === TOOL_NAME)?.description ?? '';
    for (const word of [
      'repository',
      'pullRequest',
      'GITHUB_TOKEN',
      'gitlabProject',
      'mergeRequest',
      'gitlabHost',
      'GITLAB_TOKEN',
    ]) {
      expect(description).toContain(word);
    }
    expect(client.getInstructions()).toMatch(/gitlabProject and mergeRequest/);
  });

  it('checks a block on gitlab.com: a GitLab record, read with GITLAB_TOKEN only', async () => {
    const { call, requests } = await connect({ GITLAB_TOKEN, GITHUB_TOKEN });
    const outPath = join(dir, 'r.json');
    const { result, text } = await call({ ...SUBJECT, block: BLOCK, outPath });
    expect(result.isError).toBeFalsy();
    expect(text[0]).toMatch(/^verdict: pass\n/);
    const record = JSON.parse(text[2] as string);
    expect(readFileSync(outPath, 'utf8')).toBe(text[2]);
    expect(record.predicate.subject.forge).toEqual({ kind: 'gitlab', host: DEFAULT_GITLAB_HOST });
    expect(record.predicate.report.source).toEqual({
      kind: 'api',
      locator: `mcp ${TOOL_NAME}#block`,
    });
    // No job is excluded: the caller is an agent, not a CI job.
    expect(text[2]).not.toMatch(/"excludedIds":\s*\[\s*[0-9]/);
    expect(requests.length).toBeGreaterThan(0);
    for (const q of requests) {
      expect(q.url.startsWith('https://gitlab.com/api/v4/')).toBe(true);
      expect(q.headers.authorization).toBe(`Bearer ${GITLAB_TOKEN}`);
    }
    for (const t of text) {
      expect(t).not.toContain(GITLAB_TOKEN);
      expect(t).not.toContain(GITHUB_TOKEN);
    }
  });

  it('reads a self-managed host given as gitlabHost, and sends the token only there', async () => {
    const { call, requests } = await connect({ GITLAB_TOKEN, GITHUB_TOKEN });
    const { result, text } = await call({
      ...SUBJECT,
      gitlabHost: 'gitlab.example.com',
      report: `Done.\n\n\`\`\`dunstan-handback\n${JSON.stringify(BLOCK)}\n\`\`\`\n`,
    });
    expect(result.isError).toBeFalsy();
    const record = JSON.parse(text[2] as string);
    expect(record.predicate.subject.forge).toEqual({ kind: 'gitlab', host: 'gitlab.example.com' });
    expect(record.predicate.report.source.locator).toBe(`mcp ${TOOL_NAME}#report`);
    for (const q of requests) {
      expect(new URL(q.url).host).toBe('gitlab.example.com');
      expect(q.headers.authorization).toBe(`Bearer ${GITLAB_TOKEN}`);
    }
  });

  it('never sends GITHUB_TOKEN to GitLab: without GITLAB_TOKEN the read is anonymous, and the notes say so', async () => {
    const { call, requests } = await connect({ GITHUB_TOKEN });
    const { result, text, err } = await call({ ...SUBJECT, block: BLOCK });
    expect(result.isError).toBeFalsy();
    expect(requests.length).toBeGreaterThan(0);
    for (const q of requests) expect(q.headers.authorization).toBeUndefined();
    expect(text[0]).toMatch(/note: GITLAB_TOKEN is not set; read anonymously\n/);
    expect(text[0]).not.toMatch(/GITHUB_TOKEN/);
    expect(text[0]).toMatch(/note: .*tests claim.*GITLAB_TOKEN.*public project/);
    expect(err()).toMatch(/GITLAB_TOKEN is not set; reading anonymously/);
  });

  it('with GITLAB_TOKEN set, gives no token note', async () => {
    const { call } = await connect({ GITLAB_TOKEN });
    const { text } = await call({ ...SUBJECT, block: BLOCK });
    expect(text[0]).not.toMatch(/note: /);
  });

  it('returns an unreadable merge request as a tool error, never a verdict', async () => {
    const { call } = await connect({ GITLAB_TOKEN }, { ...scenario(), mrStatus: 404 });
    const { result, text } = await call({ ...SUBJECT, block: BLOCK });
    expect(result.isError).toBe(true);
    expect(text.join('')).toMatch(/not a verdict/);
    expect(text.join('')).not.toMatch(/internal error/);
  });

  it.each([
    [
      'both subjects',
      { repository: 'example-org/example-repo', pullRequest: 7, ...SUBJECT },
      /exactly one subject/,
    ],
    [
      'a GitHub member beside a GitLab subject',
      { pullRequest: 7, ...SUBJECT },
      /exactly one subject/,
    ],
    [
      'neither subject',
      {},
      /give a subject: repository and pullRequest.*gitlabProject and mergeRequest/,
    ],
    ['gitlabProject without mergeRequest', { gitlabProject: GL_PROJECT }, /mergeRequest/],
    ['mergeRequest without gitlabProject', { mergeRequest: 1 }, /gitlabProject/],
    ['gitlabHost alone', { gitlabHost: 'gitlab.example.com' }, /gitlabProject and mergeRequest/],
    ['repository without pullRequest', { repository: 'example-org/example-repo' }, /pullRequest/],
    ['pullRequest without repository', { pullRequest: 7 }, /repository/],
    ['a bad project path', { gitlabProject: 'nope', mergeRequest: 1 }, /gitlabProject/],
    [
      'a project path with a scheme',
      { gitlabProject: 'https://gitlab.com/a/b', mergeRequest: 1 },
      /gitlabProject/,
    ],
    ['a bad host', { ...SUBJECT, gitlabHost: 'https://gitlab.example.com' }, /gitlabHost/],
    ['a host with a port', { ...SUBJECT, gitlabHost: 'gitlab.example.com:8443' }, /gitlabHost/],
    ['mergeRequest 0', { gitlabProject: GL_PROJECT, mergeRequest: 0 }, /mergeRequest/],
    [
      'mergeRequest not an integer',
      { gitlabProject: GL_PROJECT, mergeRequest: 1.5 },
      /mergeRequest/,
    ],
    [
      'mergeRequest past the safe integers',
      { gitlabProject: GL_PROJECT, mergeRequest: 2 ** 53 },
      /mergeRequest/,
    ],
  ])('refuses %s as an input error, reading nothing', async (_, subject, message) => {
    const { call, requests } = await connect({ GITLAB_TOKEN, GITHUB_TOKEN });
    const { result, text } = await call({ ...subject, block: BLOCK });
    expect(result.isError).toBe(true);
    expect(text.join('')).toMatch(message);
    expect(text.join('')).not.toMatch(/verdict: (pass|fail|unverifiable)/);
    expect(text.join('')).not.toMatch(/internal error/);
    expect(requests).toEqual([]);
  });
});

// The local-model proposer (spec D.14, "Proposing patterns"), against a stand-in for a local
// Ollama-compatible server: only a loopback endpoint is used, only paths are sent, each answered
// pattern is checked and counted, and the model's digest travels with the proposal.

import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git, isolateGit, write } from '../__tests__/git-repo.js';
import { evalMain } from '../eval/main.js';
import {
  loopbackEndpoint,
  ProposeError,
  proposalText,
  proposeTestPaths,
  uncoveredDirectories,
} from './test-paths.js';

isolateGit();

const DIGEST = 'f'.repeat(64);
const PATHS = [
  'src/sum.ts',
  'src/sum.test.ts',
  'src/x/y.spec.tsx',
  'tests/fixtures/a.json',
  'README.md',
];

// A stand-in local server: /api/tags lists `models`, /api/generate answers `answer`. Every request
// is kept.
function server(answer: unknown, models = [{ name: 'coder:latest', digest: DIGEST }]) {
  const requests: { url: string; body?: unknown }[] = [];
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({
      url: url.href,
      ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
    });
    if (url.pathname === '/api/tags') return Response.json({ models });
    if (url.pathname === '/api/generate') {
      return Response.json({
        response: typeof answer === 'string' ? answer : JSON.stringify(answer),
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetch: fetchFn, requests };
}

describe('loopbackEndpoint', () => {
  it('takes only http on a loopback host, never a hosted model', () => {
    for (const ok of ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434']) {
      expect(loopbackEndpoint(ok).origin).toBe(new URL(ok).origin);
    }
    for (const bad of [
      'https://api.example.com',
      'http://10.0.0.5:11434',
      'https://127.0.0.1:11434',
      'http://127.0.0.1.example.com',
      'not a url',
    ]) {
      expect(() => loopbackEndpoint(bad), bad).toThrow(ProposeError);
    }
  });
});

describe('proposeTestPaths', () => {
  it('sends the paths only, checks each pattern, counts its matches, and keeps the digest', async () => {
    const s = server({
      patterns: ['*.{test,spec}.{ts,tsx}', 'tests/**', '*.test.ts', '/abs', 42, '*_test.go'],
    });
    const p = await proposeTestPaths(PATHS, { model: 'coder', fetch: s.fetch });
    expect(p.proposer).toEqual({
      kind: 'local-model',
      model: 'coder',
      digest: DIGEST,
      endpoint: 'http://127.0.0.1:11434',
    });
    expect(p.patterns).toEqual([
      { pattern: '*.{test,spec}.{ts,tsx}', matches: 2 },
      { pattern: 'tests/**', matches: 1 },
      { pattern: '*.test.ts', matches: 1 },
      { pattern: '*_test.go', matches: 0 },
    ]);
    expect(p.rejected).toEqual([
      { pattern: '/abs', problem: 'starts with / or !' },
      { pattern: '42', problem: 'is not a string' },
    ]);
    expect(p.paths).toEqual({ total: 5, sent: 5 });
    // src/ and tests/ hold a matched path; no top-level directory is left uncovered.
    expect(p.uncovered).toEqual([]);
    // Every request went to the local server; the prompt names each path and holds nothing else of
    // the repository.
    expect(s.requests.every((r) => r.url.startsWith('http://127.0.0.1:11434/'))).toBe(true);
    const body = s.requests.find((r) => r.url.endsWith('/api/generate'))?.body as {
      prompt: string;
      options: { temperature: number };
    };
    expect(body.options.temperature).toBe(0);
    for (const path of PATHS) expect(body.prompt).toContain(`\n${path}`);
    const text = proposalText(p);
    expect(text).toContain(`proposed by coder (digest ${DIGEST})`);
    expect(text).toContain('*_test.go  (matches no tracked path)');
    expect(text).toContain('          test-paths: |\n            *.{test,spec}.{ts,tsx}');
  });

  it('lists the largest top-level directories no pattern touches, for the reviewer', async () => {
    const paths = [
      ...PATHS,
      'fixtures/a/input.json',
      'fixtures/a/expected.json',
      'fixtures/b/input.json',
      'docs/usage.md',
    ];
    const p = await proposeTestPaths(paths, {
      model: 'coder',
      fetch: server({ patterns: ['*.test.ts'] }).fetch,
    });
    expect(p.uncovered).toEqual([
      { dir: 'fixtures/', paths: 3 },
      { dir: 'docs/', paths: 1 },
      { dir: 'tests/', paths: 1 },
    ]);
    expect(proposalText(p)).toContain(
      'missed:\n  fixtures/  (3 paths)\n  docs/  (1 paths)\n  tests/  (1 paths)\n',
    );
    expect(uncoveredDirectories(paths, ['**'])).toEqual([]);
  });

  it('refuses a model the server does not list with a digest, and an answer that is not JSON', async () => {
    await expect(
      proposeTestPaths(PATHS, { model: 'other', fetch: server({ patterns: [] }).fetch }),
    ).rejects.toThrow(/no local model other/);
    await expect(
      proposeTestPaths(PATHS, { model: 'coder', fetch: server('tests/** maybe').fetch }),
    ).rejects.toThrow(/did not answer with JSON/);
    await expect(
      proposeTestPaths(PATHS, { model: 'coder', fetch: server({ files: [] }).fetch }),
    ).rejects.toThrow(/no "patterns" list/);
  });

  it('says so when the local server is not running', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(proposeTestPaths(PATHS, { model: 'coder', fetch: down })).rejects.toThrow(
      /did not answer \(fetch failed\): is it running\?/,
    );
  });
});

describe('dunstan-eval propose-test-paths', () => {
  it("reads the checkout's tracked paths and writes the proposal with --out", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dunstan-propose-')));
    git(dir, 'init', '-q');
    for (const path of PATHS) write(dir, path, 'x\n');
    write(dir, 'untracked.test.ts', 'x\n');
    git(dir, 'add', ...PATHS);
    const s = server({ patterns: ['*.test.ts'] });
    let out = '';
    const code = await evalMain(
      ['propose-test-paths', '--model', 'coder', '--dir', dir, '--out', join(dir, 'p.json')],
      { out: (t) => (out += t), err: (t) => (out += t), fetch: s.fetch },
    );
    expect(code).toBe(0);
    expect(out).toContain('*.test.ts  (1 paths)');
    const saved = JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8'));
    expect(saved.paths).toEqual({ total: 5, sent: 5 });
  });

  it('refuses a hosted endpoint before it reads anything', async () => {
    let err = '';
    const s = server({ patterns: [] });
    const code = await evalMain(
      ['propose-test-paths', '--model', 'coder', '--endpoint', 'https://api.example.com'],
      { out: () => {}, err: (t) => (err += t), fetch: s.fetch },
    );
    expect(code).toBe(3);
    expect(err).toContain('never a hosted one');
    expect(s.requests).toEqual([]);
  });
});

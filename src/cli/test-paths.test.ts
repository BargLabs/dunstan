// Test paths (DRAFT 0.2.0, spec D.14) through `dunstan check --test-paths`: the patterns are recorded
// as evidence, the record is a DRAFT one and verifies offline, the claims and verdict are those of
// the same check without them, and each changed file a pattern matches is printed as context.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { basePullRequest, fakeGitHub, HEAD, REPO } from '../__tests__/fake-github.js';
import type { FilesEvidence } from '../check/types.js';
import type { DunstanRecord } from '../record/build.js';
import { DRAFT_PREDICATE_TYPE, PREDICATE_TYPE } from '../spec/constants.js';
import { contextFlags, contextText } from './context.js';
import { main } from './main.js';

const FILES = [
  { filename: 'src/sum.ts', status: 'modified' },
  { filename: 'src/sum.test.ts', status: 'modified' },
  { filename: 'tests/old_test.py', status: 'removed' },
];
const BLOCK = {
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: FILES.map((f) => f.filename),
};
const BODY = `Done.\n\n\`\`\`dunstan-handback\n${JSON.stringify(BLOCK)}\n\`\`\`\n`;

async function check(flags: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'dunstan-test-paths-'));
  try {
    const out = join(dir, 'r.json');
    let text = '';
    const fake = fakeGitHub({
      pr: basePullRequest({ body: BODY, changed_files: 3 }),
      files: FILES,
    });
    const io = {
      out: (t: string) => {
        text += t;
      },
      err: (t: string) => {
        text += t;
      },
      env: { GITHUB_TOKEN: 'test-token' },
      artifact: import.meta.url,
      fetch: fake.fetch,
      readStdin: () => new Uint8Array(),
    };
    const code = await main(
      ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out, ...flags],
      io,
    );
    if (code === 3) return { code, text, record: undefined, verified: undefined };
    const record = JSON.parse(readFileSync(out, 'utf8')) as DunstanRecord;
    const verified = await main(['verify', out], { ...io, out: () => {}, err: () => {} });
    return { code, text, record, verified };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dunstan check --test-paths', () => {
  it('is off by default: a 0.1 record with no test file context', async () => {
    const r = await check([]);
    expect(r.record?.predicateType).toBe(PREDICATE_TYPE);
    expect(r.record?.predicate.evidence).not.toHaveProperty('testPaths');
    expect(r.text).not.toContain('test file');
  });

  it('records the patterns, keeps the claims and verdict, and lists each changed test file', async () => {
    const off = await check([]);
    const on = await check(['--test-paths', '*.test.ts', '--test-paths', '*_test.py']);
    expect(on.code).toBe(off.code);
    expect(on.verified).toBe(0);
    const p = on.record?.predicate;
    expect(on.record?.predicateType).toBe(DRAFT_PREDICATE_TYPE);
    expect(p?.evidence.testPaths).toEqual({ patterns: ['*.test.ts', '*_test.py'] });
    expect(p?.claims).toEqual(off.record?.predicate.claims);
    expect(p?.verdict).toBe(off.record?.predicate.verdict);
    expect(on.text).toContain(
      'context (not part of the verdict):\n' +
        '  test file changed by this pull request: src/sum.test.ts (modified)\n' +
        '  test file changed by this pull request: tests/old_test.py (removed)\n',
    );
  });

  it('refuses a pattern that is not a test path, before it reads anything', async () => {
    const r = await check(['--test-paths', '/abs/*.ts']);
    expect(r.code).toBe(3);
    expect(r.text).toContain('--test-paths: test path "/abs/*.ts" starts with / or !');
  });
});

describe('the test file context, from the file list', () => {
  const withFiles = async (files: FilesEvidence) => {
    const r = await check(['--test-paths', '*.test.ts']);
    const record = r.record as DunstanRecord;
    record.predicate.evidence.files = files;
    return contextFlags(record).map(contextText);
  };

  it('says more test files may be unlisted when the list is incomplete', async () => {
    expect(
      await withFiles({
        status: 'ok',
        complete: false,
        entries: [{ path: 'src/sum.test.ts', status: 'modified' }],
      }),
    ).toEqual([
      'workflow changes unknown: the file list cannot show that no workflow changed (file_list_truncated)',
      'test file changed by this pull request: src/sum.test.ts (modified)',
      'test file changes unknown: the file list cannot show every changed test file (file_list_truncated)',
    ]);
  });

  it('says both are unknown when the list is unreadable', async () => {
    expect(await withFiles({ status: 'unreadable', source: 'pull_request_files' })).toEqual([
      'workflow changes unknown: the file list cannot show that no workflow changed (source_unreadable:pull_request_files)',
      'test file changes unknown: the file list cannot show every changed test file (source_unreadable:pull_request_files)',
    ]);
  });

  it('matches a renamed test file by its previous path', async () => {
    expect(
      await withFiles({
        status: 'ok',
        complete: true,
        entries: [{ path: 'src/sum.spec.ts', status: 'renamed', previousPath: 'src/sum.test.ts' }],
      }),
    ).toEqual([
      'test file changed by this pull request: src/sum.spec.ts (renamed from src/sum.test.ts)',
    ]);
  });
});

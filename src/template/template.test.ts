// dunstan template against git repositories built here, in temporary directories. Git runs with no
// global or system configuration, and never looks above the temporary directory for a repository.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkScope } from '../check/checks.js';
import type { Block, Evidence, FileEntry } from '../check/types.js';
import { main } from '../cli/main.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { suggestText } from '../suggest/suggest.js';

const ENV = {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CEILING_DIRECTORIES: realpathSync(tmpdir()),
};
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

const tempDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'dunstan-template-')));

// main, then the branch `feature` from it, then main moves on (its change is not the branch's), and
// origin/HEAD names origin/main as the remote's default branch. HEAD is `feature`.
function repository(): string {
  const dir = tempDir();
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'README.md', 'base\n');
  write(dir, 'src/keep.ts', 'export const keep = 1;\n');
  write(dir, 'src/old.ts', 'export const moved = "this file is renamed on the rename branch";\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'branch', 'branch-point');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'src/keep.ts', 'export const keep = 2;\n');
  write(dir, 'docs/new.md', 'new\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'feature');
  git(dir, 'checkout', '-q', 'main');
  write(dir, 'README.md', 'main moved on\n');
  git(dir, 'commit', '-q', '-am', 'main moves on');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git(dir, 'checkout', '-q', 'feature');
  return dir;
}

async function run(cwd: string, ...args: string[]) {
  let out = '';
  let err = '';
  const code = await main(['template', ...args], {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env: {},
    artifact: import.meta.url,
    readStdin: () => new Uint8Array(),
    cwd,
  });
  return { code, out, err };
}

const fenceOf = (block: object) =>
  `\`\`\`dunstan-handback\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;

const NOTE_TESTS =
  'dunstan: tests are not declared. To declare a run, add --tests-junit <JUnit XML file> with --tests-command, --tests-workflow, --tests-job, --tests-artifact and --tests-artifact-path naming the CI record its counts are checked against.\n';
const NOTE_REFERENCES =
  'dunstan: references and mergedAt are not filled: add each issue this pull request closes or cites yourself, and leave mergedAt out until it is merged.\n';
const noteHead = (head: string, branch: string, base: string, mergeBase: string) =>
  `dunstan: this block describes the local HEAD ${head} on ${branch}, against ${base} (merge base ${mergeBase}). Pushing more commits makes it stale, and the gate then reports head_mismatch: run dunstan template again after your last push.\n`;

describe('dunstan template', () => {
  it("prints the block for HEAD against its merge base with the remote's default branch", async () => {
    const dir = repository();
    const head = git(dir, 'rev-parse', 'HEAD');
    const mergeBase = git(dir, 'rev-parse', 'branch-point');
    const r = await run(dir);
    expect(r.code).toBe(0);
    // README.md changed on main after the branch point: it is not this branch's change.
    expect(r.out).toBe(
      [
        '```dunstan-handback',
        '{',
        '  "dunstan": "0.1",',
        `  "headCommit": "${head}",`,
        '  "filesChanged": [',
        '    "docs/new.md",',
        '    "src/keep.ts"',
        '  ]',
        '}',
        '```',
        '',
      ].join('\n'),
    );
    expect(r.err).toBe(
      noteHead(head, 'feature', 'origin/main', mergeBase) + NOTE_TESTS + NOTE_REFERENCES,
    );
    // What it prints is a block the gate reads as found.
    expect(extractHandbackBlock(r.out).status).toBe('found');
  });

  it('takes the base from --base', async () => {
    const dir = repository();
    const r = await run(dir, '--base', 'main');
    expect(r.code).toBe(0);
    expect(r.err).toContain(' on feature, against main (merge base ');
    expect(r.out).toContain('"docs/new.md",\n    "src/keep.ts"\n');
  });

  it('lists a rename by its old and its new path, which the scope check passes either way GitHub pairs it', async () => {
    const dir = repository();
    git(dir, 'checkout', '-q', '-b', 'rename', 'branch-point');
    git(dir, 'mv', 'src/old.ts', 'src/new-name.ts');
    git(dir, 'commit', '-q', '-m', 'rename');
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = await run(dir);
    expect(r.code).toBe(0);
    const block: Block = {
      dunstan: '0.1',
      headCommit: head,
      filesChanged: ['src/new-name.ts', 'src/old.ts'],
    };
    expect(r.out).toBe(fenceOf(block));

    const evidence = (entries: FileEntry[]): Evidence => ({
      pullRequest: {
        status: 'ok',
        number: 1,
        state: 'open',
        merged: false,
        mergedAt: null,
        headSha: head,
        mergeSha: null,
        changedFiles: entries.length,
      },
      files: { status: 'ok', complete: true, entries },
      sources: [],
    });
    const paired = evidence([
      { path: 'src/new-name.ts', status: 'renamed', previousPath: 'src/old.ts' },
    ]);
    const split = evidence([
      { path: 'src/new-name.ts', status: 'added' },
      { path: 'src/old.ts', status: 'removed' },
    ]);
    for (const e of [paired, split]) {
      const rows = checkScope(block, e);
      expect(rows.map((row) => [row.id, row.verdict])).toEqual([
        ['scope:/filesChanged/0', 'pass'],
        ['scope:/filesChanged/1', 'pass'],
      ]);
    }
  });

  it('fills tests from a JUnit file, naming the CI record its counts are checked against', async () => {
    const dir = repository();
    const head = git(dir, 'rev-parse', 'HEAD');
    const junit = join(tempDir(), 'junit.xml');
    writeFileSync(
      junit,
      '<testsuites><testsuite name="s"><testcase name="a"/><testcase name="b"><failure/></testcase><testcase name="c"><skipped/></testcase></testsuite></testsuites>',
    );
    const r = await run(
      dir,
      '--tests-junit',
      junit,
      '--tests-command',
      'pnpm test',
      '--tests-workflow',
      '.github/workflows/ci.yml',
      '--tests-job',
      'test',
      '--tests-artifact',
      'junit-report',
      '--tests-artifact-path',
      'reports/junit.xml',
    );
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      fenceOf({
        dunstan: '0.1',
        headCommit: head,
        filesChanged: ['docs/new.md', 'src/keep.ts'],
        tests: [
          {
            command: 'pnpm test',
            count: 2,
            failures: 1,
            record: {
              kind: 'junit',
              workflow: '.github/workflows/ci.yml',
              job: 'test',
              artifact: 'junit-report',
              path: 'reports/junit.xml',
            },
          },
        ],
      }),
    );
    expect(r.err).toContain(
      `dunstan: tests: 2 executed and 1 failed in ${junit}. The gate checks these counts against reports/junit.xml in the artifact junit-report of job test in .github/workflows/ci.yml at the head commit, not against the local file.\n`,
    );
    expect(r.err).not.toContain(NOTE_TESTS);
  });

  it.each([
    [
      ['--tests-junit', 'junit.xml', '--tests-job', 'test'],
      'dunstan: --tests-junit needs the CI record its counts are checked against: --tests-command, --tests-workflow, --tests-artifact, --tests-artifact-path\n',
    ],
    [['--tests-job', 'test'], 'dunstan: --tests-job goes with --tests-junit <JUnit XML file>\n'],
  ])('refuses an incomplete test record %j as a usage error', async (args, message) => {
    const r = await run(repository(), ...args);
    expect(r.code).toBe(3);
    expect(r.out).toBe('');
    expect(r.err.startsWith(message)).toBe(true);
  });

  it('refuses a JUnit file it cannot count, and a record the block schema refuses', async () => {
    const dir = repository();
    const bad = join(tempDir(), 'bad.xml');
    writeFileSync(bad, '<testsuite><testcase></testsuite>');
    const record = (junit: string, workflow: string) => [
      '--tests-junit',
      junit,
      '--tests-command',
      'pnpm test',
      '--tests-workflow',
      workflow,
      '--tests-job',
      'test',
      '--tests-artifact',
      'junit-report',
      '--tests-artifact-path',
      'reports/junit.xml',
    ];
    const r = await run(dir, ...record(bad, '.github/workflows/ci.yml'));
    expect(r).toEqual({
      code: 3,
      out: '',
      err: `dunstan: --tests-junit ${bad}: unbalanced </testsuite> at offset 33\n`,
    });

    const good = join(tempDir(), 'good.xml');
    writeFileSync(good, '<testsuite><testcase name="a"/></testsuite>');
    const s = await run(dir, ...record(good, '/abs/ci.yml'));
    expect(s.code).toBe(3);
    expect(s.out).toBe('');
    expect(s.err).toMatch(/^dunstan: the block would be invalid: \/tests\/0\/record\/workflow /);
  });

  it('says when the working tree has changes the block does not carry', async () => {
    const dir = repository();
    write(dir, 'src/uncommitted.ts', 'x\n');
    const r = await run(dir);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('uncommitted');
    expect(r.err).toContain(
      'dunstan: the working tree has changes that are not committed; they are not in this block.\n',
    );
  });

  it('says when HEAD changes no file', async () => {
    const dir = repository();
    git(dir, 'checkout', '-q', '-b', 'empty', 'branch-point');
    const r = await run(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain('"filesChanged": []');
    expect(r.err).toContain('dunstan: HEAD changes no file against the merge base.\n');
  });

  it('gives a block that, with the prose that matches it, leaves nothing to suggest', async () => {
    const r = await run(repository());
    const report = `Updated src/keep.ts and added docs/new.md.\n\n${r.out}`;
    expect(suggestText(report)).toContain(
      '\nThe prose appears to make no claim the block does not declare.',
    );
  });
});

describe('dunstan template fails loud and prints no block', () => {
  const refused = async (cwd: string, args: string[], message: string) => {
    const r = await run(cwd, ...args);
    expect(r).toEqual({ code: 3, out: '', err: `dunstan: ${message}\n` });
  };

  it('outside a git repository', async () => {
    const dir = tempDir();
    await refused(dir, [], `not a git repository: ${dir}`);
  });

  it('when HEAD has no commit', async () => {
    const dir = tempDir();
    git(dir, 'init', '-q', '-b', 'main');
    await refused(dir, [], 'HEAD cannot be read: the branch has no commit yet');
  });

  it('when HEAD is detached', async () => {
    const dir = repository();
    git(dir, 'checkout', '-q', '--detach');
    const head = git(dir, 'rev-parse', 'HEAD');
    await refused(
      dir,
      [],
      `HEAD is detached at ${head}: check out the branch the pull request is from`,
    );
  });

  it('when --base does not resolve', async () => {
    await refused(
      repository(),
      ['--base', 'origin/nope'],
      'the base origin/nope cannot be resolved',
    );
    await refused(repository(), ['--base=--all'], '--base --all is not a ref');
  });

  it("when the remote's default branch is not known", async () => {
    const dir = repository();
    git(dir, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
    await refused(
      dir,
      [],
      "the remote's default branch cannot be resolved (refs/remotes/origin/HEAD is not set): pass --base <ref>, or run git remote set-head origin --auto",
    );
  });

  it('when HEAD and the base have no merge base', async () => {
    const dir = repository();
    git(dir, 'checkout', '-q', '--orphan', 'lone');
    git(dir, 'commit', '-q', '-m', 'unrelated');
    await refused(dir, [], 'HEAD and the base origin/main have no merge base');
  });
});

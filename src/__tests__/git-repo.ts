// A git repository built in a temporary directory, for tests that run `dunstan template`. Git runs
// with no global or system configuration and never looks above the temporary directory.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';

const ENV = {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CEILING_DIRECTORIES: realpathSync(tmpdir()),
};

// Call once at the top of a test file.
export function isolateGit(): void {
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
}

export function git(cwd: string, ...args: string[]): string {
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

export function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

// main, then the branch `feature` changing src/a.ts and adding src/b.ts, checked out; origin/HEAD
// names origin/main, and `origin` is the GitHub repository given. With `pushed`, the remote-tracking
// branch origin/feature is at HEAD, as after `git push`.
export function featureRepository(
  origin: string,
  { pushed }: { pushed: boolean } = { pushed: true },
): { dir: string; head: string } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dunstan-git-')));
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'src/a.ts', 'export const a = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write(dir, 'src/a.ts', 'export const a = 2;\n');
  write(dir, 'src/b.ts', 'export const b = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'feature');
  const head = git(dir, 'rev-parse', 'HEAD');
  if (pushed) git(dir, 'update-ref', 'refs/remotes/origin/feature', head);
  return { dir, head };
}

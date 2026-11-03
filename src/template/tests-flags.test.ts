// dunstan template's three ways to declare tests: --tests-ci (read from the CI record, online),
// --tests-local (a local run, declared as one) and --tests-junit (a local file, with the CI record
// its counts are compared with). Without --tests-ci it reads nothing from the network.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeGitHub, junitXml, REPO } from '../__tests__/fake-github.js';
import { featureRepository, isolateGit } from '../__tests__/git-repo.js';
import type { Block } from '../check/types.js';
import { main, USAGE } from '../cli/main.js';
import { readBlockContent } from '../spec/extract.js';

isolateGit();

const ORIGIN = `https://github.com/${REPO}.git`;

async function run(cwd: string, ...args: string[]) {
  let out = '';
  let err = '';
  const fake = fakeGitHub({ pr: { number: 7 } });
  const code = await main(['template', ...args], {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env: { GITHUB_TOKEN: 'test-token' },
    artifact: import.meta.url,
    fetch: fake.fetch,
    readStdin: () => new Uint8Array(),
    cwd,
  });
  return { code, out, err, requests: fake.requests };
}

const blockOf = (out: string): Block => {
  const content = /```dunstan-handback\n([\s\S]*?)\n```/.exec(out)?.[1] as string;
  const read = readBlockContent(content);
  expect(read.status).toBe('found');
  return (read as unknown as { value: Block }).value;
};

function junitFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'dunstan-junit-')), 'junit.xml');
  writeFileSync(path, junitXml(['pass', 'pass', 'fail', 'skip']));
  return path;
}

describe('--tests-local', () => {
  it('declares the local counts with record {"kind": "local"} and says the gate reports it unverifiable', async () => {
    const { dir } = featureRepository(ORIGIN);
    const r = await run(dir, '--tests-local', junitFile(), '--tests-command', 'pnpm test');
    expect(r.code).toBe(0);
    expect(blockOf(r.out).tests).toEqual([
      { command: 'pnpm test', count: 3, failures: 1, record: { kind: 'local' } },
    ]);
    expect(r.err).toMatch(/unverifiable \(local_run_not_in_record\) until CI publishes a record/);
    expect(r.err).toMatch(/docs\/ci-test-records\.md/);
    expect(r.requests).toEqual([]);
  });

  it('needs --tests-command and takes no CI record flag', async () => {
    const { dir } = featureRepository(ORIGIN);
    const missing = await run(dir, '--tests-local', junitFile());
    expect(missing.code).toBe(3);
    expect(missing.err).toMatch(/--tests-local needs --tests-command/);
    const extra = await run(
      dir,
      '--tests-local',
      junitFile(),
      '--tests-command',
      'x',
      '--tests-workflow',
      '.github/workflows/ci.yml',
    );
    expect(extra.code).toBe(3);
    expect(extra.err).toMatch(/--tests-workflow does not go with --tests-local/);
  });
});

describe('--tests-junit', () => {
  it('declares the local counts against the five record flags, as before, and says CI is compared', async () => {
    const { dir } = featureRepository(ORIGIN);
    const r = await run(
      dir,
      '--tests-junit',
      junitFile(),
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
    expect(blockOf(r.out).tests).toEqual([
      {
        command: 'pnpm test',
        count: 3,
        failures: 1,
        record: {
          kind: 'junit',
          workflow: '.github/workflows/ci.yml',
          job: 'test',
          artifact: 'junit-report',
          path: 'reports/junit.xml',
        },
      },
    ]);
    expect(r.err).toMatch(/these local counts will be compared with CI's/);
    expect(r.requests).toEqual([]);
  });
});

describe('--tests-ci', () => {
  it('needs --tests-command, --tests-workflow and --tests-job', async () => {
    const { dir } = featureRepository(ORIGIN);
    const r = await run(dir, '--tests-ci', '--tests-command', 'x');
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/--tests-ci needs --tests-workflow, --tests-job/);
    expect(r.requests).toEqual([]);
  });

  it('is one of three: --tests-ci, --tests-local and --tests-junit exclude each other', async () => {
    const { dir } = featureRepository(ORIGIN);
    const r = await run(dir, '--tests-ci', '--tests-local', junitFile(), '--tests-command', 'x');
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/one of --tests-ci, --tests-local or --tests-junit/);
  });

  it('takes --repo only with --tests-ci', async () => {
    const { dir } = featureRepository(ORIGIN);
    const r = await run(dir, '--repo', REPO);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/--repo goes with --tests-ci/);
  });
});

describe('without a tests flag', () => {
  it('reads nothing online, and the note names the three ways', async () => {
    const { dir } = featureRepository(ORIGIN);
    const r = await run(dir);
    expect(r.code).toBe(0);
    expect(blockOf(r.out).tests).toBeUndefined();
    expect(r.requests).toEqual([]);
    expect(r.err).toMatch(/--tests-ci/);
    expect(r.err).toMatch(/--tests-local/);
  });
});

describe('the usage text', () => {
  it('names --tests-ci, --tests-local and junit-merge', () => {
    expect(USAGE).toMatch(
      /--tests-ci --tests-command <cmd> --tests-workflow <path> --tests-job <name>/,
    );
    expect(USAGE).toMatch(/--tests-local <file> --tests-command <cmd>/);
    expect(USAGE).toMatch(/dunstan junit-merge <file>\.\.\. --out <file>/);
  });
});

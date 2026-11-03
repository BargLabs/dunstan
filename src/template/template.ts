// dunstan template: the mechanical fields of a handback block, filled from local git. `headCommit` is
// HEAD, `filesChanged` is HEAD's diff against its merge base with the base branch, and `dunstan` is
// the block version. `tests` is filled one of three ways the caller names: from the CI record at
// HEAD, read by the caller before (`--tests-ci`, src/template/tests-ci.ts, the one online read);
// from a local JUnit file declared as a local run (`--tests-local`, record `{"kind": "local"}`); or
// from a local JUnit file with the CI record its counts are checked against (`--tests-junit`).
// `references`, `checks` and `mergedAt` are never filled, because they are the agent's own
// assertions, CI may not have finished, and a pull request not yet merged has no merge time.
//
// Fail loud, never invent: when git cannot answer (no repository, a detached or unreadable HEAD, a
// base that does not resolve, no merge base) this throws and no block is printed. Git runs through
// execFileSync with an argument vector, as ssh-keygen does in src/record/sign.ts; no shell. This
// module reads no network.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareCodeUnits } from '../check/rows.js';
import type { Block, JunitRecord, TestRun } from '../check/types.js';
import { countJunit } from '../evidence/junit.js';
import { BLOCK_INFO_STRING, BLOCK_VERSION } from '../spec/constants.js';
import { readBlockContent } from '../spec/extract.js';
import type { CiTests } from './tests-ci.js';

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

export interface TestsFromJunit {
  kind: 'junit';
  // The local JUnit XML file the counts are read from.
  junit: string;
  command: string;
  // The CI record the gate compares the counts with (spec section 4, `tests[].record`).
  record: Omit<JunitRecord, 'kind'>;
}

// A run made only locally (spec 0.1.9): its counts, declared as such.
export interface TestsFromLocal {
  kind: 'local';
  junit: string;
  command: string;
}

// The CI record at HEAD, as src/template/tests-ci.ts read it.
export interface TestsFromCi {
  kind: 'ci';
  read: CiTests;
}

export type TestsSource = TestsFromJunit | TestsFromLocal | TestsFromCi;

export interface TemplateOptions {
  // The directory git runs in.
  cwd: string;
  // The ref the pull request merges into. Absent: the remote's default branch, origin/HEAD.
  base?: string | undefined;
  tests?: TestsSource | undefined;
}

export interface Template {
  block: Block;
  branch: string;
  base: string;
  mergeBase: string;
  // Lines for the caller to print beside the block, never inside it.
  notes: string[];
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[]): GitResult {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; status?: number };
    if (err.code === 'ENOENT') throw new TemplateError('git is not installed or not on PATH');
    if (typeof err.status !== 'number') throw new TemplateError(`git ${args[0]}: ${err.message}`);
    return { ok: false, stdout: err.stdout ?? '', stderr: (err.stderr ?? '').trim() };
  }
}

const SHA = /^[0-9a-f]{40}$/;

function commitOf(cwd: string, ref: string): string | undefined {
  const r = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  const sha = r.stdout.trim();
  return r.ok && SHA.test(sha) ? sha : undefined;
}

// The remote's default branch, as origin/HEAD names it: "origin/main".
function defaultBase(cwd: string): string {
  const r = git(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  const ref = r.stdout.trim();
  if (!r.ok || !ref.startsWith('refs/remotes/')) {
    throw new TemplateError(
      "the remote's default branch cannot be resolved (refs/remotes/origin/HEAD is not set): pass --base <ref>, or run git remote set-head origin --auto",
    );
  }
  return ref.slice('refs/remotes/'.length);
}

function localCounts(
  cwd: string,
  flag: string,
  file: string,
): { executed: number; failed: number } {
  try {
    return countJunit(readFileSync(resolve(cwd, file), 'utf8'));
  } catch (e) {
    throw new TemplateError(`${flag} ${file}: ${(e as Error).message}`);
  }
}

// The run the block declares, if any, and the note that says where its counts came from.
function testsFrom(cwd: string, tests: TestsSource): { run?: TestRun; notes: string[] } {
  if (tests.kind === 'ci') {
    return tests.read.status === 'settled'
      ? { run: tests.read.run, notes: tests.read.notes }
      : { notes: tests.read.notes };
  }
  if (tests.kind === 'local') {
    const counts = localCounts(cwd, '--tests-local', tests.junit);
    return {
      run: {
        command: tests.command,
        count: counts.executed,
        failures: counts.failed,
        record: { kind: 'local' },
      },
      notes: [
        `tests: ${counts.executed} executed and ${counts.failed} failed in ${tests.junit}, declared as a local run (record {"kind": "local"}). The gate reports them unverifiable (local_run_not_in_record) until CI publishes a record: publish one (docs/ci-test-records.md), then run dunstan template --tests-ci once CI has finished. Until then, say in the report that CI publishes no test record, and state no count in prose that the block does not declare.`,
      ],
    };
  }
  const counts = localCounts(cwd, '--tests-junit', tests.junit);
  const r = tests.record;
  return {
    run: {
      command: tests.command,
      count: counts.executed,
      failures: counts.failed,
      record: { kind: 'junit', ...r },
    },
    notes: [
      `tests: ${counts.executed} executed and ${counts.failed} failed in ${tests.junit}. The gate checks these counts against ${r.path} in the artifact ${r.artifact} of job ${r.job} in ${r.workflow} at the head commit, not against the local file: these local counts will be compared with CI's, and fail with count_mismatch where CI's run counted otherwise. dunstan template --tests-ci declares CI's counts instead.`,
    ],
  };
}

// The github.com repository `origin` names, as owner/name: an https, ssh or scp-style URL, with or
// without `.git`. Any other host, or no origin, is refused: the caller names one with --repo.
export function originRepository(cwd: string): string {
  const r = git(cwd, ['remote', 'get-url', 'origin']);
  const url = r.stdout.trim();
  if (!r.ok || url === '') {
    throw new TemplateError('there is no origin remote: pass --repo <owner/name>');
  }
  const m =
    /^(?:https:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)github\.com[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
      url,
    );
  if (m === null) {
    throw new TemplateError(
      `origin ${url} is not a github.com repository: pass --repo <owner/name>`,
    );
  }
  return `${m[1]}/${m[2]}`;
}

// Whether a remote-tracking branch holds `commit`, as far as the local refs know (a push from
// elsewhere is seen after git fetch).
export function isPushed(cwd: string, commit: string): boolean {
  const r = git(cwd, [
    'for-each-ref',
    '--contains',
    commit,
    '--format=%(refname)',
    'refs/remotes/',
  ]);
  return r.ok && r.stdout.trim() !== '';
}

// HEAD's commit, as templateBlock reads it, or a TemplateError.
export function headCommit(cwd: string): string {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw new TemplateError(`not a git repository: ${cwd}`);
  const head = commitOf(cwd, 'HEAD');
  if (head === undefined) {
    throw new TemplateError('HEAD cannot be read: the branch has no commit yet');
  }
  return head;
}

export function templateBlock(options: TemplateOptions): Template {
  const { cwd } = options;
  const head = headCommit(cwd);
  const symbolic = git(cwd, ['symbolic-ref', '--quiet', 'HEAD']);
  if (!symbolic.ok) {
    throw new TemplateError(
      `HEAD is detached at ${head}: check out the branch the pull request is from`,
    );
  }
  const branch = symbolic.stdout.trim().replace(/^refs\/heads\//, '');

  if (options.base?.startsWith('-')) throw new TemplateError(`--base ${options.base} is not a ref`);
  const base = options.base ?? defaultBase(cwd);
  const baseCommit = commitOf(cwd, base);
  if (baseCommit === undefined) throw new TemplateError(`the base ${base} cannot be resolved`);
  const mb = git(cwd, ['merge-base', baseCommit, head]);
  const mergeBase = mb.stdout.trim();
  if (!mb.ok || !SHA.test(mergeBase)) {
    throw new TemplateError(`HEAD and the base ${base} have no merge base`);
  }

  // Without rename detection a rename is its old path and its new path. The spec counts a renamed
  // file as declared when either is (section 7.3), so both pass whether GitHub pairs the rename or
  // lists a removal and an addition.
  const diff = git(cwd, [
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    '--no-relative',
    '--no-ext-diff',
    mergeBase,
    head,
  ]);
  if (!diff.ok) throw new TemplateError(`git diff ${mergeBase} ${head} failed: ${diff.stderr}`);
  const filesChanged = [...new Set(diff.stdout.split('\0').filter((p) => p !== ''))].sort(
    compareCodeUnits,
  );

  const block: Block = { dunstan: BLOCK_VERSION, headCommit: head, filesChanged };
  const tests = options.tests === undefined ? undefined : testsFrom(cwd, options.tests);
  if (tests?.run !== undefined) block.tests = [tests.run];

  // The block is read back as the gate reads one, so a template is never an invalid block.
  const read = readBlockContent(JSON.stringify(block));
  if (read.status !== 'found') {
    const errors = read.status === 'invalid' ? read.errors : [];
    throw new TemplateError(
      `the block would be invalid: ${errors.map((e) => [e.pointer, e.message].filter((x) => x).join(' ')).join('; ')}`,
    );
  }

  const notes = [
    `this block describes the local HEAD ${head} on ${branch}, against ${base} (merge base ${mergeBase}). Pushing more commits makes it stale, and the gate then reports head_mismatch: run dunstan template again after your last push.`,
  ];
  if (filesChanged.length === 0) notes.push('HEAD changes no file against the merge base.');
  const dirty = git(cwd, ['status', '--porcelain', '-z']);
  if (dirty.ok && dirty.stdout !== '') {
    notes.push('the working tree has changes that are not committed; they are not in this block.');
  }
  if (tests === undefined) {
    notes.push(
      "tests are not declared. To declare CI's counts, run dunstan template again with --tests-ci --tests-command <cmd> --tests-workflow <path> --tests-job <name> once CI has finished on your last push; it reads the JUnit record CI published (docs/ci-test-records.md). For a run made only locally, --tests-local <JUnit XML file> --tests-command <cmd> declares it as one. --tests-junit <file> with --tests-command, --tests-workflow, --tests-job, --tests-artifact and --tests-artifact-path declares a local file's counts against a CI record.",
    );
  } else {
    notes.push(...tests.notes);
  }
  notes.push(
    'references and mergedAt are not filled: add each issue this pull request closes or cites yourself, and leave mergedAt out until it is merged.',
    'checks are not filled: declare them yourself once CI has finished. checks.allSucceeded is true only if every counted check run concluded success, so a skipped or neutral run makes it false; checks.noneFailed is true if none concluded other than success, skipped or neutral and at least one succeeded.',
  );
  return { block, branch, base, mergeBase, notes };
}

// The fence, ready to paste into a report.
export function renderBlock(block: Block): string {
  return `\`\`\`${BLOCK_INFO_STRING}\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
}

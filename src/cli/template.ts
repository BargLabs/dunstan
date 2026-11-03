// dunstan template: prints a dunstan-handback fence filled from local git (src/template/). Standard
// output carries the fence and nothing else, so it can be pasted or appended as it is; the notes go
// to standard error. When git cannot answer, nothing is printed on standard output.
//
// Tests, one of three ways. --tests-ci reads the counts at HEAD from the CI record `dunstan check`
// reads (src/template/tests-ci.ts): the one read this command makes online, with GITHUB_TOKEN. When
// no single count settles it prints the block without tests, says why, and exits 2: the block is
// valid and printed, so this is not an error (3), and it is not the block that was asked for, so a
// script that pipes it into a report cannot take it for one with its tests (0). --tests-local and
// --tests-junit read a local JUnit file and nothing online.

import { parseArgs } from 'node:util';
import { GitHubClient } from '../evidence/http.js';
import {
  headCommit,
  isPushed,
  originRepository,
  renderBlock,
  type TestsSource,
  templateBlock,
} from '../template/template.js';
import { testsFromCi } from '../template/tests-ci.js';
import { REPOSITORY } from './check.js';
import { type CliIo, EXIT, UsageError } from './output.js';

const RECORD_FLAGS = [
  'tests-workflow',
  'tests-job',
  'tests-artifact',
  'tests-artifact-path',
] as const;

// The artifact and the file in it that docs/ci-test-records.md's recipes upload.
export const DEFAULT_ARTIFACT = 'dunstan-junit';
export const DEFAULT_ARTIFACT_PATH = 'junit.xml';

export async function template(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      base: { type: 'string' },
      'tests-ci': { type: 'boolean' },
      'tests-local': { type: 'string' },
      'tests-junit': { type: 'string' },
      'tests-command': { type: 'string' },
      repo: { type: 'string' },
      ...Object.fromEntries(RECORD_FLAGS.map((f) => [f, { type: 'string' as const }])),
    },
  });
  const v = values as Record<string, string | boolean | undefined>;
  const flag = (name: string) => v[name] as string | undefined;
  const ci = v['tests-ci'] === true;
  const modes = [ci, flag('tests-local') !== undefined, flag('tests-junit') !== undefined];
  if (modes.filter(Boolean).length > 1) {
    throw new UsageError('give one of --tests-ci, --tests-local or --tests-junit');
  }
  if (flag('repo') !== undefined && !ci) throw new UsageError('--repo goes with --tests-ci');
  const given = (['tests-command', ...RECORD_FLAGS] as const).filter((f) => flag(f) !== undefined);
  const cwd = io.cwd ?? process.cwd();

  let tests: TestsSource | undefined;
  if (ci) {
    const missing = (['tests-command', 'tests-workflow', 'tests-job'] as const).filter(
      (f) => flag(f) === undefined,
    );
    if (missing.length > 0) {
      throw new UsageError(`--tests-ci needs ${missing.map((f) => `--${f}`).join(', ')}`);
    }
    const repo = flag('repo');
    if (repo !== undefined && !REPOSITORY.test(repo)) {
      throw new UsageError('--repo must be <owner/name>');
    }
    // Git first: a repository git cannot answer for is refused before anything is read.
    const head = headCommit(cwd);
    const repository = repo ?? originRepository(cwd);
    const client = new GitHubClient({
      token: io.env.GITHUB_TOKEN,
      ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
      warn: (message) => io.err(`dunstan: ${message}\n`),
    });
    const read = await testsFromCi(client, {
      repository,
      headCommit: head,
      command: flag('tests-command') as string,
      pushed: isPushed(cwd, head),
      record: {
        kind: 'junit',
        workflow: flag('tests-workflow') as string,
        job: flag('tests-job') as string,
        artifact: flag('tests-artifact') ?? DEFAULT_ARTIFACT,
        path: flag('tests-artifact-path') ?? DEFAULT_ARTIFACT_PATH,
      },
    });
    tests = { kind: 'ci', read };
  } else if (flag('tests-local') !== undefined) {
    if (flag('tests-command') === undefined) {
      throw new UsageError('--tests-local needs --tests-command <cmd>');
    }
    const extra = RECORD_FLAGS.find((f) => flag(f) !== undefined);
    if (extra !== undefined) throw new UsageError(`--${extra} does not go with --tests-local`);
    tests = {
      kind: 'local',
      junit: flag('tests-local') as string,
      command: flag('tests-command') as string,
    };
  } else if (flag('tests-junit') !== undefined) {
    const missing = (['tests-command', ...RECORD_FLAGS] as const).filter(
      (f) => flag(f) === undefined,
    );
    if (missing.length > 0) {
      throw new UsageError(
        `--tests-junit needs the CI record its counts are checked against: ${missing.map((f) => `--${f}`).join(', ')}`,
      );
    }
    tests = {
      kind: 'junit',
      junit: flag('tests-junit') as string,
      command: flag('tests-command') as string,
      record: {
        workflow: flag('tests-workflow') as string,
        job: flag('tests-job') as string,
        artifact: flag('tests-artifact') as string,
        path: flag('tests-artifact-path') as string,
      },
    };
  } else if (given.length > 0) {
    throw new UsageError(`--${given[0]} goes with --tests-ci, --tests-local or --tests-junit`);
  }

  const t = templateBlock({ cwd, base: flag('base'), tests });
  io.out(renderBlock(t.block));
  for (const note of t.notes) io.err(`dunstan: ${note}\n`);
  return tests?.kind === 'ci' && tests.read.status === 'unsettled' ? EXIT.unverifiable : 0;
}

// dunstan template: prints a dunstan-handback fence filled from local git (src/template/). Standard
// output carries the fence and nothing else, so it can be pasted or appended as it is; the notes go
// to standard error. When git cannot answer, nothing is printed on standard output.

import { parseArgs } from 'node:util';
import { renderBlock, type TestsFromJunit, templateBlock } from '../template/template.js';
import { type CliIo, UsageError } from './output.js';

const TEST_RECORD_FLAGS = [
  'tests-command',
  'tests-workflow',
  'tests-job',
  'tests-artifact',
  'tests-artifact-path',
] as const;

export async function template(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      base: { type: 'string' },
      'tests-junit': { type: 'string' },
      ...Object.fromEntries(TEST_RECORD_FLAGS.map((f) => [f, { type: 'string' as const }])),
    },
  });
  const v = values as Record<string, string | undefined>;
  let tests: TestsFromJunit | undefined;
  const given = TEST_RECORD_FLAGS.filter((f) => v[f] !== undefined);
  if (v['tests-junit'] === undefined) {
    if (given.length > 0) {
      throw new UsageError(`--${given[0]} goes with --tests-junit <JUnit XML file>`);
    }
  } else {
    const missing = TEST_RECORD_FLAGS.filter((f) => v[f] === undefined);
    if (missing.length > 0) {
      throw new UsageError(
        `--tests-junit needs the CI record its counts are checked against: ${missing.map((f) => `--${f}`).join(', ')}`,
      );
    }
    tests = {
      junit: v['tests-junit'],
      command: v['tests-command'] as string,
      record: {
        workflow: v['tests-workflow'] as string,
        job: v['tests-job'] as string,
        artifact: v['tests-artifact'] as string,
        path: v['tests-artifact-path'] as string,
      },
    };
  }

  const t = templateBlock({ cwd: io.cwd ?? process.cwd(), base: v.base, tests });
  io.out(renderBlock(t.block));
  for (const note of t.notes) io.err(`dunstan: ${note}\n`);
  return 0;
}

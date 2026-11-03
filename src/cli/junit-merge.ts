// dunstan junit-merge <file>... --out <file>: one JUnit file from several (src/junit/merge.ts), for a
// CI step to upload as the artifact a `junit` record names (docs/ci-test-records.md). Offline. It
// writes nothing unless every input is read and the merged counts are their sum; the counts go to
// standard error.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { JunitMergeError, mergeJunit } from '../junit/merge.js';
import { type CliIo, EXIT, UsageError } from './output.js';

export async function junitMerge(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: { out: { type: 'string' } },
  });
  if (values.out === undefined) throw new UsageError('--out <file> is required');
  const cwd = io.cwd ?? process.cwd();
  const out = resolve(cwd, values.out);
  if (positionals.some((p) => resolve(cwd, p) === out)) {
    throw new UsageError(`--out ${values.out} is one of the inputs`);
  }
  try {
    const merged = mergeJunit(
      positionals.map((path) => {
        try {
          return { path, xml: readFileSync(resolve(cwd, path), 'utf8') };
        } catch (e) {
          throw new JunitMergeError(`${path}: ${(e as Error).message}`);
        }
      }),
    );
    writeFileSync(out, merged.xml);
    io.err(
      `dunstan: ${values.out}: ${positionals.length} ${positionals.length === 1 ? 'file' : 'files'}, ${merged.counts.executed} test cases executed, ${merged.counts.failed} failed\n`,
    );
    return 0;
  } catch (e) {
    if (!(e instanceof JunitMergeError)) throw e;
    io.err(`dunstan: junit-merge refused, nothing written: ${e.message}\n`);
    return EXIT.error;
  }
}

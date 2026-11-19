// `dunstan-eval propose-test-paths`: a local model's proposal of test paths for the repository at
// --dir (src/propose/test-paths.ts), printed, and with --out written as JSON. A development tool,
// never a check: nothing it prints enters a record.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { type CliIo, UsageError } from '../cli/output.js';
import { DEFAULT_ENDPOINT, ProposeError, proposalText, proposeTestPaths } from './test-paths.js';

export type ProposeIo = Pick<CliIo, 'out' | 'err'> & { fetch?: typeof fetch };

// The repository's tracked paths: names only, read from git's index.
function trackedPaths(dir: string): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z'], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter((p) => p !== '');
  } catch {
    throw new UsageError(`${dir} is not in a git repository: --dir names the checkout`);
  }
}

export async function proposeTestPathsCommand(args: string[], io: ProposeIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      model: { type: 'string' },
      endpoint: { type: 'string', default: DEFAULT_ENDPOINT },
      dir: { type: 'string', default: '.' },
      out: { type: 'string' },
    },
  });
  if (values.model === undefined) {
    throw new UsageError(
      '--model <name> is required: a model the local server has, such as qwen2.5-coder',
    );
  }
  const paths = trackedPaths(values.dir);
  if (paths.length === 0) throw new UsageError(`${values.dir} tracks no files`);
  try {
    const proposal = await proposeTestPaths(paths, {
      model: values.model,
      endpoint: values.endpoint,
      ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    });
    io.out(proposalText(proposal));
    if (values.out !== undefined) {
      writeFileSync(values.out, `${JSON.stringify(proposal, null, 2)}\n`);
      io.out(`proposal: ${values.out}\n`);
    }
    return proposal.patterns.length > 0 ? 0 : 1;
  } catch (e) {
    if (e instanceof ProposeError) {
      io.err(`dunstan-eval: ${e.message}\n`);
      return 3;
    }
    throw e;
  }
}

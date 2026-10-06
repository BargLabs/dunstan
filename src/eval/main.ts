// The dunstan-eval command line: measurements of the checker's parts, never a check. Exit codes: 0
// done, 3 usage or internal error.

import { type CliIo, EXIT, UsageError } from '../cli/output.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { retrievalEval } from './retrieval.js';

export const EVAL_USAGE = `dunstan-eval ${CHECKER_VERSION}

usage:
  dunstan-eval retrieval --corpus <dir> --out <file> [--fill-to-k] [--provider <module>]

retrieval  recall at k = 5 per arm on a corpus of claims with known matching record items
           (docs/retrieval.md), each arm's no-candidate rate, and the recall of a uniformly
           random ranking. Arm A always; with --fill-to-k, also Arm A filled to k below the
           floor (A-fill); with --provider, a module whose default export is an
           EmbeddingProvider, also Arm B and A+B.
`;

export async function evalMain(argv: string[], io: Pick<CliIo, 'out' | 'err'>): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case 'retrieval':
        return await retrievalEval(args, io);
      case '--version':
        io.out(`${CHECKER_VERSION}\n`);
        return 0;
      case undefined:
      case '--help':
      case 'help':
        io.out(EVAL_USAGE);
        return command === undefined ? EXIT.error : 0;
      default:
        throw new UsageError(`unknown command ${command}`);
    }
  } catch (e) {
    if (e instanceof UsageError || (e as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(`dunstan-eval: ${(e as Error).message}\n\n${EVAL_USAGE}`);
    } else {
      io.err(`dunstan-eval: ${(e as Error).stack ?? String(e)}\n`);
    }
    return EXIT.error;
  }
}

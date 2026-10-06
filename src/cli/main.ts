// The dunstan command line. Exit codes: 0 pass, 1 fail, 2 unverifiable, 3 usage or internal error.
// `verify` exits 0 when the record verifies and 1 when it does not. `template` exits 0 when it prints
// a block and 3 when git cannot answer; `suggest` exits 0 unless the report cannot be read.

import { PullRequestUnreadable } from '../evidence/github.js';
import { ReportUnavailable } from '../evidence/report.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { TemplateError } from '../template/template.js';
import { check } from './check.js';
import { mcp } from './mcp.js';
import { type CliIo, EXIT, UsageError } from './output.js';
import { rerun } from './rerun.js';
import { suggest } from './suggest.js';
import { template } from './template.js';
import { verify } from './verify.js';

export const USAGE = `dunstan ${CHECKER_VERSION}

usage:
  dunstan check --repo <owner/name> --pr <n>
                (--report-file <path|-> | --report-pr-body | --report-comment-author <login>)
                [--out <record.json>] [--sign-key <path> --signer <principal>]
                [--exclude-check-run <id>]... [--advisory]
  dunstan verify <record.json> [--sig <file> --allowed-signers <file>]
  dunstan rerun <record.json> [--out <record.json>] [--exclude-check-run <id>]...
  dunstan template [--base <ref>]
                   [--tests-junit <file> --tests-command <cmd> --tests-workflow <path>
                    --tests-job <name> --tests-artifact <name> --tests-artifact-path <path>]
  dunstan suggest [--report-file <path|->]
  dunstan mcp

check     reads the pull request, the named report and the evidence its block needs, writes the
          record and prints the claims table. GITHUB_TOKEN is read from the environment.
          --advisory also reads the report's prose for asserted claims and records them as
          advisories (DRAFT 0.2.0, docs/advisory.md). They never change the verdict.
verify    offline: recomputes claims, verdict and digests from the record and compares them.
rerun     online: re-reads the sources for the recorded subject and block; writes a new record.
template  local git: prints a dunstan-handback block for HEAD, its files against the merge base
          with --base (default: the remote's default branch). Tests only from a JUnit file and
          the CI record named with it; references and mergedAt never (docs/agents.md).
suggest   offline: lists sentences in the report's prose (a file, or stdin) that look like claims
          its block does not declare, to declare or reword. Never a verdict (docs/agents.md).
mcp       serves dunstan_check_handback and dunstan_suggest_declarations over stdio
          (docs/mcp.md): check's checker and suggest, called by an agent before it says done.

exit codes: 0 pass (verify: verified; template: printed; suggest: always), 1 fail (verify: not
            verified), 2 unverifiable, 3 usage or internal error, or git cannot answer (template)
`;

export async function main(argv: string[], io: CliIo): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case 'check':
        return await check(args, io);
      case 'verify':
        return await verify(args, io);
      case 'rerun':
        return await rerun(args, io);
      case 'template':
        return await template(args, io);
      case 'suggest':
        return await suggest(args, io);
      case 'mcp':
        return await mcp(args, io);
      case '--version':
        io.out(`${CHECKER_VERSION}\n`);
        return 0;
      case undefined:
      case '--help':
      case 'help':
        io.out(USAGE);
        return command === undefined ? EXIT.error : 0;
      default:
        throw new UsageError(`unknown command ${command}`);
    }
  } catch (e) {
    if (e instanceof UsageError || (e as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(`dunstan: ${(e as Error).message}\n\n${USAGE}`);
    } else if (
      e instanceof PullRequestUnreadable ||
      e instanceof ReportUnavailable ||
      e instanceof TemplateError
    ) {
      io.err(`dunstan: ${(e as Error).message}\n`);
    } else {
      io.err(`dunstan: internal error: ${(e as Error).stack ?? String(e)}\n`);
    }
    return EXIT.error;
  }
}

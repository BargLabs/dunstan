// The dunstan command line. Exit codes: 0 pass, 1 fail, 2 unverifiable, 3 usage or internal error.
// `verify` exits 0 when the record verifies and 1 when it does not. `template` exits 0 when it prints
// a block, 2 when it prints one without the tests --tests-ci was asked for (no count settled), and 3
// when git cannot answer; `suggest` exits 0 unless the report cannot be read; `junit-merge` exits 0
// when it writes the file and 3 when it refuses.

import { PullRequestMoved, PullRequestUnreadable } from '../evidence/github.js';
import { ReportUnavailable } from '../evidence/report.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { TemplateError } from '../template/template.js';
import { check } from './check.js';
import { junitMerge } from './junit-merge.js';
import { mcp } from './mcp.js';
import { type CliIo, EXIT, UsageError } from './output.js';
import { rerun } from './rerun.js';
import { suggest } from './suggest.js';
import { survey } from './survey.js';
import { template } from './template.js';
import { verify } from './verify.js';

export const USAGE = `dunstan ${CHECKER_VERSION}

usage:
  dunstan check --repo <owner/name> --pr <n>
                (--report-file <path|-> | --report-pr-body | --report-comment-author <login>)
                [--out <record.json>] [--sign-key <path> --signer <principal>]
                [--exclude-check-run <id>]... [--advisory]
  dunstan check --gitlab-project <namespace/project> --mr <iid> [--gitlab-host <host>]
                (--report-file <path|-> | --report-mr-description)
                [--out <record.json>] [--sign-key <path> --signer <principal>]
                [--exclude-gitlab-job <id>]...
  dunstan verify <record.json> [--sig <file> --allowed-signers <file>]
  dunstan rerun <record.json> [--out <record.json>] [--exclude-check-run <id>]...
  dunstan template [--base <ref>]
                   [--tests-ci --tests-command <cmd> --tests-workflow <path> --tests-job <name>
                    [--tests-artifact <name>] [--tests-artifact-path <path>] [--repo <owner/name>]
                  | --tests-ci --gitlab-project <namespace/project> --mr <iid> [--gitlab-host <host>]
                    --tests-command <cmd> --tests-job <name> [--tests-workflow <path>]
                    [--tests-path <path>] [--tests-artifact archive]
                  | --tests-local <file> --tests-command <cmd>
                  | --tests-junit <file> --tests-command <cmd> --tests-workflow <path>
                    --tests-job <name> --tests-artifact <name> --tests-artifact-path <path>]
  dunstan suggest [--report-file <path|->]
  dunstan survey --repo <owner/name> --out <survey.json> [--summary <survey.md>]
                 [--last <n>] [--since <YYYY-MM-DD>] [--author <login>]...
                 [--report-comment-author <login>] [--advisory]
  dunstan junit-merge <file>... --out <file>
  dunstan mcp

check     reads the pull request, the named report and the evidence its block needs, writes the
          record and prints the claims table. GITHUB_TOKEN is read from the environment.
          --advisory also reads the report's prose for asserted claims and records them as
          advisories (DRAFT 0.2.0, docs/advisory.md). They never change the verdict.
          GitLab (DRAFT GitLab profile 0.1): --gitlab-project and --mr check a merge request on
          gitlab.com, or on --gitlab-host; --report-mr-description reads its description.
          GITLAB_TOKEN is optional. Checks are the head pipeline's jobs and bridges, less each
          --exclude-gitlab-job (the checker's own job, CI_JOB_ID).
verify   offline: recomputes claims, verdict and digests from the record and compares them.
rerun     online: re-reads the sources for the recorded subject and block; writes a new record.
          A GitLab record is re-read from the host it names.
template  local git: prints a dunstan-handback block for HEAD, its files against the merge base
          with --base (default: the remote's default branch). Tests: --tests-ci reads the counts
          at HEAD from the CI record check reads (artifact dunstan-junit, file junit.xml unless
          given; the repository origin names on github.com unless --repo), with GITHUB_TOKEN;
          --tests-local declares a local JUnit file's counts as a local run; --tests-junit
          declares them against a CI record. Only --tests-ci reads the network. References,
          checks and mergedAt never (docs/agents.md, docs/ci-test-records.md).
          GitLab (DRAFT GitLab profile 0.1): --tests-ci --gitlab-project and --mr read the counts
          from the merge request's head pipeline at HEAD, as check reads them: the job's
          artifacts archive, file junit.xml unless --tests-path, the project's CI configuration
          file unless --tests-workflow. GITLAB_TOKEN is read from the environment.
suggest   offline: lists sentences in the report's prose (a file, or stdin) that look like claims
          its block does not declare, to declare or reword. Never a verdict (docs/agents.md).
survey    read-only, DRAFT (docs/survey.md): checks the --last (default 30, at most 200) most
          recently created closed pull requests as check does, the report in each body or the
          named author's latest comment; writes the survey record and a Markdown summary of the
          claims the record could not settle, why, and the contradicted share of the claims it
          settled. verify recomputes a survey record. GITHUB_TOKEN is optional; the record says
          whether it was set.
junit-merge
          offline: one JUnit file from several (Maven Surefire, Gradle), inputs in code-unit
          order of path, each copied whole; refused unless its counts are the inputs' sum.
mcp       serves dunstan_check_handback and dunstan_suggest_declarations over stdio
          (docs/mcp.md): check's checker and suggest, called by an agent before it says done.

exit codes: 0 pass (verify: verified; template: printed; suggest: always; survey: written;
            junit-merge: written), 1 fail (verify: not verified), 2 unverifiable (template:
            printed without the tests --tests-ci asked for), 3 usage or internal error, git
            cannot answer (template), or refused (junit-merge)
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
      case 'survey':
        return await survey(args, io);
      case 'junit-merge':
        return await junitMerge(args, io);
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
      e instanceof PullRequestMoved ||
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

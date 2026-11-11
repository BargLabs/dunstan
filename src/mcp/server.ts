// The MCP self-check: dunstan_check_handback, that a coding agent calls before it says a task is
// done. It takes the subject and the block (or the report that carries it) and returns the verdict,
// the claims table and the record. It is `dunstan check` with a different caller: the report (and a
// block given as an object) is resolved here, and everything after that is the same
// checkPullRequest the CLI and the Action run, so on the same evidence the two give the same claims,
// verdict and digests (src/mcp/parity.test.ts).
//
// Beside it, dunstan_suggest_declarations is `dunstan suggest`: offline, no subject, the same text.
// It is a sibling tool rather than an option of the check because it needs no pull request and
// reads nothing, and its output is never a verdict.
//
// And dunstan_template_handback is `dunstan template`, for an agent with no shell: the same
// runTemplate (src/template/run.ts) the command line calls after reading its flags, so the fence is
// byte-identical to what the CLI prints and the notes are its notes, in its order, with their
// instructions worded for a tool caller (src/template/wording.ts, src/mcp/template-parity.test.ts).
// `--tests-junit` has no form here: it declares local counts against a CI record, the mismatch
// `tests.from: "ci"` exists to remove.
//
// The check takes a GitHub pull request or a GitLab merge request (DRAFT GitLab profile 0.1), the
// same as `dunstan check --gitlab-project ... --mr ...` (src/mcp/parity.test.ts), and the template's
// CI read takes either too: tests.from "ci" with gitlabProject and mergeRequest is `dunstan template
// --tests-ci --gitlab-project ... --mr ...` (src/mcp/template-parity.test.ts). The survey reads
// GitHub only.
//
// Read-only: GITHUB_TOKEN from the environment for a GitHub subject, GITLAB_TOKEN for a GitLab one,
// each sent only to its own forge's host; metadata reads only, nothing written to the forge or the
// repository. The record is written to a file only when the caller passes outPath, and never over an
// existing file. An error comes back as a tool error, never as a verdict.

import { existsSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { defaultRecordFile, REPOSITORY } from '../cli/check.js';
import { renderRecord } from '../cli/output.js';
import { PullRequestMoved, PullRequestUnreadable, readPullRequest } from '../evidence/github.js';
import { GITLAB_PROJECT } from '../evidence/gitlab.js';
import { DEFAULT_GITLAB_HOST, GITLAB_HOST, GitHubClient, GitLabClient } from '../evidence/http.js';
import type { Report } from '../evidence/report.js';
import { checkPullRequest, githubReaders, gitlabReaders } from '../pipeline/check-pull-request.js';
import {
  type DunstanRecord,
  type RecordBlock,
  recordBlock,
  serializeRecord,
} from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION, checkerIdentity } from '../record/checker.js';
import type { RemedyContext } from '../remedy/remedies.js';
import { readBlockContent } from '../spec/extract.js';
import { CanonicalizationError, canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { suggestText } from '../suggest/suggest.js';
import { runTemplate, type TemplateTests } from '../template/run.js';
import { TemplateError } from '../template/template.js';

export const TOOL_NAME = 'dunstan_check_handback';
export const SUGGEST_TOOL_NAME = 'dunstan_suggest_declarations';
export const TEMPLATE_TOOL_NAME = 'dunstan_template_handback';

export interface DunstanMcpOptions {
  // The URL of the running checker artifact, whose digest the record carries.
  artifact: string;
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
  // Diagnostics (stderr under stdio), never the protocol stream.
  warn: (text: string) => void;
}

// Exactly one subject: a GitHub pull request (repository and pullRequest), or a GitLab merge request
// (gitlabProject, mergeRequest and, off gitlab.com, gitlabHost; DRAFT GitLab profile 0.1).
export interface CheckHandbackInput {
  repository?: string | undefined;
  pullRequest?: number | undefined;
  gitlabProject?: string | undefined;
  mergeRequest?: number | undefined;
  gitlabHost?: string | undefined;
  block?: Record<string, unknown> | undefined;
  report?: string | undefined;
  outPath?: string | undefined;
}

class InputError extends Error {}

const INSTRUCTIONS = `Before you say a task is done: call ${TEMPLATE_TOOL_NAME} with the absolute path of your checkout (and tests.from "ci" once CI has finished on your last push) to generate your dunstan-handback block, or run \`dunstan template\`, the same thing from a shell; add your reference claims; call ${SUGGEST_TOOL_NAME} with your report and declare or reword each sentence it lists; then call ${TOOL_NAME} with your pull request (repository and pullRequest) or your GitLab merge request (gitlabProject and mergeRequest, and gitlabHost off gitlab.com) and the block. If the verdict is not pass, report the rows as they are; never edit the block to make it pass without changing the work. The check reads only what the block declares; the prose is yours to bring into the block.`;

const SUGGEST_DESCRIPTION = `List the sentences in your report's prose that look like claims your dunstan-handback block does not declare, before you say done. Give report, the report text. For each, declare it in the block, or reword it if it is not a claim about this PR. Offline: needs no pull request, reads nothing and writes nothing. Never a verdict: nothing passes or fails, and nothing is written to a record. The same text as \`dunstan suggest\`.`;

const DESCRIPTION = `Check a completion handback against the repository's own record, before you say done. Give exactly one subject: a GitHub pull request (repository owner/name and pullRequest), or a GitLab merge request (gitlabProject, the project's full path, and mergeRequest, its iid; gitlabHost for a host other than gitlab.com; DRAFT GitLab profile). Members of both, of neither, or part of one are an input error. Then give exactly one of: block, the dunstan-handback block as a JSON object; or report, the report text that carries exactly one \`\`\`dunstan-handback fence. Of the checks claims, checks.allSucceeded is true only if every counted check run concluded success, so a skipped or neutral run makes it false; checks.noneFailed is true if none concluded other than success, skipped or neutral and at least one succeeded. Returns the verdict (pass, fail or unverifiable), the claims table, and the full record as JSON. Same checker and same verdict as \`dunstan check\` on the same evidence; no model decides. Reads GitHub metadata with GITHUB_TOKEN for a pull request, GitLab metadata with GITLAB_TOKEN for a merge request (each token goes only to its own forge's host; without GITLAB_TOKEN a GitLab tests claim is unverifiable, even on a public project), and writes nothing to the forge or the repository; the record is written to a file only when you pass outPath. If the verdict is not pass, report the rows as they are; change the work, not the block.`;

const TEMPLATE_DESCRIPTION = `Generate your dunstan-handback block from the local git checkout of your pull request's branch, after your last push: headCommit is HEAD, filesChanged is HEAD's diff against its merge base with base. Give directory, the checkout's absolute path. To declare tests, give tests.from "ci" with command, workflow and job once CI has finished on your last push: the counts are read from the JUnit record CI published, as the gate reads it, with GITHUB_TOKEN. For a GitLab merge request (DRAFT GitLab profile), give tests.from "ci" with gitlabProject, mergeRequest, command and job instead (gitlabHost off gitlab.com, path for the JUnit file in the job's artifacts archive, workflow optional): the counts are read from the merge request's head pipeline at HEAD, as the gate reads them, with GITLAB_TOKEN only; do not mix repository, artifact or artifactPath into it. tests.from "local" declares a local JUnit file as a local run, which the gate reports unverifiable. Returns the first line (tests: declared, tests: not declared, or tests: none asked) and the notes, then the fence, byte for byte what \`dunstan template\` prints. When the first line is tests: not declared, the block has no tests: do not add counts yourself; do what the note says. Add your references and checks yourself. Reads git and, with tests.from "ci", GitHub (or GitLab) metadata and the JUnit artifact (or archive) for its counts; writes nothing.`;

// A block given as an object is read exactly as the content of a handback fence (spec section 5):
// the report is the block's RFC 8785 bytes, so version and schema checks are the same as for a block
// found in a report. Duplicate member names cannot be seen here: the request was parsed already.
function reportOfBlock(block: Record<string, unknown>): { report: Report; block: RecordBlock } {
  const text = canonicalize(block as JsonValue);
  return {
    report: {
      bytes: new TextEncoder().encode(text),
      source: { kind: 'api', locator: `mcp ${TOOL_NAME}#block` },
    },
    block: recordBlock(readBlockContent(text)),
  };
}

// A report given as text: its block is found by checkPullRequest, as in a report the CLI reads.
function reportOfText(text: string): { report: Report; block?: RecordBlock } {
  return {
    report: {
      bytes: new TextEncoder().encode(text),
      source: { kind: 'api', locator: `mcp ${TOOL_NAME}#report` },
    },
  };
}

type Subject =
  | { forge: 'github'; repository: string; number: number }
  | { forge: 'gitlab'; project: string; iid: number; host: string };

const BOTH_SUBJECTS =
  'give exactly one subject: repository and pullRequest (a GitHub pull request), or gitlabProject and mergeRequest, with gitlabHost off gitlab.com (a GitLab merge request); not members of both';
const NO_SUBJECT =
  'give a subject: repository and pullRequest (a GitHub pull request), or gitlabProject and mergeRequest, with gitlabHost off gitlab.com (a GitLab merge request)';

// The subject the call names, never guessed: members of both forges, of neither, or part of one
// are refused before anything is read. The GitLab members are checked as `dunstan check
// --gitlab-project` checks its flags, with the same GITLAB_PROJECT and GITLAB_HOST; a GitHub
// subject's members the input schema checks, as before the tool took a GitLab one.
function subjectOf(input: CheckHandbackInput): Subject {
  const github = input.repository !== undefined || input.pullRequest !== undefined;
  const gitlab =
    input.gitlabProject !== undefined ||
    input.mergeRequest !== undefined ||
    input.gitlabHost !== undefined;
  if (github && gitlab) throw new InputError(BOTH_SUBJECTS);
  if (github) {
    if (input.repository === undefined) {
      throw new InputError('pullRequest needs repository, the GitHub repository owner/name');
    }
    if (input.pullRequest === undefined) {
      throw new InputError('repository needs pullRequest, the pull request number');
    }
    return { forge: 'github', repository: input.repository, number: input.pullRequest };
  }
  if (!gitlab) throw new InputError(NO_SUBJECT);
  if (input.gitlabProject === undefined && input.mergeRequest === undefined) {
    throw new InputError('gitlabHost needs gitlabProject and mergeRequest, the merge request');
  }
  if (input.gitlabProject === undefined) {
    throw new InputError(
      "mergeRequest needs gitlabProject, the GitLab project's full path group/subgroup/.../project",
    );
  }
  if (input.mergeRequest === undefined) {
    throw new InputError("gitlabProject needs mergeRequest, the merge request's iid");
  }
  if (!GITLAB_PROJECT.test(input.gitlabProject)) {
    throw new InputError(
      "gitlabProject must be the project's full path, group/subgroup/.../project, with no host or scheme",
    );
  }
  if (!Number.isSafeInteger(input.mergeRequest) || input.mergeRequest < 1) {
    throw new InputError(
      `mergeRequest must be the merge request's iid, a positive integer of at most ${Number.MAX_SAFE_INTEGER}`,
    );
  }
  const host = input.gitlabHost ?? DEFAULT_GITLAB_HOST;
  if (!GITLAB_HOST.test(host)) {
    throw new InputError(
      'gitlabHost must be a lowercase host name, such as gitlab.example.com, with no scheme, port or path',
    );
  }
  return { forge: 'gitlab', project: input.gitlabProject, iid: input.mergeRequest, host };
}

// What a tool caller reads when GITLAB_TOKEN is not set (profile G.3): an anonymous read of a
// project leaves out ci_config_path, so no tests record can be matched to the file that ran.
export const GITLAB_ANONYMOUS_TESTS_NOTE =
  "a tests claim on GitLab needs GITLAB_TOKEN even on a public project: an anonymous read of the project leaves out its CI configuration file (ci_config_path), so the tests rows are unverifiable; set GITLAB_TOKEN in this MCP server's environment";

// `dunstan check --gitlab-project <project> --mr <iid> [--gitlab-host <host>]` with a different
// caller: the same reader, the same record file name and the same checkPullRequest, given the
// report the tool resolved. Only GITLAB_TOKEN is read, and only the GitLab host is sent it. No job
// is excluded: the caller is an agent, not the checker's own CI job.
async function checkGitLabHandback(
  subject: Extract<Subject, { forge: 'gitlab' }>,
  report: Report,
  block: RecordBlock | undefined,
  outPath: string | undefined,
  options: DunstanMcpOptions,
): Promise<CallToolResult> {
  const notes: string[] = [];
  const client = new GitLabClient({
    host: subject.host,
    token: options.env.GITLAB_TOKEN,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    warn: (message) => {
      notes.push(message);
      options.warn(`dunstan: ${message}\n`);
    },
  });
  if (!client.hasToken) {
    notes.push('GITLAB_TOKEN is not set; read anonymously', GITLAB_ANONYMOUS_TESTS_NOTE);
    options.warn('dunstan: GITLAB_TOKEN is not set; reading anonymously\n');
  }
  const recordFile = outPath ?? defaultRecordFile(subject.project, subject.iid);
  const record = await checkPullRequest({
    readers: gitlabReaders(client),
    repository: subject.project,
    number: subject.iid,
    report: async () => report,
    ...(block === undefined ? {} : { block }),
    checker: checkerIdentity(options.artifact),
    recordFile: basename(recordFile),
    forge: { kind: 'gitlab', host: subject.host },
  });
  const serialized = serializeRecord(record);
  if (outPath !== undefined) writeFileSync(outPath, serialized, { flag: 'wx' });
  return handbackResult(record, outPath, notes, { hasToken: client.hasToken });
}

export async function checkHandback(
  input: CheckHandbackInput,
  options: DunstanMcpOptions,
): Promise<CallToolResult> {
  if ((input.block === undefined) === (input.report === undefined)) {
    throw new InputError(
      'pass exactly one of block (the handback block as a JSON object) or report (text carrying one dunstan-handback fence)',
    );
  }
  const outPath = input.outPath === undefined ? undefined : resolve(input.outPath);
  if (outPath !== undefined && existsSync(outPath)) {
    throw new InputError(`${outPath} exists; the tool never overwrites a file`);
  }
  const subject = subjectOf(input);
  const { report, block } =
    input.block !== undefined ? reportOfBlock(input.block) : reportOfText(input.report as string);
  if (subject.forge === 'gitlab')
    return checkGitLabHandback(subject, report, block, outPath, options);

  const notes: string[] = [];
  const client = new GitHubClient({
    token: options.env.GITHUB_TOKEN,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    warn: (message) => {
      notes.push(message);
      options.warn(`dunstan: ${message}\n`);
    },
  });
  if (!client.hasToken) {
    notes.push('GITHUB_TOKEN is not set; read anonymously');
    options.warn('dunstan: GITHUB_TOKEN is not set; reading anonymously\n');
  }

  const pullRequest = await readPullRequest(client, subject.repository, subject.number);
  const recordFile = outPath ?? defaultRecordFile(pullRequest.repository, subject.number);
  const record = await checkPullRequest({
    readers: githubReaders(client),
    repository: subject.repository,
    number: subject.number,
    pullRequest,
    report: async () => report,
    ...(block === undefined ? {} : { block }),
    checker: checkerIdentity(options.artifact),
    recordFile: basename(recordFile),
  });
  const serialized = serializeRecord(record);
  if (outPath !== undefined) writeFileSync(outPath, serialized, { flag: 'wx' });
  return handbackResult(record, outPath, notes, { hasToken: client.hasToken });
}

// The tool's response for a record: the verdict lines and the claims table for the agent to read,
// then the record's exact bytes. Only the first two are worded for a reader; the record is as
// written. The table is the CLI's, with its remedy lines worded for a tool caller (caller 'mcp',
// src/template/wording.ts): they name dunstan_template_handback and its inputs, not flags.
export function handbackResult(
  record: DunstanRecord,
  outPath: string | undefined,
  notes: readonly string[],
  context: Omit<RemedyContext, 'caller'>,
): CallToolResult {
  const verdict = record.predicate.verdict;
  const head = [`verdict: ${verdict}`];
  if (verdict !== 'pass') {
    head.push('Report the rows below as they are. Change the work, not the block.');
  }
  head.push(
    outPath === undefined ? 'record: not written (pass outPath to write it)' : `record: ${outPath}`,
  );
  head.push(...notes.map((n) => `note: ${n}`));
  return {
    content: [
      { type: 'text', text: `${head.join('\n')}\n` },
      { type: 'text', text: renderRecord(record, { ...context, caller: 'mcp' }) },
      { type: 'text', text: serializeRecord(record) },
    ],
  };
}

// tests.from "ci" as the tool takes it: the GitHub members (workflow, artifact, artifactPath,
// repository) or the GitLab ones (gitlabProject, mergeRequest, gitlabHost, path, and workflow),
// never both; templateTestsOf says which.
export interface ToolCiTests {
  from: 'ci';
  command: string;
  job: string;
  workflow?: string | undefined;
  artifact?: string | undefined;
  artifactPath?: string | undefined;
  repository?: string | undefined;
  gitlabProject?: string | undefined;
  mergeRequest?: number | undefined;
  gitlabHost?: string | undefined;
  path?: string | undefined;
}

export interface TemplateHandbackInput {
  directory: string;
  base?: string | undefined;
  tests?: Exclude<TemplateTests, { from: 'ci' }> | ToolCiTests | undefined;
}

const GITHUB_CI_MEMBERS = ['repository', 'artifact', 'artifactPath'] as const;
const GITLAB_CI_MEMBERS = ['gitlabProject', 'mergeRequest', 'gitlabHost', 'path'] as const;

// The request tests.from "ci" names, never guessed: a GitLab merge request when any GitLab member is
// given, checked as `dunstan template --tests-ci --gitlab-project` checks its flags (the same
// GITLAB_PROJECT and GITLAB_HOST); else a GitHub repository, as before the tool took a GitLab one.
// A GitHub member beside a GitLab one is refused before anything is read.
function templateTestsOf(tests: TemplateHandbackInput['tests']): TemplateTests | undefined {
  if (tests === undefined || tests.from !== 'ci') return tests;
  const gitlab = GITLAB_CI_MEMBERS.filter((m) => tests[m] !== undefined);
  if (gitlab.length === 0) {
    if (tests.workflow === undefined) {
      throw new InputError(
        'tests.from "ci" needs workflow, the workflow file that ran the tests, for a GitHub repository; or gitlabProject and mergeRequest for a GitLab merge request',
      );
    }
    return {
      from: 'ci',
      command: tests.command,
      workflow: tests.workflow,
      job: tests.job,
      artifact: tests.artifact,
      artifactPath: tests.artifactPath,
      repository: tests.repository,
    };
  }
  const github = GITHUB_CI_MEMBERS.filter((m) => tests[m] !== undefined);
  if (github.length > 0) {
    throw new InputError(
      `tests.${github[0]} does not go with tests.${gitlab[0]}: name a GitHub repository (repository, artifact, artifactPath) or a GitLab merge request (gitlabProject, mergeRequest, gitlabHost, path), not both`,
    );
  }
  if (tests.gitlabProject === undefined) {
    throw new InputError(
      `tests.${gitlab[0]} needs tests.gitlabProject, the GitLab project's full path group/subgroup/.../project, and tests.mergeRequest`,
    );
  }
  if (!GITLAB_PROJECT.test(tests.gitlabProject)) {
    throw new InputError(
      "tests.gitlabProject must be the project's full path, group/subgroup/.../project, with no host or scheme",
    );
  }
  if (tests.mergeRequest === undefined) {
    throw new InputError("tests.gitlabProject needs tests.mergeRequest, the merge request's iid");
  }
  if (!Number.isSafeInteger(tests.mergeRequest) || tests.mergeRequest < 1) {
    throw new InputError(
      `tests.mergeRequest must be the merge request's iid, a positive integer of at most ${Number.MAX_SAFE_INTEGER}`,
    );
  }
  if (tests.gitlabHost !== undefined && !GITLAB_HOST.test(tests.gitlabHost)) {
    throw new InputError(
      'tests.gitlabHost must be a lowercase host name, such as gitlab.example.com, with no scheme, port or path',
    );
  }
  return {
    from: 'ci',
    gitlabProject: tests.gitlabProject,
    mergeRequest: tests.mergeRequest,
    gitlabHost: tests.gitlabHost,
    command: tests.command,
    job: tests.job,
    path: tests.path,
    workflow: tests.workflow,
  };
}

const TESTS_LINE = {
  declared: 'tests: declared',
  not_declared: 'tests: not declared',
  none: 'tests: none asked',
} as const;

// dunstan template with a different caller. The reader's warnings and the notes come back as
// `note: ` lines, in the order the CLI prints them on standard error, with their instructions
// worded for a tool caller (caller 'mcp': inputs, not flags); the fence comes back as the CLI
// prints it on standard output. A CI read that did not settle is not a tool error: the block is
// valid and returned, and the first line says its tests are not declared.
export async function templateHandback(
  input: TemplateHandbackInput,
  options: DunstanMcpOptions,
): Promise<CallToolResult> {
  if (!isAbsolute(input.directory)) {
    throw new InputError(`directory ${input.directory} is not an absolute path`);
  }
  const tests = templateTestsOf(input.tests);
  const warnings: string[] = [];
  const run = await runTemplate(
    { cwd: input.directory, base: input.base, tests, caller: 'mcp' },
    {
      env: options.env,
      fetch: options.fetch,
      warn: (message) => {
        warnings.push(message);
        options.warn(`dunstan: ${message}\n`);
      },
    },
  );
  const head: string[] = [TESTS_LINE[run.tests]];
  if (run.tests === 'not_declared') {
    head.push('The block below has no tests. Do not add counts yourself; do what the note says.');
  }
  head.push(...[...warnings, ...run.notes].map((n) => `note: ${n}`));
  return {
    content: [
      { type: 'text', text: `${head.join('\n')}\n` },
      { type: 'text', text: run.fence },
    ],
  };
}

// What an error means, by tool: the check produced no verdict, the template no block.
const ERROR_TAIL = {
  check: 'This is an error, not a verdict: nothing was checked.',
  template: 'This is an error: no block was produced.',
} as const;

function toolError(error: unknown, tail: keyof typeof ERROR_TAIL = 'check'): CallToolResult {
  const known =
    error instanceof InputError ||
    error instanceof PullRequestUnreadable ||
    error instanceof PullRequestMoved ||
    error instanceof CanonicalizationError ||
    error instanceof TemplateError ||
    typeof (error as NodeJS.ErrnoException).code === 'string';
  const message = (error as Error).message ?? String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `dunstan: ${known ? message : `internal error: ${message}`}\n${ERROR_TAIL[tail]}\n`,
      },
    ],
  };
}

const nonEmpty = z.string().min(1);

// The two forms of tests, each closed: an unknown member, or a member of the other form, is refused.
const TEMPLATE_TESTS = z.discriminatedUnion('from', [
  z
    .object({
      from: z.literal('ci'),
      command: nonEmpty.describe('The command that ran the tests, as the block declares it.'),
      workflow: nonEmpty
        .optional()
        .describe(
          "The workflow file that ran them, as a path: .github/workflows/ci.yml. Required on GitHub. On GitLab, the project's CI configuration file; absent, the one the project names (ci_config_path, else .gitlab-ci.yml).",
        ),
      job: nonEmpty.describe(
        'The name of the job that uploaded the JUnit artifact; on GitLab, the job in the head pipeline whose artifacts archive holds it.',
      ),
      artifact: nonEmpty
        .optional()
        .describe('GitHub: the artifact holding the JUnit file. Absent: dunstan-junit.'),
      artifactPath: nonEmpty
        .optional()
        .describe('GitHub: the JUnit file in the artifact. Absent: junit.xml.'),
      repository: z
        .string()
        .regex(REPOSITORY, 'repository must be owner/name')
        .optional()
        .describe(
          'GitHub: the repository, owner/name, read with GITHUB_TOKEN. Absent: the one the origin remote names. Not with the GitLab members.',
        ),
      gitlabProject: z
        .string()
        .optional()
        .describe(
          "GitLab (DRAFT profile): the project's full path, group/subgroup/.../project, with mergeRequest; read with GITLAB_TOKEN. Not with repository, artifact or artifactPath.",
        ),
      mergeRequest: z
        .number()
        .optional()
        .describe(
          "GitLab: the merge request's iid, the number after !. Its head pipeline at HEAD is read.",
        ),
      gitlabHost: z
        .string()
        .optional()
        .describe(
          `GitLab: the host name, such as gitlab.example.com. Absent: ${DEFAULT_GITLAB_HOST}.`,
        ),
      path: nonEmpty
        .optional()
        .describe("GitLab: the JUnit file in the job's artifacts archive. Absent: junit.xml."),
    })
    .strict()
    .describe(
      "Read CI's counts at HEAD from the JUnit record CI published, as the gate reads it (dunstan template --tests-ci): on GitHub, a workflow run's artifact; on a GitLab merge request (gitlabProject and mergeRequest), its head pipeline's job archive.",
    ),
  z
    .object({
      from: z.literal('local'),
      junit: nonEmpty.describe(
        'The local JUnit XML file; a relative path resolves against directory.',
      ),
      command: nonEmpty.describe('The command that ran the tests, as the block declares it.'),
    })
    .strict()
    .describe(
      'Declare a local JUnit file as a local run, which the gate reports unverifiable (dunstan template --tests-local).',
    ),
]);

export function createDunstanMcpServer(options: DunstanMcpOptions): McpServer {
  const server = new McpServer(
    { name: CHECKER_NAME, version: CHECKER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Check a handback against the record',
      description: DESCRIPTION,
      inputSchema: {
        repository: z
          .string()
          .regex(REPOSITORY, 'repository must be owner/name')
          .optional()
          .describe(
            'A GitHub subject: the repository, owner/name, with pullRequest. Read with GITHUB_TOKEN. Give this subject or the GitLab one, not both.',
          ),
        pullRequest: z
          .number()
          .int()
          .min(1)
          .max(9_999_999_999)
          .optional()
          .describe('A GitHub subject: the pull request number the handback is about.'),
        gitlabProject: z
          .string()
          .optional()
          .describe(
            "A GitLab subject: the project's full path, group/subgroup/.../project, with mergeRequest. Read with GITLAB_TOKEN. Give this subject or the GitHub one, not both.",
          ),
        mergeRequest: z
          .number()
          .optional()
          .describe(
            "A GitLab subject: the merge request's iid, the number after ! (a positive integer).",
          ),
        gitlabHost: z
          .string()
          .optional()
          .describe(
            `A GitLab subject: the GitLab host name, such as gitlab.example.com. Absent: ${DEFAULT_GITLAB_HOST}.`,
          ),
        block: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('The dunstan-handback block as a JSON object. Give this or report, not both.'),
        report: z
          .string()
          .optional()
          .describe(
            'The report text, carrying exactly one ```dunstan-handback fence. Give this or block, not both.',
          ),
        outPath: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Write the record to this path (must not exist). Without it nothing is written.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return await checkHandback(input, options);
      } catch (error) {
        return toolError(error);
      }
    },
  );
  server.registerTool(
    SUGGEST_TOOL_NAME,
    {
      title: 'Suggest declarations from the prose',
      description: SUGGEST_DESCRIPTION,
      inputSchema: {
        report: z
          .string()
          .describe('The report text: the prose and its ```dunstan-handback fence.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => ({ content: [{ type: 'text', text: suggestText(input.report) }] }),
  );
  server.registerTool(
    TEMPLATE_TOOL_NAME,
    {
      title: 'Generate a handback block from git',
      description: TEMPLATE_DESCRIPTION,
      inputSchema: z
        .object({
          directory: nonEmpty.describe(
            "The absolute path of the local git checkout of the pull request's branch. Git runs there.",
          ),
          base: nonEmpty
            .optional()
            .describe(
              "The ref the pull request merges into, as dunstan template --base. Absent: the remote's default branch.",
            ),
          tests: TEMPLATE_TESTS.optional().describe(
            'Which tests to declare. Absent: none, and the note says how.',
          ),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return await templateHandback(input, options);
      } catch (error) {
        return toolError(error, 'template');
      }
    },
  );
  return server;
}

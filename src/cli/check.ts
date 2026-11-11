// dunstan check: read the subject, the report the invocation names and the evidence the block needs;
// write the record; print the claims table. The report source is always declared, never guessed.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { GITLAB_PROJECT, reportFromMergeRequestDescription } from '../evidence/gitlab.js';
import { DEFAULT_GITLAB_HOST, GITLAB_HOST, GitHubClient, GitLabClient } from '../evidence/http.js';
import { type Report, reportFromComment, reportFromPullRequestBody } from '../evidence/report.js';
import { checkPullRequest, githubReaders, gitlabReaders } from '../pipeline/check-pull-request.js';
import { type Assurance, serializeRecord } from '../record/build.js';
import { checkerIdentity } from '../record/checker.js';
import { keyFingerprint, signRecordFile } from '../record/sign.js';
import { type CliIo, exitFor, renderRecord, UsageError } from './output.js';

export const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

// A positive decimal integer, no sign and no leading zero, at most Number.MAX_SAFE_INTEGER: the
// largest integer a record's JSON number holds exactly. Check-run and job ids already pass ten
// digits (GitLab job ids are 11, GitHub check-run ids 12), so the bound is the integer range, never
// a digit count. A larger value is refused, never rounded.
export function parsePositiveInt(value: string, flag: string): number {
  const parsed = /^[1-9][0-9]{0,15}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new UsageError(
      `${flag} must be a positive integer of at most ${Number.MAX_SAFE_INTEGER}`,
    );
  }
  return parsed;
}

export function parseCheckRunIds(values: readonly string[] | undefined): number[] {
  return (values ?? []).map((v) => parsePositiveInt(v, '--exclude-check-run'));
}

export async function signingAssurance(
  signKey: string | undefined,
  signer: string | undefined,
): Promise<Assurance | undefined> {
  if (signKey === undefined && signer === undefined) return undefined;
  if (signKey === undefined || signer === undefined) {
    throw new UsageError('--sign-key and --signer go together');
  }
  return { status: 'signed', issuer: signer, keyFingerprint: keyFingerprint(signKey) };
}

// The record file a check writes when none is named: `dunstan check` without --out, and the MCP
// tool's rerun commands when it writes no file. A GitLab project in a subgroup has more than one `/`,
// and each becomes `-`, so the file is never written under a directory.
export function defaultRecordFile(repository: string, number: number): string {
  return `dunstan-${repository.replaceAll('/', '-')}-${number}.json`;
}

export async function check(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      repo: { type: 'string' },
      pr: { type: 'string' },
      'report-file': { type: 'string' },
      'report-pr-body': { type: 'boolean' },
      'report-comment-author': { type: 'string' },
      out: { type: 'string' },
      'sign-key': { type: 'string' },
      signer: { type: 'string' },
      'exclude-check-run': { type: 'string', multiple: true },
      'exclude-gitlab-job': { type: 'string', multiple: true },
      advisory: { type: 'boolean' },
      'gitlab-project': { type: 'string' },
      mr: { type: 'string' },
      'gitlab-host': { type: 'string' },
      'report-mr-description': { type: 'boolean' },
    },
  });
  if (
    values['gitlab-project'] !== undefined ||
    values.mr !== undefined ||
    values['gitlab-host'] !== undefined ||
    values['report-mr-description'] === true ||
    values['exclude-gitlab-job'] !== undefined
  ) {
    return checkGitLab(values, io);
  }
  if (values.repo === undefined || !REPOSITORY.test(values.repo)) {
    throw new UsageError('--repo <owner/name> is required');
  }
  if (values.pr === undefined) throw new UsageError('--pr <number> is required');
  const number = parsePositiveInt(values.pr, '--pr');
  const sources = [
    values['report-file'] !== undefined,
    values['report-pr-body'] === true,
    values['report-comment-author'] !== undefined,
  ].filter(Boolean).length;
  if (sources !== 1) {
    throw new UsageError(
      'name exactly one report: --report-file <path>, --report-pr-body or --report-comment-author <login>',
    );
  }
  const excluded = parseCheckRunIds(values['exclude-check-run']);
  const assurance = await signingAssurance(values['sign-key'], values.signer);

  const client = new GitHubClient({
    token: io.env.GITHUB_TOKEN,
    ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    warn: (message) => io.err(`dunstan: ${message}\n`),
  });
  if (!client.hasToken) io.err('dunstan: GITHUB_TOKEN is not set; reading anonymously\n');

  const out = values.out ?? defaultRecordFile(values.repo, number);
  const file = values['report-file'];
  const author = values['report-comment-author'];
  const record = await checkPullRequest({
    readers: io.readers?.(client) ?? githubReaders(client),
    repository: values.repo,
    number,
    report: async (pr): Promise<Report> => {
      if (file !== undefined) {
        return file === '-'
          ? { bytes: io.readStdin(), source: { kind: 'stdin', locator: 'stdin' } }
          : { bytes: readFileSync(file), source: { kind: 'file', locator: file } };
      }
      if (author === undefined) return reportFromPullRequestBody(pr.repository, pr);
      return reportFromComment(client, pr.repository, number, author);
    },
    excludedCheckRunIds: excluded,
    checker: checkerIdentity(io.artifact),
    recordFile: basename(out),
    ...(assurance === undefined ? {} : { assurance }),
    advisory: values.advisory === true,
  });
  writeFileSync(out, serializeRecord(record));
  io.out(renderRecord(record, { hasToken: client.hasToken, caller: 'cli' }));
  io.out(`record: ${out}\n`);
  if (assurance !== undefined) {
    io.out(`signature: ${signRecordFile(out, values['sign-key'] as string)}\n`);
  }
  return exitFor(record.predicate.verdict);
}

interface CheckValues {
  repo?: string | undefined;
  pr?: string | undefined;
  'report-file'?: string | undefined;
  'report-pr-body'?: boolean | undefined;
  'report-comment-author'?: string | undefined;
  out?: string | undefined;
  'sign-key'?: string | undefined;
  signer?: string | undefined;
  'exclude-check-run'?: string[] | undefined;
  'exclude-gitlab-job'?: string[] | undefined;
  advisory?: boolean | undefined;
  'gitlab-project'?: string | undefined;
  mr?: string | undefined;
  'gitlab-host'?: string | undefined;
  'report-mr-description'?: boolean | undefined;
}

// DRAFT GitLab profile 0.1: one merge request, named by its project's full path and its iid, on
// gitlab.com or the host given. The report is a file, stdin or the description. A flag that names
// a GitHub subject is refused, never ignored. --exclude-gitlab-job names the checker's own job
// (CI_JOB_ID), which the check runs leave out and record under excludedIds (profile G.3).
async function checkGitLab(values: CheckValues, io: CliIo): Promise<number> {
  const refused: [string, boolean][] = [
    ['--repo', values.repo !== undefined],
    ['--pr', values.pr !== undefined],
    ['--report-pr-body (use --report-mr-description)', values['report-pr-body'] === true],
    ['--report-comment-author', values['report-comment-author'] !== undefined],
    ['--exclude-check-run', values['exclude-check-run'] !== undefined],
    ['--advisory', values.advisory === true],
  ];
  const named = refused.filter(([, given]) => given).map(([flag]) => flag);
  if (named.length > 0) {
    throw new UsageError(`a GitLab merge request is checked without ${named.join(', ')}`);
  }
  const project = values['gitlab-project'];
  if (project === undefined || !GITLAB_PROJECT.test(project)) {
    throw new UsageError(
      "--gitlab-project <namespace/project> is required: the project's full path, group/subgroup/.../project",
    );
  }
  if (values.mr === undefined) throw new UsageError('--mr <iid> is required');
  const iid = parsePositiveInt(values.mr, '--mr');
  const host = values['gitlab-host'] ?? DEFAULT_GITLAB_HOST;
  if (!GITLAB_HOST.test(host)) {
    throw new UsageError('--gitlab-host is a lowercase host name, such as gitlab.example.com');
  }
  const file = values['report-file'];
  if ((file !== undefined) === (values['report-mr-description'] === true)) {
    throw new UsageError(
      'name exactly one report: --report-file <path|-> or --report-mr-description',
    );
  }
  const excluded = (values['exclude-gitlab-job'] ?? []).map((v) =>
    parsePositiveInt(v, '--exclude-gitlab-job'),
  );
  const assurance = await signingAssurance(values['sign-key'], values.signer);

  const client = new GitLabClient({
    host,
    token: io.env.GITLAB_TOKEN,
    ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    warn: (message) => io.err(`dunstan: ${message}\n`),
  });
  if (!client.hasToken) io.err('dunstan: GITLAB_TOKEN is not set; reading anonymously\n');

  const out = values.out ?? defaultRecordFile(project, iid);
  const record = await checkPullRequest({
    readers: gitlabReaders(client),
    repository: project,
    number: iid,
    report: async (pr): Promise<Report> => {
      if (file === undefined) return reportFromMergeRequestDescription(pr);
      return file === '-'
        ? { bytes: io.readStdin(), source: { kind: 'stdin', locator: 'stdin' } }
        : { bytes: readFileSync(file), source: { kind: 'file', locator: file } };
    },
    excludedCheckRunIds: excluded,
    checker: checkerIdentity(io.artifact),
    recordFile: basename(out),
    ...(assurance === undefined ? {} : { assurance }),
    forge: { kind: 'gitlab', host },
  });
  writeFileSync(out, serializeRecord(record));
  io.out(renderRecord(record, { hasToken: client.hasToken, caller: 'cli' }));
  io.out(`record: ${out}\n`);
  if (assurance !== undefined) {
    io.out(`signature: ${signRecordFile(out, values['sign-key'] as string)}\n`);
  }
  return exitFor(record.predicate.verdict);
}

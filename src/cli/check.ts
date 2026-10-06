// dunstan check: read the subject, the report the invocation names and the evidence the block needs;
// write the record; print the claims table. The report source is always declared, never guessed.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { GitHubClient } from '../evidence/http.js';
import { type Report, reportFromComment, reportFromPullRequestBody } from '../evidence/report.js';
import { checkPullRequest, githubReaders } from '../pipeline/check-pull-request.js';
import { type Assurance, serializeRecord } from '../record/build.js';
import { checkerIdentity } from '../record/checker.js';
import { keyFingerprint, signRecordFile } from '../record/sign.js';
import { type CliIo, exitFor, renderRecord, UsageError } from './output.js';

export const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export function parsePositiveInt(value: string, flag: string): number {
  if (!/^[1-9][0-9]{0,9}$/.test(value)) throw new UsageError(`${flag} must be a positive integer`);
  return Number(value);
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
// tool's rerun commands when it writes no file.
export function defaultRecordFile(repository: string, number: number): string {
  return `dunstan-${repository.replace('/', '-')}-${number}.json`;
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
      advisory: { type: 'boolean' },
    },
  });
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
  io.out(renderRecord(record));
  io.out(`record: ${out}\n`);
  if (assurance !== undefined) {
    io.out(`signature: ${signRecordFile(out, values['sign-key'] as string)}\n`);
  }
  return exitFor(record.predicate.verdict);
}

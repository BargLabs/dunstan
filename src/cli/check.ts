// dunstan check: read the subject, the report the invocation names and the evidence the block needs;
// write the record; print the claims table. The report source is always declared, never guessed.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { type PullRequestRead, readEvidence } from '../evidence/github.js';
import { GitHubClient } from '../evidence/http.js';
import { type Report, reportFromComment, reportFromPullRequestBody } from '../evidence/report.js';
import { checkPullRequest, githubReaders } from '../pipeline/check-pull-request.js';
import {
  type Assurance,
  buildRecord,
  type DunstanRecord,
  type RecordBlock,
  recordBlock,
  rerunCommands,
  serializeRecord,
} from '../record/build.js';
import { checkerIdentity } from '../record/checker.js';
import { keyFingerprint, signRecordFile } from '../record/sign.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { sha256Hex } from '../spec/jcs.js';
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

// Kept for the MCP tool (src/mcp/server.ts), which builds a record from a report or a block it was
// given directly. dunstan check and the Action use src/pipeline/check-pull-request.ts.
export function defaultRecordFile(repository: string, number: number): string {
  return `dunstan-${repository.replace('/', '-')}-${number}.json`;
}

// The block a report text carries. WHATWG UTF-8 decode: a leading BOM is removed and an invalid
// sequence becomes U+FFFD.
export function blockOfReport(report: Report): RecordBlock {
  return recordBlock(extractHandbackBlock(new TextDecoder('utf-8').decode(report.bytes)));
}

export interface RecordInput {
  pullRequest: PullRequestRead;
  report: Report;
  block: RecordBlock;
  // The URL of the running checker artifact, whose digest the record carries.
  artifact: string;
  // The record's file name, for its rerun commands.
  recordFile: string;
  excludedCheckRunIds?: readonly number[];
  assurance?: Assurance;
}

// Everything after the report is resolved: read the evidence the block needs and build the record.
// `dunstan check` and the MCP tool both end here, so on the same evidence they give the same record.
export async function recordReport(
  client: GitHubClient,
  input: RecordInput,
): Promise<DunstanRecord> {
  const { block, pullRequest } = input;
  const evidence = await readEvidence(client, {
    repository: pullRequest.repository,
    pullRequest,
    block: block.status === 'found' ? block.value : null,
    excludedCheckRunIds: input.excludedCheckRunIds ?? [],
  });
  return buildRecord({
    checker: checkerIdentity(input.artifact),
    report: { sha256: sha256Hex(input.report.bytes), source: input.report.source },
    block,
    repository: pullRequest.repository,
    evidence,
    rerun: rerunCommands(basename(input.recordFile)),
    ...(input.assurance === undefined ? {} : { assurance: input.assurance }),
  });
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

  const out = values.out ?? `dunstan-${values.repo.replace('/', '-')}-${number}.json`;
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

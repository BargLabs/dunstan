// The Action's core entry point. It runs the same check as `dunstan check` (src/pipeline), then
// reports: the record as the workflow artifact `dunstan-record`, a `dunstan` check run on the head
// commit whose summary is the claims table, the same table in the job summary, and the step's exit
// status. It never comments, labels, reviews or merges.
//
// Fail closed: only `pass` concludes `success`. An input it cannot use, an event it cannot check, a
// report source that is missing or unreadable, a record it cannot upload and a crash all conclude
// `failure`, with the reason in the summary.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PullRequestUnreadable } from '../evidence/github.js';
import { DEFAULT_API, GitHubClient } from '../evidence/http.js';
import {
  type Report,
  ReportUnavailable,
  reportFromComment,
  reportFromPullRequestBody,
} from '../evidence/report.js';
import {
  checkPullRequest,
  type EvidenceReaders,
  githubReaders,
} from '../pipeline/check-pull-request.js';
import { type Assurance, type DunstanRecord, serializeRecord } from '../record/build.js';
import { checkerIdentity } from '../record/checker.js';
import { keyFingerprint, signRecordFile } from '../record/sign.js';
import { type UploadedArtifact, uploadArtifact, type ZipFile } from './artifact.js';
import {
  CHECK_NAME,
  type CheckRunResult,
  completeCheckRun,
  createCheckRun,
  ownJobCheckRun,
} from './check-run.js';
import { readEvent } from './event.js';
import { ActionError, type ActionInputs, input, parseInputs, type ReportSource } from './inputs.js';
import { conclusionFor, type Outcome, renderSummary, titleFor } from './outcome.js';

export const RECORD_FILE = 'dunstan-record.json';
export const ARTIFACT_NAME = 'dunstan-record';

export interface ActionIo {
  env: Record<string, string | undefined>;
  // The URL of the running bundle (action/dist/index.mjs), whose digest the record carries.
  artifact: string;
  fetch?: typeof fetch;
  // Tests only: stand other readers in for GitHub's, and another uploader in for the runner's.
  readers?: (client: GitHubClient) => EvidenceReaders;
  upload?: (name: string, files: readonly ZipFile[]) => Promise<UploadedArtifact>;
  log: (line: string) => void;
}

export interface ActionResult {
  outcome: Outcome;
  exitCode: number;
  recordPath?: string;
}

const FORK_NOTE =
  "This pull request comes from a fork. GitHub gives its `pull_request` workflow a read-only token, which cannot create check runs, so the result is in this job summary and the step's exit status only. A required `dunstan` check stays pending for it.";

async function readReport(
  source: ReportSource,
  pr: Parameters<typeof reportFromPullRequestBody>[1],
  client: GitHubClient,
): Promise<Report> {
  switch (source.kind) {
    case 'pr-body':
      return reportFromPullRequestBody(pr.repository, pr);
    case 'comment':
      return reportFromComment(client, pr.repository, pr.evidence.number, source.author);
    case 'file': {
      let bytes: Uint8Array;
      try {
        bytes = readFileSync(source.path);
      } catch (e) {
        throw new ActionError(
          `report file ${source.path} is unreadable (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`,
        );
      }
      return { bytes, source: { kind: 'file', locator: source.path } };
    }
  }
}

function mappingFor(record: DunstanRecord, inputs: ActionInputs): string {
  const verdict = record.predicate.verdict;
  if (verdict === 'pass') return 'Verdict `pass` concludes `success`.';
  if (verdict === 'fail') return 'Verdict `fail` concludes `failure`.';
  return inputs.unverifiableConclusion === 'neutral'
    ? 'Verdict `unverifiable` concludes `neutral` because this workflow sets `unverifiable-conclusion: neutral`. GitHub lets a merge through on a neutral required check.'
    : 'Verdict `unverifiable` concludes `failure`: a claim the record cannot answer is not a pass.';
}

function rerunLines(env: Record<string, string | undefined>, record: DunstanRecord): string[] {
  const p = record.predicate;
  const download =
    env.GITHUB_RUN_ID === undefined
      ? `# download the ${ARTIFACT_NAME} artifact of this run`
      : `gh run download ${env.GITHUB_RUN_ID} --repo ${p.subject.repository} --name ${ARTIFACT_NAME}`;
  return [
    download,
    `${p.rerun.offline}   # offline: recompute claims, verdict and digests`,
    `${p.rerun.online}    # online: re-read the sources, report evidence_changed`,
  ];
}

function describeError(e: unknown): { message: string; internal: boolean } {
  if (
    e instanceof ActionError ||
    e instanceof PullRequestUnreadable ||
    e instanceof ReportUnavailable
  ) {
    return { message: e.message, internal: false };
  }
  return { message: `internal error: ${(e as Error).message ?? String(e)}`, internal: true };
}

function escapeCommand(text: string): string {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export async function runAction(io: ActionIo): Promise<ActionResult> {
  const env = io.env;
  const notes: string[] = [];
  let client: GitHubClient | undefined;
  let repository: string | undefined;
  let headSha: string | undefined;
  let checkRunId: number | undefined;
  let canWriteCheckRun = true;
  let recordPath: string | undefined;
  let outcome: Outcome;

  try {
    // The event and the client come first, so that an unusable input is still reported on the
    // check run when the payload names the head commit.
    const event = readEvent(env, (path) => readFileSync(path));
    repository = event.repository;
    headSha = event.headSha;
    if (event.fork) {
      canWriteCheckRun = false;
      notes.push(FORK_NOTE);
    }
    const token = input(env, 'github-token');
    const api = new GitHubClient({
      token: token === '' ? undefined : token,
      baseUrl: env.GITHUB_API_URL || DEFAULT_API,
      ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
      warn: (message) => io.log(`::warning title=dunstan::${escapeCommand(message)}`),
    });
    client = api;

    const inputs = parseInputs(env);
    if (event.name === 'pull_request_target' && inputs.reportSource.kind === 'file') {
      throw new ActionError(
        'refused: under pull_request_target the report must come from the API (pr-body or comment:<login>), never from a file in the workspace, which may hold code from the pull request',
      );
    }

    let assurance: Assurance | undefined;
    if (inputs.sign !== undefined) {
      assurance = {
        status: 'signed',
        issuer: inputs.sign.signer,
        keyFingerprint: keyFingerprint(inputs.sign.keyPath),
      };
    }

    const record = await checkPullRequest({
      readers: io.readers?.(api) ?? githubReaders(api),
      repository: event.repository,
      number: event.number,
      afterPullRequest: async (pr) => {
        repository = pr.repository;
        headSha = pr.evidence.headSha;
        const own: number[] = [];
        if (canWriteCheckRun) {
          const created = await createCheckRun(api, pr.repository, pr.evidence.headSha, {
            status: 'in_progress',
            ...(env.GITHUB_SERVER_URL && env.GITHUB_RUN_ID
              ? {
                  details_url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
                }
              : {}),
          });
          if (created.ok) {
            checkRunId = created.id;
            own.push(created.id);
          } else {
            canWriteCheckRun = false;
            notes.push(
              `The \`${CHECK_NAME}\` check run could not be created (${created.error}): the token cannot write checks here (\`checks: write\` missing, or a read-only token). The result is in this job summary and the step's exit status only.`,
            );
          }
        }
        const job = await ownJobCheckRun(api, pr.repository, env);
        if (job === undefined) {
          notes.push(
            "This job's own check run could not be identified, so it was not excluded: a `checks` claim counts it, in progress.",
          );
        } else {
          own.push(job);
        }
        return own;
      },
      report: (pr) => readReport(inputs.reportSource, pr, api),
      checker: checkerIdentity(io.artifact),
      recordFile: RECORD_FILE,
      ...(assurance === undefined ? {} : { assurance }),
      advisory: inputs.advisory,
    });

    const dir = join(env.RUNNER_TEMP || tmpdir(), 'dunstan');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, RECORD_FILE);
    writeFileSync(out, serializeRecord(record));
    recordPath = out;

    const verdict = record.predicate.verdict;
    outcome = {
      conclusion: conclusionFor(verdict, inputs.unverifiableConclusion),
      verdict,
      title: titleFor(record),
      record,
      mapping: mappingFor(record, inputs),
      rerun: rerunLines(env, record),
      notes,
    };

    try {
      const files: ZipFile[] = [{ name: RECORD_FILE, bytes: readFileSync(out) }];
      if (inputs.sign !== undefined) {
        const sig = signRecordFile(out, inputs.sign.keyPath);
        files.push({ name: `${RECORD_FILE}.sig`, bytes: readFileSync(sig) });
      }
      const upload = io.upload ?? ((name, f) => uploadArtifact(env, io.fetch ?? fetch, name, f));
      const uploaded = await upload(ARTIFACT_NAME, files);
      io.log(
        `dunstan: uploaded artifact ${ARTIFACT_NAME} (id ${uploaded.id}, ${uploaded.size} bytes)`,
      );
    } catch (e) {
      // The record is the evidence: a verdict whose record is not kept cannot be re-run.
      outcome = {
        ...outcome,
        conclusion: 'failure',
        title: `error: record not uploaded (verdict ${verdict})`,
        error: (e as Error).message,
      };
      notes.push(
        `The record was not uploaded as \`${ARTIFACT_NAME}\` (${(e as Error).message}), so this run concludes \`failure\` whatever the verdict.`,
      );
    }
  } catch (e) {
    const { message, internal } = describeError(e);
    if (internal) io.log(`dunstan: ${(e as Error).stack ?? String(e)}`);
    outcome = {
      conclusion: 'failure',
      verdict: 'error',
      title: `error: ${message}`.slice(0, 250),
      error: message,
      notes,
    };
  }

  // The check run carries the outcome; when it cannot be written, the job summary says so.
  const output = { title: outcome.title, summary: renderSummary(outcome) };
  if (canWriteCheckRun) {
    let written: CheckRunResult | undefined;
    if (client !== undefined && repository !== undefined) {
      written =
        checkRunId !== undefined
          ? await completeCheckRun(client, repository, checkRunId, outcome.conclusion, output)
          : headSha !== undefined
            ? await createCheckRun(client, repository, headSha, {
                status: 'completed',
                conclusion: outcome.conclusion,
                output,
              })
            : undefined;
    }
    if (written === undefined) {
      notes.push(
        `No \`${CHECK_NAME}\` check run was written: the pull request's head commit is not known. A required \`${CHECK_NAME}\` check stays pending.`,
      );
    } else if (!written.ok) {
      notes.push(
        `The \`${CHECK_NAME}\` check run could not be written (${written.error}). A required \`${CHECK_NAME}\` check stays pending or in progress.`,
      );
    } else {
      io.log(`dunstan: check run ${CHECK_NAME} ${written.id}: ${outcome.conclusion}`);
    }
  }

  const summary = renderSummary(outcome);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(
      env.GITHUB_OUTPUT,
      `verdict=${outcome.verdict}\nrecord-path=${recordPath ?? ''}\n`,
    );
  }
  const line = `dunstan: ${outcome.conclusion}: ${outcome.title}`;
  io.log(outcome.conclusion === 'failure' ? `::error title=dunstan::${escapeCommand(line)}` : line);
  return {
    outcome,
    exitCode: outcome.conclusion === 'failure' ? 1 : 0,
    ...(recordPath === undefined ? {} : { recordPath }),
  };
}

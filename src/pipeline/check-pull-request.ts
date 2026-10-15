// One check of one pull request: read the subject, read the report the caller names, extract the
// block, read the evidence the block needs, build the record. `dunstan check`, the GitHub Action and
// the MCP tool all run exactly this, so the same report and the same evidence give the same record
// from any of them. The readers are injectable so a test can stand a fixture's evidence in for
// GitHub. A caller that has read the pull request or the block already passes it in, and that read
// is not repeated before the evidence; nothing after it differs.
//
// The pull request is read once more after the evidence. The files, the closing references and the
// pull request's commits are read by its number, at whatever head it has when they run; the check
// runs, the test records, the deployments and the paths are read at a commit the first read or the
// block names. If the pull request moved in between, the check runs once more from a fresh read, and
// if it moves again no record is written (PullRequestMoved).

import { type PathAnswer, pathsToRead, readingBlock } from '../advisory/advise.js';
import { extractClaims } from '../advisory/extract.js';
import type { Evidence } from '../check/types.js';
import {
  PullRequestMoved,
  type PullRequestRead,
  pullRequestMoves,
  type ReadEvidenceInput,
  type ReadPathObjectsInput,
  readEvidence,
  readPathObjects,
  readPullRequest,
} from '../evidence/github.js';
import type { GitHubClient } from '../evidence/http.js';
import type { Report } from '../evidence/report.js';
import {
  type Assurance,
  buildRecord,
  type CheckerIdentity,
  type DunstanRecord,
  type RecordBlock,
  recordBlock,
  rerunCommands,
} from '../record/build.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { sha256Hex } from '../spec/jcs.js';

export interface EvidenceReaders {
  // `record: false` is the read after the evidence, which is not a source.
  pullRequest: (
    repository: string,
    number: number,
    options?: { record?: boolean },
  ) => Promise<PullRequestRead>;
  evidence: (input: ReadEvidenceInput) => Promise<Evidence>;
  // The advisory's existence query (comparison 0.3.0). Called only with advisories on, and only
  // for paths the evidence leaves a file claim `differs:declared_not_changed`; never for the gate.
  pathObjects: (input: ReadPathObjectsInput) => Promise<PathAnswer[]>;
  // Forgets every source read so far, before the check runs once more from a fresh read.
  restart?: () => void;
}

export function githubReaders(client: GitHubClient): EvidenceReaders {
  return {
    pullRequest: (repository, number, options) =>
      readPullRequest(client, repository, number, options),
    evidence: (input) => readEvidence(client, input),
    pathObjects: (input) => readPathObjects(client, input),
    restart: () => client.sources.clear(),
  };
}

// Runs `collect` at one pull request: reads it (unless `first` is given), collects, and reads it
// again. If it moved, forgets what was read and runs once more from a fresh read; if it moves
// again, throws PullRequestMoved. `dunstan check`, the Action, the MCP tool and `dunstan rerun` all
// collect through this.
export async function atOnePullRequest<T>(
  readers: Pick<EvidenceReaders, 'pullRequest' | 'restart'>,
  repository: string,
  number: number,
  first: PullRequestRead | undefined,
  collect: (pr: PullRequestRead) => Promise<T>,
): Promise<T> {
  let pr = first ?? (await readers.pullRequest(repository, number));
  for (let run = 1; ; run++) {
    const collected = await collect(pr);
    const again = await readers.pullRequest(repository, number, { record: false });
    const moves = pullRequestMoves(pr, again);
    if (moves.length === 0) return collected;
    if (run === 2) throw new PullRequestMoved(repository, number, moves);
    readers.restart?.();
    pr = await readers.pullRequest(repository, number);
  }
}

export interface CheckPullRequestInput {
  readers: EvidenceReaders;
  repository: string;
  number: number;
  // The pull request, when the caller has read it already (the MCP tool reads it to name the record
  // file). Given, it is the first read: readers.pullRequest only reads the pull request again after
  // the evidence, and afresh if the check runs once more.
  pullRequest?: PullRequestRead;
  // Reads the report once the pull request is known. The invocation names it; it is never guessed.
  report: (pr: PullRequestRead) => Promise<Report>;
  // The block, when the caller has read it already (the MCP tool's block given as an object, read as
  // the content of a handback fence). Given, the report text is not searched for a fence.
  block?: RecordBlock;
  // Called once the pull request is read, before the report, and again after each fresh read when
  // the check runs once more; returns further check-run ids to exclude (the Action's own runs, spec
  // section 7.5).
  afterPullRequest?: (pr: PullRequestRead) => Promise<readonly number[]>;
  excludedCheckRunIds?: readonly number[];
  checker: CheckerIdentity;
  // The file name the record is written under, which the rerun commands name.
  recordFile: string;
  assurance?: Assurance;
  // Run the advisory extractor over the report (DRAFT 0.2.0, src/advisory/). Off by default. It
  // adds an advisory section and never changes the verdict or the claims.
  advisory?: boolean;
}

export async function checkPullRequest(input: CheckPullRequestInput): Promise<DunstanRecord> {
  return atOnePullRequest(input.readers, input.repository, input.number, input.pullRequest, (pr) =>
    checkAt(input, pr),
  );
}

async function checkAt(input: CheckPullRequestInput, pr: PullRequestRead): Promise<DunstanRecord> {
  const repository = pr.repository;
  const ownRuns = (await input.afterPullRequest?.(pr)) ?? [];
  const report = await input.report(pr);

  // WHATWG UTF-8 decode: a leading BOM is removed and an invalid sequence becomes U+FFFD.
  const text = new TextDecoder('utf-8').decode(report.bytes);
  const block = input.block ?? recordBlock(extractHandbackBlock(text));
  const found = block.status === 'found' ? block.value : null;
  const proposed = input.advisory === true ? extractClaims(text) : undefined;
  const evidence = await input.readers.evidence({
    repository,
    pullRequest: pr,
    block: proposed === undefined ? found : readingBlock(found, proposed, pr.evidence.headSha),
    excludedCheckRunIds: [...(input.excludedCheckRunIds ?? []), ...ownRuns],
  });
  // After the evidence, which decides which paths need asking. The answers go to the advisory
  // section, never into the evidence.
  const paths = proposed === undefined ? [] : pathsToRead(proposed, evidence, repository);
  const pathsAtHead =
    paths.length === 0
      ? []
      : await input.readers.pathObjects({ repository, headSha: pr.evidence.headSha, paths });

  return buildRecord({
    checker: input.checker,
    report: { sha256: sha256Hex(report.bytes), source: report.source },
    block,
    repository,
    evidence,
    rerun: rerunCommands(input.recordFile),
    ...(input.assurance === undefined ? {} : { assurance: input.assurance }),
    ...(proposed === undefined ? {} : { advisory: proposed, pathsAtHead }),
  });
}

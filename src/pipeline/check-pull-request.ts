// One check of one pull request: read the subject, read the report the caller names, extract the
// block, read the evidence the block needs, build the record. `dunstan check`, the GitHub Action and
// the MCP tool all run exactly this, so the same report and the same evidence give the same record
// from any of them. The readers are injectable so a test can stand a fixture's evidence in for
// GitHub. A caller that has read the pull request or the block already passes it in, and that read
// is not repeated; nothing after it differs.

import { readingBlock } from '../advisory/advise.js';
import { extractClaims } from '../advisory/extract.js';
import type { Evidence } from '../check/types.js';
import {
  type PullRequestRead,
  type ReadEvidenceInput,
  readEvidence,
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
  pullRequest: (repository: string, number: number) => Promise<PullRequestRead>;
  evidence: (input: ReadEvidenceInput) => Promise<Evidence>;
}

export function githubReaders(client: GitHubClient): EvidenceReaders {
  return {
    pullRequest: (repository, number) => readPullRequest(client, repository, number),
    evidence: (input) => readEvidence(client, input),
  };
}

export interface CheckPullRequestInput {
  readers: EvidenceReaders;
  repository: string;
  number: number;
  // The pull request, when the caller has read it already (the MCP tool reads it to name the record
  // file). Given, readers.pullRequest is not called.
  pullRequest?: PullRequestRead;
  // Reads the report once the pull request is known. The invocation names it; it is never guessed.
  report: (pr: PullRequestRead) => Promise<Report>;
  // The block, when the caller has read it already (the MCP tool's block given as an object, read as
  // the content of a handback fence). Given, the report text is not searched for a fence.
  block?: RecordBlock;
  // Called once the pull request is read, before the report; returns further check-run ids to
  // exclude (the Action's own runs, spec section 7.5).
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
  const pr = input.pullRequest ?? (await input.readers.pullRequest(input.repository, input.number));
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

  return buildRecord({
    checker: input.checker,
    report: { sha256: sha256Hex(report.bytes), source: report.source },
    block,
    repository,
    evidence,
    rerun: rerunCommands(input.recordFile),
    ...(input.assurance === undefined ? {} : { assurance: input.assurance }),
    ...(proposed === undefined ? {} : { advisory: proposed }),
  });
}

// Builds the record: an in-toto Statement v1 whose predicate is spec section 9. Every digest is
// SHA-256 over RFC 8785 bytes (section 10), computed with the src/spec helpers.

import {
  type AdvisorySection,
  advisoryDigest,
  advisorySection,
  type PathAnswer,
} from '../advisory/advise.js';
import type { ProposedClaim } from '../advisory/extract.js';
import { runChecks } from '../check/index.js';
import type { Block, Claim, Evidence, Verdict } from '../check/types.js';
import {
  type ReaderClaim,
  type ReaderClaimInput,
  readReaderClaim,
} from '../retrieval/reader-claims.js';
import {
  BLOCK_SUBJECT_NAME,
  DRAFT_PREDICATE_TYPE,
  DRAFT_SPEC_VERSION,
  PREDICATE_TYPE,
  SPEC_VERSION,
  STATEMENT_TYPE,
} from '../spec/constants.js';
import type { ExtractResult } from '../spec/extract.js';
import { canonicalize, sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { type BlockStatus, claimsDigest, evidenceDigest, overallVerdict } from '../spec/record.js';

export interface CheckerIdentity {
  name: string;
  version: string;
  digest: { sha256: string };
}

export type ReportSourceKind = 'pr-body' | 'pr-comment' | 'file' | 'stdin' | 'api';

export interface ReportInfo {
  sha256: string;
  source: { kind: ReportSourceKind; locator: string };
}

export interface RecordBlockError {
  code: string;
  pointer?: string;
  keyword?: string;
}

export type RecordBlock =
  | { status: 'found'; sha256: string; value: Block }
  | { status: 'missing'; reason: 'block_missing'; sha256: null; value: null }
  | { status: 'ambiguous'; reason: 'block_ambiguous'; count: number; sha256: null; value: null }
  | {
      status: 'invalid';
      reason: 'block_invalid';
      errors: RecordBlockError[];
      sha256: null;
      value: null;
    };

export type Assurance =
  | { status: 'unsigned'; issuer: 'self-generated' }
  | { status: 'signed'; issuer: string; keyFingerprint: string };

export interface RecordSubject {
  repository: string;
  pullRequest: number;
  headSha: string;
  mergeSha: string | null;
}

export interface Predicate {
  spec: string;
  checker: CheckerIdentity;
  report: ReportInfo;
  block: RecordBlock;
  subject: RecordSubject;
  evidence: Evidence;
  claims: Claim[];
  verdict: Verdict;
  // DRAFT 0.2.0 only. Reader claims do not enter `verdict`.
  readerClaims?: ReaderClaim[];
  // DRAFT 0.2.0 only. Advisories never enter `verdict` or `claims`.
  advisory?: AdvisorySection;
  digests: { claims: string; evidence: string; readerClaims?: string; advisory?: string };
  rerun: { offline: string; online: string };
  assurance: Assurance;
}

export interface StatementSubject {
  name: string;
  digest: Record<string, string>;
}

export interface DunstanRecord {
  _type: string;
  subject: StatementSubject[];
  predicateType: string;
  predicate: Predicate;
}

// The record's block member (spec section 9.4). Error messages are diagnostics and are not recorded.
export function recordBlock(extract: ExtractResult): RecordBlock {
  switch (extract.status) {
    case 'found':
      return { status: 'found', sha256: extract.sha256, value: extract.value as unknown as Block };
    case 'missing':
      return { status: 'missing', reason: 'block_missing', sha256: null, value: null };
    case 'ambiguous':
      return {
        status: 'ambiguous',
        reason: 'block_ambiguous',
        count: extract.count,
        sha256: null,
        value: null,
      };
    case 'invalid':
      return {
        status: 'invalid',
        reason: 'block_invalid',
        errors: extract.errors.map((e) => {
          const error: RecordBlockError = { code: e.code };
          if (e.pointer !== undefined) error.pointer = e.pointer;
          if (e.keyword !== undefined) error.keyword = e.keyword;
          return error;
        }),
        sha256: null,
        value: null,
      };
  }
}

// A checker that is not given a found block produces no rows (spec section 7.1).
export function claimsFor(block: RecordBlock, evidence: Evidence, repository: string): Claim[] {
  return block.status === 'found' ? runChecks(block.value, evidence, repository) : [];
}

export function statementSubjects(block: RecordBlock, subject: RecordSubject): StatementSubject[] {
  const subjects: StatementSubject[] = [
    {
      name: `git+https://github.com/${subject.repository}@${subject.headSha}`,
      digest: { gitCommit: subject.headSha },
    },
  ];
  if (block.status === 'found') {
    subjects.push({ name: BLOCK_SUBJECT_NAME, digest: { sha256: block.sha256 } });
  }
  return subjects;
}

export function rerunCommands(recordFile: string): { offline: string; online: string } {
  return { offline: `dunstan verify ${recordFile}`, online: `dunstan rerun ${recordFile}` };
}

export interface BuildInput {
  checker: CheckerIdentity;
  report: ReportInfo;
  block: RecordBlock;
  repository: string;
  evidence: Evidence;
  rerun: { offline: string; online: string };
  assurance?: Assurance;
  // Typed claims a reader extracted from the report. Given, the record is written to DRAFT 0.2.0;
  // absent, it is a 0.1 record exactly as before.
  readerClaims?: ReaderClaimInput[];
  // Claims the advisory extractor proposed from the report (src/advisory/). Given, even empty, the
  // record is written to DRAFT 0.2.0 with an advisory section; the verdict and claims are the same.
  advisory?: readonly ProposedClaim[];
  // What the existence query answered for those claims' `pathsToRead` (comparison 0.3.0). A path
  // with no answer here is recorded unreadable. Never evidence: it is recorded in the advisory
  // section, so `digests.evidence` and `digests.claims` are the same with or without it.
  pathsAtHead?: readonly PathAnswer[];
}

export function readerClaimsDigest(readerClaims: readonly ReaderClaim[]): string {
  return sha256Canonical(readerClaims as unknown as JsonValue);
}

export function buildRecord(input: BuildInput): DunstanRecord {
  const { evidence, block, repository } = input;
  const pr = evidence.pullRequest;
  // The subject is always read, never taken from the block (spec section 6).
  const subject: RecordSubject = {
    repository,
    pullRequest: pr.number,
    headSha: pr.headSha,
    mergeSha: pr.mergeSha,
  };
  const claims = claimsFor(block, evidence, repository);
  const readerClaims = input.readerClaims?.map((c) => readReaderClaim(c, evidence, repository));
  const advisory =
    input.advisory === undefined
      ? undefined
      : advisorySection(input.advisory, evidence, repository, input.pathsAtHead ?? []);
  const record: DunstanRecord = {
    _type: STATEMENT_TYPE,
    subject: statementSubjects(block, subject),
    predicateType: PREDICATE_TYPE,
    predicate: {
      spec: SPEC_VERSION,
      checker: input.checker,
      report: input.report,
      block,
      subject,
      evidence,
      claims,
      verdict: overallVerdict(block.status as BlockStatus, claims),
      digests: {
        claims: claimsDigest(claims as unknown as JsonValue),
        evidence: evidenceDigest(evidence as unknown as JsonValue),
      },
      rerun: input.rerun,
      assurance: input.assurance ?? { status: 'unsigned', issuer: 'self-generated' },
    },
  };
  if (readerClaims !== undefined || advisory !== undefined) {
    record.predicateType = DRAFT_PREDICATE_TYPE;
    record.predicate.spec = DRAFT_SPEC_VERSION;
  }
  if (readerClaims !== undefined) {
    record.predicate.readerClaims = readerClaims;
    record.predicate.digests.readerClaims = readerClaimsDigest(readerClaims);
  }
  if (advisory !== undefined) {
    record.predicate.advisory = advisory;
    record.predicate.digests.advisory = advisoryDigest(advisory);
  }
  return record;
}

// An unsigned record is written pretty-printed; a signed one as exactly its JCS bytes (section 11).
export function serializeRecord(record: DunstanRecord): string {
  return record.predicate.assurance.status === 'signed'
    ? canonicalize(record as unknown as JsonValue)
    : `${JSON.stringify(record, null, 2)}\n`;
}

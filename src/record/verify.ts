// Offline verification of a record (spec section 12): recompute the claims and the verdict from
// block.value and evidence, recompute the three digests, check the subject digests, and compare every
// recomputed value with the recorded one byte for byte. Uses only the record; no network.

import { advisoryDigest, COMPARISON, compareAdvisory, pathsToRead } from '../advisory/advise.js';
import { EXTRACTOR } from '../advisory/grammar.js';
import { differsAccuracyFor, precisionFor } from '../advisory/precision.js';
import type { Evidence } from '../check/types.js';
import { checkReaderClaim } from '../retrieval/reader-claims.js';
import { DRAFT_PREDICATE_TYPE } from '../spec/constants.js';
import { canonicalize, sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { type BlockStatus, claimsDigest, evidenceDigest, overallVerdict } from '../spec/record.js';
import { validateDraftRecord, validateRecord } from '../spec/schema.js';
import { claimsFor, type DunstanRecord, readerClaimsDigest, statementSubjects } from './build.js';
import { CHECKER_NAME, CHECKER_VERSION } from './checker.js';

export interface VerifyProblem {
  // A JSON Pointer to the record member that differs or is invalid.
  member: string;
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  problems: VerifyProblem[];
  record?: DunstanRecord;
}

function same(a: unknown, b: unknown): boolean {
  return canonicalize(a as JsonValue) === canonicalize(b as JsonValue);
}

function isDraft(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { predicateType?: unknown }).predicateType === DRAFT_PREDICATE_TYPE
  );
}

export function verifyRecord(value: unknown): VerifyResult {
  const draft = isDraft(value);
  const schemaErrors = draft ? validateDraftRecord(value) : validateRecord(value);
  if (schemaErrors.length > 0) {
    return {
      ok: false,
      problems: schemaErrors.map((e) => ({
        member: e.pointer,
        message: `schema_violation (${e.keyword}): ${e.message}`,
      })),
    };
  }
  const record = value as DunstanRecord;
  const p = record.predicate;
  const problems: VerifyProblem[] = [];
  const differ = (member: string, recorded: unknown, recomputed: unknown) => {
    if (!same(recorded, recomputed)) {
      problems.push({
        member,
        message: `recorded ${canonicalize(recorded as JsonValue)}, recomputed ${canonicalize(recomputed as JsonValue)}`,
      });
    }
  };

  // The recomputation is this checker's; a record written by another checker version is re-run with
  // that version (its rerun.offline command), not with this one.
  if (p.checker.name !== CHECKER_NAME || p.checker.version !== CHECKER_VERSION) {
    problems.push({
      member: '/predicate/checker',
      message: `record was written by ${p.checker.name} ${p.checker.version}; this is ${CHECKER_NAME} ${CHECKER_VERSION}`,
    });
    return { ok: false, problems, record };
  }

  if (p.block.status === 'found') {
    differ(
      '/predicate/block/sha256',
      p.block.sha256,
      sha256Canonical(p.block.value as unknown as JsonValue),
    );
  }

  const evidence: Evidence = p.evidence;
  const pr = evidence.pullRequest;
  differ('/predicate/subject/pullRequest', p.subject.pullRequest, pr.number);
  differ('/predicate/subject/headSha', p.subject.headSha, pr.headSha);
  differ('/predicate/subject/mergeSha', p.subject.mergeSha, pr.mergeSha);
  differ('/subject', record.subject, statementSubjects(p.block, p.subject));

  const claims = claimsFor(p.block, evidence, p.subject.repository);
  if (!same(p.claims, claims)) {
    const index = claims.findIndex((c, i) => !same(c, p.claims[i]));
    const at = index === -1 ? claims.length : index;
    problems.push({
      member: `/predicate/claims/${at}`,
      message: `recorded ${canonicalize((p.claims[at] ?? null) as JsonValue)}, recomputed ${canonicalize((claims[at] ?? null) as JsonValue)}`,
    });
  }
  differ('/predicate/verdict', p.verdict, overallVerdict(p.block.status as BlockStatus, claims));
  differ(
    '/predicate/digests/claims',
    p.digests.claims,
    claimsDigest(claims as unknown as JsonValue),
  );
  differ(
    '/predicate/digests/evidence',
    p.digests.evidence,
    evidenceDigest(evidence as unknown as JsonValue),
  );

  // DRAFT 0.2.0: each reader claim's check is recomputed from its recorded candidates, never from a
  // fresh retrieval, so the verdict reproduces even where retrieval would now rank differently.
  if (draft && p.readerClaims !== undefined) {
    p.readerClaims.forEach((claim, i) => {
      const { observed, verdict, reason } = claim;
      differ(
        `/predicate/readerClaims/${i}`,
        reason === undefined ? { observed, verdict } : { observed, verdict, reason },
        checkReaderClaim(claim, evidence, p.subject.repository),
      );
    });
    differ(
      '/predicate/digests/readerClaims',
      p.digests.readerClaims,
      readerClaimsDigest(p.readerClaims),
    );
  }

  // DRAFT 0.2.0: each advisory's note is recomputed from its recorded kind and value. The report
  // text is not in the record, so extraction is not re-run; the extractor's version and digest name
  // the grammar that ran, the comparison's version names the rules the notes came from, the
  // precision must be the one published for that grammar, and the accuracy of `differs` notes the
  // one published for that grammar and that comparison. Under comparison 0.3.0 a file claim's note
  // is recomputed from the recorded answers of the existence query, never from a fresh read, and
  // the record must answer exactly the paths its claims need.
  if (draft && p.advisory !== undefined) {
    const a = p.advisory;
    const pathsAtHead = a.pathsAtHead;
    differ('/predicate/advisory/extractor', a.extractor, EXTRACTOR);
    differ('/predicate/advisory/comparison', a.comparison, COMPARISON);
    differ('/predicate/advisory/precision', a.precision, precisionFor(EXTRACTOR.digest.sha256));
    differ(
      '/predicate/advisory/differsAccuracy',
      a.differsAccuracy,
      differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON.version),
    );
    differ(
      '/predicate/advisory/pathsAtHead',
      pathsAtHead.map((answer) => answer.path),
      pathsToRead(a.advisories, evidence, p.subject.repository),
    );
    a.advisories.forEach((advisory, i) => {
      differ(
        `/predicate/advisory/advisories/${i}`,
        { observed: advisory.observed, note: advisory.note },
        compareAdvisory(advisory, evidence, p.subject.repository, pathsAtHead),
      );
    });
    differ('/predicate/digests/advisory', p.digests.advisory, advisoryDigest(a));
  }

  return { ok: problems.length === 0, problems, record };
}

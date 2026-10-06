// The advisory prose layer (spec/claim-format.md, "DRAFT 0.2.0", D.11; docs/advisory.md).

export {
  type Advisory,
  type AdvisorySection,
  adviseClaims,
  advisoryDigest,
  advisorySection,
  COMPARISON,
  COMPARISON_VERSION,
  type ComparisonIdentity,
  compareAdvisory,
  readingBlock,
} from './advise.js';
export { extractClaims, type ProposedClaim, repoPath, type Span } from './extract.js';
export {
  ADVISORY_KINDS,
  type AdvisoryKind,
  EXTRACTOR,
  EXTRACTOR_VERSION,
  type ExtractorIdentity,
  GRAMMAR,
} from './grammar.js';
export {
  countOf,
  type DiffersAccuracy,
  differsAccuracyFor,
  differsAccuracyText,
  type Figure,
  type Interval,
  type Precision,
  PUBLISHED_DIFFERS_ACCURACY,
  PUBLISHED_PRECISION,
  type PublishedDiffersAccuracy,
  type PublishedPrecision,
  precisionFor,
  precisionText,
  UNMEASURED,
} from './precision.js';
export {
  ADVISORY_LINE,
  advisoryLine,
  isPossibleDisagreement,
  noteText,
  POSSIBLE_DISAGREEMENT,
  RECORD_SHOWS,
} from './present.js';

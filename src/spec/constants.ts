// The values the spec (spec/claim-format.md) names. Each lives here once; the schemas carry the same
// strings and src/spec/schema.test.ts checks that they agree.

export const SPEC_VERSION = '0.1.3';

// The `dunstan` field a block declares: the spec's major.minor.
export const BLOCK_VERSION = '0.1';

// The block versions this module implements. While the major is 0, each minor is its own major
// (semver item 4), so "0.2" is refused as unsupported_version, not read as a 0.1 block.
export const SUPPORTED_BLOCK_VERSIONS: readonly string[] = [BLOCK_VERSION];

export const BLOCK_INFO_STRING = 'dunstan-handback';

export const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';

// Open for the operator: the domain may change before the repository goes public.
export const PREDICATE_TYPE = 'https://barglabs.ai/dunstan/record/v0.1';

// DRAFT 0.2.0 (spec/claim-format.md, "DRAFT 0.2.0"; record-0.2-draft.schema.json), for the
// operator to check. A record is written to it only when it carries reader claims; every other
// record stays 0.1.
export const DRAFT_SPEC_VERSION = '0.2.0-draft';
export const DRAFT_PREDICATE_TYPE = 'https://barglabs.ai/dunstan/record/v0.2-draft';

export const BLOCK_SUBJECT_NAME = 'handback-block';

// Namespace for `ssh-keygen -Y sign -n` over a record's JCS bytes.
export const SIGNATURE_NAMESPACE = 'dunstan-record';

// A block nested deeper than this is invalid_json, so every checker refuses the same inputs.
export const MAX_BLOCK_DEPTH = 32;

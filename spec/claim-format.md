# The Dunstan claim format

Version 0.1.1. Draft. Licensed under Apache-2.0 (`spec/LICENSE`).

A coding agent that finishes a task writes a completion report. This specification defines a block
the agent declares inside that report, the checks a checker runs on each declared field against the
repository's own record, and the record the checker writes, which anyone can re-run and get the same
verdict.

## Contents

1. [Conventions](#1-conventions)
2. [Principles](#2-principles)
3. [Embedding the block in a report](#3-embedding-the-block-in-a-report)
4. [The block](#4-the-block)
5. [Reading the block](#5-reading-the-block)
6. [Evidence](#6-evidence)
7. [Claims and checks](#7-claims-and-checks)
8. [The overall verdict](#8-the-overall-verdict)
9. [The record](#9-the-record)
10. [Canonical bytes and digests](#10-canonical-bytes-and-digests)
11. [Signature](#11-signature)
12. [Re-running a record](#12-re-running-a-record)
13. [Versioning](#13-versioning)
14. [Security and privacy](#14-security-and-privacy)
15. [Examples](#15-examples)
16. [Reason codes](#16-reason-codes)
17. [Changes](#17-changes)

Not part of 0.1.1: [DRAFT 0.2.0: reader claims and retrieval](#draft-020-reader-claims-and-retrieval),
with [advisories from prose](#d11-advisories-from-prose), for the operator to check.

## 1. Conventions

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT and MAY are to be interpreted as in BCP 14
(RFC 2119, RFC 8174) when, and only when, they appear in capitals.

The schemas are normative: `spec/schema/handback-block-0.1.schema.json` for the block and
`spec/schema/record-0.1.schema.json` for the record, both JSON Schema 2020-12. Where this text and a
schema disagree, the schema governs what is valid and this text governs what a valid value means.

A JSON Pointer is as in RFC 6901. "Code-unit order" is ascending order of UTF-16 code units, the
order RFC 8785 uses for member names. Timestamps are RFC 3339 in UTC with a `Z` offset.

Version 0.1 defines evidence for repositories hosted on GitHub.

## 2. Principles

These hold for every part of this specification. An extension that breaks one is not a Dunstan
extension.

- **No model decides.** A verdict is a pure function of the block and the evidence. Nothing in a
  checker scores, classifies or interprets prose.
- **Fail closed.** A claim the record cannot answer is `unverifiable`, never `pass`. A report with no
  block, two blocks or an invalid block is `unverifiable`.
- **Re-runnable.** A record carries everything needed to recompute its verdict offline, and the
  command to re-run it online.
- **Evidence, not a gate.** A record states a verdict. The consumer's own gate decides what blocks a
  merge or a deploy.
- **No probabilities.** No probability, score, confidence or judgment of prose appears anywhere in a
  record.
- **Metadata, not source.** Evidence is pull request state, file lists, commit ids, check runs,
  closing references, test-report counts and deployments. A checker MUST NOT read, store or digest
  the contents of repository files.

## 3. Embedding the block in a report

A report is text. It is decoded as UTF-8 (the WHATWG UTF-8 decode: a leading byte order mark is
removed, and an invalid byte sequence becomes U+FFFD). The report's digest (section 9.4) is taken over
the bytes as received, before decoding.

A report carries its block as a fenced code block whose info string is exactly `dunstan-handback`,
containing one JSON object. A checker MUST find blocks with the following line algorithm and MUST NOT
use a general Markdown parser, so that every checker finds the same blocks in the same report.

1. Replace every CRLF, then every remaining CR, with LF. Split the text into lines on LF.
2. Scan the lines in order, outside any fence to start with.
3. Outside a fence, a line is an **opening fence** if it is up to three spaces, then a run of three
   or more backticks or three or more tildes, then the rest of the line. The **info string** is the
   rest of the line with leading and trailing spaces and tabs removed. A backtick run whose info
   string contains a backtick is not a fence. Every opening fence opens a fence, whatever its info
   string; it is a **handback fence** if its info string is exactly `dunstan-handback` (case
   sensitive, nothing before or after it).
4. Inside a fence, a line is the **closing fence** if it is up to three spaces, then a run of the
   opening character at least as long as the opening run, then only spaces and tabs. Every other
   line inside a fence is content. A fence opened inside another fence is content: a handback block
   quoted inside a longer fence (a four-backtick Markdown example, say) is not a declaration.
5. The content of a handback fence is its content lines joined with LF.
6. A handback fence still open at the end of the text is counted, and is `unterminated`.

A fence indented four or more spaces, or inside a block quote or list item, is not recognised.

The report MUST contain exactly one handback fence.

| Handback fences found | Block status | Reason |
| --- | --- | --- |
| 0 | `missing` | `block_missing` |
| 2 or more (terminated or not) | `ambiguous`, with the count | `block_ambiguous` |
| 1, unterminated | `invalid` | `block_invalid` (`unterminated_fence`) |
| 1, content fails section 5 | `invalid` | `block_invalid` (the error code) |
| 1, content passes section 5 | `found` | none |

A checker MUST NOT choose one of several blocks: two blocks are `ambiguous`, never "the first".

Which text is the report (a pull request body, one comment, a file, standard input, an API request)
is decided by the invocation, not by this specification. The invocation names exactly one report.

## 4. The block

The block is one JSON object. Its fields in version 0.1:

| Field | Required | Value |
| --- | --- | --- |
| `dunstan` | yes | The spec version the block is written to, major and minor: `"0.1"`. |
| `headCommit` | yes | The 40-character lowercase hexadecimal id of the commit the report describes. |
| `filesChanged` | yes | Every repository-relative path the pull request changes. No duplicates. |
| `tests` | no | Test runs: `[{command, count, failures?, record}]`, at least one. |
| `checks` | no | `{total?, allSucceeded?}`, at least one member. |
| `references` | no | `[{issue, relation}]` or `[{commit, relation}]`, at least one. |
| `mergedAt` | no | When the pull request was merged, RFC 3339 UTC. |
| `deployedAt` | no | `{at, environment}`: a successful deployment to `environment` by `at`. |

Any other top-level member makes the block invalid (`additionalProperties: false`). Strictness is what
makes a declared field exact: a misspelt field is an error, not a silently skipped claim.

**Paths.** A repository-relative path is one or more segments separated by `/`. No segment is empty,
`.` or `..`, and there is no leading or trailing `/`. Paths are compared as exact strings: case
sensitive, with no Unicode normalisation.

**`tests[]`.** `command` is the command the agent ran, recorded and not checked. `count` is the number
of test cases executed. `failures`, if present, is the number that failed or errored. `record` names
the machine-readable test record the numbers are compared with. Version 0.1 defines one kind:

```json
{ "kind": "junit", "workflow": ".github/workflows/ci.yml", "job": "test",
  "artifact": "junit-report", "path": "reports/junit.xml" }
```

`workflow` is the workflow file's path from the repository root, `job` the job's name as the run
records it, `artifact` the name of an artifact the run uploaded, and `path` the JUnit XML file's path
inside that artifact. A `junit` record MUST have exactly these members. A record of any other `kind`
is legal, with any other members, and its claims are `unverifiable` with
`no_comparable_record_field` (section 7.4).

**`references[]`.** `{issue: "#N" | "owner/repo#N", relation: "closes" | "cites"}`, or
`{commit: "<40 hex>", relation: "cites"}`. `#N` names issue or pull request N in the subject
repository. A commit is always in the subject repository.

**What the block does not carry.** The subject (repository and pull request) is not in the block. It
comes from the invocation (an Action's context, command-line flags, an MCP or API request) and is
recorded in the record. A block that names its own repository is invalid.

## 5. Reading the block

A checker reads the content of the one handback fence in this order and stops at the first error.

1. **JSON.** The content MUST be one JSON value under RFC 8259, with the I-JSON (RFC 7493)
   restrictions: no lone surrogates in any string, and no number outside the IEEE 754 double range.
   Arrays and objects MUST NOT nest more than 32 deep. Otherwise: `invalid_json`.
2. **Duplicate names.** No object may contain two members whose names are equal after unescaping.
   Otherwise: `duplicate_member`, with the pointer to the second member. (Parsers disagree on which
   duplicate wins, so a block with one is not one declaration.)
3. **Version.** If the value is an object whose `dunstan` member is a string of the form
   `major.minor` (both non-negative integers without leading zeros), and the checker does not
   implement that version (section 13): `unsupported_version`.
4. **Schema.** The value MUST validate against the block schema for the version. Otherwise:
   `schema_violation`, with at least one error giving the instance pointer and the failing JSON
   Schema keyword.

The error codes are exactly these five: `unterminated_fence`, `invalid_json`, `duplicate_member`,
`unsupported_version`, `schema_violation`. Any of them gives block status `invalid` and reason
`block_invalid`. Error messages are diagnostics; two checkers MAY word them differently, and MAY
report different schema keywords for the same invalid block.

A block that passes all four is `found`. Its digest is SHA-256 over its canonical bytes (section 10),
so reformatting the block does not change it.

## 6. Evidence

Evidence is the metadata a checker read, as a snapshot sufficient to recompute every claim offline.
The record schema defines its shape. Its sections:

| Section | Read when | Holds |
| --- | --- | --- |
| `pullRequest` | always | state, `merged`, `mergedAt`, `headSha`, `mergeSha`, `changedFiles` |
| `files` | always, if a block was found | the changed-file entries `{path, status, previousPath?}` and `complete` |
| `closingReferences` | a `closes` reference is declared | the pull request's closing issues, as `owner/repo#N` |
| `references` | a `cites` reference is declared, or a `closes` issue is not among the closing references | per cited issue or commit, and per such `closes` issue: `exists`, and for a commit `reachableFromHead` |
| `checkRuns` | `checks` is declared | the check runs at `headCommit`, and any `excludedIds` |
| `testRecords` | a `junit` test record is declared | per distinct record: the candidate runs and their counts |
| `deployments` | `deployedAt` is declared | the candidate deployments to that environment (section 7.6), each with its `relation` to the pull request |
| `sources` | always | one entry per read: `{kind, locator, sha256, etag?, readAt, error?}` |

**Read status.** Every section except `pullRequest` and `sources`, and every entry of `references`,
`testRecords` and `deployments`, carries a `status`:

- `ok`: the source answered with the data.
- `unreadable`, with the source `kind`: the read errored (any HTTP error other than the not-found
  cases below, a rate limit, a timeout, an unparseable body). Claims that depend on it are
  `unverifiable` with `source_unreadable:<kind>`.
- `unpopulated`, with the `field`: the source answered but without the field the claim needs (for
  example the GraphQL `closingIssuesReferences` connection absent or null). Claims that depend on it
  are `unverifiable` with `evidence_field_unpopulated:<field>`. A checker MUST NOT read an absent
  field as empty: an empty list is evidence that nothing is there, an absent one is no evidence.

A checker that cannot read the pull request MUST NOT write a record: a record's subject is always read,
never taken from the block.

**Not found.** An issue, pull request or commit is `exists: false` only when the repository holding it
was read successfully and the item's own read answered not found (HTTP 404 or 410). GitHub answers not
found for a repository the reader cannot see, so a not-found repository is `unreadable` with kind
`repository`, never `exists: false`.

**Source kinds.** `pull_request`, `pull_request_files`, `closing_references`, `repository`, `issue`,
`commit`, `compare`, `check_runs`, `workflow_runs`, `artifact`, `deployments`.

**Sources.** `locator` names the request (method and path, or the GraphQL field read). `sha256` is
over the response body bytes as received. `etag` is the response's ETag, if any. `error` is present
when the read failed: `http_<status>`, `network` or `parse`. `readAt` is when the read completed. A
paginated read is one entry per page; if any page is unreadable, the section is unreadable.

**Determinism.** So that two checkers reading the same answers write the same evidence: `files.entries`
are in code-unit order of `path`; `closingReferences.issues` in code-unit order; `checkRuns.runs` and
`deployments[].deployments` in ascending `id`; `testRecords[].runs` in ascending `runId`;
`references`, `testRecords` and `deployments` in order of first appearance in the block, one entry per
distinct reference, record or environment; `sources` in code-unit order of `kind`, then of `locator`,
one entry per locator.

## 7. Claims and checks

### 7.1 Claim rows

Each declared field produces one or more claim rows:

```json
{ "id": "count:/tests/0/count", "check": "count", "field": "/tests/0/count",
  "declared": 40, "observed": 38, "verdict": "fail", "reason": "count_mismatch" }
```

- `check` is one of `head`, `scope`, `reference`, `count`, `time`.
- `field` is the JSON Pointer to the declared value in the block.
- `id` is `<check>:<field>`, except for the omission rows of section 7.3.
- `declared` is the declared value; `observed` is what the evidence gives, or `null` when the claim is
  `unverifiable`.
- `verdict` is `pass`, `fail` or `unverifiable`. A `fail` or `unverifiable` row MUST carry a `reason`
  (section 16); a `pass` row MUST NOT.

Rows appear in this order: head; scope rows for `filesChanged` in block order, then omission rows in
code-unit order of path; reference rows in block order; count rows for each `tests[]` item in block
order (`count`, then `failures`), then `checks.total`, then `checks.allSucceeded`; `mergedAt`; then
`deployedAt`.

A checker that is not given a found block produces no rows.

### 7.2 Head

One row, `head:/headCommit`. It passes if `headCommit` equals the pull request's head SHA at read time
(`pullRequest.headSha`), and otherwise fails with `head_mismatch`. `observed` is the head SHA.

### 7.3 Scope, both ways

The **changed set** is every `path`, and every `previousPath`, in `files.entries`. A renamed or copied
file is declared if either its old or its new path is declared.

- **Declared, not changed.** Each `filesChanged[i]` is a row `scope:/filesChanged/<i>`. It passes if
  the path is in the changed set (`observed` is the matching entry's `path`), and otherwise fails with
  `declared_not_changed`.
- **Changed, not declared.** Each entry neither of whose paths is declared is its own row, with `id`
  `scope:undeclared:<path>`, `field` `/filesChanged`, `declared` `null`, `observed` the entry's path,
  verdict `fail`, reason `undeclared_file`. This is the omission check. An omission never passes, and
  is never folded into another row.

If the list is incomplete (`files.complete` is `false`), every scope row is `unverifiable` with
`file_list_truncated`, and a single omission row `scope:undeclared` (`field` `/filesChanged`,
`declared` and `observed` `null`) stands for the files that could not be listed. `complete` MUST be
`false` when the listing returned fewer entries than `pullRequest.changedFiles`, or reached the API's
limit of 3,000 files. If the list is unreadable, the same rows are `unverifiable` with
`source_unreadable:pull_request_files`.

### 7.4 References

One row per `references[i]`, `reference:/references/<i>`. `#N` resolves to `owner/repo#N` in the
subject repository.

- **`closes`** passes only if the issue is among the pull request's closing references as the API
  records them (GraphQL `closingIssuesReferences`). Text in the pull request body that GitHub did not
  record as closing does not count. GitHub leaves out of that list any issue whose repository the
  reader cannot see, so an issue missing from the list does not by that alone fail: the checker
  reads the issue as it reads a cited one (section 6, "Not found"), and the claim is
  - `unverifiable` with `source_unreadable:repository` if the issue's repository is unreadable;
  - `unverifiable` with `source_unreadable:issue` if the issue's read errors;
  - `fail` with `not_found` if the issue does not exist;
  - `fail` with `not_closing` if the issue exists.

  `observed` is `{closing: [...]}`, with `exists: false` added for `not_found`.
- **`cites`, issue or pull request,** passes if it exists, and otherwise fails with `not_found`.
  `observed` is `{exists}`.
- **`cites`, commit,** passes if the commit exists in the subject repository and is reachable from the
  observed head (it is the head, or an ancestor of it). A missing commit fails with `not_found`, an
  unreachable one with `not_reachable`. `observed` is `{exists, reachableFromHead}`.

A field the reader could not read is `unverifiable` (`evidence_field_unpopulated:<field>` or
`source_unreadable:<kind>`), never `fail`.

### 7.5 Counts

**Tests.** For `tests[i]` with a `junit` record, the **candidate runs** are the runs of that workflow
file whose head SHA is `headCommit`, each at its latest attempt, that have a job named `job` and an
artifact named `artifact` containing a file at `path`. In that file, a test case is a `testcase`
element. It is **executed** unless it has a `skipped` child, and **failed** if it is executed and has a
`failure` or `error` child; each test case counts once. Suite-level count attributes are not used.

- `count:/tests/<i>/count` compares `count` with the executed test cases.
- `count:/tests/<i>/failures`, if `failures` is declared, compares it with the failed test cases.

Each passes if equal and fails with `count_mismatch` if not. With no candidate run, the rows are
`unverifiable` with `record_not_found`. With several candidate runs (for example one per triggering
event) that agree on the number, that number is used; if they disagree, `unverifiable` with
`record_ambiguous`. A checker MUST NOT pick one run. A file that is not well-formed JUnit XML makes
the artifact read `unreadable`.

For a record of any other kind the rows are `unverifiable` with `no_comparable_record_field`. A test
count is never compared with a check-run total, or with anything other than the record it names.

**Checks.** The check runs are those the API lists for `headCommit` (latest run per name), less any
the checker excluded: a checker running inside a check run MUST exclude that run and list its id in
`checkRuns.excludedIds`.

- `count:/checks/total` compares `total` with the number of check runs; `count_mismatch` if unequal.
- `count:/checks/allSucceeded` compares `allSucceeded` with an observed value: `false` if any
  completed run's conclusion is anything other than `success` (including `skipped` and `neutral`);
  otherwise `unverifiable` with `checks_incomplete` if any run is not completed; otherwise `true`. It
  fails with `all_succeeded_mismatch` if the declared and observed values differ. With no check runs
  at all it is `unverifiable` with `no_check_runs`: a vacuous truth is not a pass.

### 7.6 Time

Times are compared to the second: fractional seconds are discarded before comparing.

- `time:/mergedAt` fails with `not_merged` if the pull request is not merged, and with `premature` if
  the declared time is earlier than the recorded merge time. Otherwise it passes. `observed` is the
  recorded merge time. A merged pull request without a recorded merge time is `unverifiable` with
  `evidence_field_unpopulated:merged_at`.
- `time:/deployedAt` compares the declared `{at, environment}` with the deployments to `environment`.
  - **Candidates.** The deployments of the head commit, plus, for a merged pull request, every
    deployment created at or after the recorded merge time and at or before `at`. The evidence lists
    every candidate, so two checkers reading the same answers list the same deployments.
  - **Relation.** Each candidate carries `relation`: `head` (its commit is the head commit), `merge`
    (the merge commit), `descendant` (a commit that has the merge commit as an ancestor, read with
    the compare API), `unrelated` (compare answered and it is not a descendant), or `unknown` (the
    compare read failed). For a pull request that is not merged, only `head` applies.
  - **Verdict.** The claim passes if a candidate with relation `head`, `merge` or `descendant` has a
    `success` status created at or before `at`; `observed` is the earliest such success time.
    Otherwise, if a candidate with relation `unknown` has such a success, the claim is
    `unverifiable` with `source_unreadable:compare`. Otherwise it fails with `no_deployment`.
  - A deployment of a later commit on the base branch therefore counts once the merge commit is its
    ancestor (decided 2026-10-04).

### 7.7 Unreadable sources

Any evidence source that errors makes every claim depending on it `unverifiable` with
`source_unreadable:<kind>`, whatever the declared value.

## 8. The overall verdict

1. `fail` if any claim row fails.
2. Otherwise `unverifiable` if the block status is not `found`, if any row is `unverifiable`, or if
   there are no rows. An empty result is a claim, and it does not pass.
3. Otherwise `pass`.

A failing row decides the verdict even beside unverifiable rows: a claim the record contradicts is a
fail whatever else could not be read.

## 9. The record

A record is an in-toto Statement v1, the shape Cejel's attestations use, so a consumer that ingests
one ingests the other.

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [ ... ],
  "predicateType": "https://barglabs.ai/dunstan/record/v0.1",
  "predicate": { ... }
}
```

### 9.1 Subject

1. The head commit: `{"name": "git+https://github.com/<owner>/<repo>@<sha>", "digest": {"gitCommit":
   "<sha>"}}`, where `<sha>` is the observed head (`predicate.subject.headSha`).
2. When the block status is `found`, and only then, the block: `{"name": "handback-block", "digest":
   {"sha256": "<block.sha256>"}}`.

### 9.2 Predicate type

`https://barglabs.ai/dunstan/record/v0.1`. It names the major and minor version of this specification.

### 9.3 Predicate

| Member | Value |
| --- | --- |
| `spec` | The full version of this specification the checker implements, `"0.1.1"`. |
| `checker` | `{name, version, digest: {sha256}}`; the digest is of the distributed checker artifact that ran. |
| `report` | `{sha256, source: {kind, locator}}`, `kind` one of `pr-body`, `pr-comment`, `file`, `stdin`, `api`. |
| `block` | `{status, sha256, value}`, plus `reason` and `count` or `errors` when not `found`. |
| `subject` | `{repository, pullRequest, headSha, mergeSha}`, from the invocation and the pull request read. |
| `evidence` | Section 6. |
| `claims` | Section 7, in the order given there. |
| `verdict` | Section 8. |
| `digests` | `{claims, evidence}`, section 10. |
| `rerun` | `{offline, online}`: the commands that re-run this record, section 12. |
| `assurance` | `{status: "unsigned", issuer: "self-generated"}`, or the signed form of section 11. |

### 9.4 The report and the block

The record carries the report's SHA-256 (over its bytes as received) and never its text. The block is
the claim and is kept: `block.value` is the parsed block, `block.sha256` its digest. For a block that
is not found, `sha256` and `value` are `null`; `missing` carries `reason: "block_missing"`, `ambiguous`
carries `reason: "block_ambiguous"` and the `count`, and `invalid` carries `reason: "block_invalid"`
and `errors: [{code, pointer?, keyword?}]`. Error messages are not recorded.

A record carries no timestamp other than `readAt` in `evidence.sources`.

## 10. Canonical bytes and digests

Every digest in a record is lowercase hexadecimal SHA-256 over the RFC 8785 (JSON Canonicalization
Scheme) bytes of a JSON value, never over pretty-printed JSON.

- `block.sha256` is over `block.value`.
- `digests.claims` is over the `claims` array.
- `digests.evidence` is over `evidence` with its `sources` member removed. `sources` is provenance:
  response bodies change for reasons no claim reads (an `updated_at`, for example), and `readAt` lives
  only there. The digest therefore covers exactly the snapshot the claims are computed from, and an
  online re-run reports `evidence_changed` only when something a claim reads has changed (decided
  2026-10-04).

Re-running on another machine MUST give identical `claims`, `verdict` and `digests`. When the sources
answer the same, only `readAt` values may differ; `evidence.sources` is outside every digest.

## 11. Signature

A record MAY be signed. A local or CI record is unsigned by default.

A signed record is stored as exactly its JCS bytes (no pretty-printing, no trailing newline) with
`assurance` set to `{status: "signed", issuer: <principal>, keyFingerprint: "SHA256:..."}` before
signing. The signature is a detached SSH signature, ed25519 key, namespace `dunstan-record`:

```sh
ssh-keygen -Y sign -n dunstan-record -f signer-key.pub record.json      # writes record.json.sig
ssh-keygen -Y verify -f allowed_signers -I <principal> -n dunstan-record \
  -s record.json.sig < record.json
```

Verification needs `ssh-keygen` and the verifier's own allowed-signers file, and nothing from Dunstan.
The namespace is distinct from every other signing namespace, so a Dunstan signature cannot be
replayed as a signature of anything else. A signature attests who issued the record, not that the
verdict is correct; re-running (section 12) checks the verdict.

## 12. Re-running a record

**Offline verify** (`rerun.offline`) uses only the record. It MUST recompute the claims and the
verdict from `block.value` and `evidence` with the recorded checker version, recompute the three
digests, and check the subject digests. Every recomputed value MUST match the recorded one byte for
byte; any difference fails verification and names the member that differs.

**Online re-run** (`rerun.online`) re-reads the sources for the same subject and the recorded block.
It does not re-read the report: the recorded block is the claim. If the new evidence digest differs,
it MUST report `evidence_changed` with the differing evidence fields (JSON Pointers, `sources`
excluded) and the new verdict, and write the new record separately. It MUST NOT overwrite the old
record.

## 13. Versioning

The specification is versioned with Semantic Versioning. The block's `dunstan` member names the major
and minor version; the record's `spec` names the full version; the predicate type and the schema file
names carry the major and minor.

- A patch release clarifies text or corrects an erratum. It MUST NOT change which blocks are valid.
  It changes a verdict only where a rule contradicted section 2, and section 17 names each such
  change.
- While the major version is 0, each minor version is a major version (Semantic Versioning item 4):
  a 0.1 checker refuses a `"0.2"` block.
- A checker MUST refuse a block whose major version it does not implement, as `block_invalid` with
  `unsupported_version`. It never reads such a block as the nearest version it knows.

## 14. Security and privacy

- A record holds no file contents and no report text, only digests and metadata. Publishing a record
  publishes the block, the repository and pull request numbers, file paths, check names, workflow
  names and deployment environment names.
- The block is untrusted input. Its paths are validated as repository-relative and are compared as
  strings, never opened.
- A JUnit file is read for element counts only.
- Nothing in a record is a probability or a judgment, so nothing in it can be tuned by rewording a
  report.

## 15. Examples

The examples are **illustrative**. They use a made-up repository, `example-org/example-repo`, and
made-up ids. The source digests in the example records are digests of placeholder text, not of real
responses, and the checker digest is a placeholder. The tests in `src/spec/` check every example
against the schemas and check each record's block, report and claim and evidence digests.

- `spec/examples/blocks/valid/`: `minimal.json` (the three required fields), `full.json` (every
  field), `rename.json` (the pull request renames `src/storage/blobs.ts` to
  `src/storage/blob-store.ts`; the block declares the new path, which is enough), and
  `non-junit-test-record.json` (a `tap` test record, whose count is unverifiable).
- `spec/examples/blocks/invalid/`: each file is named `<code>.<slug>.json`, or
  `schema_violation.<keyword>.<slug>.json`, for the error it must produce.
- `spec/examples/reports/`: each file is named `<status>.<slug>.md` for the status extraction must
  return: one block, none, two, malformed JSON, an unterminated fence, a `json` fence, an info string
  with a suffix, and an example block quoted inside another fence.
- `spec/examples/records/`: `pass.json`, `fail.json` (an undeclared file, a `closes` of an existing
  issue the API did not record as closing, and a short test count), `unverifiable.json` (a non-JUnit
  test record and unreadable check runs) and `block_missing.json`.

## 16. Reason codes

| Reason | Verdict | Meaning |
| --- | --- | --- |
| `block_missing` | block | No handback fence. |
| `block_ambiguous` | block | More than one handback fence. |
| `block_invalid` | block | The one block failed section 5; see its error code. |
| `head_mismatch` | fail | `headCommit` is not the pull request's head. |
| `declared_not_changed` | fail | A declared path is not in the changed set. |
| `undeclared_file` | fail | A changed file is not declared. |
| `file_list_truncated` | unverifiable | The changed-file list is incomplete. |
| `not_closing` | fail | The issue exists but is not among the recorded closing references. |
| `not_found` | fail | The cited issue, pull request or commit, or the issue a `closes` names, does not exist. |
| `not_reachable` | fail | The cited commit is not reachable from the head. |
| `count_mismatch` | fail | A declared count differs from the record. |
| `all_succeeded_mismatch` | fail | `allSucceeded` differs from the check runs' conclusions. |
| `checks_incomplete` | unverifiable | A check run has not completed. |
| `no_check_runs` | unverifiable | There are no check runs at the head. |
| `no_comparable_record_field` | unverifiable | The test record's kind has no comparable field in this version. |
| `record_not_found` | unverifiable | No run carries the named test record. |
| `record_ambiguous` | unverifiable | Candidate runs disagree on the number. |
| `not_merged` | fail | The pull request is not merged. |
| `premature` | fail | The declared merge time is before the recorded one. |
| `no_deployment` | fail | No successful deployment to the environment by the declared time. |
| `evidence_field_unpopulated:<field>` | unverifiable | The source answered without the field. |
| `source_unreadable:<kind>` | unverifiable | The source errored. |

## 17. Changes

- **0.1.1** (2026-10-04). Erratum to section 7.4, found by the October 2026 demo and corrected in
  checker 0.1.1. In 0.1.0 a
  `closes` issue missing from the closing references failed with `not_closing`. GitHub leaves out of
  that list any issue the reader cannot see, so that fail rested on an absence the reader could not
  tell from visibility, which section 2 forbids. A missing issue is now read as a cited issue is: an
  unreadable repository or issue read is `unverifiable`, an issue that does not exist fails with
  `not_found`, and only an issue that exists fails with `not_closing`. Section 6 adds a `references`
  entry for each such issue. The block format and both schemas are unchanged; a 0.1 block stays
  valid.
- **0.1.0** (2026-10-04). First draft.

## DRAFT 0.2.0: reader claims and retrieval

> **DRAFT. Not normative. For the operator to check.** Nothing in this section changes version
> 0.1.1. Sections 1 to 17, `handback-block-0.1.schema.json`, `record-0.1.schema.json` and every 0.1
> verdict stand as written. A 0.1.1 checker ignores this section. The key words of section 1 are
> used here to say what 0.2.0 would require if it is adopted. Until then they bind nothing. Open
> questions are in D.10 and D.11.8. The reference implementations are `src/retrieval/` and
> `src/advisory/`, and the rationale is in `docs/retrieval.md` and `docs/advisory.md`.

### D.1 Scope

When a report is prose, a reader (any model or tool, named in the record) turns it into **typed
claims**. Retrieval proposes the record items each claim is about. A deterministic check decides
each claim from those items. This draft adds an optional `readerClaims` member to the record and an
evidence section, `items`, for the record items 0.1 evidence does not list. It does not change the
block, which stays `"dunstan": "0.1"`, or any 0.1 claim row.

### D.2 The record

A record that carries `readerClaims` or `advisory` (D.11) has `predicateType`
`https://barglabs.ai/dunstan/record/v0.2-draft` and `spec` `"0.2.0-draft"`, and validates against
`spec/schema/record-0.2-draft.schema.json`. That schema refers to the 0.1 schema for every member the
two share. A record with neither is written to 0.1, unchanged.

The predicate gains `readerClaims` (D.5) and `digests.readerClaims`, the SHA-256 over the JCS bytes
of the `readerClaims` array (section 10). `digests.readerClaims` is REQUIRED when `readerClaims` is
present. The evidence gains `items`, and so `digests.evidence` covers it.

### D.3 Record items

An item is `{type, id}` plus the text fields it is matched on. Items come from the pull request's
own evidence only, never from file contents and never from another repository. Their **record
order** is fixed:

| Order | `type` | Evidence | `id` | Fields |
| --- | --- | --- | --- | --- |
| 1 | `commit` | `items.commits.entries`, in the API's order | `sha` | `sha`, `headline` |
| 2 | `timeline_event` | `items.timeline.entries`, in the API's order | `id` | `event`, `ref`, `detail` |
| 3 | `check_run` | `checkRuns.runs`, counted as in section 7.5 | the run `id` as a string | `name` |
| 4 | `file` | `files.entries` | `path` | `path`, `previousPath` |
| 5 | `test` | `items.tests.entries`, code-unit order of `id` | `classname.name`, or `name` | `name`, `classname` |

`items.commits`, `items.timeline` and `items.tests` each carry a read status as in section 6. The
new source kinds are `pull_request_commits` and `timeline`; a test case list is read from an
`artifact`. A commit's `headline` is the first line of its message. A timeline event's `ref` is the
`owner/repo#N` or commit SHA it points to, and `detail` is one short metadata value (a label name,
a review state). A test case's `outcome` is `passed`, `failed` or `skipped`, as in section 7.5.

### D.4 Retrieval, Arm A

Retrieval MUST be deterministic and MUST NOT use a model or the network. Given a claim's `text` and
`declaredValue`:

1. **Identifiers.** An item is an identifier match if the claim's text, or any string in
   `declaredValue`, names one of these exactly:
   - a commit SHA (40 hex digits, or a prefix of at least 7 that contains a decimal digit);
   - `#N` (in the subject repository) or `owner/repo#N`, matched to a timeline event's `ref`;
   - a changed file's `path` or `previousPath`, occurring whole;
   - a check run's `name`, or a test's `name` or `classname.name`, of at least 4 characters,
     occurring whole and case-sensitively.

   An identifier match has `score: null`.
2. **BM25** over every item's fields: k1 = 1.2, b = 0.75, IDF `ln(1 + (N − n + 0.5) / (n + 0.5))`
   over all items of the pull request, each distinct query term once. Tokenisation is as
   `docs/retrieval.md` states. Scores are rounded to 6 decimal places.
3. **Floor.** An item that is not an identifier match is a candidate only if its rounded score is
   at least the **floor, 1**. The floor is recorded with every reader claim.
4. **Order.** Identifier matches first, then by score descending. Ties break by record order, then
   by `id` in code-unit order.

A claim of a known kind (D.6) has candidates only of that kind's item type. A **candidate** is
`{type, id, score, matchedField}`. Every candidate at or above the floor is recorded.

An embedding arm (Arm B) MAY be added behind a provider seam, if a measurement shows it closes a
gap. Its scores, like BM25's, MUST NOT be read by a check.

### D.5 A reader claim

```json
{ "text": "The typecheck job passes", "kind": "check_succeeded", "declaredValue": true,
  "reader": { "name": "example-reader", "version": "0.0.1" }, "probability": 0.8,
  "retrieval": { "arm": "A", "floor": 1 },
  "candidates": [ { "type": "check_run", "id": "103", "score": null, "matchedField": "name" } ],
  "observed": false, "verdict": "fail", "reason": "all_succeeded_mismatch" }
```

- `text`, `kind`, `declaredValue`, `reader` and `probability` are the reader's output, recorded as
  given. `probability` is OPTIONAL and MUST NOT be read by any check (section 2: no probability
  decides anything).
- `retrieval` and `candidates` are retrieval's output.
- `observed`, `verdict` and `reason` are the check's output (D.6). As in section 7.1, a `pass`
  carries no `reason`, and a `fail` or `unverifiable` always does.

### D.6 Kinds and checks

The check is a pure function of `kind`, `declaredValue`, the recorded `candidates` and the evidence.
It never runs retrieval. In order:

1. A kind not in the table below, or a `declaredValue` of the wrong type for its kind:
   `unverifiable`, `no_comparable_record_field`.
2. The evidence section for the kind's item type is unread: `unverifiable`, with
   `source_unreadable:<kind>` or `evidence_field_unpopulated:<field>` (section 6).
3. A recorded candidate of that type that the evidence does not hold: `unverifiable`,
   `candidate_not_in_evidence`.
4. **No candidate of that type: `unverifiable`, `no_matching_record_item`, with the floor stated in
   `retrieval.floor`. Never `pass`.** For `file_changed` with an incomplete file list, the reason is
   `file_list_truncated`.
5. The kind's own check:

| `kind` | `declaredValue` | Item type | Passes when | Otherwise |
| --- | --- | --- | --- | --- |
| `file_changed` | a path | `file` | a candidate's `path` or `previousPath` equals it; `observed` is the path | `unverifiable`, `declared_item_not_among_candidates` (or `file_list_truncated`) |
| `commit_present` | 7 to 40 hex digits | `commit` | a candidate's SHA starts with it; `observed` is the SHA | `unverifiable`, `declared_item_not_among_candidates` |
| `reference_in_timeline` | `#N` or `owner/repo#N` | `timeline_event` | a candidate's `ref` is that issue; `observed` is `{event, ref}` | `unverifiable`, `declared_item_not_among_candidates` |
| `check_succeeded` | boolean | `check_run` | it equals the section 7.5 `allSucceeded` rule over the candidate runs | `fail`, `all_succeeded_mismatch`; `unverifiable`, `checks_incomplete` |
| `test_passed` | boolean | `test` | it equals "no executed candidate failed" | `fail`, `test_outcome_mismatch`; `unverifiable`, `test_not_executed` if every candidate was skipped |

New reason codes: `no_matching_record_item`, `declared_item_not_among_candidates`,
`candidate_not_in_evidence`, `test_not_executed`, `test_outcome_mismatch`.

### D.7 The verdict

Reader claims do **not** enter `predicate.verdict` in this draft. The record's verdict stays the
section 8 function of the block's claim rows. A report with no block is therefore still
`unverifiable` (`block_missing`), whatever its reader claims say. A consumer reads each reader claim
on its own.

### D.8 Re-running

**Offline verify** recomputes each reader claim's check (D.6) from its **recorded** candidates, not
from a fresh retrieval, and compares `observed`, `verdict` and `reason`, and `digests.readerClaims`,
byte for byte. So the verdict reproduces even where retrieval would rank differently on another
machine or in another version. An online re-run of a draft record is not defined by this draft.

### D.9 What a record would newly publish

Beyond section 14: the reader's claim text, kind, declared value, name, version and probability;
commit headlines; timeline event types, refs and details; test case names and outcomes from a JUnit
record; and retrieval scores. It would still hold no file contents and no report text.

### D.10 Open questions for the operator

1. **Section 2, "No probabilities".** That principle says no probability or score appears anywhere
   in a record. This draft records the reader's `probability` (as first drafted) and BM25 `score`
   values, though neither is read by any check. Either amend the principle to "no probability or
   score decides anything; a reader's probability and a retrieval score may be recorded as
   provenance", or drop both from the record. Without them, candidates would keep only their order
   and `matchedField`.
2. **Prose in the record.** `text` is derived from the report, and section 9.4 keeps no report
   text. One option is to keep `text`. The other is to record only its SHA-256 and leave the text
   with the reader.
3. **Section 14, "A JUnit file is read for element counts only".** `items.tests` reads test case
   names and outcomes, which goes beyond that.
4. **A pass on lexical candidates.** As drafted, `check_succeeded` and `test_passed` may pass when
   every candidate was proposed by BM25 alone. The stricter alternative: a `pass` needs at least one
   identifier-matched candidate, and is otherwise `unverifiable`.
5. **"All" claims.** "CI is green" is a claim about every check run. As drafted, it is checked
   against whichever runs retrieval proposes. A kind such as `checks_all_succeeded`, whose items
   are all check runs without retrieval, would match 0.1's `checks.allSucceeded`.
6. **Identity kinds never fail.** A declared file, commit or reference that is not among the
   candidates is `unverifiable`, not `fail`. With a complete file list, `file_changed` could fail
   with `declared_not_changed` as 0.1 does.
7. **The verdict.** Should reader claims enter `predicate.verdict` (D.7), under section 8's rule or
   another?
8. **Versioning.** Section 13 treats each 0.x minor as a major. This draft adds only record
   members and leaves the block at `"0.1"`. It needs a decision on whether 0.2.0 bumps the block
   version too, and on the predicate type and `spec` string used here (`v0.2-draft`,
   `"0.2.0-draft"`).
9. **The floor.** 1, for the reason in D.4 and `docs/retrieval.md`. The retrieval measurement
   takes recall at k = 5 on a private corpus and may propose another value.

### D.11 Advisories from prose

#### D.11.1 Scope

A report with no block, or a report read a second time beside its block, may still state things the
record can answer. The **advisory layer** reads the report's prose with a written grammar and
records what it finds as **advisories**. An advisory is information for whoever reads the record. It
is not a verdict:

- Advisories MUST NOT enter `predicate.verdict` or `predicate.claims`. A report with no block stays
  `unverifiable` (`block_missing`) whatever its advisories say, and a block's verdict is the same
  with or without them.
- No advisory is `fail`, `pass` or `unverifiable`. An advisory carries a note (D.11.4) and no
  verdict.

A checker writes the section only when asked to (`dunstan check --advisory`; the Action input
`advisory: true`). It has no model reader. A model reader is D.1 to D.10.

#### D.11.2 The record member

```json
"advisory": {
  "extractor": { "version": "0.1.2", "digest": { "sha256": "<64 hex>" } },
  "comparison": { "version": "0.2.0" },
  "precision": null,
  "differsAccuracy": null,
  "advisories": [
    { "clause": "I changed src/a.ts and src/z.ts.", "kind": "file_changed", "value": "src/z.ts",
      "observed": null, "note": "differs:declared_not_changed" }
  ]
}
```

- `extractor` names the grammar that ran. `digest.sha256` is the SHA-256 over the JCS bytes of the
  grammar: every word list and limit the extractor reads (`GRAMMAR` in `src/advisory/grammar.ts`).
  Any change to the grammar changes the digest.
- `comparison` names the rules that turned each proposed claim and the evidence into its note
  (D.11.4). Its `version` is separate from the extractor's: a change to the comparison leaves the
  grammar and its digest as they were. `0.1.0` compared a file claim by exact path only. `0.2.0`
  also matches it by name. A record written before `comparison` existed was compared by `0.1.0`.
- `precision` is a **figure**, taken from a published measurement of the extractor with this very
  digest: the share of adjudicated advisories that were real claims of the report. Otherwise it is
  `null`, meaning **unmeasured**.
- `differsAccuracy` is a figure, taken from a published measurement of the extractor with this
  very digest **and** the comparison with this very version: the share of `differs` advisories
  that marked a genuinely false claim. It also carries `baseRate`, a figure in the same form: the
  share of all advisories on the same corpus that were genuinely false completion claims. Otherwise
  it is `null`, meaning **unmeasured**.
- A figure is `{value, n, interval, pullRequests, method, source}`: the share; how many items it is
  over; its Wilson score interval at 95% as `{"method": "wilson", "level": 0.95, low, high}`, each
  bound to five decimal places; how many pull requests the corpus held; how the items were drawn
  and adjudicated; and who adjudicated, on what and when. It never holds a row, a clause, a label
  or a reference to an adjudicated pull request.
- A renderer MUST show a `null` figure as "unmeasured", never as a number, and MUST show
  `baseRate` beside the `differs` figure wherever it shows that figure. A checker MUST NOT fill a
  figure from anything but a published measurement of the exact extractor digest (and, for
  `differsAccuracy`, comparison version) the record names. Another version never inherits a
  figure.
- `advisories` has one entry per distinct proposed claim, in the order the report makes them. An
  empty array means the extractor proposed nothing. It never means that the prose was checked and
  agreed.
- `clause` is the clause the claim was bound in, as written, whitespace collapsed, at most 300
  characters.

The predicate gains `digests.advisory`, the SHA-256 over the JCS bytes of the `advisory` object.
It is REQUIRED when `advisory` is present.

#### D.11.3 The extractor

The extractor MUST be deterministic and MUST NOT use a model, a clock or the network. Its grammar is
a set of written word lists plus binding by proximity within a clause. `docs/advisory.md` gives it
in full. In outline:

1. **Not read:** fenced code blocks, lines quoted with `>`, log lines (a line that opens with a log
   level, a bracketed prefix, a timestamp or a shell prompt) and HTML comments.
2. **Inline code and URLs** are single tokens. Each is read only when a clause asserts it: a phrase
   or command in inline code is never a token, and a URL is a token only as a GitHub issue or pull
   request bound to a closing keyword.
3. **Clauses** end at `.` `;` `:` `!` `?` closing a word, at a blank line, a list item, a heading
   or a table cell, and before a subordinating word. A clause that ends in `?` asks and is dropped.
   A clause opened by a conditional (`if`, `once`, `unless`, `until`, `when`, `whenever`) asserts
   nothing.
4. **Binding.** A token is a claim only when it is bound to an asserting verb. That verb is the
   nearest verb to the token's left in the same clause, within the window (8 words), with no
   negation, modal or infinitive between them. For subjects (`CI`, `checks`, `tests`), the verb is
   the predicate after the subject. A verb form after a determiner is an adjective or a noun ("the
   updated file"). A verb with a modal or a negation before it asserts nothing. A path inside a
   bracket still open at the path binds only to a verb inside the bracket, and an analogue phrase
   (`like`, `based on`, `similar to`, …) between a verb and a path stops the binding.
5. **Token classes:** a repository path (with an extension, or a known extensionless name), an
   issue (`#N`, `owner/repo#N`), a SHA (7 to 40 hex digits holding both a digit and a letter, and
   not after `run`, `job`, `user`, `id` and the like), a UTC timestamp, a count.
6. **Attribution.** A bound claim is proposed only as this pull request's:
   - a clause that names another pull request or issue that no closing keyword binds, or another
     repository, proposes nothing, and neither does the clause after it if that one opens with a
     subject pronoun or holds a possessive ("Its head is …");
   - a clause that narrates a change made for a while or undone (`temporarily`, `throwaway`,
     `reverted`, …) proposes nothing, and a re-run (`reran`) is a verb that binds no path;
   - a SHA after `head` is not `head_commit` when a baseline word (`origin/…`, `prior`,
     `baseline`, …) stands before it in the clause;
   - a negation covers every path of the list after it, and a negated subject ("none of the
     tests") is not read;
   - a clause that narrates a failure staged on purpose ("fail as expected", "red without the
     guard", "mutation") proposes no false test or check result and no count. It proposes a true
     one only for a pass predicate followed by a final state ("green with it").

#### D.11.4 Kinds and comparisons

Each proposed claim is compared with the evidence by the 0.1 check of the same field. The check is
given a block that holds only that field, with the evidence's own head as `headCommit`:

| `kind` | `value` | Proposed from | Compared by |
| --- | --- | --- | --- |
| `file_changed` | a repository path | a file verb and a path | 7.3, the row of `filesChanged: [value]`; then by name (below) |
| `reference_closes` | `#N` or `owner/repo#N` | a closing keyword and an issue | 7.4, a `closes` reference |
| `commit` | 7 to 40 hex | a commit verb, or "commit" and an asserting verb | 7.2 if the head starts with it; else 7.4 `cites` for 40 hex; else no field |
| `head_commit` | 7 to 40 hex | "head is" and a SHA | 7.2; a head that starts with the value agrees |
| `checks_succeeded` | boolean | `CI` or `checks` and a predicate | 7.5 `allSucceeded` |
| `check_count` | integer | "all N checks pass" | 7.5 `total` |
| `tests_passed` | boolean | `tests` and a predicate | none |
| `test_count` | integer | "ran N tests", "N tests pass" | 7.5 test count with a record that is not `junit` |
| `merged_at` | UTC timestamp | "merged at" and a timestamp | 7.6 `mergedAt` |

The check's row becomes the advisory's `observed` and `note`:

- `pass` gives `agrees`;
- `fail` gives `differs:<reason>`;
- `unverifiable` gives `unanswered:<reason>`;
- a kind with no comparable field gives `unanswered:no_comparable_record_field`, with `observed`
  null;
- a `file_changed` value matched by name (below) gives `agrees_by_name`, with `observed` the
  changed path, or `unanswered:ambiguous_path`, with `observed` every candidate path.

Prose names files as people do: by a bare name ("`cli.ts`") or a path relative to some directory.
So a `file_changed` value whose file list was read in full (the 7.3 row is not `unverifiable`) is
also matched by name. Its **candidates** are the changed entries whose `path` or `previousPath` is
the value or ends in `/` followed by the value, case-sensitively, each given once by its `path`, in
code-unit order.

- A value with no `/` is always matched by name, never read as a path at the root: one candidate
  gives `agrees_by_name`; more than one gives `unanswered:ambiguous_path`; none gives
  `differs:declared_not_changed`.
- A value with a `/` that the 7.3 row passes gives `agrees`. Otherwise one candidate gives
  `agrees_by_name`, more than one `unanswered:ambiguous_path`, and none the 7.3 row's
  `differs:declared_not_changed`.
- A file list not read in full gives the 7.3 row's `unanswered:<reason>`, never a name match.

`agrees_by_name` MUST NOT be shown or counted as `agrees`: the report may have meant another file
of the same name. A `differs:<reason>` note MUST be shown to a person as "possible disagreement,
unverified", then what the record shows and the observed value, and never as an accusation
(`docs/advisory.md`, "How a `differs` note is shown"). The note's value in the record is
unchanged. Matching by name is for advisories only. A block's `filesChanged` is still
compared by exact path (7.3), and reader claims by D.6.

The reasons are those of section 16. So a `#N` whose closing references were never read is
`unanswered:evidence_field_unpopulated:<field>`, never `differs`. A test count names no test record,
so it is `unanswered:no_comparable_record_field` and is never compared with a count of check runs.

#### D.11.5 Evidence

When asked for advisories, the checker reads the sections the block needs and also the sections the
proposed claims need: the file list; the closing references, and each issue missing from them; a
cited commit; and the check runs at the block's `headCommit`, or at the pull request's head when
there is no block. Each claim row reads only the evidence of its own field, so reading more never
changes a row. With no block and no proposed claim that needs more, only the pull request is read.

#### D.11.6 Re-running

Offline verify recomputes each advisory's `observed` and `note` from its **recorded** `kind` and
`value` and the evidence. It compares `extractor` and `comparison` with the running checker's,
`precision` with the measurement published for that digest, `differsAccuracy` with the measurement
published for that digest and that comparison version, and `digests.advisory`. The record holds no report text
beyond each `clause`, so extraction is not re-run. As in D.8, an online re-run of a draft record is
not defined.

#### D.11.7 What a record would newly publish

Beyond section 14 and D.9: one clause of the report for each advisory, its kind and value, the
extractor's version, digest and precision, the comparison's version, and the accuracy of `differs`
notes with its base rate.

#### D.11.8 Open questions for the operator

1. **Report text in the record.** `clause` is report text, and section 9.4 keeps none. This is the
   same question as D.10.2: keep the clause, or record its span and SHA-256 only.
2. **Section 2, "No probabilities".** `precision` is a measured property of the extractor, not a
   judgment of this report, and no check reads it. It still puts a rate in the record. It needs the
   same decision as D.10.1.
3. **Per-kind precision.** One figure across all kinds, as drafted, or one per kind? A measurement
   may show that `file_changed` and `checks_succeeded` differ widely.
4. **`tests_passed` is always unanswered.** It is kept, so the record shows that the report made a
   claim the record cannot answer. The alternative is to drop it.
5. **Evidence digest.** Reading for advisories (D.11.5) can add sections, so the same report checked
   with and without advisories may have different `digests.evidence` while `digests.claims` and
   `verdict` stay equal.
6. **Where a `differs` shows.** As drafted, the Action shows advisories in one summary row and a
   list of possible disagreements in its summary, and never in its title or conclusion. A consumer may want them more visible, though the gate must stay
   unchanged.

### D.12 Changes to this draft

- **2026-10-05.** Advisory extractor 0.1.2: a claim is proposed only as this pull request's
  (D.11.3, item 6). The extractor's rules and their tests are in `src/advisory/`. The grammar
  digest changes from `ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360` to
  `dfd6563a934667a80448e49b7133ade6d2473e5e13cd9d05fd52c761a1a1780b`. The published figures stay
  bound to 0.1.1 and are not rebound, so a record written by 0.1.2 carries `null` for
  `precision` and `differsAccuracy`, shown as "unmeasured", until 0.1.2 is measured. The
  comparison (0.2.0), the schemas, the record members and sections 1 to 17 are unchanged.

- **2026-10-05.** Measured figures, published: the advisory section gains `differsAccuracy`, with
  its `baseRate`, and a figure gains `interval`, `pullRequests` and
  `method` (D.11.2). The published figures are extraction precision 0.80 (24 of 30) for extractor
  0.1.1, and 0 of 20 `differs` advisories marking a false claim, beside a base rate of 0 of 44 checkable advisories,
  for extractor 0.1.1 and comparison 0.2.0. Each is carried only for the exact extractor digest,
  and comparison version, it was measured on. Only the advisory section's figure fields and
  `digests.advisory` change. Every other record member, the notes, the extractor, the comparison,
  and the 0.1 schemas and records are unchanged.
- **2026-10-05.** Presentation of `differs`: a preregistered decision rule on the accuracy of
  `differs` notes fired, so every surface a person reads shows a `differs` note as
  "possible disagreement, unverified", with one fixed line beside the advisories (D.11.4). The
  presentation changes and the values do not: the note stays `differs:<reason>`, the schemas and
  the comparison (0.2.0) are unchanged, and every existing record verifies as before.
- **2026-10-05.** Advisory comparison 0.2.0: a `file_changed` advisory whose value is a bare name
  or a partial path is matched against the changed paths by name, giving the
  new notes `agrees_by_name` or `unanswered:ambiguous_path`, where comparison 0.1.0 gave
  `differs:declared_not_changed` for a file the pull request had changed at a full path (D.11.4).
  The advisory section gains `comparison` (D.11.2). The extractor (0.1.1) and its digest are
  unchanged. The gate's 7.3 check, D.6 and sections 1 to 17 are unchanged.
- **2026-10-05.** Advisory extractor 0.1.1: a path inside a bracket still open at the path, or
  after an analogue phrase, no longer binds to a verb outside the bracket or before the phrase
  (D.11.3, item 4; `docs/advisory.md`, "Asides and analogues"). The grammar digest changes, so no
  precision measured on 0.1.0 applies to 0.1.1. Sections 1 to 17 are unchanged.

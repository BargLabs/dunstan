# The Dunstan claim format

Version 0.1.4. Draft. Licensed under Apache-2.0 (`spec/LICENSE`).

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

Not part of 0.1.4: [DRAFT 0.2.0: reader claims and retrieval](#draft-020-reader-claims-and-retrieval),
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
| `references` | a `cites` reference is declared, or a `closes` issue is not among the closing references | per cited issue or commit, and per such `closes` issue: `exists`, for a commit `reachableFromHead`, and for an issue GitHub answers as another issue `resolvedAs` |
| `closeEvents` | a `closes` target exists and is not among the closing references | per such target, under the identity it resolves to: its `type`, `state` and every ClosedEvent `{at, closer}`; and the pull request's `baseRef`, the repository's `defaultBranch` and the pull request's `commits` |
| `checkRuns` | `checks` is declared | the check runs at `headCommit`, each `{id, name, status, conclusion}` with its `checkSuiteId` (`check_suite.id`) and `appSlug` (`app.slug`) when the API gives them, and, for a run whose check suite is a workflow run's, that run's `workflowPath`, `workflowRunId` and `runAttempt`; and any `excludedIds` |
| `testRecords` | a `junit` test record is declared | per distinct record: the candidate runs and their counts |
| `deployments` | `deployedAt` is declared | the candidate deployments to that environment (section 7.6), each with its `relation` to the pull request |
| `sources` | always | one entry per read: `{kind, locator, sha256, etag?, readAt, error?}` |

**Read status.** Every section except `pullRequest`, `closeEvents` and `sources`, every entry of
`references`, `testRecords`, `deployments` and `closeEvents.targets`, and `closeEvents.pullRequest`,
carries a `status`:

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

**Resolved identity.** GitHub answers the read of an issue that was transferred to another
repository with a redirect to the issue's new identity. A checker follows that redirect, and only
from the issue read to another issue on the same API. The issue's answer names the issue it is (its
`repository_url`, ending in `/repos/<owner>/<repo>`, and its `number`). When that is another issue
than the one read, the `references` entry records it as `resolvedAs`, `owner/repo#N`, compared as
section 7.4 compares issues; the entry's `ref` stays the issue read. An answer that does not name its
issue is unparseable, so the read is `unreadable` with kind `issue`, as is a redirect the checker
cannot follow or read. `resolvedAs` is in the evidence, so offline verify reads it as recorded.

**Close events.** GitHub records each close of an issue or a pull request as a ClosedEvent whose
`closer` is the pull request or the commit that closed it, or nothing. For each `closes` target that
exists and is not among the closing references, under `resolvedAs` when recorded (else as declared),
a checker reads with GraphQL `issueOrPullRequest`: `type` (`issue` or `pull_request`), `state`
(`open`, `closed`, or for a pull request `merged`) and every `timelineItems(itemTypes:
[CLOSED_EVENT])` node as `{at, closer}`, `at` its `createdAt`, `closer` `{kind: "pull_request",
ref: "owner/repo#N"}`, `{kind: "commit", oid}`, `{kind: "other"}` for any other closer type, or
`null`. A target read with an error, or with more than 1,000 ClosedEvents (ten pages of 100), is
`unreadable` with kind `issue`; an answer with no item is `unpopulated` with field
`issueOrPullRequest`. Once per pull request, `closeEvents.pullRequest` holds its `baseRef`
(`baseRefName`), its repository's `defaultBranch` (`defaultBranchRef.name`, `null` if there is none)
and its `commits`, every commit id it holds. A commit list shorter than the count GitHub gives for it
(GitHub lists at most 250) is `unreadable` with kind `pull_request_commits`, never short. The merge
commit is `pullRequest.mergeSha`. Both reads ask for ids, names, states and times only.

**Workflow runs.** Each run of a GitHub Actions workflow is a check suite of its own, and a check
run does not name its workflow. When any check run read has a `checkSuiteId`, a checker reads,
after the check runs, every workflow run at `headCommit` (`GET
/repos/{owner}/{repo}/actions/runs?head_sha=<headCommit>`, every page). For each check run whose
`checkSuiteId` is a listed run's `check_suite_id`, it records that run's `path`, less any `@` and
what follows it, as `workflowPath`, its `id` as `workflowRunId` and its `run_attempt` as
`runAttempt`. The listing gives each workflow run at its latest attempt, so `runAttempt` is that
attempt, not necessarily the one that created the check run. A check run whose suite no listed
run names, such as one an app other than GitHub Actions created, is recorded without the three. A
listing that is unreadable, or that names one check suite for two workflow runs, makes `checkRuns`
`unreadable` with kind `workflow_runs`: the check runs are never recorded as if no workflow run
had been read.

**Source kinds.** `pull_request`, `pull_request_files`, `pull_request_commits`,
`closing_references`, `repository`, `issue`, `commit`, `compare`, `check_runs`, `workflow_runs`,
`artifact`, `deployments`.

**Sources.** `locator` names the request (method and path, or the GraphQL field read). `sha256` is
over the response body bytes as received. `etag` is the response's ETag, if any. `error` is present
when the read failed: `http_<status>`, `network` or `parse`. `readAt` is when the read completed. A
paginated read is one entry per page; if any page is unreadable, the section is unreadable.

**Determinism.** So that two checkers reading the same answers write the same evidence: `files.entries`
are in code-unit order of `path`; `closingReferences.issues` in code-unit order; `checkRuns.runs` and
`deployments[].deployments` in ascending `id`; `testRecords[].runs` in ascending `runId`;
`references`, `testRecords` and `deployments` in order of first appearance in the block, one entry per
distinct reference, record or environment; `closeEvents.targets` likewise, one per distinct identity
read, each target's `events` in the order GitHub lists them; `closeEvents.pullRequest.commits` in
code-unit order, once each; `sources` in code-unit order of `kind`, then of `locator`, one entry per
locator.

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

- **`closes`** names a target, an issue or a pull request, that the pull request P closes. It passes
  (row 1) if the target is among P's closing references as the API records them (GraphQL
  `closingIssuesReferences`). Text in the pull request body that GitHub did not record does not
  count. GitHub leaves out of that list any issue whose repository the reader cannot see, so a target
  missing from the list does not by that alone fail: the checker reads it as it reads a cited one
  (section 6, "Not found"), and the claim is
  - `unverifiable` with `source_unreadable:repository` if the target's repository is unreadable;
  - `unverifiable` with `source_unreadable:issue` if the target's read errors;
  - `fail` with `not_found` if the target does not exist (the issues API answers for a pull request
    number too, so a pull request target exists);
  - `pass` if the target exists, its entry records `resolvedAs` (section 6, "Resolved identity": an
    issue transferred to another repository), and that identity is among the closing references.

  The closing references are not GitHub's whole record of a close: they list issues only, never a
  pull request; they leave out an issue that a keyword in a commit message closed; and GitHub does
  not act on keywords in a pull request into a branch other than the default. GitHub's record of a
  close is the closer of the target's ClosedEvent (section 6, "Close events"). Otherwise, with T the
  target's `closeEvents` entry (under `resolvedAs` when recorded), the claim is, in this order:

  | # | Evidence | Verdict, reason |
  | --- | --- | --- |
  | 2 | some ClosedEvent of T has closer P (`kind` `pull_request`, `ref` P) | `pass` |
  | 3 | some ClosedEvent of T has a commit closer whose `oid` is one of `closeEvents.pullRequest.commits` or `pullRequest.mergeSha` | `pass` |
  | 4 | P is open and unmerged (`state` `open`, `merged` `false`) | `unverifiable`, `closing_link_unsettled` |
  | 5 | P is merged, `baseRef` is not `defaultBranch`, and T's `state` is `open` | `unverifiable`, `closing_base_not_default` |
  | 6 | T, or the part of `closeEvents.pullRequest` a row above needs, is unread or absent | `unverifiable`, with its `source_unreadable:<kind>` or `evidence_field_unpopulated:<field>` (`closeEvents` when the section or T's entry is absent) |
  | 7 | T's `state` is `closed`, and its read is complete but holds no ClosedEvent (`events` is empty) | `unverifiable`, `closing_event_unsettled` |
  | 8 | otherwise: T open after a merge into the default branch, T closed by another pull request, another commit or no recorded closer (a ClosedEvent whose `closer` is `null`), or P closed without merging | `fail`, `not_closing` |

  Rows 2 and 3 read every ClosedEvent, not only the latest: a target P closed that was later reopened
  was closed by P. A row 2 or 3 pass needs only the event it rests on, so it passes whatever else is
  unread. Row 3 needs `closeEvents.pullRequest.commits` only for a commit that is not the merge
  commit, and row 5 needs `baseRef` and `defaultBranch`. GitHub computes the closing references
  asynchronously after a pull request is opened or its body is edited, so while P is open an absence
  may yet change (row 4). Keywords do not act on a non-default base, but a later merge of that base
  into the default branch can still close T by a commit message, so row 5 is not yet decidable; the
  record holds no commit message, so a body keyword on a non-default base, which never closes T,
  stays row 5 for as long as T is open. GitHub sets T's `state` to closed before T's timeline shows
  the ClosedEvent (observed, section 17), so a closed T whose complete read holds no ClosedEvent at
  all has a close that is not yet recorded, and it may be P's (row 7). A ClosedEvent whose `closer`
  is `null` is not row 7: the close is recorded, and it records no closer. A close by another pull
  request, another commit, or no recorded closer is not P's close (row 8).
  `observed` is `{closing: [...]}`, with `exists: false` added for `not_found`; `ref` (the target
  read) and `resolvedAs` added when the target resolved to another identity; `closedBy`, the
  ClosedEvent `{at, closer}` a row 2 or 3 pass rests on; `state` and `events`, T's, for `not_closing`;
  and `null` for an `unverifiable` row (section 7.1).
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

**Checks.** The check runs are those the API lists for `headCommit`, the latest run per key, less
any the checker excluded: a checker running inside a check run MUST exclude that run and list its
id in `checkRuns.excludedIds`. GitHub names an Actions check run after its job, not its workflow,
and each run of a workflow is a check suite of its own. The key is what one check is:

1. a run with a `workflowPath`: the workflow path and the name. Two workflows that each have a job
   `test` give two keys, so both are counted and neither hides the other. One workflow run more
   than once on `headCommit` (on `push` and on `pull_request`, or again when the pull request is
   reopened) gives one key per job, so each job is counted once, as its latest workflow run ran it;
2. otherwise a run with a `checkSuiteId`: the check suite and the name. This is a run of no
   workflow, such as one an app other than GitHub Actions created, and every run of a record
   written before `workflowPath` was recorded. No path is inferred for it. If one app put two check
   suites on one commit, its runs of a name would be counted once per suite, which can fail a
   correct claim, never pass a wrong one;
3. otherwise the name alone: every run of a record written before `checkSuiteId` was recorded, so
   such a record counts as it did then.

The latest run of a key is the one with the highest `workflowRunId`, then the highest
`runAttempt`, then the highest `id`; a run without the first two compares as 0 on them, so among
runs of no workflow the highest `id` is the latest. Two runs of different kinds of key, such as a
run with a `workflowPath` and a run of the same name with neither member, never supersede each
other: both are counted, which can fail `allSucceeded`, never pass it. An excluded run also
supersedes every run of its name with a lower `id`, whatever its key: a checker run again on the
same head (after the pull request body is edited) runs in a new run of its workflow, and its
earlier runs are its own. So a run of another workflow with the name of an excluded run and a lower
`id` is not counted either; a checker's own runs should have names no other check uses.

- `count:/checks/total` compares `total` with the number of check runs counted so, each key once;
  `count_mismatch` if unequal.
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
| `spec` | The full version of this specification the checker implements, `"0.1.4"`. |
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
  publishes the block, the repository and pull request numbers, file paths, check names, check suite
  ids, the slugs of the apps that created check runs, workflow names, the paths, ids and attempts
  of the workflow runs check runs belong to, and deployment environment names.
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
- `spec/examples/records/`: `pass.json`, `fail.json` (an undeclared file and a short test count,
  which fail, beside a `closes` of an existing issue missing from an open pull request's closing
  references, which is `unverifiable` with `closing_link_unsettled`: a `fail` decides even beside an
  `unverifiable` row; its evidence holds the issue's close events, open with none, which the open
  pull request leaves unsettled), `unverifiable.json` (a non-JUnit test record and unreadable check runs) and
  `block_missing.json`.

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
| `not_closing` | fail | The target exists, is not among the closing references of a merged or closed pull request, and no ClosedEvent of it names that pull request or one of its commits as the closer; a closed target has at least one ClosedEvent. |
| `closing_link_unsettled` | unverifiable | The target exists but is not among the closing references of an open pull request, which GitHub may not have computed yet. |
| `closing_base_not_default` | unverifiable | The pull request merged into a branch other than the default, and the target is still open: a later merge into the default branch may yet close it. |
| `closing_event_unsettled` | unverifiable | The target is closed, and its complete close-event read holds no ClosedEvent: GitHub sets the state before its timeline shows the event, so who closed it is not yet recorded. |
| `not_found` | fail | The cited issue, pull request or commit, or the issue a `closes` names, does not exist. |
| `not_reachable` | fail | The cited commit is not reachable from the head. |
| `count_mismatch` | fail | A declared count differs from the record. |
| `all_succeeded_mismatch` | fail | `allSucceeded` differs from the conclusions of the check runs counted, the latest per workflow path and name (section 7.5). |
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

- **0.1.4** (2026-10-11, amended 2026-10-12 and 2026-10-13 before release). Erratum to sections 6,
  7.4 and 16, and (amended 2026-10-12, "Checks per check suite", and 2026-10-13, "Checks per
  workflow path", below) 7.5 and 14, corrected in checker 0.1.7. In 0.1.3 a `closes` target that exists and is missing from the closing
  references failed with `not_closing` once the pull request was merged or closed. GraphQL
  `closingIssuesReferences` is not GitHub's whole record of a close, so that fail rested on an
  absence from a derived list, not on evidence that the pull request did not close the target, which
  section 2 forbids. The list has three gaps:
  - it lists issues only, so a pull request target is never in it. Observed: a public pull request
    that names 19 targets with `Closes:`, 18 of them pull requests whose ClosedEvent `closer` is that
    pull request, has an empty `closingIssuesReferences`; and observed 2026-10-12, case (v) below;
  - it leaves out an issue a keyword in a commit message closes, which GitHub documents happens when
    the commit lands on the default branch, without the pull request showing as linked. **Observed
    2026-10-12**, cases (i), (ii) and (iii) below;
  - GitHub documents that it ignores closing keywords in a pull request whose base is not the
    default branch. **Observed 2026-10-12**, cases (iii) and (iv) below.

  GitHub's documentation: <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>.
  The checker now reads who closed the target: the evidence gains `closeEvents` (section 6, "Close
  events"), each such target's type, state and every ClosedEvent's closer, and the pull request's
  base branch, default branch and commit ids, and section 7.4 decides by its table. A target closed
  by this pull request (row 2), or by one of its commits or its merge commit (row 3; observed
  2026-10-12), passes, whichever ClosedEvent records it. An open pull request is
  `closing_link_unsettled` as before (row 4). A merge into a branch other than the default, with the
  target still open, is `unverifiable` with the new reason `closing_base_not_default` (row 5;
  observed 2026-10-12). A close-event read that is unread, absent or over its budget is
  `unverifiable` (row 6): so a 0.1.3 record of a merged pull request's `closes`, which has no
  `closeEvents`, would now be `unverifiable`, never `fail`, and a checker writing 0.1.4 records reads
  the section. A closed target whose complete read holds no ClosedEvent is `unverifiable` with the
  new reason `closing_event_unsettled` (row 7, added 2026-10-12). Only then is the claim
  `not_closing` (row 8), with the target's `state` and `events` in `observed`.
  `closingIssuesReferences`, `not_found`, `resolvedAs` and every other `unverifiable` reason are
  unchanged. `closeEvents` is inside the evidence, so `digests.evidence` covers it and offline verify
  reproduces the verdict. `record-0.1.schema.json` gains the optional section, the source kind
  `pull_request_commits` and the reasons `closing_base_not_default` and `closing_event_unsettled`; a
  0.1.3 record stays valid. The block format and `handback-block-0.1.schema.json` are unchanged; a
  0.1 block stays valid. Example records: `fail.json` gains the close events of #21 (open, none) and
  its evidence digest changes; its `closes` row stays `closing_link_unsettled` and its claims digest
  and verdict are unchanged. Every example carries spec 0.1.4 and checker 0.1.7. The acceptance
  cases gain the controls `closes-pr-target-closed-by-this-pr` and `closes-commit-closer` and the
  planted `closes-closed-by-other`, `closes-non-default-base-open` and (2026-10-12)
  `closes-closed-no-event-yet`; the preregistered tables are unchanged, and `closes-not-linked`,
  whose evidence gains the close events 0.1.4 reads for #17 (open, none, merged into the default
  branch), keeps `fail` with `not_closing`.

  **The probe, 2026-10-12.** The operator ran `experiments/closes-probe-2026-10/probe.mjs` against an
  empty sandbox repository from 11:21:23Z to 11:24:21Z; its output is
  `experiments/closes-probe-2026-10/results.json`, and a re-read of the five targets at 11:25:48Z is
  `reread-2026-10-12.json` beside it. In every case the closing references were empty before and
  after the merge.
  - (i) A commit "Fixes #1", the body silent, merged with a merge commit: at the re-read, a
    ClosedEvent whose closer is the pull request's own commit. Row 3.
  - (ii) The same, squash-merged: at the re-read, a ClosedEvent whose closer is the squash merge
    commit, the pull request's merge commit. Row 3, by `mergeSha`.
  - (iii) A commit "Fixes #5" merged by pull request 6 into a branch other than the default: #5
    open after that merge (row 5 for pull request 6). After that branch was merged into the default
    branch, a ClosedEvent whose closer is pull request 6's own commit (row 3 for it).
  - (iv) A body "Closes #8" in a pull request into a branch other than the default: #8 open after
    the merge, with no ClosedEvent, at the probe's read and at the re-read. Row 5.
  - (v) A body "Closes #10", where #10 is a pull request: #10 closed, with a ClosedEvent whose closer
    is the pull request; it was never among the closing references. Row 2.

  **Row 7 and its reason are added by the probe.** In cases (i) and (ii), when the probe read the
  target it was already closed and its timeline held no ClosedEvent; the re-read shows the event.
  GitHub had set the state before the timeline showed the event. Under rows 2 to 7 as first written
  that read is `not_closing`, a false fail in a window of seconds after every commit-message close,
  which any check run straight after a merge can read in. The amended table makes it `unverifiable`
  with `closing_event_unsettled`. A ClosedEvent whose closer is `null` (closed by hand, or by
  something GitHub does not attribute) is unchanged: the close is recorded and is not this pull
  request's, so it is `not_closing` (row 8).

  **Known limits.** Case (iv) stays `unverifiable` with `closing_base_not_default` for as long as the
  target is open, which may be forever: a body keyword on a branch other than the default never
  closes the target, and the record holds no commit message, so the checker cannot tell case (iv)
  from case (iii) before its base reaches the default branch. That is a known limit; it is never a
  pass. No case used a rebase merge: row 3 for a rebase merge, whose commits on the default branch
  are new commits, is not observed.

  **Checks per check suite (amended 2026-10-12).** Found while drafting reader claims (D.10).
  Section 7.5 counted the latest run per name across every run at the head. GitHub names an Actions
  check run after its job, not its workflow, so two workflows that each have a job `test` give two
  runs named `test`. When the one with the lower `id` failed and the one with the higher `id`
  succeeded, the failure was dropped: `checks.allSucceeded: true` passed, and `checks.total` counted
  the two runs as one. That pass rested on a run the check had set aside, not on evidence that every
  check succeeded, which section 2 forbids: a false pass in the 0.1 gate. The evidence now records
  each run's `checkSuiteId` (`check_suite.id`) and `appSlug` (`app.slug`) when the API gives them
  (section 6), and section 7.5 counts the latest run per check suite and name, so the two runs are
  two and the failed one is read. A later run of a name in the same suite still supersedes the
  earlier one. A run with no `checkSuiteId` is keyed by its name alone; every run of a record written
  before this amendment has none, so such a record counts, and verifies, byte for byte as before.
  Each run of a workflow is a check suite of its own, so keying by suite alone would count a
  checker's own earlier runs on the same head (its job's run and its `dunstan` run from before the
  pull request body was edited), which the latest, excluded, run of each name used to supersede. An
  excluded run therefore supersedes every run of its name with a lower `id`, in any suite, as it did
  before this amendment; a record without check suites counts the same either way.
  `appSlug` is recorded, and no check reads it. Both members are inside the evidence, so
  `digests.evidence` covers them and offline verify reproduces the verdict. `record-0.1.schema.json`
  gains the two optional members on a check run; a record without them stays valid. Section 14 adds
  them to what a record publishes. The block format and `handback-block-0.1.schema.json` are
  unchanged; a 0.1 block stays valid. No example record changes: none records a check suite. The
  acceptance cases gain the planted `checks-same-name-two-workflows`; every existing case keeps its
  expected values, and the preregistered tables are unchanged.

  **The probe, 2026-10-13.** GitHub's documentation does not show whether a re-run of an Actions job
  keeps its check suite, or whether `filter=latest` already keeps one run per check suite and name;
  until the probe ran, this note marked both questions "probe pending". The operator ran
  `experiments/checks-probe-2026-10/probe.mjs` against the sandbox repository from 05:04:20Z to
  05:05:37Z; its output is `experiments/checks-probe-2026-10/results.json`, with two snapshots,
  `first` (before the re-run) and `afterRerun`.
  - A re-run keeps its check suite: the failed `test` job's attempts 1 and 2 are two check runs in
    one suite (`afterRerun`, `checkRuns.all`). So its latest attempt supersedes the earlier one, as
    it did, and a re-run that later succeeded is not failed.
  - `filter=latest` lists both workflows' `test` runs, the failed one with the lower `id`, as in the
    false pass (`first`, `checkRuns.latest`). The read does not hide the failure; the reader's
    filter needs no erratum.
  - Once the re-run has completed, `filter=latest` leaves out the failed first attempt
    (`afterRerun`, `checkRuns.latest`; `checkRuns.all` still lists it).

  (Amended 2026-10-13: the key is now the workflow path and name, "Checks per workflow path" below,
  and the re-run question bears on it as that note says.)

  **Checks per workflow path (amended 2026-10-13).** Found in review of the amendment above, before
  release. Each run of a workflow is a check suite of its own, so counted per check suite and name
  a workflow run more than once on `headCommit` was counted once per run: a workflow on both `push`
  and `pull_request`, or one run again when the pull request is reopened. `total` then counted each
  job once per run, so a correct `total` failed with `count_mismatch`, and a failed earlier run
  made the observed `allSucceeded` `false` though a later run of the same workflow succeeded. Those
  are fails on correct claims, not passes; but a workflow on `push` and `pull_request` is common, so
  they would have been common, and the amendment above would have traded a rare false pass for a
  frequent false fail. A check means a job of a workflow, so section 7.5 now keys an Actions run by
  its workflow path and name, the latest workflow run winning. A check run does not name its
  workflow, so the evidence records it (section 6, "Workflow runs"): the checker reads every
  workflow run at `headCommit` and gives each check run whose check suite is a workflow run's that
  run's `workflowPath`, `workflowRunId` and `runAttempt`. Two workflows' `test` jobs still have two
  keys, so the failure the amendment above found is still read, and its planted case keeps `fail`.
  The latest run of a key is the highest `workflowRunId`, then `runAttempt`, then check run `id`.
  A workflow-runs read that fails, or that names one check suite twice, makes `checkRuns`
  `unreadable` with kind `workflow_runs`, so the claims are `unverifiable` with
  `source_unreadable:workflow_runs`; they are never counted per suite instead. No reason is added.

  A run with a check suite and no workflow path is keyed by its check suite and name: a run of no
  workflow, and every run of a record written under the amendment above, which recorded no
  workflows. None of those records was released. No path is inferred for them. A run of an app
  other than GitHub Actions has no workflow; keying it by its suite rather than by its app keeps
  apart any two suites the record cannot show to be one check, so a GitHub Actions run whose suite
  is not among the workflow runs listed is never merged with another workflow's run of its name. A
  record with neither member counts by name alone, as before. The excluded-run rule of the
  amendment above stands: an excluded run supersedes every run of its name with a lower `id`,
  whatever its key.

  The three members are inside the evidence, so `digests.evidence` covers them and offline verify
  reproduces the verdict. `record-0.1.schema.json` gains them as optional members of a check run,
  each of `workflowRunId` and `runAttempt` requiring `workflowPath`, and `workflowPath` requiring
  all three of `checkSuiteId`, `workflowRunId` and `runAttempt`; a record without them stays valid.
  Section 14 adds them to what a record publishes. The block format and
  `handback-block-0.1.schema.json` are unchanged; a 0.1 block stays valid. No example record
  changes: none records a check suite. The acceptance cases gain the positive controls
  `checks-push-and-pull-request` and `checks-reopened-same-workflow`, each of which fails when
  counted per check suite and name. Every existing case keeps its expected values, and
  `checks-same-name-two-workflows`, written by the amendment above's reader, is counted per check
  suite and name and keeps `fail` with `all_succeeded_mismatch`.

  **Re-runs, observed 2026-10-13.** Until the probe ran, this note marked the re-run case "probe
  pending". The workflow-runs listing gives each workflow run once, at its latest attempt, with that
  attempt's `check_suite_id`. The probe of 2026-10-13 above
  (`experiments/checks-probe-2026-10/results.json`) observed, on the sandbox repository:
  - A re-run keeps its check suite (`afterRerun`, `checkRuns.all`, and the failed workflow run's
    `attempts` in `workflowRuns`), and the listing gives that workflow run at attempt 2 with the
    same `check_suite_id` (`afterRerun`, `workflowRunsAtHead`). So every attempt's check runs carry
    the same `workflowRunId` and `runAttempt`, and the highest check run `id` is the latest: a
    re-run is resolved by the latest workflow run, then the latest attempt, then the check run
    `id`, and the failed first attempt is superseded by the attempt that succeeded.
  - Every GitHub Actions check run's suite is a listed workflow run's (`afterRerun`, `checkRuns.all`
    and `workflowRunsAtHead`; `first` shows the same). So every Actions check run is recorded with
    its workflow path, and none is keyed by its suite for want of one.
  - The workflow on `push` and `pull_request` gave two workflow runs at the head, in two check
    suites, with one `path` (`first`, `workflowRunsAtHead`). So its job `build` is one key and is
    counted once, which counted per check suite and name it was not.

  Each observation is what the rule above was written to rely on: no code, verdict, version,
  example record or acceptance case changes. Reading each attempt (`GET
  .../actions/runs/{id}/attempts/{n}`) is not needed, since no attempt is in a suite of its own.
- **0.1.3** (2026-10-07). Erratum to sections 6 and 7.4, corrected in checker 0.1.6. In 0.1.2 a
  `closes` issue that had been transferred to another repository failed with `not_closing` when the
  report named it as it was before the transfer. GitHub lists it among the closing references under
  its new repository and number, and answers the read of its old name with a redirect to the new
  one, so it "exists"; the check compared only the old name with the list. That fail rested on an
  absence under a name the issue no longer has, not on evidence that the pull request does not close
  it, which section 2 forbids. The checker now follows the issue read's redirect, and only that one,
  records the identity the answer gives as `resolvedAs` in the issue's `references` entry (section
  6, "Resolved identity"), and the claim passes when that identity is among the closing references
  (section 7.4). Every other outcome is unchanged: `not_found`, `closing_link_unsettled`,
  `not_closing` and every `unverifiable` reason, and a redirect that cannot be read is
  `unverifiable`, never `pass`. `resolvedAs` is inside the evidence, so `digests.evidence` covers it
  and offline verify reproduces the verdict. `record-0.1.schema.json` gains the optional member, which
  requires `exists: true`; a 0.1.2 record stays valid. The block format and
  `handback-block-0.1.schema.json` are unchanged; a 0.1 block stays valid. No example record changes
  verdict or digest: none reads an issue GitHub resolved elsewhere. The positive control
  `closes-transferred` is added to the acceptance cases; the preregistered tables are unchanged.
- **0.1.2** (2026-10-06). Erratum to section 7.4, corrected in checker 0.1.3. In 0.1.1 a `closes`
  issue that exists and is missing from the closing references failed with `not_closing` whatever
  the pull request's state. GitHub computes `closingIssuesReferences` asynchronously after a pull
  request is opened or its body is edited, so for an open pull request that fail rested on an
  absence that could still change, which section 2 forbids. Such an issue is now `unverifiable`
  with `closing_link_unsettled` while the pull request is open (`state` `open`, `merged` `false`),
  and still fails with `not_closing` once it is merged or closed. The rule reads `pullRequest.state`
  and `merged`, which the evidence already holds, so no evidence section changes. Section 16 adds
  the reason, and `record-0.1.schema.json`'s claim reason pattern accepts it. The block format and
  `handback-block-0.1.schema.json` are unchanged; a 0.1 block stays valid. The example
  `spec/examples/records/fail.json` is an open pull request: its `closes` row is now
  `unverifiable`, its claims digest changes, and its verdict stays `fail` (section 15). The
  preregistered acceptance case `closes-not-linked` is a merged pull request and keeps its expected
  `fail` with `not_closing`.
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
> 0.1.4. Sections 1 to 17, `handback-block-0.1.schema.json`, `record-0.1.schema.json` and every 0.1
> verdict stand as written. A 0.1.4 checker ignores this section. The key words of section 1 are
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
| 3 | `check_run` | `checkRuns.runs`, counted as in section 7.5 (the latest per workflow path and name) | the run `id` as a string | `name` |
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
     occurring whole and case-sensitively. A named `classname.name` restricts its `name` to that
     test: the same `name` under another classname, or under none, is not an identifier match for
     that claim. A check run's `name` MUST NOT match where the text continues it with a hyphen, as
     part of a longer check run `name` of the record occurring whole at the same place, or with a
     matrix leg (` (` directly after it): `test` is not named by `test (ubuntu-latest)`, and a
     claim about a matrix job names its leg.

   An identifier match has `score: null`.
2. **BM25** over every item's fields: k1 = 1.2, b = 0.75, IDF `ln(1 + (N − n + 0.5) / (n + 0.5))`
   over all items of the pull request, each distinct query term once. Tokenisation is as
   `docs/retrieval.md` states. Scores are rounded to 6 decimal places.
3. **Floor.** An item that is not an identifier match is a candidate only if its rounded score is
   at least the **floor, 1**, or it fills the list (step 5). The floor is recorded with every
   reader claim.
4. **Order.** Identifier matches first, then by score descending. Ties break by record order, then
   by `id` in code-unit order.
5. **Filling to k.** When fewer than k candidates reach the floor, the places left below k are
   filled by the next items of the allowed types below the floor, in the same order
   (`docs/retrieval.md`), after the candidates that reach it. A **filled** candidate is one whose
   `score` is below the recorded floor. The list is never cut: with k or more candidates at or
   above the floor, nothing is filled. This is the default, with k = 5, and its `retrieval` member
   is `{"arm": "A-fill", "floor": 1, "k": 5}`. A record written before it was the default has
   `{"arm": "A", "floor": 1}` and no filled candidate.

A claim of a known kind (D.6) has candidates only of that kind's item type. A **candidate** is
`{type, id, score, matchedField}`. Every candidate at or above the floor is recorded, and every
filled candidate after them.

Retrieval narrows where to look. It is never evidence and never decides a verdict: a filled
candidate MUST NOT be read by a check (D.6).

An embedding arm (Arm B) MAY be added behind a provider seam, if a measurement shows it closes a
gap. Its scores, like BM25's, MUST NOT be read by a check.

### D.5 A reader claim

```json
{ "text": "The typecheck job passes", "kind": "check_succeeded", "declaredValue": true,
  "reader": { "name": "example-reader", "version": "0.0.1" }, "probability": 0.8,
  "retrieval": { "arm": "A-fill", "floor": 1, "k": 5 },
  "candidates": [ { "type": "check_run", "id": "103", "score": null, "matchedField": "name" },
                  { "type": "check_run", "id": "101", "score": 0, "matchedField": "name" },
                  { "type": "check_run", "id": "102", "score": 0, "matchedField": "name" } ],
  "observed": false, "verdict": "fail", "reason": "all_succeeded_mismatch" }
```

- `text`, `kind`, `declaredValue`, `reader` and `probability` are the reader's output, recorded as
  given. `probability` is OPTIONAL and MUST NOT be read by any check (section 2: no probability
  decides anything).
- `retrieval` and `candidates` are retrieval's output.
- `observed`, `verdict` and `reason` are the check's output (D.6). As in section 7.1, a `pass`
  carries no `reason`, and a `fail` or `unverifiable` always does.

### D.6 Kinds and checks

The check is a pure function of `kind`, `declaredValue`, the recorded `candidates`, the recorded
`retrieval.floor` and the evidence. It never runs retrieval. After step 3 it reads only the
candidates it **combines**, from those of the kind's item type:

- **Exact identifier matches close the set.** If at least one is an identifier match
  (`score: null`), it combines the identifier matches only. A lexical candidate stays in the
  recorded list, as what retrieval saw. Its numeric `score` beside an identifier match marks it as
  not combined, and it MUST NOT decide the verdict.
- Otherwise it combines every candidate at or above the floor.

A filled candidate (D.4) is never combined. In order:

1. A kind not in the table below, or a `declaredValue` of the wrong type for its kind:
   `unverifiable`, `no_comparable_record_field`.
   - **`reference_closes`** is then decided by the 0.1 gate's own check and by nothing else: a
     `declaredValue` that is not `#N` or `owner/repo#N` is `unverifiable`,
     `no_comparable_record_field`; otherwise the claim's `verdict`, `reason` and `observed` are
     those of the section 7.4 row of a block that declares one `{"issue": declaredValue,
     "relation": "closes"}` reference and nothing else, as D.11.4 compares a `reference_closes`
     advisory. `#N` is in the subject repository. Steps 2 to 6 do not apply, and no candidate is
     read: a candidate, a cross-reference or a `connected` event never makes the claim `pass`,
     and evidence 7.4 needs that the record lacks gives the 7.4 row's reason, never `pass`.
2. The evidence section for the kind's item type is unread: `unverifiable`, with
   `source_unreadable:<kind>` or `evidence_field_unpopulated:<field>` (section 6).
3. A recorded candidate of that type that the evidence does not hold: `unverifiable`,
   `candidate_not_in_evidence`.
4. **No candidate of that type at or above the floor: `unverifiable`, `no_matching_record_item`,
   with the floor stated in `retrieval.floor`. Never `pass`, whatever was filled.** For
   `file_changed` with an incomplete file list, the reason is `file_list_truncated`.
5. **Ties that disagree are ambiguous.** For `check_succeeded` and `test_passed`: if no combined
   candidate is an identifier match, and two or more combined candidates tie on the top `score`
   (compared exactly after rounding to 6 decimal places, with no margin), and they disagree on the
   outcome the kind reads, the claim is `unverifiable`, `ambiguous_candidates`. The check neither
   combines nor reads them. The outcome is a run's succeeded, failed (completed with any other
   conclusion, as section 7.5 reads it) or not completed, and a test case's `passed`, `failed` or
   `skipped`. Tied candidates that agree on the outcome are not ambiguous, and a candidate below the
   top score never makes a claim ambiguous.
6. The kind's own check:

| `kind` | `declaredValue` | Item type | Passes when | Otherwise |
| --- | --- | --- | --- | --- |
| `file_changed` | a path | `file` | a candidate's `path` or `previousPath` equals it; `observed` is the path | `unverifiable`, `declared_item_not_among_candidates` (or `file_list_truncated`) |
| `commit_present` | 7 to 40 hex digits | `commit` | a candidate's SHA starts with it; `observed` is the SHA | `unverifiable`, `declared_item_not_among_candidates` |
| `reference_in_timeline` | `#N` or `owner/repo#N` | `timeline_event` | a candidate's `ref` is that issue; `observed` is `{event, ref}` | `unverifiable`, `declared_item_not_among_candidates` |
| `reference_closes` | `#N` or `owner/repo#N` | `timeline_event` | the 7.4 `closes` row passes (step 1); `observed` is the row's | the 7.4 row's `fail` or `unverifiable` and its reason |
| `check_succeeded` | boolean | `check_run` | it equals the section 7.5 `allSucceeded` rule over the combined runs | `fail`, `all_succeeded_mismatch`; `unverifiable`, `checks_incomplete` |
| `test_passed` | boolean | `test` | it equals "no executed combined candidate failed" | `fail`, `test_outcome_mismatch`; `unverifiable`, `test_not_executed` if every combined candidate was skipped |

`reference_in_timeline` means the record mentions the issue: it passes on any timeline event that
names it, a bare cross-reference included. A claim that the pull request closes an issue ("Closes
#12", "Fixes #12") is `reference_closes`, and `reference_in_timeline` MUST NOT stand in for it. A
`reference_closes` claim's candidates are the timeline events retrieval finds for the issue (D.4):
where the record mentions it, recorded, and never what decides it.

New reason codes: `no_matching_record_item`, `declared_item_not_among_candidates`,
`candidate_not_in_evidence`, `ambiguous_candidates`, `test_not_executed`, `test_outcome_mismatch`.
A `reference_closes` claim gives the 7.4 reasons of section 16: `not_closing`, `not_found`,
`closing_link_unsettled`, `closing_base_not_default`, `closing_event_unsettled`, and the unread
reasons of its sections, `source_unreadable:closing_references`, `source_unreadable:repository`,
`source_unreadable:issue`, `source_unreadable:pull_request_commits` and
`evidence_field_unpopulated:<field>`.

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
   every candidate was proposed by BM25 alone at or above the floor (a filled candidate is never
   read, D.6). The stricter alternative: a `pass` needs at least one identifier-matched candidate,
   and is otherwise `unverifiable`.
5. **"All" claims.** "CI is green" is a claim about every check run. As drafted, it is checked
   against whichever runs retrieval proposes. A kind such as `checks_all_succeeded`, whose items
   are all check runs without retrieval, would match 0.1's `checks.allSucceeded`.
6. **Identity kinds never fail.** A declared file, commit or reference that is not among the
   candidates is `unverifiable`, not `fail`. With a complete file list, `file_changed` could fail
   with `declared_not_changed` as 0.1 does. (`reference_closes` is not an identity kind: it fails
   where the 7.4 row fails, D.6.)
7. **The verdict.** Should reader claims enter `predicate.verdict` (D.7), under section 8's rule or
   another?
8. **Versioning.** Section 13 treats each 0.x minor as a major. This draft adds only record
   members and leaves the block at `"0.1"`. It needs a decision on whether 0.2.0 bumps the block
   version too, and on the predicate type and `spec` string used here (`v0.2-draft`,
   `"0.2.0-draft"`).
9. **The floor.** 1, for the reason in D.4 and `docs/retrieval.md`. The retrieval measurement
   takes recall at k = 5 on a private corpus and may propose another value.
10. **One job name in two workflows.** The `check_run` items are the runs section 7.5 counts. As
    first drafted that was the latest per name, so a claim about one workflow's `test` could be
    decided by another workflow's later run of the same name, and a run in `checkRuns.runs`
    carried no workflow, check suite or app, so that evidence could not be told apart from a
    re-run in one workflow, whose latest run is the one to read. One option: a claim whose combined
    run's name is held by more than one run in `checkRuns.runs` is `unverifiable`,
    `ambiguous_check_run`, re-runs included. The other: the evidence records each run's check suite
    (or workflow), and only runs of different suites are ambiguous. **Since spec 0.1.4 as amended
    2026-10-12** (section 17, "Checks per check suite"), the evidence records each run's
    `checkSuiteId` and section 7.5 counts the latest run per check suite and name. So two
    workflows' `test` runs are now two items, and a claim naming `test` combines both; a re-run in
    one suite is one item. The data for the second option is in the evidence; the `check_run` item
    does not carry it yet. Which option the reader rule takes, and what a record without check suites gives, is
    not decided here: the reader rule is unchanged. **Since the amendment of 2026-10-13** (section
    17, "Checks per workflow path"), the evidence also records each Actions run's `workflowPath`,
    and section 7.5 counts the latest run per workflow path and name: one workflow run twice on the
    head is one item per job, and two workflows' `test` jobs are still two. The second option can
    now key by the workflow itself; the reader rule is still unchanged.

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
  "extractor": { "version": "0.1.3", "digest": { "sha256": "<64 hex>" } },
  "comparison": { "version": "0.4.0" },
  "precision": null,
  "differsAccuracy": null,
  "pathsAtHead": [
    { "path": "docs/y.md", "status": "ok", "object": null },
    { "path": "src/z.ts", "status": "ok", "object": "Blob" }
  ],
  "advisories": [
    { "clause": "I changed src/a.ts, src/z.ts and docs/y.md.", "kind": "file_changed",
      "value": "src/z.ts", "observed": null, "note": "differs:declared_not_changed" },
    { "clause": "I changed src/a.ts, src/z.ts and docs/y.md.", "kind": "file_changed",
      "value": "docs/y.md", "observed": null, "note": "unanswered:no_such_path" }
  ]
}
```

- `extractor` names the grammar that ran. `digest.sha256` is the SHA-256 over the JCS bytes of the
  grammar: every word list and limit the extractor reads (`GRAMMAR` in `src/advisory/grammar.ts`).
  Any change to the grammar changes the digest.
- `comparison` names the rules that turned each proposed claim and the evidence into its note
  (D.11.4). Its `version` is separate from the extractor's: a change to the comparison leaves the
  grammar and its digest as they were. `0.1.0` compared a file claim by exact path only. `0.2.0`
  also matches it by name. `0.3.0` also asks whether a path not among the changed files exists at
  the head. `0.4.0` compares a `reference_closes` claim by the spec 0.1.4 `closes` check, which
  reads who closed the target (section 7.4). A record written before `comparison` existed was compared by `0.1.0`.
- `pathsAtHead` (comparison 0.3.0) holds the answers a file claim's note was computed from (D.11.4,
  D.11.5): one entry for each distinct path in `pathsToRead`, in code-unit order of `path`. An
  entry is `{path, status: "ok", object}`, where `object` is `"Blob"` (a file), `"Tree"` (a
  directory) or `null` (nothing at that path at the head), or `{path, status: "unreadable"}`. It
  never holds an object's content, size or id.
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
   nothing. A file list or a merge time after a colon can bind to the clause before it (item 7).
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
     guard", "mutation", "by design") proposes no false test or check result and no count. It
     proposes a true one only for a pass predicate followed by a final state ("green with it").
     When a staging phrase ("deliberately", "on purpose", "mutation", "by design") stands before
     its fail predicate, it proposes no file claim either;
   - since 0.1.3, an issue that is not the verb's subject leaves a closing keyword or a commit in
     the clause this pull request's ("Builds on #10 and closes #12"), and a closing keyword inside
     a bracket binds only when it opens the bracket ("(closes #12)", but not "(the earlier fix
     closed #12)").
7. **Across a colon** (0.1.3). A clause that ends in a colon and holds an asserting file verb with
   a files noun ("Files changed:", "Changed the following files:") heads a list: the paths of the
   clause after it on the same line, or of the list items on the lines after it, bind to its verb
   when that clause has no verb, negation or modal of its own. A timestamp after "Merged at:" or
   "Merge time:" on the same line binds as `merged_at`, and so does a timestamp alone before a
   colon followed by "merged".

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

Comparison 0.3.0 then asks about each value the rules above leave `differs:declared_not_changed`:
these values are `pathsToRead`. Its note is decided by the recorded answer for the object at
`<head>:<value>` in `pathsAtHead` (D.11.2), the value read as a path from the repository root:

- a `Blob` keeps `differs:declared_not_changed`;
- `null` gives `unanswered:no_such_path`;
- a `Tree` gives `unanswered:directory`;
- an `unreadable` answer, or none, gives `unanswered:source_unreadable:path`. It is never `differs`
  and never `agrees`.

`observed` stays `null` for each. Every other note is the one comparison 0.2.0 gives.

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

Then, for each path in `pathsToRead` (D.11.4), and for nothing else, the checker reads the type of
the object at `<head>:<path>`, where `<head>` is the pull request's head as read, with one fixed
GraphQL query that asks for `__typename` only:

```graphql
query($owner: String!, $name: String!, $expression: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) { __typename }
  }
}
```

A failed read, a GraphQL error, or an answer of any other shape or type is `unreadable`. The answers
are not 0.1 evidence: they are written to `pathsAtHead`, so `digests.evidence` does not cover them
and `digests.advisory` does. No gate check reads them.

#### D.11.6 Re-running

Offline verify recomputes each advisory's `observed` and `note` from its **recorded** `kind` and
`value`, the evidence and the **recorded** `pathsAtHead`, never from a fresh read, and checks that
`pathsAtHead` lists exactly the paths in `pathsToRead`. It compares `extractor` and `comparison` with the running checker's,
`precision` with the measurement published for that digest, `differsAccuracy` with the measurement
published for that digest and that comparison version, and `digests.advisory`. The record holds no report text
beyond each `clause`, so extraction is not re-run. As in D.8, an online re-run of a draft record is
not defined.

#### D.11.7 What a record would newly publish

Beyond section 14 and D.9: one clause of the report for each advisory, its kind and value, the
extractor's version, digest and precision, the comparison's version, the accuracy of `differs`
notes with its base rate, and, for each path in `pathsToRead`, whether a file, a directory or
nothing is at that path at the head.

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

- **2026-10-13.** A reader claim kind `reference_closes` (D.6), by the operator's ruling of
  2026-10-13. A reader could type "Closes #12" only as `reference_in_timeline`, which passes on a
  bare cross-reference: a mention, not a close. A `reference_closes` claim is decided by the 0.1
  gate's section 7.4 `closes` row for a block that declares that one reference, as D.11.4 compares
  a `reference_closes` advisory; its candidates are the timeline events that name the issue, and
  none is read. `reference_in_timeline` is unchanged and MUST NOT stand in for a closing claim. The
  DRAFT schema's reader claim reason accepts `not_closing`, `not_found`,
  `closing_link_unsettled`, `closing_base_not_default`, `closing_event_unsettled` and the source
  kinds `closing_references`, `repository` and `issue`. A draft record written before this change
  that holds a `reference_closes` claim recorded it `unverifiable`, `no_comparable_record_field`,
  and gives the 7.4 row when its check is recomputed (D.8). No 0.1 verdict changes, and the 0.1
  schemas, the advisory comparison and its notes are unchanged.

- **2026-10-13.** Ties that disagree are ambiguous (D.6 step 5), with the new reason
  `ambiguous_candidates`. A `check_succeeded` or `test_passed` claim that names nothing exactly,
  whose top candidates tie and disagree on the outcome, is `unverifiable` and no longer combines
  them. A draft record written before this change that holds such a claim gives a different
  `verdict` and `reason` when its check is recomputed (D.8); no 0.1 record is affected.

- **2026-10-13.** Spec 0.1.4 as amended 2026-10-13 (section 17, "Checks per workflow path"). The
  `check_run` items are the runs section 7.5 now counts, the latest per workflow path and name
  (D.3). D.10 item 10 notes that the evidence now holds each Actions run's workflow; the reader
  rule (D.4, D.6) is unchanged. A record without workflow paths gives the same items as before.

- **2026-10-12.** Spec 0.1.4 as amended 2026-10-12 (section 17, "Checks per check suite"). The
  `check_run` items are the runs section 7.5 now counts, the latest per check suite and name (D.3).
  D.10 item 10 notes that the evidence now holds the data for its second option; the reader rule
  (D.4, D.6) is unchanged. A record without check suites gives the same items as before.

- **2026-10-11, amended 2026-10-12 before release.** Spec 0.1.4 (section 17), advisory comparison
  0.4.0. A `reference_closes` advisory is compared by the 7.4 `closes` check, which now reads who
  closed the target: an advisory naming a target this pull request, one of its commits or its merge
  commit closed is `agrees`, with the ClosedEvent in `observed` as `closedBy`; a merge into a branch other than the default with the
  target open is `unanswered:closing_base_not_default`; a closed target whose read holds no
  ClosedEvent yet is `unanswered:closing_event_unsettled` (amended 2026-10-12: GitHub sets the
  state before its timeline shows the event); and `differs:not_closing` carries the
  target's `state` and `events` in `observed`. Because the notes a `reference_closes` claim can carry
  changed, the comparison is versioned: `0.4.0`. Its other rules are 0.3.0's. No published figure
  applies to comparison 0.4.0, so a record compared by it carries `null` for `differsAccuracy`,
  shown as "unmeasured". The words a reader is shown for `differs:not_closing` become "not closed by
  this pull request or its commits". The DRAFT schema's evidence references the 0.1 `closeEvents`
  section, and its advisory note accepts `closing_base_not_default`, `closing_event_unsettled` and
  `source_unreadable:pull_request_commits`. Comparison 0.4.0 was not released before the amendment,
  so it is amended, not versioned again. The extractor is unchanged. The checker that runs it is
  0.1.7.

- **2026-10-07.** Spec 0.1.3 (section 17). A `reference_closes` advisory is compared by the 7.4
  `closes` check, so an advisory naming an issue since transferred to another repository, which the
  closing references list under the identity GitHub resolves it to, is now `agrees`, with that
  identity in `observed`, not `differs:not_closing`. The comparison stays 0.3.0: its own rules are
  unchanged, and the gate check under it is named by the record's `spec` and `checker`. No published
  figure applies to comparison 0.3.0, so none changes. The extractor, the DRAFT schema and the record
  members are unchanged. The checker that runs it is 0.1.6.

- **2026-10-07.** Advisory comparison 0.3.0: a `file_changed` advisory that comparison 0.2.0 notes
  `differs:declared_not_changed` keeps that note only when its path is a file at the pull
  request's head. Nothing there gives `unanswered:no_such_path`, a directory
  `unanswered:directory`, and an answer not read `unanswered:source_unreadable:path` (D.11.4). The
  checker reads the type of the object at each such path with one fixed GraphQL query that asks
  for `__typename` only (D.11.5), and the advisory section gains `pathsAtHead`, the answers the
  notes were computed from (D.11.2), which offline verify reads (D.11.6). The DRAFT record schema
  gains `pathsAtHead` and the three notes. Every other note, the extractor, the gate and sections
  1 to 17 are unchanged. The published `differs` figure stays bound to comparison 0.2.0, so a
  record compared by 0.3.0 carries `null` for `differsAccuracy`, shown as "unmeasured". The
  checker that runs it is 0.1.5.

- **2026-10-07.** Advisory extractor 0.1.4 reverted to 0.1.3, exactly: its lists, rules and
  version, so the grammar digest is `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`
  again. 0.1.4's rules did not generalise: on the held-out half of the open-source study they left
  the share of false accusations where the 0.1.3 baseline had it (`docs/advisory.md`, "Labels,
  used names and descriptions"). D.11.3 is as it was before 0.1.4. No figure was published for
  0.1.4, and none is for 0.1.3 on real pull requests.

- **2026-10-07.** Advisory extractor 0.1.4: a third-person form that closes a bold label is a noun,
  and an operand phrase (`use of`, `command for`, …) stops the binding (D.11.3, item 4); a path put
  into another path, a path in a generic clause opened by `a` or `an`, and a path in a relative
  clause in the past passive propose no file claim (D.11.3, item 6; `docs/advisory.md`, "Labels,
  used names and descriptions"). Each rule only drops a file claim. The grammar digest changes from
  `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37` to
  `78b92a682063464faf3cf1de13123d2b232bb3575effd5f31f0e12905643d45c`. No figure is published for
  0.1.4, so a record it writes carries `null` for `precision` and `differsAccuracy`, shown as
  "unmeasured". The checker that runs it is 0.1.4. The comparison (0.2.0), the schemas, the record
  members and sections 1 to 17 are unchanged.

- **2026-10-06.** Spec 0.1.2 (section 17). A `reference_closes` advisory is compared by the 7.4
  `closes` check, so on an open pull request whose closing references do not list an existing
  issue its note is now `unanswered:closing_link_unsettled`, not `differs:not_closing`. The
  advisory note pattern of `record-0.2-draft.schema.json` accepts the reason. The comparison stays
  0.2.0: its own rules are unchanged, the gate check under it is named by the record's `spec` and
  `checker`, and the published `differs` figure was measured on merged pull requests only, whose
  notes do not change. The extractor and the record members are unchanged.

- **2026-10-06.** Advisory extractor 0.1.3: a file list after a colon binds to the verb of the
  clause before it ("Files changed: …"), and a timestamp after "Merged at:" or "Merge time:" binds
  as `merged_at` (D.11.3, item 7); a pull request's own closing keyword or commit is proposed
  beside another issue that is not the verb's subject, and `implemented` binds a SHA after
  "commit"; a closing keyword in a parenthetical history is not read; "by design" narrates a
  failure, and an edit staged to cause one proposes no file claim (D.11.3, item 6;
  `docs/advisory.md`, "Lists, merge times and own references"). Context in a neighbouring clause
  and a bare repository name are left as they were. The grammar digest changes from
  `dfd6563a934667a80448e49b7133ade6d2473e5e13cd9d05fd52c761a1a1780b` to
  `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`. The published figures stay
  bound to 0.1.1, so a record written by 0.1.3 carries `null` for `precision` and
  `differsAccuracy`, shown as "unmeasured", until 0.1.3 is measured. The comparison (0.2.0), the
  schemas, the record members and sections 1 to 17 are unchanged.

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

# Survey: how much of a repository's handbacks can be checked (DRAFT)

`dunstan survey` checks a repository's recent closed pull requests the way `dunstan check` checks
one. It reports **which claims the record could not settle, why, and what would fix it**, beside the
share of the claims it did settle that the record contradicts. It reports settleability. It says
nothing about why a claim was made, and a claim the record could not settle is neither supported
nor contradicted.

The survey record is DRAFT (`dunstan-survey-0.1-draft`). It changes no block, record, claim row or
verdict. The spec's informative section is "DRAFT survey 0.1" in
[`spec/claim-format.md`](../spec/claim-format.md).

## Usage

```sh
dunstan survey --repo <owner/name> --out <survey.json> [--summary <survey.md>]
               [--last <n>] [--since <YYYY-MM-DD>] [--author <login>]...
               [--report-comment-author <login>] [--advisory]
dunstan verify survey.json
```

| Flag | Meaning |
| --- | --- |
| `--repo <owner/name>` | Required. Read-only. `GITHUB_TOKEN` is optional; anonymous reads are allowed. |
| `--out <survey.json>` | Required: the survey record. |
| `--summary <survey.md>` | The Markdown summary. Without it, the summary is standard output. |
| `--last <n>` | The n most recently created closed pull requests (default 30, at most 200). |
| `--since <YYYY-MM-DD>` | Only pull requests created on or after that UTC date. Combines with `--last`. |
| `--author <login>` | Repeatable. Only pull requests opened by these logins, for example an agent's bot account. |
| `--report-comment-author <login>` | Read each report from that login's latest comment, as `check` does, instead of the pull request body. |
| `--advisory` | Also run the advisory prose reader ([`advisory.md`](advisory.md)) on every pull request. Its notes are counted in their own table and never enter either rate. |

The command exits 0 once it has written the survey record, and 3 on a usage error.

**A tests claim needs a token and a CI JUnit record.** GitHub serves workflow artifacts only to an
authenticated reader, even on a public repository. Without `GITHUB_TOKEN`, every tests claim that
names a JUnit record comes out unverifiable (`source_unreadable:artifact`), and so does every
`closes` claim (GitHub's GraphQL API refuses anonymous calls). A test run the block names but no CI
run uploaded is `record_not_found`, a run against a record kind other than `junit` is
`no_comparable_record_field`, and a run the block declares as local (`{"kind": "local"}`) is
`local_run_not_in_record`. All three count as not record-checkable.

**The record says whether it read with a token.** `selection.reader` is `{"authenticated": true}`
when `GITHUB_TOKEN` was set and `false` when it was not; the token itself is never recorded. The
remedy lines in the aggregate are worded for that reader, so `dunstan verify` recomputes them from
the record. The summary states the reader in its first lines, and an anonymous survey's summary
adds: "Without a token, every tests claim naming a JUnit record and every `closes` claim cannot be
settled, so the cannot-settle share is higher than an authenticated read of the same repository
would give."

## What it reads

1. The closed pull requests listing, newest first, 100 per page, up to the listings' bound of 100
   pages. It stops once the selection is full, once it lists a pull request created before
   `--since`, at a short page, at a page it cannot read, or at the bound. The record says which. A
   bound reached before `--last` pull requests were selected is recorded and shown, never silent.
   The listing is paginated by offset, newest created first, so it can move between two page
   reads. A pull request created after the last item already read that closes between two page
   reads shifts the later items back, and the next page repeats the last one read; the pull
   request that closed is not listed. (One older than the last item read that closes meanwhile
   lands on a later page, causes no repeat, and is read.) A pull request that reopens between two
   reads, inside the range already read, shifts the later items forward, and the next page skips
   one, with no repeat to show it. Each pull request number is kept once, at its first occurrence,
   in listing order; each page records how many of its items repeated an earlier one
   (`duplicates`), and the listing records their sum. The selection, the stop rules and the counts
   all use the deduplicated list, so no pull request is checked or counted twice, and the summary
   says how many were repeated when any were. Keeping each number once stops the double count; it
   does not recover the pull requests the move left out.
2. For each selected pull request, exactly what `dunstan check` reads, through the same pipeline
   (`src/pipeline/check-pull-request.ts`), each with a client of its own.

Every request is a GET, except the fixed GraphQL queries `check` already makes. A pull request the
check cannot read gets an entry with no record and a reason: `pull_request_unreadable`,
`pull_request_moved` (it moved twice while it was checked), `rate_limited` or `report_unavailable`.
No selected pull request is dropped.

## The two rates

| Rate | Numerator | Denominator |
| --- | --- | --- |
| The record could not settle | unverifiable + not record-checkable | all claims |
| Contradicted by the record, of the claims it settled | contradicted | supported + contradicted |

Each comes with its numerator, its denominator and a Wilson 95% interval. Every number in the
record is an exact integer or a four-decimal string. The second rate's denominator counts only the
claims the record could settle. The claims it could not settle are the first rate, stated beside
it, never left out silently.

## The mapping (version 0.2)

`src/survey/mapping.ts`. A test pins the version to a digest of the whole mapping and of every
remedy line, as worded with and without a token, so a change to either is a new version. Version
0.2 differs from 0.1 in two ways: the remedy lines are the one table the claims table also prints
from, each a function of the reader, with the claims table's wording for the four tests reasons;
and `local_run_not_in_record` is not record-checkable.

| Claim row | Type |
| --- | --- |
| head | T1 |
| scope (each file, and each omission) | T2 |
| `/tests/i/count` | T3 |
| `/tests/i/failures` | T4 |
| `/checks/total` | T5 |
| `/checks/allSucceeded` and `/checks/noneFailed` | T6 |
| `/mergedAt` | T7 |
| `/deployedAt` | T8 |
| references | R (a row the original study did not have) |

| Verdict and reason | Column |
| --- | --- |
| `pass` | supported |
| `fail` | contradicted |
| `unverifiable`, `record_not_found`, `no_comparable_record_field` or `local_run_not_in_record` | not record-checkable |
| any other `unverifiable` | unverifiable |

## Remedies

`src/remedy/remedies.ts` holds one line per reason code, each a function of the reader (whether
GitHub was read with a token), and the survey's summary prints it beside each reason a claim could
not be settled. Every reason in the spec's section 16 has a line: a reason that decides a claim
reads "no remedy: the record decides", and a test fails when a reason has neither. The same table
gives the `remedy:` line that `dunstan check`, the Action's summary and the MCP tool print under a
tests row unverifiable for one of the four tests reasons below. The lines the survey leads with:

| Reason | Remedy |
| --- | --- |
| `record_not_found` | no run of the named workflow at the head uploaded that artifact from that job. Publish the JUnit record from CI (docs/ci-test-records.md), then check that the record's workflow, job, artifact and path are the ones the run used: dunstan template --tests-ci fills them. |
| `no_comparable_record_field` | this record's kind has nothing Dunstan can compare. Name a junit record a CI run uploaded (docs/ci-test-records.md); for a run that left no record in CI, declare {"kind": "local"}. |
| `local_run_not_in_record` | these counts are from a local run. Publish the JUnit record from CI (docs/ci-test-records.md), and run dunstan template --tests-ci after CI has finished on your last push. |
| `source_unreadable:artifact`, with a token | the run uploaded the record, but it could not be read: it expired, was uploaded outside the latest attempt of the named job, the job had not completed, or the file is not well-formed JUnit. Re-run the job to upload it again, or check again once the job completes. |
| `source_unreadable:artifact`, without one | GitHub answers an artifact download only with a token (401 without one, even on a public repository). Check again with GITHUB_TOKEN set to a token that can read the repository, with actions: read. |
| `source_unreadable:*` (others) | The source did not answer: rerun later or with a token. |
| `evidence_field_unpopulated:*` | GitHub answered without the field the claim needs. |
| `record_ambiguous` | Several runs at the head disagree on the count. |
| `checks_incomplete` | CI had not finished when the record was read: check again once it has. |

## The summary

The summary is built from the survey record alone, so the same record always gives the same
Markdown. Its first lines give the selection and the reader. Then, in order:

1. the claims the record could not settle, by reason, with the remedy for each;
2. "Results": the two rates;
3. "By claim type": Type | Supported | Unverifiable | Not record-checkable | Contradicted, R last;
4. the advisory notes, if the survey ran the advisory reader, with a `differs` note shown as
   "possible disagreement, unverified";
5. the pull request counts: listed, selected, with a valid block, `block_missing`,
   `block_invalid`, `block_ambiguous`, and no record by reason, then how far the listing was read
   and, when a page repeated a pull request, how many were repeated.

The fixture the tests pin (`src/survey/testdata/fixture-summary.md`) is a worked example.

## The survey record

`spec/schema/survey-0.1-draft.schema.json`. It holds:

- the checker identity;
- the selection: the parameters, the reader (`{"authenticated": <boolean>}`), every listing page
  (request, SHA-256 of its body, read time, count, how many of its items repeated an earlier one,
  error), every listed pull request once (number, creation time, author, merged), the number of
  repeated items, why the listing ended, and the selected numbers;
- one entry per selected pull request, with the record `check` wrote for it, as written, or the
  reason there is none;
- the aggregate;
- the commands to verify it offline and to run it again;
- `digest.sha256`, the SHA-256 of the JCS bytes of the survey record without `digest`.

It holds no file contents and no report text beyond what its embedded records already hold.

## Verify

`dunstan verify survey.json` tells a survey record by its `format` field and, offline:

- verifies every embedded record as it verifies a record, and checks that each is of its entry's
  pull request and was written by the survey's checker;
- checks that the listing holds no pull request number twice, that its duplicate count is the sum
  of its pages', that its pages' items are exactly the listed pull requests plus the duplicates,
  and that the listing was read exactly as far as its stated end: no page before the last would
  have stopped it;
- recomputes the selection from the listing and the parameters, and checks that the entries are
  exactly the selected pull requests, in order, none twice;
- recomputes the aggregate, its remedy lines worded for the recorded reader, the rerun commands
  and the digest.

It exits 0 only if all of that matches, and otherwise names every member that differs.

### What verify proves, and what it does not

A survey record is unsigned, and it keeps only the SHA-256 of each listing page's body, not the
body. So `dunstan verify` proves that the record is **consistent with itself**: the selection, the
entries, the aggregate and the digest all follow from what it records, and every embedded record
verifies on its own.

It does **not** prove:

- that the recorded listing is what GitHub returned. A writer could leave a pull request out of the
  listing, adjust the page counts to match, and still produce a record that verifies;
- that an entry with no record was really unreadable, rate-limited, moved or without its report.
  The reason is recorded, not re-read;
- how many of a page's items repeated an earlier one on that page in particular. Verify checks the
  pages' duplicates against their items and the listed total, not against bodies it does not hold;
- that the listing missed no pull request. An honest run can miss one that closed or reopened
  between two page reads (step 1 of "What it reads"). `duplicates` counts only the closes that
  caused a repeat, and `0` does not prove the listing held still.

To trust a survey's completeness, run it again online, with the command in `rerun.online`. The
repository will have moved on since, so the second run reads the listing as GitHub returns it then,
not as it was at the first run's reads.

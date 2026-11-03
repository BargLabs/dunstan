# Settleability survey: example-org/example-repo

DRAFT (dunstan-survey-0.1-draft). dunstan 0.1.16, survey mapping 0.2. Read-only.

Selection: the 13 most recently created closed pull requests, opened by agent-bot. Report: the pull request body. Advisory reader: on.

GitHub was read with a token (GITHUB_TOKEN set).

This survey reports which claims the record could settle. A claim the record could not settle is neither supported nor contradicted.

## Claims the record could not settle

The record could not settle 6 of 31 claims.

| Reason | Column | Claims | Remedy |
| --- | --- | --- | --- |
| `record_not_found` | Not record-checkable | 2 | no run of the named workflow at the head uploaded that artifact from that job. Publish the JUnit record from CI (docs/ci-test-records.md), then check that the record's workflow, job, artifact and path are the ones the run used: dunstan template --tests-ci fills them. |
| `source_unreadable:artifact` | Unverifiable | 2 | the run uploaded the record, but it could not be read: it expired, was uploaded outside the latest attempt of the named job, the job had not completed, or the file is not well-formed JUnit. Re-run the job to upload it again, or check again once the job completes. |
| `checks_incomplete` | Unverifiable | 1 | CI had not finished when the record was read: check again once it has. |
| `local_run_not_in_record` | Not record-checkable | 1 | these counts are from a local run. Publish the JUnit record from CI (docs/ci-test-records.md), and run dunstan template --tests-ci after CI has finished on your last push. |

## Results

| Measure | Claims | Of | Share | Wilson 95% |
| --- | --- | --- | --- | --- |
| The record could not settle | 6 | 31 claims | 0.1935 | 0.0919–0.3628 |
| Contradicted by the record, of the claims it settled | 3 | 25 settled claims | 0.1200 | 0.0417–0.2996 |

## By claim type

| Type | Supported | Unverifiable | Not record-checkable | Contradicted |
| --- | --- | --- | --- | --- |
| T1 head commit | 7 | 0 | 0 | 0 |
| T2 files changed | 8 | 0 | 0 | 2 |
| T3 test count | 1 | 1 | 2 | 1 |
| T4 test failures | 2 | 1 | 1 | 0 |
| T5 check run total | 1 | 0 | 0 | 0 |
| T6 checks succeeded / none failed | 1 | 1 | 0 | 0 |
| T7 merged at | 1 | 0 | 0 | 0 |
| T8 deployed at | 0 | 0 | 0 | 0 |
| R references (a row the original study did not have) | 1 | 0 | 0 | 0 |
| All (31) | 22 | 3 | 3 | 3 |

## Advisory notes

The advisory reader read the prose of 11 pull requests. Its notes never enter either rate, and a possible disagreement is unverified.

| Note | As shown | Count |
| --- | --- | --- |
| `agrees` | agrees | 3 |
| `differs:declared_not_changed` | possible disagreement, unverified: not among the changed files | 1 |
| `unanswered:evidence_field_unpopulated:closingIssuesReferences` | unanswered:evidence_field_unpopulated:closingIssuesReferences | 1 |
| `unanswered:no_comparable_record_field` | unanswered:no_comparable_record_field | 1 |

## Pull requests

| Pull requests | Count | Remedy |
| --- | --- | --- |
| Listed | 14 |  |
| Selected | 13 |  |
| With a valid block | 7 |  |
| `block_missing` | 2 | The report has no dunstan-handback block: declare the claims in one (dunstan template writes it). |
| `block_invalid` | 1 | The block failed validation: check it against spec/schema/handback-block-0.1.schema.json before handing back. |
| `block_ambiguous` | 1 | The report has more than one dunstan-handback block: keep exactly one. |
| No record: `pull_request_unreadable` | 1 | The pull request could not be read: rerun later or with a token. |
| No record: `rate_limited` | 1 | GitHub rate-limited the reads: rerun later, or with a token for a higher limit. |

The listing was read for 1 page and no further because it held enough pull requests for the selection.

Verify offline: `dunstan verify survey.json`. Run again: `dunstan survey --repo example-org/example-repo --last 13 --author agent-bot --advisory --out survey.json`.

# Acceptance preregistration, checker 0.1

Operator's acceptance, 4 October 2026. Written, committed and pushed as the first commit of the
branch that added `src/check/`, before `src/check/` existed. Git order is the proof that the
expected values below were fixed before any check was implemented. That order is in the development
repository's history, which is kept privately and can be shown to an auditor.

This repository carries acceptance criteria (c) and (d). Criteria (a) and (b) run on private data
outside this repository and are not stated here.

- **(c) Planted defects.** One per check, plus undeclared files, a missing block and an unreadable
  source. Every one caught, none passed.
- **(d) Re-run on a second machine.** Identical verdicts, claims table and digests. Only read
  timestamps (`evidence.sources[].readAt`) may differ.

## The fixtures

Each case is a directory holding three files:

- `report.md`: the completion report, the text the block is extracted from (spec section 3);
- `evidence.json`: a metadata snapshot in the record's `evidence` shape (spec section 6;
  `record-0.1.schema.json#/$defs/evidence`). Every snapshot validates against that schema. The
  `sources` digests are of placeholder text: sources are provenance and lie outside every digest;
- `expected.json`: the block status (and the error codes or block count when it is not `found`), the
  overall verdict, and every expected claim row in spec order as `{id, verdict, reason?}`.

Every case uses the made-up repository `example-org/example-repo`. The pull request number is
`evidence.pullRequest.number`.

`fixtures/planted/` holds the planted defects; `fixtures/controls/` holds the positive controls.

## Expected values

### Positive controls: every one MUST be `pass`

A checker that never passes trivially catches every defect. The controls prove it can tell a true
report from a false one.

| Case | What it is | Expected |
| --- | --- | --- |
| `full` | Every field declared (scope, `closes`, `cites` issue and commit, JUnit counts, checks, `mergedAt`, `deployedAt`), every field true | `pass` |
| `minimal` | Only `dunstan`, `headCommit`, `filesChanged`, all true | `pass` |
| `rename` | A rename declared by its new path | `pass` |
| `rename-old-path` | A rename declared by its old path, which spec section 7.3 accepts | `pass` |
| `descendant-deploy-excluded-run` | Deployed by a later base-branch commit that descends from the merge (decided 2026-10-04); the checker's own in-progress check run listed in `excludedIds` | `pass` |
| `agreeing-runs` | Two candidate JUnit runs at the head that agree on both counts | `pass` |

Every row of every control is expected to be `pass`.

### Planted defects: every one MUST be non-pass, with its named reason

The required list, in its original order:

| Required item | Case | Expected verdict | Expected failing or unverifiable row and reason |
| --- | --- | --- | --- |
| head_mismatch | `head-mismatch` | `fail` | `head:/headCommit` `head_mismatch` |
| closes not linked | `closes-not-linked` | `fail` | `reference:/references/0` `not_closing` |
| cites a nonexistent issue | `cites-nonexistent-issue` | `fail` | `reference:/references/1` `not_found` |
| cites an unreachable commit | `cites-unreachable-commit` | `fail` | `reference:/references/2` `not_reachable` |
| test count wrong | `test-count-wrong` | `fail` | `count:/tests/0/count` `count_mismatch` |
| test failures understated | `test-failures-understated` | `fail` | `count:/tests/0/failures` `count_mismatch` |
| checks total wrong | `checks-total-wrong` | `fail` | `count:/checks/total` `count_mismatch` |
| allSucceeded with a failed check | `all-succeeded-with-failed-check` | `fail` | `count:/checks/allSucceeded` `all_succeeded_mismatch` |
| declared file not changed | `declared-file-not-changed` | `fail` | `scope:/filesChanged/3` `declared_not_changed` |
| undeclared changed file | `undeclared-changed-file` | `fail` | `scope:undeclared:package.json` `undeclared_file` |
| mergedAt premature | `merged-at-premature` | `fail` | `time:/mergedAt` `premature` |
| mergedAt on an unmerged PR | `merged-at-unmerged` | `fail` | `time:/mergedAt` `not_merged` |
| deployedAt with no deployment | `deployed-at-no-deployment` | `fail` | `time:/deployedAt` `no_deployment` |
| block missing | `block-missing` | `unverifiable` | block `missing` (`block_missing`), no rows |
| two blocks | `two-blocks` | `unverifiable` | block `ambiguous` (`block_ambiguous`), count 2, no rows |
| malformed block | `malformed-block` | `unverifiable` | block `invalid` (`block_invalid`), error `invalid_json`, no rows |
| unsupported version | `unsupported-version` | `unverifiable` | block `invalid`, error `unsupported_version`, no rows |
| source unreadable | `source-unreadable` | `unverifiable` | `count:/checks/total` and `count:/checks/allSucceeded` `source_unreadable:check_runs` |
| test record of an unsupported kind | `unsupported-test-record-kind` | `unverifiable` | `count:/tests/0/count` and `count:/tests/0/failures` `no_comparable_record_field` |
| required fields only, omits a changed file | `minimal-block-omits-file` | `fail` | `scope:undeclared:src/cache.test.ts` `undeclared_file` |

Further planted cases, one for each remaining reason code and fail-closed rule in spec sections 3 to 8:

| Case | Expected verdict | Expected failing or unverifiable row and reason |
| --- | --- | --- |
| `file-list-truncated` | `unverifiable` | both `scope:/filesChanged/<i>` and the single `scope:undeclared` row `file_list_truncated` |
| `files-unreadable` | `unverifiable` | `scope:/filesChanged/0` and `scope:undeclared` `source_unreadable:pull_request_files` |
| `closing-references-unpopulated` | `unverifiable` | `reference:/references/0` `evidence_field_unpopulated:closingIssuesReferences` (an absent list is not an empty one) |
| `cited-repository-unreadable` | `unverifiable` | `reference:/references/1` `source_unreadable:repository` (a not-found repository is unreadable, never absent) |
| `no-check-runs` | `unverifiable` | `count:/checks/allSucceeded` `no_check_runs` (`count:/checks/total` declared 0 passes) |
| `checks-incomplete` | `unverifiable` | `count:/checks/allSucceeded` `checks_incomplete` |
| `test-runs-disagree` | `unverifiable` | `count:/tests/0/count` `record_ambiguous` (the runs agree on failures, so that row passes) |
| `test-record-not-found` | `unverifiable` | `count:/tests/0/count` and `count:/tests/0/failures` `record_not_found` |
| `deployed-after-declared-time` | `fail` | `time:/deployedAt` `no_deployment` |
| `deployed-unrelated-commit` | `fail` | `time:/deployedAt` `no_deployment` |
| `deployed-relation-unknown` | `unverifiable` | `time:/deployedAt` `source_unreadable:compare` |
| `merged-at-unpopulated` | `unverifiable` | `time:/mergedAt` `evidence_field_unpopulated:merged_at` |
| `undeclared-rename` | `fail` | `scope:undeclared:src/storage/blob-store.ts` `undeclared_file` |
| `fail-beside-unverifiable` | `fail` | `scope:undeclared:package.json` `undeclared_file`, beside both checks rows `source_unreadable:check_runs` (a contradiction decides, spec section 8) |
| `unterminated-fence` | `unverifiable` | block `invalid`, error `unterminated_fence`, no rows |
| `block-names-repository` | `unverifiable` | block `invalid`, error `schema_violation`, no rows |
| `block-only-quoted` | `unverifiable` | block `missing`: the only handback fence is quoted inside a longer fence |

In every planted case, every row not named above is expected to be `pass`. `expected.json` lists every
row.

Addendum, 2026-10-04, spec 0.1.1. Added cases. The rows above are unchanged.
`closes-not-linked` keeps its expected values. Its evidence gains the `references` entry spec 0.1.1
reads for #17 (it exists).

| Case | Expected verdict | Expected failing or unverifiable row and reason |
| --- | --- | --- |
| `closes-repository-unreadable` | `unverifiable` | `reference:/references/0` `source_unreadable:repository` (a `closes` missing from the closing references, in a repository that answers 404) |
| `closes-nonexistent-issue` | `fail` | `reference:/references/0` `not_found` (a `closes` missing from the closing references, whose readable repository answers 404 for the issue) |

Addendum, 2026-10-06, spec 0.1.2. Added case. The rows above are unchanged. `closes-not-linked` is
a merged pull request, so spec 0.1.2 reads its closing references as settled and it keeps its
expected `fail` with `not_closing`.

| Case | Expected verdict | Expected failing or unverifiable row and reason |
| --- | --- | --- |
| `closes-unsettled-open` | `unverifiable` | `reference:/references/0` `closing_link_unsettled` (a `closes` of an existing issue missing from the closing references of an open, unmerged pull request, which GitHub may not have computed yet) |

### Cross-machine (d)

CI runs every fixture, planted and control, through `runChecks` and the record builder on
`ubuntu-latest` and on `macos-latest`, and writes each case's `claims`, `verdict` and `digests` to a
file. A final job compares the two files byte for byte. Expected: equal.

Golden digests for the positive controls (`digests.claims`, `digests.evidence` and `block.sha256`)
are committed with the implementation and a test fails on any drift from them.

## Decision rule

Acceptance passes only if all of these hold:

1. every planted case's observed verdict is not `pass`;
2. every planted case's observed verdict, block status and claim rows (id, verdict, reason, in order)
   equal its `expected.json`;
3. every positive control's observed verdict is `pass`, with every row as expected;
4. the cross-machine compare job finds the two machines' files identical.

**Any planted case passing, or any control not passing, fails acceptance, and the work is handed
back without claiming done.** A planted case that is caught with a reason other than the named one also
fails rule 2 and is reported as a mismatch, not as a catch.

The expected values above are not edited after this commit. If the implementation disagrees with a
case, the disagreement is reported in the pull request as a mismatch, with the case, the expected
value and the observed one.

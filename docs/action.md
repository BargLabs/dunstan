# The Dunstan GitHub Action

One step in a workflow and one required check in branch protection. The Action reads a coding agent's
completion report from a source you declare, finds the `dunstan-handback` block in it, checks each
claim against the pull request's own record, and reports the verdict. It is the same checker as
`dunstan check`: the same report and the same evidence give the same record from either, and CI holds
them to it (`src/action/parity.test.ts`).

Dunstan returns evidence. Your branch protection decides what blocks.

## Setup in three steps

**1. Add the workflow.** Copy this to `.github/workflows/dunstan.yml`, with the Action pinned to a
full commit SHA:

```yaml
name: Dunstan

on:
  pull_request:
    types: [opened, edited, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: read
  issues: read
  deployments: read
  checks: write
  actions: read

jobs:
  handback:
    runs-on: ubuntu-latest
    steps:
      - uses: BargLabs/dunstan@<full commit SHA>
        with:
          report-source: pr-body
```

No checkout step: the Action reads metadata through the API and never needs the repository's code.
`edited` re-runs the check when the pull request body changes. Give the job no `if:` and the trigger
no `paths:` filter (see [When the job does not run](#when-the-job-does-not-run)). Do not name the job
`dunstan`: that is the name of the check run the Action writes, and the one you require.

**2. Have the agent declare its claims.** The runner or harness that writes the agent's handback puts
one block in it, in the source you named. `headCommit` is the pull request's head commit, in full:

````markdown
```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "c0ffee12345678abcdef0123456789abcdef0123",
  "filesChanged": ["src/cache.ts", "src/cache.test.ts"],
  "tests": [{ "command": "pnpm test", "count": 214, "failures": 0,
              "record": { "kind": "junit", "workflow": ".github/workflows/ci.yml",
                          "job": "test", "artifact": "junit", "path": "junit.xml" } }],
  "references": [{ "issue": "#41", "relation": "closes" }]
}
```
````

The block's format is the open specification [`spec/claim-format.md`](../spec/claim-format.md).

**3. Require the check.** In branch protection (Settings, Branches, "Require status checks to pass
before merging") or in a ruleset ("Require status checks to pass"), add the check `dunstan`, with
GitHub Actions as its expected source. Require it on the branches agents merge into. If you use both
classic branch protection and rulesets, the requirement may live in either; check both when you audit
what a branch requires.

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `report-source` | none, required | `pr-body`, `comment:<author-login>` (that author's newest comment on the pull request: the login compared without regard to case, the latest `created_at`, then the highest comment id; the record names the comment by its id; a listing that reaches 100 pages of 100 without ending is unreadable, never a pick among the comments read, spec section 3) or `file:<path>` (a file in the workspace). The Action never guesses where a report is; with no value it concludes `failure`. |
| `github-token` | `${{ github.token }}` | Needs `contents: read`, `pull-requests: read`, `issues: read` (to read an issue a block closes or cites), `deployments: read` (for `deployedAt`), `checks: write`, `actions: read` (to read a JUnit artifact a block names, and the workflow runs a `checks` claim is counted by). Nothing else. Without `issues: read` or `deployments: read` the claims that need them are `unverifiable`, never passed. The `dunstan` check run is created with this token, so it is the token's app's run. Prefer your own GitHub App's installation token: every workflow in the repository creates runs as `github-actions`, which identifies no checker (spec 0.1.7, section 7.5), so with `${{ github.token }}` a `dunstan` run outside a workflow run's suite hides none of its earlier runs, and an earlier one in another suite is counted, which can fail a correct `checks` claim, never pass a wrong one. |
| `unverifiable-conclusion` | `failure` | The conclusion for an `unverifiable` verdict: `failure` or `neutral`. |
| `sign-key-path`, `signer` | none | An SSH private key and the signer principal: the record is written as its JCS bytes with a detached signature, both uploaded. |
| `advisory` | `false` | `true` also reads the report's prose for asserted claims and records each one, compared with the evidence, as an advisory (DRAFT 0.2.0, [`docs/advisory.md`](advisory.md)). Advisories never change the verdict, the conclusion or the title. The summary gains one row counting them, and a section listing each `differs` note as a "possible disagreement, unverified" ([`docs/advisory.md`](advisory.md), "How a `differs` note is shown"). |

| Output | Meaning |
| --- | --- |
| `verdict` | `pass`, `fail` or `unverifiable`; `error` when no record was written. |
| `record-path` | The record on the runner; empty when none was written. |

It runs on `pull_request`, `pull_request_target`, and `issue_comment` on a pull request (useful with
`comment:<login>`). On any other event it concludes `failure`.

## What each conclusion means

GitHub lets a merge through when a required check concludes `success`, `neutral` or `skipped`. So the
Action concludes `success` for `pass` and nothing else:

| Verdict | Conclusion | Meaning |
| --- | --- | --- |
| `pass` | `success` | A block was found and every claim in it holds against the record. |
| `fail` | `failure` | At least one claim is contradicted by the record. The table names the claim and the reason. |
| `unverifiable` | `failure` (default) | The record cannot answer a claim (a source unreadable, a field unpopulated, checks still running, a `closes` issue not yet among an open pull request's closing references, a `closes` target still open after a merge into a branch other than the default), or there is no single valid block: `block_missing`, `block_ambiguous`, `block_invalid`. Not a pass. |
| `unverifiable` | `neutral`, with `unverifiable-conclusion: neutral` | The same verdict, reported without blocking. A neutral required check lets the merge through, so this setting merges claims nobody could check. Choose it deliberately, for example while agents are being moved onto the block. |
| none (`error`) | `failure` | No record: `report-source` missing or malformed, the report source unreadable (no comment by that author, a comment listing past its bound, no such file), the pull request unreadable, the pull request moved while it was checked and again when checked once more (`pull_request_moved`, below), an event Dunstan cannot check, `file:` under `pull_request_target`, or a crash. The reason is in the summary. |
| any | `failure` | The record could not be uploaded as the artifact. A verdict whose record is not kept cannot be re-run. |
| (no check run) | pending | The job did not run, or could not write the check run (a fork, below). A required `dunstan` check that never reports blocks the merge. |

The step's exit status follows the conclusion: it fails for `failure` and succeeds for `success` and
`neutral`.

## What it writes

- A check run named `dunstan` on the pull request's head commit. Its title is the verdict and the
  reasons (for example `unverifiable: block_missing`); its summary is the claims table (claim,
  declared, observed, verdict, reason), the subject, the report's digest, the block status, the
  digests, and the commands to re-run the record.
- The record, uploaded as the workflow artifact `dunstan-record` (`dunstan-record.json`, and
  `dunstan-record.json.sig` when signed). One Dunstan step per workflow run: a second upload under
  the same name fails.
- The same table in the job summary.

It never comments on the pull request, labels it, reviews it or merges it.

The check run is created in progress before any evidence is read, and the Action excludes it and its
own job's check run from the counted check runs (a `checks` claim never counts the checker). An
excluded run also hides the earlier runs of its own identity (spec 0.1.7, section 7.5): its name and
workflow path, or for a run of no workflow its name and app, unless that app is `github-actions`,
which every workflow in the repository creates runs as and so identifies no checker. So the job's
check runs of an earlier Dunstan run on the same commit (before the body was edited, say) are not
counted either, and nor are earlier `dunstan` runs of the same workflow path, or of the same app when
the token is your own app's. A job of another workflow with the name of an excluded run is counted,
and so is a `github-actions` run of no workflow. GitHub, not the Action, chooses the check suite the
`dunstan` run joins, and with the workflow's `GITHUB_TOKEN` that may be a workflow run's. If an
earlier `dunstan` run joined another workflow's suite, or none, it is counted, which can fail a
correct `checks` claim. If the
`dunstan` run joins the suite of a workflow run with a job named `dunstan`, that job is one check
with it and is not counted. So give the Dunstan job a name no other check uses, and name no other job
`dunstan`. A
`checks` claim is checked against the check runs at the moment the Action runs: if CI is still
running, `checks.allSucceeded` is `unverifiable: checks_incomplete`. Re-run the Dunstan job once CI
has finished.

**A push while it runs.** The files, the closing references and the pull request's commits are read
by the pull request's number, at whatever head it has when they are read. So the Action reads the
pull request again once it has read the evidence (spec 0.1.7, section 6). If the head, the base
branch, the state or any other member of the record's `pullRequest` moved, it checks once more from
a fresh read. The
`dunstan` check run it created on the head the pull request left is completed as `failure`, titled
`not checked: the pull request moved to <sha> while it was checked`. A new `dunstan` check run on the
new head carries the new head's result. If the pull request moves again, no record is written: the
conclusion is `failure`, the verdict output `error`, and the summary says `pull_request_moved`. The
push itself starts a new workflow run, which checks the new head.

The counted check runs are the latest run per workflow and job name (spec section 7.5). GitHub names
an Actions check run after its job, not its workflow, and each run of a workflow is a check suite of
its own, so the Action also reads the workflow runs at the head and records, for each check run,
the `workflowPath`, `workflowRunId` and `runAttempt` of the workflow run it belongs to, and since
spec 0.1.5 its `workflowName`, beside its `checkSuiteId` and `appSlug`. The count does not read the
name. Then:

- Two workflows that each have a job `test` give two checks: `checks.total` counts both, and a
  failure in either makes `checks.allSucceeded` `false`.
- One workflow that runs more than once on the head commit is one check per job, as its latest
  workflow run ran it. That is not only a re-run: a workflow on both `push` and `pull_request` runs
  twice on a pull request's head, and closing and reopening the pull request runs it again. So
  `checks.total` counts each job once, and an earlier run that failed does not make
  `checks.allSucceeded` `false` when a later run of the same workflow succeeded.
- A check run of no workflow, such as one another app created, is counted per check suite and
  name. A record written before workflows were recorded is counted per check suite and name, and
  one written before suites were, by name alone, as each was then.

If the workflow runs cannot be read, the `checks` claims are
`unverifiable: source_unreadable:workflow_runs`; they are never counted another way. A re-run of a
job stays in its workflow run's check suite, as observed on 2026-10-13 (the spec's section 17,
"Re-runs, observed 2026-10-13"; `experiments/checks-probe-2026-10/results.json`, snapshot
`afterRerun`): the re-run supersedes the failed first attempt, so a job that failed and then
succeeded on a re-run counts as succeeded.

A `closes` claim reads the closing references GitHub computes after a pull request is opened or its
body is edited. Those list issues only, leave out an issue a commit message closed, and are not
populated for a pull request into a branch other than the default, so for an existing target missing
from them the Action also reads who closed it: every ClosedEvent of the target, and the pull
request's base branch, default branch and commits (spec 0.1.4, section 7.4). The claim passes when a
ClosedEvent names this pull request, one of its commits or its merge commit as the closer, for an
issue or a pull request target. Otherwise, while the pull request is open it is
`unverifiable: closing_link_unsettled`, never `fail`; merged into a branch other than the default
with the target still open it is `unverifiable: closing_base_not_default`; a target already closed
whose timeline shows no ClosedEvent yet is `unverifiable: closing_event_unsettled`, because GitHub
sets the state seconds before it shows the event; and once it is merged into the default branch or
closed, it fails with `not_closing` only when no ClosedEvent of the target names this pull request
or its commits. Re-run the Dunstan job if the closing references or the ClosedEvent were not there
yet when it ran, or once the base branch is merged into the default branch.

**Fork pull requests.** GitHub gives a `pull_request` workflow from a fork a read-only token, which
cannot create check runs. The Action then writes the job summary and the step's exit status only, and
says so in the summary; a required `dunstan` check stays pending for that pull request. To check
forks, run the Action under `pull_request_target`, below.

## Report sources and `pull_request_target`

`pull_request_target` runs the workflow as defined on the base branch, with a token that can write
checks even for a fork, which is why it is the event that can check fork pull requests. It is also
the event where checking out the pull request's code is dangerous: that code would run with the
write token. Dunstan needs no checkout at all, because it reads metadata through the API. Under
`pull_request_target` the Action refuses `file:` (a file in the workspace could only have come from
a checkout) and accepts `pr-body` and `comment:<login>`, both read from the API. Never add a checkout
of the pull request's head to a `pull_request_target` workflow that runs Dunstan.

```yaml
on:
  pull_request_target:
    types: [opened, edited, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: read
  issues: read
  deployments: read
  checks: write
  actions: read
jobs:
  handback:
    runs-on: ubuntu-latest
    steps:
      - uses: BargLabs/dunstan@<full commit SHA>
        with:
          report-source: pr-body
```

## When the job does not run

A required check is satisfied only by a check run that reports. If the job never runs, GitHub may
treat the required check as satisfied or as pending, depending on how the requirement is set:

- A job skipped by an `if:` condition reports its own check run as skipped, which satisfies a
  requirement on that job's name. This is why the requirement is on `dunstan`, the check run the
  Action writes, not on the job: a skipped job writes no `dunstan` run, so the requirement stays
  pending and blocks.
- A workflow filtered out by `paths:` or `branches:` at the trigger does not run at all. A required
  check then waits forever on every pull request the filter excludes. Do not filter the trigger.
- A pull request with merge conflicts gets no `pull_request` workflow runs at all, so the check stays
  pending until the conflict is resolved.
- `continue-on-error: true` on the job makes the job's own check run succeed whatever the step did.
  The `dunstan` check run still carries the real conclusion; require that one.

The recommended workflow above runs on every `pull_request` event, with no filter and no condition.

## Re-running a record

The check run's summary carries the commands:

```sh
gh run download <run id> --repo <owner/name> --name dunstan-record
dunstan verify dunstan-record.json   # offline: recompute claims, verdict and digests
dunstan rerun dunstan-record.json    # online: re-read the sources, report evidence_changed
```

`checker.digest` in a record the Action wrote is the SHA-256 of `action/dist/index.mjs` at the ref
the workflow pinned, the bundle that ran.

## What Dunstan does not check

Dunstan checks what the block declares against what the record shows: pull request state, changed
file paths, commit identifiers, check runs, linked references, JUnit test-report counts and
deployments. It does not reach:

- claims about runtime behaviour (that the code works, is fast, or is correct);
- a cached or re-used CI result presented as fresh;
- anything the block does not declare and the record does not show;
- partial work without a scope statement, though the two-way file check narrows it;
- the text around the block: Dunstan never judges whether a report sounds plausible, complete or
  well written, and gives no score;
- file contents: it reads metadata, never the repository's files.

## Limits that weaken fail-closed

GitHub behaviour a consumer should know, with what to do about it:

- **A pull request can change the workflow that checks it.** Under `pull_request`, the workflow file
  comes from the pull request's merge commit. A pull request that edits `.github/workflows/` can
  drop the step, set `unverifiable-conclusion: neutral`, or point at another Action. Protect the
  workflow with CODEOWNERS review on `.github/workflows/`, or run Dunstan under
  `pull_request_target` (the base branch's workflow), or as a ruleset required workflow.
- **Any workflow in the repository can write a check run named `dunstan`.** Check runs created with
  the workflow token all come from the GitHub Actions app, so "expected source: GitHub Actions" does
  not tell Dunstan's run from another workflow's. The same protection of `.github/workflows/`
  applies.
- **A moving tag is not a pin.** Reference the Action by full commit SHA; a tag can be moved to other
  code.
- **`neutral` passes.** `unverifiable-conclusion: neutral` lets unverifiable claims merge, by design.

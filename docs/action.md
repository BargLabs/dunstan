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
| `report-source` | none, required | `pr-body`, `comment:<author-login>` (that author's newest comment on the pull request) or `file:<path>` (a file in the workspace). The Action never guesses where a report is; with no value it concludes `failure`. |
| `github-token` | `${{ github.token }}` | Needs `contents: read`, `pull-requests: read`, `issues: read` (to read an issue a block closes or cites), `deployments: read` (for `deployedAt`), `checks: write`, `actions: read` (to read a JUnit artifact a block names). Nothing else. Without `issues: read` or `deployments: read` the claims that need them are `unverifiable`, never passed. |
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
| `unverifiable` | `failure` (default) | The record cannot answer a claim (a source unreadable, a field unpopulated, checks still running), or there is no single valid block: `block_missing`, `block_ambiguous`, `block_invalid`. Not a pass. |
| `unverifiable` | `neutral`, with `unverifiable-conclusion: neutral` | The same verdict, reported without blocking. A neutral required check lets the merge through, so this setting merges claims nobody could check. Choose it deliberately, for example while agents are being moved onto the block. |
| none (`error`) | `failure` | No record: `report-source` missing or malformed, the report source unreadable (no comment by that author, no such file), the pull request unreadable, an event Dunstan cannot check, `file:` under `pull_request_target`, or a crash. The reason is in the summary. |
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
own job's check run from the counted check runs (a `checks` claim never counts the checker). A
`checks` claim is checked against the check runs at the moment the Action runs: if CI is still
running, `checks.allSucceeded` is `unverifiable: checks_incomplete`. Re-run the Dunstan job once CI
has finished.

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

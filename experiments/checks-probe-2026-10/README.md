# The checks probe, October 2026

Spec 0.1.4, amended 2026-10-12 (section 17, "Checks per check suite"), counts the check runs at a
head commit as the latest run per check suite and name. Before that it counted the latest run per
name, so when two workflows each had a job `test` and the one with the lower id failed, the failure
was dropped and `checks.allSucceeded: true` passed.

GitHub's documentation does not show two things the rule depends on. This probe observes them:

1. **Does a re-run of a job keep its check suite?** If it does, the latest attempt supersedes the
   earlier one, as before. If a re-run is recorded in a new suite and the API still lists the
   earlier attempt, both are counted, and a failed first attempt makes `allSucceeded` `false`: a
   fail on a re-run that later succeeded, never a pass. Until the probe ran on 2026-10-13 (below),
   the spec marked this case "probe pending".
2. **Is `filter=latest` already one run per check suite and name?** The checker reads
   `GET /repos/{owner}/{repo}/commits/{sha}/check-runs?filter=latest`. If that lists only one of
   two workflows' runs named `test`, the read itself hides the failure, and the reader's filter is
   the next erratum.

Spec 0.1.4 as amended again on 2026-10-13 (section 17, "Checks per workflow path") counts the
latest run per workflow path and name, the record taking each Actions run's workflow from the
workflow runs at the head (`GET /repos/{owner}/{repo}/actions/runs?head_sha={sha}`). The probe
also observes what that key rests on:

3. **Is one workflow run on `push` and on `pull_request` two check suites, with one `path`?** If
   it is, counted per check suite and name each job was counted twice (the wrong fail the
   amendment closes), and keyed by path it is counted once.
4. **What does the listing give a re-run?** The listing gives each workflow run once, at its
   latest attempt. If a re-run keeps its check suite, every attempt's check runs are given the
   run's workflow. If it is a new suite, the earlier attempt's suite is no listed run's, so its
   check runs are recorded without a workflow and counted per suite: a fail on a re-run that later
   succeeded, never a pass. Until the probe ran on 2026-10-13 (below), the spec marked this case
   "probe pending".

## What it does

On the sandbox repository `BargLabs/closes-probe-sandbox`, and no other:

- **(i)** one commit, on a new branch `checks-probe` from the default branch's head, adds two
  workflows that each have a job named `test`: `checks-probe-fails-first.yml`, whose `test` fails
  on its first attempt and succeeds on any later one, and `checks-probe-succeeds.yml`, whose `test`
  succeeds after a job `first` that sleeps for 30 seconds, so that its `test` is queued later and
  likely gets the higher check run id, as in the false pass; and a third,
  `checks-probe-push-and-pull-request.yml`, on `push` and `pull_request`, with one job `build`.
  It then opens a pull request from `checks-probe` into the default branch, so the third workflow
  runs a second time on the same commit;
- **(ii)** once every run has completed, it re-runs the failed job (`rerun-failed-jobs`), which
  succeeds on its second attempt;
- **(iii)** after (i) and again after (ii), it reads the check runs at the commit with
  `filter=latest` and with `filter=all` (`id`, `name`, `status`, `conclusion`, `check_suite.id`,
  `app.slug`, `html_url`), the commit's check suites, every workflow run at the commit as the
  checker lists them (`workflowRunsAtHead`: `id`, `path` as given, `event`, `run_attempt`,
  `check_suite_id`), each probe workflow run (`id`, `path`, `event`, `run_attempt`,
  `check_suite_id`, and each attempt's `check_suite_id`), and each run's jobs of every attempt
  (`id`, `run_id`, `run_attempt`, `name`, `conclusion`).

It writes `results.json` beside this file: both snapshots and `answers`, computed from the
snapshots alone by `answers()` in `probe.mjs`:

| Answer | Meaning |
| --- | --- |
| `rerunKeepsCheckSuite` | the failed `test` job's attempts 1 and 2 have the same `check_suite.id` |
| `latestListsBothWorkflows` | before the re-run, `filter=latest` lists both workflows' `test` runs |
| `latestDropsEarlierAttempt` | after the re-run, `filter=latest` leaves out attempt 1's `test` |
| `failedHasLowerId` | the failed `test` has the lower check run id, as in the false pass |
| `pushAndPullRequestTwoSuites` | the third workflow's `push` and `pull_request` runs have different `check_suite_id`s |
| `pushAndPullRequestSamePath` | those two runs give the same `path`, as given, so the key makes them one workflow |
| `listingNamesLatestAttemptSuite` | after the re-run, the listing gives the failed run with its last attempt's `check_suite_id` |
| `everyActionsSuiteListed` | after the re-run, every `github-actions` check run's suite is a listed run's; `false` with `rerunKeepsCheckSuite: false` means the first attempt's check runs are recorded without a workflow |

`null` is an answer the snapshots do not decide.

## The run, 2026-10-13

The operator ran `probe.mjs --execute` against `BargLabs/closes-probe-sandbox` on 2026-10-13, from
05:04:20Z to 05:05:37Z, at commit `8c786d2aa86576266cc9a251287498677e9af910` on the branch
`checks-probe`. `results.json` is its output byte for byte (sha256
`ea2d168743f9df4c00b8c21b43d11ad887f88b9c924e8ff055688267edaec120`); biome leaves it unformatted.
`answers()` recomputed from its two snapshots gives the answers it records. Every answer is `true`:

| Answer | Snapshot that backs it |
| --- | --- |
| `rerunKeepsCheckSuite` | `afterRerun.checkRuns.all`: the failed workflow's `test` runs 115138576643 (attempt 1, `failure`) and 115138812364 (attempt 2, `success`) are both in suite 103903156982, as are both of that run's `attempts` in `afterRerun.workflowRuns` |
| `latestListsBothWorkflows` | `first.checkRuns.latest`: `test` 115138576643 (`failure`, suite 103903156982, `checks-probe-fails-first.yml`) and `test` 115138723505 (`success`, suite 103903156916, `checks-probe-succeeds.yml`) |
| `latestDropsEarlierAttempt` | `afterRerun.checkRuns.latest` lists 115138812364 and not 115138576643, which `afterRerun.checkRuns.all` still lists |
| `failedHasLowerId` | `first.checkRuns.latest`: the failed `test` 115138576643 is lower than the succeeding `test` 115138723505 |
| `pushAndPullRequestTwoSuites` | `first.workflowRunsAtHead`: run 38349554617 (`push`, suite 103903156934) and run 38349555320 (`pull_request`, suite 103903158709) |
| `pushAndPullRequestSamePath` | the same two entries, each with `path` `.github/workflows/checks-probe-push-and-pull-request.yml` |
| `listingNamesLatestAttemptSuite` | `afterRerun.workflowRunsAtHead`: run 38349554638 at `runAttempt` 2 with suite 103903156982, attempt 2's suite in `afterRerun.workflowRuns` |
| `everyActionsSuiteListed` | `afterRerun`: the `github-actions` check runs are in suites 103903156916, 103903156934, 103903156982 and 103903158709, each a `workflowRunsAtHead` entry's; `first` shows the same. The one suite listed by no run, 103903144288, is app `claude`'s and has no check run |

So a re-run keeps its suite and is resolved by the latest workflow run, then the latest attempt;
`filter=latest` does not hide one workflow's `test` behind another's; one workflow on `push` and
`pull_request` is two suites with one path, which the path key makes one; and every Actions check
run is given its workflow. Each is what spec 0.1.4, section 17 ("Checks per check suite" and
"Checks per workflow path") was written to rely on, so the spec and `docs/action.md` now give
these observations in place of "probe pending", and no code or verdict changes.

## Running it

The operator runs it; a session never does. The token is `GITHUB_TOKEN`, a fine-grained token on
the sandbox only, with Contents, Actions, Workflows and Pull requests read and write and Checks read
(a commit that adds a workflow file needs Workflows; opening the pull request needs Pull requests).

```
node experiments/checks-probe-2026-10/probe.mjs --repo BargLabs/closes-probe-sandbox            # dry run
node experiments/checks-probe-2026-10/probe.mjs --repo BargLabs/closes-probe-sandbox --execute  # writes
```

- **Sandbox only.** `--repo` is required and must be `BargLabs/closes-probe-sandbox`; any other
  repository is refused before anything is read.
- **Dry run by default.** Without `--execute` it reads the repository, checks that the branch
  `checks-probe` is not there, prints every write it would make, and writes nothing, to GitHub or
  to disk.
- **No overwrite.** It refuses to start if `results.json` exists, and writes it with `wx`. It
  refuses if the branch `checks-probe` already exists, since a second run would read the first
  run's check runs.
- **Bounded.** It waits at most 60 polls of 10 seconds for the runs to complete, after the push and
  after the re-run, and records nothing if they do not.

The branch, its three workflows and the pull request stay on the sandbox afterwards. The first two
run only on a push to `checks-probe`; the third also runs on any pull request in the sandbox.

`probe.test.mjs` runs the probe against a fake GitHub only (no network): its refusals, its dry
run, and its answers under both outcomes of each question.

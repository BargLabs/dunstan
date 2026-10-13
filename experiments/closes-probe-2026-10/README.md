# The closes probe, October 2026

Spec 0.1.4 (`spec/claim-format.md`, section 17) settles a `closes` claim by who closed the target:
the closer GitHub records on the target's ClosedEvent, a pull request or a commit, and not only the
GraphQL `closingIssuesReferences` list. Three gaps in that list motivated the change:

1. **It lists issues only.** A pull request named as a `closes` target is never in it. This one is
   observed: a public pull request names 19 targets with `Closes:`, 18 of them pull requests whose
   ClosedEvent `closer` is that pull request, and its `closingIssuesReferences` is empty.
2. **It leaves out commit-message closure.** GitHub documents that a keyword in a commit message
   closes the issue when the commit lands on the default branch, without the pull request showing
   as linked. Section 7.4's row 3 (a commit closer that is one of the pull request's commits or its
   merge commit) rests on this.
3. **It ignores non-default bases.** GitHub documents that it ignores closing keywords in a pull
   request whose base is not the default branch. Section 7.4's row 5 (`closing_base_not_default`)
   rests on this.

GitHub's documentation:
<https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>.

Gaps 2 and 3 were documented but not observed by us, and the spec marked rows 3 and 5 "GitHub
documents; probe pending". The operator ran the probe on 12 Oct 2026 ("The run of 12 Oct 2026",
below): it observes gaps 2 and 3, and gap 1 once more, on a sandbox repository, and it found a
fourth thing the rule had to answer, the race between a target's state and its ClosedEvent.

## The cases

| Case | What it does | What it shows |
| --- | --- | --- |
| (i) | A commit with the message `Fixes #a`; the pull request body names no issue; merged with a merge commit | whether a commit message closes `#a`, with the commit as the closer, and whether `#a` is ever among the closing references |
| (ii) | The same, squash-merged (the squash commit carries the one commit's message) | which commit GitHub names as the closer: the squash commit, which is the pull request's merge commit |
| (iii) | A commit `Fixes #b` on a branch merged into a non-default base, then that base merged into the default branch | that `#b` stays open after the first merge, and whether the second merge closes it, by which commit |
| (iv) | A pull request body `Closes #c` with a non-default base | that `#c` is not among the closing references and stays open after the merge |
| (v) | A pull request body `Closes #d`, where `#d` is an open pull request | whether `#d` is ever among the closing references, and whether the merge closes `#d` with the pull request as its closer |

For every pull request of a case, the probe records the closing references before and after the
merge, then the target's state and every ClosedEvent's closer, polling for up to a minute after the
merge for GitHub to act. Every merge commit's own message names no issue, so only the case's keyword
can close anything; a squash merge takes GitHub's default message, which for one commit is that
commit's message.

**Settling.** A target is settled when it is closed or merged and, if closed, at least one
ClosedEvent is visible. The probe polls until the target is settled or the minute runs out
(`SETTLE`). A target still closed with no ClosedEvent at the end is recorded with `unsettled: true`,
never as settled. A target open for the whole minute is recorded open: that is what the case
observes. Before 12 Oct 2026 the probe stopped polling at the first read that was not open, which is
why the run of 12 Oct recorded cases (i) and (ii) closed with no event.

## The run of 12 Oct 2026

The operator ran `--execute` against the sandbox `BargLabs/closes-probe-sandbox` from 11:21:23Z to
11:24:21Z, with the probe as it was then. `results.json` is its output, unchanged. A GraphQL re-read
of the five targets at 11:25:48Z is `reread-2026-10-12.json`: the raw answer, with one alias per
target (`i1`, `i3`, `i5`, `i8`, `p10`), taken by hand before `--reread` existed.

| Case | At the probe's read | At the re-read | Section 7.4 row |
| --- | --- | --- | --- |
| (i) | #1 closed, **no ClosedEvent**; closing references `[]` | ClosedEvent at 11:21:31Z, closer the commit `eb4fc5d`, the pull request's own commit | row 3, once the event shows; row 7 before |
| (ii) | #3 closed, **no ClosedEvent**; closing references `[]` | ClosedEvent at 11:21:39Z, closer the commit `8392a37`, the squash merge commit | row 3, by the merge commit; row 7 before |
| (iii) | #5 open after the merge into `probe-base-iii`; closed after that base was merged into `main`, closer the commit `2017d22`, pull request 6's own | the same | row 5 for pull request 6 after its merge; row 3 for it once its base reached `main` |
| (iv) | #8 open after the merge into `probe-base-iv`; closing references `[]` | open, no ClosedEvent | row 5 |
| (v) | pull request #10 closed, closer pull request #11; closing references `[]` | the same | row 2; `closingIssuesReferences` leaves out a pull request target |

**The race.** In cases (i) and (ii) GitHub had set the target's state to closed before its timeline
showed the ClosedEvent: when the probe read them, the state was closed and the timeline held no
ClosedEvent, and the re-read about four minutes later shows the event, timed 11:21:31Z and
11:21:39Z. Under spec 0.1.4 as first written, a check read in that window fails with
`not_closing`, which is false: the close was this pull request's. Any check run straight after a
merge can read in that window. The rule now has a row for it (section 7.4, row 7): a closed target
whose complete close-event read holds no ClosedEvent is `unverifiable` with
`closing_event_unsettled`. A ClosedEvent with no recorded closer is not this case: it is visible,
and it is not the pull request's close.

No case used a rebase merge, so the probe observes nothing about one.

## Running it

The operator runs it; a session never does. The steps:

1. Create a new sandbox repository, public or private, with its default settings, **initialised
   with a README**, so that its default branch has one commit. A repository with no commit is
   refused: "has no commits: create one initial commit on the default branch first".
2. Create a fine-grained token limited to that repository, with read and write access to Contents,
   Issues and Pull requests.
3. Run the dry run, and read what it would write.
4. Run it with `--execute`, from a checkout where `results.json` does not exist (the committed one
   is the run of 12 Oct 2026: run elsewhere, or with `--results <path>`).
5. A few minutes later, run `--reread` against the same `results.json`, and keep both files.

```sh
# A dry run (the default): reads the sandbox to check it is empty, prints every write, writes nothing.
GITHUB_TOKEN=<sandbox token> node experiments/closes-probe-2026-10/probe.mjs --repo <owner>/<sandbox>

# The run: makes the writes and writes experiments/closes-probe-2026-10/results.json.
GITHUB_TOKEN=<sandbox token> node experiments/closes-probe-2026-10/probe.mjs --repo <owner>/<sandbox> --execute

# The re-read: makes no write to GitHub; reads again every target results.json names and writes
# reread-<UTC date>.json beside it.
GITHUB_TOKEN=<sandbox token> node experiments/closes-probe-2026-10/probe.mjs --repo <owner>/<sandbox> --reread
```

`--reread` reads one GraphQL answer per target, the same query the run reads, and nothing else. Its
session refuses every write, made or printed. `--reread` with `--execute` is refused. A read-only
token is enough for it.

It refuses:

- any repository not named with `--repo` (it never takes one from a git remote or the environment);
- a repository that is not empty at start: one with any issue or pull request, or any branch but
  its default, or no branch at all;
- to overwrite `results.json`, which it checks before reading anything and again when it writes;
- with `--reread`, a `results.json` that does not exist or was written for another repository, and
  to overwrite a `reread-<date>.json`, which it checks before reading GitHub and again when it
  writes.

## What it writes

`results.json`: the probe's name, the sandbox's name, its default branch and initial commit, the
start and end times, and per case the target (kind and number), the commit ids it made, and per pull
request its number, base, head, body, merge method, merge commit id, the closing references before
and after the merge, the target's state and ClosedEvents (`{at, closer}`), and `unsettled: true`
when the target was still closed with no ClosedEvent at the end of the minute. Names, numbers, ids
and times only. It holds nothing private: the sandbox is the operator's own.

`reread-<date>.json`: the probe's name, the sandbox's name, the results file it re-read, the time of
the read, and per case the target (kind and number) and its state and ClosedEvents, in the form
`results.json` gives them.

The spec's "probe pending" marks were replaced by what the run of 12 Oct 2026 shows (section 17,
0.1.4). A later run that contradicts a row of section 7.4 is a new erratum.

## Tests

`probe.test.mjs` runs the probe against a fake GitHub only. Its `fetch` throws, so no test reaches
the network.

# Open-source study 2: the path-existence check, October 2026

Does comparison 0.3.0 (checker 0.1.5), which keeps a file claim's `differs` note only when its path
is a file at the pull request's head, remove the advisory reader's false accusations on new public
agent-written pull requests without losing its genuine catches, and does it earn the "mismatch"
wording? The rule, the instruments, the measures, the bar, the labels and the expected values are
fixed in [`preregistration.md`](preregistration.md), written before any search. Study 1, where the
idea came from, is [`../open-source-advisory-2026-10/`](../open-source-advisory-2026-10/).

## Order of work

Each step is committed before the next starts. "Operator" is the one person at Barg Labs who runs
the GitHub reads with a read-only token and adjudicates every label. "Session" is anyone, a person
or an agent, running the offline tools. Every command runs from the repository root as
`pnpm exec node experiments/open-source-advisory-2026-10-study2/tools/<tool> …`.

| # | Step | Who | Command | Public after the step |
|---|---|---|---|---|
| 1 | Preregister | Operator pushes to the public repository, then merges | (none) | `preregistration.md`, `README.md`, `tools/`, public before any search |
| 2 | Select | Operator | `select.mjs --rule-commit <public commit of preregistration.md>` | `selection.json`: every week, query, page time and candidate, with the filter that rejected it |
| 3 | Run and seal both instruments | Operator | `run.mjs check --baseline <v0.1.3 dist/dunstan.mjs> --candidate <checker 0.1.5 dist/dunstan.mjs>` | `runs/baseline.seal.json`, `runs/candidate.seal.json`: each record's SHA-256 only |
| 4 | Open | Session | `run.mjs index`, then `sample.mjs`, then `worksheet.mjs build` | `runs/index.json` (ids, kinds, both notes, offsets, errors, identity faults), `samples/m1.json` |
| 5 | Label | Operator | edits `.work/worksheets/labels.jsonl`, then `worksheet.mjs publish` | `labels/labels.jsonl` |
| 6 | Figures: the result | Session | `figures.mjs` | `figures/figures.json`, and `result.md`: both instruments' figures, LOST, the bar and each refutation test |

The tools hold the order where they can. `select.mjs` and `run.mjs check` refuse to redo what they
have written. `run.mjs check` refuses a bundle that is not its instrument's, and `run.mjs index`
refuses to open either run until both seals are committed. `figures.mjs` refuses while any label is
missing, and `worksheet.mjs publish` refuses to change or withdraw a published label.

## What is never public

The pull request bodies, the records (each advisory quotes its clause) and the worksheets are copied
text. They stay in the git-ignored `.work/` here. Every committed file holds names, numbers, digests
and offsets only.

## Tools

Each is adapted from study 1's tool of the same name, which it imports where it can and names in
its header.

| Tool | Does |
|---|---|
| [`tools/common.mjs`](tools/common.mjs) | The two frozen instruments, study 1's pinned selection, the M1 seed and the paths; study 1's helpers, re-exported. |
| [`tools/select.mjs`](tools/select.mjs) | Executes the selection rule over the 17 weeks; writes `selection.json` and the bodies. The only tool that calls the GitHub API itself. |
| [`tools/run.mjs`](tools/run.mjs) | Runs both instruments on each pull request and seals them (`check`); opens both runs into one index and checks that they propose the same advisories (`index`). The checker it runs makes the GitHub reads. |
| [`tools/sample.mjs`](tools/sample.mjs) | M1's one seeded sample. |
| [`tools/worksheet.mjs`](tools/worksheet.mjs) | The adjudication worksheet, blind to the candidate's notes (`build`), and the published labels (`publish`). |
| [`tools/figures.mjs`](tools/figures.mjs) | M1, M2, M3 and LOST for both instruments with Wilson 95% intervals, the three-part bar, the refutation tests and the descriptive figures. |

`tools/tools.test.mjs` tests them on synthetic fixtures: a fake GitHub, two fake checkers and
constructed records. It runs with `pnpm test`, and no test reaches the network.

## Third-party projects

The study will name third-party open-source projects and point into their pull requests' public
text by offset. It makes no contact with any of them: no comments, issues or other writes.

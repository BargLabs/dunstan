# Study 2, erratum 1: what closes an issue

Study 2 labelled a `differs:not_closing` advisory a genuine catch when the target a pull request
said it closes was absent from GraphQL `closingIssuesReferences`. That connection lists issues
only, and leaves out closure by commit message. Spec 0.1.4 section 7.4 (checker 0.1.7) now settles
a `closes` by who closed the target. This erratum reads who actually closed each target, sets each
advisory beside what section 7.4 makes of it for the operator to rule, and recomputes study 2's
figures with the rulings beside the published ones. The erratum is [`erratum.md`](erratum.md).

## Order of work

Each step is committed before the next starts. "Operator" and "Session" are as in study 2's
[`README.md`](../README.md). Every command runs from the repository root as
`pnpm exec node experiments/open-source-advisory-2026-10-study2/erratum-1/tools/<tool> …`.

| # | Step | Who | Command | Public after the step |
|---|---|---|---|---|
| 1 | Read | operator | `closers.mjs`, with `DUNSTAN_READ_TOKEN` set and study 2's `.work/records/` in place | `closers.json`: each target's type, state and close events; each pull request's base, default branch, merge and commit oids; the read time and the token's scope check |
| 2 | Worksheet | session | `worksheet.mjs` | `worksheet.jsonl` (one line per closes advisory, every `ruling` null), `worksheet.md` (counts by `closerRelation`, a row of section 7.4, and published label) |
| 3 | Rule | operator | edits `ruling` on each `worksheet.jsonl` line whose `needsRuling` is true, by the rule in `erratum.md` | `worksheet.jsonl` with its rulings |
| 4 | Figures | session | `figures.mjs`, then fills `erratum.md`'s rulings and figure table from its output | `figures.json`: the published figures' digest, the ruled figures, both sensitivities |
| 5 | Sign | operator | commits `erratum.md` as filled | `erratum.md` |

`figures.mjs published` runs (i) alone at any step: it recomputes the published figures, checks them
against `figures/figures.json` byte for byte, prints the published sensitivity and writes nothing.

The tools hold the order where they can. `closers.mjs`, `worksheet.mjs` and `figures.mjs` each
refuse to overwrite what they have written. `worksheet.mjs` refuses a `closers.json` that read
another index. `figures.mjs` refuses while any line that needs a ruling has none, while a line that
needs none has one, while any line differs from what `worksheet.mjs` computes other than in its
ruling, and while (i) does not reproduce `figures/figures.json`.

## What is never public

`closers.mjs` reads each target from study 2's sealed baseline records in its git-ignored `.work/`,
and checks each record against `runs/baseline.seal.json`. It copies no text: every file here holds
names, numbers, commit oids, timestamps and digests only.

## Tools

| Tool | Does |
|---|---|
| [`tools/common.mjs`](tools/common.mjs) | The paths, the closer relations and the rows the erratum reads; study 2's helpers, re-exported. |
| [`tools/closers.mjs`](tools/closers.mjs) | The only GitHub reader, posting only its three fixed queries: GraphQL `issueOrPullRequest` for each target, and each pull request's state, merge and commits, with checker 0.1.7's close-event page budget. Marks a row `incomplete` past a connection's page budget, or on any GraphQL error beside the data. |
| [`tools/worksheet.mjs`](tools/worksheet.mjs) | Joins the index, the published labels and `closers.json` into the worksheet, and writes its summary. Each line's `closerRelation` is a row of section 7.4, read in the table's order as checker 0.1.7 reads it, and its `section74` is that row's verdict and reason. Proposes no ruling. |
| [`tools/figures.mjs`](tools/figures.mjs) | Study 2's measures with Wilson 95% intervals, (i) with the published labels and (ii) with the rulings, each with the pull-request-level sensitivity. |

`tools/tools.test.mjs` tests them on a fake GitHub and a scratch study, and recomputes (i) from the
committed files. It runs with `pnpm test`, and no test reaches the network.

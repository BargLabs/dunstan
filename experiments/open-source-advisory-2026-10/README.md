# Open-source study of the advisory reader, October 2026

Does the advisory reader (`docs/advisory.md`) read public agent-written pull requests as well as it
read Barg Labs' own, and do fixes written from one half of them carry to the other? The rule, the
measures, the labels and the expected values are fixed in
[`preregistration.md`](preregistration.md), written before any search. Nothing here has been run
against GitHub yet.

## Order of work

Each step is committed before the next starts. "Operator" is the one person at Barg Labs who runs
the GitHub reads with a read-only token and adjudicates every label. "Session" is anyone, a person
or an agent, running the offline tools or writing fixes. Every command runs from the repository root
as `pnpm exec node experiments/open-source-advisory-2026-10/tools/<tool> …`.

| # | Step | Who | Command | Public after the step |
|---|---|---|---|---|
| 1 | Preregister | Operator commits and pushes | (none) | `preregistration.md`, `README.md`, `tools/`, committed to the public repository before any search |
| 2a | Select | Operator | `select.mjs --rule-commit <public commit of preregistration.md>` | `selection.json`: every query, page time and candidate, with the filter that rejected it |
| 2b | Split | Session | `split.mjs` | `selection.json` with `split` |
| 2c | Baseline, both halves | Operator | `run.mjs check --instrument baseline --half dev --dunstan <v0.1.3 dist/dunstan.mjs>`, then `--half test` | `runs/baseline-dev.seal.json`, `runs/baseline-test.seal.json`: each record's SHA-256 only |
| 2d | Open the dev half | Session | `run.mjs index --instrument baseline --half dev`, `sample.mjs --instrument baseline --half dev`, `worksheet.mjs build --half dev` | `runs/baseline-dev.json` (ids, kinds, notes, offsets), `samples/baseline-dev.m1.json` |
| 2e | Label the dev half | Operator | edits `.work/worksheets/dev.jsonl`, then `worksheet.mjs publish --half dev` | `labels/dev.jsonl` |
| 2f | Dev figures | Session | `figures.mjs --instrument baseline --half dev` | `figures/baseline-dev.json` |
| 3 | Fix | Session, reviewed by the operator | grammar rules with synthetic tests, in `src/advisory/` | the fixes and their tests |
| 4 | Freeze | Operator | `run.mjs freeze --dunstan <fixed build> --checker-version <v> --extractor-version <v> --extractor-digest <sha256> --source-commit <sha>` | `frozen.json` |
| 5a | Frozen extractor, test half | Operator | `run.mjs check --instrument fixed --half test --dunstan <fixed build>` | `runs/fixed-test.seal.json` |
| 5b | Open the test half | Session | `run.mjs index` and `sample.mjs` for `baseline` and `fixed` on `test`, then `worksheet.mjs build --half test` | `runs/baseline-test.json`, `runs/fixed-test.json`, their samples |
| 5c | Label the test half | Operator | edits `.work/worksheets/test.jsonl`, then `worksheet.mjs publish --half test` | `labels/test.jsonl` |
| 5d | Test figures: the result | Session | `figures.mjs --instrument baseline --half test`, then `--instrument fixed` | `figures/baseline-test.json`, `figures/fixed-test.json`, and whether the bar is met |

The tools hold the order where they can. `run.mjs` refuses the fixed instrument, and refuses to open
the test half, until `frozen.json` is committed. `figures.mjs` refuses while any label is missing.
`select.mjs`, `run.mjs check` and `run.mjs freeze` refuse to redo what they have written, and
`worksheet.mjs publish` refuses to change or withdraw a published label.

## What is never public

The pull request bodies, the records (each advisory quotes its clause) and the worksheets are copied
text. They stay in the git-ignored `.work/` here. Every committed file holds names, numbers, digests
and offsets only. The private set of Barg Labs' own pull requests used in step 3 is never published
in any form.

## Tools

| Tool | Does |
|---|---|
| [`tools/select.mjs`](tools/select.mjs) | Executes the selection rule; writes `selection.json` and the bodies. The only tool that calls the GitHub API itself. |
| [`tools/split.mjs`](tools/split.mjs) | The hash split, recorded in `selection.json`. |
| [`tools/run.mjs`](tools/run.mjs) | Runs the instrument per half and seals it (`check`), freezes the fixed instrument (`freeze`), opens a sealed run (`index`). The checker it runs makes the GitHub reads. |
| [`tools/sample.mjs`](tools/sample.mjs) | M1's seeded sample. |
| [`tools/worksheet.mjs`](tools/worksheet.mjs) | The adjudication worksheet (`build`) and the published labels (`publish`). |
| [`tools/figures.mjs`](tools/figures.mjs) | M1 to M3 with Wilson 95% intervals, the bar and the descriptive figures. |

`tools/tools.test.mjs` tests them on synthetic fixtures: a fake GitHub, a fake checker and
constructed records. It runs with `pnpm test`, and no test reaches the network.

## Third-party projects

The study will name third-party open-source projects and point into their pull requests' public
text by offset. It makes no contact with any of them: no comments, issues or other writes.

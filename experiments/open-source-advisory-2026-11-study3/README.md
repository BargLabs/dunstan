# Open-source study 3: the advisory reader by pull request and claim kind, November 2026

**Ruled; signed by commit.** On public agent-written pull requests, how often does the advisory
layer of the first checker release carrying spec 0.1.4 raise a `differs` note that is a genuine
discrepancy, and how often a false accusation, counted by pull request and by claim kind? The unit,
the outcomes, the selection, the labels and the size are in [`preregistration.md`](preregistration.md).
The operator ruled every open choice (A to H) on 2026-10-13 and signs that document by SSH-signing
the first commit on the main branch of BargLabs/dunstan that carries it (its "Signature" block).
Nothing here binds, and no search may run, until that commit is on that branch. Studies 1 and 2 are
[`../open-source-advisory-2026-10/`](../open-source-advisory-2026-10/) and
[`../open-source-advisory-2026-10-study2/`](../open-source-advisory-2026-10-study2/).

## Order of work

Each step is committed before the next starts. "Operator" is the one person at Barg Labs who runs
the GitHub reads with a read-only token and adjudicates every label. "Session" is anyone, a person
or an agent, running the offline tools. Every command would run from the repository root as
`pnpm exec node experiments/open-source-advisory-2026-11-study3/tools/<tool> …`.

| # | Step | Who | Command | Public after the step |
|---|---|---|---|---|
| 0 | Rule and sign | Operator rules every placeholder, then SSH-signs the first commit on BargLabs/dunstan's main branch that carries `preregistration.md` | (none) | `preregistration.md`, `README.md`, `tools/`, public before any search |
| 1 | Select | Operator | `select.mjs --rule-commit <public commit of preregistration.md>` | `selection.json`: every week, query, page time and candidate, with the filter that rejected it |
| 2 | Run and seal | Operator | `run.mjs check --instrument <dist/dunstan.mjs of dunstan@0.1.7>` | `runs/instrument.seal.json`: each record's SHA-256 only |
| 3 | Open | Session | `run.mjs index`, then `sample.mjs` (the primary advisories and the M1 sample), then `worksheet.mjs build` | `runs/index.json` (ids, kinds, notes, `closes` rows, offsets, errors), `samples/primary.json`, `samples/m1.json` |
| 4 | Label | Operator | edits the worksheets, then `worksheet.mjs publish` | `labels/labels.jsonl`, and `labels/work-done.jsonl` |
| 5 | Figures: the result | Session | `figures.mjs` | `figures/figures.json`, and `result.md`: P1 and P2, by kind, the clustered secondary figures, the dominant-PR sensitivity, the bar and each refutation test |

## What is never public

The pull request bodies, the records (each advisory quotes its clause) and the worksheets are copied
text. They stay in a git-ignored `.work/` here. Every committed file holds names, numbers, digests
and offsets only.

## Tools

Each tool imports study 1's and study 2's helpers unchanged and changes no file of either study.
`tools/tools.test.mjs` runs them on synthetic fixtures only: a fake GitHub (search and repository
metadata), a fake checker that writes records, and scratch git checkouts. No test reaches the
network.

- **`tools/common.mjs`.** The paths and the fixed constants of `preregistration.md`: the five agents
  and their qualifiers, the two blocks and the hashed week order (recomputed, and checked against
  the weeks table digest for digest), the stop at 350, study 1's and study 2's `selection.json` by
  SHA-256 and the demo's by path, the instrument (`dunstan@0.1.7`, its bundle digest, checker 0.1.7,
  comparison 0.4.0, extractor 0.1.3 and its grammar digest, source commit), the bar, and
  `SIGNING_DATE`, the date the operator signed (2026-10-13), which fixes the seeds. Every tool that
  needs the signing date refuses a `null` one, as each did before signing.
- **`tools/select.mjs --rule-commit <sha> [--block 1|2]`.** The selection rule, one block at a time,
  and the only tool that calls the GitHub API itself. It refuses before signing, and refuses a rule
  commit that is not SSH-signed, whose first parent already carries `preregistration.md` as it
  stands, or at which `preregistration.md` is not committed as it stands. With no `selection.json`
  it runs block 1, no earlier than 2026-11-09; after a block 1 that selected fewer than 350 it runs
  block 2, no earlier than 2026-11-23; otherwise it refuses, and nothing is widened. Within each
  block, weeks in the hashed order, round-robin from A within a week, an agent whose results run out
  skipped for the rest of it, stop at 350. The query, the four filters in order (the first that
  fails recorded), the pages up to the 1,000-result cap and each page's time are as preregistered.
  It reads search results and repository metadata only, refuses study 1's or study 2's
  `selection.json` unless its bytes match the pinned digest, and writes `selection.json` with every
  query, page and candidate, and the bodies to `.work/bodies/`. A shortfall after block 2 is
  `"complete": false`.
- **`tools/run.mjs instrument --checkout <BargLabs/dunstan at v0.1.7>`.** Refuses unless the
  checkout is at the source commit with no change, `pnpm build` succeeds and `dist/dunstan.mjs` has
  the pinned SHA-256. Its test runs only when `STUDY3_DUNSTAN_CHECKOUT` names such a checkout.
- **`tools/run.mjs check --instrument <dist/dunstan.mjs>`.** Refuses any bundle but the pinned one.
  Runs `dunstan check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>` once
  per selected pull request in selection order, with `DUNSTAN_READ_TOKEN` as the checker's only
  token. A pull request with no record is tried once more after the rest, and is an error if it
  still has none. Refuses a record whose checker, extractor digest or comparison version is not the
  instrument's, sealing nothing. Writes `runs/instrument.seal.json`: each record's SHA-256, and
  nothing a record holds.
- **`tools/run.mjs index`.** Once the seal is committed, checks each record against it and against
  the instrument, and writes `runs/index.json`: advisory ids (`"<owner>/<repo>#<n>:<i>"`), kinds,
  notes, clause offsets, errors, the pull requests whose body was edited since selection, and for
  each `reference_closes` advisory the spec 0.1.4 section 7.4 row its note came from (1 to 8, or
  `null` for a note from the steps before the table). No text.
- **`tools/sample.mjs`.** Refuses before signing. From `runs/index.json`, writes
  `samples/primary.json`: for each pull request and kind, of its `differs` advisories of that kind,
  the one with the least SHA-256 of `"<seed>:<advisoryId>"` under the primary seed. And
  `samples/m1.json`: study 1's `drawSample`, imported unchanged, as study 2 drew its sample, with the
  M1 seed: every advisory by the same digest, the first 60, or all when fewer. Run again, it checks
  both files against what the seeds draw.
- **`tools/worksheet.mjs build`.** Writes three worksheets to `.work/worksheets/` only: the M2
  worksheet, every `differs` advisory with its clause, claim and note, with nothing showing which
  are primary; the M1 worksheet, each sampled advisory without its note, its observed value or its
  record; and the "work done" worksheet, one line per pull request with a primary advisory and
  nothing of its advisories. Labels already written are kept.
- **`tools/worksheet.mjs publish`.** Writes `labels/labels.jsonl` (`pr`, `advisoryId`, `clause`
  offsets or `null`, `measure`, `label`, `adjudicatedAt`, and for a `reference_closes` advisory its
  section 7.4 row as `closesRow`) and `labels/work-done.jsonl` (`pr`, `label`, `adjudicatedAt`).
  Refuses, writing nothing: a missing label; a label outside its set; an advisory whose `not_real`
  and `not_a_claim` disagree; a "work done" label not written after its pull request's M2 labels;
  any text in the output. Published labels are final: it refuses when either file exists.
- **`tools/figures.mjs`.** Refuses before signing, on a sample its seed did not draw, and on a
  missing, extra or doubled label. Writes `figures/figures.json`: P1 and P2 over denominator (b),
  with the half-width achieved, and over (a) beside it; P1 and P2 by kind; the `false_claim` share
  and M1 with a PR-cluster bootstrap interval (10,000 replicates, the replicates set aside
  reported) and no Wilson interval; P1 and P2 over every `differs` advisory; the dominant-PR
  sensitivity; the bar; the three refutation tests, each `refuted`, `not_refuted` or
  `not_decidable`; and the descriptive counts. It writes no `result.md`.

## Third-party projects

The study will name third-party open-source projects and point into their pull requests' public
text by offset. It makes no contact with any of them: no comments, issues or other writes.

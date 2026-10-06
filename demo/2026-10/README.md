# Demo, October 2026: public agent-written pull requests

Dunstan 0.1.0 checked merged pull requests that coding agents wrote in public open-source
repositories. The PRs were chosen by a rule fixed before any search, and each result was committed
as it came out, in selection order.

The rule selected five pull requests. All five results are below, numbered as the rule selected
them. Verdict 2 came from a checker error, corrected by a dated erratum beside it; the original
record stands as published.

The original records were written by development builds of the checker, which are not reproducible
from this repository's tags (see [`PROVENANCE.md`](../../PROVENANCE.md)); the re-runs are. On
2026-10-06 each pull request was checked again with dunstan 0.1.1 as tagged `v0.1.1`, with the same
block and the same report bytes; the last column gives those results.

## The five verdicts

| # | Agent | Pull request | Verdict | Claims | Re-run under `v0.1.1`, 2026-10-06 |
|---|---|---|---|---|---|
| 1 | GitHub Copilot coding agent | [FluidSynth/fluidsynth#1639](https://github.com/FluidSynth/fluidsynth/pull/1639) | `pass` | 66: 66 pass | [`pass`](1-FluidSynth-fluidsynth-1639/rerun-v0.1.1-2026-10-06/summary.md), 66: 66 pass |
| 2 | Devin | [airbytehq/airbyte#74367](https://github.com/airbytehq/airbyte/pull/74367) | `fail` under 0.1.0; **erratum:** `unverifiable` under 0.1.1 | 9: 8 pass, 1 fail (0.1.0); 8 pass, 1 unverifiable (0.1.1) | [`unverifiable`](2-airbytehq-airbyte-74367/rerun-v0.1.1-2026-10-06/summary.md), 9: 8 pass, 1 unverifiable |
| 3 | Claude | [AlphaGPU/leetgpu-challenges#259](https://github.com/AlphaGPU/leetgpu-challenges/pull/259) | `pass` | 10: 10 pass | [`pass`](3-AlphaGPU-leetgpu-challenges-259/rerun-v0.1.1-2026-10-06/summary.md), 10: 10 pass |
| 4 | Google Jules | [cdcseacave/openMVS#1246](https://github.com/cdcseacave/openMVS/pull/1246) | `pass` | 5: 5 pass | [`pass`](4-cdcseacave-openMVS-1246/rerun-v0.1.1-2026-10-06/summary.md), 5: 5 pass |
| 5 | GitHub Copilot coding agent | [QuantEcon/QuantEcon.py#798](https://github.com/QuantEcon/QuantEcon.py/pull/798) | `unverifiable` | 12: 11 pass, 1 unverifiable | [`unverifiable`](5-QuantEcon-QuantEcon.py-798/rerun-v0.1.1-2026-10-06/summary.md), 12: 11 pass, 1 unverifiable |

Each re-run read the same head, files and merge time as the published record. Re-runs 1, 3, 4 and 5
have the same claims, verdict and digests as the published records; re-run 2 has those of the
erratum's 0.1.1 re-run.

1. **pass.** The head, 63 files, merge time and `closes #912` all agree with the record. GitHub links
   #912 as a closing issue.
2. **fail under 0.1.0, which was the checker's error.** The report says "Resolves
   https://github.com/airbytehq/oncall/issues/11556", but the pull request's closing references are
   empty, so 0.1.0 failed the claim (`not_closing`). `airbytehq/oncall` answers HTTP 404 to the
   demo's read-only token, and GitHub does not list closing issues its reader cannot see. The empty
   list reflected visibility, not the pull request: under the fail-closed rule the claim should have
   been `unverifiable`, not `fail`.

   **Erratum, 2026-10-04 (spec 0.1.1).** Spec 0.1.1 corrects section 7.4: a `closes` issue missing
   from the closing references is read like a cited issue before the claim can fail. Here its
   repository is unreadable, so the claim is `unverifiable` (`source_unreadable:repository`). The
   dated re-run with dunstan 0.1.1, same block, is
   [`2-airbytehq-airbyte-74367/rerun-0.1.1/`](2-airbytehq-airbyte-74367/rerun-0.1.1/summary.md):
   `unverifiable`, 9 claims: 8 pass, 1 unverifiable. The 0.1.0 record and summary are unedited.
3. **pass.** The head, 8 files and merge time agree. The report's testing statements give no count
   of executed tests and name no CI run, so none of them was declared.
4. **pass.** The head, 3 files and merge time agree. The report makes no test, check or reference
   claim the procedure can declare.
5. **unverifiable.** "605 passed locally" becomes a test count with no record to compare it with
   (`no_comparable_record_field`). A local run leaves nothing in the repository's record. The cited
   #787 and #790 exist, and everything else passes.

The table, the five 0.1.0 records and their summaries stand as published. Spec section 12 says a
record is verified by the checker version that wrote it, so a later checker refuses to verify
them. The 0.1.0 checker that wrote them was a development build that no tag of this repository
reproduces; `PROVENANCE.md` gives its digest and each original record's SHA-256. The re-runs were
written by checker 0.1.1 and verify with the checker this repository builds at the tag `v0.1.1`,
not with a build of a later head: the head now builds checker 0.1.2, which refuses them for the
same reason.

Each folder `<n>-<owner>-<repo>-<pr>/` holds `block.json` (the declared block), `record.json` (the
record `dunstan check` wrote) and `summary.md` (the claims table, how to read the verdict, what the
procedure did not convert, and the re-run commands). Its `rerun-v0.1.1-2026-10-06/` holds the
re-run's `record.json` and `summary.md`; folder 2 also holds the erratum's `rerun-0.1.1/`.

## What this shows

- The checker runs end to end on real public pull requests. It reads only metadata: PR state, files
  listing, closing references, issue existence. It reads no file contents.
- Each record recomputes offline, byte for byte, with `dunstan verify` (commands below).
- Real data produced both a `pass` and an `unverifiable`. The `unverifiable` came from a claim with
  no record behind it, and the verdict fails closed rather than passing by absence.

## What this does not show

- **These are not the agents' own blocks.** None of the agents wrote a `dunstan-handback` block.
  This session (Claude Opus 5.5, an AI agent) made each block from the PR's prose and the PR by the
  written procedure in [`procedure.md`](procedure.md). No second person has reviewed the conversions;
  each `summary.md` lists what was not converted and why.
- **Head, files and merge time pass by construction.** Rules 2 to 4 take `headCommit`,
  `filesChanged` and `mergedAt` from the pull request itself, not from the report. Those claims show
  that the checker reads the record correctly. They do not show that the agents reported their
  changes correctly. A narrower claim in prose, such as changes confined to one file, has no field
  in 0.1, so it is not checked.
- **Most prose is not checkable in 0.1.** Design rationale, correctness statements, passes with no
  number and local lint runs have no field, and the procedure declares nothing for them.
- **A handful of PRs is not a sample.** Nothing here is a rate or an estimate. The Codex query
  (`author:app/chatgpt-codex-connector`) returned 0 results for the window, so the rule skipped
  agent D, and the round-robin returned to Copilot for the fifth PR.

## How it was done

1. [`selection-rule.md`](selection-rule.md): the rule, committed verbatim before any search ran.
2. [`selection.json`](selection.json): the rule executed by [`tools/select.mjs`](tools/select.mjs)
   on 2026-10-04 from 19:03Z. It records every query with its run time, all 58 candidates examined
   with the filter that rejected each one, and each selected PR's star count and cleaned body length.
   It was committed before any selected PR's files, commits, checks, reviews or comments were read.
   Search results change over time, so this file, not a re-run of the queries, is the selection.
3. Per PR, in order: `select.mjs pr <n>` read the pull request and its files listing. The block was
   made by [`procedure.md`](procedure.md), the conversion rules fixed before the demo ran.
   [`tools/check.mjs`](tools/check.mjs) built the report as the procedure's Rule 10 says (the PR
   body, then the block as a fence) and ran `dist/dunstan.mjs check --report-file`.
   [`tools/summary.mjs`](tools/summary.mjs) wrote `summary.md`. Each result was committed before the
   next PR started.

**Provenance.** The order above, the rule before any search and the selection before any selected
PR was read, is shown by the development repository's history: the rule's commit is `e223bad` (the
one `selection.json` names) and the selection's is `d510d75`. That history is kept privately and
can be shown to an auditor. This public copy makes no stronger claim than that. `PROVENANCE.md` gives
the full commit ids and their times.

The reports themselves are not committed. They sit in the git-ignored `.work/` folder, and each
record carries the report's SHA-256. `dunstan rerun` does not need a report: it re-reads the record's
sources against the recorded block.

## Re-run

Offline, from the re-run records alone, with the checker built at tag `v0.1.1`:

```sh
git checkout v0.1.1
pnpm install --frozen-lockfile && pnpm run build
node dist/dunstan.mjs verify demo/2026-10/1-FluidSynth-fluidsynth-1639/rerun-v0.1.1-2026-10-06/record.json
node dist/dunstan.mjs verify demo/2026-10/2-airbytehq-airbyte-74367/rerun-v0.1.1-2026-10-06/record.json
node dist/dunstan.mjs verify demo/2026-10/3-AlphaGPU-leetgpu-challenges-259/rerun-v0.1.1-2026-10-06/record.json
node dist/dunstan.mjs verify demo/2026-10/4-cdcseacave-openMVS-1246/rerun-v0.1.1-2026-10-06/record.json
node dist/dunstan.mjs verify demo/2026-10/5-QuantEcon-QuantEcon.py-798/rerun-v0.1.1-2026-10-06/record.json
```

Online, with the same `v0.1.1` build, re-reading the same sources (prints `evidence_changed` with
the fields that moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/<n>-<owner>-<repo>-<pr>/rerun-v0.1.1-2026-10-06/record.json
```

The demo's own runs set `DUNSTAN_READ_TOKEN`, a read-only token, and pass it as `GITHUB_TOKEN` to the
checker's child process only. No script writes the token anywhere.

## Third-party projects

This folder names third-party open-source projects and quotes their pull requests' public text. It
made no contact with any of them: no comments, issues or other writes.

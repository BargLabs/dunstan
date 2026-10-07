# Result: the advisory reader on public agent-written pull requests

Reported 2026-10-07 against [`preregistration.md`](preregistration.md) (public commit `2cd2f076`) and [`amendment-1.md`](amendment-1.md) (public commit `bbed1545`). Every figure below is computed by `tools/figures.mjs` from the published labels (`labels/dev.jsonl`, `labels/test.jsonl`) and records whose digests were sealed before they were read (`runs/*.seal.json`). The fixed instrument was frozen and published (`frozen.json`, public commit `c479498f`) before it was run on the test half. Each outcome is reported as it fell, whether or not it was expected.

## The result in one paragraph

On 150 held-out public pull requests, extractor 0.1.4, written from the other 150, made **18 false accusations among 120 checkable advisories (0.150, Wilson 95% [0.097, 0.225])**: exactly what the untouched baseline made on the same pull requests. **The fixes did not generalise**, and by the preregistration's own test they are refuted as a remedy. The "mismatch" bar is **not met**, as predicted. Two things went differently from what we expected:

- the reader is more precise on public agent reports than on our own (0.87 to 0.92 of sampled advisories are real claims);
- on public pull requests, about **a third of `differs` notes mark a genuinely false claim**: 10 of 28 on the test half and 4 of 17 on the dev half. On our own pull requests it was 0 of 20.

## The sample

- **300 public, merged, agent-written pull requests**, merged 2026-06-01 to 2026-10-06, in public repositories with at least 200 stars, one per repository.
- **By agent:** GitHub Copilot coding agent 235, Claude 32, Devin 28, Google Jules 5, OpenAI Codex 0 (its query returned no results).
- **Two waves.** Wave 1 (the original rule) selected 116 before every query hit the API's 1,000-result cap. Wave 2 ([`amendment-1.md`](amendment-1.md), published before it ran) selected 184 by weekly queries.
- **Split** 150/150 by hash.

**Limits of the sample, which bound every figure here:**

- **Wave 2's 184 pull requests come from two weeks**, 2026-07-13 to 07-19 (118) and 2026-06-01 to 06-07 (66): the amendment exhausts one week before the next, and the first week in its fixed order held enough.
- **Copilot wrote 78% of the sample.**
- **The figures hold for this population only:** these agents, this window and repositories of this size. They do not transfer to private code.

## Figures

| | Dev half, baseline 0.1.3 | Test half, baseline 0.1.3 | **Test half, fixed 0.1.4 (the result)** |
|---|---|---|---|
| Advisories (per PR, mean) | 112 (0.75) | 135 (0.90) | 135 (0.90) |
| Checkable advisories | 102 (0.91 of advisories) | 120 (0.89) | 120 (0.89) |
| PRs with a checkable advisory | 69 of 150 | 71 of 150 | 71 of 150 |
| **M1** extraction precision (seeded sample of 60) | 55/60 = 0.917 [0.819, 0.964] | 52/60 = 0.867 [0.758, 0.931] | **54/60 = 0.900 [0.799, 0.953]** |
| **M2** `differs` notes | 17 | 28 | **28** |
| `false_claim` | 4 = 0.235 [0.096, 0.473] | 10 = 0.357 [0.207, 0.542] | **10 = 0.357 [0.207, 0.542]** |
| `claim_holds` | 3 = 0.176 | 1 = 0.036 | **1 = 0.036** |
| `not_a_claim` | 10 = 0.588 | 17 = 0.607 | **17 = 0.607** |
| **M3** false accusations / checkable | 13/102 = 0.127 [0.076, 0.206] | 18/120 = 0.150 [0.097, 0.225] | **18/120 = 0.150 [0.097, 0.225]** |
| Errors (no record) | 0 | 0 | 0 |

The fixed and baseline runs on the test half produced the same 135 advisories. M1 differs between them only because each run's sample of 60 is drawn from its own advisory ids.

## The "mismatch" bar: not met

The bar needs, on the test half for the frozen extractor, an M3 Wilson upper bound of at most 0.05 **and** a `false_claim` share among `differs` of at least 0.80. The result is an upper bound of 0.225 and a `false_claim` share of 0.357. A `differs` note stays "possible disagreement, unverified".

## Expected values against results

| Quantity | Expected (range) | Observed | Within range |
|---|---|---|---|
| Advisories per PR, baseline | 1.2 (0.5 to 3.0) | 0.75 dev, 0.90 test | yes |
| Checkable share, baseline | 0.30 (0.15 to 0.50) | 0.91 dev, 0.89 test | **no**: far higher |
| M1, baseline | 0.75 (0.55 to 0.90) | 0.917 dev, 0.867 test | dev **no** (higher), test yes |
| M1, fixed on test | 0.80 (0.60 to 0.92) | 0.900 | yes |
| M2 `false_claim`, baseline | 0.05 (0 to 0.20) | 0.235 dev, 0.357 test | **no**: far higher |
| M2 `claim_holds`, baseline | 0.30 (0.10 to 0.55) | 0.176 dev, 0.036 test | dev yes, test **no** (lower) |
| M2 `not_a_claim`, baseline | 0.65 (0.40 to 0.85) | 0.588 dev, 0.607 test | yes |
| M2 shares, fixed on test | 0.10 / 0.35 / 0.55 | 0.357 / 0.036 / 0.607 | `false_claim` **no**; `claim_holds` **no**; `not_a_claim` yes |
| M3, baseline | 0.35 (0.15 to 0.55) | 0.127 dev, 0.150 test | dev **no** (lower), test at the range's floor |
| M3, fixed on test | 0.20 (0.05 to 0.40) | 0.150 | yes, but no lower than the baseline |
| The bar | not met | not met | yes |

**Why the expectations missed.** They were grounded in Barg Labs' own pull requests, where reports state test counts that no record answers (unchecked) and true claims were misread.

- **Checkable share.** Public agent reports state more of what the record can answer, mostly changed files and closing references, so far more advisories are checkable.
- **False claims.** Public agent reports also contain real false claims, which our own did not.

## The preregistered refutation tests

1. **"Reading, not checking" is refuted** if, on the baseline over both halves, there are at least 10 false accusations and at least half of them are `claim_holds`. Result: 31 false accusations, 4 of them `claim_holds`. **Not refuted.** Most wrong advisories are misreads, not errors in checking a correctly read claim.
2. **The fixes are refuted as a remedy** if the frozen extractor's M3 share on the test half is not below the baseline's on the same half. Result: 0.150 against 0.150. **Refuted.** The five 0.1.4 rules removed 8 of 18 misreads in the dev half they were written from (in-sample), and none on the test half. They fit the pull requests they were written from.
3. **The caution of the wording is wrong** if, on the test half, the `false_claim` share among `differs` is 0.50 or more. Result: 0.357. **Not refuted.** A `differs` note on these pull requests marks a false claim about one time in three, which is not "usually".

## What this means

- **The reader is better on public agent reports than on our own.** It proposes fewer misreads, and most of what it proposes can be checked.
- **Its `differs` notes are worth reading on public pull requests.** About one in three marks a claim the record contradicts. That is not reliable enough to call a "mismatch", and the wording stays.
- **Grammar fixes written from a few dozen misreads do not carry to new pull requests.** The misreads left are spread across many shapes. This is the result "reading, not checking" predicts, and it is why Dunstan asks agents to declare their claims in a block, which the gate checks exactly, instead of relying on any reader of prose.

## Records

- `selection.json`: the selection, both waves, every candidate examined, and the split.
- `runs/*.seal.json`: record digests, sealed before the records were read. `runs/<instrument>-<half>.json` holds the opened indices (ids, kinds, notes, offsets).
- `samples/*.m1.json`: the M1 samples.
- `labels/dev.jsonl` and `labels/test.jsonl`: every label, by the operator, with pull request, advisory id, clause offsets, measure, label and time. No text.
- `figures/*.json`: the figures above.
- `frozen.json`: the fixed instrument.

The pull request bodies and records are not published. They are third-party text, and anyone can re-read them from GitHub by the offsets and digests above. This study made no contact with any of the projects it read.

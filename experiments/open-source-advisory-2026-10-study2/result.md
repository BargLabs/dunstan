# Result: study 2, the path-existence check (comparison 0.3.0)

Reported 2026-10-07 against [`preregistration.md`](preregistration.md) (public commit `09cc222a`). Every figure is computed by `tools/figures.mjs` from the published labels (`labels/labels.jsonl`, by the operator) and records sealed before they were read (`runs/*.seal.json`). The operator labelled blind to the candidate's notes. Each outcome is reported as it fell.

## In one paragraph

On 150 new public agent-written pull requests, the path-existence check (checker 0.1.5, comparison 0.3.0) lowered false accusations from 9 to **6 among 92 checkable advisories (0.065, Wilson 95% [0.030, 0.135])**, and lost **no** genuine catch (0 of 22).

**The "mismatch" bar is not met.** M3's upper bound is 0.135, above 0.05, and the `false_claim` share among `differs` is 0.786, just under 0.80. The third condition (at most one genuine catch lost) is met.

**The account behind the check is refuted on its own terms.** Of the 7 file false accusations, 4 named a path that is a file at the head, so the existence check could not remove them; the dev-half observation that motivated it does not generalise.

**One pull request holds 19 of the 22 genuine false claims**, so the shares among `differs` notes mostly describe that one pull request (below).

## The sample

- **150 public, merged, agent-written pull requests** from the 17 weeks study 1's amendment never queried, by the same rule, excluding study 1's 300 repositories and the demo's 5.
- **10,408 candidates examined**, from three weeks in the fixed order: 2026-06-22 (84), 2026-08-17 (25), 2026-08-31 (41).
- **By agent:** GitHub Copilot coding agent 102, Claude 29, Devin 18, Google Jules 1.
- **Both instruments proposed the same 114 advisories** (0 identity faults).

## Figures

| | Baseline `v0.1.3` (comparison 0.2.0) | **Candidate 0.1.5 (comparison 0.3.0)** |
|---|---|---|
| M1 extraction precision (seeded sample of 60; same advisories) | 58/60 = 0.967 [0.886, 0.991] | the same |
| Checkable advisories | 95 | 92 |
| `differs` notes | 31 | 28 |
| `false_claim` | 22 = 0.710 [0.534, 0.839] | **22 = 0.786 [0.605, 0.898]** |
| `claim_holds` | 0 | 0 |
| `not_a_claim` | 9 = 0.290 | **6 = 0.214** |
| **M3** false accusations / checkable | 9/95 = 0.095 [0.051, 0.170] | **6/92 = 0.065 [0.030, 0.135]** |
| **LOST** (genuine catches the candidate notes `unanswered`) | | **0 of 22** [0, 0.149] |
| Errors | 0 | 0 |

**By kind** (the operator's labels):

- **`reference_closes`:** 21 `false_claim` and 1 `not_a_claim`, all `differs:not_closing` under both instruments.
- **`file_changed`:** 7 `not_a_claim`. Of these, 3 the candidate notes `unanswered:no_such_path` and 4 it still notes `differs:declared_not_changed`.
- **`checks_succeeded`:** 1 `false_claim` and 1 `not_a_claim`.
- **No `file_changed` advisory was a genuine false claim** in this sample.

## The bar: not met

| Condition | Required | Result | Met |
|---|---|---|---|
| M3 Wilson 95% upper bound | ≤ 0.05 | 0.135 | no |
| `false_claim` share among `differs` | ≥ 0.80 | 0.786 | no |
| LOST | ≤ 1 | 0 | yes |

A `differs` note stays "possible disagreement, unverified".

## The preregistered refutation tests

1. **Misreads survive the check** (the candidate's `differs` labelled `not_a_claim`, refuted at ≥ 0.30 with at least 5 cases): 6 of 28 = 0.214. **Not refuted.**
2. **Misreads name existing files** (the baseline's file false accusations at a path that is a file at the head, refuted at ≥ half with at least 6 cases): 4 of 7 = 0.571. **Refuted.** Path existence removes only some misreads. The dev-half observation (12 of 12 absent) does not generalise.
3. **Genuine catches name missing files** (the baseline's file false claims lost, refuted at ≥ half with at least 4 cases): there were 0 file false claims. **Not decidable.**
4. **0.3.0 is no remedy** (refuted if the candidate makes no fewer false accusations): 6 against 9. **Not refuted.** The check helps, partly.

## Not preregistered: clustering by pull request

Reported as an observation, not a preregistered test. **The 22 genuine false claims come from 4 pull requests, and one of them holds 19.** That pull request's report states closing references that GitHub's record does not link.

- **Without it**, the candidate's `differs` are 3 `false_claim` and 6 `not_a_claim` (0.33), and the baseline's are 3 and 9.
- **The shares among `differs` notes are therefore not estimates for a typical pull request.** The near-miss on the 0.80 condition comes from one pull request.
- **A future preregistration should state how claims cluster:** for example, count at most one advisory per pull request per kind, or report by pull request.

## Expected values against results (the candidate)

| Quantity | Expected (range) | Observed |
|---|---|---|
| M3 | 0.025 (0 to 0.07) | 0.065: within range, higher than expected |
| `false_claim` share | 0.65 (0.35 to 0.95) | 0.786: within range, but clustered (above) |
| LOST | 2 (0 to 5) | 0: within range |
| The bar | not met | not met |
| Baseline file false accusations noted `unanswered` | 0.90 (0.70 to 1.00) | 3 of 7 = 0.43: **below range**, the refutation in test 2 |

## What this means

- **The path-existence check is a modest, safe improvement.** It removed 3 of 7 file misreads and lost no genuine catch. It is not the fix the dev half suggested: about half of the file misreads name files that exist, such as a file mentioned for context.
- **The genuine catches on public pull requests are overwhelmingly `closes` claims:** a report says it closes issues that GitHub's record does not link. Those are exact checks, and they are where the advisory reader is most useful. File claims read from prose are where it is weakest.
- **Across both studies, the evidence points the same way.** The reader is precise at proposing claims, at 0.87 to 0.97 of its sampled advisories, but its file claims will not reach "mismatch" from prose. That is why Dunstan's gate checks only what an agent declares.

## Records

- `selection.json`;
- `runs/baseline.seal.json`, `runs/candidate.seal.json` and `runs/index.json` (both notes per advisory);
- `samples/m1.json`;
- `labels/labels.jsonl` (offsets, no text);
- `figures/figures.json`.

The pull request bodies and records are not published, and no project was contacted.

# Preregistration: study 2, does the path-existence check earn the "mismatch" wording?

Written 2026-10-07, before any search for these pull requests ran and before any of them was read.
Nothing below was checked against GitHub: no search, no repository, no pull request. The tools in
[`tools/`](tools/) implement this document and were tested on synthetic fixtures only.

## The question

On new public agent-written pull requests, does checker 0.1.5 (comparison 0.3.0) remove the
advisory reader's false accusations without losing its genuine catches, and does it meet the bar
for calling a `differs` note a "mismatch"?

## Background

Dunstan's advisory reader (`docs/advisory.md`) reads a completion report's prose without a model,
proposes the claims it asserts ("updated `src/a.ts`", "closes #12") and compares each with the pull
request's record. Each proposed claim is an **advisory**, and its comparison gives a **note**:
`agrees`, `agrees_by_name`, `differs:<reason>` or `unanswered:<reason>`. Advisories never affect a
verdict.

**Study 1** ([`../open-source-advisory-2026-10/`](../open-source-advisory-2026-10/)) measured the
reader on 300 public agent-written pull requests, split 150/150 by hash. Its
[`result.md`](../open-source-advisory-2026-10/result.md) reports that grammar fixes written from the
dev half did not carry to the test half, and that the "mismatch" bar was not met. Its published
labels give, for the untouched baseline (extractor 0.1.3, comparison 0.2.0) over both halves:

| | Dev half | Test half | Both |
|---|---|---|---|
| Advisories | 112 | 135 | 247 |
| Checkable advisories | 102 | 120 | 222 |
| `file_changed`, `differs:declared_not_changed` | 15: 3 `false_claim`, 2 `claim_holds`, 10 `not_a_claim` | 23: 6 `false_claim`, 0 `claim_holds`, 17 `not_a_claim` | 38: 9, 2, 27 |
| `reference_closes`, `differs:not_closing` | 2: 1 `false_claim`, 1 `claim_holds` | 5: 4 `false_claim`, 1 `claim_holds` | 7: 5, 2 |
| False accusations (`claim_holds` or `not_a_claim` among `differs`) | 13 | 18 | 31 |
| M1, sample of 60 | 55 `real` | 52 `real` | 107 of 120 |

So 29 of the 31 false accusations, and all 27 `not_a_claim` labels, were `file_changed` claims
noted `differs:declared_not_changed`: a file the report names that the pull request's changed files
do not hold.

**Comparison 0.3.0** (checker 0.1.5) asks one more question of such a claim: what is at that path at
the pull request's head? It reads the object's type only, never its content. The note stays
`differs:declared_not_changed` only when the path is a file (`Blob`). Otherwise it becomes
`unanswered:no_such_path` (nothing there), `unanswered:directory` (a `Tree`) or
`unanswered:source_unreadable:path` (the read failed or answered in another shape). Every other
note is unchanged, and so is the extractor (0.1.3).

**Where the idea came from, and why study 1 cannot test it.** On study 1's dev half, all 12 file
false accusations named a path absent at the head, while 2 of the 3 genuine file false claims named
one that exists (`docs/advisory.md`, "Paths that are not at the head"). The idea was conceived
after both halves' labels by kind had been seen, so study 1 cannot test it: its test half was not
held out from the idea. Nothing is known about path existence on study 1's test half; it was never
read. Study 2 tests the idea on pull requests nobody has read.

## Order of work

1. **Preregister.** This document and the tools are pushed to the public repository before any
   search runs, so the public git history shows the rule before the data.
2. **Select.** The selection rule below runs once and writes `selection.json`.
3. **Run and seal.** Both instruments run on every selected pull request. Both runs are sealed (each
   record's SHA-256 is committed) before either is opened.
4. **Open.** The sealed records are indexed (ids, kinds, notes and offsets), the advisory-identity
   check runs, and M1's sample is drawn.
5. **Label.** The operator labels the M1 sample and the M2 census, and the labels are published.
6. **Figures.** The measures, the bar and the refutation tests are computed from the published
   labels and reported as they fall.

[`README.md`](README.md) gives who runs each step and what is public after it.

**No split.** All of study 2 is held out. Nothing is fixed, tuned or chosen from it: no instrument
changes between steps 2 and 6, and a fix suggested by what study 2 shows is measured on a later
sample, never on this one.

## Selection

Study 1's rule (`../open-source-advisory-2026-10/preregistration.md`, "Selection rule", and
`amendment-1.md`, "The change: wave 2"), with the differences named here. `tools/select.mjs`
imports study 1's agents, qualifiers, filters, page reading and week order unchanged.

**Agents, in this fixed order, with their search qualifiers:** A GitHub Copilot coding agent,
`author:app/copilot-swe-agent`; B Devin, `author:app/devin-ai-integration`; C Claude,
`author:app/claude`; D OpenAI Codex, `author:app/chatgpt-codex-connector`; E Google Jules,
`author:app/google-labs-jules`.

**Weeks.** The 17 weeks of amendment 1's week list that its wave 2 never queried. Amendment 1 cut
the window `merged:2026-06-01..2026-10-06` into 19 weeks and ordered them by the SHA-256 (hex) of
the UTF-8 string `"week:<start>"`. Wave 2 queried only positions 1 and 2 (`2026-07-13` and
`2026-06-01`). Study 2 takes positions 3 to 19, in that order:

| # | Start | End | SHA-256 of `"week:<start>"` |
|---|---|---|---|
| 3 | 2026-08-17 | 2026-08-23 | `2bc21103f30c353eed8a1cbce04d0f52e58f27d87c1736b4863ead182f6f21f9` |
| 4 | 2026-06-22 | 2026-06-28 | `2c79608facf34e00a2e9d3eadc2dd5b6bc5ee48e1682dd0e4b4d1d61b89dbb5b` |
| 5 | 2026-08-31 | 2026-09-06 | `3273f68bf8e50fe1bd019153951670e5dcc0b55aff6f11679e8a23c475eccdba` |
| 6 | 2026-07-06 | 2026-07-12 | `34fe6adec1fd2aa9da9ba57126eb1d24ebe2b4b06ed142ab1f5d6e3242c19223` |
| 7 | 2026-09-28 | 2026-10-04 | `3f665217e918c533bc86b82376a1fb11b8f6b9c3ec9a9cd9279983667353f25a` |
| 8 | 2026-08-24 | 2026-08-30 | `4456aa22daf95da7fba04d9c09393fbc212c4e5bcd9b67d2da3e15b170c5ef0b` |
| 9 | 2026-09-07 | 2026-09-13 | `4ac0ec3b6ae4475dbad0eb71d54bd2e8a121ead613ee998a5a7c663aff82567e` |
| 10 | 2026-10-05 | 2026-10-06 | `5e92620e07a00c7bc3505abbb17dae93da862479570c7efba822c97db9d58989` |
| 11 | 2026-09-21 | 2026-09-27 | `83595be07406ada71b1651ab467df74d5026df6b0366940c8e6d3bf2fa573429` |
| 12 | 2026-07-20 | 2026-07-26 | `9540ba3227b0714f26c046339c5d15b785bc4bff27b19d81ffd07c960d415610` |
| 13 | 2026-08-10 | 2026-08-16 | `b57ae577404e1df9a12733ad69fa6e1921809ca2f9d76e0eda4bd58e05fc5c41` |
| 14 | 2026-06-29 | 2026-07-05 | `c9993d901dea4f002d56cd89c1ded9f8bd4abdf87c4cde6738f2f5f9e7de8009` |
| 15 | 2026-06-08 | 2026-06-14 | `e32313d6551f4d2c174ab697c36fcee45c7bd8801cb0196cb1fff41f655eda77` |
| 16 | 2026-09-14 | 2026-09-20 | `e895aa0519e2ec2d96b811574c8e4c530ae9707b7f008616f3dc17ad21da8ab3` |
| 17 | 2026-08-03 | 2026-08-09 | `ef54d66d5d155e1a7480b3c611a36b12ee805589012364e13ef57e39be6a46f9` |
| 18 | 2026-06-15 | 2026-06-21 | `fb6015b5835025c32d0c82aaa93605e675b9f384e5e5517b745a648b83263047` |
| 19 | 2026-07-27 | 2026-08-02 | `fb666427a16d45117907795e9705e92dbf6d350cd0edb9b472662b367e5c3035` |

`tools/tools.test.mjs` checks that this table is what study 1's `weekOrder()` computes, from
position 3.

**Query, one per agent and week:** the GitHub issue search API (`GET /search/issues`) with
`q = is:pr is:merged is:public merged:<start>..<end> <qualifier>`, `sort=created`, `order=asc`,
`per_page=100`. Pages are read in order, as far as the round-robin needs, up to the API's
1,000-result cap. The run time of each page is recorded.

**Filters, applied in this order to each candidate as it comes out of its agent's results.** The
first filter that fails rejects the candidate, and the filter is recorded.

1. **Exclusions.** The repository's owner is not `BargLabs`; the repository is not one of the five
   in `demo/2026-10/selection.json` (`FluidSynth/fluidsynth`, `airbytehq/airbyte`,
   `AlphaGPU/leetgpu-challenges`, `cdcseacave/openMVS`, `QuantEcon/QuantEcon.py`); and it is not
   one of the 300 repositories in study 1's `selection.json`, whose bytes have SHA-256
   `1593c3d9ac1c4dba9c6d00b0f8c150b69729969b95991a71bb7e931bb0566c36` (`tools/select.mjs` refuses
   any other file). Repositories are compared without regard to case.
2. The repository, read with `GET /repos/{owner}/{repo}` at selection time, is public, not archived,
   not a fork, and has `stargazers_count >= 200`.
3. The pull request body, with HTML comments (`<!-- ... -->`) removed and whitespace trimmed, is at
   least 300 characters (Unicode code points).
4. No pull request from the same repository is already selected in study 2.

A pull request study 1's wave 1 examined and rejected is not skipped: it meets the same filters
again, and its repository was not selected by study 1 (or filter 1 rejects it).

**Order.** Weeks in the order above. Within a week, round-robin from A: the first qualifying
candidate from A, then from B, C, D and E, then A again. An agent whose results for the week run out
(its last page, or the cap) is skipped for the rest of the week. When every agent's results for the
week have run out, the next week begins. **Stop at 150.** No week after the one that reaches 150 is
queried.

**Shortfall.** If the 17 weeks run out first, fewer are selected and the record says so
(`"complete": false`). Nothing is widened: no other week, window, threshold, filter or query.

**Reads allowed before `selection.json` is committed:** search results, repository metadata and the
pull request body as its search result gives it, for filter 3. Not allowed: the pull request's
files, commits, checks, reviews or comments.

**Recorded for audit** (`selection.json`): the rule's commit; each week run, with each query string
and each page's run time and total count; every candidate examined with the filter that rejected
it; and, for each selected pull request, its week, agent, star count, cleaned body length, and the
SHA-256 and code-point length of its body as read. The body itself stays outside git (`.work/`).

**The population.** The figures hold for the population this rule defines and for no other: merged,
public pull requests written by these agents and merged in these weeks, in public repositories with
at least 200 stars outside study 1's, whose bodies are at least 300 characters. A known property:
where a query reaches the cap, `sort=created, order=asc` puts first the earliest-created pull
requests merged that week, so the sample leans towards pull requests that stayed open long. Study
1's wave 2 filled 184 places from its first two weeks; study 2 is likely to fill 150 from its first
two or three, so most of the sample is likely to come from `2026-08-17` and `2026-06-22`.

## Instruments

Both are frozen now, in `tools/common.mjs`. `tools/run.mjs` refuses a bundle with any other digest,
and refuses a record whose checker digest, extractor digest or comparison version is not its
instrument's.

- **Baseline:** Dunstan as tagged `v0.1.3` in the public repository, study 1's baseline.
  `dist/dunstan.mjs` SHA-256 `fd1377c058a928bf30e54c000bfb19e5eb3cd5eb71408ea4b093cc9ccf7170a5`;
  extractor 0.1.3, grammar digest
  `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`; comparison 0.2.0.
- **Candidate:** checker 0.1.5. `dist/dunstan.mjs` SHA-256
  `978a6f63d5932e2d52c89b73ca9ead3f29628cd847efd50fb4b7eb05daeab8c5`; extractor 0.1.3, grammar
  digest `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37` (the baseline's);
  comparison 0.3.0. Built from source commit `e559598ec3c5b1a05e96270e0ba723d5cef6b1a3`; a build of
  that source on 2026-10-07 reproduced the digest. Its source is published with a later public
  release, whose build must reproduce this digest.

**Each pull request** is checked by both, baseline then candidate, one pull request after another
in selection order, with
`dunstan check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>` and a
read-only token as `GITHUB_TOKEN` on the checker's process only. The study uses only the record's
advisory section, which never affects a verdict.

**Reads** are metadata only, as the checker reads it: the pull request, its files listing, closing
references, issues it names and check runs; and, for the candidate, the type of the object at
`<head>:<path>` for each file claim comparison 0.2.0 would note `differs:declared_not_changed`. No
file content is fetched by either.

**A check that writes no record** is tried once more after the rest. If either instrument still
writes none, the pull request is reported as an error and enters no measure of either instrument.

**Both runs are sealed before reading.** `tools/run.mjs check` writes `runs/baseline.seal.json` and
`runs/candidate.seal.json`, each record's SHA-256 and nothing a record says. `tools/run.mjs index`
refuses to open either run until both seals are committed as they stand.

### Advisory identity

The extractor is the same, so both runs must propose the same advisories for each pull request: the
same report digest, the same number of advisories, and at each position the same kind, value and
clause. The notes must be the same too, except the one change comparison 0.3.0 makes: a
`file_changed` advisory the baseline notes `differs:declared_not_changed` may carry, under the
candidate, `differs:declared_not_changed`, `unanswered:no_such_path`, `unanswered:directory` or
`unanswered:source_unreadable:path`.

A pull request that fails this is an **instrument fault**. It is reported (`runs/index.json`,
`faults`, with the reason) and enters no measure of either instrument. It is never resolved by
editing a record, re-running a check or changing an instrument. The count of faults is reported with
every figure.

So an advisory is the same in both runs, and is named once:
`"<owner>/<repo>#<n>:<i>"`, with `i` its 0-based position in both records' advisory lists. Under
0.3.0 the `differs` set is a subset of the baseline's (`tools/figures.mjs` refuses an index where it
is not).

## Labels

One adjudicator, the operator, writes every label, by study 1's protocol and its guidance for
borderline cases (`../open-source-advisory-2026-10/preregistration.md`, "Adjudication protocol" and
"How to label borderline cases"), which apply unchanged except as stated here.

- **M1, extraction precision.** One seeded sample of 60 advisories (all of them, if fewer), since
  the advisories of the two runs are the same: every advisory ordered by the SHA-256 (hex) of the
  UTF-8 string `"<seed>:<advisoryId>"`, the first 60 taken. The seed, fixed now, is
  `open-source-advisory-2026-10-study2/M1/2026-10-07`. Each is labelled `real` (the clause asserts
  that claim, of that kind and value, about this pull request) or `not_real`. An M1 line shows no
  note: whether a clause makes a claim is judged from the report alone.
- **M2, the `differs` census.** Every advisory whose note **under the baseline** is
  `differs:<reason>` is labelled `false_claim` (the claim is false against the record),
  `claim_holds` (the claim is true and the reader misjudged it) or `not_a_claim` (the clause
  asserts no such claim). This is a superset of the candidate's `differs`, so one set of labels
  serves both runs.
- **Blind to the candidate.** The worksheet shows the baseline's note and observed value on an M2
  line, and never the candidate's note or what the path query answered. The adjudicator may read
  the pull request body, the baseline record's evidence snapshot and the pull request's public
  GitHub page, and nothing else.
- **One judgement per advisory.** An advisory labelled under both measures is `not_real` under M1
  exactly when it is `not_a_claim` under M2.
- **Labels before figures.** All labels are written and published before any figure is computed.
  `tools/figures.mjs` refuses, computing nothing, while any label a measure needs is missing.
- **Published labels are final.** A label, once published, is not changed or withdrawn. A label
  later found wrong is corrected by a dated erratum beside it, which leaves the original standing.

**Published as in study 1:** `labels/labels.jsonl`, one JSON object per line and measure: `pr`,
`advisoryId`, `clause` (`[start, end)` offsets in Unicode code points into the pull request body at
selection time, or `null`), `measure`, `label` and `adjudicatedAt`. No text. The bodies, the records
(whose advisories quote their clauses) and the worksheets stay outside git in `.work/`. Every
committed file holds names, numbers, digests and offsets only.

## Measures

Computed for each instrument over the pull requests that are neither errors nor faults, each share
with its Wilson 95% score interval (z = 1.959964).

- An advisory is **checkable** under an instrument when its note under that instrument is `agrees`,
  `agrees_by_name` or `differs:<reason>`.
- A **false accusation** under an instrument is an advisory that instrument notes
  `differs:<reason>` and that is labelled `claim_holds` or `not_a_claim`.

**M1:** the share of the sample labelled `real`. One figure, the same for both instruments.

**M2:** among that instrument's `differs` advisories, the shares labelled `false_claim`,
`claim_holds` and `not_a_claim`.

**M3:** that instrument's false accusations over its checkable advisories: the count, the share and
its Wilson 95% interval, upper bound stated.

**LOST:** the baseline's `false_claim` advisories that the candidate notes `unanswered:<reason>`:
the genuine catches 0.3.0 gives up. Reported as a count, and as a share of the baseline's
`false_claim` total with its Wilson 95% interval.

**Descriptive only:** advisories per pull request (mean, median, maximum, histogram); each
instrument's checkable share and the share of pull requests with a checkable advisory; each
instrument's notes by count; the baseline's false accusations the candidate notes `unanswered`;
the baseline's `file_changed` `differs` by the candidate's note and the label; the counts of
errors, faults and bodies edited since selection.

**Not measured.** Recall: nothing here reads a report for claims the extractor did not propose.
`unanswered` advisories are counted, not adjudicated, except that M1 samples them.

## The "mismatch" bar

Study 1's bar, restated in full, with a third condition. Wording that calls a `differs` note a
"mismatch" may replace "possible disagreement, unverified" only if, **on study 2, for the
candidate**:

1. M3's Wilson 95% upper bound is at most **0.05**; **and**
2. M2's `false_claim` share among the candidate's `differs` advisories is at least **0.80**; **and**
3. **LOST is at most 1**: at most one genuine catch given up, so that precision is not bought by
   hiding real catches.

**The bar is decided on these three conditions only.** A run with no checkable advisory, or no
`differs` advisory, does not meet conditions 1 or 2. The wording, if earned, would be bound to
extractor 0.1.3's grammar digest and comparison 0.3.0, as published figures are, and to nothing
later.

For scale: zero false accusations has a Wilson upper bound at most 0.05 only from 73 checkable
advisories; one needs 110, two need 142.

## Expected values

Stated now, grounded only in public figures: study 1's `result.md`, its published labels and
figures (the table under "Background"), and the dev-half observation in `docs/advisory.md`, which
is untested. Per 150 pull requests, study 1's baseline gives about 19 file `differs` (4.5
`false_claim`, 14.5 false accusations) and 3.5 reference `differs` (2.5 `false_claim`, 1 false
accusation).

| Quantity | Expected | Range | Reason |
|---|---|---|---|
| Pull requests selected | 150 | 120 to 150 | Wave 2's first week alone gave 118; 17 weeks remain, less study 1's 300 repositories. |
| Advisories (both instruments) | 125 (0.83 per pull request) | 75 to 190 | 247 on study 1's 300, the same extractor on the same population. |
| M1 | 0.89 | 0.78 to 0.96 | 107 of 120 in study 1's two baseline samples. |
| Baseline: checkable | 110 | 75 to 150 | 222 of 247 in study 1. |
| Baseline: `differs` | 22 | 12 to 35 | 45 on study 1's 300. |
| Baseline: M2 `false_claim` | 0.31 | 0.15 to 0.50 | 14 of 45 in study 1. |
| Baseline: M3 | 0.14 (about 15 of 110) | 0.08 to 0.22 | 31 of 222 in study 1; the baseline is unchanged. |
| Baseline file false accusations the candidate notes `unanswered` | 0.90 of them | 0.70 to 1.00 | 12 of 12 on study 1's dev half (Wilson 95% lower bound 0.76), discounted because that is the sample the idea came from; a bare name of a file at the root still reads as a file. |
| Candidate: checkable | 96 | 65 to 135 | The baseline's, less the file `differs` that become `unanswered` (about 15 of 19). |
| Candidate: `differs` | 8 | 3 to 15 | 3.5 reference `differs`, untouched, plus about 3 file false claims and 1.5 file false accusations at a file. |
| Candidate: M2 `false_claim` | 0.65 | 0.35 to 0.95 | About 5 of 8: reference false claims (5 of 7 in study 1) and file false claims at a file (2 of 3 on study 1's dev half). |
| Candidate: M2 `not_a_claim` | 0.15 | 0 to 0.40 | The file misreads 0.3.0 does not remove, about 1.5 of 8. |
| Candidate: M3 | 0.025 (about 2 to 3 of 96; Wilson upper bound about 0.07 to 0.09) | 0 to 0.07 | Reference false accusations are untouched (2 of 300 pull requests in study 1), and a few file misreads name a file that exists. |
| LOST | 2 of about 7 | 0 to 5 | About 4.5 file false claims per 150, and 1 of 3 on study 1's dev half named a path absent at the head; reference false claims are never lost. |
| The "mismatch" bar | **not met** | | It may well not be met, and we expect it not to be. Condition 1 needs no false accusation among at least 73 checkable advisories, or one among 110; the untouched reference `differs` alone are expected to give about one. Condition 2's 0.80 is above the expected 0.65. Condition 3 is near even. |

## What would refute it

The working account is **"path existence separates misreads from false claims"**: a file claim the
pull request did not change is a misread when its path is not a file at the head, and a genuine
false claim when it is. `tools/figures.mjs` computes each test below. A test with fewer cases than
its minimum is reported as not decidable, never as passed.

1. **Misreads survive the check.** Among the candidate's `differs` advisories (at least 5), the
   share labelled `not_a_claim` is 0.30 or more. Then path existence does not separate misreads
   from false claims.
2. **Misreads name existing files.** Of the baseline's `file_changed` false accusations (at least
   6), half or more are at a path that is a file at the head (the candidate still notes them
   `differs:declared_not_changed`). Then the dev-half observation does not generalise.
3. **Genuine catches name missing files.** Of the baseline's `file_changed` false claims (at least
   4), half or more are lost (the candidate notes them `unanswered`). Then 0.3.0 gives up genuine
   catches as often as it keeps them.
4. **0.3.0 is no remedy.** The candidate makes no fewer false accusations than the baseline, when the
   baseline makes at least one.

Each outcome is reported as it falls, with the figures, whether or not it was expected, and whether
or not the bar is met.

## Integrity statement

Before this document was written, nothing of study 2 had been read: no search, no repository, no
pull request, no record. Its author had read study 1's published labels, figures and result, which
are where the idea comes from, as stated above. The one adjudicator knows the hypothesis; the
worksheet withholds the candidate's notes, and every label is published for anyone to check.

# Preregistration: the advisory reader on public agent-written pull requests

Written 2026-10-07, before any search for these pull requests ran and before any of them was read.
Nothing below was checked against GitHub: not the star threshold, not the agents' result counts, not
any pull request. The tools in [`tools/`](tools/) implement this document and were tested on
synthetic fixtures only.

## Why this study

Dunstan's advisory reader (`docs/advisory.md`) reads a completion report's prose without a model and
proposes the claims it asserts ("updated `src/a.ts`", "closes #12"), each compared with the pull
request's record. Every figure measured for it on real pull requests so far comes from one
organisation's own pull requests: 170 of Barg Labs' merged agent-written pull requests. There, the
published finding is that a `differs` note usually reflected a misread of the report, not a false
claim. Fixing those misreads and measuring again on the same pull requests would show only that the
fixes fit the pull requests they were written from.

This study measures on public pull requests that anyone can open, with a test half no fix is written
from, and publishes every label so anyone can check the adjudication.

**The population.** The figures this study produces hold for the population the selection rule
below defines, and for no other: merged, public, agent-written pull requests in the window, in
public repositories with at least 200 stars, whose bodies are at least 300 characters. They do not
transfer to a private corpus, and a later corpus is not this one.

## Order of work

1. **Preregister.** This document and the tools are committed to the public repository before any
   search runs, so the public git history shows the rule before the data.
2. **Baseline.** The selection runs; the split is computed; extractor 0.1.3, untouched, is run on
   all the selected pull requests. Only the dev half is opened and adjudicated. The test half's
   records are sealed (each record's SHA-256 is committed) and not read.
3. **Fix.** Misreads are fixed using only the dev half and a private set of 34 checkable advisories
   from Barg Labs' own pull requests. Nothing from the test half is used.
4. **Freeze.** The fixed extractor's grammar digest and checker bundle digest are committed to this
   directory (`frozen.json`) before the test half is run with it or opened.
5. **Test.** The frozen extractor is run on the test half. Then the test half is opened: the
   baseline's sealed records and the frozen extractor's records are adjudicated, and only then are
   their figures computed. **The frozen extractor's figures on the test half are the result.**

[`README.md`](README.md) gives who runs each step and what is public after it.

## Selection rule

The demo's rule (`demo/2026-10/selection-rule.md`), with the same five agents, account logins and
qualifiers, the same API, the same round-robin and one pull request per repository. What changes is
the window, the star threshold, the exclusions and the number wanted.

**Agents, in this fixed order:**

| # | Agent | Account (`GET /users`) | Search qualifier |
|---|---|---|---|
| A | GitHub Copilot coding agent | `copilot-swe-agent[bot]` (shown as "Copilot", id 198982749) | `author:app/copilot-swe-agent` |
| B | Devin | `devin-ai-integration[bot]` (id 158243242) | `author:app/devin-ai-integration` |
| C | Claude | `claude[bot]` (id 209825114) | `author:app/claude` |
| D | OpenAI Codex | `chatgpt-codex-connector[bot]` (id 199175422) | `author:app/chatgpt-codex-connector` |
| E | Google Jules | `google-labs-jules[bot]` (id 161369871) | `author:app/google-labs-jules` |

The account ids are those the demo confirmed on 2026-10-04; they were not read again for this rule.

**Query, one per agent:** the GitHub issue search API (`GET /search/issues`) with
`q = is:pr is:merged is:public merged:2026-06-01..2026-10-06 <qualifier>`, `sort=created`,
`order=asc`, `per_page=100`. Pages are read in order, as far as the round-robin needs, up to the
API's 1,000-result cap. The run time of each page is recorded.

**Filters, applied in this order to each candidate as it comes out of its agent's ordered results.**
The first filter that fails rejects the candidate, and the filter is recorded.

1. The repository's owner is not `BargLabs`, and the repository is not one of the five in
   `demo/2026-10/selection.json`: `FluidSynth/fluidsynth`, `airbytehq/airbyte`,
   `AlphaGPU/leetgpu-challenges`, `cdcseacave/openMVS`, `QuantEcon/QuantEcon.py` (compared without
   regard to case).
2. The repository, read with `GET /repos/{owner}/{repo}` at selection time, is public, not archived,
   not a fork, and has `stargazers_count >= 200`.
3. The pull request body, with HTML comments (`<!-- ... -->`) removed and whitespace trimmed, is at
   least 300 characters (Unicode code points).
4. No pull request from the same repository is already selected.

**Order of selection: round-robin.** Take the first qualifying candidate from A, then from B, C, D
and E, then return to A for its next one, until 300 are selected. An agent whose results run out
(its last page, or the 1,000-result cap) is skipped from then on.

**Shortfall.** If every agent runs out before 300 are selected, fewer are selected and the record
says so (`"complete": false`). The window, the threshold and the filters are never widened, and no
second query is added.

**Reads allowed before `selection.json` is committed:** search results, repository metadata and the
pull request body as its search result gives it, for filter 3. Not allowed: the pull request's
files, commits, checks, reviews or comments.

**Recorded for audit** (`selection.json`): the rule's commit, each query string with each page's run
time and total count, every candidate examined with the filter that rejected it, and, for each
selected pull request, its star count, cleaned body length, and the SHA-256 and code-point length
of its body as read. The body itself is kept outside git (`.work/`, below): the label offsets index
into it, and its digest lets anyone tell whether the body they read today is the one selected.
Search results change over time, so the record, not a re-run of the query, is the selection.

### Why 200 stars, not the demo's 1,000

Reasoned from the demo's own record, with no search:

- **The cap, not the window, bounds the candidates.** Each agent's query returns at most 1,000
  results however long the window is, so a longer window changes which pull requests are the first
  1,000, not how many can be examined. The demo's Codex query returned 0 results, so at most about
  4,000 candidates can be examined.
- **At 1,000 stars, 300 is out of reach in expectation.** In the demo, 5 of the 58 candidates
  examined were in a repository with at least 1,000 stars: 0.086, Wilson 95% [0.037, 0.186]. At
  that rate 4,000 candidates hold about 345 such pull requests, and the interval runs from about
  150. Filters 3 and 4 then remove more: busy, popular repositories are the ones where agents open
  many pull requests, so repeats of a repository are likeliest exactly among the high-star
  candidates. 300 distinct repositories would likely not be reached.
- **At 200 stars, it is plausible but not certain.** In the demo, 8 of the 58 candidates were in a
  repository with at least 200 stars: 0.138, Wilson 95% [0.072, 0.249], about 550 of 4,000 (from
  about 285). The shortfall rule above covers the case where it still falls short.

A known property of the rule, kept from the demo: `sort=created, order=asc` puts first the oldest
pull requests merged in the window, so the sample leans towards pull requests that stayed open long.

## Split

After selection, and only from `selection.json`, the selected pull requests are ordered by the
SHA-256 (hex) of the UTF-8 string `"<owner>/<repo>#<n>"`, with owner and repository lower-cased.
The first 150 are **dev** and the rest are **test**. If fewer than 300 were selected, the first
ceil(N/2) are dev. The split is written into `selection.json` (`split`), with each key and its
digest, by `tools/split.mjs`; anyone can recompute it from the selected list.

## Instrument

- **Baseline:** Dunstan as tagged `v0.1.3` in the public repository. `dist/dunstan.mjs` SHA-256
  `fd1377c058a928bf30e54c000bfb19e5eb3cd5eb71408ea4b093cc9ccf7170a5`; extractor 0.1.3, grammar
  digest `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`; comparison 0.2.0.
  `tools/run.mjs` refuses a bundle with any other digest, and refuses a record whose checker digest,
  extractor digest or comparison version is not the instrument's.
- **Fixed:** the frozen extractor of step 4, named by `frozen.json` (bundle digest, extractor version
  and grammar digest, source commit). The comparison stays 0.2.0: fixes change the grammar only.
- **Each pull request** is checked with
  `dunstan check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>`, with a
  read-only token as `GITHUB_TOKEN` on the checker's process only. The report is the pull request
  body as the API returns it at run time. The verdict is not used (a body with no handback block is
  `unverifiable`, `block_missing`): the study uses only the record's advisory section, which never
  affects a verdict.
- **Reads** are pull request metadata only, as the checker reads it: the pull request, its files
  listing, closing references, issues it names and check runs. No file content is fetched.
- **A check that writes no record** is tried once more after the rest of the half. If it fails again,
  the pull request is reported as an error and contributes no advisory; the count of errors is
  reported with every figure.
- **A body edited since selection.** The record's report digest is compared with the body digest in
  `selection.json`, and each pull request where they differ is flagged. Its advisories are measured
  as the record gives them. A clause the selection-time body does not hold gets no offsets (`null`).

## Measures

All measures are computed per run and half (`baseline-dev`, `baseline-test`, `fixed-test`, and
`fixed-dev` if that run is made, which is in-sample and descriptive only), each share with its
Wilson 95% score interval (z = 1.959964). Every term is defined here.

- An **advisory** is one entry of a record's `predicate.advisory.advisories`. Its **note** is that
  entry's `note`.
- An advisory is **checkable** when its note is `agrees`, `agrees_by_name` or `differs:<reason>`.
  Notes `unanswered:<reason>` are not checkable: the record had nothing to compare the claim with.

**M1, extraction precision.** From each run's advisories, a seeded random sample of 60 (all of them,
if fewer): the advisories ordered by the SHA-256 (hex) of the UTF-8 string `"<seed>:<advisoryId>"`,
first 60 taken. The seed, fixed now, is `open-source-advisory-2026-10/M1/2026-10-07`. Each sampled
advisory is labelled:

- `real`: the clause asserts that claim, of that kind and that value, about this pull request;
- `not_real`: it does not.

M1 is the share labelled `real`.

**M2, the `differs` census.** Every advisory whose note is `differs:<reason>` is labelled:

- `false_claim`: the report's claim is false against the record;
- `claim_holds`: the claim is true and the reader misjudged it;
- `not_a_claim`: the clause asserts no such claim.

M2 is the three shares among the `differs` advisories.

**M3, false accusations among checkable advisories.** A **false accusation** is a `differs` advisory
labelled `claim_holds` or `not_a_claim`. M3 is the count of false accusations, and their share of
the checkable advisories with its Wilson 95% interval, upper bound stated.

**The "mismatch" bar.** Wording that calls a `differs` note a "mismatch" may replace "possible
disagreement, unverified" only if, **on the test half, for the frozen extractor**, M3's Wilson 95%
upper bound is at most 0.05 **and** M2's `false_claim` share among `differs` advisories is at least
0.80. Otherwise the wording stays. A run with no checkable advisory, or no `differs` advisory, does
not meet the bar. The wording, if earned, would be bound to the frozen extractor's grammar digest
and comparison 0.2.0, as published figures are, and to nothing later.

For scale: zero false accusations has a Wilson upper bound at most 0.05 only from 73 checkable
advisories; one needs 110, two need 142.

**Descriptive only:** the share of pull requests with at least one checkable advisory; the advisory
count per pull request (mean, median, maximum and the count of pull requests at each value); the
checkable share of advisories; the number of errors and of bodies edited since selection.

**Not measured.** Recall (claims the report makes that the reader missed) is not measured: nothing
here reads a report for claims the extractor did not propose. `unanswered` advisories are counted
but not adjudicated.

## Adjudication protocol

- **One adjudicator, the operator.** Every label is written by the same person.
- **Labels before figures.** All labels of a half are written before any figure is computed for
  that half. `tools/figures.mjs` refuses, computing nothing, while any label a measure needs is
  missing.
- **The test half is adjudicated last.** It is opened only after `frozen.json` is committed
  (`tools/run.mjs` refuses otherwise), and its baseline and frozen-extractor advisories are labelled
  in one pass.
- **What the adjudicator may read:** the pull request body, the record's evidence snapshot, and the
  pull request's public GitHub page. Nothing else. An M1 line is shown without the advisory's note
  or observed value, so whether a clause makes a claim is judged from the report alone; an M2 line
  shows them.
- **One judgement per advisory.** An advisory labelled under both measures is `not_real` under M1
  exactly when it is `not_a_claim` under M2 (`tools/worksheet.mjs` refuses otherwise). The same
  claim from the same clause in two runs of a half is marked in the worksheet, to be labelled alike.
- **Published labels are final.** A label, once published, is not changed or withdrawn
  (`tools/worksheet.mjs` refuses both). A label later found wrong is corrected by a dated erratum
  beside the original, which stands.
- **Disagreement with the instrument is never resolved by changing the instrument within a half.**
  When the adjudicator disagrees with a note, the label records the disagreement. The instrument is
  not edited and the half is not re-run. A fix goes into the next instrument, written from the dev
  half only, and is measured on the test half.

### How to label borderline cases

The examples are constructed for this document. None is from a real pull request.

**General rules.**

1. Read the clause as a person reading the whole body would, with the paragraph around it.
2. Whether the clause makes the claim comes first. Only a claim the clause makes can be true or
   false.
3. Truth is judged as of the pull request's merge, from the record's evidence snapshot first, and
   from the public page only for what the snapshot does not hold (why an issue was closed, a commit
   pushed and later replaced).
4. `false_claim` needs positive evidence that the claim is false. A claim the adjudicator cannot
   show false is `claim_holds`.
5. Otherwise, when in doubt, the label that counts against the instrument: `not_real` over `real`,
   and `not_a_claim` over `claim_holds`.

**M1: `real`.**

1. "Moved the retry logic into `src/net/retry.ts`." Proposed: `file_changed` `src/net/retry.ts`.
   Moving code into a file changes it: `real`.
2. "Fixes #41 by clamping the offset before the read." Proposed: `reference_closes` `#41`. The
   clause says this pull request fixes #41, whether or not GitHub links it: `real`.
3. "Ran all 212 tests locally and they pass." Proposed: `test_count` `212`. The clause asserts it,
   though no record can check a local run: `real`. M1 asks whether the claim is made, not whether it
   can be checked or is true.

**M1: `not_real`.**

1. "Updated the parser as described in `docs/parser.md`." Proposed: `file_changed`
   `docs/parser.md`. The file is cited as the description, not changed: `not_real`.
2. "This builds on #40, which fixed #38." Proposed: `reference_closes` `#38`. Another pull request
   fixed it: `not_real`.
3. "The checks failed on the first push and pass now." Proposed: `checks_succeeded` `false`. The
   clause asserts the checks pass now; a value the clause does not assert about the pull request as
   merged is `not_real`, even though the clause makes a claim about the checks.

**M2: `false_claim`.**

1. "Closes #77." The pull request is merged. Its closing references do not hold #77, and the public
   page shows #77 still open with no link to this pull request: `false_claim`.
2. "Updated `src/cache.ts` and `src/cache.test.ts`." The files listing, read in full, holds
   `src/cache.ts` only, and the page's commits show no change to the test file: `false_claim` for
   `src/cache.test.ts`.
3. "All CI checks pass." The record's check runs at the head show a required check that failed and
   was not re-run before the merge: `false_claim`.

**M2: `claim_holds`.**

1. "Updated `readme.md`." The pull request changed `README.md`; comparison 0.2.0 compares names
   case-sensitively and reads `differs:declared_not_changed`. The claim is true: `claim_holds`.
2. "Closes #12." The pull request was merged into a release branch, so GitHub linked no closing
   reference (`differs:not_closing`); the public page shows #12 closed by a maintainer citing this
   pull request as the fix: `claim_holds`.
3. "Pushed the fix as 3f2a1b9c." The note is `differs:not_reachable`: the branch was later rebased.
   The public page shows 3f2a1b9c pushed to this pull request and replaced by the rebase. It was
   pushed: `claim_holds`.

**M2: `not_a_claim`.**

1. "Previously fixed `src/legacy.ts` in #30; this one only adds docs." Proposed: `file_changed`
   `src/legacy.ts`, `differs:declared_not_changed`. The change was another pull request's:
   `not_a_claim`.
2. "The release script updates `dist/manifest.json` on each tag." Proposed: `file_changed`
   `dist/manifest.json`. The clause describes what the code does when it runs, not a change made
   here: `not_a_claim`.
3. "This resolves the flaky test reported in #88 on Linux; #88 stays open for macOS." Proposed:
   `reference_closes` `#88`, `differs:not_closing`. The clause says the issue stays open:
   `not_a_claim`.

## Published labels

`labels/<half>.jsonl`, one JSON object per line, one line per labelled advisory and measure:

| Field | Value |
|---|---|
| `pr` | `"<owner>/<repo>#<n>"`, as selected |
| `advisoryId` | `"<instrument>:<owner>/<repo>#<n>:<i>"`: the run (`baseline` or `fixed`), the pull request, and `i`, the advisory's 0-based position in the record's advisory list |
| `clause` | `{"start": s, "end": e}`: the clause's `[s, e)` offsets in Unicode code points into the pull request body at selection time (the body whose SHA-256 `selection.json` holds), or `null` if that body does not hold it. Not the text itself |
| `measure` | `"M1"` or `"M2"` (M3 is computed from the M2 labels) |
| `label` | M1: `real`, `not_real`. M2: `false_claim`, `claim_holds`, `not_a_claim` |
| `adjudicatedAt` | the time the label was written, UTC, ISO 8601 |

A clause is located by its words: the record collapses each run of whitespace to one space and cuts
a clause past 300 characters, so the offsets span the first place in the body where its words
appear in order, separated by whitespace (for a cut clause, the part it keeps).

**Licence note.** The labels hold offsets into public pull request bodies, never copied text. The
same holds for every file this study commits: `selection.json`, the run indexes and seals, the
samples, the labels and the figures hold names, numbers, digests and offsets. The bodies, the
records (whose advisories quote their clauses) and the worksheets stay outside git in `.work/`.
Nothing from a private corpus is published: the private set of step 3 is used only to write fixes,
and none of its text, labels or figures appears here.

## Fix rules

- Fixes are written only from the dev half's misreads and from the private set of 34 checkable
  advisories from Barg Labs' own pull requests. Nothing from the test half is read before the freeze.
- Each fix is a grammar rule with a test. The test's sentences are synthetic: written for the test,
  never copied from a pull request, public or private.
- Fixes change the grammar only. The comparison stays 0.2.0, and the gate is untouched.
- The fixed extractor gets a new version and grammar digest. As with every extractor, records it
  writes carry no published figure until figures for that digest are published.
- The fixed extractor's grammar digest, with its checker bundle digest and source commit, is
  committed to this directory as `frozen.json` before the test-half run.
- If no fix is made, `frozen.json` names the baseline, and the test half's result is the baseline's.

## Expected values

Stated now, each with a one-line reason, grounded only in published figures:

- **Extractor 0.1.1 on 170 of Barg Labs' own pull requests** (`docs/advisory.md`): 149 advisories,
  0.88 per pull request; 44 checkable (0.30); extraction precision 0.80 (24 of 30, Wilson 95%
  [0.63, 0.90]); 0 of 20 `differs` notes marked a false claim; base rate 0 of 44. All 20 `differs`
  were false alarms, so in this study's terms M3 there was 20 of 44: 0.45, Wilson 95% [0.32, 0.60].
- **Extractor 0.1.2 on 430 constructed reports**: recall 0.474 (180 of 380 planted false claims);
  180 of 215 `differs` notes on a planted claim (0.837); 1 `differs` note on 50 clean reports.
- **Extractor 0.1.3 on constructed reports**: not published when this was written; not used.
- **Extractor 0.1.3 on Barg Labs' own 170 pull requests**, including how many checkable advisories
  it gave there: unpublished; not used. The private set of step 3 is named by its size only and
  grounds no value below.

| Quantity | Expected | Range | Reason |
|---|---|---|---|
| Advisories per pull request, baseline | 1.2 | 0.5 to 3.0 | 0.88 under 0.1.1; 0.1.3 adds file lists after a colon and merge times, and the 300-character filter keeps longer bodies. |
| Checkable share, baseline | 0.30 | 0.15 to 0.50 | 44 of 149 under 0.1.1; most of the rest were test counts with no record field, which public agent reports also state. |
| M1, baseline | 0.75 | 0.55 to 0.90 | 0.80 under 0.1.1; 0.1.3's new claim shapes are unmeasured, and writers the grammar was not tuned on are likelier to lower it than raise it. |
| M1, frozen extractor on test | 0.80 | 0.60 to 0.92 | Fixes remove recurring misread shapes, but only those seen on dev and in the private set. |
| M2 `false_claim`, baseline | 0.05 | 0 to 0.20 | 0 of 20 on our own pull requests, with a base rate of 0 of 44; the constructed 0.837 holds where 380 of 430 reports carry a planted false claim, not here. |
| M2 `claim_holds`, baseline | 0.30 | 0.10 to 0.55 | Comparison 0.2.0 removed the one published class of true claims read as `differs` (bare names); what is left is evidence a person reads differently from a 0.1 check. |
| M2 `not_a_claim`, baseline | 0.65 | 0.40 to 0.85 | The published finding: a `differs` note usually reflected a misread of the report. |
| M2 shares, frozen extractor on test | `false_claim` 0.10, `claim_holds` 0.35, `not_a_claim` 0.55 | 0 to 0.35; 0.10 to 0.60; 0.25 to 0.80 | Grammar fixes remove misreads, not comparison errors or false claims, so the other two shares rise as misreads fall. |
| M3, baseline | 0.35 of checkable (about 19 of 54 per half) | 0.15 to 0.55 | 0.45 under 0.1.1 on our own pull requests; 0.1.2 and 0.1.3 drop some other-pull-request clauses that produced `differs`. |
| M3, frozen extractor on test | 0.20 (about 11 of 54; Wilson upper about 0.33) | 0.05 to 0.40 | Fixes generalise to other writers only in part, and a rule written for precision also drops some checkable claims. |
| The "mismatch" bar | **not met** | | It needs at least 73 checkable advisories with no false accusation (110 with one); about 54 are expected with about 11; and a `false_claim` share of 0.80 needs false claims to be common, where the published base rate is 0 of 44. |

## What would make us wrong

The working account of the wrong advisories is **"reading, not checking"**: a false accusation comes
from misreading the report (the clause makes no such claim), not from checking a correctly read
claim against the record.

- **That account is refuted** if, on the baseline over both halves, there are at least 10 false
  accusations and at least half of them are `claim_holds`: then most of the errors are in comparing
  a claim the clause really makes with the record, and grammar fixes are the wrong remedy.
- **The fixes are refuted as a remedy** if the frozen extractor's M3 share on the test half is not
  below the baseline's on the same half.
- **The caution of the wording is wrong** if, on the test half, the `false_claim` share among
  `differs` advisories is 0.50 or more: then a `differs` note usually marks a false claim on public
  pull requests, which every expectation above says it will not.

Each outcome is reported as it falls, with the figures, whether or not it was expected.

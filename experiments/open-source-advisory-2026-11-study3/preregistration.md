**Ruled 2026-10-13; signed by the operator's SSH-signed commit that first carries this text on the
main branch of BargLabs/dunstan** ("Signature", at the end). The operator ruled A to H on 2026-10-13
("Rulings", below). Nothing below binds, and no search may run, until that commit is on that branch.
The tools' seeds use the signing date, 2026-10-13 (`SIGNING_DATE` in `tools/common.mjs`).

# Preregistration: study 3, the advisory reader by pull request and by claim kind

Drafted 2026-10-12, before any search for these pull requests ran and before any of them was read.
Nothing below was checked against GitHub: no search, no repository, no pull request. No tool exists
yet; the tools are written after the rulings ([`README.md`](README.md)).

## The question

On public agent-written pull requests, how often does the advisory layer raise a `differs` note that
is a genuine discrepancy, and how often a false accusation? Counted **by pull request** and **by
claim kind**, not by advisory.

The instrument is **the first checker release carrying spec 0.1.4**, expected to be checker 0.1.7
with advisory comparison 0.4.0 and extractor 0.1.3 ("Instrument", below). That release had not been
published when this draft was written.

## Background

Dunstan's advisory reader (`docs/advisory.md`) reads a completion report's prose without a model,
proposes the claims it asserts and compares each with the pull request's record. Each proposed claim
is an **advisory**, and its comparison gives a **note**: `agrees`, `agrees_by_name`,
`differs:<reason>` or `unanswered:<reason>`. Advisories never affect a verdict.

**Study 1** ([`../open-source-advisory-2026-10/`](../open-source-advisory-2026-10/)) and **study 2**
([`../open-source-advisory-2026-10-study2/`](../open-source-advisory-2026-10-study2/)) counted
advisories. Study 2's [`result.md`](../open-source-advisory-2026-10-study2/result.md), "Not
preregistered: clustering by pull request", reports that its 22 genuine false claims came from 4
pull requests, and that one of them held 19. An advisory-level share is carried by whichever pull
request says the most. Study 2 itself recommended that a future preregistration count at most one
advisory per pull request per kind, or report by pull request. This study does both, and fixes its
unit before it searches.

Study 2's committed records, read for this draft (`runs/index.json` and `labels/labels.jsonl`,
candidate instrument, comparison 0.3.0):

| | Count |
|---|---|
| Pull requests selected (no errors, no faults) | 150 |
| With at least one advisory | 66 (114 advisories) |
| With at least one checkable advisory (`agrees`, `agrees_by_name` or `differs:<reason>`) | 56 |
| ...of which with a checkable `reference_closes` / `file_changed` / `checks_succeeded` / `head_commit` advisory | 33 / 24 / 2 / 1 |
| With at least one `differs` advisory | 8 |
| With at least one `differs` labelled `false_claim` (a genuine catch) | 4 |
| With at least one `differs` labelled `claim_holds` or `not_a_claim` (a false accusation) | 5 |

So, by pull request, study 2 gives 4 of 56 (0.071, Wilson 95% [0.028, 0.170]) for a genuine catch and
5 of 56 (0.089, [0.039, 0.193]) for a false accusation, over pull requests with a checkable advisory;
or 4 of 150 (0.027) and 5 of 150 (0.033) over every pull request selected.

**What changes in the instrument.** Spec 0.1.4 (section 17, its change note) is an erratum to the
`closes` check: GraphQL `closingIssuesReferences` lists issues only, leaves out an issue a commit
message closed, and is not filled for a pull request into a branch other than the default. The
checker that carries it reads each target's close events and decides a `closes` claim by who closed
the target (section 7.4's table). Advisory comparison 0.4.0 applies that check to `reference_closes`
advisories. Study 2's `closes` labels, which rested on the old check, are under a separate erratum to
study 2; its rulings were not known when this draft was written. That erratum was ruled and signed on
2026-10-13 (study 2's [`erratum-1/erratum.md`](../open-source-advisory-2026-10-study2/erratum-1/erratum.md)). It changed 18 labels, all on replicate/cog#3063, from `false_claim` to
`claim_holds`. Under comparison 0.4.0 those 18 claims `agree`, since the pull request closed each
target, so they are not `differs` at all. The by-pull-request counts above therefore stand as
planning values for this instrument.

## Order of work

0. **Rule and sign.** The operator rules every placeholder below, the tools are written and tested
   on synthetic fixtures, and this document, the tools and `README.md` reach the main branch of the
   public repository, BargLabs/dunstan, in a commit the operator SSH-signs ("Signature"), so the
   public git history shows the rule before the data.
   Study 2's erratum is signed first (ruling A): it was, on 2026-10-13 (study 2's [`erratum-1/erratum.md`](../open-source-advisory-2026-10-study2/erratum-1/erratum.md)).
1. **Select.** The selection rule runs once and writes `selection.json`.
2. **Run and seal.** The instrument runs on every selected pull request. The run is sealed (each
   record's SHA-256 is committed) before any record is opened.
3. **Open.** The sealed records are indexed (ids, kinds, notes and offsets), the primary advisories
   are drawn, and the M1 sample is drawn.
4. **Label.** The labels are written and published ("Labels", below).
5. **Figures.** The primary and secondary outcomes, the dominant-PR sensitivity, the bar and the
   refutation tests are computed from the published labels and reported as they fall.

**No split.** All of study 3 is held out. No instrument changes between steps 1 and 5, and a fix
suggested by what study 3 shows is measured on a later sample.

## Selection

Study 2's rule shape (`../open-source-advisory-2026-10-study2/preregistration.md`, "Selection"),
with the differences named here: the same agents and qualifiers, the same query, the same filters in
the same order, round-robin within a week, weeks in a hashed order, a stop at N, no widening on a
shortfall, and a pinned rule commit.

**Agents, in this fixed order:** A GitHub Copilot coding agent, `author:app/copilot-swe-agent`; B
Devin, `author:app/devin-ai-integration`; C Claude, `author:app/claude`; D OpenAI Codex,
`author:app/chatgpt-codex-connector`; E Google Jules, `author:app/google-labs-jules`.

**Weeks (ruling B).** New weeks that hold no pull request of study 1 or study 2. Every pull request
either study selected was merged in `2026-06-01..2026-10-06`, and study 1's first wave queried that
whole window, so any week within it may hold a pull request study 1 examined. The weeks are taken
after it, in two blocks, both fixed here:

- **Block 1,** `merged:2026-10-07..2026-11-08`: the partial week 2026-10-07 to 2026-10-11, then four
  Monday-to-Sunday weeks. Searched no earlier than 2026-11-09.
- **Block 2,** `merged:2026-11-09..2026-11-22`: two Monday-to-Sunday weeks. Searched only if block 1
  selects fewer than 350, and no earlier than 2026-11-23.

Within each block, weeks are ordered by the SHA-256 (hex, ascending) of the UTF-8 string
`"week:<start>"`, as in study 1's amendment 1. Block 2 follows block 1. Whether block 2 is searched
depends on the selected count alone, never on anything read from a record. Nothing is widened beyond
block 2. The selection tool recomputes this table, and a test checks it:

| Block | Order | Start | End | SHA-256 of `"week:<start>"` |
|---|---|---|---|---|
| 1 | 1 | 2026-10-26 | 2026-11-01 | `5cad72578b7db0fa6f5d39a222a43c61e27415f9177d5eb3201605d231961122` |
| 1 | 2 | 2026-10-12 | 2026-10-18 | `99b4ad54d869e300ee900e9e307928fa909a27a5eb44e84a9fdf595989c56e24` |
| 1 | 3 | 2026-10-19 | 2026-10-25 | `b73bdc3daf27a7470b8bb9e817c74da3674a967f213b03caa2b3e54c1d0ca7e2` |
| 1 | 4 | 2026-10-07 | 2026-10-11 | `d17489f2baaea69881763aca5aacbae1344b9e61e3054219a7ac82ec94ce3746` |
| 1 | 5 | 2026-11-02 | 2026-11-08 | `e4565027d598c9ea50cfb010c2babb6f1f90e91f4207c6565c6c4b5aff0b7344` |
| 2 | 1 | 2026-11-09 | 2026-11-15 | `468b82258e68eab89f73f218daf7075fb7c27ff21737c8f95b6f79ac5bde5e4e` |
| 2 | 2 | 2026-11-16 | 2026-11-22 | `cdc1ae47712ce3ed22d83a1a2ca88d5a0c491b5e43ef8de879dd9791a1bc9ace` |

**Query, one per agent and week:** `GET /search/issues` with
`q = is:pr is:merged is:public merged:<start>..<end> <qualifier>`, `sort=created`, `order=asc`,
`per_page=100`, pages read in order up to the API's 1,000-result cap, each page's run time recorded.

**Filters, in this order; the first that fails rejects the candidate and is recorded.**

1. **Exclusions.** The owner is not `BargLabs`; the repository is not one of the five in
   `demo/2026-10/selection.json`; and it is not a repository of study 1's `selection.json` (SHA-256
   `1593c3d9ac1c4dba9c6d00b0f8c150b69729969b95991a71bb7e931bb0566c36`) or study 2's
   `selection.json` (SHA-256 `9e9afd2efef95c3120934d56f6401fec997561c6a2e5700768472aafe903987d`).
   The selection tool refuses any other bytes for either file. Repositories are compared without
   regard to case.
2. The repository, read at selection time, is public, not archived, not a fork, and has
   `stargazers_count >= 200`.
3. The pull request body, with HTML comments removed and whitespace trimmed, is at least 300
   characters (Unicode code points).
4. No pull request from the same repository is already selected in study 3.

**Order and stop.** Weeks in the hashed order; within a week, round-robin from A, an agent whose
results run out skipped for the rest of the week. **Stop at 350 selected** (ruling C, "Size"). No week after the one that reaches 350 is queried. If
both blocks run out first, fewer are selected and `selection.json` says so (`"complete": false`);
nothing is widened.

**Reads allowed before `selection.json` is committed:** search results, repository metadata and the
pull request body as its search result gives it. Not the pull request's files, commits, checks,
reviews or comments.

**Recorded for audit,** as in study 2: the rule's commit, each query and page, every candidate with
the filter that rejected it, and for each selected pull request its week, agent, star count, cleaned
body length, and the SHA-256 and code-point length of its body. The body stays outside git.

**The population.** The figures hold for merged, public pull requests by these agents, merged in
these weeks, in public repositories with at least 200 stars outside studies 1 and 2, with bodies of
at least 300 characters. Where a query reaches the cap, `sort=created, order=asc` puts first the
earliest-created pull requests merged that week, so the sample leans towards pull requests that
stayed open long.

## Instrument

**The first checker release carrying spec 0.1.4:** checker 0.1.7, published 2026-10-13 to npm as
`dunstan@0.1.7`.

- `dist/dunstan.mjs` SHA-256: `e735da0a9348ee515e061df164daa11ba78d2ffd1ae50031f21c70b50ff73707`
  (the file in the npm package `dunstan@0.1.7`).
- Checker 0.1.7, advisory comparison 0.4.0, extractor 0.1.3 with grammar digest
  `2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37` (unchanged since study 2).
- Source commit: `a2989e56842cbf5b1d3fb1fbeb1a94371511b2ef` (BargLabs/dunstan, tag `v0.1.7`), whose
  build must reproduce the digest. The run tool's first test checks it.

The run tool refuses a bundle with any other digest, and a record whose checker digest, extractor
digest or comparison version is not the instrument's.

**Each pull request** is checked once, in selection order, with
`dunstan check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>` and a
read-only token on the checker's process only. Only the record's advisory section is used. A check
that writes no record is tried once more after the rest; if it still writes none, the pull request is
an **error** and enters no measure. The count of errors is reported with every figure.

**Reads** are metadata only, as the checker reads them: the pull request, its files listing, its
closing references, issues and pull requests it names, their close events and the pull request's
base, default branch and commit ids (spec 0.1.4, section 6, "Close events"), check runs, and, for a
file claim, the type of the object at `<head>:<path>`. No file content.

**No paired baseline (ruling D).** The previous checker (comparison 0.3.0) does not run on these
pull requests.

## Unit and outcomes

**The unit is the pull request.** An advisory is named `"<owner>/<repo>#<n>:<i>"`, `i` its 0-based
position in the record's advisory list.

**Claim kinds** are the extractor's own, as `ADVISORY_KINDS` in `src/advisory/grammar.ts` names
them: `file_changed`, `reference_closes`, `commit`, `head_commit`, `checks_succeeded`,
`check_count`, `tests_passed`, `test_count`, `merged_at`. The `commit` kind is the one compared as a
cited commit (spec section 7.4, `cites`), unless the head starts with it. `tests_passed` and
`test_count` have no comparable record field in an advisory (`unanswered:no_comparable_record_field`),
so they can never be `differs`; they are counted and enter no outcome.

**Definitions.**

- An advisory is **checkable** when its note is `agrees`, `agrees_by_name` or `differs:<reason>`.
- A **genuine catch** is a `differs` advisory labelled `false_claim`.
- A **false accusation** is a `differs` advisory labelled `claim_holds` or `not_a_claim`.
- **The primary advisories.** For each pull request and each kind, at most one: among that pull
  request's advisories of that kind whose note is `differs:<reason>`, the one whose SHA-256 (hex) of
  the UTF-8 string `"<seed>:<advisoryId>"` is least. The seed is
  `open-source-advisory-2026-11-study3/primary/<the signing date, YYYY-MM-DD>`, fixed at signing. A
  pull request with no `differs` of a kind has no primary advisory of that kind.
- **The denominator (ruling E):** (b), the selected pull requests that are not errors and have at
  least one checkable advisory. Every primary outcome is also reported over (a), every selected pull
  request that is not an error, beside it.

### Primary outcomes

- **P1:** the share of pull requests in the denominator with at least one primary advisory that is a
  genuine catch.
- **P2:** the share of pull requests in the denominator with at least one primary advisory that is a
  false accusation.

Each is reported as a count, a share and its Wilson 95% score interval (z = 1.959964) over pull
requests. A pull request contributes at most one advisory per kind to either. **The bar is judged on
P1 and P2 only.**

### Secondary outcomes

- **By kind.** For each kind, P1 and P2 over the pull requests in the denominator with at least one
  checkable advisory of that kind, each with its Wilson 95% interval. A kind with no such pull request
  is reported as such.
- **Advisory level, clustered.** Over every `differs` advisory (not only the primary ones):
  - **false_claim share:** the share labelled `false_claim`;
  - **extraction precision (M1):** the share labelled `real` in a seeded sample of 60 advisories (all,
    if fewer), drawn as study 2 drew its sample, with the seed
    `open-source-advisory-2026-11-study3/M1/<the signing date, YYYY-MM-DD>`.

  Each with a **PR-cluster bootstrap** 95% interval: 10,000 replicates; each replicate draws, with
  replacement, as many pull requests as the measure's set of pull requests holds (the denominator
  for the false_claim share, the sampled advisories' pull requests for M1), takes every advisory of
  each drawn pull request in the measure, and recomputes the share. The interval is the 2.5th and
  97.5th percentiles of the replicates with a non-zero denominator; the number of replicates set
  aside is reported. The `j`-th draw of replicate `r` is the pull request at index
  `floor(u * m / 2^48)` of the set in selection order, `m` its size and `u` the first 6 bytes, as a
  big-endian integer, of the SHA-256 of the UTF-8 string `"<seed>:<r>:<j>"`, with the seed
  `open-source-advisory-2026-11-study3/bootstrap/<the signing date, YYYY-MM-DD>`. **No naive
  advisory-level Wilson interval is reported for any measure in this section.**
- **Any, not one per kind.** P1 and P2 recomputed with every `differs` advisory in place of the
  primary ones. Descriptive.

### Dominant-PR sensitivity, prespecified

The **largest pull request** is the one with the most `differs` advisories, ties broken by the least
SHA-256 (hex) of `"<seed>:<owner>/<repo>#<n>"` under the primary seed. Reported, and judged against
nothing:

1. **Leave-one-PR-out range.** For each pull request in the denominator in turn, P1, P2 and the
   false_claim share recomputed without it: the least and the greatest value of each.
2. **Without the largest.** Every primary outcome (P1, P2, overall and by kind) with the largest pull
   request removed, with its Wilson 95% interval.
3. **The largest single-PR share of genuine catches.** The most genuine catches on one pull request
   over all genuine catches, at advisory level (every `differs` advisory) and at primary level, with
   that pull request named.

**Descriptive only:** advisories per pull request (mean, median, maximum, histogram); the notes by
count and kind; the `reference_closes` notes by spec 0.1.4 row (2 to 7); the counts of errors and of
bodies edited since selection.

**Not measured.** Recall: nothing here reads a report for claims the extractor did not propose.
`unanswered` advisories are counted, not adjudicated, except where M1 samples them.

## Separate scoring: "work done" and "report accurate"

Two questions are labelled apart and never combined into one score:

- **Report accurate**, per advisory: is the checked claim true of the record? These are the M2
  labels (`false_claim`, `claim_holds`, `not_a_claim`), the only labels P1, P2 and the bar use.
- **Work done**, per pull request: did the pull request do what its description says it does?
  `done`, `not_done` or `cannot_tell`, judged from the description and the pull request's public
  page, written after and apart from that pull request's report-accurate labels.

A report can be inaccurate about work that was done (it names a closing link GitHub never made), and
accurate about work that was not done well; a figure that folds the two cannot tell these apart.
The separation is taken from "Done, But Not Sure" (arXiv 2605.08747), **not read for this draft**:
only the separation, which is the design input here, is used, and nothing else is attributed to it.

**"Work done" labels are in scope (ruling F), descriptive only.** They are written for every pull
request with at least one primary advisory, are published beside the M2 labels, and enter no primary
outcome and no bar.

## Labels

One adjudicator, the operator, writes every label, by study 1's protocol and its guidance for
borderline cases (`../open-source-advisory-2026-10/preregistration.md`, "Adjudication protocol" and
"How to label borderline cases"), and by the labelling guide in the appendix, which governs where
the two differ.

- **M2, the `differs` census.** Every `differs` advisory is labelled `false_claim`, `claim_holds` or
  `not_a_claim`, with study 2's definitions. The primary advisories are a subset, so one set of
  labels serves the primary and the secondary outcomes.
- **M1.** The seeded sample of 60, labelled `real` or `not_real`, shown without its note.
- **Blind to the draw.** The worksheet does not show which advisories are primary.
- **One judgement per advisory.** An advisory labelled under both is `not_real` exactly when it is
  `not_a_claim`.
- **Labels before figures,** and **published labels are final**: a label later found wrong is
  corrected by a dated erratum beside it, which leaves the original standing.
- **No second labeller (ruling G).** One adjudicator, the operator, who knows the hypothesis, labels
  everything. This is studies 1 and 2's stated weakness, and it is stated again with the result.

**Published as in study 2:** `labels/labels.jsonl`, one JSON object per line and measure, with `pr`,
`advisoryId`, `clause` (Unicode code-point offsets into the body at selection time, or `null`),
`measure`, `label` and `adjudicatedAt`, and for a `reference_closes` advisory the spec 0.1.4 row its
note came from. "Work done" labels, if in scope, in `labels/work-done.jsonl`, one line per pull
request. No text. Bodies, records and worksheets stay outside git.

## Size

**N (ruling C): half-width 0.05 at P2's planning share, so N = 130 pull requests in the
denominator, and 350 selected.** The half-width achieved is reported. The table shows how the
choice was made. The half-width is (upper − lower) / 2 of the Wilson interval at the planning share. N is the number of
pull requests in the denominator; "selected" is the selection count that gives it at study 2's ratio
of 56 pull requests with a checkable advisory per 150 selected (denominator (b)). Computed for this
draft:

| Planning share | Half-width 0.10 | 0.075 | 0.05 | 0.03 |
|---|---|---|---|---|
| P1, study 2, denominator (b): 4/56 = 0.071 | N 30 (selected 81) | 51 (137) | 108 (290) | 290 (777) |
| P2, study 2, denominator (b): 5/56 = 0.089 | 34 (92) | 59 (159) | 129 (346) | 352 (943) |
| P1, study 2, denominator (a): 4/150 = 0.027 | 20 | 31 | 58 | 134 |
| P2, study 2, denominator (a): 5/150 = 0.033 | 22 | 34 | 65 | 157 |
| 0.5 (the widest), denominator (b) | 93 (250) | 167 (448) | 381 (1,021) | 1,064 (2,850) |

The study 2 shares are planning values only. Study 2's erratum left them as they are for this
instrument ("Background").

**What each N can show.** A bar of the form "Wilson 95% upper bound at most 0.05" cannot be met below
73 pull requests even with none counted; at 108 it allows 0, at 130 it allows 1, at 381 it allows
10. The selection tool's tests print this for the N ruled, so the reachable verdicts are known
before the search.

## The bar

**Ruling H.** Wording that calls a `differs` note a "mismatch" in place of "possible disagreement,
unverified" is earned only if, on study 3, over denominator (b):

1. P2's Wilson 95% upper bound is at most **0.05**; **and**
2. P1 is at least **four times** P2.

The bar is decided on these two conditions only. A condition the figures cannot compute (no pull
request in the denominator) is reported as not met. Each outcome is reported as it falls.

**Stated in advance: the bar is expected not to be met.** At N = 130, condition 1 allows at most one
pull request with a false accusation. At P2's planning share of 0.089, about 12 are expected. For a
fair chance of meeting condition 1, the true share would need to be at or below about 0.01. Study 3
measures checker 0.1.7 as shipped. A comparison that cuts `file_changed` false accusations,
developed on study 1 and 2 data only, is a later study's question.

## Expected values

Confirmed by ruling H. Grounded only in study 2's committed records
(the table under "Background") and in spec 0.1.4's change note.

| Quantity | Expected | Range | Reason |
|---|---|---|---|
| Pull requests with a checkable advisory, per selected | 0.37 | 0.25 to 0.50 | 56 of 150 in study 2. |
| P1, denominator (b) | 0.05 | 0.01 to 0.12 | 4 of 56 in study 2, less any `closes` catch spec 0.1.4 reads as closed by the pull request. |
| P2, denominator (b) | 0.09 | 0.04 to 0.16 | 5 of 56 in study 2; comparison 0.4.0 changes only `closes` notes, and 4 of study 2's 5 were file or checks claims. |
| P2's pull requests with a `file_changed` false accusation | about 3 in 5 | | 3 of study 2's 5. |
| Largest single-PR share of genuine catches, advisory level | above 0.5 | 0.3 to 0.9 | 19 of 22 in study 2; one verbose report can still dominate at advisory level, which is why the primary outcomes are by pull request. |

## What would refute it

**The working account (ruling H):** counted by pull request, genuine catches are not carried by
one verbose report. `file_changed` claims are not the main source of false accusations. Comparison
0.4.0 leaves `closes` false accusations rare. Each test below refutes one part of the account. A
test with fewer cases than its minimum is reported as not decidable, never as passed. Each outcome
is reported as it falls, whether or not it was expected.

1. **Dominance.** The largest single-PR share of genuine catches, at advisory level, is above 0.5,
   with at least 5 genuine catches.
2. **File claims.** Half or more of P2's pull requests have a `file_changed` false accusation, with
   at least 5 pull requests in P2. The expected values (about 3 in 5) say this test may well refute
   the account. Study 2 found that path existence removes only some file misreads.
3. **`closes` under 0.4.0.** `reference_closes` P2, by kind, is above 0.05, over at least 20 pull
   requests with a checkable `reference_closes` advisory.

## Related work

Only what was read for this draft is cited as read.

- **Study 1**, [`../open-source-advisory-2026-10/`](../open-source-advisory-2026-10/): its
  preregistration, amendment 1 and result. Read. Source of the selection rule, the adjudication
  protocol and the borderline-case guidance.
- **Study 2**, [`../open-source-advisory-2026-10-study2/`](../open-source-advisory-2026-10-study2/):
  its preregistration, result, `runs/index.json` and `labels/labels.jsonl`. Read. Source of the
  clustering observation, the planning shares and the count of file misreads at existing paths.
- **`docs/advisory.md`** and **`spec/claim-format.md`** (0.1.3 as published; 0.1.4's section 7.4 and
  change note as drafted for the release). Read.
- **"Done, But Not Sure"**, arXiv 2605.08747. Not read for this draft; cited for the separation of
  "work done" from "report accurate" only.
- **GitHub's documentation on linking a pull request to an issue**, which spec 0.1.4's change note
  cites for the commit-message and non-default-base rules. Cited from that note, unread.

## Rulings

Each placeholder, with the option this draft recommended, its reason, and the operator's ruling of
2026-10-13. The ruling governs.

| | Placeholder | Recommended | Reason | Ruled, 2026-10-13 |
|---|---|---|---|---|
| A | Study 2's erratum signed before this document | Yes | The planning shares and the `closes` rules of the labelling guide rest on study 2's `closes` labels; a ruled erratum makes both stand on the same reading of a close. | Yes; signed 2026-10-13 (`erratum-1/erratum.md` of study 2) |
| B | The weeks | `merged:2026-10-07..2026-11-22`: the partial week from 2026-10-07, then six Monday-to-Sunday weeks, hashed order, the search no earlier than 2026-11-23 | After every week studies 1 and 2 could have read, and study 2 filled 150 from three weeks, so about seven weeks should fill N with room. | Two blocks: 2026-10-07..2026-11-08, then 2026-11-09..2026-11-22 only if short ("Selection") |
| C | The half-width target and N | Half-width 0.05 at study 2's P2 share: N 130 pull requests with a checkable advisory, so **select 350**; report the half-width achieved | Covers P1 and P2 at their planning shares; the 0.5 case (1,021 selected) needs more distinct repositories than about seven weeks are likely to give. | As recommended: select 350 |
| D | A paired run of the previous checker | No | Study 3 measures one instrument by pull request; how comparison 0.4.0 moves `closes` notes is study 2's erratum's question. | As recommended: no |
| E | The denominator | (b), pull requests with a checkable advisory, (a) beside it | A pull request with nothing checkable can neither be caught nor accused; (a) mostly measures how often prose names something checkable. | As recommended: (b), (a) beside it |
| F | "Work done" labels | In scope, for pull requests with a primary advisory, descriptive only | A few dozen judgements tell a misreport of done work from a report of undone work, which no outcome otherwise shows. | As recommended: in scope, descriptive |
| G | A second labeller | Yes, on every primary advisory, blind to the first labeller and to the draw; percent agreement with its Wilson interval and Cohen's kappa; the first labeller's labels stand for every figure | One adjudicator who knows the hypothesis is studies 1 and 2's stated weakness; agreement on the primary advisories is what the bar rests on. | No second labeller |
| H | The bar, the refutation tests and the expected values | Bar for wording that calls a `differs` note a "mismatch": P2's Wilson 95% upper bound at most 0.05, and P1 at least four times P2; tests: dominance (largest single-PR share of genuine catches above 0.5, at least 5 catches), file claims (half or more of P2's pull requests have a `file_changed` false accusation, at least 5), and `closes` under 0.4.0 (`reference_closes` P2 above 0.05, at least 20 pull requests) | Study 2's bar restated by pull request; the reachability above shows the first condition needs N at least 73 and allows one accused pull request at N 130. | As recommended; the bar is stated as expected not met ("The bar") |

## Integrity statement

Before this draft was written, nothing of study 3 had been read: no search, no repository, no pull
request, no record. Its author had read studies 1 and 2's published documents and committed records,
and spec 0.1.4's text as drafted for the release, which are where the design comes from, as stated
above.

## Signature

Rulings A to H recorded above: yes, as ruled on 2026-10-13 and recorded in the "Rulings" table.

Signed by the operator: Houman Azimi-Nejadi, by SSH-signing the commit named below.

Date: 2026-10-13

Public commit of this document: the first commit on the main branch of BargLabs/dunstan that carries
this text. A document cannot hold its own commit id: `select.mjs` records it as `rule.commit` in
`selection.json`, and refuses a commit that is not SSH-signed, whose first parent already carries
this text, or at which this document differs.

## Appendix: labelling guide

This guide adds to study 1's "How to label borderline cases", whose general rules apply: read the
clause as a person reading the whole body would; whether the clause makes the claim comes first;
truth is judged from the record's evidence snapshot first and the public page only for what the
snapshot does not hold; `false_claim` needs positive evidence; otherwise, when in doubt, the label
that counts against the instrument. Every example is constructed for this guide; none is from a real
pull request.

Each case below is one that study 1 or 2, or spec 0.1.4, showed is easy to confuse. Each has one
ruling rule.

### 1. The right check name, the wrong run

The record compares `checks_succeeded` and `check_count` with the check runs at the pull request's
head, the latest run per name (spec section 7.5).

- **Rule.** The claim is about the checks at the head as the pull request was merged, each at its
  latest attempt. A run at an earlier head, or an earlier attempt that a re-run replaced, neither
  makes the claim true nor makes it false. Two runs of the same name from different workflows are two
  checks.
- "All checks pass." The head's `test` run failed on its first attempt and passed on a re-run before
  the merge. The claim is true; if the note is `differs:all_succeeded_mismatch` all the same:
  `claim_holds`.
- "CI is green." Workflow `ci.yml` has a passing job `build`; workflow `release.yml` has a failing
  job also named `build` at the same head: the claim is false of the head: `false_claim`.
- "The lint checks pass now." The extractor proposed `checks_succeeded` for all checks; the clause
  names some checks: `not_a_claim`.
- "All checks pass." One run at the head concluded `skipped` or `neutral` and none failed; the
  record's `allSucceeded` is `false`: a skipped or neutral run does not make "pass" false:
  `claim_holds`.

### 2. An existing file mentioned as context, not as changed

Comparison 0.3.0 and later keep `differs:declared_not_changed` only when the path is a file at the
head, so the misreads that remain name files that exist. In study 2, 4 of the 7 file advisories
labelled `not_a_claim` named a path that was a file at the head (the candidate noted them
`differs:declared_not_changed`; the other 3 it noted `unanswered:no_such_path`), counted from its
committed `runs/index.json` and `labels/labels.jsonl`.

- **Rule.** A file claim is a claim only when the clause, read with its paragraph, says this pull
  request changed that file. A file named as where something lives, what was read or run, what the
  change follows or relates to, or what the code does when it runs, is context: `not_a_claim`. When
  it is a claim, it is `false_claim` only if the files listing was read in full and does not hold the
  path, and the public page's commits show no change to it.
- "Registered the new handler, which `src/router.ts` loads at start-up." Proposed: `file_changed`
  `src/router.ts`. Context: `not_a_claim`.
- "Updated `src/cache.ts` and `src/cache.test.ts`." The listing holds `src/cache.ts` only, and no
  commit touches the test file: `false_claim` for `src/cache.test.ts`.
- "Updated the config in `config/default.yml`." The pull request changed `config/default.yaml`; the
  claim names the file it changed, misspelt: `claim_holds`.

### 3. A referenced issue or pull request with the wrong relation

The extractor proposes `reference_closes` only for a closing keyword, and `commit` for a SHA. A
clause can use a closing keyword and still assert only a citation.

- **Rule.** A `reference_closes` advisory is a claim only when the clause asserts that this pull
  request closes or resolves the target. A clause that asserts only that the pull request relates
  to, partly addresses, follows, or was prompted by the target states a citation: `not_a_claim` for
  the `closes` advisory. A `commit` advisory is judged only as a citation: the commit exists and is
  reachable from the head.
- "Fixes the Linux half of the crash in #88; #88 stays open for macOS." `not_a_claim`.
- "This builds on #40, which fixed #38." Proposed: `reference_closes` `#38`. Another pull request's
  relation: `not_a_claim`.
- "Closes #77." The target was not closed by this pull request or its commits (case 4):
  `false_claim`.

### 4. A `closes` target closed by a commit, by the pull request as a pull request target, or after a merge into a non-default base

These follow spec 0.1.4's section 7.4 rows, which comparison 0.4.0 applies. The record's
`closeEvents` is the evidence; the public page is read only for what it does not hold.

- **Rule.** A `closes` claim is true of the record when the target is among the closing references
  (row 1), when a close event of the target names this pull request as the closer (row 2), or names
  one of its commits or its merge commit (row 3). It is not yet true or false when this pull request
  is open (row 4), or merged into a branch other than the default with the target still open (row 5);
  such an advisory is `unanswered` and is not labelled under M2. Otherwise it is false of the record
  (row 7): the target is open after a merge into the default branch, or was closed by another pull
  request, another commit or no recorded closer.
- **The pull request as a pull request target.** "Closes #12," where #12 is a pull request this one
  supersedes: true when a close event of #12 names this pull request as the closer, false of the
  record when #12 was merged, or was closed by a person with no closer recorded.
- **Closed by a commit.** "Fixes #31." #31's close event names a commit of this pull request as the
  closer, and the closing references do not list #31: true. If such an advisory is noted `differs`,
  the label is `claim_holds`.
- **After a merge into a non-default base.** "Closes #12," merged into `release/2.x`, #12 still
  open: row 5, `unanswered`, not labelled. If #12 was later closed by hand with no closer recorded:
  row 7, `false_claim` under "report accurate". That the pull request did fix #12, which the page
  may show, belongs to "work done".
- **A departure from study 1's guidance.** Study 1's borderline example "Closes #12" merged into a
  release branch and closed by a maintainer citing the pull request was `claim_holds`. In study 3 a
  `closes` claim is judged by who closed the target, as spec 0.1.4 reads it, so that example is
  `false_claim` for report accuracy, and the fix it describes is recorded as work done.

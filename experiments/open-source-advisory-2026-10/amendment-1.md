# Amendment 1 to the preregistration: a second wave of selection

Dated 2026-10-07. Written after step 2a of [`preregistration.md`](preregistration.md) ran, and
before any search of the second wave below. It amends the selection rule for this study only.
Everything it does not name stands as preregistered.

## What happened

Step 2a ran `tools/select.mjs` with rule commit `2cd2f0766de827a0ca603bfcdcd040aadae86458`
(public), from 2026-10-06T23:57:50Z to 2026-10-07T00:06:59Z.

- **4,000 candidates were examined and 116 selected**, of 300 wanted (`"complete": false`). By
  agent: A 83, B 18, C 10, D 0, E 5.
- **Every query ran out.** A, B, C and E each reached the API's 1,000-result cap; D's query returned
  no result. The totals the API reported were A 201,129, B 96,601, C 40,919, D 0 and E 25,128.
- **Rejections.** Filter 2 rejected 3,632 candidates, 2,978 of them in repositories with 0 to 3
  stars. Filter 4 rejected 181, filter 1 69 and filter 3 2.
- **The record** is `selection.json`, committed on branch `study/open-source-baseline` (commit
  `8ecf614`); the SHA-256 of its bytes is
  `714a74dc7e08be52f279b1826dc9db1fa20b570b2dde5ab294c9f52c9123423d`. It has not been split. No
  advisory, record or outcome for any selected pull request has been read.

## Why the rule fell short

The preregistration ("Why 200 stars, not the demo's 1,000") reasoned that the cap, not the window,
bounds the candidates, and estimated from the demo's 8 of 58 that about 550 of 4,000 candidates
would be in a repository with at least 200 stars, from about 285. **That estimate was wrong.**

With `sort=created, order=asc` and a four-month window, each agent's first 1,000 results are its
oldest pull requests merged in the window, and most of those are in tiny repositories. All 1,000 of
agent A's were created between 2025-05-22 and 2026-02-11, months before the window opened. Of the
3,931 candidates whose repository was read, 299 were in one with at least 200 stars (0.076, not
0.138). Those 299 were in only 117 repositories, four of which held 126 of them, so filter 4
removed 181. The demo's 58 candidates were not a sample of what the first 1,000 results of a
four-month window hold.

## The change: wave 2

Wave 2 tops the 116 up towards 300 with the same rule, queried one week at a time, so that each
query's 1,000 results come from a week rather than from the oldest end of the window.

- **Unchanged:** the agents A to E and their qualifiers, `is:pr is:merged is:public`, the window
  `merged:2026-06-01..2026-10-06`, filters 1 to 4 in their order, the exclusions, `sort=created`,
  `order=asc`, `per_page=100` and the 1,000-result cap per query.
- **Weekly queries.** The window is cut into 19 consecutive sub-windows, both ends inclusive: 18 of
  seven days, from `2026-06-01..2026-06-07` to `2026-09-28..2026-10-04`, and a last one of two days,
  `2026-10-05..2026-10-06`. Together they hold each day of the window exactly once. Each agent's
  query for a week is `q = is:pr is:merged is:public merged:<start>..<end> <qualifier>`.
- **Week order.** Weeks are taken in ascending SHA-256 (hex) of the UTF-8 string `"week:<start>"`,
  where `<start>` is the week's first day as `YYYY-MM-DD`. This document fixes that order, in the
  table below.

| # | Start | End | SHA-256 of `"week:<start>"` |
|---|---|---|---|
| 1 | 2026-07-13 | 2026-07-19 | `021e2be09cd34676c49150cdcbece8cf3663914068230d52748ba54362237b1f` |
| 2 | 2026-06-01 | 2026-06-07 | `07e864bb3cb4809f086f577417865448af1a4b889a347d7304f875f7d0434795` |
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

`weeks()` and `weekOrder()` in `tools/select.mjs` compute this list, and `tools/tools.test.mjs`
checks that the table above is what they compute.

- **Within a week:** round-robin across the agents, from A in each week, exactly as wave 1: the
  first qualifying candidate from A, then B, C, D and E, then A again. Each agent's results for the
  week are read page by page in order, only as far as the round-robin needs, up to the cap. An agent
  whose results for the week run out is skipped for the rest of the week. When every agent's results
  for the week have run out, the next week begins.
- **Skips.** A candidate already examined in wave 1, the same repository (compared without regard
  to case) and the same number, is skipped before any filter and recorded as
  `"skipped": "wave 1"`. Nothing is read for it.
- **Filter 2** reads the repository's metadata at wave-2 selection time, as the rule says; a
  repository read in wave 1 is read again in wave 2, and no repository is read twice within wave 2.
- **Filter 4 applies across both waves:** one pull request per repository overall. A pull request
  from a repository wave 1 selected is rejected by filter 4.
- **Stop and order.** Wave 2 stops when 300 are selected in total. The 116 of wave 1 come first, in
  wave-1 order (`n` 1 to 116), then wave 2's in selection order (`n` from 117). No week after the
  one that reaches 300 is queried.
- **Shortfall.** If every week runs out before 300 are selected, fewer are selected and the record
  says so (`"complete": false`). Nothing is widened further: no third wave, no other window,
  threshold, filter or query.

**The record.** `tools/select.mjs --wave 2 --rule-commit <public commit of this document>` reads
`selection.json`, runs the weekly queries and appends to it. It records under `wave2` the amendment
(`"amendment": "amendment-1.md"`, with the rule commit), each week in the order run with each of its
queries' page run times and total counts, and every candidate examined with its result, the
skipped ones included. The selected pull requests of wave 2 are appended to `selected`, each marked
`"wave": 2` with its week, and `complete` and `finalN`, the final N, are set at the top level. Wave
1's queries and candidates stay as they were, and its own count and `complete` are kept under
`wave2.wave1`. The tool refuses if `selection.json` has a split, if wave 2 has
already run, or if the amendment's commit is not given.

## The split

Unchanged in rule, and computed only after wave 2, over all the selected pull requests of both
waves: ordered by the SHA-256 of `"<owner>/<repo>#<n>"`, owner and repository lower-cased. The first
150 are dev; if fewer than 300 were selected, the first ceil(N/2).

## What this supersedes

The preregistration's "no second query is added" (under "Shortfall"), for this study only, with this
amendment as the record. The population the preregistration defines is unchanged: wave 2 draws from
the same agents, window, threshold and filters.

A known property of the rule changes in degree. `sort=created, order=asc` puts first the
earliest-created of the pull requests a query matches, so where a query reaches the cap the sample
leans towards pull requests that stayed open long. Weekly queries keep that lean within each week.
Wave 1's 116, the earliest-created across the whole window, lean further. The figures are reported
over the selection as a whole.

## Effect on expected values

None of the preregistration's expected values, ranges or bars changes. If the final N is under 300,
the per-half counts scale down with it, and the bar's minimum of 73 checkable advisories is less
likely to be reached.

## Integrity statement

Before this amendment, only selection metadata had been read: search results, repository metadata
and pull request bodies (for the length filter). No advisory, record or check output had been read.
The week list and its order are fixed above, before any weekly query has run.

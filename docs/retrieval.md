# Retrieval: from a typed claim to the record items it is about

A handback block names its identifiers exactly, so it needs no retrieval. A prose report does. A
reader (any reader; Dunstan depends on none) turns the prose into typed claims, and something has to
find which record items each claim is about. `src/retrieval/` does that.

**Retrieval proposes; the check decides.** Retrieval returns candidate record items. It never returns
a verdict. The check in `src/retrieval/reader-claims.ts` decides, from the candidates and the
evidence. A claim with no candidate at or above the floor is `unverifiable` with
`no_matching_record_item`, never `pass`. Retrieval narrows where to look; it is never evidence and
never decides a verdict.

The record format for reader claims is **DRAFT 0.2.0** (`spec/claim-format.md`, "DRAFT 0.2.0";
`spec/schema/record-0.2-draft.schema.json`). It is for the operator to check and is not normative.
Every record without reader claims is still a 0.1 record, byte for byte as before.

## Items

Items come from the pull request's own evidence snapshot only (`src/retrieval/items.ts`), in this
record order:

| Type | From | Identifier | Matched on |
| --- | --- | --- | --- |
| `commit` | `evidence.items.commits` (draft) | the 40-hex SHA | `sha`, `headline` (first line of the message) |
| `timeline_event` | `evidence.items.timeline` (draft) | the event id | `event`, `ref` (an issue or commit), `detail` |
| `check_run` | `evidence.checkRuns` (0.1): the latest run per workflow path and name, less excluded runs | the run id | `name` |
| `file` | `evidence.files` (0.1) | the path | `path`, `previousPath` |
| `test` | `evidence.items.tests` (draft), from one JUnit record | `classname.name` | `name`, `classname` |

No file contents, ever. Commit headlines, timeline event types and test case names are metadata, but
0.1 records do not carry them. The DRAFT section lists them under "What a record would newly
publish".

## Arm A: deterministic, no model

`retrieve(claim, items, opts) → Candidate[]`, each `{type, id, score, matchedField}`.

1. **Exact identifiers** (`identifiers.ts`). These are looked for in the claim's text and in every
   string of the reader's `declaredValue`:
   - a full SHA, or an abbreviated one (at least 7 hex digits including at least one decimal digit,
     so that a word spelt in hex letters is not read as a SHA), matched as a prefix of a commit SHA
     or of a timeline event's commit `ref`;
   - `#N` (in the subject repository) or `owner/repo#N`, against a timeline event's `ref`;
   - a changed file's `path` or `previousPath`, occurring whole: no path character directly before
     or after it, though a sentence's full stop is allowed;
   - a check run's `name`, or a test's `name` or `classname.name`, occurring whole and
     case-sensitively. Names shorter than 4 characters are skipped (`MIN_NAME_LENGTH`). A test's
     `classname.name`, once named, restricts its bare `name` to that test case: the same `name`
     under another classname, or under none, is not an identifier match for that claim.
   - A job name is a whole name only where the text does not continue it: not with a hyphen
     (`build-docs` does not name `build`), not as part of a longer job name of the record named at
     the same place (`build docs` does not name `build`), and not with a matrix leg (`test
     (ubuntu-latest)` does not name `test`). A claim about a matrix job names its leg, and a bare
     `test` names the job called `test` and nothing else.

   An identifier match has `score: null` and ranks above every lexical match.
2. **BM25** (`bm25.ts`, in-repo, no dependency): k1 = 1.2, b = 0.75, Lucene IDF
   `ln(1 + (N − n + 0.5) / (n + 0.5))`. Each distinct query term counts once. The corpus is every
   item of the pull request, so IDF is the same whatever types a claim may match. Tokens: camelCase
   and every non-alphanumeric run split, lowercased, one-character tokens and a fixed stopword list
   dropped, and a trailing plural `s` folded. Scores are rounded to 6 decimal places
   (`SCORE_DECIMALS`) before they are compared, so the last bits of a logarithm on another runtime
   cannot reorder candidates. `matchedField` names the field holding the greatest total IDF of the
   claim's terms.
3. **Order.** Identifier matches come first, then lexical matches by score descending. Ties break by
   record order, then by id (code-unit order).
4. **The floor.** `BM25_FLOOR = 1`. Nothing below it is a candidate, unless the list is filled.
5. **Filling to k (the default for reader claims).** With `fill: 'to-k'` and a `limit` of k, the
   places left below k after steps 1 to 4 are filled with the next items of the allowed types by
   BM25 score, below the floor too, ties by record order then id, so the list holds min(k, pool)
   items. The head of the list is the unfilled list, unchanged; a filled candidate is one whose
   score is below the floor. `retrieve` itself fills only when asked. `readReaderClaim` asks, with
   k = 5 (`READER_CLAIM_K`), whenever fewer than k candidates reach the floor, and never cuts the
   list: every candidate at or above the floor is still recorded. Its claims record
   `"retrieval": {"arm": "A-fill", "floor": 1, "k": 5}`. No embedding model is used or needed.

   **A filled candidate is never evidence.** The check never reads a candidate below the recorded
   floor, so filling changes no verdict. A claim whose candidates are all
   filled is `unverifiable` with `no_matching_record_item`, as it was with none. This matters most
   for `check_succeeded` and `test_passed`, which aggregate over their candidates (spec D.10,
   question 4): a filled run or test case never decides them. For `file_changed`, `commit_present`
   and `reference_in_timeline` a filled candidate could not make a claim pass anyway, since the
   declared item has to be among the candidates and an item the claim names is an identifier match.

### Exact identifiers close the set

The check combines a set of the claim's candidates (`combinedCandidates`, `reader-claims.ts`; DRAFT
0.2.0, D.6):

1. **Exact identifier matches close the set.** If at least one candidate of the claim's item type is
   an identifier match (`score: null`), the check combines the identifier matches only. A lexical
   candidate stays in the recorded list, at or above the floor or not, as evidence of what
   retrieval saw. Its numeric `score` beside an identifier match marks it as not combined, so the
   record needs no new field, and it never decides a verdict.
2. **A qualified test name restricts the match** (step 1 above). `queue.retry.gives up after three
   attempts` names that test case only, and not `http.retry.gives up after three attempts`.
3. **Without an identifier match, nothing changes.** The check combines every candidate at or above
   the floor, in the same order. With none, the claim is `unverifiable`, `no_matching_record_item`.

This matters for `check_succeeded` and `test_passed`, which aggregate over what they combine. A
sibling one token apart ("evicts the newest entry" beside "evicts the oldest entry"), a job whose
name differs only in a token BM25 drops (`e2e (shard 1)` beside `e2e (shard 2)`), or the same name
under another classname would otherwise join the aggregate. It could then turn a claim that names
the right item exactly from `pass` into `fail`. Retrieval itself is unchanged: it ranks and records
the same candidates as before, and only what the check combines differs.

### Ties that disagree are ambiguous

A claim that names nothing exactly has no identifier match to close the set. If its best lexical
candidates tie, the record cannot tell which of them the claim is about. For `check_succeeded` and
`test_passed` (`ambiguousCandidates`, `reader-claims.ts`; DRAFT 0.2.0, D.6):

1. **Ambiguous candidates are unverifiable.** If the claim has no identifier match of its item type,
   and two or more of its candidates at or above the floor tie on the top score, and they disagree on
   the outcome the kind reads, the claim is `unverifiable` with `ambiguous_candidates`. The check
   neither combines nor reads them. The outcome is a run's succeeded, failed (completed with any
   other conclusion, as section 7.5 reads it) or not completed, and a test case's passed, failed or
   skipped.
2. **Agreement means no ambiguity.** If the tied candidates agree on the outcome, the check combines
   every candidate at or above the floor, as before.
3. **Ties only.** Scores are compared exactly, after rounding to `SCORE_DECIMALS`, with no margin. A
   candidate below the top score does not make the claim ambiguous, whatever its outcome.

Without this rule a tied confusable decided the aggregate. "e2e shard 2 fails" held because `e2e
(shard 1)`, which ties with `e2e (shard 2)` once the one-character token is dropped, failed: a false
pass. "e2e shard 2 passes" failed for the same reason. A check that cannot tell the two runs apart
says so. `file_changed`, `commit_present` and `reference_in_timeline` need the declared item among
the candidates, so a tie cannot mislead them, and the rule does not apply to them.

### The floor, and why 1

With k1 = 1.2 and b = 0.75, a query term that occurs once in an item of average length contributes
`idf × (1 × 2.2) / (1 + 1.2) = idf`. A floor of 1 is therefore "the evidence of one term with IDF of
at least 1". IDF reaches 1 when a term occurs in at most about N / e of the N items, which is 37%.

- An item that shares **one distinctive word** with the claim is a candidate. So is an item that
  shares several weaker words.
- An item of average length whose **only link is one word common across more than a third of the
  record** is not. In a storage pull request, "storage" alone does not make every storage file a
  candidate.
- These figures are for an item of average length. Length normalisation lifts a shorter item and
  lowers a longer one. In a record of **three items or fewer**, IDF tops out just under 1 (0.98 at
  N = 3), so a single shared term reaches the floor only in an item shorter than average.
  Identifier matches are unaffected.

The floor is a stated constant, not tuned on data. The retrieval measurement takes recall at k = 5
on a private corpus and may propose another value; changing it changes `retrieval.floor` in new records, never
the verdict of a recorded one.

## The seam for Arm B: embeddings, optional

`EmbeddingProvider` (`embedding.ts`) is `{identity: {name, digest}, embed(texts) → vectors}`.
Dunstan ships **no provider**. The tests use a hashed bag-of-words test double.
`retrieveByEmbedding` ranks items by cosine similarity, with no floor: setting a floor for Arm B is
the measurement's job. `fuse` combines the arms for A+B: Arm A's identifier matches first, then
reciprocal rank fusion (k = 60) of the two lexical and semantic lists. Arm B ships only if the
retrieval measurement says it closes a real gap.

## Reader claims and the record

A record built with `readerClaims` (`buildRecord({..., readerClaims})`) is written to DRAFT 0.2.0.
Each entry is:

```json
{
  "text": "The typecheck job passes", "kind": "check_succeeded", "declaredValue": true,
  "reader": {"name": "example-reader", "version": "0.0.1"}, "probability": 0.8,
  "retrieval": {"arm": "A-fill", "floor": 1, "k": 5},
  "candidates": [
    {"type": "check_run", "id": "103", "score": null, "matchedField": "name"},
    {"type": "check_run", "id": "101", "score": 0, "matchedField": "name"},
    {"type": "check_run", "id": "102", "score": 0, "matchedField": "name"}
  ],
  "observed": false, "verdict": "fail", "reason": "all_succeeded_mismatch"
}
```

Runs 101 and 102 fill the list to k and are below the floor, so the check reads run 103 alone. A
record written before filling was the default has `"retrieval": {"arm": "A", "floor": 1}` and no
candidate below the floor; it verifies as before.

- `probability` is the reader's output, recorded as given. No check reads it, and a test proves that
  the same claim gets the same check at any probability.
- **Re-run.** `dunstan verify` recomputes each reader claim's check from its **recorded**
  candidates and the evidence, and never retrieves again. So the verdict reproduces even where a
  fresh retrieval would rank differently. A test makes retrieval throw during verification. A
  recorded candidate the evidence does not hold makes the claim `unverifiable`
  (`candidate_not_in_evidence`).
- Reader claims do not enter the record's `verdict` in this draft. They have their own digest,
  `digests.readerClaims`.

Kinds and their checks are listed in the DRAFT section of the spec.

### Closing claims

"Closes #12" is a `reference_closes` claim. Its candidates are the timeline events that name #12,
found as for `reference_in_timeline`: where the record mentions the issue. They are recorded, and
no candidate decides the claim. The check builds the block a closes claim outside a block is
checked as (`closesBlock` in `src/check/checks.ts`: one `closes` reference to the issue, nothing
else) and takes its row from the gate's own `checkReferences`, as advisory comparison 0.4.0 does
for a `reference_closes` advisory. So the verdict, reason and `observed` are section 7.4's: the
closing references (and, for an issue they do not list, whether it exists: `not_found`), then a
ClosedEvent whose closer is this pull request, its merge commit or one
of its commits, then `closing_link_unsettled`, `closing_base_not_default`, an unread section,
`closing_event_unsettled`, and otherwise `not_closing`. Evidence 7.4 needs and the record lacks
gives the gate's unread reason, never `pass`. `#N` is the subject repository unless the claim says
`owner/repo#N`.

`reference_in_timeline` is unchanged. It means "mentioned" and passes on any timeline event naming
the issue, a bare cross-reference included, so it never stands in for a closing claim. A
cross-reference shows the pull request mentioned the issue, not that it closed it.

## Measuring: `dunstan-eval retrieval`

```sh
pnpm build
pnpm dunstan-eval retrieval --corpus <dir> --out <file> [--fill-to-k] [--provider <module.mjs>]
# or, from a built checkout: node dist/dunstan-eval.mjs retrieval ...
```

It reads every `*.json` in `<dir>`, in code-unit order. Each case file is:

```json
{
  "repository": "example-org/example-repo",
  "evidence": { "files": {...}, "checkRuns": {...}, "items": {...} },
  "claims": [
    { "id": "typecheck-passes", "text": "The typecheck job passes.", "kind": "check_succeeded",
      "declaredValue": true, "expected": [{ "type": "check_run", "id": "103" }] }
  ]
}
```

`evidence` uses the record's shapes. A claim is a **hit** when any of its `expected` items is in the
top 5 of an arm's ranking. A known `kind` restricts candidates to its item type, as the product
does. The output gives, per arm, `claims`, `hits`, `recallAtK`, `empty` and `emptyRate` (claims for
which the arm proposed no candidate) and `missed` (as `case/claim`), along with `k`, the floor, the
checker version, a SHA-256 of the corpus and the provider's identity. Without `--provider` only Arm
A runs. `--fill-to-k` adds `A-fill`, Arm A filled to k = 5 as above (cut at k, as recall at k is). `--provider` adds B and A+B
(A+B fuses the unfilled Arm A).

`chance` is what a uniformly random ranking of each claim's pool would score: the pool is every item
of the claim's allowed types, as the arms rank, and a claim with g of its expected items among a
pool of P has a hit with probability `1 − C(P − g, m) / C(P, m)`, m = min(5, P), which is m / P for
one expected item. `chance.expectedHits` sums that over the claims, computed exactly rather than
sampled, and `chance.recallAtK` divides by the claim count.

`test/retrieval-corpus/` is a **small synthetic corpus**, a smoke test and not a result. Arm A gets
13 of 14 there (A-fill 14 of 14; chance 0.814). The miss is a claim written to share no word with its commit ("more resilient to
flaky networks" against "Add exponential backoff to blob uploads"): it is the kind of gap Arm B is
meant to measure. The real measurement runs on a private corpus outside this repository.

## Challenge set

The corpus tests what retrieval finds. `test/retrieval-challenge/` tests what it should not confuse:
typed claims against record items built to be mistaken for the right one. In the second open-source
study, 4 of the 7 file misreads named a path that is a file at the head
(`experiments/open-source-advisory-2026-10-study2/result.md`), so a confusable that exists is the
common case, not the rare one. This is a challenge set, not a sample: its cases are chosen to be
hard, and it gives no rate. Every item is constructed.

One file per family, each one pull request's evidence in the corpus's shape, read by the corpus
loader:

- `paths`: sibling and nested paths; monorepo duplicates; a rename named by its old path, and a new
  file added at that old path; a path that is a prefix of another; an existing file mentioned only
  as context, which was not changed.
- `shas`: a 7-hex prefix two commits share; a SHA in a timeline event's `ref` and not among the
  commits.
- `numbers`: `#N` in the subject repository against `owner/repo#N`; `#120` against `#12`; an issue
  named only by a `connected` event. These are `reference_in_timeline` claims: the record mentions
  the issue. A claim that the pull request closes it is in `closes`.
- `closes`: `reference_closes` claims, each with the evidence section 7.4 reads for that case alone
  (the pull request's state, closing references, references and close events). The timeline
  cross-references the issue, or names it by a `connected` event, or not at all, and the 7.4 row
  decides: listed in the closing references, closed by this pull request, by its merge commit, or
  in another repository by this pull request (`pass`); closed with no closer, open after a merge into
  the default branch, or no such issue (`fail`); the pull request still open, merged into another
  base, closed with no ClosedEvent yet, or close events not read (`unverifiable`).
- `checks`: the right name on the wrong run (a re-run; one job name in two workflows); names that
  differ only in case; names below `MIN_NAME_LENGTH`; a matrix job.
- `tests`: test names one token apart; one `name` under two `classname`s.
- `lexical`: BM25 ties broken by record order where the right item comes later, because a token of
  one character is dropped; and the same ties under a claim that the right item failed, where it
  succeeded.

A case gives the claim (`text`, `kind`, `declaredValue`), its `confusion` in one line,
`expectCandidates` (the ids the check should read first, in that order), `forbidCandidates` (ids the
check must not read: no identifier match and no score at or above the floor) and `expectCheck` (the
verdict, and the reason and observed value where stated). The check reads no candidate of a claim it
finds ambiguous, so such a case expects none first, and reads none it forbids.

`src/retrieval/challenge.test.ts` runs Arm A and the check (`readReaderClaim`) on every case and
snapshots the candidates and the check exactly. Every case where that differs from its expectation
is in `KNOWN_MISSES`, with its family, its effect (`verdict`, `observed` under the right verdict, or
`candidates` only) and one line of reason. The test passes on today's code. A new miss or a fixed
one fails it until the list and the snapshot are updated, so every change in retrieval is a diff.
Arm B is not run: Dunstan ships no embedding provider.

| Family | Cases | Known misses | Of which a wrong verdict |
| --- | --- | --- | --- |
| `checks` | 9 | 2 | 1 |
| `closes` | 13 | 0 | 0 |
| `lexical` | 8 | 1 | 1 |
| `numbers` | 5 | 0 | 0 |
| `paths` | 11 | 3 | 0 |
| `shas` | 7 | 3 | 0 |
| `tests` | 7 | 2 | 1 |
| All | 60 | 11 | 3 |

When the set was first measured there were 35 known misses, 14 of them wrong verdicts. One of them
was a `closes` claim that a cross-reference passed; that case has since been dropped, since its pass
follows the spec's `reference_in_timeline` row:

| Family | Known misses | Of which a wrong verdict |
| --- | --- | --- |
| `checks` | 6 | 4 |
| `lexical` | 6 | 5 |
| `numbers` | 3 | 1 |
| `paths` | 10 | 0 |
| `shas` | 3 | 0 |
| `tests` | 7 | 4 |

"Exact identifiers close the set" fixed 18 of those misses, 6 of them wrong verdicts. A case is
fixed when it names its item exactly and the confusable was only a lexical match. The wrong verdicts
left are all in the kinds that aggregate over their candidates, `check_succeeded` and
`test_passed`, where no single identifier match closes the set:

- the claim names its item only loosely ("e2e shard 2", "the 1 byte upload test"), so the
  confusable ties lexically and is read. Two of these are false passes: a claim that the item
  failed, about one that succeeded, holds because the tied confusable failed;
- the confusable is an identifier match too: one name under two classnames with the classname only
  in prose, or the latest run per name.

Matching a job name whole (step 1 above) then fixed the matrix job: `test (ubuntu-latest)` no longer
names `test`. That left 17 misses, 8 of them wrong verdicts. Case and the short names inside longer
ones were already fixed by exact identifiers.

"Ties that disagree are ambiguous" then took the loosely named claims out of the aggregate. Six
`lexical` cases now expect `unverifiable`, `ambiguous_candidates`, where they expected `pass` or
`fail`: a change of expectation, not a fix to `pass` or `fail`. They are `shard-later`,
`shard-later-said-to-fail`, `package-later`, `byte-size-later`, `byte-size-later-said-to-fail` and
`shard-earlier`. `shard-earlier` passed before, because the run it names happened to be the one that
failed; its tie disagrees all the same. The two false passes are gone, and the set has no case left
that passes where it should not. `api-version-later` keeps its expectation of `pass`: "version 2"
could name `api.v2`, but no token says so, and it is now `unverifiable` where it was a false `fail`.
That left 11 misses, 3 of them wrong verdicts, none of them a `pass`.

The latest run per name is not fixed. In `checks/same-name-two-workflows`, the record keeps one run
of `test` where two workflows ran one each. A 0.1 check run carries `id`, `name`, `status` and
`conclusion`, and no workflow, check suite or app. So that evidence is the same as a re-run of
`build` in one workflow (`checks/rerun-latest-failed`), and a check that is a function of the
evidence gives both the same verdict. Calling every name held by two runs ambiguous would make the
re-run cases `unverifiable` too. Telling them apart needs the evidence to carry each run's check
suite or workflow.

In the other kinds the declared item has to be among the candidates, so a confusable read beside it
changes no verdict, though it can change the observed value.

The `closes` family was added with the `reference_closes` kind ("Closing claims", above). Before
it, each of its 13 cases was `unverifiable`, `no_comparable_record_field`, since no reader kind
meant "closes"; after it, each gives its expected 7.4 row, and none is a known miss. Its candidates
were the same before and after. The two other-repository cases in `numbers` left the known misses
with "Exact identifiers close the set", and this change does not touch them.

To add a case, add a claim to its family's file (or add a family file and its name to `FAMILIES`),
run `pnpm exec vitest run src/retrieval/challenge.test.ts --update` to write its snapshot, and read
the snapshot's diff. If it misses, add it to `KNOWN_MISSES` with a reason, and update the table
above; the test checks the table. The claims carry no `expected`, so this is not a corpus for
`dunstan-eval retrieval`.

## Not here

Reading `items` from GitHub (commits, timeline, JUnit test cases), any reader integration, an
online `dunstan rerun` of a draft record, an Arm B provider, and any change to 0.1 verdicts.

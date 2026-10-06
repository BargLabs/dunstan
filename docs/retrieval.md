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
| `check_run` | `evidence.checkRuns` (0.1): the latest run per name, less excluded runs | the run id | `name` |
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
     case-sensitively. Names shorter than 4 characters are skipped (`MIN_NAME_LENGTH`).

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

   **A filled candidate is never evidence.** The check reads only identifier matches and candidates
   at or above the recorded floor, so filling changes no verdict. A claim whose candidates are all
   filled is `unverifiable` with `no_matching_record_item`, as it was with none. This matters most
   for `check_succeeded` and `test_passed`, which aggregate over their candidates (spec D.10,
   question 4): a filled run or test case never decides them. For `file_changed`, `commit_present`
   and `reference_in_timeline` a filled candidate could not make a claim pass anyway, since the
   declared item has to be among the candidates and an item the claim names is an identifier match.

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

## Not here

Reading `items` from GitHub (commits, timeline, JUnit test cases), any reader integration, an
online `dunstan rerun` of a draft record, an Arm B provider, and any change to 0.1 verdicts.

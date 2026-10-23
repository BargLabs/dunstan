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
| `test` | `evidence.items.tests` (draft), from one JUnit record | the JSON array `["<classname>","<name>"]`, `null` for no classname | `name`, `classname` |

A test case's identifier is its `(classname, name)` pair, written as a JSON array, because
`classname.name` is not one-to-one: `(queue, retry.case)` and `(queue.retry, case)` both read
`queue.retry.case`, and so do `(queue, retry)` and a case with no classname named `queue.retry`. A
text still names a test case by its `classname.name` as it reads (identifier matching, below), and
the fields it is matched on are unchanged; only the identifier a candidate records is the pair.

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
     under another classname, or under none, is not an identifier match for that claim. A bare
     `name` held by two or more test cases is restricted, too, to the cases whose classname the
     text names apart from it ("A classname named apart from the name", below).
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

### A classname named apart from the name

A report rarely writes a test's full identifier. It says "the queue retry test \"gives up after
three attempts\"": the classname in prose, the name quoted. Where one bare name is held by two or
more test cases under different classnames, the bare name is an identifier match under each of
them, and the set closes to all of them. So `http.retry`'s failure decided a claim about
`queue.retry`'s case. In Arm A's identifier stage (`identifierMatches`, `identifiers.ts`; DRAFT
0.2.0, D.4):

1. **When it applies.** A bare test `name`, of at least 4 characters, that the text names and that
   two or more test cases hold, where no `classname.name` of that name is named (a full identifier
   already restricts it to its case).
2. **A classname named in prose.** A classname of one of those cases is named when the text holds
   it whole, bounded as a test name is (no letter, digit or underscore directly before or after
   it), and case-sensitively. It may be written as recorded (`queue.retry`) or with each `.`
   replaced by one space (`queue retry`). Where a classname lies inside a longer classname of the
   record that the text names at the same place (`retry` inside `queue retry`), the longer one is
   named and the shorter is not, as for job names. Nothing looser names a classname: no stemming,
   no case folding, no partial segment (`queue` does not name `queue.retry`), and no other
   separator (`queue_retry` names nothing). A classname shorter than 4 characters as recorded
   (`MIN_NAME_LENGTH`, as for a test or job name), such as `io` or `db`, is never named this way:
   an ordinary word ("no io errors") would name it and narrow the set to the wrong case. Its full
   identifier (`io.flushes the buffer`) still names its case.
3. **Exactly the named ones.** If the text names one or more of those classnames, the bare name
   names the cases under them only. "The queue retry and http retry tests" names both, and both are
   read. A case with no classname is not named then.
4. **None named.** If the text names none of them, every case with the name is an identifier match,
   as before (spec D.10 asks whether such a claim should be `unverifiable` instead).

A case left out is not an identifier match. Its BM25 score stays in the recorded list, marked as not
combined beside the identifier match, as for a full identifier. No reason code is new: the check
reads the cases the claim names, and decides as before.

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

### One identity, two entries

The check finds each candidate's evidence entry by its type and identifier (`lookup`,
`reader-claims.ts`; DRAFT 0.2.0, D.6 step 4). Two entries can share one identifier: a JUnit record
that lists one classname and name twice, say once failed and once passed. The second entry is never
stored over the first. The identifier is marked a duplicate, and a claim whose combined candidates
include it is `unverifiable` with `duplicate_record_item`: the record cannot tell which entry the
claim is about, and reading either would leave the other's outcome unread. A filled candidate is
never combined, so a duplicate among the fills changes nothing.

Before this, `test` items were identified by `classname.name`, and the entry read for an identifier
was the last one listed under it. A claim about a failed test whose `classname.name` read the same as
a passed one's was decided by the passed one: a false `pass`. With the pair as the identifier, the
first two collisions above are two items, each read for its own outcome; only a genuine duplicate is
refused.

### A job named with its workflow

GitHub names an Actions check run after its job, so two workflows that each have a job `test` give
two check runs called `test`. GitHub shows each as `<workflow> / <job>`. A `check_succeeded` claim
may name its job that way (`namedWorkflowRuns`, `reader-claims.ts`; `workflowJobs`,
`identifiers.ts`; DRAFT 0.2.0, D.6):

1. **The form, and nothing looser.** The claim's text holds a space, a slash and a space. The
   workflow is the longest `workflowName` or `workflowPath` of the record that the text holds whole
   directly before them, with no path character (a letter, a digit, `.`, `_`, `/` or `-`) directly
   before it. So a name may hold spaces: "Continuous Integration / build" names the workflow
   `Continuous Integration`, and "MyCI / build" does not name `CI`. If the record holds none there,
   the workflow is the run of non-space characters directly before them, which then names no run.
   The job is a check run name of the record that the text names whole directly after them, as
   step 1 above matches a job name (the longest, if two are). No length minimum applies, since the
   slash fixes where the name starts. Nothing else in the text names a workflow: "the test job in
   Checks" names none.
2. **With its event.** GitHub's checks list on a pull request shows a check as `<workflow> / <job>
   (<event>)`, for example `CI / build (pull_request)`, and a claim copied from it carries the
   event. Where the job is followed by a space and `(<event>)`, and `<event>` is exactly one of
   `push`, `pull_request`, `pull_request_target` or `merge_group` (`CHECK_RUN_EVENTS`), the text
   names the workflow and the job as `<workflow> / <job>` does, and the job is an identifier match
   as if the event were not there. A matrix leg wins: if `<job> (<event>)` is itself a check run
   name of the record, the text names that run, as before. Without a workflow, `test
   (pull_request)` names no job.
3. **A parenthesis the record does not hold.** Where the text names a workflow and then `<job>
   (<anything>)`, `<job>` is a check run name of the record, `<job> (<anything>)` is not, and
   `<anything>` is not one of the four events, the claim is `unverifiable`,
   `no_matching_record_item` (`unheldSuffixJobs`). It names a leg or an event the record does not
   hold, so it names no run: "checks.yml / test (workflow_dispatch) fails" is not about every
   workflow's `test`.
4. **Matched by path or name.** A check run in the record carries its workflow's `workflowPath`
   (spec 0.1.4, section 6, "Workflow runs") and, since spec 0.1.5, its `workflowName`, the `name`
   the workflow runs listing gives, which is what GitHub shows. The workflow in the claim matches a
   run whose `workflowPath` or `workflowName` equals it, exactly: no case is folded and no file name
   is guessed. `.github/workflows/checks.yml / test` and "Checks / test" both name the `test` runs
   of a workflow `Checks` in that file. A workflow that sets no `name:` is shown, and listed, by its
   path.
5. **When the record can tell.** If every run of the job in `checkRuns.runs` carries a
   `workflowPath`, the check combines, of the job's runs, only those of the named workflow. They are
   the runs section 7.5 counts, the latest per workflow path and name (`countedCheckRuns`), so a
   re-run of that workflow is read at its latest run. Runs of other jobs the claim names without a
   workflow are combined as before. If no counted run of the job is of that workflow, the claim is
   `unverifiable`, `workflow_not_in_record`; if one is and is not among the combined candidates,
   `declared_item_not_among_candidates`.
6. **One name, two workflows.** If the workflow is the name or the path of runs of the job under two
   or more `workflowPath`s, the claim is `unverifiable`, `workflow_name_ambiguous`, and the check
   reads none of its runs. Two workflow files may set one `name:`, and naming one of them by that
   name names both. A path names one.
7. **When it cannot.** If two or more runs of the job in `checkRuns.runs` (whether counted or not)
   and any of them has no `workflowPath`, the claim is `unverifiable`, `workflow_not_in_record`, and
   the check reads none of its runs. Such runs are a record written before the workflow was
   recorded, or a run of no workflow beside one of a workflow. Then a re-run in one workflow and two
   workflows' runs of one name look the same, and only the claim says which workflow it means. A
   job held by one run with no workflow is read as before. Likewise, if the workflow is no
   `workflowPath` of the job's runs and any of them has a `workflowPath` and no `workflowName` (a
   record written before spec 0.1.5, or a listing that gave no name), the record cannot say whether
   that run's workflow has the name, and the claim is `unverifiable`, `workflow_not_in_record`.
8. **A claim that names no workflow is unchanged.** "The build job passes" still fails on a re-run
   whose latest run failed.

The step comes after the floor and before ties: a workflow named for a job leaves only that
workflow's runs to tie. `ambiguous_candidates` does not fit the reason. That reason is a tie between
scores, and a named workflow the record cannot place is not a tie. The `all_succeeded_mismatch` and
`checks_incomplete` reasons are verdicts on runs that were read. So `workflow_not_in_record` is new,
and the DRAFT schema's `readerReason` accepts it. A name held by two workflows (step 6) is not that
either: the record holds both workflows, and it is the claim that names two. `workflow_not_in_record`
would say the record lacks what it holds, and `ambiguous_candidates` would say two scores tie. So
`workflow_name_ambiguous` is new too, and the DRAFT schema accepts it. A parenthesis the record does
not hold (step 3) is `no_matching_record_item`, which fits exactly: no run of the record is what the
claim names. The event form (step 2) needs no reason of its own: once the event is read, every
outcome is one of steps 4 to 8.

Before step 2, a claim copied with its event named no job and no workflow: `test (` was refused as
a matrix leg the record does not hold. It then rested on BM25 alone. Against the two runs of
`checks/display-name-event-suffix` both scored below the floor, and against the family's thirteen
runs the two `test` runs tied above it and disagreed, so it was `unverifiable` either way. But the
workflow it named was never read: where the job's runs scored at or above the floor and agreed,
the check combined every workflow's runs of the job, though the claim named one.

Before step 3, any event other than the four was read the same way, and so still is in a claim that
names no workflow. "The test job, .github/workflows/checks.yml / test (workflow_dispatch), fails"
named `test` bare, so both workflows' `test` runs were identifier matches, and it passed on
nightly.yml's failure though checks.yml's `test` succeeded (`checks/path-unheld-suffix-job-named`).

Before step 4, the record held no workflow's name, so "Checks / test", as GitHub shows a check, was
always `unverifiable`, `workflow_not_in_record`: the rule was right and could not be used.

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
  (`candidate_not_in_evidence`), and so does a combined candidate the evidence holds twice
  (`duplicate_record_item`, "One identity, two entries").
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
  differ only in case; names below `MIN_NAME_LENGTH`; a matrix job; a job named with its workflow,
  against runs that carry no workflow, and against runs that carry their workflow's path; the same
  with its event, as GitHub shows a check, and an event that is itself a leg's name; an event the
  reader does not read; a workflow named by its `workflowName`, one that holds a space, one held by
  two workflow paths, and one beside a run that carries a path and no name. A checks case may carry
  its own `checkRuns` in place of the family's.
- `tests`: test names one token apart; one `name` under two `classname`s, named by its full
  identifier, by one classname in prose (as recorded, or with spaces), or by both; a classname
  below `MIN_NAME_LENGTH` used as an ordinary word; two cases whose `classname.name` reads the same
  (a dot moved between classname and name, or a classname against none), and one case listed
  twice. A tests case may carry its own `items` in place of the family's.
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
| `checks` | 24 | 1 | 0 |
| `closes` | 13 | 0 | 0 |
| `lexical` | 8 | 1 | 1 |
| `numbers` | 5 | 0 | 0 |
| `paths` | 11 | 3 | 0 |
| `shas` | 7 | 3 | 0 |
| `tests` | 13 | 0 | 0 |
| All | 81 | 8 | 1 |

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

The latest run per name was not fixed then. In `checks/same-name-two-workflows`, the record keeps
one run of `test` where two workflows ran one each. Its runs carry `id`, `name`, `status` and
`conclusion`, and no workflow, check suite or app, as a record written before spec 0.1.4's
amendments does. So that evidence is the same as a re-run of `build` in one workflow
(`checks/rerun-latest-failed`), and a check that is a function of the evidence gives both the same
verdict. Calling every name held by two runs ambiguous would make the re-run cases `unverifiable`
too.

"A job named with its workflow" (above) tells them apart by the claim: "Checks / test passes" names
its workflow, and the record cannot say which run is the Checks one, so it is `unverifiable`,
`workflow_not_in_record`, where it was a false `fail`. "The build job passes" names none and still
fails on the re-run. Four `checks` cases came with it: `rerun-workflow-named` ("CI / build passes"
on the re-run: `unverifiable`); `same-name-two-workflows-recorded` and `-recorded-other`, whose runs
carry their `workflowPath`, where `.github/workflows/checks.yml / test` passes on 201 and
`.github/workflows/nightly.yml / test` fails on 205 without reading 201; and
`same-name-two-workflows-display-name`, "Checks / test passes" against those runs: the record holds
paths, not names, so it is `unverifiable`. Before the change, the three named by path or name gave
`fail` from the run they were not about, and `-recorded-other` failed for the right verdict but read
201 too. That left 10 misses, 2 of them wrong verdicts, none of them a `pass`.

"A classname named apart from the name" (above) then fixed the classname in prose.
`tests/same-name-classname-in-prose` ("The queue retry test ... passes") failed on `http.retry`'s
case, and now passes on `queue.retry`'s alone; `tests/same-name-declared-failing` ("The http retry
test ... fails") passed but read `queue.retry`'s case too, and now reads `http.retry`'s alone. Two
`tests` cases came with it: `same-name-classname-dotted-in-prose` ("The queue.retry test ...
passes", the classname as recorded but apart from the name), which failed on `http.retry`'s case
before and passes now; and `same-name-two-classnames-in-prose` ("The queue retry and http retry
tests ... pass"), which names both, reads both and fails on `http.retry`'s, before and after. That
left 8 misses, 1 of them a wrong verdict, none of them a `pass`. The wrong verdict left is
`lexical/api-version-later`, kept on purpose: its verdict is `unverifiable`, which fails closed,
and making "version 2" name `v2` would be a guessed expansion.

The event form ("A job named with its workflow", step 2) and the classname minimum then came with
five cases, and left the counts at 8 misses, 1 of them a wrong verdict.
`checks/display-name-event-suffix` ("Checks / test (pull_request) fails.") was `unverifiable`,
`no_matching_record_item`, and is now `unverifiable`, `workflow_not_in_record`. `checks/path-event-suffix` and `-other` name
`checks.yml` and `nightly.yml` with an event; they were `unverifiable`, `no_matching_record_item`,
and now pass on 201 and fail on 205 alone. `checks/event-suffix-is-a-leg` ("CI / test (push)
passes.", where `test (push)` is a run of the record) passes on that run, before and after.
`tests/same-name-short-classname-as-word` ("The test ... passes, with no io errors.", under `io`,
which passed, and `queue.retry`, which failed) was a false pass: the word "io" named the classname
`io` and narrowed the set to its case. It now reads both cases and fails.

The workflow's name in the evidence (spec 0.1.5; "A job named with its workflow", steps 1, 4 and
6) and the parenthesis the record does not hold (step 3) then came with seven `checks` cases, and
left the counts at 8 misses, 1 of them a wrong verdict. Each carries its own `checkRuns`.
`workflow-name` ("Checks / test passes.") and `workflow-name-event-other` ("Nightly / test (push)
passes.") name Checks and Nightly by name; they were `unverifiable`, `workflow_not_in_record`, and
now pass on 201 and fail on 205 alone. `workflow-name-with-spaces` ("Continuous Integration / build
passes.") was `unverifiable`, `workflow_not_in_record`, since "Integration" names nothing, and now
passes on 210 alone. `workflow-name-two-paths` ("CI / test passes.", two files named CI) was
`unverifiable`, `workflow_not_in_record`, and is now `unverifiable`, `workflow_name_ambiguous`.
`workflow-name-one-unrecorded` ("Checks / test passes.", where nightly.yml's run carries no name) is
`unverifiable`, `workflow_not_in_record`, before and after. `path-unheld-suffix`
(".github/workflows/checks.yml / test (workflow_dispatch) fails.", beside four other jobs) was
`unverifiable`, `ambiguous_candidates`, since both `test` runs tied above the floor and disagreed,
and `path-unheld-suffix-job-named` (the same, with `test` also named bare) was a false pass on 205's
failure. Both are now `unverifiable`, `no_matching_record_item`.

A test case's identity as its `(classname, name)` pair ("Items" and "One identity, two entries",
above) then came with three `tests` cases, and left the counts at 8 misses, 1 of them a wrong
verdict. Each carries its own `items`, and in each the claim's case failed. In
`dot-moved-across-classname` ("The queue.retry.flushes test passes.", over `(queue, retry.flushes)`
and `(queue.retry, flushes)`, which passed) and `classname-against-no-classname` ("The queue.retry
test passes.", over `(queue, retry)` and a case with no classname named `queue.retry`, which passed),
the text names both cases, and each now fails on the failed one. `one-case-recorded-twice` lists
`(queue.retry, flushes)` failed and then passed, and is now `unverifiable`, `duplicate_record_item`.
Before the change all three were false passes, decided by the passed entry that shared the
identifier. Every other case reads and decides as before; its snapshot shows each test candidate's
identifier as the pair, where it showed `classname.name`.

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

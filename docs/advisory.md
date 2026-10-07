# Advisories: reading a report's prose without a model

A handback block states its claims as fields. Many reports have no block, and many that have one
also say more in prose. The advisory layer (`src/advisory/`) reads that prose and records what it
finds as **advisories**. It never decides anything:

- **Advisories never change the verdict.** They do not enter `predicate.verdict` or
  `predicate.claims`. A report with no block stays `unverifiable` (`block_missing`), and a block's
  verdict is the same with or without advisories.
- **No advisory is `fail`.** An advisory carries a note (`agrees`, `agrees_by_name`,
  `differs:<reason>` or `unanswered:<reason>`) and no verdict.
- **A `differs` note is shown as a "possible disagreement, unverified".** The record keeps
  `differs:<reason>`; every surface a person reads words it as a possible disagreement, never as an
  accusation ("How a `differs` note is shown", below).
- **Its measured figures are carried beside it.** The record states the extractor's measured
  precision and the measured accuracy of `differs` notes with its base rate, each only for the exact
  extractor and comparison it was measured on, or `null` (shown as "unmeasured") otherwise
  ("Measured figures", below).

The record format is **DRAFT 0.2.0** (`spec/claim-format.md`, D.11;
`spec/schema/record-0.2-draft.schema.json`). It is for the operator to check and is not normative.
Without `--advisory`, every record is exactly what it was.

## Why a grammar, and not token scraping

The extractor this replaces scraped tokens: any path, `#N` or hex string anywhere in a report was
treated as a claim. On 196 real pull requests it raised 4,647 flags, and none of a sample of 30 of
them was real (0 of 30; Wilson 95% upper bound 0.114). Method: the token checks ran over 196 of
Barg Labs' own merged agent-written pull requests, and 30 of the flags, drawn before any flag was
read, were each judged by hand against the pull request's record. A token that appears in a report
is not a claim. A clause that
asserts something is ("I changed", "tests pass", "closes #12", "merged at"). So this extractor binds
each candidate token to a clause with an asserting verb before it compares anything. A token that
cannot be bound is dropped. Recall is traded for precision on purpose.

## Use

```sh
dunstan check --repo example-org/example-repo --pr 7 --report-pr-body --advisory
```

```yaml
- uses: BargLabs/dunstan@<full commit SHA>
  with:
    report-source: pr-body
    advisory: true   # default false
```

The CLI prints an advisory table after the claims, above the verdict line. The Action adds one
summary row: how many advisories agree, agree by name only, are possible disagreements or are
unanswered, plus the extractor version and the precision. Below the claims it lists each possible
disagreement (at most 20; the record holds every advisory). Neither changes the exit code, the
check-run conclusion or the title. `dunstan verify` recomputes every advisory's note.

## How a `differs` note is shown

A decision rule preregistered before the measurement governs how a `differs` note is presented:

> If differs accuracy is below 0.50, the `differs` note is labelled "possible disagreement,
> unverified" in the docs and the CLI, and is never shown as an accusation.

The accuracy of `differs` notes (see "Precision", below) was measured against that rule on
adjudicated reports outside this repository, and **the rule fired**: on the reports measured so
far, a `differs` note usually reflected a misread of the report, not a false claim. The figures have
since been published: value, n and method only, never the reports, their clauses or their labels
("Measured figures", below).

So every surface a person reads now shows a `differs` note as **"possible
disagreement, unverified"**, followed by what the record shows and then the observed value. It
never shows it as "differs", "mismatch" or "false", nor as anything that says the agent was wrong:

| Note in the record | Shown as |
| --- | --- |
| `differs:declared_not_changed` | possible disagreement, unverified: not among the changed files |
| `differs:not_closing` | possible disagreement, unverified: not among the closing references |
| `differs:not_found` | possible disagreement, unverified: not found in the record |
| `differs:not_reachable` | possible disagreement, unverified: not reachable from the head |
| `differs:head_mismatch` | possible disagreement, unverified: the head is another commit |
| `differs:all_succeeded_mismatch` | possible disagreement, unverified: the check runs read otherwise |
| `differs:count_mismatch` | possible disagreement, unverified: the record holds another count |
| `differs:not_merged` | possible disagreement, unverified: the pull request is not merged |
| `differs:premature` | possible disagreement, unverified: the recorded merge time is later |

`differs:not_closing` is given only for a merged or closed pull request. GitHub computes the closing
references asynchronously after a pull request is opened or its body is edited, so on an open pull
request an issue missing from them is `unanswered:closing_link_unsettled`, as the gate's own claim
is `unverifiable` there (spec 0.1.2, section 7.4). An advisory never gates, but a note should not
claim more than the evidence holds.

Every surface that shows advisories also prints one fixed line beside them. For a record that
carries the published figures (extractor 0.1.1 and comparison 0.2.0), the line states them, filled
from the record:

> Advisories never affect the verdict. Extraction precision 0.80 (24/30, 95% CI 0.63–0.90). A possible disagreement is unverified: on 170 of our own agent PRs, 0 of 20 marked a false claim, and of the 44 advisories the record could check there, none was a false claim (0 of 44).

For a record that carries no figure (a later extractor or comparison, not yet measured), the line
states none. Since extractor 0.1.2 that includes every record the running checker writes: 0.1.2 and
0.1.3, which runs now, each have figures from constructed reports only, which no record carries, and
no precision measured on real pull requests, and 0.1.4, which was reverted, has no figures at all
("Measured figures", below).

> Advisories never affect the verdict. A possible disagreement is unverified: on the reports measured so far it usually reflected a misread of the report, not a false claim.

The surfaces are:

- **The CLI** (`dunstan check --advisory`): the advisory table's `NOTE` column, with the fixed line
  under the advisory heading.
- **The Action**: the check run's summary and the job summary (the advisory row, and a section
  listing each possible disagreement with its kind, value, observed value and clause). The
  check-run title states the gate's verdict only and never mentions an advisory (spec D.11.8,
  item 6).
- **The MCP tool** (`dunstan_check_handback`): its claims-table text is the CLI's. The tool does
  not ask for advisories, so its records carry none today.
- **The hosted endpoint**: `claimsTable` is the CLI's text. The endpoint does not ask for
  advisories either.

**The wording changes presentation only.** The record's `note` is still `differs:<reason>`, and the
wording left the comparison at 0.2.0. A consumer that reads the record reads the same notes. The
record changes since are the figure fields of the advisory section ("Measured figures", below) and
comparison 0.3.0, which keeps `differs:declared_not_changed` only for a path that is a file at the
head ("Paths that are not at the head", below).
`src/advisory/present.ts` holds the wording. `src/advisory/present.test.ts` pins the schemas'
SHA-256 and a record's notes and digests, and checks each surface's text, with and without the
figures.

## The pipeline

1. **Extract** (`extract.ts`): `extractClaims(reportText)` gives proposed claims, each
   `{clause, verb, kind, value, span}`. `span` is the token's code-unit offsets in the report text.
2. **Read** (`advise.ts`, `readingBlock`): the checker reads the evidence the block needs, plus the
   sections the proposed claims need (D.11.5). Then, for each file claim the changed files hold
   neither at its path nor by name, it asks one fixed query for the type of the object at that path
   at the head (`pathsToRead`; "Paths that are not at the head", below).
3. **Compare** (`advise.ts`, `compareAdvisory`): each claim goes to the 0.1 gate check of the same
   field, given a block that holds only that field. The check's row becomes the advisory's
   `observed` and `note`. A file claim is also matched by name ("Bare file names", below), and one
   still not among the changed files is a disagreement only when its path is a file at the head.
   The rules of this step are the **comparison**, versioned apart from the extractor: the record's
   `advisory.comparison.version` is `0.3.0`.

| Kind | Value | Gate check | Notes it can carry |
| --- | --- | --- | --- |
| `file_changed` | path | 7.3 scope, one declared path, then by name, then the path at the head | `agrees`, `agrees_by_name`, `differs:declared_not_changed` (a file at the head), `unanswered:no_such_path`, `unanswered:directory`, `unanswered:source_unreadable:path`, `unanswered:ambiguous_path`, `unanswered:file_list_truncated` |
| `reference_closes` | `#N`, `owner/repo#N` | 7.4 `closes` | `agrees`, `differs:not_closing` (merged or closed pull request), `differs:not_found`, `unanswered:closing_link_unsettled` (open pull request), `unanswered:…` |
| `commit` | 7 to 40 hex | 7.2 if the head starts with it, else 7.4 `cites` (40 hex only) | `agrees`, `differs:not_found`, `differs:not_reachable`, `unanswered:…` |
| `head_commit` | 7 to 40 hex | 7.2 head | `agrees`, `differs:head_mismatch` |
| `checks_succeeded` | boolean | 7.5 `allSucceeded` | `agrees`, `differs:all_succeeded_mismatch`, `unanswered:checks_incomplete`, `unanswered:no_check_runs` |
| `check_count` | integer | 7.5 `total` | `agrees`, `differs:count_mismatch` |
| `tests_passed` | boolean | none | `unanswered:no_comparable_record_field` |
| `test_count` | integer | 7.5 test count, with a record that is not JUnit | `unanswered:no_comparable_record_field` |
| `merged_at` | UTC timestamp | 7.6 `mergedAt` | `agrees`, `differs:premature`, `differs:not_merged` |

Any check whose evidence was not read gives `unanswered:` with that check's own reason
(`evidence_field_unpopulated:<field>`, `source_unreadable:<source>`).

### Bare file names (comparison 0.2.0)

Reports often name a file by its bare name ("added the command to `cli.ts`") while the pull request
changed `packages/tool/src/cli.ts`. Comparison 0.1.0 gave such a claim the gate's exact path check,
so it read `differs:declared_not_changed`: the advisory said the agent claimed a file it did not
touch, when the agent had touched it. Comparison 0.2.0 matches a file claim
against the changed paths by name first. The candidates are the changed entries whose path or
previous path is the value, or ends in `/` and the value. Each candidate is listed once, by its
current path, in code-unit order.

- **A bare name** (no `/`) is always matched by name, never read as a path at the root:
  - one candidate: `agrees_by_name`, with `observed` that full path;
  - more than one: `unanswered:ambiguous_path`, with every candidate in `observed`;
  - none: `differs:declared_not_changed`, as before (since comparison 0.3.0, only when the path is
    a file at the head: "Paths that are not at the head", below).
- **A value with a `/`** keeps the exact comparison, so a changed path is `agrees`. Otherwise it may
  be a path relative to some directory: a suffix of one changed path on segment boundaries is
  `agrees_by_name`, of more than one `unanswered:ambiguous_path`, and of none
  `differs:declared_not_changed`. `ab/cli.ts` is not a suffix of `xab/cli.ts`.
- Names are compared case-sensitively: `CLI.ts` is not `cli.ts`.
- **A file list not read in full** (truncated, unreadable, absent) gives the gate's own
  `unanswered:` reason, as before, and never `differs` or a name match.

`agrees_by_name` never reads as `agrees`. A name match is weaker evidence: the agent may have meant
another file of the same name that the pull request did not change. Reporting it as plain `agrees`
would turn the false `differs` notes of 0.1.0 into silent false agreements. The CLI shows the note
as written, and the Action counts "agree by name only" apart from "agree".

The gate is unchanged. A handback block's `filesChanged` holds repository-relative paths
(`spec/claim-format.md`, section 4), so a block that declares a bare `cli.ts` still fails `declared_not_changed`. Retrieval's
`file_changed` check (D.6) still needs the exact path. Matching by name is for prose, which names
files as people do. The extraction grammar is unchanged too: extractor 0.1.1, digest
`ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360`. A measurement of the
extractor's precision on that digest still holds. (Extractor 0.1.2 later changed the grammar:
"Attribution", below; and 0.1.3 after it: "Lists, merge times and own references", below. 0.1.4
changed it again and was reverted to 0.1.3: "Labels, used names and descriptions", below.)

The rules are pinned by synthetic tests in `advise.test.ts`, "a file named by a bare name or a
partial path (comparison 0.2.0)".

### Paths that are not at the head (comparison 0.3.0)

A file claim that the changed files hold neither at its path nor by name was, through comparison
0.2.0, always `differs:declared_not_changed`. Comparison 0.3.0 first asks what is at that path at
the pull request's head, and keeps the note only for a file:

| At `<head>:<path>` | Note |
| --- | --- |
| a file (`Blob`) | `differs:declared_not_changed`, as before |
| nothing | `unanswered:no_such_path` |
| a directory (`Tree`) | `unanswered:directory` |
| the read failed, or answered in any other shape or type | `unanswered:source_unreadable:path` |

A failed read is never `differs` and never `agrees`. Every other note is unchanged, and so is the
gate: a block's `filesChanged` is still compared by exact path (7.3), and no gate check reads the
answer.

**The query.** The evidence reader (`src/evidence/github.ts`, `readPathObjects`) sends one fixed
GraphQL query per such path, with the expression `<head>:<path>` as a variable. It asks for the
object's type and nothing else, never a blob's content, size or id, or a tree's entries:

```graphql
query($owner: String!, $name: String!, $expression: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) { __typename }
  }
}
```

It is sent only with advisories on, only for a `file_changed` claim the changed files would leave
`differs:declared_not_changed`, and only after the file list was read in full. A claim on a changed
file, a name match, an ambiguous name or a truncated list asks nothing. A bare name or a partial
path is asked at the root, as written: `cli.ts` names `<head>:cli.ts`. The hosted route allowlist
admits this query and the closing-references query, each only as written (`docs/hosted.md`).

**What the record holds.** The answers are the evidence the note was computed from, so they are
recorded beside the notes, not in the 0.1 `evidence`: the advisory section's `pathsAtHead` holds
one entry per path asked, in code-unit order, each `{path, status: "ok", object}` with `object`
`"Blob"`, `"Tree"` or `null`, or `{path, status: "unreadable"}`. A path the reader did not answer is
recorded unreadable. `digests.advisory` covers them; `digests.evidence` and `digests.claims` do not
move. `dunstan verify` recomputes each note from the recorded answers, never from a fresh read, and
names a record whose `pathsAtHead` does not list exactly the paths its claims need.

**Why.** In the open-source study of the advisory reader on public agent-written pull requests
([`experiments/open-source-advisory-2026-10/result.md`](../experiments/open-source-advisory-2026-10/result.md)),
the false accusations were all on `file_changed` claims noted `differs:declared_not_changed`. On the
study's dev half, every one of them named a path that does not exist at the pull request's head,
while 2 of the 3 genuine false claims of that kind named a path that does. The study's
preregistration did not test this, so it is an observation from the dev half only. It is to be
tested on a new held-out sample, preregistered separately.

What it costs, on purpose:

- A genuine false claim about a file that does not exist at the head (a file the agent said it
  added and did not) is now unanswered, not a possible disagreement. On the dev half that was 1 of
  the 3.
- A bare name or partial path whose file lives below the root reads as `unanswered:no_such_path`,
  even if that file exists unchanged elsewhere.

**Comparison 0.3.0 is unmeasured.** The published `differs` figure is bound to comparison 0.2.0
and is not rebound, so a record compared by 0.3.0 carries `null` for `differsAccuracy`, shown as
"unmeasured", until 0.3.0 is measured.

The rules are pinned by synthetic tests in `advise.test.ts`, "a file claim not among the changed
files: does the path exist at the head? (comparison 0.3.0)", "pathsToRead" and the 0.3.0 record and
command-line tests, and in `src/evidence/github.test.ts`, "readPathObjects".

## The grammar, as written

Everything below is `GRAMMAR` in `src/advisory/grammar.ts`. The record's
`advisory.extractor.digest.sha256` is the SHA-256 over its JCS bytes. `src/advisory/docs.test.ts`
checks that each list here matches the code word for word.

### What is not read

- Fenced code blocks (` ``` ` or `~~~`), including the handback block itself.
- Lines quoted with `>`.
- Log lines: a line (after any list marker) that opens with a log level from `logLevels`, a
  bracketed prefix such as `[vitest]`, a timestamp, a shell prompt `$ `, a test-runner glyph (✓ ✗ ×
  ✔ ✘ ❯ ›), or `error:`, `warning:` or `error TS1234:`.
- HTML comments.

Inline code and URLs are kept, each as a single token. A token in inline code that holds a space (a
phrase or a command) is never a candidate. A URL is a candidate only if it is a GitHub issue or pull
request URL, and only when a closing keyword binds it.

### Clauses

A clause ends at `.` `;` `:` `!` or `?` closing a word, at a blank line, at a list item, heading or
table cell, and before a word in `subordinators`. A soft-wrapped line continues its clause. A colon
directly after a closing keyword does not end a clause ("Fixes: #12"). A clause ending in `?` is a
question and is dropped. A clause opened by a word in `conditionals` asserts nothing. Since 0.1.3 a
colon still ends its clause, but a file list or a merge time after it can bind to the clause before
it ("Lists, merge times and own references", below).

### Tokens

- **Path.** A repository-relative path: no leading `/`, `~` or `..`, no `//`, no trailing `/`. The
  last segment has an extension starting with a letter (`.ts`, `.json`), or is a name in
  `extensionlessFiles`. A leading hidden directory (`.github/`) is allowed. A `:line:col` or
  `(line,col)` suffix is dropped. A bare name (no `/`) must look like a file name: lower-case
  (`package.json`) or an all-capitals stem (`README.md`). It must not end in a host extension from
  `hostExtensions`. An extensionless name needs inline code. Inline code lifts the bare-name rule.
  A first segment that is a host name (`example.com/…`) is not a path.
- **Issue.** `#N`, `owner/repo#N`, or a GitHub issue or pull request URL.
- **SHA.** 7 to 40 hex digits holding at least one digit and one letter. An all-decimal run or user
  id is never one, and neither is a hex word such as `deadbeef`.
- **Timestamp.** `YYYY-MM-DDTHH:MM:SS[.fff]Z`.
- **Count.** An integer of up to six digits.

### The binding rule

A token is a claim only when it is bound to an asserting verb in its own clause.

1. **Nearest verb to the left.** Scan left from the token. The first word in any verb list
   (`verbs.*`) is its verb. The scan stops with no binding if it meets, first, a negation, a modal,
   or an infinitive `to` (a `to` followed by a plain word that is not a determiner). It also stops
   after `window` (8) words. Tokens of the token's own class do not count toward the window, so
   every path in "updated a.ts, b.ts and c.ts" binds. For a path, two more barriers stop the scan
   (see "Asides and analogues" below): an opening bracket from `brackets` still unclosed at the
   path, and a phrase from `analogues`.
2. **Asserting.** The verb must not follow `to`. It must not be an adjective or noun: a verb form
   after a word in `determiners` is one ("the updated docs", "the fix"), unless that word is in
   `subjectDeterminers` and the verb is a third-person form ("This updates…"). No modal or negation
   may stand in the three words before it. A third-person form that opens its clause and is
   followed by a word in `nounPrepositions` is a noun ("Changes to src/a.ts…").
3. **By class:**
   - a path binds to a verb in `verbs.file`, or to a past participle after one or more
     `passiveFillers` ("src/a.ts was updated"). A path after a word in `commandWords`, or after a
     flag (`-x`, `--x`), within three words, is a command argument and never binds;
   - an issue binds to a verb in `verbs.close`, with only issues and `closeFillers` between them;
   - a SHA is `head_commit` after `head` with only `headFillers` between them. Otherwise it is
     `commit` when its verb is in `verbs.commit`, or when the word before it is in `commitNouns`
     and its verb is a file, close, merged or `verbs.implement` verb ("implemented in commit
     3f2a1b9"). A SHA with a word in `shaBlockers` in the two words before it never binds;
   - a timestamp binds to `merged`, with only `mergedFillers` between them, or across a colon
     (0.1.3, below);
   - a subject from `checksNouns` or `testsNouns` (or "check runs") binds to the first word of
     `verbs.pass` or `verbs.fail` after it, with only `predicateFillers` between them. A negation
     between them flips the value. A count directly before the subject gives `check_count` or
     `test_count` when the value is true. `checks` names all checks only when nothing but
     `checksQualifiers` stands before it, so "the lint checks pass" is not read. A predicate
     followed within two words by one of `exceptions` ("except lint") is not read. The object form
     "passed CI" or "passes all tests" binds a pass verb to a subject after it, with only
     `objectFillers` between them;
   - a count before `tests` binds to a verb in `verbs.ran`, with only `countFillers` between them
     ("ran all 42 tests").
4. **Once.** Each `(kind, value)` is proposed once, at its first clause.
5. **This pull request's.** A bound claim is still dropped when its clause is about another pull
   request or repository, a change made and undone, a baseline head, a negated list, or a failure
   staged on purpose (see "Attribution" below).

### Asides and analogues (extractor 0.1.1)

A path can be named as a model rather than as the thing changed. Extractor 0.1.0 read "Rewrote the
timetable (laid out like `ports/winter.md`)" as a claim that `ports/winter.md` changed: `like` was
in no list, so it neither bound nor stopped the scan, which ran on past the bracket to `Rewrote`.
The path is what the timetable copies, not the object of `Rewrote`. 0.1.1 adds two barriers to the
left scan from a path:

1. **An open bracket.** Scanning left from a path, the scan stops at the innermost opening bracket
   still unclosed at the path. The pairs are `brackets`: `(…)` and `[…]`. A closing bracket closes
   only its own kind, and one with nothing to close is ignored. So a verb outside an aside does not
   bind a path inside it, and a verb inside does: "edited the timetable (like `ports/north.csv`)" is
   not a claim, "added `a.ts` (also edited `b.ts`)" claims both. With nesting, only the innermost
   bracket counts: in "edited the timetable (also updated the fares [`fares.csv`])", `updated` is
   outside the `[` and does not bind. A bracket closed before the path is no barrier: "added two
   crossings (for the winter) to `ports/north.csv`" binds. The text of a markdown link,
   `[text](target)`, is the thing named, not an aside, so its brackets are not counted: "updated
   [`src/a.ts`](src/a.ts)" binds. Brackets inside inline code and URLs are not counted either.
2. **An analogue.** A phrase from `analogues` between the verb and the path stops the scan: "added
   a timetable based on `ports/north.csv`", "added a fare rule analogous to `fares/summer.ts`". A
   path before the phrase still binds: "adds `ports/north.csv` (modelled on the summer timetable)",
   and in "updated `a.ts` and `b.ts`, like `c.ts`" only `a.ts` and `b.ts` bind. `cf` and `e.g.`
   written with a final period already end their clause (a period closing a word ends a clause), so
   the list entry `cf` is for the form without one.

Left out, on purpose:

- **`following`.** "Changed the following files `a.ts` and `b.ts`" names the verb's own objects, so
  `following` is not a barrier, and that sentence binds both paths. Written with a colon, "Changed
  the following files: `a.ts`, `b.ts`", the colon ends the clause, as every colon has since 0.1.0,
  and through 0.1.2 the list after it had no verb, so it bound nothing. Since 0.1.3 the list binds
  to the verb of the clause before the colon ("Lists, merge times and own references", below).
- **Exemplifiers** (`such as`, `e.g`, `for example`). What they introduce is usually an instance of
  the verb's object: "updated the workflows, such as `ci.yml`" says `ci.yml` was updated.
- **Issues, SHAs, timestamps and subjects.** The barriers apply to paths only, the class the defect
  was found in. "Pushed the fix (3f2a1b9c)" binds as before.

The cost is recall: a writer who names the file in an aside, "added a regression test
(`src/parse.test.ts`)", is not read. That is the trade this extractor makes throughout.

Both barriers are pinned by synthetic tests in `extract.test.ts`, "not a claim: a path in an aside
or an analogue (extractor 0.1.1)" (one per bracket form, nested brackets, and one per analogue
phrase) and "still a claim beside the aside and analogue rules (extractor 0.1.1)".

### Attribution (extractor 0.1.2)

The extractor's rules and their tests are in `src/advisory/`.

### Lists, merge times and own references (extractor 0.1.3)

Through 0.1.2 every colon ended a clause, so a list after "Files changed:" had no verb, and a
timestamp after "Merged at:" had no `merged`. An issue that no closing keyword bound made its whole
clause another pull request's, so a pull request's own "closes #12" beside "builds on #10" was
dropped. A closing keyword in a parenthetical history, and a failure narrated "by design", were
read as claims. 0.1.3 adds one rule for each. Rules 1 to 3 add claims; rules 4 and 5 only drop
them.

1. **A file list after a colon.** A clause that ends in a colon, is about this pull request (not
   conditional, transient or elsewhere, and not staged as in rule 5), and holds a word in
   `fileListNouns` with an asserting file verb heads a file list. The verb either follows the noun,
   with only `passiveFillers` and `fileListSubjects` between ("Files changed:", "the files I
   changed:"), or is the noun's nearest verb to its left within the window, with no negation, modal
   or word in `nounPrepositions` between ("Changed the following files:", but not "added tests for
   the following files:"). A verb directly after "be" is a plan ("Files to be changed:"). The list
   is the clause after the colon on the same line, or, on the lines after, the list items that
   follow it (nested under it when the head is a list item itself), until a clause that is not in
   such an item. A path in the list binds to the head's verb when the list clause holds no verb,
   negation or modal of its own, and the scan left from the path meets no bracket opened since the
   head and no analogue, within the window. The claim's clause runs from the head to the list
   clause. "Files: `a.ts`" has no verb and still binds nothing.
2. **A merge time across a colon.** A timestamp that opens the clause after a colon on the same
   line binds as `merged_at` when the clause before the colon is about this pull request and ends
   in an asserting `merged` (not after "be") with only `mergedFillers` after it ("Merged at:", "It
   was merged into main at:"), or is exactly a phrase in `mergeTimeLabels` ("Merge time:"). So does
   a timestamp alone before a colon, after only `mergedFillers`, when the clause after it on the
   same line opens with an asserting `merged` after only `mergedFillers`, and neither clause is
   about another pull request: "At 2026-10-01T12:00:00Z: merged into main." "Merged at
   2026-10-01T12:00:00Z: …" bound in 0.1.2 already. A timestamp on the next line is not read: a
   line that opens with one is a log line.
3. **This pull request's own closing keyword or commit.** Through 0.1.2 an issue that no closing
   keyword binds made the whole clause another pull request's. Since 0.1.3, a `reference_closes` or
   a `commit` in such a clause is still proposed unless the other reference is the verb's subject:
   it stands directly before the verb, with only `subjectFillers` between and no comma ("PR #10
   closes #12", "#10 was pushed as …"), or it is a possessive anywhere before the verb ("#10's fix
   landed in commit …"). So "Builds on #10 and closes #12" and "As discussed in #10, this closes
   #12" close #12, and "Cherry-picked the fix from #10 in commit …" is a commit. Every other claim
   in such a clause is still dropped, and the rule does not apply to a clause about another
   repository or one carried over by a pronoun ("PR #10 was merged. It closes #12.").
   `verbs.implement` (`implemented`, `implements`) binds a SHA after a word in `commitNouns`, as
   file verbs do: "Implemented in commit 3f2a1b9c". It binds no path.
4. **A closing keyword in a parenthetical history.** A closing keyword inside a bracket still open
   at it binds only when nothing but `asideCloseFillers` stands between the bracket and it:
   "(closes #12)" and "(this PR also fixes #12)" bind, "(the earlier fix closed #12 and #13)" does
   not.
5. **A failure narrated by design.** `by design` is a phrase in `narrations`, so "the checks fail by
   design" proposes no `checks_succeeded: false`. A narrated clause that holds a phrase in
   `stagings` before its first fail predicate says the edit itself was made to cause the failure,
   and proposes no file claim either: "deliberately removed the guard from `src/guard.ts` so the
   tests fail", "the mutation removed the check in `src/a.ts` and the tests fail". After the fail
   predicate the phrase describes the failure, not the edit: "updated `src/a.test.ts` so the new
   case fails by design" binds. A file claim in a narrated clause with no staging ("added
   `src/a.test.ts`, and the new tests fail as expected without the fix"), or with no fail predicate
   ("removed `src/legacy.ts` by design"), binds as before. `without`, `as expected` and
   `as intended` are not stagings: they usually describe a test the pull request really adds.

What each costs, on purpose:

- `implemented` is a verb, so it stops the scan from a path: in "updated the parser and implemented
  the cache in `src/cache.ts`" the path is no longer bound to `updated`.
- A closing keyword after any word but `asideCloseFillers` in a bracket is dropped, history or not:
  "(previously fixed #12, now closes #13)" and "(this change closes #12)" close nothing.
- A staging phrase before the fail predicate drops the clause's paths, even a real one: "added a
  regression test to `src/a.test.ts` on purpose, so the build fails without the fix" is not read.
- A file list or a merge time is a new claim where 0.1.2 proposed none, so each is a new chance of
  a misread that has not been measured. A head such as "Updated the tests for these files:" is
  stopped by its preposition, but other heads whose list is not the verb's object are not.

Left as they were, on purpose:

- **Attribution, transient or narration context in a neighbouring clause.** 0.1.3, like 0.1.2,
  reads one clause, plus the pronoun carry-over of the attribution rules, the list after a
  file-list head, and the clause either side of a merge-time colon. Reading context across clauses
  in general is a design change, not a rule.
- **A bare repository name with no repository noun** ("files in example_docs"). It still cannot be
  told from a directory without the repository's own list of names.

Each rule is pinned by synthetic tests in `extract.test.ts`: "a file list after a colon (0.1.3)",
"a merge time across a colon (0.1.3)", "this pull request's own closing keyword or commit beside
another reference (0.1.3)", "a closing keyword in a parenthetical history (0.1.3)", "a failure
narrated by design, and the edit that staged it (0.1.3)", "not read since 0.1.3, even where it was
meant" and "still a claim beside the 0.1.3 rules". For the rules that add a claim, 0.1.2 proposed
none of the claims each positive expects; for the rules that drop one, it proposed the claim each
negative drops.

### Labels, used names and descriptions (extractor 0.1.4, reverted)

Extractor 0.1.4, digest `78b92a682063464faf3cf1de13123d2b232bb3575effd5f31f0e12905643d45c`, ran on
2026-10-07 and was reverted the same day. It added five rules, each of which only dropped a file
claim: the plural noun of a bold label ("**Fare updates** — …") was not a verb; an operand phrase
(`use of`, `command for`, …) stopped the binding as an analogue does; a path put into another path
("Added `ferry.schedule` to `services.json`") was not a changed file; and neither was a path in a
clause opened by `a` or `an` with a third-person verb, or in a relative clause in the past passive.
The rules were written from the misreads labelled in the dev half of the open-source study
(`experiments/open-source-advisory-2026-10/`).

**Why it was reverted.** The rules did not generalise. The study's refutation test 2 asked whether
the fixed extractor's share of false accusations on the held-out test half fell below the
baseline's on the same half. It did not: 18 of 120 checkable advisories for both, 0.150. The rules
removed misreads only in the dev half they were written from
([`experiments/open-source-advisory-2026-10/result.md`](../experiments/open-source-advisory-2026-10/result.md)).

The revert is exact: the grammar's lists, rules and version are 0.1.3's, so its digest is
`2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37` again, and 0.1.4's rules and
their tests are gone from `src/advisory/`. Records written by 0.1.4 name its digest and verify only
with checker 0.1.4. No figure was ever published for 0.1.4.

### The lists

- `verbs.file`: added, adds, adjusted, adjusts, amended, amends, changed, changes, created, creates, deleted, deletes, edited, edits, extended, extends, fixed, fixes, modified, modifies, moved, moves, patched, patches, refactored, refactors, removed, removes, renamed, renames, replaced, replaces, reworked, reworks, rewrites, rewritten, rewrote, touched, touches, tweaked, tweaks, updated, updates
- `verbs.close`: close, closed, closes, fix, fixed, fixes, resolve, resolved, resolves
- `verbs.commit`: cherry-picked, committed, landed, pushed
- `verbs.merged`: merged
- `verbs.implement`: implemented, implements
- `verbs.ran`: executed, ran
- `verbs.pass`: green, pass, passed, passes, passing, succeed, succeeded, succeeds
- `verbs.fail`: fail, failed, failing, fails, red
- `verbs.other`: built, cited, compiled, contain, contains, described, describes, exist, exists, expect, expected, explained, explains, found, generated, generates, ignored, imported, included, includes, inspected, install, installed, kept, left, lives, located, logged, looked, mentioned, mentions, opened, pointed, printed, prints, re-ran, re-run, read, referenced, requires, reran, rerun, returned, returns, reviewed, said, saw, says, see, seen, showed, shown, shows, skipped, stored, tested, used, viewed, wrote, written
- `modals`: can, could, expect, going, hope, intend, may, might, must, need, needs, plan, please, shall, should, todo, try, trying, want, wants, will, would
- `negations`: neither, never, no, none, nor, not, without
- `determiners`: a, an, any, each, every, her, his, its, my, our, some, that, the, their, these, this, those, your
- `subjectDeterminers`: that, this
- `subordinators`: after, although, because, before, but, if, once, since, that, though, unless, until, when, whenever, where, whereas, which, while, who
- `conditionals`: if, once, unless, until, when, whenever
- `nounPrepositions`: across, for, from, in, of, on, to, under, within
- `closeFillers`: &, and, bug, bugs, issue, issues, ticket, tickets
- `asideCloseFillers`: also, and, pr, this
- `mergedFillers`: as, at, been, into, main, master, of, on, the, was
- `mergeTimeLabels`: merge time, merge timestamp
- `fileListNouns`: file, files, path, paths
- `fileListSubjects`: i, we
- `predicateFillers`: again, all, also, are, been, both, did, do, does, has, have, is, locally, never, no, not, now, still, turned, was, went, were
- `passiveFillers`: also, are, been, both, has, have, is, now, was, were
- `objectFillers`: all, required, the
- `countFillers`: all, the
- `exceptions`: apart, besides, except, excluding, other, save
- `headFillers`: at, commit, is, now, sha, was
- `analogues`: analogous to, as in, based on, cf, compared to, compared with, like, matching, mirroring, modeled on, modelled on, same as, similar to, unlike
- `brackets`: (), []
- `selfNames`: this change, this pr, this pull request
- `repositoryNouns`: repo, repos, repositories, repository
- `ownRepository`: our, same, the, this
- `pronouns`: it, they
- `possessives`: its, their
- `subjectFillers`: already, also, had, has, have, is, itself, now, then, was, were
- `transients`: backed out, reverted, reverting, temporarily, then deleted, then removed, throw-away, throwaway, undid, undone
- `baselines`: base, baseline, earlier, former, old, original, previous, prior
- `remotePrefixes`: origin/, upstream/
- `narrations`: as expected, as intended, by design, deliberately, intentionally, mutant, mutants, mutation, mutations, on purpose, without
- `stagings`: by design, deliberately, intentionally, mutant, mutants, mutation, mutations, on purpose
- `narrationOpeners`: before
- `finalStates`: now, with it, with the change, with the fix, with this change
- `commandWords`: bash, biome, bun, cargo, cat, cd, chmod, cp, curl, deno, docker, gh, git, go, grep, jest, kubectl, ls, make, mkdir, mv, node, npm, npx, pnpm, pytest, python, python3, rm, ruby, sh, touch, tsc, tsx, vitest, yarn
- `shaBlockers`: account, attempt, build, id, ids, issue, job, jobs, key, node, org, pr, run, runs, step, token, uid, user, users, uuid, workflow
- `commitNouns`: commit, commits, sha
- `checksNouns`: checks, ci
- `checksQualifiers`: all, and, ci, required, status, the
- `testsNouns`: specs, suite, tests
- `extensionlessFiles`: CODEOWNERS, Dockerfile, Gemfile, Justfile, LICENSE, Makefile, NOTICE, Procfile, Rakefile
- `hostExtensions`: ai, app, co, com, dev, io, net, org
- `logLevels`: DEBUG, ERR, ERR!, ERROR, FAIL, FATAL, INFO, OK, PASS, SKIP, TRACE, WARN, WARNING

A word ending in `n't` is a negation, and a word ending in `'ll` is a modal.

## False-positive classes

The extractor's rules and their tests are in `src/advisory/`.

## Precision

`src/advisory/precision.ts` holds the published measurements, each keyed by what it was taken on.
A published figure for advisories gives two numbers, each bound to what it measured:

1. **Extraction precision**: the share of proposed claims that are claims the report really makes.
   It is bound to the extractor digest, and is what `precision` carries.
2. **The accuracy of `differs` notes**: the share of `differs` notes that mark a claim the record
   really contradicts. It is bound to the extractor digest and the comparison version
   (`advisory.comparison.version`): the grammar decides which claims are proposed, and the
   comparison decides whether a real claim reads `agrees` or `differs`. It is what
   `differsAccuracy` carries, with the corpus's base rate beside it.

One number is not enough. Comparison 0.1.0 shows why: an extractor that proposed the right file
claims still raised `differs` notes that were wrong, because it compared bare names by exact path.
A precision measured on extraction alone says nothing about that.

`precisionFor(digest)` and `differsAccuracyFor(digest, comparison)` return a figure only on an
exact match of every key. When the grammar changes, the digest changes; when the comparison
changes, its version changes. Either way the record's figure returns to `null`, shown as
"unmeasured", until the new version is measured. No version inherits a figure from another.
`dunstan verify` recomputes both figures from the running checker's table, so a record cannot carry
a figure that was not published for its extractor and comparison. `src/advisory/precision.test.ts`
pins the binding.

## Measured figures

Published 2026-10-05: value, n and method only. The reports, their clauses and the adjudication
labels are not published.

The table below is for extractor 0.1.1. Extractor 0.1.2, digest
`dfd6563a934667a80448e49b7133ade6d2473e5e13cd9d05fd52c761a1a1780b`, ran from 2026-10-05. It now
has figures measured on constructed reports ("Extractor 0.1.2 on constructed reports (recall)",
below), but no precision measured on real pull requests, so its records still carry `null` for both
figures. Extractor 0.1.3, digest
`2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`, ran from 2026-10-06. Extractor
0.1.4, digest `78b92a682063464faf3cf1de13123d2b232bb3575effd5f31f0e12905643d45c`, ran on 2026-10-07
and was reverted ("Labels, used names and descriptions", above); no figure of any kind is published
for it. The extractor that runs since 2026-10-07 is 0.1.3 again, digest
`2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`. It has figures measured on
constructed reports ("Extractor 0.1.3 on constructed reports (recall)", below), and no precision
measured on real pull requests. So a record the running checker writes carries `null` for both
figures, shown as "unmeasured", until a precision measured on real pull requests is published for
0.1.3. No figure here is rebound to it. The `differs` figure and its base rate are bound to
comparison 0.2.0 too, and the comparison that runs since 2026-10-07 is 0.3.0 ("Paths that are not
at the head", above), so `differsAccuracy` stays `null` until 0.3.0 is measured.

| Figure | Value | n | Wilson 95% interval | Bound to |
| --- | --- | --- | --- | --- |
| Extraction precision | 0.80 (24 real claims) | 30 advisories | [0.627, 0.905] | extractor 0.1.1, digest `ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360` |
| `differs` notes that marked a genuinely false claim | 0 | 20 `differs` advisories | [0, 0.161] | extractor 0.1.1 (same digest) and comparison 0.2.0 |
| Base rate: genuine false completion claims | 0 | 44 checkable advisories (of 149) | [0, 0.080] | extractor 0.1.1 (same digest) and comparison 0.2.0 |

**Method.** Extractor 0.1.1 proposed 149 advisories on 170 of Barg Labs' own merged agent pull
requests. For extraction precision, a seeded held-out sample of 30 of those 149 was drawn, and the
operator adjudicated each as a claim the report really makes or not: 24 were. For the `differs`
figure, every `differs` advisory under comparison 0.2.0 on the same 170 pull requests was
adjudicated, a census of 20: none marked a genuinely false claim. For the base rate, the 44
advisories the record could check (24 that agreed with it and the 20 adjudicated `differs`) held no
genuinely false completion claim. The other 105, mostly test counts with no record to compare with,
could not be checked and were not judged, so a false claim among them would not have been seen. Each interval
is the Wilson score interval at 95%. The record carries each bound to five places, so that it rounds
correctly both to the three places above and to the two places of the fixed line.

**What the base rate means.** The base rate is always shown next to the `differs` figure. It
changes how 0 of 20 reads. Among the 44 advisories the record could
check there was no genuine false completion claim (0 of 44), so there was little for a `differs`
note to find. 0 of 20 therefore says that every `differs` note on
this corpus was a false alarm. It does not say that the check failed to catch false claims, and it
says nothing about how often a `differs` note catches one when there is one to catch.

**Not yet "mismatch".** Wording that calls a `differs` note a mismatch is earned only past a
preregistered bar, measured on a corpus that contains false claims (decided 2026-10-05). That has
not yet happened, so a `differs` note is still shown as "possible disagreement, unverified".

In the record, each figure is `{value, n, interval, pullRequests, method, source}`, with `source`
"operator-adjudicated, Barg Labs internal corpus, 2026-10-05", and `differsAccuracy` adds
`baseRate` in the same form (spec D.11.2).

### Extractor 0.1.2 on constructed reports (recall)

Measured for extractor 0.1.2, digest
`dfd6563a934667a80448e49b7133ade6d2473e5e13cd9d05fd52c761a1a1780b`, and comparison 0.2.0, on
constructed reports, not on real pull requests. They are kept apart from the table above because
those figures come from real pull requests and are carried in records, while these come from
constructed reports and are never carried in a record: a record extractor 0.1.2 wrote carries
`null` for both figures.

The corpus holds 430 constructed reports: 380 carry one planted false claim each, and 50 are clean.
The corpus and its four claim types are described at
https://cejel.dev/experiments/jev-judge-2026-09-20/.

| Planted claim type | Flagged | n |
| --- | --- | --- |
| wrong file (`scope_mismatch`) | 98 | 98 |
| wrong count (`wrong_count`) | 82 | 82 |
| premature completion (`premature`) | 0 | 100 |
| fabricated reference (`fabricated_reference`) | 0 | 100 |
| **all planted** | **180** | **380**: recall 0.474, Wilson 95% [0.424, 0.524] |

- **Precision on the same run.** 180 of the 215 `differs` notes fell on the planted claim: 0.837,
  Wilson 95% [0.782, 0.881].
- **Clean reports.** 1 `differs` note across the 50 clean reports.
- **The preregistered bar was not met.** The bar was a recall of at least 0.50; the recall measured
  is 0.474.

**Method.** Each report was read by the extractor, and its advisories were compared with the
report's record. A planted claim counts as flagged when a `differs` note falls on it. Both zeros
were predicted before the run, from the sentence shapes the grammar does not read: a colon ends the
clause before "merged", and a `#N` makes the clause about another pull request.

### Extractor 0.1.3 on constructed reports (recall)

Measured for extractor 0.1.3, digest
`2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37`, and comparison 0.2.0, on the
same 430 constructed reports as the 0.1.2 subsection above, not on real pull requests. As with
0.1.2, these figures are never carried in a record: 0.1.3 has no precision measured on real pull
requests, so a record extractor 0.1.3 writes carries `null` for both figures.

| Planted claim type | Flagged | n |
| --- | --- | --- |
| wrong file (`scope_mismatch`) | 98 | 98 |
| wrong count (`wrong_count`) | 82 | 82 |
| fabricated reference (`fabricated_reference`) | 100 | 100 |
| premature completion (`premature`) | 0 | 100 |
| **all planted** | **280** | **380**: recall 0.737, Wilson 95% [0.690, 0.779] |

- **Precision on the same run.** 280 of the 315 `differs` notes fell on the planted claim: 0.889,
  Wilson 95% [0.849, 0.919].
- **Clean reports.** 1 `differs` note across the 50 clean reports.
- **The preregistered bar was met.** The bar was a recall of at least 0.50; the recall measured is
  0.737.
- **What changed from 0.1.2.** Only the 100 `fabricated_reference` plants, from 0 flagged to 100.
  Nothing else moved.
- **The misses are one sentence shape.** Every `premature` plant opens `Status as of <time>: …`,
  the template published in the Jev preregistration
  (https://github.com/BargLabs/jev-judge-calibration/blob/main/jev-judge-calibration-preregistration-2026-09-19.md).
  0.1.3's merge-time rule does not read that shape. The zero was predicted before the run, as both
  of 0.1.2's zeros were.

**Method.** The same as for 0.1.2: each report was read by the extractor, and its advisories were
compared with the report's record. A planted claim counts as flagged when a `differs` note falls on
it.

## What it does not do

- It does not use a model reader. That is DRAFT 0.2.0 D.1 to D.10 (`docs/retrieval.md`).
- It does not measure itself. The figures above were measured outside this repository and are
  published here as constants.
- It never changes a gate verdict.

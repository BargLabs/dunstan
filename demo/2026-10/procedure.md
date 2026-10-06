# Conversion procedure

Source: the conversion procedure fixed for Dunstan's acceptance run on 4 October 2026, section `## Rules` only, copied verbatim apart from that heading's level. A demo PR stands where that procedure says "row": the block is made from the PR's report (its body) and the PR, by these rules.

### Rules

**Rule 0. Nothing is inferred that the report does not say.** A field is declared only when the rules
below produce it. When in doubt whether a sentence asserts a claim, it is not declared, and it is
listed under `notConverted` with the reason. A token that appears in a report is not a claim; only a
clause that asserts something (changed, added, ran, passed, merged at, closes, cites) is.

**Rule 1. `dunstan`** is `"0.1"`.

**Rule 2. `headCommit`** is the pull request's `head.sha`.

**Rule 3. `filesChanged`** is every `filename` from the files listing, each once, in code-unit order.
A removed file is included. A renamed file is listed by its new path (`filename`), not its
`previous_filename`.

**Rule 4. `mergedAt`** is the pull request's `merged_at`, copied as the API gives it.

**Rule 5. `tests`.** One entry per distinct test-count assertion in the report.

- A test-count assertion is a sentence, list item or table row in the report's own text that states a
  number of test cases that a test run executed or passed (`305 tests passed`, `438/438`, `12 passing`,
  `Tests 40 passed (40)`). A runner's summary line inside a fenced block counts when the report
  presents that block as output of a run it made.
- Not test-count assertions: counts of test files, suites, assertions, fixtures, checks or other
  objects; counts the report attributes to another pull request, to `main`, or to an earlier state it
  then supersedes; predicted or required counts ("should be 40"); a pass with no number
  ("tests pass", "preflight green").
- `command` is the command the assertion names, as written, without surrounding backticks. When the
  assertion names none, `command` is the literal string `not stated in report`.
- `count` is the stated number of executed test cases: the stated total if the assertion states one
  (`N/N`, `N tests`, `(N)`), otherwise the stated passed number plus any stated failed number.
  Skipped tests are not counted.
- `failures` is declared only when the assertion states a number of failed tests, including zero
  (`0 failed`, `no failures`). `N/N passed` alone does not declare `failures`.
- `record` is a `junit` record only if the report names all four of the workflow file, job, artifact
  and path inside the artifact. Otherwise it is `{"kind": "unspecified"}`. Under the specification
  that count is expected to be `unverifiable` (`no_comparable_record_field`).
- Distinct means a distinct (`command`, `count`, `failures`) triple. Entries are in order of first
  appearance in the report.

**Rule 6. `checks`.** Declared only when the report asserts something about the pull request's own CI
check runs (CI, checks, status checks, required checks, workflow runs on this pull request).

- `allSucceeded: true` when the report asserts that all of them passed ("CI green", "all checks
  pass", "every required check succeeded"). `allSucceeded: false` when it asserts that one failed on
  this pull request and does not later assert that it was fixed.
- `total` when the report states a number of check runs ("17/17 checks", "all 12 checks").
- Not checks assertions: local commands (preflight, lint, typecheck, a test script run locally) even
  when they mirror CI; CI that is yet to run or pending ("CI will run", "awaiting CI"); CI on another
  pull request or on `main`.
- If the report makes more than one such assertion, the last one in the report text is used.

**Rule 7. `references`, issues and pull requests.**

- A reference is `#N`, `owner/repo#N`, or a URL `https://github.com/{owner}/{repo}/issues/{N}` or
  `.../pull/{N}`, in the report's own text, used to refer to an issue or pull request. It is written
  `#N` when it is in the subject repository and `owner/repo#N` otherwise.
- Not references: anything inside a fenced block or inline code span that quotes a log, command or
  output; `#N` that is not a GitHub reference in its clause (list numbering, "step #2", a rank, a
  heading anchor, a colour, an HTML entity).
- `relation` is `closes` when a GitHub closing keyword (close, closes, closed, fix, fixes, fixed,
  resolve, resolves, resolved; any case; optional colon) immediately precedes the reference and the
  clause is not negated ("does not close", "not fixing"). In "Closes #A and #B" both are `closes`:
  the report asserts both. Every other reference is `cites`.
- One entry per distinct reference, in order of first appearance. A reference that is both `closes`
  and `cites` in the report is declared once, as `closes`.

**Rule 8. `references`, commits.** A commit is declared (`{"commit": "<sha>", "relation": "cites"}`)
only when the report gives its full 40-character id and asserts that it is a commit of this pull
request (its head, a commit on its branch, "this PR's commit"). An abbreviated id cannot be declared
in 0.1 and is listed under `notConverted`. An id the report attributes to another pull request, a
branch other than this one, `main` or another repository, or that is not a commit (a digest, a run
id, a date stamp), is not declared.

**Rule 9. `deployedAt`** is declared only when the report asserts a successful deployment to a named
environment with a time. Otherwise it is absent.

**Rule 10. The report the checker reads.** The report bytes are the UTF-8 encoding of the report
text (above), then `\n\n`, then the block as a fence:

````
```dunstan-handback
<the block as JSON, two-space indent>
```
````

followed by `\n`. The report text is not otherwise changed. It is written to a git-ignored file and
passed as `--report-file`, since the block travels in the report.

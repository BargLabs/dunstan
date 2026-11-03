# Test records Dunstan can read

A `tests` claim in a handback block ("142 tests, 0 failed") is checked against a JUnit XML file that
a CI run of the pull request's head uploaded as an artifact (spec section 7.5). Most repositories
publish no such file, so most test claims cannot be checked from the record: the counts an agent
reports come from a run on its own machine, or from CI logs Dunstan does not read. This page gives
one CI recipe per common test runner. Each adds a test command that writes JUnit XML and one step
that uploads it, so the record holds the counts and a `tests` claim can pass or fail.

Every recipe uploads the same thing:

- an artifact named `dunstan-junit`,
- holding one file, `junit.xml`,
- uploaded under `if: ${{ !cancelled() }}`, so a run whose tests fail still publishes its record
  (the claim then declares the failures, and a claim of none fails),
- with `if-no-files-found: error`, so a run that wrote no file says so instead of uploading nothing.

The upload step, as each recipe ends:

```yaml
      - name: Upload the test record for Dunstan
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: dunstan-junit
          path: junit.xml
          if-no-files-found: error
```

The recipes are for GitHub Actions and are examples: keep your own checkout, setup and caching
steps, and replace only the test command and add the upload. The JUnit samples in
`test/junit-reporters/` were written by hand from each reporter's documented output shape, not
captured from a run.

## pytest

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      # ... set up Python and install the project ...
      - run: pytest --junitxml=junit.xml
      - name: Upload the test record for Dunstan
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: dunstan-junit
          path: junit.xml
          if-no-files-found: error
```

## Jest (jest-junit)

Add `jest-junit` as a development dependency. It writes `./junit.xml` by default.

```yaml
      - run: npx jest --ci --reporters=default --reporters=jest-junit
        env:
          JEST_JUNIT_OUTPUT_NAME: junit.xml
      # ... the upload step ...
```

## Vitest

```yaml
      - run: npx vitest run --reporter=default --reporter=junit --outputFile.junit=junit.xml
      # ... the upload step ...
```

## Maven Surefire

Surefire writes one `TEST-<class>.xml` per test class. `dunstan junit-merge` joins them into the
one file the record names. Run it through `npx`, pinned to the Dunstan release that carries it
(0.1.14 and later), and under `if: ${{ !cancelled() }}` too, so a failing run's files are still
merged.

```yaml
      - run: mvn -B test
      - name: Merge the test reports
        if: ${{ !cancelled() }}
        run: npx -y dunstan@0.1.15 junit-merge target/surefire-reports/TEST-*.xml --out junit.xml
      # ... the upload step ...
```

In a multi-module build, list every module's reports: for example
`shopt -s globstar && npx -y dunstan@0.1.15 junit-merge **/target/surefire-reports/TEST-*.xml --out junit.xml`.

## Gradle

Gradle writes one file per test class under `build/test-results/test/`.

```yaml
      - run: ./gradlew test
      - name: Merge the test reports
        if: ${{ !cancelled() }}
        run: npx -y dunstan@0.1.15 junit-merge build/test-results/test/*.xml --out junit.xml
      # ... the upload step ...
```

## Go (gotestsum)

```yaml
      - run: go run gotest.tools/gotestsum@v1.12.0 --junitfile junit.xml -- ./...
      # ... the upload step ...
```

## `dunstan junit-merge`

```sh
dunstan junit-merge <file>... --out <file>
```

It reads the inputs in code-unit order of their paths, so any order on the command line writes the
same bytes. Each must be well-formed JUnit XML as Dunstan reads one (a `DOCTYPE` is refused). The
output's root is `<testsuites>`, holding each input's `<testsuites>` children, or its `<testsuite>`
root, copied as written, not re-serialised. It reads the merged file back and refuses, writing
nothing, unless its counts are the sum of the inputs' counts; it also refuses no input, the same
path twice, and an `--out` that is one of the inputs. It prints the counts on standard error and
exits 0 when it writes the file, 3 when it refuses.

## The record to declare

The block's `tests[].record` names the run's record:

```json
{
  "kind": "junit",
  "workflow": ".github/workflows/ci.yml",
  "job": "test",
  "artifact": "dunstan-junit",
  "path": "junit.xml"
}
```

- `workflow`: the workflow file's path from the repository root.
- `job`: the job's name as the run records it: its `name:` if it sets one, else its id.
- `artifact`: `dunstan-junit`.
- `path`: `junit.xml`.

`dunstan template --tests-ci` fills all of it, and the counts, from the run at HEAD:

```sh
GITHUB_TOKEN=... dunstan template --tests-ci --tests-command "pytest" \
  --tests-workflow .github/workflows/ci.yml --tests-job test
```

Run it after CI has finished on your last push. It reads the record with the reader `dunstan
check` uses, the named job's latest attempt included, so the counts it declares are the counts the
gate will read. `--tests-artifact` and `--tests-artifact-path` default to `dunstan-junit` and
`junit.xml`, and `--repo` to the github.com repository the `origin` remote names. When no single
count settles (no token, HEAD not pushed, CI not finished, no run uploaded the record, runs that
disagree, an artifact that cannot be read), it prints the block without `tests`, says why and what
to do, and exits 2. It never declares a count it did not read.

A run made only on your machine is declared as one: `dunstan template --tests-local junit.xml
--tests-command "pytest"` writes the record `{"kind": "local"}`, which the gate reports
`unverifiable` (`local_run_not_in_record`) until CI publishes a record.

## Limits

- **A matrix job's name includes its matrix values**, as the run records it: `test (ubuntu-latest,
  20)`, not `test`. Each leg uploads its own artifact, so give each a name of its own (for example
  `dunstan-junit-${{ matrix.os }}`) and declare one `tests` entry per leg, or record one leg only.
  Two artifacts of one name in one run make the record `unreadable`.
- **The artifact needs a token to read.** GitHub answers an artifact download without a token with
  401 "Requires authentication", even on a public repository (observed 2026-11-02). A check without
  a token reports the `tests` rows `unverifiable` with `source_unreadable:artifact`. The Action
  reads with its `github-token` and needs `actions: read`.
- **The record is produced by the pull request's own CI run** (spec section 14). On `pull_request`
  GitHub runs the workflow file as the pull request has it, so a pull request that changes the
  named workflow, or its reporter's configuration, produces its own evidence.
- **An expired artifact is unverifiable.** Artifacts expire after the repository's retention
  period (90 days by default); a check after that reports `source_unreadable:artifact`, never
  `record_not_found`, since the run did upload the record.

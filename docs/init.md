# `dunstan init`: set a repository up

`dunstan init` makes the changes [`action.md`](action.md), [`agents.md`](agents.md) and
[`ci-test-records.md`](ci-test-records.md) describe, in one command, from the repository's root.

```sh
npx -y dunstan init           # prints what it would do; writes nothing
npx -y dunstan init --write   # writes it
```

Run it anywhere inside the repository: it works at the root git names. It needs no token. It sets
up GitHub, or GitLab ([below](#gitlab)): GitLab when the `origin` remote is on a host whose
name holds `gitlab`, or, with no such remote, when the checkout has `.gitlab-ci.yml` and no GitHub
workflows. `--forge github` or `--forge gitlab` says which.

## What it writes

Each change is made only where nothing of Dunstan is there yet, so a second run writes nothing.

| File | What `init` does |
| --- | --- |
| `.github/workflows/dunstan.yml` | Creates the workflow of [`action.md`](action.md#setup-in-three-steps), step 1, with the Action pinned to the commit of the release tag of the running version, `BargLabs/dunstan@<commit> # v<version>`. It reads that commit with `git ls-remote` from github.com, its one network read. When that fails it pins the tag and says so: pin a full commit SHA before you rely on it. Skipped when the file exists or any workflow already uses `BargLabs/dunstan`. |
| `AGENTS.md` | Adds the [instruction block](agents.md#the-instruction-block), with a line saying how to run Dunstan with `npx`, and, when exactly one workflow job runs the tests under a fixed name, that job's `dunstan template --tests-ci` line. Creates the file if there is none. |
| `CLAUDE.md`, `.github/copilot-instructions.md` | The same section, appended, only where the file exists. |
| `.github/pull_request_template.md` | Adds the Handback section below, creating the file if there is none. A directory of templates (`.github/PULL_REQUEST_TEMPLATE/`) is never edited: `init` prints the section to add to the templates agents use. |

An agent instruction file or a pull request template that already mentions `dunstan-handback` or
`dunstan template` is left as it is.

The Handback section:

```markdown
## Handback

<!--
The `dunstan` check reads a dunstan-handback block from this description and checks each claim
against the pull request's record. Until a block is filled in, it concludes `failure` with
`unverifiable: block_missing`.

Before you say done, follow "Before you report a task done" in AGENTS.md: run `dunstan template`
and replace this whole comment with the block it prints.
-->
```

## What it prints and never writes

**The CI steps that publish the test record.** `init` never edits a workflow.

- **Runners.** It finds the test runners (pytest, Jest, Vitest, Maven, Gradle and Go) that the
  manifests name, `pyproject.toml`, `package.json`, `pom.xml`, `build.gradle`, `go.mod` and the like,
  at the root and in directories below it, four levels deep. It skips dependencies, build output,
  virtual environments and fixtures (`node_modules`, `vendor`, `target`, `dist`, `.venv`,
  `testdata`, `fixtures` and the like), and directories whose names start with a dot.
- **Jobs.** It finds the workflow jobs whose `run:` lines, including each line of a `run: |` block,
  run the tests. A line that runs a runner itself counts. So does a line that runs a tool of the
  project's whose own files `init` reads to see what it runs: a `package.json` script (`npm test`,
  `pnpm test:ci`, following one script into another), a `Makefile` target (its variables put in,
  following its prerequisites when it has no recipe, and a `make` it calls), a `justfile` recipe,
  a `Taskfile.yml` task, a `noxfile.py` session's `session.run` commands, or a tox environment's
  `commands` from `tox.ini`, `tox.toml` or `pyproject.toml` (the base environment's when the line
  names none, or names it with an expression). A line whose tool runs no runner is not the tests:
  `tox -e typing` that runs mypy, or `make lint`. A tool `init` cannot read (one whose file is
  missing, or a script that hands on to a tool it does not know) counts when its line names a test
  (a `make`, `just` or `task` target counts when `test` or `tests` is a part of its name or ends
  it), matched to the first runner found, and the output says it could not read what it runs. A
  line that installs (`pip install pytest`, `npm ci`) never counts.
- **Matrix jobs.** A matrix job uploads from one leg, so the run holds one `dunstan-junit`
  artifact. For a matrix of literal values, `init` takes the first leg no `exclude` removes, puts it
  in the upload step's `if:`, and names it as a run does, `<job name or id> (<values>)`, or the
  job's `name:` with its `${{ matrix.<key> }}` values put in, for the `--tests-ci` line. An
  unquoted number is read as GitHub reads it, so `3.10` is `3.1`. A matrix whose legs it cannot
  name (an `include`, an expression, a mapping as a value) has its first leg
  (`strategy.job-index` 0) upload its report, and a job of its own, `dunstan-junit`, upload it as
  the record, which the `--tests-ci` line names ([`ci-test-records.md`](ci-test-records.md#limits)).
- **Workspaces.** A line that runs a script in every workspace package (`turbo run test`,
  `nx run-many -t test`, `lerna run test`, `pnpm -r test`, `pnpm --filter … test`,
  `npm test --workspaces`, `yarn workspaces foreach run test`, or a root script that does) is read
  package by package: each package whose script runs a runner writes its report in its own
  directory, and one `junit-merge` step joins them into `junit.xml` before the upload.
- **Shell scripts.** A line that runs a script of the repository's (`./scripts/test.sh`,
  `bash ci/test.sh`, or `./ci/run-tests` with a `#!` line) is read line by line, as a tool's file.
- **A JUnit file already written.** A command that already writes JUnit (`--junitxml`,
  `--junitfile`, `--outputFile.junit`, read through the tool's file, Makefile variables included)
  keeps its file: `init` uploads that file, or keeps it in GitLab's artifacts, and names it in the
  `--tests-ci` line (`--tests-artifact-path`, or `--tests-path` on GitLab).
- **Steps.** For each such job it prints what to make the command that runs the tests write
  `junit.xml` (for pytest, `--junitxml=junit.xml`), keeping the job's own command and flags, and the
  steps that go after it from [`ci-test-records.md`](ci-test-records.md): the merge for Maven and
  Gradle, and the upload of `junit.xml` as `dunstan-junit`. In a job that sets a
  `working-directory`, it reads the tool's files there, and the upload names
  `<working-directory>/junit.xml`. A runner no job runs gets its whole recipe, with the directories
  that name it. A job that already uploads `dunstan-junit` needs nothing.
- **The base commit.** `dunstan check --base-tests` (DRAFT, [spec
  D.13](../spec/claim-format.md#d13-a-baseline-test-counts-at-the-base-commit)) compares the test
  counts at a pull request's head with those at its base commit, on the default branch, and the base
  commit has a record only if the workflow also runs on a push there. For each job, `init` reads its
  workflow's `on:` and says whether it does: a `push` with no branch filter, or one whose
  `branches` match the default branch (or whose `branches-ignore` does not), runs it; no `push`, or
  `tags` alone, does not. Where it does not, `init` prints the `push` trigger to add, and where the
  push filters on paths, says that a base commit whose push changed none of them has no record.
  Where it cannot tell (an expression or a flow mapping in `on:`, a `!`, `?`, `+` or `[` in a
  branch pattern, or no default branch), it says so, and does not guess. Once one test workflow
  runs on a push to the default branch, the others are not told to: a release workflow need not.
  The default branch is the `origin` remote's HEAD as the clone knows it (`git symbolic-ref
  refs/remotes/origin/HEAD`), read without the network. GitHub only.

Land that workflow change in a pull request of its own: a pull request that changes the workflow
that writes the record is its own evidence, and its `tests` rows are `unverifiable`
(`record_producer_changed_by_pr`).

**Requiring the check.** Branch protection is a setting, not a file: require the check `dunstan` on
the branches agents merge into ([`action.md`](action.md#setup-in-three-steps), step 3).

## GitLab

On GitLab, the [GitLab profile 0.1](../README.md#gitlab), the gate is Dunstan's
[GitLab CI/CD component](https://gitlab.com/barglabs/dunstan), `gitlab.com/barglabs/dunstan/dunstan`.
`init` never edits a CI configuration file, so it prints the include for `.gitlab-ci.yml`, pinned
to the commit of the component's release tag of the running version, `<version>` (a tag, said so,
when `git ls-remote` cannot read it):

```yaml
include:
  - component: gitlab.com/barglabs/dunstan/dunstan@<commit> # <version>
```

It prints nothing of the gate when `.gitlab-ci.yml`, or a local file it includes, already includes
the component or runs `dunstan check`. It writes:

| File | What `init` does |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` | As on GitHub. The `--tests-ci` line names `--gitlab-project` from the `origin` remote, `--mr <iid>`, and `--gitlab-host` when the host is not gitlab.com. |
| `.gitlab/merge_request_templates/Default.md` | The Handback section, in merge request terms, created if absent. |

The component's job runs `dunstan check` on merge request pipelines, last (stage `.post`) whatever
came before, and fails the pipeline on a verdict other than `pass`, as the Action concludes failure;
its input `unverifiable: warn` passes the job with a warning on an unverifiable verdict instead.
Turn on "Pipelines must succeed" (Settings, Merge requests) for it to block a merge. GitLab runs no
pipeline whose only job is in `.post`, so the project needs jobs of its own.

`GITLAB_TOKEN` is a CI/CD variable holding a project access token with the `read_api` scope,
masked and not protected: a merge request pipeline of an unprotected branch cannot read a protected
variable. A public project is read without it, except a `tests` claim.

For the jobs that run the tests, in `.gitlab-ci.yml` and the local files it includes (two levels
deep; their `script:` and `before_script:` items, read as a workflow's `run:` lines are), `init`
prints what to add to the command and to the job: an
`after_script:` that merges Maven, Gradle or workspace reports (it runs `npx`, so the job's image
needs Node), and `artifacts:` that keep `junit.xml` in the job's archive, where Dunstan reads it, and
as GitLab's own test report. A `parallel:` job's names carry its values, so its first job
(`CI_NODE_INDEX` 1) keeps the report and a job of its own, `dunstan-junit`, collects it as the
record. A runner no job runs gets a whole job.

## Limits

- It reads the files that say what runs, never what a run did: a tool configured where it does not
  look (a tox plugin, a command built at run time) is matched by its name, and the output says so.

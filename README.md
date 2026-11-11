# Dunstan

<p align="left"><img src="brand/dunstan-icon.png" alt="Dunstan logo" width="96"></p>

**Verify an AI coding agent's pull request claims, with a verdict anyone can rerun.** The agent
says which files it changed, which tests ran and which issues it closed; Dunstan checks each claim
against the pull request, its commits and its CI runs, and reports the verdict as a check run. Every
verdict comes with a record: `dunstan verify` recomputes it offline and `dunstan rerun` re-reads
the sources, so a reviewer or customer can check it themselves. Deterministic, no LLM.

Add it to a workflow; the agent's report goes in the pull request body
(`npx -y dunstan template --base main` writes the block for you):

```yaml
on:
  pull_request:
    types: [opened, edited, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: read
  issues: read
  deployments: read
  checks: write
  actions: read
jobs:
  handback:
    runs-on: ubuntu-latest
    steps:
      - uses: BargLabs/dunstan@v0.1.18 # pin the full commit SHA in production
        with:
          report-source: pr-body
```

More in [`docs/action.md`](docs/action.md).

Dunstan holds a coding agent's completion report to the record.

An agent finishes and writes a handback: files changed, tests run, references closed, head commit,
merged at. Dunstan reads a declared block in that handback and checks each claim against the
repository's own record (pull request state, changed files, commits, CI runs) with deterministic
checks. It writes a record anyone can re-run on their own machine and get the same verdict.

- No model decides pass or fail.
- Fail closed: a claim the record cannot answer is `unverifiable`, never a pass by absence.
- Evidence, not a gate: Dunstan returns a record; your branch protection decides what blocks.

The claim format, the block an agent declares and the record Dunstan writes, is an open
specification: [`spec/claim-format.md`](spec/claim-format.md), with JSON Schemas in `spec/schema/`
and examples in `spec/examples/`. A record is an in-toto Statement. How it reads in in-toto, SLSA
and PER terms, and what does not carry over: [`docs/interop.md`](docs/interop.md) (informative; no
export exists).

## Use with Claude

Dunstan ships as a Claude Code plugin: three MCP tools and a skill that has Claude declare, check and
report a pull request's handback before it says done ([`plugins/dunstan/`](plugins/dunstan/)).

**Install.** In Claude Code:

```
/plugin marketplace add BargLabs/dunstan
/plugin install dunstan@barglabs
```

The plugin runs the MCP server with `npx -y dunstan@0.1.18 mcp`, the `dunstan` npm package at that
exact version: one self-contained file, no dependencies.

**The token.** When you enable the plugin, Claude Code asks for an optional GitHub token and keeps it
in your system's secure credential store. Use a fine-grained personal access token with read-only
permissions, limited to the repositories you check, with an expiry; the permissions are in
[`docs/mcp.md`](docs/mcp.md#a-read-only-github-token). Leave it empty to read public repositories
anonymously. Two kinds of claim need a token, even on a public repository: GitHub's GraphQL API
refuses anonymous calls, so a `closes` reference is `unverifiable`, never `fail`; and GitHub answers
an artifact download only with a token (401 "Requires authentication" anonymously, observed
2026-11-02), so a `tests` count is `unverifiable` (`source_unreadable:artifact`). The plugin never
reads a token from your environment.

**What it reads, and from where.** The server runs on your machine and calls GitHub's API directly
from it: the pull request, its changed files, commits, check runs, workflow runs and test artifacts,
deployments, and the issues the block references. Every request is a read. Nothing is written to
GitHub or to the repository, and nothing is sent to Barg Labs.

**Try it.** Three prompts on a public Barg Labs pull request:

1. `Use Dunstan to check this handback for BargLabs/cejel#408: head commit
   35d6201d00cf926f9af10df61bfec05b6624ee12, files changed
   .github/workflows/verify-published-windows-binary.yml and
   scripts/validate-distribution-metadata.mjs, merged at 2026-10-04T13:30:48Z.` Every claim holds,
   so the verdict is `pass`.
2. `Before I report BargLabs/cejel#408 as done, use Dunstan to list the claims in this report that my
   handback block does not declare:` followed by the report and its `dunstan-handback` block. Dunstan
   lists each prose claim the block leaves out, such as a test count or a `closes`, with the field
   that would declare it. It is never a verdict.
3. `Use Dunstan to check whether BargLabs/cejel#408 closes #407, with head commit
   35d6201d00cf926f9af10df61bfec05b6624ee12 and the same two files.` Without a token the `closes`
   row is `unverifiable` (`source_unreadable:closing_references`): the record could not settle it,
   which is not the same as false. With a token it is `pass`.

**Support.** [GitHub issues](https://github.com/BargLabs/dunstan/issues) or team@barglabs.ai.
[Privacy](https://barglabs.ai/privacy) and [terms](https://barglabs.ai/terms).

## The checker

```sh
pnpm install && pnpm build          # writes dist/dunstan.mjs and prints its SHA-256

# Check a pull request against the report it names (exactly one report source).
GITHUB_TOKEN=... dist/dunstan.mjs check --repo <owner/name> --pr <n> --report-pr-body --out record.json
#   or --report-file <path|->, or --report-comment-author <login> (that author's latest comment)

# Check a GitLab merge request (DRAFT, see "GitLab (draft)" below). GITLAB_TOKEN is optional.
dist/dunstan.mjs check --gitlab-project <full path> --mr <iid> --report-mr-description --out record.json
#   or --report-file <path|->; --gitlab-host <host> for a self-managed GitLab (default gitlab.com);
#   --exclude-gitlab-job "$CI_JOB_ID" in a pipeline, so the checker's own job is not counted

dist/dunstan.mjs verify record.json   # offline: recompute claims, verdict and digests
dist/dunstan.mjs rerun record.json    # online: re-read the sources, report evidence_changed
```

Exit codes: 0 pass, 1 fail, 2 unverifiable, 3 no record: a usage error, a pull request that cannot
be read or that moved while it was checked and again when checked once more (`pull_request_moved`),
or an internal error (`verify`: 0 verified, 1 not).
`--sign-key <path> --signer <principal>` writes the record as its JCS bytes with a detached SSH
signature; `verify --sig <file> --allowed-signers <file>` checks it.

`dist/dunstan.mjs mcp` serves the same checker as an MCP tool, `dunstan_check_handback`, which an
agent calls with its block before it says done, beside `dunstan_suggest_declarations` (below):
[`docs/mcp.md`](docs/mcp.md).

`checker.digest` in a record is the SHA-256 of `dist/dunstan.mjs`, the single-file bundle that ran:
the checker code, its dependencies and both schemas from `spec/schema/`, inlined at build time.

## What Dunstan does not check

Dunstan checks the claims a handback declares against the record. It does not check that the
handback covers what the issue asked for: an accurate report of the wrong work passes.

What to declare: [`docs/agents.md`](docs/agents.md#the-instruction-block).

## Survey: how much of a repository's handbacks can be checked

`dunstan survey` (DRAFT) runs `dunstan check` over a repository's recent closed pull requests and
reports settleability: which claims the record could not settle, why, and what would let it settle
them. It is read-only and needs no token to start.

```sh
dist/dunstan.mjs survey --repo <owner/name> --last 30 [--author <agent-login>] --out survey.json --summary survey.md
dist/dunstan.mjs verify survey.json   # offline: every embedded record, the selection, the aggregate and the digest
```

It reports two rates, each with its numerator, denominator and Wilson 95% interval:

- **the share of claims the record could not settle**, (unverifiable + not record-checkable) / all
  claims, led by a table of the reasons, each with its remedy;
- **the share of settled claims the record contradicts**, contradicted / (supported +
  contradicted).

With `--advisory` it also runs the advisory prose reader and counts its notes in a table of their
own. Advisory notes never enter either rate. A tests claim can be settled only with `GITHUB_TOKEN`
set and a JUnit record that CI uploads: GitHub serves no artifact to an anonymous reader, and a
test run CI never recorded, or a local run declared as one, is not record-checkable. The survey
record says whether it read with a token, and an anonymous survey's summary says its
cannot-settle share is higher for it. The survey measures what the record can settle. A survey
record is unsigned: `verify` proves it consistent with itself and every embedded record valid, not
that its listing is what GitHub returned, so to trust its completeness, run it again online.
Details: [`docs/survey.md`](docs/survey.md).

## Declare before done

Checking a declared claim is exact. Finding the claims in prose is where readers fail: a hosted
model judge clears far fewer false reports once it is handed the right paragraph, and Dunstan's own
extractor missed the planted false claims it was tested on. Both fail at the reading, not at the
checking. The agent that wrote the report is its best reader, and it is still there before
handback. So Dunstan makes the block nearly free to write, then asks the author about the
prose the block does not cover:

```sh
dist/dunstan.mjs template                         # the block for HEAD, filled from local git
dist/dunstan.mjs suggest --report-file report.md  # prose claims the block does not declare
```

`template` fills `headCommit` and `filesChanged` (HEAD against its merge base with the remote's
default branch, or `--base`). With `--tests-ci` it fills `tests` from the JUnit record CI published
at HEAD, read as the gate reads it; with `--tests-local` it declares a local run as one (below). It
never fills `references` or `mergedAt`, and when git cannot answer it prints no block. `suggest`
runs the advisory extractor over the prose outside the fence and lists each claim it proposes that
the block does not declare, to declare or reword. It is never a verdict, writes nothing to a record
and always exits 0; the MCP server offers it as `dunstan_suggest_declarations`. The loop, an
instruction block to copy into `AGENTS.md` or `CLAUDE.md`, and example output:
[`docs/agents.md`](docs/agents.md).

## Make test claims checkable

Most claims about tests in a completion report ("all tests pass", "142 passed") cannot be checked
from a repository's records today: the tests ran on the agent's machine, or CI ran them and
published no counts. Dunstan settles a `tests` claim only against a JUnit file a CI run uploaded.
Two changes make such claims checkable:

1. **CI publishes the record.** One upload step after the test command: an artifact named
   `dunstan-junit` holding `junit.xml`, uploaded even when the tests fail. Recipes for pytest,
   jest, vitest, Maven, Gradle and Go, with `dunstan junit-merge` for runners that write one file
   per test class: [`docs/ci-test-records.md`](docs/ci-test-records.md).
2. **The agent declares CI's counts.** After CI has finished on its last push, `dunstan template
   --tests-ci --tests-command <cmd> --tests-workflow <path> --tests-job <name>` reads the counts
   from that record, as the gate will, and declares them. A run made only locally is declared with
   `--tests-local <file>` as `{"kind": "local"}`, which the gate reports `unverifiable`
   (`local_run_not_in_record`), never `pass`.

Reading the artifact needs a token: without one a `tests` row is `unverifiable`
(`source_unreadable:artifact`). A pull request that changes the workflow file its record names
wrote its own evidence, so its `tests` rows are `unverifiable` (`record_producer_changed_by_pr`,
spec 0.1.10): land the workflow change in a pull request of its own. Each `tests` row the record
cannot settle is printed with a `remedy:` line saying what to do.

## GitLab (draft)

`dunstan check --gitlab-project <full path> --mr <iid>` checks a GitLab merge request on
gitlab.com, or on a self-managed instance with `--gitlab-host <host>`. The project is named by its
full path, `group/subgroup/.../project`. The report is `--report-mr-description` (the merge
request's description) or `--report-file <path|->`. It reads without a token; set `GITLAB_TOKEN`
to read what an anonymous reader cannot. The token is sent as a header and is never written into a
record, a source, a log line or an error. This is the
[DRAFT GitLab profile 0.1](spec/claim-format.md#draft-gitlab-profile-01), which the operator has
not yet made normative. Nothing about GitHub changes: every GitHub record is written byte for byte
as before.

Every evidence section has a GitLab source, so every claim a block makes can be settled:

- the merge request (its head, state, merge time and merge commit: the squash commit for a squash
  merged by fast-forward), its changed files from the diffs listing, its `closes_issues`, and the
  issues and commits a block names, with each `closes` target's state events (the head, scope,
  `closes`, `cites` and `mergedAt` claims);
- `checks`: the latest jobs and the bridges of the merge request's head pipeline, which must be for
  `headCommit`, by one job status table. A failed job counts as failed even when it is allowed to
  fail, and a manual job never run as skipped. Run in a pipeline, pass the checker's own job,
  `--exclude-gitlab-job "$CI_JOB_ID"`;
- a `tests[]` item whose `junit` record names `workflow: .gitlab-ci.yml` (the project's CI
  configuration file), the `job`, `artifact: archive` and the `path` of the JUnit file in that
  job's artifacts archive: Dunstan downloads the archive and counts the file itself, never GitLab's
  parsed test report;
- `deployedAt`: the project's deployments to the named environment, where only `success` is a
  successful deployment.

What has no GitLab equivalent, and so is never recorded: an issue's `exists: false` (GitLab
answers 404 for a confidential issue, so a `cites` or `closes` of one is
`source_unreadable:issue`, never `not_found`) and `resolvedAs`, a check run's suite, app and
workflow, a deployment's status events, a fast-forward merge's merged commit without a squash, the
`--report-comment-author` report and `--advisory`. A block names an issue of the subject project as
`#N` at any depth; it cannot name another subgroup project's issue in full, since the block format
admits two-segment references only.

A GitLab record has its own predicate type (`.../record/v0.1-gitlab-draft`) and schema
(`spec/schema/record-gitlab-0.1-draft.schema.json`), and carries
`predicate.subject.forge: {"kind": "gitlab", "host": ...}`. `dunstan verify` re-runs it offline,
and `dunstan rerun` re-reads it from the host it names. The GitHub Action, the MCP tool, the survey
and the hosted tier read GitHub only.

## The GitHub Action

One step in a workflow, one required check in branch protection:

```yaml
permissions: { contents: read, pull-requests: read, issues: read, deployments: read, checks: write, actions: read }
steps:
  - uses: BargLabs/dunstan@<full commit SHA>
    with:
      report-source: pr-body   # or comment:<author-login>, or file:<path>
```

It writes a `dunstan` check run on the head commit whose summary is the claims table, the record as
the artifact `dunstan-record`, and the same table in the job summary. Only `pass` concludes
`success`; `fail`, `unverifiable` (unless you set `unverifiable-conclusion: neutral`) and any error
conclude `failure`. It never comments, labels, reviews or merges. Setup, the branch-protection setting
and what each conclusion means: [`docs/action.md`](docs/action.md).

## The hosted tier

Optional, beside the local tools, which never use it. `POST /v0.1/check` with a report or block and
a pull request; Barg Labs' read-only GitHub App reads that pull request's metadata (never file
contents); the same checker returns a record signed with SSHSIG, which `dunstan verify` re-runs
offline for the same verdict. Records are kept 90 days by default, report text never. What is read
and kept, the Contents: read caveat and the API: [`docs/hosted.md`](docs/hosted.md). The Worker is in
`hosted/`; provisioning and deploys are the operator's
([`docs/runbooks/hosted-provisioning.md`](docs/runbooks/hosted-provisioning.md)).

## Retrieval for reader claims (DRAFT)

For a prose report, a reader turns the text into typed claims, and Dunstan has to find which
record items each claim is about. `src/retrieval/` does that without a model: exact identifiers
first, then BM25, with a stated floor. Retrieval only proposes candidates. The check decides from
the candidates the record keeps, so `dunstan verify` reproduces the verdict without retrieving
again. `dunstan-eval retrieval` measures recall at k = 5. The record format is DRAFT 0.2.0 and is
not yet ruled. Details: [`docs/retrieval.md`](docs/retrieval.md).

## Advisories from prose (DRAFT)

`dunstan check --advisory`, or `advisory: true` in the Action, also reads the report's prose. The
extractor in `src/advisory/` binds each path, `#N`, SHA, count or timestamp to a clause with an
asserting verb, using a written grammar and no model, and drops every token it cannot bind. It
compares what remains with the evidence using the gate's own checks. Each result is recorded as an
advisory: `agrees`, `differs:<reason>` or `unanswered:<reason>`, or `agrees_by_name` for a file
named only by its name or a partial path. Advisories never change the verdict
and are never `fail`. The record carries the measured figures beside them, each only for the exact
extractor and comparison it was measured on, or "unmeasured" otherwise ("Measured figures",
below). Details: [`docs/advisory.md`](docs/advisory.md).

A `differs` note is shown as **"possible disagreement, unverified"**, never as an accusation. A
decision rule preregistered before the measurement said a `differs` note would be labelled this way
if its measured accuracy fell below 0.50. The rule fired. The CLI, the
Action's summaries and the MCP tool's text use the new wording, followed by what the record shows,
and print one fixed line beside the advisories. With the published figures it reads: *"Advisories
never affect the verdict. Extraction precision 0.80 (24/30, 95% CI 0.63–0.90). A possible
disagreement is unverified: on 170 of our own agent PRs, 0 of 20 marked a false claim, and of the 44
advisories the record could check there, none was a false claim (0 of 44)."* For a later extractor or comparison, not yet
measured, it states no figure. The record still says `differs:<reason>`
([`docs/advisory.md`](docs/advisory.md), "How a `differs` note is shown").

### Measured figures

Published 2026-10-05: value, n and method only, never the reports, their clauses or the
adjudication labels.

| Figure | Value | n | Wilson 95% interval | Bound to |
| --- | --- | --- | --- | --- |
| Extraction precision | 0.80 (24 real claims) | 30 advisories | [0.627, 0.905] | extractor 0.1.1, digest `ab77ce47…c360` |
| `differs` notes that marked a genuinely false claim | 0 | 20 `differs` advisories | [0, 0.161] | extractor 0.1.1 and comparison 0.2.0 |
| Base rate: genuine false completion claims | 0 | 44 checkable advisories (of 149) | [0, 0.080] | extractor 0.1.1 and comparison 0.2.0 |

Method: extractor 0.1.1 proposed 149 advisories on 170 of Barg Labs' own merged agent pull requests.
The operator adjudicated a seeded held-out sample of 30 of them for extraction precision, every
`differs` advisory (a census of 20) for whether it marked a genuinely false claim. For the base rate,
the record could check 44 of the 149 (24 agreed with it, 20 differed) and none was a false claim; the
other 105 could not be compared with the record and were not judged. Each figure is bound to the extractor digest, and the `differs`
figure and base rate to the comparison version too. Any later extractor or comparison is
"unmeasured" until it is measured anew; it never inherits a figure. The extractor that runs now is
0.1.3. Since 0.1.2 it stops reading statements about another pull request, an undone change, a
baseline, a negated list or a deliberate test failure as claims, and since 0.1.3 it reads a file
list or a merge time after a colon ([`docs/advisory.md`](docs/advisory.md), "Attribution" and
"Lists, merge times and own references"). Extractor 0.1.4's rules did not generalise to held-out
pull requests and were reverted ("Labels, used names and descriptions"). No figure is published
for 0.1.3, so a record it writes says "unmeasured". The comparison that runs is 0.5.0: a file claim
not among the changed files is a possible disagreement only when its path is a file at the head,
and is unanswered when nothing or a directory is there ("Paths that are not at the head"), and a
`closes` claim is settled by who closed the target, as the gate's is ("Closes read by who closed
the target"), and a cited commit agrees when it exists, whether or not the head reaches it, as the
gate's `cites` does since spec 0.1.11 ("Cited commits that the head does not reach"). It is
unmeasured too: the `differs` figure stays bound to comparison 0.2.0.

The base rate is always shown next to the `differs` figure: among the 44 advisories the record
could check, none was a false claim (0 of 44), so 0 of 20 means there was little to find, not that
the check failed to find it. The 105 advisories the record could not check were not judged, so a
false claim among them would not have been seen. Wording that
calls a `differs` note a mismatch is earned only past a preregistered bar measured on a corpus that
contains false claims (decided 2026-10-05). That has not yet happened. Details:
[`docs/advisory.md`](docs/advisory.md), "Measured figures".

Acceptance criteria and their preregistered fixtures: `docs/acceptance/preregistration-0.1.md`,
`fixtures/`.

Status: under construction. The claim format specification is a draft under review.

Licence: the checker and tools under AGPL-3.0-only (`LICENSE`); the claim format specification in
`spec/` under Apache-2.0 (`spec/LICENSE`). Contributions require the CLA (`CLA.md`).

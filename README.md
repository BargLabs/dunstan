# Dunstan

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
and examples in `spec/examples/`.

## The checker

```sh
pnpm install && pnpm build          # writes dist/dunstan.mjs and prints its SHA-256

# Check a pull request against the report it names (exactly one report source).
GITHUB_TOKEN=... dist/dunstan.mjs check --repo <owner/name> --pr <n> --report-pr-body --out record.json
#   or --report-file <path|->, or --report-comment-author <login> (that author's latest comment)

dist/dunstan.mjs verify record.json   # offline: recompute claims, verdict and digests
dist/dunstan.mjs rerun record.json    # online: re-read the sources, report evidence_changed
```

Exit codes: 0 pass, 1 fail, 2 unverifiable, 3 usage or internal error (`verify`: 0 verified, 1 not).
`--sign-key <path> --signer <principal>` writes the record as its JCS bytes with a detached SSH
signature; `verify --sig <file> --allowed-signers <file>` checks it.

`dist/dunstan.mjs mcp` serves the same checker as an MCP tool, `dunstan_check_handback`, which an
agent calls with its block before it says done, beside `dunstan_suggest_declarations` (below):
[`docs/mcp.md`](docs/mcp.md).

`checker.digest` in a record is the SHA-256 of `dist/dunstan.mjs`, the single-file bundle that ran:
the checker code, its dependencies and both schemas from `spec/schema/`, inlined at build time.

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
default branch, or `--base`), and `tests` only from a JUnit file and the CI record named with it. It
never fills `references` or `mergedAt`, and when git cannot answer it prints no block. `suggest`
runs the advisory extractor over the prose outside the fence and lists each claim it proposes that
the block does not declare, to declare or reword. It is never a verdict, writes nothing to a record
and always exits 0; the MCP server offers it as `dunstan_suggest_declarations`. The loop, an
instruction block to copy into `AGENTS.md` or `CLAUDE.md`, and example output:
[`docs/agents.md`](docs/agents.md).

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
"Lists, merge times and own references"). No figure has been measured on it, so a record it writes
says "unmeasured".

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

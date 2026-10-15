# Dunstan for Claude

Dunstan checks a coding agent's completion report against the pull request's own record on GitHub
before the agent says the work is done. The agent declares its claims in a `dunstan-handback` block:
the head commit, the files it changed, test counts, references such as `closes #12`, check runs and
deployments. Dunstan compares each claim with what GitHub records and returns `pass`, `fail` or
`unverifiable`, with a claims table and a record that anyone can re-check offline. No model decides
the verdict.

This plugin adds two MCP tools and one skill:

- `dunstan_suggest_declarations` lists sentences in the report's prose that look like claims the block
  does not declare. It reads nothing, writes nothing and never gives a verdict.
- `dunstan_check_handback` checks the block against the pull request's record on GitHub and returns
  the verdict, the claims table and the record. It writes a file only when you pass `outPath`, and
  never over an existing file.
- The `dunstan-check` skill tells Claude to declare, suggest, check and report the verdict exactly as
  returned. `unverifiable` means the record could not settle a claim, not that the claim is false.

Dunstan checks the claims a handback declares against the record. It does not check that the
handback covers what the issue asked for: an accurate report of the wrong work passes.

## What it runs, reads and sends

The plugin starts the MCP server with `npx -y dunstan@0.1.12 mcp`, which downloads the `dunstan`
package at that exact version from the npm registry. The package is one self-contained file with no
dependencies. The server runs on your machine and reads GitHub's API directly from it: the pull
request, its files, commits, check runs, workflow runs and artifacts, deployments, and the issues the
block references. Every request is a read. Nothing is written to GitHub or the repository, and nothing
is sent to Barg Labs.

## Changes in 0.1.12

Two fixes from a correctness review of the checker (spec 0.1.8).

- **A JUnit artifact from an earlier attempt.** GitHub lists a run's artifacts for the whole run
  and its jobs at their latest attempt. A test count is now read from an artifact only if it was
  created while the named job's latest attempt ran, between that job's start and its completion.
  Otherwise, or while that job is still running, the count is `unverifiable`
  (`source_unreadable:artifact`) and the artifact is not downloaded. In 0.1.11, after a full re-run
  whose test job failed before uploading, an artifact from the first attempt, if GitHub still listed
  it, could be counted as the latest attempt's. A job that "re-run failed jobs" did not re-run keeps
  its earlier attempt, and its artifact is read as before.
- **Check runs at another commit.** Check runs are read at the block's `headCommit`. When that is not
  the pull request's head, every `checks` claim is now `unverifiable` (`check_runs_not_at_head`),
  beside the head claim's `head_mismatch`. In 0.1.11 they were counted as if they were the head's.

The verdict changes only for a test count whose artifact the job's latest attempt did not upload,
which was a pass or a fail and is now `unverifiable`. A `checks` claim changes only where the head
claim already fails, so the overall verdict stays `fail`. Every other claim is unchanged, and no
token permission is added.

## Changes in 0.1.11

Three fixes from a security review of the checker (spec 0.1.7).

- **Check runs.** A run the checker excludes, such as the Dunstan Action's own `dunstan` run, now
  hides only earlier runs of its own identity: the same name and workflow path, or, for a run of no
  workflow, the same name and app, unless that app is `github-actions`, which every workflow in a
  repository creates runs as. In 0.1.10 it hid every earlier run of its name, so a failed job named
  `dunstan` in another workflow was not counted, and `checks.total`, `checks.allSucceeded` and
  `checks.noneFailed` could pass. That job is now counted, and the claims fail.
- **A pull request that moves while it is checked.** The pull request is read again after the
  evidence. If its head, base, state or file count changed, the check runs once more from a fresh
  read; if it moves again, no record is written and the check fails with `pull_request_moved`. A
  record never pairs one head with evidence read at another.
- **Response size.** Every answer from GitHub is read against a byte budget (72 MiB for an artifact
  archive, 48 MiB for anything else) and cancelled past it, never held whole first. An answer over
  its budget is recorded as unreadable, so a claim that needs it is `unverifiable`.

Only a `checks` claim can get a different verdict from 0.1.10 against the same evidence, and only
when an excluded run shares its name with a run of another workflow or app, or with a
`github-actions` run of no workflow. Every other claim is unchanged.

## Changes in 0.1.10

A new claim, `checks.noneFailed` (spec 0.1.6). It is `true` when no check run counted at the head
concluded anything other than `success`, `skipped` or `neutral`, and at least one succeeded. So a
pull request with skipped conditional jobs can declare its checks truthfully, where
`checks.allSucceeded` is `false` because a skipped run did not succeed. A run that failed, was
cancelled or timed out makes it `false`. A run still in progress makes it `unverifiable`
(`checks_incomplete`), and so does a head where no counted run succeeded
(`no_succeeded_check_runs`). A wrong declaration fails with `none_failed_mismatch`. Nothing else
changes: checked against the same handback and evidence, 0.1.9 and 0.1.10 give the same verdict and
claims for every block 0.1.9 accepts.

## Changes in 0.1.9

No 0.1 verdict changes: checked against the same handback and evidence, 0.1.8 and 0.1.9 give the
same verdict and claims. A record now carries each check run's workflow name beside its workflow
path (spec 0.1.5), and no 0.1 check reads it. In the DRAFT 0.2.0 reader claims, "CI / build passes"
names the workflow by the name GitHub shows. Such a claim is `unverifiable` when two workflows share
that name (`workflow_name_ambiguous`), and when the job is followed by a parenthesis the record does
not hold (`no_matching_record_item`).

## Changes in 0.1.8

No 0.1 verdict changes: checked against the same handback and evidence, 0.1.7 and 0.1.8 give the
same verdict and claims. The changes are in the DRAFT 0.2.0 reader claims, which the 0.1 gate does
not read: tied candidates that disagree are `unverifiable` (`ambiguous_candidates`), and a
`reference_closes` claim is decided by the same `closes` check as a declared `closes`. The
`dunstan-check` skill now gives each `closes` reason and what to say about it.

## Changes in 0.1.7

A declared `closes` on a pull request that is no longer open now passes when the pull request, one
of its commits or its merge commit closed the issue. This holds even when GitHub does not list the
issue among the pull request's closing references. In 0.1.6 the same claim was a `fail`
(`not_closing`). Two new `unverifiable` reasons cover what the record cannot settle:
`closing_base_not_default`, the pull request merged into a branch that is not the default branch and
the issue is still open, and `closing_event_unsettled`, the issue is closed but GitHub has not yet
recorded what closed it. So a record made with 0.1.6 and one made with 0.1.7 can give different
verdicts for the same handback.

## GitHub token

The token is optional. Without one, Dunstan reads public repositories anonymously, within GitHub's
anonymous rate limit. GitHub's GraphQL API refuses anonymous calls, so without a token a declared
`closes` reference is `unverifiable`, never `fail`. For private repositories, for `closes`
references, or to raise the limit, enter a fine-grained personal access token when the plugin asks
for its configuration. Give it read-only permissions, limit it to the repositories you check, and set
an expiry. The permissions are listed in
[docs/mcp.md](https://github.com/BargLabs/dunstan/blob/main/docs/mcp.md#a-read-only-github-token).
The plugin passes the value you enter to the server and to no other process. It never reads a token
from your environment: the server's `GITHUB_TOKEN` is the value you enter, or empty.

## Support and policies

- Issues: https://github.com/BargLabs/dunstan/issues
- Email: team@barglabs.ai
- Privacy: https://barglabs.ai/privacy
- Terms: https://barglabs.ai/terms
- Licence: AGPL-3.0-only. The claim format specification is Apache-2.0.

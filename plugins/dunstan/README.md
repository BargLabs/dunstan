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

The plugin starts the MCP server with `npx -y dunstan@0.1.11 mcp`, which downloads the `dunstan`
package at that exact version from the npm registry. The package is one self-contained file with no
dependencies. The server runs on your machine and reads GitHub's API directly from it: the pull
request, its files, commits, check runs, workflow runs and artifacts, deployments, and the issues the
block references. Every request is a read. Nothing is written to GitHub or the repository, and nothing
is sent to Barg Labs.

## Changes in 0.1.11

A fix to how check runs are counted (spec 0.1.7). A run the checker excludes, such as the Dunstan
Action's own `dunstan` run, now hides only earlier runs of its own identity: the same name and
workflow path, or, for a run of no workflow, the same name and app, unless that app is
`github-actions`, which every workflow in a repository creates runs as. In 0.1.10 it hid every
earlier run of its name, so a failed job named `dunstan` in another workflow was not counted, and
`checks.total`, `checks.allSucceeded` and `checks.noneFailed` could pass. That job is now counted,
and the claims fail. A `checks` claim checked against the same evidence can therefore get a
different verdict in 0.1.10 and 0.1.11, only when an excluded run shares its name with a run of
another workflow or app, or with a `github-actions` run of no workflow. Every other claim is
unchanged.

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

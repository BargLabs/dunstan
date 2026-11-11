# The MCP self-check

`dunstan mcp` serves three MCP tools over stdio. A coding agent calls `dunstan_check_handback` with
its handback block before it says a task is done, and gets back the verdict, the claims table and the
record. Before that, it calls `dunstan_template_handback` with its checkout, and gets back the block
filled from local git (and its test counts from CI), exactly as `dunstan template` prints it; and it
calls `dunstan_suggest_declarations` with its report, and gets back the sentences in its prose that
look like claims the block does not declare, to declare or reword ([`docs/agents.md`](agents.md)).

It is the same checker as `dunstan check`. The tool resolves the report from the request; everything
after that (the evidence read, the checks, the record) is the code path the CLI runs. On the same
evidence the two give byte-identical claims, verdict and digests: `src/mcp/parity.test.ts` holds this
on every fixture in `fixtures/`, with the GitHub reader stubbed, and for a GitLab merge request
against `dunstan check --gitlab-project ... --mr ...` on a fake GitLab. The tool changes who calls the
checker and when, nothing else. No model decides the verdict.

## Setting it up

The server runs from the `dunstan` npm package, pinned to an exact version. The package is one
self-contained file with no dependencies, so nothing is built and nothing else is installed.

### In Claude Code, as a plugin

```
/plugin marketplace add BargLabs/dunstan
/plugin install dunstan@barglabs
```

The plugin starts the server with `npx -y dunstan@0.1.20 mcp` and adds the `dunstan-check` skill. When
you enable it, Claude Code asks for an optional GitHub token (below). It stores the value in your
system's secure credential store and passes it to the server as `GITHUB_TOKEN`. Leave it empty to read
public repositories anonymously (a `closes` reference and a `tests` count then need the token; see
below). The plugin
never reads a token from your environment: it sets the server's `GITHUB_TOKEN` to the value you enter,
or to nothing.

### In another MCP client

Run the same pinned package over stdio, and give it a token only through the client's own secret or
environment setting:

```json
{
  "mcpServers": {
    "dunstan": {
      "command": "npx",
      "args": ["-y", "dunstan@0.1.20", "mcp"],
      "env": { "GITHUB_TOKEN": "<a fine-grained, read-only token>" }
    }
  }
}
```

Without `GITHUB_TOKEN` the server reads public repositories anonymously, within GitHub's anonymous
rate limit, and the result says so in a `note:` line. Two reads always need a token, even on a public
repository. GitHub's GraphQL API refuses anonymous calls, so without one a declared `closes`
reference is `unverifiable` (`source_unreadable:closing_references`), never `fail`. And GitHub
answers an artifact download only with a token (401 "Requires authentication" anonymously, observed
2026-11-02), so without one a `tests` count read from a JUnit artifact is `unverifiable`
(`source_unreadable:artifact`), with a remedy line under the row that says so. Every other claim on
a public repository is checked anonymously.

### A GitLab merge request (DRAFT)

`dunstan_check_handback` also checks a GitLab merge request, on gitlab.com or a self-managed host,
as `dunstan check --gitlab-project` does (DRAFT GitLab profile 0.1; the README's GitLab section). For
a GitLab subject the server reads `GITLAB_TOKEN` from its environment, and only that: it sends
`GITLAB_TOKEN` only to the GitLab host the call names and `GITHUB_TOKEN` only to GitHub, never one
forge's token to the other's host. In another MCP client, give the server `GITLAB_TOKEN` in the same
`env` block as `GITHUB_TOKEN`, through the client's own secret setting, with a read-only token
(`read_api`). The plugin's configuration asks for a GitHub token only.

Without `GITLAB_TOKEN` the server reads the project anonymously, and the result says so in a `note:`
line. A `tests` claim on GitLab needs the token even on a public project: GitLab's anonymous answer
for a project leaves out its CI configuration file (`ci_config_path`), so the record cannot say
which file ran, and the `tests` rows are `unverifiable`. A second `note:` says so.

`dunstan_template_handback`'s CI read takes a GitLab merge request too (`tests.from: "ci"` with
`gitlabProject` and `mergeRequest`, below), read with `GITLAB_TOKEN` only. The survey reads GitHub
only.

### A read-only GitHub token

Do not give the server a full-scope token, such as the one `gh auth token` prints. Create a
fine-grained personal access token at https://github.com/settings/personal-access-tokens/new:

1. **Expiration:** set one, for example 30 or 90 days.
2. **Repository access:** "Only select repositories", and choose the repositories you check. Include
   any other repository whose issues your blocks reference (`owner/repo#N`): a reference the token
   cannot read is `unverifiable`.
3. **Repository permissions**, every one **Read-only**:

| Permission | What the checker reads with it |
| --- | --- |
| Metadata (always granted) | the repository: `GET /repos/{owner}/{repo}` |
| Pull requests | the pull request and its changed files: `GET /pulls/{n}`, `GET /pulls/{n}/files`, the closing references (GraphQL `closingIssuesReferences`), and for a `closes` target not among them its base branch and commit ids, and who closed a pull request target (GraphQL) |
| Contents | commits and ancestry: `GET /git/commits/{sha}`, `GET /compare/{base}...{head}` |
| Issues | each issue the block references: `GET /issues/{n}`, and for a `closes` issue not among the closing references who closed it (GraphQL `issueOrPullRequest` ClosedEvents) |
| Actions | test counts from workflow runs: runs, jobs, and the named JUnit artifact |
| Deployments | deployments and their statuses |

Grant nothing else, and no write permission. Dunstan only reads.

Check runs (`GET /commits/{sha}/check-runs`) have no fine-grained permission: GitHub's table of
permissions for fine-grained tokens does not list that endpoint. On a public repository they are
readable anyway. On a private repository, if GitHub refuses the read, a declared `checks` claim is
`unverifiable` (`source_unreadable:check_runs`), never `fail`.

## Before you say done

Put this in the agent's instructions (`CLAUDE.md`, `AGENTS.md` or the system prompt):

> Before you say a task is done:
>
> 1. Commit and push your last change. Once CI has finished on it, call `dunstan_template_handback`
>    with the absolute path of your checkout, the base branch (`base`) and `tests: { "from": "ci",
>    … }`, and put the `dunstan-handback` block it returns in your report (`dunstan template
>    --tests-ci` is the same thing from a shell). If its first line is `tests: not declared`, do what
>    its note says; do not add counts yourself. Add your reference claims to the block.
> 2. Call `dunstan_suggest_declarations` with your report. For each claim it lists, declare it in the
>    block, or reword the sentence if it is not a claim about this pull request.
> 3. Call `dunstan_check_handback` with the repository and the pull request number (on GitLab, the
>    project's full path and the merge request's iid) and your block (`block`, as a JSON object), or
>    the report that carries it (`report`, as text).
>
> - If the verdict is `pass`, say done, and include the block in your report.
> - If the verdict is `fail` or `unverifiable`, report the rows that are not `pass` as they are, with
>   their reasons. Do not say done.
> - Never edit the block to make it pass without changing the work. A block that declares less, or
>   declares what you hope rather than what you did, is a false report, not a fix.
> - If the tool returns an error, the handback was not checked. Say that; an error is not a pass.

The check reads what the block declares, and only that. It cannot stop an agent from lying in prose:
a report that says "all tests pass" outside the block, or a block that leaves out a claim the prose
makes, is not checked. The check never reads the prose around the block. What the block declares is
checked against the repository's own record. `dunstan_suggest_declarations` is how the prose is
brought into the block: by the author, before the check, never as a verdict.

## The tools

### `dunstan_check_handback`

`dunstan_check_handback` takes:

| Input | Required | Value |
| --- | --- | --- |
| `repository` | for a GitHub subject | The GitHub repository, `owner/name`. Read with `GITHUB_TOKEN`. |
| `pullRequest` | for a GitHub subject | The pull request number. |
| `gitlabProject` | for a GitLab subject | The project's full path, `group/subgroup/.../project`, as `--gitlab-project`. Read with `GITLAB_TOKEN`. |
| `mergeRequest` | for a GitLab subject | The merge request's iid, as `--mr`: a positive integer. |
| `gitlabHost` | no | A self-managed GitLab host, as `--gitlab-host`. Absent: `gitlab.com`. |
| `block` | one of these two | The handback block as a JSON object. |
| `report` | one of these two | The report text, carrying exactly one `dunstan-handback` fence. |
| `outPath` | no | Write the record to this path. The path must not exist. |

Exactly one subject: `repository` and `pullRequest`, or `gitlabProject` and `mergeRequest` (with
`gitlabHost` off gitlab.com). Members of both, of neither, or part of one (`gitlabProject` without
`mergeRequest`, `gitlabHost` alone) are an input error that names what to give, never a guess; so
is a project path, host or iid that `dunstan check --gitlab-project` would refuse, checked with the
same rules. A GitLab subject is read as `dunstan check --gitlab-project` reads it, with no job
excluded: the caller is an agent, not the checker's own CI job.

Exactly one of `block` or `report`. Both, or neither, is an input error.

A `report` is read as `dunstan check --report-file` reads one (spec section 3): no fence is
`missing`, two are `ambiguous`, and either is `unverifiable`. A `block` is read as the content of a
handback fence (spec section 5): the report is the block's RFC 8785 bytes, so the record's report
digest equals its block digest, and the version and schema checks are the same. A block object
cannot be checked for duplicate member names, because the request has already been parsed. In both
cases the record's report source is `{"kind": "api", "locator": "mcp dunstan_check_handback#block"}`
(or `#report`).

It returns three text items:

1. `verdict: <pass|fail|unverifiable>`, a reminder to report the rows as they are when the verdict is
   not `pass`, where the record was written (or that it was not), and any `note:` (an anonymous read,
   a source that gave up).
2. The claims table as `dunstan check` prints it: the same rows and the same remedy lines under them,
   in the same order, with the instructions in those lines worded for a tool caller (inputs, not
   flags). Where the CLI's line says `dunstan template --tests-ci fills them`, the tool's says
   `dunstan_template_handback with tests.from "ci" fills them`. The two differ only by the phrase
   table in `src/template/wording.ts` (`src/mcp/parity.test.ts` holds this). The record holds no
   remedy line, so it does not change.
3. The record as JSON, exactly as `dunstan check --out` writes it. `dunstan verify` re-checks it
   offline once it is saved to a file.

Errors come back as tool errors (`isError: true`), never as a verdict: an input error, a pull
request that cannot be read, a pull request that moved while it was checked and again when checked
once more (`pull_request_moved`, spec section 6), a record that cannot be written. An error is not
`pass`, and it is not `fail`. Nothing was checked.

### `dunstan_template_handback`

It is `dunstan template` with a different caller, for an agent whose client gives it MCP but no
shell. After its inputs are read, the tool and the command line run one function
(`runTemplate`, `src/template/run.ts`), so for the same inputs its fence is byte for byte what
`dunstan template` prints on standard output, and its notes are the CLI's standard error lines: the
same notes in the same order, with the instructions worded for a tool caller (inputs, not flags).
Where the CLI's note says `run dunstan template again`, the tool's says `call
dunstan_template_handback again`. Its errors are worded the same way. The two differ only by the
phrase table in `src/template/wording.ts` (`src/mcp/template-parity.test.ts` holds this). It takes:

| Input | Required | Value |
| --- | --- | --- |
| `directory` | yes | The absolute path of the local git checkout of the pull request's branch. Git runs there. |
| `base` | no | The ref the pull request merges into, as `--base`. Absent: the remote's default branch. |
| `tests` | no | One of the objects below. Absent: no tests, as `dunstan template` with no tests flag. |

`tests` is one of:

- `{ "from": "ci", "command", "workflow", "job", "artifact"?, "artifactPath"?, "repository"? }`: the
  same as `--tests-ci --tests-command --tests-workflow --tests-job [--tests-artifact]
  [--tests-artifact-path] [--repo]`, with the same defaults (`dunstan-junit`, `junit.xml`, the
  repository the origin remote names). It reads the counts at HEAD from the JUnit record CI
  published, as the gate reads it, with `GITHUB_TOKEN`.
- `{ "from": "ci", "gitlabProject", "mergeRequest", "gitlabHost"?, "command", "job", "path"?,
  "workflow"? }` (DRAFT GitLab profile 0.1): the same as `--tests-ci --gitlab-project --mr
  [--gitlab-host] --tests-command --tests-job [--tests-path] [--tests-workflow]`. It reads the merge
  request's head pipeline at HEAD and the named job's artifacts archive, with the reader `dunstan
  check --gitlab-project` uses, and `GITLAB_TOKEN` only, sent only to the GitLab host. `path` is the
  JUnit file in the archive (absent: `junit.xml`); `workflow` is the project's CI configuration file
  (absent: the one the project names). The record names `artifact: "archive"`. This form is closed:
  `repository`, `artifact` or `artifactPath` beside a GitLab member is an input error, and so is a
  GitLab member without `gitlabProject` and `mergeRequest`.
- `{ "from": "local", "junit", "command" }`: the same as `--tests-local <junit> --tests-command
  <command>`. A relative `junit` path resolves against `directory`.

An unknown member, a `tests` with members of both forms, or a missing required member is an input
error that names the member. `--tests-junit` (a local file's counts declared against a CI record)
has no form here: a tool that let an agent declare its local counts against a CI record would invite
the `count_mismatch` that `from: "ci"` exists to remove. Use `from: "ci"`, or `from: "local"` for a
run CI has no record of.

It returns two text items:

1. A first line: `tests: declared`, `tests: not declared` or `tests: none asked`. When a CI read did
   not settle, a second line: `The block below has no tests. Do not add counts yourself; do what the
   note says.` Then every note, prefixed `note: `: the same notes in the same order as the CLI's,
   with the instructions worded for a tool caller (inputs, not flags).
2. The `dunstan-handback` fence, byte for byte what `dunstan template` prints.

A CI read that does not settle (no token, HEAD not pushed, CI not finished, no run uploaded the
record, runs that disagree, an artifact that cannot be read; on GitLab also no head pipeline, a head
pipeline at another commit, a merge request whose head is not HEAD, no job of that name, no archive,
expired artifacts, no file at `path`, a file that does not parse) is not a tool error: the block is valid
and returned, as the CLI prints it and exits 2. It is not success either: the first line says the
tests are not declared, and the block has none. Whatever git cannot answer (not a repository, no
HEAD, a detached HEAD, a base that does not resolve, no merge base), and an input error, come back
as a tool error (`isError: true`) with no block.

### `dunstan_suggest_declarations`

It takes one input, `report`, the report text with its `dunstan-handback` fence, and returns one
text item: exactly what `dunstan suggest` prints for that report (`src/mcp/server.test.ts` holds
this). Each claim the prose extractor proposes that the block does not declare is listed with its
sentence, its kind, its value and the block field that would declare it, with two choices: declare
it in the block, or reword it if it is not a claim about this pull request. The output is labelled
with the extractor's version and its measured precision ("unmeasured" for 0.1.3).

It is a sibling of the check, not an option on it, because it needs no pull request: it reads
nothing, writes nothing, and makes no call (`readOnlyHint: true`, `openWorldHint: false`). It is
never a verdict, and nothing it returns is written into a record. An empty list is not a check of
the prose. Details: [`docs/agents.md`](agents.md).

## What it reads and writes

- It reads GitHub metadata with `GITHUB_TOKEN` from its own environment: the pull request, its file
  list, commits, check runs, closing references, who closed a `closes` target not among them, JUnit
  counts from artifacts and deployments. Every request is a `GET`, or one of three fixed GraphQL
  queries: the closing references, and the two that read a target's ClosedEvents and the pull
  request's base branch and commit ids. It never reads a repository file's contents.
- For a GitLab merge request it reads GitLab metadata with `GITLAB_TOKEN`, every request a `GET` to
  the GitLab host the call names: the evidence the DRAFT GitLab profile maps (README, "GitLab
  (draft)"). It never sends `GITHUB_TOKEN` to GitLab, nor `GITLAB_TOKEN` to GitHub.
- It writes nothing to GitHub or GitLab, and nothing to the repository.
- It writes a file only when the caller passes `outPath`, and never over an existing file. Without
  `outPath` the record is returned and not saved; its `rerun` commands name the file `dunstan check`
  would have written (`dunstan-<owner>-<name>-<n>.json`).
- Standard output carries the protocol only. Diagnostics go to standard error.

`dunstan_suggest_declarations` reads and writes nothing at all.

`dunstan_template_handback` runs git in `directory` and writes nothing (`readOnlyHint: true`). With
`tests.from: "ci"` it reads GitHub (`openWorldHint: true`): the workflow runs at HEAD, their jobs,
and the named JUnit artifact, every request a `GET`, with `GITHUB_TOKEN` from the server's
environment; without a token it reads nothing and says so (`no_token`). Given `gitlabProject`, it
reads GitLab instead: the merge request, the project (for its CI configuration file), the head
pipeline's jobs and the named job's artifacts archive, every request a `GET` to the GitLab host,
with `GITLAB_TOKEN`; without that token it reads nothing and says so (`no_token`). Without
`tests`, or with `from: "local"`, it makes no network call. It returns the block and notes, never a file's contents:
a JUnit file is read only for its counts.

Because it can write `outPath`, the check tool does not advertise `readOnlyHint`. It advertises
`destructiveHint: false` (it never overwrites) and `openWorldHint: true` (it reads GitHub or GitLab).

## The registry entry

`server.json` at the repository root is the entry for the official MCP registry
(`io.github.BargLabs/dunstan`). It names the npm package `dunstan`, and `mcpName` in `package.json` is
how the registry verifies that the package is ours. `.github/workflows/release.yml` publishes the npm
package and then this entry. The version in `package.json`, the plugin's `plugin.json` and `.mcp.json`,
and `server.json` must agree; `src/__tests__/release-versions.test.ts` fails when they do not.

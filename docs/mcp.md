# The MCP self-check

`dunstan mcp` serves two MCP tools over stdio. A coding agent calls `dunstan_check_handback` with its
handback block before it says a task is done, and gets back the verdict, the claims table and the
record. Before that, it calls `dunstan_suggest_declarations` with its report, and gets back the
sentences in its prose that look like claims the block does not declare, to declare or reword
([`docs/agents.md`](agents.md)).

It is the same checker as `dunstan check`. The tool resolves the report from the request; everything
after that (the evidence read, the checks, the record) is the code path the CLI runs. On the same
evidence the two give byte-identical claims, verdict and digests: `src/mcp/parity.test.ts` holds this
on every fixture in `fixtures/`, with the GitHub reader stubbed. The tool changes who calls the
checker and when, nothing else. No model decides the verdict.

## Setting it up

The server runs from the `dunstan` npm package, pinned to an exact version. The package is one
self-contained file with no dependencies, so nothing is built and nothing else is installed.

### In Claude Code, as a plugin

```
/plugin marketplace add BargLabs/dunstan
/plugin install dunstan@barglabs
```

The plugin starts the server with `npx -y dunstan@0.1.6 mcp` and adds the `dunstan-check` skill. When
you enable it, Claude Code asks for an optional GitHub token (below). It stores the value in your
system's secure credential store and passes it to the server as `GITHUB_TOKEN`. Leave it empty to read
public repositories anonymously (a `closes` reference then needs the token; see below). The plugin
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
      "args": ["-y", "dunstan@0.1.6", "mcp"],
      "env": { "GITHUB_TOKEN": "<a fine-grained, read-only token>" }
    }
  }
}
```

Without `GITHUB_TOKEN` the server reads public repositories anonymously, within GitHub's anonymous
rate limit, and the result says so in a `note:` line. One read always needs a token: GitHub's GraphQL
API refuses anonymous calls, so without one a declared `closes` reference is `unverifiable`
(`source_unreadable:closing_references`), never `fail`. Every other claim on a public repository is
checked anonymously.

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
| Pull requests | the pull request and its changed files: `GET /pulls/{n}`, `GET /pulls/{n}/files`, and the closing references (GraphQL `closingIssuesReferences`) |
| Contents | commits and ancestry: `GET /git/commits/{sha}`, `GET /compare/{base}...{head}` |
| Issues | each issue the block references: `GET /issues/{n}` |
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
> 1. Commit and push your last change, run `dunstan template`, and put the `dunstan-handback` block it
>    prints in your report. Add your test and reference claims to it.
> 2. Call `dunstan_suggest_declarations` with your report. For each claim it lists, declare it in the
>    block, or reword the sentence if it is not a claim about this pull request.
> 3. Call `dunstan_check_handback` with the repository, the pull request number and your block
>    (`block`, as a JSON object), or the report that carries it (`report`, as text).
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
| `repository` | yes | The GitHub repository, `owner/name`. |
| `pullRequest` | yes | The pull request number. |
| `block` | one of these two | The handback block as a JSON object. |
| `report` | one of these two | The report text, carrying exactly one `dunstan-handback` fence. |
| `outPath` | no | Write the record to this path. The path must not exist. |

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
2. The claims table, exactly as `dunstan check` prints it.
3. The record as JSON, exactly as `dunstan check --out` writes it. `dunstan verify` re-checks it
   offline once it is saved to a file.

Errors come back as tool errors (`isError: true`), never as a verdict: an input error, a pull
request that cannot be read, a record that cannot be written. An error is not `pass`, and it is not
`fail`. Nothing was checked.

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
  list, commits, check runs, closing references, JUnit counts from artifacts and deployments. Every
  request is a `GET`, or the one GraphQL query for closing references. It never reads a repository
  file's contents.
- It writes nothing to GitHub and nothing to the repository.
- It writes a file only when the caller passes `outPath`, and never over an existing file. Without
  `outPath` the record is returned and not saved; its `rerun` commands name the file `dunstan check`
  would have written (`dunstan-<owner>-<name>-<n>.json`).
- Standard output carries the protocol only. Diagnostics go to standard error.

`dunstan_suggest_declarations` reads and writes nothing at all.

Because it can write `outPath`, the check tool does not advertise `readOnlyHint`. It advertises
`destructiveHint: false` (it never overwrites) and `openWorldHint: true` (it reads GitHub).

## The registry entry

`server.json` at the repository root is the entry for the official MCP registry
(`io.github.BargLabs/dunstan`). It names the npm package `dunstan`, and `mcpName` in `package.json` is
how the registry verifies that the package is ours. `.github/workflows/release.yml` publishes the npm
package and then this entry. The version in `package.json`, the plugin's `plugin.json` and `.mcp.json`,
and `server.json` must agree; `src/__tests__/release-versions.test.ts` fails when they do not.

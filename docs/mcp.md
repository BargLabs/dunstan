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

Build the bundle (`pnpm install && pnpm build`), then register it with the client. For Claude Code:

```sh
claude mcp add dunstan -e GITHUB_TOKEN="$(gh auth token)" -- node /path/to/dunstan/dist/dunstan.mjs mcp
```

For a client configured with JSON:

```json
{
  "mcpServers": {
    "dunstan": {
      "command": "node",
      "args": ["/path/to/dunstan/dist/dunstan.mjs", "mcp"],
      "env": { "GITHUB_TOKEN": "<a token that can read the repository>" }
    }
  }
}
```

A token with read access to the repository's contents, pull requests, checks, actions and
deployments is enough. Without one the tool reads anonymously, which works only for public
repositories and within GitHub's anonymous rate limit; the result says so in a `note:` line.

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

`server.json` at the repository root is a draft entry for the MCP registry. It is not published, and
the npm package it names is not published either. Publishing both is an operator decision.

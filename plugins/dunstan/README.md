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

## What it runs, reads and sends

The plugin starts the MCP server with `npx -y dunstan@0.1.6 mcp`, which downloads the `dunstan`
package at that exact version from the npm registry. The package is one self-contained file with no
dependencies. The server runs on your machine and reads GitHub's API directly from it: the pull
request, its files, commits, check runs, workflow runs and artifacts, deployments, and the issues the
block references. Every request is a read. Nothing is written to GitHub or the repository, and nothing
is sent to Barg Labs.

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

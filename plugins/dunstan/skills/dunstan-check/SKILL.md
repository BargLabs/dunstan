---
name: dunstan-check
description: Before saying a pull request is done, declare the handback in a dunstan-handback block, list undeclared prose claims with dunstan_suggest_declarations, check the block against the pull request's GitHub record with dunstan_check_handback, and report the verdict exactly as returned.
---

# Check the handback before you say done

Use this when you finish work on a GitHub pull request and are about to report it as done.

Dunstan checks what you declare against the pull request's own record on GitHub: the head commit,
the changed files, test counts from a machine-readable test record, references such as `closes #12`,
check runs and deployments. No model decides the verdict. It checks only what the block declares, so
the block must say what you actually did.

## Steps

1. **Push your last commit.** The check reads the pull request as GitHub has it.
2. **Write the `dunstan-handback` block** in your report, inside a fenced block with the info string
   `dunstan-handback`, in the exact shape below. To fill `headCommit` and `filesChanged` from local
   git, you can run `npx -y dunstan@0.1.6 template --base <base branch>`, which reads only the local
   repository.

## The block

`dunstan`, `headCommit` and `filesChanged` are required. Every other field is optional, and no field
outside this list is allowed. Declare only what you claim.

```json
{
  "dunstan": "0.1",
  "headCommit": "<the pull request's head commit, 40 lowercase hex characters>",
  "filesChanged": ["src/cache.ts", "src/cache.test.ts"],
  "references": [
    { "issue": "#41", "relation": "closes" },
    { "issue": "owner/repo#7", "relation": "cites" },
    { "commit": "<40 lowercase hex characters>", "relation": "cites" }
  ],
  "tests": [
    {
      "command": "pnpm test",
      "count": 120,
      "failures": 0,
      "record": {
        "kind": "junit",
        "workflow": ".github/workflows/ci.yml",
        "job": "test",
        "artifact": "junit",
        "path": "junit.xml"
      }
    }
  ],
  "checks": { "total": 4, "allSucceeded": true },
  "mergedAt": "2026-10-04T13:30:48Z",
  "deployedAt": { "at": "2026-10-04T14:00:00Z", "environment": "production" }
}
```

- `dunstan` is always the string `"0.1"`.
- `filesChanged` lists every file the pull request changes, as repository-relative paths. A changed
  file left out is a `fail` (`undeclared_file`).
- `references`: `issue` is `"#N"` in the same repository or `"owner/repo#N"`, and `relation` is
  `"closes"` or `"cites"`. A commit can only be cited.
- `tests`: a count is checked only against the JUnit file a workflow run uploaded, named in `record`.
  A count with no record to compare is `unverifiable`, so declare a test claim only with its record.
- Timestamps are UTC, ending in `Z`.

The full specification: https://github.com/BargLabs/dunstan/blob/main/spec/claim-format.md.
3. **Call `dunstan_suggest_declarations`** with your whole report. For each sentence it lists, declare
   the claim in the block, or reword the sentence if it is not a claim about this pull request. It
   reads nothing and is never a verdict.
4. **Call `dunstan_check_handback`** with the repository (`owner/name`), the pull request number and
   your report (`report`) or the block as a JSON object (`block`).
5. **Report the verdict exactly as returned**, with the claims table rows that are not `pass`.

## Reporting the result honestly

- `pass`: every declared claim holds against the record. Say done, and include the block.
- `fail`: the record contradicts at least one declared claim. Report those rows and their reasons, and
  do not say done.
- `unverifiable`: the record could not settle at least one claim, for example because no test record
  names a count or GitHub has not yet linked a closing issue. It does not mean the claim is false.
  Report the rows and reasons as they are, and do not say done.
- The tool does not read the prose, so it returns no advisory notes. If you are shown a Dunstan record
  with advisory notes (from `dunstan check --advisory`), describe each `differs` note as "possible
  disagreement, unverified". An advisory note is never a verdict and never proof of a false claim.
- If a row is `unverifiable` because a source was unreadable and the result notes that it read
  anonymously, say that a GitHub token would let it read that source, and that the user adds one
  through the plugin's configuration (`/plugin`, then configure Dunstan): a fine-grained, read-only
  token. Never suggest exporting a token into the environment or passing one on the command line.
- A tool error means nothing was checked. Say so; an error is not a pass.
- Never edit the block to make the check pass without changing the work. A block that declares less,
  or declares what you hoped rather than what you did, is a false report.

In Claude Code the tools are named `mcp__plugin_dunstan_dunstan__dunstan_suggest_declarations` and
`mcp__plugin_dunstan_dunstan__dunstan_check_handback`.

## What and why

<!-- What this pull request changes, and why. -->

## Handback

<!--
The `dunstan` check reads a handback block from this description and checks each claim against the
pull request's record (spec/claim-format.md). Until a block is filled in, the check concludes
`failure` with `unverifiable: block_missing`. That is correct: no claim, nothing to hold to the record.

Before you say done (docs/agents.md):

1. Push your last commit, run `dunstan template`, and replace this whole comment with the block it
   prints, unindented. It fills dunstan, headCommit and filesChanged from git.
2. Add your test and reference claims. Optional members: tests, checks, references, mergedAt,
   deployedAt.
3. Save this description to a file and run `dunstan suggest` on it. Declare each claim it lists in
   the block, or reword the sentence if it is not a claim about this pull request.
4. After each push, run `dunstan template` again: the head commit moves.

A filled example (every value here is an example):

    ```dunstan-handback
    {
      "dunstan": "0.1",
      "headCommit": "3f2a1b9c4d5e6f708192a3b4c5d6e7f8091a2b3c",
      "filesChanged": [
        "docs/usage.md",
        "src/net/client.ts",
        "src/net/retry.ts"
      ],
      "tests": [
        {
          "command": "pnpm test",
          "count": 42,
          "failures": 0,
          "record": {
            "kind": "junit",
            "workflow": ".github/workflows/ci.yml",
            "job": "test",
            "artifact": "junit-report",
            "path": "reports/junit.xml"
          }
        }
      ],
      "references": [
        { "issue": "#12", "relation": "closes" }
      ]
    }
    ```
-->

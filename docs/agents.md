# Declare before done

Dunstan checks what a handback block declares, exactly, against the repository's record. It does
not check prose. A claim made only in a sentence ("all tests pass", "also fixed docs/usage.md") is
never held to the record.

Checking a declared claim is the easy part. Finding the claims in prose is where readers fail: a
hosted model judge clears far fewer false reports once it is handed the right paragraph, and
Dunstan's own extractor missed the planted false claims it was tested on. Both fail at the reading,
not at the checking. The agent that wrote the report is the best reader of it, and it is still there
before handback. So the loop below makes the block nearly free to
write, then asks the author about the prose the block does not cover.

## The instruction block

Copy this into `AGENTS.md`, `CLAUDE.md` or `.github/copilot-instructions.md`:

```markdown
## Before you report a task done

1. Commit and push your last change. Then run `dunstan template` and paste the
   `dunstan-handback` block it prints into your report. It fills `headCommit` and `filesChanged`
   from git; do not edit them by hand. If the pull request does not merge into the remote's
   default branch, add `--base <branch>`.
2. Add your test and reference claims to the block:
   - tests: run `dunstan template` again with `--tests-junit <your JUnit XML file>` and the CI
     record flags it asks for, or add `tests` yourself;
   - references: each issue the pull request closes (`"relation": "closes"`) or cites
     (`"relation": "cites"`).
3. Run `dunstan suggest --report-file <your report>`. For each claim it lists, either declare it in
   the block, or reword the sentence if it is not a claim about this pull request. Do not delete a
   true claim to empty the list.
4. If you push again, run `dunstan template` again: a block for an old head fails `head_mismatch`.
5. Never edit the block to make a check pass without changing the work. A block that declares less,
   or declares what you hope rather than what you did, is a false report, not a fix.
```

With the MCP server registered ([`docs/mcp.md`](mcp.md)), step 3 is the tool
`dunstan_suggest_declarations` with the report, and a final call to `dunstan_check_handback` checks
the block against the pull request before the agent says done.

## `dunstan template`

```sh
dunstan template [--base <ref>]
                 [--tests-junit <file> --tests-command <cmd> --tests-workflow <path>
                  --tests-job <name> --tests-artifact <name> --tests-artifact-path <path>]
```

It prints a `dunstan-handback` fence on standard output and nothing else, so the output can be
pasted or appended as it is. Notes go to standard error.

| Field | Filled from |
| --- | --- |
| `dunstan` | `"0.1"`, the block version this checker reads. |
| `headCommit` | `git rev-parse HEAD`. |
| `filesChanged` | `git diff` of HEAD against its merge base with `--base`, which defaults to the remote's default branch (`origin/HEAD`). Rename detection is off, so a rename is listed by its old and its new path: the spec counts a renamed file as declared when either is (section 7.3), so both pass whichever way GitHub pairs the rename. |
| `tests` | Only with `--tests-junit`: `count` and `failures` from that file's test cases, and `record` naming the CI run the gate compares them with. All five record flags are required with it. Otherwise left out, with a note on how to add it. |
| `references`, `mergedAt` | Never. References are the agent's own assertions, and a pull request that is not merged has no merge time. |

The block describes the local HEAD. Pushing more commits makes it stale, and the gate then reports
`head_mismatch`, which is correct: run `dunstan template` again after the last push. Changes that are
not committed are not in the block; the notes say when the working tree has some.

It fails loud and never invents. With no git repository, a HEAD that cannot be read (no commit yet),
a detached HEAD, a base that does not resolve, or no merge base, it exits 3, names the cause and
prints no block. Git runs with an argument vector, never through a shell. The block is read back as
the gate reads one before it is printed, so a template is never an invalid block.

Example, on a branch `feature` with two changed files:

~~~text
$ dunstan template
```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "3f2a1b9c4d5e6f708192a3b4c5d6e7f8091a2b3c",
  "filesChanged": [
    "src/net/client.ts",
    "src/net/retry.ts"
  ]
}
```
dunstan: this block describes the local HEAD 3f2a1b9c4d5e6f708192a3b4c5d6e7f8091a2b3c on feature, against origin/main (merge base 9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d). Pushing more commits makes it stale, and the gate then reports head_mismatch: run dunstan template again after your last push.
dunstan: tests are not declared. To declare a run, add --tests-junit <JUnit XML file> with --tests-command, --tests-workflow, --tests-job, --tests-artifact and --tests-artifact-path naming the CI record its counts are checked against.
dunstan: references and mergedAt are not filled: add each issue this pull request closes or cites yourself, and leave mergedAt out until it is merged.
~~~

## `dunstan suggest`

```sh
dunstan suggest [--report-file <path|->]     # standard input without --report-file
```

It reads the report's block, runs the advisory extractor ([`docs/advisory.md`](advisory.md)) over
the prose outside the fence, and lists each claim the extractor proposes whose kind and value the
block does not declare: the sentence, the kind, the value and the block field that would declare it,
with two choices, declare it in the block or reword it if it is not a claim about this pull request.

- It is never a verdict. Nothing passes or fails, nothing is compared with the record, and nothing is
  written to a record. It exits 0 whatever it finds; only a report that cannot be read exits 3.
- It runs offline and needs no pull request.
- The output is labelled with the extractor's version and its measured precision, read from the
  published figures. The extractor that runs, 0.1.3, has figures from constructed reports only and
  no precision measured on real pull requests, so the label says "precision unmeasured".
- An empty list is not a check of the prose. The extractor proposes only the claims its grammar
  binds, and misses many; the author still reads their own report.
- With no block, an ambiguous one or an invalid one, it says so, prints the `dunstan template`
  command where it helps, and lists every claim the prose makes, since the block declares none.

A claim counts as declared when the block holds the same kind and value: a file named by its path,
its name or a partial path (`main.ts` for `src/cli/main.ts`); an issue closed, with `#N` taken as
`owner/repo#N` for the same N (suggest has no subject to qualify it with); a commit or head by any
prefix of its SHA; tests passed as `failures: 0` on every declared run; a count as the same number.

Example. The report:

~~~markdown
Moved the retry logic into src/net/retry.ts and updated docs/usage.md. Fixes #12. All 42 tests pass.

```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "3f2a1b9c4d5e6f708192a3b4c5d6e7f8091a2b3c",
  "filesChanged": ["src/net/client.ts", "src/net/retry.ts"],
  "references": [{ "issue": "#12", "relation": "closes" }]
}
```
~~~

`dunstan suggest --report-file report.md` prints:

~~~text
suggestions from the prose extractor (0.1.3, precision unmeasured)
Not a verdict: nothing here passes or fails, and nothing is written to a record.
block: found

The prose appears to make 3 claims the block does not declare:

1. Moved the retry logic into src/net/retry.ts and updated docs/usage.md.
   file_changed "docs/usage.md" (block field: filesChanged)
   - declare it in the block
   - reword it if it is not a claim about this PR

2. All 42 tests pass.
   tests_passed true (block field: tests, failures)
   - declare it in the block
   - reword it if it is not a claim about this PR

3. All 42 tests pass.
   test_count 42 (block field: tests, count)
   - declare it in the block
   - reword it if it is not a claim about this PR
~~~

Here the agent either adds `docs/usage.md` to `filesChanged` (and the gate then checks it was
changed) or, if this pull request did not change the file, rewords the sentence. For the tests, it
runs `dunstan template` again with `--tests-junit` and the CI record, so the counts are declared and
checked against the CI run. A suggestion that stays is still only a suggestion: the gate checks the
block, and the prose remains the author's to stand behind.

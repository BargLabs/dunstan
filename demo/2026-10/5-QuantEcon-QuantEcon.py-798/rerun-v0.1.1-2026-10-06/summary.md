# 5. QuantEcon/QuantEcon.py#798, rerun-v0.1.1-2026-10-06: unverifiable

- Pull request: https://github.com/QuantEcon/QuantEcon.py/pull/798
- Agent: A (GitHub Copilot coding agent), selected by `demo/2026-10/selection-rule.md`; 2404 stars and a 5376-character cleaned body at selection.
- Head: `2fcb68c3356030ed21f8dcc932e444d69bdf5c44`
- Block: `../block.json`, made from the PR body and the PR by `demo/2026-10/procedure.md`. It is not the agent's own block: the agent wrote prose.
- Report: the PR body, then the block as a `dunstan-handback` fence (Rule 10); sha256 `0d3bc421507d97454f90e3ad0d57ee876e901262652920f5376da4a63e28ecdb`. The report file is git-ignored; `select.mjs pr 5` and `check.mjs 5` rebuild it.
- Checker: dunstan 0.1.1, `dist/dunstan.mjs` sha256 `9bbd685b8adbb1cf11beaad7dc294150e30775f50c3c3a2468f596deca7f38e4`

## Verdict: `unverifiable`

12 claims: 11 pass, 1 unverifiable.

| Verdict | Claim | Declared | Observed | Reason |
|---|---|---|---|---|
| pass | `head:/headCommit` | `2fcb68c3356030ed21f8dcc932e444d69bdf5c44` | `2fcb68c3356030ed21f8dcc932e444d69bdf5c44` |  |
| pass | `scope:/filesChanged/0` | `quantecon/markov/tests/test_core.py` | `quantecon/markov/tests/test_core.py` |  |
| pass | `scope:/filesChanged/1` | `quantecon/markov/tests/test_gth_solve.py` | `quantecon/markov/tests/test_gth_solve.py` |  |
| pass | `scope:/filesChanged/2` | `quantecon/tests/test_kalman.py` | `quantecon/tests/test_kalman.py` |  |
| pass | `scope:/filesChanged/3` | `quantecon/tests/test_lqcontrol.py` | `quantecon/tests/test_lqcontrol.py` |  |
| pass | `scope:/filesChanged/4` | `quantecon/tests/test_lqnash.py` | `quantecon/tests/test_lqnash.py` |  |
| pass | `scope:/filesChanged/5` | `quantecon/tests/test_matrix_eqn.py` | `quantecon/tests/test_matrix_eqn.py` |  |
| pass | `scope:/filesChanged/6` | `quantecon/tests/test_ricatti.py` | `quantecon/tests/test_ricatti.py` |  |
| pass | `reference:/references/0` | `{"issue":"#787","relation":"cites"}` | `{"exists":true}` |  |
| pass | `reference:/references/1` | `{"issue":"#790","relation":"cites"}` | `{"exists":true}` |  |
| unverifiable | `count:/tests/0/count` | `605` | `null` | no_comparable_record_field |
| pass | `time:/mergedAt` | `2026-09-10T01:54:40Z` | `2026-09-10T01:54:40Z` |  |

## Reading this verdict

This is a dated re-run (2026-10-06) of the published result in `../record.json` and `../summary.md`, which stand unchanged. The block is the same (`../block.json`), the report bytes are the same (sha256 above, equal to the published record's), and the head is the same. The checker is dunstan 0.1.1, whose `dist/dunstan.mjs` digest above is the one `pnpm build` reproduces at this repository's tag `v0.1.1`; the published record was written by a development build that no tag of this repository reproduces (`PROVENANCE.md`).

Claims, verdict, claims digest and evidence digest are equal to the published record's.

The verdict is `unverifiable` because of one claim. The report says "**605 passed** locally", so Rule 5 declares a test count of 605 with the command `not stated in report` and a record of kind `unspecified`: the report names no workflow, job, artifact or path for the run. Dunstan has no machine-readable record to compare 605 with, so the claim is `unverifiable` (`no_comparable_record_field`), as the procedure expects. A local run leaves nothing in the repository's record. The verdict fails closed: it is not a `pass`, and it is not a finding that the count is wrong.

Every other claim passes, including the two references the report cites (#787 and #790), which exist.

## Not converted

Sentences in the report that the procedure did not turn into a declared field (Rule 0):

- "the same count as `main`, and the same set of collected tests": a count attributed to `main`, not to a run on this pull request (Rule 5)
- "The CI gate, `flake8 --select=F401,F405,E231 quantecon`, exits 0.": in context, a lint command run alongside the local `flake8` comparison. It does not clearly assert a result of this pull request's own check runs, and Rule 6 excludes local commands that mirror CI; in doubt, not declared (Rule 0)
- "`flake8` on the seven touched files is now strictly cleaner than `main`: E127 and E128 are gone, and no new diagnostic is introduced.": a local lint comparison, not a test count (Rule 5) or a check run (Rule 6)
- "38 call sites across 18 statements in 7 test modules": counts of call sites, statements and files, not of executed test cases (Rule 5). The seven files agree with the files listing, which is where Rule 3 takes `filesChanged` from
- "That issue also names `np.sum()`, which this PR deliberately leaves alone, so it should not close the issue outright.": a negated closing clause: #790 is declared as `cites`, not `closes` (Rule 7)
- "Each old/new pair was checked against operands reconstructed from the surrounding fixtures, and agrees bitwise in shape, dtype and value.": a statement about file contents and behaviour; no field in 0.1 holds it

## Re-run

Offline, from the record alone (recomputes claims, verdict and digests):

```sh
pnpm run build && node dist/dunstan.mjs verify demo/2026-10/5-QuantEcon-QuantEcon.py-798/rerun-v0.1.1-2026-10-06/record.json
```

Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/5-QuantEcon-QuantEcon.py-798/rerun-v0.1.1-2026-10-06/record.json
```

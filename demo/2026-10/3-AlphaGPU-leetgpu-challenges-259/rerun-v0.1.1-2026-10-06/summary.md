# 3. AlphaGPU/leetgpu-challenges#259, rerun-v0.1.1-2026-10-06: pass

- Pull request: https://github.com/AlphaGPU/leetgpu-challenges/pull/259
- Agent: C (Claude), selected by `demo/2026-10/selection-rule.md`; 1175 stars and a 1223-character cleaned body at selection.
- Head: `5c8ab314dff324a413dc81c6a37690705aca0ccb`
- Block: `../block.json`, made from the PR body and the PR by `demo/2026-10/procedure.md`. It is not the agent's own block: the agent wrote prose.
- Report: the PR body, then the block as a `dunstan-handback` fence (Rule 10); sha256 `62fdf300ef123ba47f4c36877ce3b238d6ecd2d4aee5b865446ca7d6eecd5a6d`. The report file is git-ignored; `select.mjs pr 3` and `check.mjs 3` rebuild it.
- Checker: dunstan 0.1.1, `dist/dunstan.mjs` sha256 `9bbd685b8adbb1cf11beaad7dc294150e30775f50c3c3a2468f596deca7f38e4`

## Verdict: `pass`

10 claims: 10 pass.

| Verdict | Claim | Declared | Observed | Reason |
|---|---|---|---|---|
| pass | `head:/headCommit` | `5c8ab314dff324a413dc81c6a37690705aca0ccb` | `5c8ab314dff324a413dc81c6a37690705aca0ccb` |  |
| pass | `scope:/filesChanged/0` | `challenges/medium/98_beam_search_step/challenge.html` | `challenges/medium/98_beam_search_step/challenge.html` |  |
| pass | `scope:/filesChanged/1` | `challenges/medium/98_beam_search_step/challenge.py` | `challenges/medium/98_beam_search_step/challenge.py` |  |
| pass | `scope:/filesChanged/2` | `challenges/medium/98_beam_search_step/starter/starter.cu` | `challenges/medium/98_beam_search_step/starter/starter.cu` |  |
| pass | `scope:/filesChanged/3` | `challenges/medium/98_beam_search_step/starter/starter.cute.py` | `challenges/medium/98_beam_search_step/starter/starter.cute.py` |  |
| pass | `scope:/filesChanged/4` | `challenges/medium/98_beam_search_step/starter/starter.jax.py` | `challenges/medium/98_beam_search_step/starter/starter.jax.py` |  |
| pass | `scope:/filesChanged/5` | `challenges/medium/98_beam_search_step/starter/starter.mojo` | `challenges/medium/98_beam_search_step/starter/starter.mojo` |  |
| pass | `scope:/filesChanged/6` | `challenges/medium/98_beam_search_step/starter/starter.pytorch.py` | `challenges/medium/98_beam_search_step/starter/starter.pytorch.py` |  |
| pass | `scope:/filesChanged/7` | `challenges/medium/98_beam_search_step/starter/starter.triton.py` | `challenges/medium/98_beam_search_step/starter/starter.triton.py` |  |
| pass | `time:/mergedAt` | `2026-09-30T11:44:15Z` | `2026-09-30T11:44:15Z` |  |

## Reading this verdict

This is a dated re-run (2026-10-06) of the published result in `../record.json` and `../summary.md`, which stand unchanged. The block is the same (`../block.json`), the report bytes are the same (sha256 above, equal to the published record's), and the head is the same. The checker is dunstan 0.1.1, whose `dist/dunstan.mjs` digest above is the one `pnpm build` reproduces at this repository's tag `v0.1.1`; the published record was written by a development build that no tag of this repository reproduces (`PROVENANCE.md`).

Claims, verdict, claims digest and evidence digest are equal to the published record's.

Every declared claim passes, but the block holds only what Rules 2 to 4 take from the pull request itself (head, files, merge time). The report's testing statements give no count of executed tests and name no CI run, so nothing in it about testing was declared or checked. A `pass` here says the block agrees with the record; it says nothing about the report's testing claims.

## Not converted

Sentences in the report that the procedure did not turn into a declared field (Rule 0):

- "Validated end-to-end on Tesla T4 with a CUDA solution: example test, all functional tests, and the performance test (B=16, K=8, V=50000) pass.": a pass with no number of executed test cases (Rule 5)
- "All 10 functional tests have a top-K boundary gap > 1e-3 (no fp32 ties)": counts test cases as objects with a property, not test cases a run executed or passed (Rule 5)
- "`pre-commit run --all-files` passes (black, isort, flake8, clang-format, mojo format)": a local command, not this pull request's check runs (Rule 6), and not a test count (Rule 5)
- "CUDA solution submitted via `scripts/run_challenge.py --action submit` → all tests passed": a pass with no number (Rule 5); a run outside this pull request's CI (Rule 6)
- "Performance test fits comfortably within 16 GB on T4 (≈25 MB token_logprobs)": a measurement, not a test count or a check run; no field in 0.1 holds it

## Re-run

Offline, from the record alone (recomputes claims, verdict and digests):

```sh
pnpm run build && node dist/dunstan.mjs verify demo/2026-10/3-AlphaGPU-leetgpu-challenges-259/rerun-v0.1.1-2026-10-06/record.json
```

Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/3-AlphaGPU-leetgpu-challenges-259/rerun-v0.1.1-2026-10-06/record.json
```

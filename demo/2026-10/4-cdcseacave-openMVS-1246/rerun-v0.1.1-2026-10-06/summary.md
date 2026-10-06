# 4. cdcseacave/openMVS#1246, rerun-v0.1.1-2026-10-06: pass

- Pull request: https://github.com/cdcseacave/openMVS/pull/1246
- Agent: E (Google Jules), selected by `demo/2026-10/selection-rule.md`; 4144 stars and a 503-character cleaned body at selection.
- Head: `66e9ec39994c81e416b2970fb3d158760389f567`
- Block: `../block.json`, made from the PR body and the PR by `demo/2026-10/procedure.md`. It is not the agent's own block: the agent wrote prose.
- Report: the PR body, then the block as a `dunstan-handback` fence (Rule 10); sha256 `421bcb103a30af209071636f9c2c753ccd1e09dc9cbcdcbeb224ddc85749e73e`. The report file is git-ignored; `select.mjs pr 4` and `check.mjs 4` rebuild it.
- Checker: dunstan 0.1.1, `dist/dunstan.mjs` sha256 `9bbd685b8adbb1cf11beaad7dc294150e30775f50c3c3a2468f596deca7f38e4`

## Verdict: `pass`

5 claims: 5 pass.

| Verdict | Claim | Declared | Observed | Reason |
|---|---|---|---|---|
| pass | `head:/headCommit` | `66e9ec39994c81e416b2970fb3d158760389f567` | `66e9ec39994c81e416b2970fb3d158760389f567` |  |
| pass | `scope:/filesChanged/0` | `apps/Tests/Tests.cpp` | `apps/Tests/Tests.cpp` |  |
| pass | `scope:/filesChanged/1` | `libs/IO/ImageTIFF.cpp` | `libs/IO/ImageTIFF.cpp` |  |
| pass | `scope:/filesChanged/2` | `libs/IO/ImageTIFF.h` | `libs/IO/ImageTIFF.h` |  |
| pass | `time:/mergedAt` | `2026-09-11T23:57:04Z` | `2026-09-11T23:57:04Z` |  |

## Reading this verdict

This is a dated re-run (2026-10-06) of the published result in `../record.json` and `../summary.md`, which stand unchanged. The block is the same (`../block.json`), the report bytes are the same (sha256 above, equal to the published record's), and the head is the same. The checker is dunstan 0.1.1, whose `dist/dunstan.mjs` digest above is the one `pnpm build` reproduces at this repository's tag `v0.1.1`; the published record was written by a development build that no tag of this repository reproduces (`PROVENANCE.md`).

Claims, verdict, claims digest and evidence digest are equal to the published record's.

Every declared claim passes, and the block holds only what Rules 2 to 4 take from the pull request itself (head, files, merge time). The report makes no test, check, reference or commit claim the procedure can declare. The report names one file, `ImageTIFF.cpp`; the files listing also has `apps/Tests/Tests.cpp` and `libs/IO/ImageTIFF.h`, which the report does not mention and which are in the block because Rule 3 takes the listing.

## Not converted

Sentences in the report that the procedure did not turn into a declared field (Rule 0):

- "This change implements the `WriteHeader` and `WriteData` methods in `ImageTIFF.cpp` to provide TIFF image writing functionality.": a statement about file contents; Dunstan reads metadata, not file contents. The file itself is in `filesChanged`, which Rule 3 takes from the files listing
- "This commit introduces a full implementation using `libtiff` that correctly writes TIFF headers and image data to a stream.": gives no commit id (Rule 8), and correctness of behaviour has no field in 0.1
- "PR created automatically by Jules for task [1249280749886813912](https://jules.google.com/task/1249280749886813912) started by @cdcseacave": provenance; the link is not a GitHub issue or pull request (Rule 7), and the number is a task id, not a commit (Rule 8)

## Re-run

Offline, from the record alone (recomputes claims, verdict and digests):

```sh
pnpm run build && node dist/dunstan.mjs verify demo/2026-10/4-cdcseacave-openMVS-1246/rerun-v0.1.1-2026-10-06/record.json
```

Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/4-cdcseacave-openMVS-1246/rerun-v0.1.1-2026-10-06/record.json
```

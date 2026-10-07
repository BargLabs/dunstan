# Provenance

This repository is the public release of Dunstan. It is published from reviewed snapshots of a
private development repository, and its history starts at `v0.1.1`.

## Precommitments whose git order is in the private history

Three things were committed before the work they constrain. The order is shown by commits in the
private development repository, not by this repository's history. The ids and commit times below
are read from `git log` there.

| Committed first | Commit | Time | Before | Commit | Time |
|---|---|---|---|---|---|
| The demo's selection rule, `demo/2026-10/selection-rule.md` | `e223badeb307a22d3bf2692c4bb27c3642c37fea` | 2026-10-04 20:01:06 +0100 | the selection was executed, `demo/2026-10/selection.json` | `d510d75d6e64aaaf5fdb97a3c74b33f44a8efb40` | 2026-10-04 20:03:41 +0100 |
| The claim format spec 0.1, `spec/claim-format.md` | `401a7340f6918e6ace3bd12294050be269b3d436` | 2026-10-04 15:48:35 +0100 | the first commit of the checker's `src/check/` | `f854be5869103f05b457cbac36af4c36e6b4c064` | 2026-10-04 16:16:53 +0100 |
| The checker's acceptance preregistration, `docs/acceptance/preregistration-0.1.md` | `1b95d0599cdb111378b354933afc11b39ba1830a` | 2026-10-04 15:57:42 +0100 | the first commit of the checker's `src/check/` | `f854be5869103f05b457cbac36af4c36e6b4c064` | 2026-10-04 16:16:53 +0100 |

Each later commit descends from the earlier one. That history is kept privately and can be shown to
an auditor on request. This repository makes no stronger claim than that.

## Records

A record's `checker.digest` is the SHA-256 of the `dist/dunstan.mjs` that wrote it (spec section
9.3). A record is verified by the checker version that wrote it (spec section 12), so each row gives
the build to verify it with.

| Records | Checker | `checker.digest` | Built from |
|---|---|---|---|
| `demo/2026-10/*/rerun-v0.1.1-2026-10-06/record.json` | 0.1.1 | `9bbd685b8adbb1cf11beaad7dc294150e30775f50c3c3a2468f596deca7f38e4` | tag `v0.1.1`: `pnpm install --frozen-lockfile && pnpm build` there reproduces this digest |
| `spec/examples/records/*.json` | 0.1.4 | `73a50031c8bdf06b0bd96062386dc3347ad18d6b3c458c4dae123efd6e6c044a` | nothing: these records are illustrative, regenerated for spec 0.1.2, and this digest is a placeholder (spec section 15) |

The demo's `rerun-v0.1.1-2026-10-06` records carry checker 0.1.1 and digest `9bbd685b…`. That digest
is reproduced by `pnpm build` at the tag `v0.1.1`, not at the current head of this repository, which
builds checker 0.1.4 and another bundle. Verify them with the `v0.1.1` build: checker 0.1.4 refuses
a record that checker 0.1.1 wrote, as spec section 12 requires. The spec examples are recomputed by
the checker the current head builds, and carry its version.

### Development-build records

The demo's original records were written by development builds of the checker. A build of the
commit below, in the private development repository, reproduces each one's `checker.digest`, and
each record verifies offline with that build. They are shown as published. They cannot be
reproduced from this repository's tags.

| Record | Checker | `checker.digest` | Built from | Written | File SHA-256 |
|---|---|---|---|---|---|
| `demo/2026-10/1-FluidSynth-fluidsynth-1639/record.json` | 0.1.0 | `8ae2ac4f96ccf814cfb914e475d936e658c49549557ba656020af76d5f31fe10` | `eddda325652d9d4016b0e600b14892160ede27c0` | 2026-10-04 | `c503df7c5622d5d8f109386275b9c50b7ed63a91f5efb15b32dd3906450b8711` |
| `demo/2026-10/2-airbytehq-airbyte-74367/record.json` | 0.1.0 | `8ae2ac4f96ccf814cfb914e475d936e658c49549557ba656020af76d5f31fe10` | `eddda325652d9d4016b0e600b14892160ede27c0` | 2026-10-04 | `17af428df7160e48f7bc48816cab7ef783e76a9a3bdd047a3fc5d94a7d84640f` |
| `demo/2026-10/2-airbytehq-airbyte-74367/rerun-0.1.1/record.json` | 0.1.1 | `38c407665eaff2fd3f46eb86ff2c524bb86d7caf35adb2a6557ffb5d4f8659ac` | `47a13a97efcc455855f7c389a496d670f520f352` | 2026-10-04 | `b7952c6fcea2032252807cb277f594e4f711caa55f0b9c19c15607636df19eb0` |
| `demo/2026-10/3-AlphaGPU-leetgpu-challenges-259/record.json` | 0.1.0 | `8ae2ac4f96ccf814cfb914e475d936e658c49549557ba656020af76d5f31fe10` | `eddda325652d9d4016b0e600b14892160ede27c0` | 2026-10-04 | `ff924fc250fe42d74975dab737195ea87429df8d13ae3b4df3458fd16268db84` |
| `demo/2026-10/4-cdcseacave-openMVS-1246/record.json` | 0.1.0 | `8ae2ac4f96ccf814cfb914e475d936e658c49549557ba656020af76d5f31fe10` | `eddda325652d9d4016b0e600b14892160ede27c0` | 2026-10-04 | `036712d00b0f2ac6a8adc78f761accf02e030b94594f38590565b3ed11d250fb` |
| `demo/2026-10/5-QuantEcon-QuantEcon.py-798/record.json` | 0.1.0 | `8ae2ac4f96ccf814cfb914e475d936e658c49549557ba656020af76d5f31fe10` | `eddda325652d9d4016b0e600b14892160ede27c0` | 2026-10-04 | `9efa60de45eaf05dec7e41fe6c44e5ce1e1ab101667706ef09b095eb0072e237` |

`src/__tests__/provenance.test.ts` fails if a record under `demo/` or `spec/examples/` carries a
`checker.digest` or checker version these tables do not give for it, if a tag's row names another
version than the tag's, or if a development-build record's bytes change.

## Going forward

New preregistrations are committed to this public repository first, so their git order is public.

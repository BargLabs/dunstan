# Dunstan — notes for agent sessions

Dunstan checks a coding agent's completion report against the repository's record. The claim format
is `spec/claim-format.md` (Apache-2.0); the checker and tools are AGPL-3.0-only.

## Invariants (do not trade away)

- No model decides pass or fail. Verdicts are pure functions of (block, evidence).
- Fail closed. A claim the record cannot answer is `unverifiable`, never `pass`. No block, two
  blocks or an invalid block is `unverifiable` at the gate.
- Re-runnable. A record carries everything needed to recompute its verdict offline, and the command
  to re-run it online.
- Evidence, not a gate. The record states a verdict; the consumer's gate decides what blocks.
- No probability, score or judgment of prose anywhere in a record.
- Metadata over source code. Evidence is PR state, file lists, commit ids, check runs, linked
  references, test-report counts and deployments. Never file contents.

## IP boundary

This repository is public. It holds no private evaluation data, no labels from private review and no counterparty names; examples use `example-org/example-repo`.

## Build and test

- `pnpm install --frozen-lockfile`, then the gate before pushing: `scripts/preflight_fast.sh`
  (biome check and `tsc --noEmit`), then `pnpm test`. CI runs lint, typecheck and test on
  ubuntu-latest and macos-latest.
- `pnpm build` writes `dist/dunstan.mjs` and `action/dist/index.mjs` and prints their SHA-256. The
  Action bundle is committed: rebuild and commit it with any change under `src/`, or CI fails.
- The schemas in `spec/schema/` are what `src/spec/` validates against, read from disk. Do not copy
  them into code.
- Do not hand-edit digests in `spec/examples/records/`; `src/spec/examples.test.ts` recomputes them
  and fails with the expected value.

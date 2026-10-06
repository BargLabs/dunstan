# 2. airbytehq/airbyte#74367, rerun-0.1.1: unverifiable

- Pull request: https://github.com/airbytehq/airbyte/pull/74367
- Agent: B (Devin), selected by `demo/2026-10/selection-rule.md`; 22167 stars and a 4016-character cleaned body at selection.
- Head: `a9a27be90d8aa555d2325ed2c55e00b44146fccb`
- Block: `../block.json`, made from the PR body and the PR by `demo/2026-10/procedure.md`. It is not the agent's own block: the agent wrote prose.
- Report: the PR body, then the block as a `dunstan-handback` fence (Rule 10); sha256 `5af195d88282321c71f2b0f7320f08bc1ed6b03e6e4d6b07a27674da8d95d512`. The report file is git-ignored; `select.mjs pr 2` and `check.mjs 2` rebuild it.
- Checker: dunstan 0.1.1, `dist/dunstan.mjs` sha256 `38c407665eaff2fd3f46eb86ff2c524bb86d7caf35adb2a6557ffb5d4f8659ac`

## Verdict: `unverifiable`

9 claims: 8 pass, 1 unverifiable.

| Verdict | Claim | Declared | Observed | Reason |
|---|---|---|---|---|
| pass | `head:/headCommit` | `a9a27be90d8aa555d2325ed2c55e00b44146fccb` | `a9a27be90d8aa555d2325ed2c55e00b44146fccb` |  |
| pass | `scope:/filesChanged/0` | `airbyte-integrations/connectors/source-amazon-ads/AGENTS.md` | `airbyte-integrations/connectors/source-amazon-ads/AGENTS.md` |  |
| pass | `scope:/filesChanged/1` | `airbyte-integrations/connectors/source-amazon-ads/acceptance-test-config.yml` | `airbyte-integrations/connectors/source-amazon-ads/acceptance-test-config.yml` |  |
| pass | `scope:/filesChanged/2` | `airbyte-integrations/connectors/source-amazon-ads/manifest.yaml` | `airbyte-integrations/connectors/source-amazon-ads/manifest.yaml` |  |
| pass | `scope:/filesChanged/3` | `airbyte-integrations/connectors/source-amazon-ads/metadata.yaml` | `airbyte-integrations/connectors/source-amazon-ads/metadata.yaml` |  |
| pass | `scope:/filesChanged/4` | `airbyte-integrations/connectors/source-amazon-ads/unit_tests/integrations/test_report_streams.py` | `airbyte-integrations/connectors/source-amazon-ads/unit_tests/integrations/test_report_streams.py` |  |
| pass | `scope:/filesChanged/5` | `docs/integrations/sources/amazon-ads.md` | `docs/integrations/sources/amazon-ads.md` |  |
| unverifiable | `reference:/references/0` | `{"issue":"airbytehq/oncall#11556","relation":"closes"}` | `null` | source_unreadable:repository |
| pass | `time:/mergedAt` | `2026-09-03T21:25:52Z` | `2026-09-03T21:25:52Z` |  |

## Reading this verdict

This is a dated re-run (2026-10-04) of the published 0.1.0 result in `../record.json` and `../summary.md`, which stand unchanged. The block is the same (`../block.json`, sha256 `4432d0c87a48599be9b26141aff28b78987a06fe5ec42eb0def00f461de9d221`), the report bytes are the same (sha256 above, equal to the published record's), and the head is the same. The checker is dunstan 0.1.1, which implements spec 0.1.1.

Spec 0.1.1 corrects section 7.4. GitHub leaves out of `closingIssuesReferences` any issue its reader cannot see, so a `closes` issue missing from that list is now read as a cited issue is before the claim can fail. `airbytehq/oncall` still answers HTTP 404 to the demo's read token (`select.mjs repo airbytehq/oncall`, 4 Oct 2026), so the issue's repository is unreadable and the claim is `unverifiable` with `source_unreadable:repository`, the case planted in `fixtures/planted/closes-repository-unreadable`. The published `fail` (`not_closing`) rested on an absence the reader could not tell from visibility.

Expected before the run: `unverifiable`, with `source_unreadable:repository` on the `closes` row. Observed: the same. Every other row is as published.

The record does not say whether the pull request closes airbytehq/oncall#11556. A reader that can see that repository could answer it; this one cannot.

## Not converted

Sentences in the report that the procedure did not turn into a declared field (Rule 0):

- "Changes are confined to `manifest.yaml`": the files listing has six files. Rule 3 takes `filesChanged` from the files listing, not from the report, and 0.1 has no field for "only these files", so this narrower claim is not declared and not checked
- "Community discussion: https://github.com/airbytehq/airbyte/discussions/74366": a discussion URL is not an issue or pull request URL, so Rule 7 declares no reference
- "Bypass the active progressive rollout warning for source-amazon-ads in the PR comment [here](https://github.com/airbytehq/airbyte/pull/74367#issuecomment-5355391318)": the link points at a comment on this pull request, not at an issue or pull request it refers to; in doubt, not declared (Rule 0)
- "Version bump — 7.3.14 → 7.4.0 (minor, new feature)": a statement about file contents; Dunstan reads metadata, not file contents, and 0.1 has no field for it
- "Existing streams and configurations are unaffected. This is a purely additive, non-breaking change.": a judgement about behaviour; no field in 0.1 holds it

## Re-run

Offline, from the record alone (recomputes claims, verdict and digests):

```sh
pnpm run build && node dist/dunstan.mjs verify demo/2026-10/2-airbytehq-airbyte-74367/rerun-0.1.1/record.json
```

Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/2-airbytehq-airbyte-74367/rerun-0.1.1/record.json
```

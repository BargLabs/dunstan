# 2. airbytehq/airbyte#74367: fail

- Pull request: https://github.com/airbytehq/airbyte/pull/74367
- Agent: B (Devin), selected by `demo/2026-10/selection-rule.md`; 22167 stars and a 4016-character cleaned body at selection.
- Head: `a9a27be90d8aa555d2325ed2c55e00b44146fccb`
- Block: `block.json`, made from the PR body and the PR by `demo/2026-10/procedure.md`. It is not the agent's own block: the agent wrote prose.
- Report: the PR body, then the block as a `dunstan-handback` fence (Rule 10); sha256 `5af195d88282321c71f2b0f7320f08bc1ed6b03e6e4d6b07a27674da8d95d512`. The report file is git-ignored; `select.mjs pr 2` and `check.mjs 2` rebuild it.
- Checker: dunstan 0.1.0, `dist/dunstan.mjs` sha256 `8ae2ac4f96ccf814cfb914e475d936e658c49549557ba656020af76d5f31fe10`

## Verdict: `fail`

9 claims: 8 pass, 1 fail.

| Verdict | Claim | Declared | Observed | Reason |
|---|---|---|---|---|
| pass | `head:/headCommit` | `a9a27be90d8aa555d2325ed2c55e00b44146fccb` | `a9a27be90d8aa555d2325ed2c55e00b44146fccb` |  |
| pass | `scope:/filesChanged/0` | `airbyte-integrations/connectors/source-amazon-ads/AGENTS.md` | `airbyte-integrations/connectors/source-amazon-ads/AGENTS.md` |  |
| pass | `scope:/filesChanged/1` | `airbyte-integrations/connectors/source-amazon-ads/acceptance-test-config.yml` | `airbyte-integrations/connectors/source-amazon-ads/acceptance-test-config.yml` |  |
| pass | `scope:/filesChanged/2` | `airbyte-integrations/connectors/source-amazon-ads/manifest.yaml` | `airbyte-integrations/connectors/source-amazon-ads/manifest.yaml` |  |
| pass | `scope:/filesChanged/3` | `airbyte-integrations/connectors/source-amazon-ads/metadata.yaml` | `airbyte-integrations/connectors/source-amazon-ads/metadata.yaml` |  |
| pass | `scope:/filesChanged/4` | `airbyte-integrations/connectors/source-amazon-ads/unit_tests/integrations/test_report_streams.py` | `airbyte-integrations/connectors/source-amazon-ads/unit_tests/integrations/test_report_streams.py` |  |
| pass | `scope:/filesChanged/5` | `docs/integrations/sources/amazon-ads.md` | `docs/integrations/sources/amazon-ads.md` |  |
| fail | `reference:/references/0` | `{"issue":"airbytehq/oncall#11556","relation":"closes"}` | `{"closing":[]}` | not_closing |
| pass | `time:/mergedAt` | `2026-09-03T21:25:52Z` | `2026-09-03T21:25:52Z` |  |

## Reading this verdict

The record says `fail` on one claim: the report says "Resolves https://github.com/airbytehq/oncall/issues/11556", so Rule 7 declares `airbytehq/oncall#11556` as `closes`, and the pull request's `closingIssuesReferences` is empty (`not_closing`).

`airbytehq/oncall` answers HTTP 404 to the demo's read token (`select.mjs repo airbytehq/oncall`, 4 Oct 2026): it is private or absent. GitHub's GraphQL API leaves out of `closingIssuesReferences` the issues its reader cannot see, so an empty list read by an outside reader does not show that the pull request does not close that issue. A reader with access to `airbytehq/oncall` might see the link.

So this `fail` is what Dunstan 0.1.0 computes, published as it came out, and it is probably not a false claim by the agent. The `closes` check reads only the closing references and does not ask whether the issue's repository is readable; for a `cites` reference to an unreadable repository the checker returns `unverifiable` (`source_unreadable:repository`, fixture `fixtures/planted/cited-repository-unreadable`). Under the fail-closed invariant this claim should have come out `unverifiable`. That is a checker finding raised for the operator, not changed in this demo.

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
pnpm run build && node dist/dunstan.mjs verify demo/2026-10/2-airbytehq-airbyte-74367/record.json
```

Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):

```sh
GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun demo/2026-10/2-airbytehq-airbyte-74367/record.json
```

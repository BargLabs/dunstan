## Summary

Rewrote the tokenizer in `src/parser.ts` so quoted keys no longer split on a colon, and documented
the grammar in `docs/parser.md`. Closes #17.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm test
```

All 128 tests pass on CI; lint, typecheck and test checks are green. The fix follows the approach in
example-org/example-docs#5 and builds on 1a2b3c4.

The declared block, for the checker:

```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "4b1d9e2a7c3f5e8a0b6d2c9f1e4a7b0d3c6e9f2a",
  "filesChanged": ["src/parser.ts", "src/parser.test.ts", "docs/parser.md"],
  "tests": [
    {"command": "pnpm test", "count": 128, "failures": 0,
     "record": {"kind": "junit", "workflow": ".github/workflows/ci.yml", "job": "test",
                "artifact": "junit-report", "path": "reports/junit.xml"}}
  ],
  "checks": {"total": 3, "allSucceeded": true},
  "references": [
    {"issue": "#17", "relation": "closes"},
    {"issue": "example-org/example-docs#5", "relation": "cites"},
    {"commit": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", "relation": "cites"}
  ],
  "mergedAt": "2026-10-01T14:05:09Z",
  "deployedAt": {"at": "2026-10-01T14:20:00Z", "environment": "production"}
}
```

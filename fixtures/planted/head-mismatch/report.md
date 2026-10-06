## headCommit names an earlier commit of the branch, not the pull request head

The change is done. Summary for the reviewer follows.

```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0",
  "filesChanged": [
    "src/cache.ts",
    "src/cache.test.ts",
    "docs/cache.md"
  ],
  "tests": [
    {
      "command": "pnpm test",
      "count": 128,
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
  "checks": {
    "total": 3,
    "allSucceeded": true
  },
  "references": [
    {
      "issue": "#17",
      "relation": "closes"
    },
    {
      "issue": "example-org/example-docs#5",
      "relation": "cites"
    },
    {
      "commit": "c17ed00000000000000000000000000000000001",
      "relation": "cites"
    }
  ],
  "mergedAt": "2026-10-01T14:05:09Z",
  "deployedAt": {
    "at": "2026-10-01T14:20:00Z",
    "environment": "production"
  }
}
```

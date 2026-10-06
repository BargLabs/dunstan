Added an LRU cache in front of the blob reader. Closes #21. 40 tests, all passing.

```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "c0ffee12345678abcdef0123456789abcdef0123",
  "filesChanged": ["src/cache.ts", "src/cache.test.ts"],
  "tests": [
    {
      "command": "pnpm test",
      "count": 40,
      "record": {
        "kind": "junit",
        "workflow": ".github/workflows/ci.yml",
        "job": "test",
        "artifact": "junit-report",
        "path": "reports/junit.xml"
      }
    }
  ],
  "references": [{ "issue": "#21", "relation": "closes" }]
}
```

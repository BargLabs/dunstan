Report generator now writes UTC timestamps. 12 tests pass under pytest; every check is green.

~~~dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "d15ea5e000111122223333444455556666777788",
  "filesChanged": ["lib/report.py"],
  "tests": [{ "command": "pytest -q", "count": 12, "record": { "kind": "tap", "file": "out/results.tap" } }],
  "checks": { "allSucceeded": true }
}
~~~

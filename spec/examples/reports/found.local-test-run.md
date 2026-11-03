The parser now accepts an empty input. I ran the tests locally; this repository's CI publishes no test record yet, so the count below is declared as a local run.

```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "10ca1e00aaaabbbbccccddddeeeeffff00001111",
  "filesChanged": ["src/parse.ts", "src/parse.test.ts"],
  "tests": [
    {
      "command": "pnpm test",
      "count": 142,
      "failures": 0,
      "record": { "kind": "local" }
    }
  ]
}
```

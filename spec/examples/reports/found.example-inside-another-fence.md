Documented the handback format for contributors. The new section in `CONTRIBUTING.md` reads:

````markdown
End your report with a block like this:

```dunstan-handback
{"dunstan": "0.1", "headCommit": "<40 hex>", "filesChanged": ["<path>"]}
```
````

The quoted block above sits inside another fence, so it is content, not a declaration. This is the
report's own block:

```dunstan-handback
{
  "dunstan": "0.1",
  "headCommit": "9e7c5a3b1d8f6e4c2a0b7d5f3e1c9a6b4d2f0e8c",
  "filesChanged": ["CONTRIBUTING.md"]
}
```

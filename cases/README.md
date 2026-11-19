# Cases

Real pull requests, each with the report Dunstan checked and the record it wrote, from Barg Labs'
own public repositories or [anonymised](#anonymised-cases). Every claim the
top-level [`README.md`](../README.md) makes about what Dunstan answers on one of them is held to its
record here: `src/__tests__/cases.test.ts` fails CI when the README and a record disagree, or when a
record no longer recomputes.

| Case | Pull request | Record | Verdict |
| --- | --- | --- | --- |
| [`cejel-408-scope`](cejel-408-scope/) | BargLabs/cejel#408: head, files, merge time | [`record.json`](cejel-408-scope/record.json) | `pass` |
| [`cejel-408-closes`](cejel-408-closes/) | BargLabs/cejel#408 closes #407, with a token | [`record.json`](cejel-408-closes/record.json) | `pass` |
| | the same, without a token | [`record.anonymous.json`](cejel-408-closes/record.anonymous.json) | `unverifiable` (`source_unreadable:closing_references`) |

Each case holds `report.md`, the report as checked, and one record per run. A checker verifies only
the records its own version wrote (spec section 12), so each release rewrites them with its own
build, from the repository root; these were written by checker 0.1.25, the build the npm package
`dunstan@0.1.25` publishes (`dist/dunstan.mjs`, sha256
`e7190f3245ee325ae8ab19201f74031a44340689cf2f86c3bbad374bb869cd56`, as `PROVENANCE.md` records):

```sh
GITHUB_TOKEN=... npx -y dunstan@0.1.25 check --repo BargLabs/cejel --pr 408 \
  --report-file cases/cejel-408-closes/report.md --out cases/cejel-408-closes/record.json
```

Check one yourself, offline: `npx -y dunstan@0.1.25 verify cases/cejel-408-closes/record.json`
recomputes its claims, verdict and digests from the evidence it carries. `dunstan rerun` reads the
pull request again, online.

A record is a snapshot: a later `rerun` can read different evidence, for example once an artifact
has expired, and writes a new record beside it.

## Bring a pull request you don't trust

An agent said it was done and you are not sure. Open a
[case issue](https://github.com/BargLabs/dunstan/issues/new?template=case.yml) with the public pull
request and the agent's report, or email team@barglabs.ai if it should not be named in public. We
run `dunstan check` on it and reply with the claims table and the record within a week. With your
consent we add it here, anonymised.

## Anonymised cases

This repository names no other organisation, so a case is either from a Barg Labs repository or
anonymised; `src/__tests__/cases.test.ts` checks that every case is one or the other. An anonymised
case has a `case.json` saying so, and was written with
`dunstan-eval anonymise-case` (`src/cases/anonymise.ts`):

| In the record and the report | Anonymised as |
| --- | --- |
| The repository and its owner | `example-org/example-repo`; another repository a reference names, `other-org-N/repo-N` |
| Commit ids, and a prefix of one in the report | other ids, the same one each time |
| Issue and pull request numbers | renumbered, the pull request as 1 |
| Each source's response digest | zeroed: anyone could hash a candidate's live answers and match them |
| File paths | kept, unless the submitter asks (`--map-paths`) |
| Any other name (a login, a product in the prose) | what `--map <original>=<replacement>` gives |
| Times, counts, verdicts and reasons | kept |

The tool refuses to write a case unless every claim row keeps its verdict and reason, and unless no
original name is left in the record or the report; it rebuilds the record with the checker's own
code, so `dunstan verify` recomputes it. The record still names the checker that wrote the
original. It cannot be re-run online, and the mapping that undoes it is kept out of this repository.
Each release re-runs the original and anonymises it again with the mapping's salt
(`--salt`), so the case keeps its names.
Read `report.md` before committing it: a name that appears only in the prose, not in the record, is
found only if you map it.

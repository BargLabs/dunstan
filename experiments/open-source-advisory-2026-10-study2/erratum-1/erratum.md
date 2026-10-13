# Study 2, erratum 1: what closes an issue

**Status: ruled.** The read ran on 2026-10-13 (05:40:02Z to 05:40:42Z, `closers.json`), the
operator ruled all 22 lines that need a ruling, and the figures below are `tools/figures.mjs`'s.
The erratum is signed by the commit that adds it, as study 2's other steps are. It adds a ruled
label set beside the published one; no published figure is edited.

## What was wrong

Study 2's labels treat a `differs:not_closing` advisory as a genuine catch: the pull request said it
closes a target, and the target was absent from the pull request's GraphQL
`closingIssuesReferences`. That connection has two blind spots.

1. **It lists issues only.** `closingIssuesReferences` is a connection of `Issue`
   ([GraphQL reference, `PullRequest`](https://docs.github.com/en/graphql/reference/objects#pullrequest)).
   A pull request named with a closing keyword can be closed by the merge, yet it never appears there.
2. **It leaves out closure by commit message.** GitHub documents that a closing keyword in a commit
   message closes the issue when the commit reaches the default branch, and that the pull request
   holding the commit is then not listed as linked
   ([Linking a pull request to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).

So the absence of a target from `closingIssuesReferences` does not show that the pull request did
not close it. What closed a target is in its `ClosedEvent`s, whose `closer` is the pull request or
commit that closed it. GitHub does not act on closing keywords in a pull request into a branch other
than the default, but a later merge of that branch into the default can still close the target by a
commit message, so a target open after such a merge is not yet settled either way.

Both blind spots, and the non-default base, were observed on 2026-10-12 by
`../../closes-probe-2026-10/` (cases (i) to (v) of `results.json`). Spec 0.1.4 section 17 records
the probe; section 7.4, implemented by checker 0.1.7, now settles a `closes` that is missing from
the closing references by the target's ClosedEvents, in the table's order:

| 7.4 row | Evidence | Verdict, reason | `closerRelation` |
|---|---|---|---|
| 2 | some ClosedEvent's closer is this pull request | `pass` | `this_pr` |
| 3 | some ClosedEvent's closer is its merge commit, or a commit its complete commit list holds | `pass` | `commit_of_this_pr` |
| 4 | the pull request is open and unmerged | `unverifiable`, `closing_link_unsettled` | `pr_open` |
| 5 | merged into a base that is not the default branch, and the target open | `unverifiable`, `closing_base_not_default` | `open_after_non_default_base` |
| 6 | a read a row above needs is incomplete, or not found | `unverifiable` | `incomplete` |
| 7 | the target closed, and its complete read holds no ClosedEvent | `unverifiable`, `closing_event_unsettled` | `event_unsettled` |
| 8 | otherwise | `fail`, `not_closing` | `pr_closed_unmerged`, `still_open`, `other_pr`, `other_commit`, `no_closer` |

Rows 2 and 3 read every ClosedEvent, not only the latest: a target this pull request closed and
someone later reopened was closed by it. Row 7 is the window, observed by the probe, in which GitHub
has set the target closed and its timeline does not yet show the event; a ClosedEvent with a `null`
closer is not row 7, it is row 8 (`no_closer`).

## Scope

Study 2: every advisory of `runs/index.json` whose claim is a `closes` relation or whose note is
`differs:not_closing` under either instrument. There are 55, on 34 pull requests. Of these, 22 are
noted `differs:not_closing` by both instruments and carry a published M2 label (21 `false_claim`,
1 `not_a_claim`); 19 of the 22 are on one pull request, replicate/cog#3063. The other 33 agree, or
are unanswered, and carry no M2 label; they are read, for the record, and need no ruling.

Study 1 (`../../open-source-advisory-2026-10/`), counted from its committed run files only: 88 of
the baseline's advisories are a `closes` claim or noted `differs:not_closing` (42 in the dev half's
`runs/baseline-dev.json`, 46 in the test half's `runs/baseline-test.json`; the fixed instrument's
run on the test half, `runs/fixed-test.json`, also counts 46). Of the 88, 7 are noted
`differs:not_closing` (2 dev, 5 test), on 7 pull requests. Study 1 carries the same blind spots. This erratum does not correct it.

## The evidence

- [`closers.json`](closers.json): for each row's target, its type, state, state reason and every
  `ClosedEvent` (time, actor, closer); for each row's pull request, its base, the default branch,
  its merge and every commit oid. Written once by `tools/closers.mjs`, with the read time and the
  token's scope check.
- [`worksheet.md`](worksheet.md): counts by `closerRelation` and published label, per pull request
  and in total. The lines are in [`worksheet.jsonl`](worksheet.jsonl).

All 55 rows, on 34 pull requests, were read; 54 completely. By `closerRelation`: 49 `this_pr`
(row 2), 5 `no_closer` (row 8) and 1 `incomplete` (row 6). No row is `commit_of_this_pr`,
`pr_open`, `open_after_non_default_base`, `event_unsettled`, `pr_closed_unmerged`, `still_open`,
`other_pr` or `other_commit`, so the rebase-merge limit below touches no line. The incomplete row,
dbeaver/dbeaver#41333:0, names dbeaver/pro#8871, a repository the read-only token cannot read; it
carries no published label and needs no ruling. One `no_closer` row carries no published label
either. That leaves the 22 lines below.

## The rule for a ruling

The rule is section 7.4's, so a ruling never says more than checker 0.1.7 would. Each worksheet
line's `section74` gives its row.

- **Row 8** (`fail`, `not_closing`): the record shows the pull request did not close its target. A
  genuine catch (`false_claim`) unless the claim is not a claim (`not_a_claim`).
- **Rows 2 and 3** (`pass`): the pull request closed its target. Not a genuine catch.
- **Rows 4 to 7** (`unverifiable`): the record does not settle the claim, and no ruling settles it
  in advance. Each is ruled on its own, with its reason given in the erratum: a row 5 target may yet
  be closed by a later merge into the default branch; a row 6 line was not read in full; a row 7
  target's close is not yet recorded.

Known limit: row 3 for a rebase merge is not observed (spec 0.1.4 section 17). A rebase merge puts
new commits on the default branch, so a target one of them closed reads as `other_commit` (row 8).
Before ruling an `other_commit` line a genuine catch, the operator checks how its pull request was
merged.

## Rulings

One line per advisory with a published M2 label. Each ruling is the `ruling` of its line in
`worksheet.jsonl`, one of `false_claim`, `claim_holds` or `not_a_claim`.

| advisory | published label | closerRelation (7.4 row) | ruling |
|---|---|---|---|
| electron/forge#4295:0 | false_claim | `no_closer` (8) | false_claim |
| replicate/cog#3063:1 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:2 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:3 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:4 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:5 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:6 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:7 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:8 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:9 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:10 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:11 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:12 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:13 | false_claim | `no_closer` (8) | false_claim |
| replicate/cog#3063:14 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:15 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:16 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:17 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:18 | false_claim | `this_pr` (2) | claim_holds |
| replicate/cog#3063:19 | false_claim | `this_pr` (2) | claim_holds |
| CarlosNZ/json-edit-react#373:0 | not_a_claim | `no_closer` (8) | not_a_claim |
| polarsource/polar#13918:0 | false_claim | `no_closer` (8) | false_claim |

The reasons, by the rule above:

- **replicate/cog#3063:1 to :12 and :14 to :19 (18 lines): `claim_holds`.** Each target's
  ClosedEvent names replicate/cog#3063 as its closer (row 2): the pull request closed what it said it
  closes. The targets are pull requests, which is why none is in `closingIssuesReferences` (blind
  spot 1). Published as `false_claim`; under the rule they are not genuine catches.
- **replicate/cog#3063:13 → #2986: `false_claim`.** The target, a pull request, was closed by
  dependabot at 2026-06-25T17:10:39Z with no closer, before #3063 merged.
- **electron/forge#4295:0 → #4104: `false_claim`.** The pull request merged into a base that is not
  the default branch, so its closing keyword could not act; MarshallOfSound closed the issue by hand
  on 2026-07-01, with no closer.
- **polarsource/polar#13918:0 → #405: `false_claim`.** The target is a pull request merged on
  2023-05-14, years before this one; its ClosedEvent has no closer.
- **CarlosNZ/json-edit-react#373:0 → #122: `not_a_claim`.** The ClosedEvent has no closer (the
  issue was closed by hand on 2025-03-21, and the pull request's base is not the default branch).
  The published label is `not_a_claim`: the reference is not a claim that the pull request closes
  the issue. The rule leaves that exception to the operator, and the ruling keeps it. The advisory
  has no M1 label, so `figures.mjs`'s M1 cross-check does not bear on it.

18 of the 22 rulings change the published label, all from `false_claim` to `claim_holds`, all on
replicate/cog#3063.

## Figures

As `tools/figures.mjs` printed them, with all 22 rulings in; (i) reproduced `figures/figures.json`
byte for byte. The figures are in
[`figures.json`](figures.json). Each cell is the share, k/n and its Wilson 95% interval.

| measure | published | published, without replicate/cog#3063 | ruled | ruled, without replicate/cog#3063 |
|---|---|---|---|---|
| M1 | 0.96667 (58/60, 0.88636–0.99081) | 0.96078 (49/51, 0.86784–0.98918) | 0.96667 (58/60, 0.88636–0.99081) | 0.96078 (49/51, 0.86784–0.98918) |
| baseline M2 false_claim | 0.70968 (22/31, 0.53408–0.83904) | 0.27273 (3/11, 0.09746–0.56565) | 0.12903 (4/31, 0.05134–0.28852) | 0.27273 (3/11, 0.09746–0.56565) |
| baseline M3 | 0.09474 (9/95, 0.05064–0.17033) | 0.10667 (8/75, 0.05505–0.19661) | 0.28421 (27/95, 0.20328–0.38191) | 0.10667 (8/75, 0.05505–0.19661) |
| candidate M2 false_claim | 0.78571 (22/28, 0.60461–0.89788) | 0.375 (3/8, 0.13684–0.69426) | 0.14286 (4/28, 0.05699–0.3149) | 0.375 (3/8, 0.13684–0.69426) |
| candidate M3 | 0.06522 (6/92, 0.03023–0.13506) | 0.06944 (5/72, 0.03003–0.15248) | 0.26087 (24/92, 0.18202–0.35889) | 0.06944 (5/72, 0.03003–0.15248) |
| LOST | 0 (0/22, 0–0.14865) | 0 (0/3, 0–0.5615) | 0 (0/4, 0–0.48989) | 0 (0/3, 0–0.5615) |

`figures.json` also holds, for both label sets, each measure's minimum and maximum over leaving out
each pull request in turn, and the share of each instrument's genuine catches the single largest
pull request contributes.

## What the rulings change

**The "mismatch" bar is still not met, and now by a wide margin.** Study 2's result reads condition
2 as "just under 0.80" (0.786); that near miss came from the 18 lines above. Ruled, the candidate's
`false_claim` share among its `differs` advisories is 0.143 (4/28). Condition 1 fails further: the
candidate's M3 is 24/92 = 0.261, upper bound 0.359 (published 0.135). Condition 3 still holds:
LOST is 0, now of the baseline's 4 `false_claim` advisories rather than 22.

**M3 roughly triples for both instruments.** The baseline's false accusations go from 9 to 27 of 95
checkable advisories (0.095 to 0.284) and the candidate's from 6 to 24 of 92 (0.065 to 0.261). Every
added false accusation is a `closes` claim on replicate/cog#3063 that both instruments note
`differs:not_closing` while the pull request did close its target.

**The refutation tests fall as published.** Test 1: 6 of 28 `not_a_claim`, not refuted. Test 2: 4
of 7, refuted. Test 3: not decidable. Test 4: the candidate makes 24 false accusations against the
baseline's 27, not refuted.

**The genuine catches that remain are four:** three of the rulings above (cog#3063:13,
electron/forge#4295:0 and polarsource/polar#13918:0) and am-will/gooey-pi#166:0, which is not a
`closes` advisory and is outside this erratum's scope.
Without replicate/cog#3063 nothing changes, since all 18 changed labels are on it; the published
sensitivity column already showed the `false_claim` shares resting on that one pull request.

**Both instruments carry the blind spot**, so the comparison between them is barely moved; what moves
is each instrument's absolute precision on `closes` claims. Checker 0.1.7 (spec 0.1.4 section 7.4)
settles these 18 as `pass`.

## What does not change

The preregistration, both instruments, both seals, `selection.json` and every published label file
stand as they are. The published figures stand as published: `figures.mjs` recomputes them from the
published labels and refuses to go on unless they are `figures/figures.json` byte for byte. The
erratum adds a ruled label set beside the published one, in `worksheet.jsonl`, and never edits the
published one.

## Signing

Signed by the commit that adds the rulings and the filled figures, as study 2's other steps are.

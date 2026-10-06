// The advisory extractor on synthetic sentences only. The negative tests are grouped by the
// false-positive classes of the token-scraping predecessor; none is copied from a real report.

import { describe, expect, it } from 'vitest';
import { extractClaims, repoPath } from './extract.js';

const claims = (text: string) => extractClaims(text).map(({ kind, value }) => ({ kind, value }));
const kinds = (text: string) => extractClaims(text).map((c) => c.kind);

describe('asserting forms', () => {
  it.each([
    ['I changed src/check/checks.ts to read the new field.', 'src/check/checks.ts'],
    ['Added src/advisory/extract.ts.', 'src/advisory/extract.ts'],
    ['This updates docs/advisory.md with the verb list.', 'docs/advisory.md'],
    ['I have modified `src/cli/main.ts`.', 'src/cli/main.ts'],
    ['Removed the dead branch from src/record/build.ts', 'src/record/build.ts'],
    ['src/spec/schema.ts was updated for the draft.', 'src/spec/schema.ts'],
    ['Renamed src/a.ts and moved it under lib/', 'src/a.ts'],
    ['Added a regression test for the parser in src/parse.test.ts.', 'src/parse.test.ts'],
    ['Updated package.json and the lockfile.', 'package.json'],
    ['Touched `Makefile` only.', 'Makefile'],
    ['Created .github/workflows/ci.yml.', '.github/workflows/ci.yml'],
    ['Deleted the stale __snapshots__/a.test.ts.snap.', '__snapshots__/a.test.ts.snap'],
    ['Updated the version from 1.2.3 to 1.3.0 in package.json.', 'package.json'],
  ])('a file change: %s', (text, path) => {
    expect(claims(text)).toEqual([{ kind: 'file_changed', value: path }]);
  });

  it('binds every path of a list to its verb, and both paths of a move', () => {
    expect(claims('I updated src/a.ts, src/b.ts and src/c.ts.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
      { kind: 'file_changed', value: 'src/b.ts' },
      { kind: 'file_changed', value: 'src/c.ts' },
    ]);
    expect(claims('Moved src/old.ts to src/new.ts.')).toEqual([
      { kind: 'file_changed', value: 'src/old.ts' },
      { kind: 'file_changed', value: 'src/new.ts' },
    ]);
  });

  it.each([
    ['Closes #12', '#12'],
    ['This PR fixes #7.', '#7'],
    ['Resolves example-org/example-repo#31', 'example-org/example-repo#31'],
    ['Fixes: #44', '#44'],
    ['Fixes issue #5', '#5'],
    ['Closes https://github.com/example-org/example-repo/issues/9', 'example-org/example-repo#9'],
  ])('a closing reference: %s', (text, ref) => {
    expect(claims(text)).toEqual([{ kind: 'reference_closes', value: ref }]);
  });

  it('binds each issue of a closing list', () => {
    expect(claims('Closes #12, #13 and #14.').map((c) => c.value)).toEqual(['#12', '#13', '#14']);
  });

  it.each([
    ['Pushed 3f2a1b9c to the branch.', 'commit', '3f2a1b9c'],
    ['I committed the fix as 0a1b2c3d4e5f.', 'commit', '0a1b2c3d4e5f'],
    ['Fixed the bound in commit 9e8d7c6.', 'commit', '9e8d7c6'],
    ['The head is now 5c4b3a2f1e0d.', 'head_commit', '5c4b3a2f1e0d'],
    ['HEAD at ABC1234F', 'head_commit', 'abc1234f'],
  ])('a commit: %s', (text, kind, value) => {
    expect(claims(text)).toEqual([{ kind, value }]);
  });

  it.each([
    ['CI is green.', true],
    ['All checks pass.', true],
    ['The checks passed.', true],
    ['All required checks succeeded', true],
    ['CI failed on the first push', false],
    ['CI is not green yet.', false],
    ['This passes CI.', true],
    ['The check runs are green.', true],
  ])('all checks: %s', (text, value) => {
    expect(claims(text)).toEqual([{ kind: 'checks_succeeded', value }]);
  });

  it('a count of checks, with the claim that they pass', () => {
    expect(claims('All 5 checks passed.')).toEqual([
      { kind: 'checks_succeeded', value: true },
      { kind: 'check_count', value: 5 },
    ]);
  });

  it.each([
    ['Tests pass.', [{ kind: 'tests_passed', value: true }]],
    ['The test suite passes locally.', [{ kind: 'tests_passed', value: true }]],
    ["The unit tests don't pass yet.", [{ kind: 'tests_passed', value: false }]],
    [
      'All 42 tests pass.',
      [
        { kind: 'tests_passed', value: true },
        { kind: 'test_count', value: 42 },
      ],
    ],
    ['Ran 17 tests.', [{ kind: 'test_count', value: 17 }]],
    ['I ran all 8 tests', [{ kind: 'test_count', value: 8 }]],
  ])('tests: %s', (text, expected) => {
    expect(claims(text)).toEqual(expected);
  });

  it('merged at a timestamp', () => {
    expect(claims('It was merged at 2026-10-01T12:00:00Z.')).toEqual([
      { kind: 'merged_at', value: '2026-10-01T12:00:00Z' },
    ]);
    expect(claims('Merged into main on 2026-10-01T12:00:00.250Z')).toEqual([
      { kind: 'merged_at', value: '2026-10-01T12:00:00.250Z' },
    ]);
  });

  it('records the clause, the verb and the span of the token', () => {
    const text = 'Summary.\n\nI changed src/a.ts; tests pass.';
    const [file, tests] = extractClaims(text);
    expect(file).toEqual({
      clause: 'I changed src/a.ts;',
      verb: 'changed',
      kind: 'file_changed',
      value: 'src/a.ts',
      span: { start: text.indexOf('src/a.ts'), end: text.indexOf('src/a.ts') + 8 },
    });
    expect(text.slice(file?.span.start, file?.span.end)).toBe('src/a.ts');
    expect(tests).toMatchObject({ clause: 'tests pass.', verb: 'pass', kind: 'tests_passed' });
  });

  it('proposes each claim once, at its first clause', () => {
    const found = extractClaims('Updated src/a.ts. Later I updated src/a.ts again.');
    expect(found).toHaveLength(1);
    expect(found[0]?.clause).toBe('Updated src/a.ts.');
  });

  it('reads list items and soft-wrapped lines as clauses', () => {
    const text = [
      '## Changes',
      '',
      '- Added src/a.ts',
      '- Removed src/b.ts',
      '',
      'I also updated the guide in',
      'docs/guide.md for the new flag.',
    ].join('\n');
    expect(claims(text).map((c) => c.value)).toEqual(['src/a.ts', 'src/b.ts', 'docs/guide.md']);
  });
});

describe('not a claim: a token with no asserting verb', () => {
  it.each([
    'The config lives in src/config/defaults.ts.',
    'See src/check/checks.ts for the rule.',
    'src/a.ts and src/b.ts',
    'Files: src/a.ts, src/b.ts',
    'I will update src/a.ts next.',
    'We should change src/a.ts too.',
    'Need to update docs/guide.md.',
    'Update src/a.ts before merging.',
    'I did not change src/a.ts.',
    'I never touched src/b.ts.',
    'If I updated src/a.ts, tests would pass.',
    'Changes to src/a.ts are out of scope.',
    'Updated the docs to point at src/new.ts.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('a negation between a verb and a later path breaks the binding', () => {
    expect(claims('I added src/a.ts and did not touch src/b.ts.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
  });

  it.each([
    'Tests should pass after the rebase.',
    'CI will be green once this lands.',
    'If CI is green, merge it.',
    'Waiting for the checks to pass.',
    'The lint checks pass.',
    'The test passes.',
    'All checks are passing except lint.',
    'This passes all checks other than the docs build.',
    'Tests pass? Not sure.',
    'Do all tests pass? Yes.',
    'Did I change src/a.ts?',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });
});

describe('false-positive class: paths cited as places, commands, packages and log prefixes', () => {
  it.each([
    // places
    'The output is written to dist/report.json.',
    'Ran the suite from packages/core/src/index.test.ts.',
    'Logs are kept under /var/log/agent/run.log.',
    'Updated the cache in ~/projects/cache.json',
    'I updated the entries under src/check/.',
    'Deployed the preview to example.com.',
    'Updated the page at example.com/docs/index.html.',
    // commands
    'I ran pnpm exec vitest run src/check/checks.test.ts.',
    'Updated the fixtures with node scripts/build.mjs.',
    'Changed it by running `node scripts/build.mjs --check`.',
    'Updated the lockfile with pnpm install --config tsconfig.json.',
    // packages
    'Updated @types/node to the latest minor.',
    'Added zod/v4 to the dependencies.',
    'Bumped react-dom/client in the app.',
    'Upgraded Node.js and updated Vue.js.',
    // log prefixes
    'FAIL src/check/checks.test.ts > head > mismatch',
    'ERROR: src/a.ts updated without a test',
    '[vitest] updated src/a.ts snapshot',
    '2026-10-01T12:00:00Z changed src/a.ts',
    'error TS2322: src/a.ts(12,5) changed type',
    '$ git mv src/a.ts src/b.ts',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('reads nothing in a fenced block, a quoted line or an HTML comment', () => {
    const text = [
      'Summary below.',
      '',
      '```',
      'Updated src/a.ts',
      'Closes #12',
      '```',
      '',
      '> I changed src/b.ts and all checks pass.',
      '',
      '<!-- Added src/c.ts. Fixes #13. -->',
      '',
      '~~~text',
      'CI is green',
      '~~~',
    ].join('\n');
    expect(claims(text)).toEqual([]);
  });

  it('reads nothing in the handback block itself', () => {
    const text =
      'Done.\n\n```dunstan-handback\n{"dunstan":"0.1","headCommit":"' +
      'a'.repeat(40) +
      '","filesChanged":["src/a.ts"]}\n```\n';
    expect(claims(text)).toEqual([]);
  });

  it('reads inline code and a URL only where a clause asserts them', () => {
    expect(claims('The fix is in `src/a.ts`.')).toEqual([]);
    expect(claims('I edited `src/a.ts`.')).toEqual([{ kind: 'file_changed', value: 'src/a.ts' }]);
    expect(claims('Run `pnpm test` to check; I changed `pnpm test --run`.')).toEqual([]);
    expect(claims('Background: https://github.com/example-org/example-repo/issues/9')).toEqual([]);
    expect(claims('Updated https://example.com/src/a.ts')).toEqual([]);
  });
});

describe('false-positive class: adjectives and stray slashes', () => {
  it.each([
    'See the updated docs/guide.md for details.',
    'The changed files are listed in the summary.',
    'The added test in src/a.test.ts is flaky.',
    'This fixed-size buffer in src/buffer.ts stays.',
    'Removed read/write access and the and/or branch.',
    'Changed the input/output handling of CI/CD and TCP/IP.',
    'Updated the pass/fail table, 50/50 split, w/o retries.',
    'Changed the copy / added a note // and a slash /',
    'Fixed the typo, e.g. in the intro, i.e. the title.',
    'Renamed v1.2.3 to v1.2.4.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('the failing tests and the passing checks are not predicates', () => {
    expect(claims('Fixed the failing tests in the parser.')).toEqual([]);
    expect(claims('Counted the passing checks.')).toEqual([]);
  });
});

// Extractor 0.1.0 proposed a claim for every sentence in each negative case here (checked when
// these sentences were written), so none passes for want of a token.
describe('not a claim: a path in an aside or an analogue (extractor 0.1.1)', () => {
  it('a path named as a model, inside an aside, after an analogue', () => {
    expect(claims('Rewrote the timetable (laid out like `ports/winter.md`).')).toEqual([]);
  });

  it.each([
    ['(…)', 'Edited the ferry timetable (`ports/north.csv` gives the column order).'],
    ['(…), an analogue inside', 'Edited the timetable (like `ports/north.csv`).'],
    ['[…]', 'Amended the berth list [`ports/south.csv` for comparison].'],
    ['nested', 'Edited the ferry timetable (for the winter crossings [`ports/north.csv`]).'],
    [
      'nested, a verb outside the inner bracket',
      'Edited the timetable (also updated the fares [`fares.csv`]).',
    ],
    [
      'a bracket opened earlier in the clause',
      'Edited the timetable (for the winter, with `fares.csv`.',
    ],
  ])('a verb outside a bracket still open at the path: %s', (_, text) => {
    expect(claims(text)).toEqual([]);
  });

  it.each([
    ['analogous to', 'Added a fare rule analogous to `fares/summer.ts`.'],
    ['as in', 'Renamed the column as in `ports/north.csv`.'],
    ['based on', 'Added a timetable based on `ports/north.csv`.'],
    ['cf', 'Tweaked the fares, cf `fares/summer.ts`.'],
    ['compared to', 'Changed the departure times compared to `ports/south.csv`.'],
    ['compared with', 'Changed the departure times compared with `ports/south.csv`.'],
    ['like', 'Added a crossing like `ports/north.csv`.'],
    ['matching', 'Updated the berths matching `ports/south.csv`.'],
    ['mirroring', 'Adds a winter timetable mirroring `ports/north.csv`.'],
    ['modeled on', 'Created the fare table, modeled on `fares/summer.ts`.'],
    ['modelled on', 'Created the fare table, modelled on `fares/summer.ts`.'],
    ['same as', 'Changed the berth count, same as `ports/south.csv`.'],
    ['similar to', 'Added a night crossing similar to `ports/north.csv`.'],
    ['unlike', 'Added the fare, unlike `fares/summer.ts`.'],
  ])('an analogue between the verb and the path: %s', (_, text) => {
    expect(claims(text)).toEqual([]);
  });

  it('an analogue stops the paths after it, not the ones before it', () => {
    expect(claims('Updated `a.ts` and `b.ts`, like `c.ts` and `d.ts`.')).toEqual([
      { kind: 'file_changed', value: 'a.ts' },
      { kind: 'file_changed', value: 'b.ts' },
    ]);
  });

  it('a period ends the clause at "e.g." and "cf.", as in 0.1.0', () => {
    expect(claims('Updated the workflows, e.g. `ci.yml`.')).toEqual([]);
    expect(claims('Tweaked the fares, cf. `fares/summer.ts`.')).toEqual([]);
  });

  // The cost of the bracket rule: a writer who names the file in an aside is not read.
  it('a path in a parenthesis is not bound to a verb outside it, even where it was meant', () => {
    expect(claims('Added a regression test (src/parse.test.ts).')).toEqual([]);
  });
});

describe('still a claim beside the aside and analogue rules (extractor 0.1.1)', () => {
  it.each([
    ['Updated `a.ts` and `b.ts`.', ['a.ts', 'b.ts']],
    ['Changed the following files `src/a.ts` and `src/b.ts`.', ['src/a.ts', 'src/b.ts']],
    ['Adds `ports/north.csv` (modelled on the summer timetable).', ['ports/north.csv']],
    ['Added `a.ts` (also edited `b.ts`).', ['a.ts', 'b.ts']],
    ['Added the job [and updated `ci.yml`].', ['ci.yml']],
    ['Added two crossings (for the winter) to `ports/north.csv`.', ['ports/north.csv']],
    ['Updated [`src/a.ts`](src/a.ts) and [the guide](docs/guide.md).', ['src/a.ts']],
    ['Updated the workflows, such as `ci.yml` and `deploy.yml`.', ['ci.yml', 'deploy.yml']],
  ])('%s', (text, paths) => {
    expect(claims(text)).toEqual(paths.map((value) => ({ kind: 'file_changed', value })));
  });

  // "following" is not a barrier. The colon after it ends the clause, as every colon has since
  // 0.1.0, so the list after it has no verb; 0.1.1 does not change where clauses end.
  it('"the following files:" ends its clause at the colon', () => {
    expect(claims('Changed the following files: `src/a.ts`, `src/b.ts`.')).toEqual([]);
  });

  it('binds a SHA in a parenthesis as before: the rules are for paths', () => {
    expect(claims('Pushed the fix (3f2a1b9c).')).toEqual([{ kind: 'commit', value: '3f2a1b9c' }]);
    expect(claims('Pushed the fix, mirroring 3f2a1b9c.')).toEqual([
      { kind: 'commit', value: '3f2a1b9c' },
    ]);
  });
});

// Extractor 0.1.2. Each block below pins one attribution rule. The sentences are synthetic: written
// for the shape of each rule, none taken from a report. Extractor 0.1.1 proposed a claim for every sentence in each negative
// list here (checked when 0.1.2 was written), so none passes for want of a token.
describe('attribution class 1: another pull request or repository (0.1.2)', () => {
  it.each([
    'PR #10 was merged at 2026-09-01T12:00:00Z.',
    'PR #10 was merged (`2026-09-01T12:00:00Z`).',
    "PR #10's head is 3f2a1b9c.",
    'Kept the guard #11 added to src/guard.ts.',
    'example-org/other-repo#4 changed src/a.ts.',
    'Updated src/a.ts as discussed in #10.',
    'https://github.com/example-org/example-repo/pull/10 updated src/a.ts and was merged at 2026-09-01T12:00:00Z.',
    'Updated three files in the example-docs repo, among them docs/a.md.',
    'Updated src/retry.ts in another repository.',
    'PR #10 closes #12.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('a pronoun carries the other pull request into the next clause', () => {
    expect(claims('PR #10 was merged. Its head is 3f2a1b9c.')).toEqual([]);
    expect(claims('See #10. It changed src/a.ts and closes #12.')).toEqual([]);
  });

  it("still binds this pull request's own claims", () => {
    expect(claims('This PR (#25) closes #12 and updates src/a.ts.')).toEqual([
      { kind: 'reference_closes', value: '#12' },
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
    expect(claims('Closes #12, a follow-up to #10.')).toEqual([
      { kind: 'reference_closes', value: '#12' },
    ]);
    expect(claims('Fixes #12 by updating src/a.ts.')).toEqual([
      { kind: 'reference_closes', value: '#12' },
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
    expect(claims('Closes #12. It also updates src/a.ts.')).toEqual([
      { kind: 'reference_closes', value: '#12' },
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
    expect(claims('Updated README.md in this repo.')).toEqual([
      { kind: 'file_changed', value: 'README.md' },
    ]);
    expect(claims('See #10. I changed src/a.ts.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
    // An object pronoun does not carry the other pull request over.
    expect(claims('PR #10 broke the build. I fixed it in src/a.ts.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
  });
});

describe('attribution class 2: a change made for a while, undone or re-run (0.1.2)', () => {
  it.each([
    'Temporarily removed src/guard.ts and reran src/guard.test.ts.',
    'Added a throwaway marker to src/a.ts, ran the test (failed), reverted.',
    'Changed src/a.ts, then removed the change.',
    'Added a debug log to src/a.ts and later reverted it.',
    'Added the retry and reran `src/a.test.ts`.',
    'Fixed the flake and re-ran src/flaky.test.ts.',
    'Patched the flake and have rerun src/flaky.test.ts.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('a re-run elsewhere in the clause leaves a change before it bound', () => {
    expect(claims('Updated src/a.ts and reran the suite.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
  });
});

describe('attribution class 3: a baseline or an earlier head (0.1.2)', () => {
  it.each([
    'Verified against `origin/main` (HEAD `1a2b3c4d`).',
    'Compared with the prior head 1a2b3c4d.',
    'Prior CI evidence is for head 1a2b3c4d.',
    'The baseline head was 1a2b3c4d.',
    'Rebased onto upstream/main at head 1a2b3c4d.',
    'The previous head was 1a2b3c4d.',
  ])('%s', (text) => {
    expect(kinds(text)).not.toContain('head_commit');
  });

  it('still binds the head this pull request reports', () => {
    expect(claims('Rebased; the head is now 5c4b3a2f.')).toEqual([
      { kind: 'head_commit', value: '5c4b3a2f' },
    ]);
    expect(claims('The head is now 5c4b3a2f, rebased onto origin/main.')).toEqual([
      { kind: 'head_commit', value: '5c4b3a2f' },
    ]);
  });
});

describe('attribution class 4: a negation over a list (0.1.2)', () => {
  it.each([
    'None of `a.sh`, `b.sh` were touched.',
    'None of the files `a.sh`, `b.sh` were touched.',
    'Neither src/a.ts nor src/b.ts was changed.',
    'I touched none of src/a.ts, src/b.ts or src/c.ts.',
    'None of the tests fail.',
    'Not all checks pass.',
    'No tests failed.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('a negation covers its own list, not a clause beside it', () => {
    expect(claims('src/a.ts was updated, and src/b.ts was not touched.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
    expect(claims('Touched none of src/b.ts; updated src/a.ts.')).toEqual([
      { kind: 'file_changed', value: 'src/a.ts' },
    ]);
  });
});

describe('attribution class 5: a failure narrated on purpose (0.1.2)', () => {
  it.each([
    '5 of 5 new tests fail as expected before the fix.',
    'The new tests failed before the fix.',
    'The guard tests are red without the guard.',
    'The 3 mutation tests fail.',
    'The tests fail as intended with the guard removed.',
    'Ran 5 tests and all fail as intended.',
    'The checks failed on purpose to exercise the gate.',
    'The new tests fail without the fix and do not pass now.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('a pass after the failure, with a final state, is this pull request', () => {
    expect(claims('The new tests are red without the guard, green with it.')).toEqual([
      { kind: 'tests_passed', value: true },
    ]);
    expect(claims('The 4 new tests fail without the fix and pass with it.')).toEqual([
      { kind: 'tests_passed', value: true },
    ]);
  });

  it('a pass or a failure with no narration is read as before', () => {
    expect(claims('Tests pass.')).toEqual([{ kind: 'tests_passed', value: true }]);
    expect(claims('All 40 tests pass.')).toEqual([
      { kind: 'tests_passed', value: true },
      { kind: 'test_count', value: 40 },
    ]);
    expect(claims('Tests pass without retries.')).toEqual([{ kind: 'tests_passed', value: true }]);
    expect(claims('CI failed on the first push.')).toEqual([
      { kind: 'checks_succeeded', value: false },
    ]);
    expect(claims('The tests failed. Before the fix I had not run them.')).toEqual([
      { kind: 'tests_passed', value: false },
    ]);
  });
});

// The cost of the attribution rules (docs/advisory.md, "Attribution"): claims a writer meant for
// this pull request that 0.1.2 no longer reads.
describe('not read since 0.1.2, even where it was meant', () => {
  it.each([
    'Added src/a.ts for #12.',
    'Reverted src/a.ts to the released version.',
    'Rebased onto origin/main and the head is 5c4b3a2f.',
  ])('%s', (text) => {
    expect(claims(text)).toEqual([]);
  });

  it('a clause boundary before the baseline keeps the head', () => {
    expect(claims('Rebased onto origin/main; the head is 5c4b3a2f.')).toEqual([
      { kind: 'head_commit', value: '5c4b3a2f' },
    ]);
  });

  it('commit is not touched by the baseline rule', () => {
    expect(claims('Pushed 3f2a1b9c on top of the prior head.')).toEqual([
      { kind: 'commit', value: '3f2a1b9c' },
    ]);
  });
});

describe('still a claim beside the attribution rules (0.1.2)', () => {
  it('reads the claims of a plain report as 0.1.1 did', () => {
    const text = [
      'Closes #12.',
      '',
      '- Changed `src/a.ts` and `src/b.ts`.',
      '- It was merged at 2026-10-01T12:00:00Z.',
      '- The head is now 5c4b3a2f.',
      '- All 40 tests pass.',
      '- CI is green.',
    ].join('\n');
    expect(claims(text)).toEqual([
      { kind: 'reference_closes', value: '#12' },
      { kind: 'file_changed', value: 'src/a.ts' },
      { kind: 'file_changed', value: 'src/b.ts' },
      { kind: 'merged_at', value: '2026-10-01T12:00:00Z' },
      { kind: 'head_commit', value: '5c4b3a2f' },
      { kind: 'tests_passed', value: true },
      { kind: 'test_count', value: 40 },
      { kind: 'checks_succeeded', value: true },
    ]);
  });
});

describe('false-positive class: user ids and run ids read as SHAs', () => {
  it.each([
    'Pushed after workflow run 18234567890 finished.',
    'Pushed it; run id 7f3a9c21 retried twice.',
    'Committed on behalf of user 583231.',
    'Pushed for user id 4a5b6c7d.',
    'Pushed job 9a8b7c6d to the queue.',
    'Pushed build 1a2b3c4d5e.',
    'Pushed 1234567 commits.',
    'Pushed the deadbeef branch.',
    'Pushed the faceted search.',
    'The run 3f2a1b9c is green.',
  ])('%s', (text) => {
    expect(kinds(text).filter((k) => k === 'commit' || k === 'head_commit')).toEqual([]);
  });

  it('reads a hex word only beside a commit verb, the word commit or the head', () => {
    expect(claims('See commit 9e8d7c6 for the context.')).toEqual([]);
    expect(claims('Ticket 9e8d7c6a was triaged.')).toEqual([]);
  });
});

describe('false-positive class: #N where no closing reference is asserted', () => {
  it.each([
    'PR #12 is related.',
    'See #12 for the background.',
    'Step #3 failed once and passed on retry.',
    'Item #2 in the checklist is done.',
    'The #1 priority is the parser.',
    'Refs #12',
    'Fixes for #12 are planned.',
    'This closes the gap described in #12.',
    'Will close #12 in a follow-up.',
    'Did not fix #12.',
    'Merged #12 into this branch.',
  ])('%s', (text) => {
    expect(kinds(text)).not.toContain('reference_closes');
  });
});

describe('false-positive class: test counts compared with check-run counts', () => {
  it('a test count is a test count, never a count of checks', () => {
    expect(claims('All 42 tests pass.')).not.toContainEqual(
      expect.objectContaining({ kind: 'check_count' }),
    );
    expect(claims('All 42 tests pass.')).not.toContainEqual(
      expect.objectContaining({ kind: 'checks_succeeded' }),
    );
    expect(claims('Ran 42 tests across 3 jobs.')).toEqual([{ kind: 'test_count', value: 42 }]);
    expect(claims('42 passed, 0 failed in 3 checks')).toEqual([]);
  });
});

describe("the report's own boilerplate", () => {
  it('reads nothing in a cleanup note, branch names or shell lines', () => {
    const text = [
      'Cleanup after merge:',
      '- checkout: ../example-repo-fix-12',
      '- branch: fix/closes-12-update-src',
      '- remove: `git worktree remove ../example-repo-fix-12` once the PR merges',
      '$ git push -u origin fix/closes-12-update-src',
      'Done: PR #12, https://github.com/example-org/example-repo/pull/12',
    ].join('\n');
    expect(claims(text)).toEqual([]);
  });
});

describe('repoPath', () => {
  it.each([
    ['src/a.ts', 'src/a.ts'],
    ['./src/a.ts', 'src/a.ts'],
    ['src/a.ts:12:5', 'src/a.ts'],
    ['docs/Makefile', 'docs/Makefile'],
    ['package.json', 'package.json'],
    ['README.md', 'README.md'],
  ])('%s is a path', (token, path) => {
    expect(repoPath(token, false)).toBe(path);
  });

  it.each([
    'src/',
    '/etc/hosts',
    '~/a.ts',
    '../a.ts',
    'src//a.ts',
    '@types/node',
    'zod/v4',
    'and/or',
    'e.g',
    'Node.js',
    'example.com',
    'v1.2.3',
    'README',
    'a/b/c',
  ])('%s is not', (token) => {
    expect(repoPath(token, false)).toBeUndefined();
  });

  it('accepts a bare file name in inline code', () => {
    expect(repoPath('Node.js', true)).toBe('Node.js');
    expect(repoPath('Makefile', true)).toBe('Makefile');
  });
});

describe('determinism', () => {
  it('gives the same claims for the same text, every time', () => {
    const text = 'Closes #12. I changed src/a.ts and src/b.ts; all 3 checks pass. Pushed 3f2a1b9c.';
    const first = JSON.stringify(extractClaims(text));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(extractClaims(text))).toBe(first);
  });

  it('reads a long report in linear time', () => {
    const text = 'I changed src/a.ts and the docs. '.repeat(20000);
    const start = performance.now();
    expect(extractClaims(text)).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});

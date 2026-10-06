// The advisory extractor's written grammar (docs/advisory.md, spec/claim-format.md "DRAFT 0.2.0",
// D.11). Every word list and limit the extractor reads is in GRAMMAR, and the extractor's digest is
// the SHA-256 over GRAMMAR's JCS bytes, so a record names exactly the grammar that proposed its
// advisories. Changing any list changes the digest, and a published precision applies only to the
// digest it was measured on (precision.ts).

import { sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';

export const EXTRACTOR_VERSION = '0.1.2';

// The kinds of claim the extractor proposes, each compared by one 0.1 gate check (advise.ts).
export const ADVISORY_KINDS = [
  'file_changed',
  'reference_closes',
  'commit',
  'head_commit',
  'checks_succeeded',
  'check_count',
  'tests_passed',
  'test_count',
  'merged_at',
] as const;

export type AdvisoryKind = (typeof ADVISORY_KINDS)[number];

export const GRAMMAR = {
  version: EXTRACTOR_VERSION,
  kinds: ADVISORY_KINDS,
  // The most words a token may sit from its verb. Tokens of the same class between them (a list of
  // paths, "#12, #13 and #14") do not count.
  window: 8,
  verbs: {
    // Past, participle and third-person forms only: "update src/a.ts" is an instruction or a plan,
    // not a report.
    file: [
      'added',
      'adds',
      'adjusted',
      'adjusts',
      'amended',
      'amends',
      'changed',
      'changes',
      'created',
      'creates',
      'deleted',
      'deletes',
      'edited',
      'edits',
      'extended',
      'extends',
      'fixed',
      'fixes',
      'modified',
      'modifies',
      'moved',
      'moves',
      'patched',
      'patches',
      'refactored',
      'refactors',
      'removed',
      'removes',
      'renamed',
      'renames',
      'replaced',
      'replaces',
      'reworked',
      'reworks',
      'rewrites',
      'rewritten',
      'rewrote',
      'touched',
      'touches',
      'tweaked',
      'tweaks',
      'updated',
      'updates',
    ],
    // GitHub's closing keywords, base form included: "Close #12" closes an issue.
    close: [
      'close',
      'closed',
      'closes',
      'fix',
      'fixed',
      'fixes',
      'resolve',
      'resolved',
      'resolves',
    ],
    commit: ['cherry-picked', 'committed', 'landed', 'pushed'],
    merged: ['merged'],
    ran: ['executed', 'ran'],
    // Predicates that follow a subject: "tests pass", "CI is green".
    pass: ['green', 'pass', 'passed', 'passes', 'passing', 'succeed', 'succeeded', 'succeeds'],
    fail: ['fail', 'failed', 'failing', 'fails', 'red'],
    // Verbs that assert nothing about the record. They count for proximity, so "ran the suite in
    // packages/core/a.test.ts" binds the path to "ran", which is not a file verb.
    // Words that are as often nouns ("the build", "a run", "the use of") are left out.
    other: [
      'built',
      'cited',
      'compiled',
      'contain',
      'contains',
      'described',
      'describes',
      'exist',
      'exists',
      'expect',
      'expected',
      'explained',
      'explains',
      'found',
      'generated',
      'generates',
      'ignored',
      'imported',
      'included',
      'includes',
      'inspected',
      'install',
      'installed',
      'kept',
      'left',
      'lives',
      'located',
      'logged',
      'looked',
      'mentioned',
      'mentions',
      'opened',
      'pointed',
      'printed',
      'prints',
      're-ran',
      're-run',
      'read',
      'referenced',
      'requires',
      'reran',
      'rerun',
      'returned',
      'returns',
      'reviewed',
      'said',
      'saw',
      'says',
      'see',
      'seen',
      'showed',
      'shown',
      'shows',
      'skipped',
      'stored',
      'tested',
      'used',
      'viewed',
      'wrote',
      'written',
    ],
  },
  // Before a verb, within three words: the verb reports a plan, a wish or an instruction.
  modals: [
    'can',
    'could',
    'expect',
    'going',
    'hope',
    'intend',
    'may',
    'might',
    'must',
    'need',
    'needs',
    'plan',
    'please',
    'shall',
    'should',
    'todo',
    'try',
    'trying',
    'want',
    'wants',
    'will',
    'would',
  ],
  // A word ending in n't is a negation too.
  negations: ['neither', 'never', 'no', 'none', 'nor', 'not', 'without'],
  // Directly before a verb form, these make it an adjective: "the updated docs/guide.md".
  determiners: [
    'a',
    'an',
    'any',
    'each',
    'every',
    'her',
    'his',
    'its',
    'my',
    'our',
    'some',
    'that',
    'the',
    'their',
    'these',
    'this',
    'those',
    'your',
  ],
  // ...except these before a third-person form, where they are its subject: "This updates
  // docs/guide.md", "This passes CI".
  subjectDeterminers: ['that', 'this'],
  // Words that open a new clause. A clause opened by a conditional asserts nothing.
  subordinators: [
    'after',
    'although',
    'because',
    'before',
    'but',
    'if',
    'once',
    'since',
    'that',
    'though',
    'unless',
    'until',
    'when',
    'whenever',
    'where',
    'whereas',
    'which',
    'while',
    'who',
  ],
  conditionals: ['if', 'once', 'unless', 'until', 'when', 'whenever'],
  // A third-person verb that opens its clause and is followed by one of these is a noun: "Changes
  // to src/a.ts are out of scope".
  nounPrepositions: ['across', 'for', 'from', 'in', 'of', 'on', 'to', 'under', 'within'],
  // Between a closing keyword and its issue only these may stand: "fixes issue #12".
  closeFillers: ['&', 'and', 'bug', 'bugs', 'issue', 'issues', 'ticket', 'tickets'],
  // Between "merged" and its timestamp.
  mergedFillers: ['as', 'at', 'been', 'into', 'main', 'master', 'of', 'on', 'the', 'was'],
  // Between a subject (CI, checks, tests) and its predicate.
  predicateFillers: [
    'again',
    'all',
    'also',
    'are',
    'been',
    'both',
    'did',
    'do',
    'does',
    'has',
    'have',
    'is',
    'locally',
    'never',
    'no',
    'not',
    'now',
    'still',
    'turned',
    'was',
    'went',
    'were',
  ],
  // Between a path and its participle, at least one: "src/a.ts was updated".
  passiveFillers: ['also', 'are', 'been', 'both', 'has', 'have', 'is', 'now', 'was', 'were'],
  // Between "passed" and its object: "passed all required checks".
  objectFillers: ['all', 'required', 'the'],
  // Between "ran" and its count: "ran all 42 tests".
  countFillers: ['all', 'the'],
  // Within two words after a predicate, these narrow "all": "all checks pass except lint".
  exceptions: ['apart', 'besides', 'except', 'excluding', 'other', 'save'],
  // Between "head" and a SHA: "head is now 3f2a1b9c".
  headFillers: ['at', 'commit', 'is', 'now', 'sha', 'was'],
  // Between a file verb and a path, one of these makes the path a model or a comparison, not the
  // verb's object: "added a timetable based on ports/north.csv". Exemplifiers ("such as") and
  // "following" are left out: what they introduce is usually the object itself.
  analogues: [
    'analogous to',
    'as in',
    'based on',
    'cf',
    'compared to',
    'compared with',
    'like',
    'matching',
    'mirroring',
    'modeled on',
    'modelled on',
    'same as',
    'similar to',
    'unlike',
  ],
  // Bracket pairs. A path inside a pair still open at the path binds only to a verb inside it:
  // "edited the timetable (like ports/north.csv)". A markdown link's [text] is not an aside.
  brackets: ['()', '[]'],
  // Attribution (extractor 0.1.2). A claim is about this pull request's final state, not about
  // another pull request or repository, a change made and undone, a baseline, or a failure staged on
  // purpose.
  //
  // An issue or pull request (`#N`, `owner/repo#N`, a GitHub URL) in a clause that no closing
  // keyword binds makes the clause about it: "PR #10 was merged at …", "the file #11 added". One
  // directly after one of these phrases is this pull request: "This PR (#25) changes src/a.ts".
  selfNames: ['this change', 'this pr', 'this pull request'],
  // So does a repository named by one of these nouns, unless one of `ownRepository` stands directly
  // before it: "in the docs repo", "in another repository", but not "in this repo".
  repositoryNouns: ['repo', 'repos', 'repositories', 'repository'],
  ownRepository: ['our', 'same', 'the', 'this'],
  // After a clause that is about another pull request or repository, a clause that opens with one
  // of `pronouns`, or holds one of `possessives`, is about it too: "PR #10 was merged. Its head is
  // 3f2a1b9c." An object pronoun is not enough: "I fixed it in src/a.ts".
  pronouns: ['it', 'they'],
  possessives: ['its', 'their'],
  // A clause holding one of these narrates a change made and then undone, or made only for a while,
  // and proposes nothing: "temporarily removed src/a.ts", "added a throwaway marker, then reverted".
  transients: [
    'backed out',
    'reverted',
    'reverting',
    'temporarily',
    'then deleted',
    'then removed',
    'throw-away',
    'throwaway',
    'undid',
    'undone',
  ],
  // Before a SHA in its clause, one of these makes it a baseline or an earlier head, never
  // `head_commit`: "verified against origin/main (HEAD 3f2a1b9c)", "the prior head 3f2a1b9c". So
  // does a word starting with one of `remotePrefixes`.
  baselines: ['base', 'baseline', 'earlier', 'former', 'old', 'original', 'previous', 'prior'],
  remotePrefixes: ['origin/', 'upstream/'],
  // A clause with a fail predicate and one of these narrates a failure staged on purpose ("the new
  // tests fail as expected", "red without the guard", "the mutation tests fail"), and so does one
  // followed by a clause that opens with one of `narrationOpeners` ("the new tests failed before the
  // fix"). Such a clause proposes no tests or checks claim, except a pass predicate after the
  // failure followed directly by one of `finalStates`: "red without the guard, green with it".
  narrations: [
    'as expected',
    'as intended',
    'deliberately',
    'intentionally',
    'mutant',
    'mutants',
    'mutation',
    'mutations',
    'on purpose',
    'without',
  ],
  narrationOpeners: ['before'],
  finalStates: ['now', 'with it', 'with the change', 'with the fix', 'with this change'],
  // A word before a path that makes the path a command argument: "ran node scripts/build.mjs".
  // A word starting with '-' (a flag) does the same.
  commandWords: [
    'bash',
    'biome',
    'bun',
    'cargo',
    'cat',
    'cd',
    'chmod',
    'cp',
    'curl',
    'deno',
    'docker',
    'gh',
    'git',
    'go',
    'grep',
    'jest',
    'kubectl',
    'ls',
    'make',
    'mkdir',
    'mv',
    'node',
    'npm',
    'npx',
    'pnpm',
    'pytest',
    'python',
    'python3',
    'rm',
    'ruby',
    'sh',
    'touch',
    'tsc',
    'tsx',
    'vitest',
    'yarn',
  ],
  // Within two words before a hex token, these make it an id, not a commit: "run 7f3a9c21".
  shaBlockers: [
    'account',
    'attempt',
    'build',
    'id',
    'ids',
    'issue',
    'job',
    'jobs',
    'key',
    'node',
    'org',
    'pr',
    'run',
    'runs',
    'step',
    'token',
    'uid',
    'user',
    'users',
    'uuid',
    'workflow',
  ],
  // Directly before a SHA, these let any asserting verb bind it: "fixed it in commit 3f2a1b9".
  commitNouns: ['commit', 'commits', 'sha'],
  // Subjects. "checks" names all checks only when nothing but these stands before it: "the lint
  // checks pass" is a claim about some checks.
  checksNouns: ['checks', 'ci'],
  checksQualifiers: ['all', 'and', 'ci', 'required', 'status', 'the'],
  testsNouns: ['specs', 'suite', 'tests'],
  // Path names with no extension that are still files. Bare (no '/'), one counts only in inline
  // code: "the README" usually means README.md.
  extensionlessFiles: [
    'CODEOWNERS',
    'Dockerfile',
    'Gemfile',
    'Justfile',
    'LICENSE',
    'Makefile',
    'NOTICE',
    'Procfile',
    'Rakefile',
  ],
  // A bare name (no '/') with one of these extensions is a host name, a place, never a file.
  hostExtensions: ['ai', 'app', 'co', 'com', 'dev', 'io', 'net', 'org'],
  // A line that starts with one of these is a log line and is not read.
  logLevels: [
    'DEBUG',
    'ERR',
    'ERR!',
    'ERROR',
    'FAIL',
    'FATAL',
    'INFO',
    'OK',
    'PASS',
    'SKIP',
    'TRACE',
    'WARN',
    'WARNING',
  ],
} as const;

export interface ExtractorIdentity {
  version: string;
  digest: { sha256: string };
}

export const EXTRACTOR: ExtractorIdentity = {
  version: EXTRACTOR_VERSION,
  digest: { sha256: sha256Canonical(GRAMMAR as unknown as JsonValue) },
};

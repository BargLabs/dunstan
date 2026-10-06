import { it } from 'vitest';
import { extractClaims } from './extract.js';

const probes = [
  'Summary: I refactored the retry loop in src/storage/retry.ts and added tests in src/storage/retry.test.ts.',
  'The fix landed in 3f2a1b9c and CI went green.',
  'No files outside src/ were touched.',
  'Updated the version from 1.2.3 to 1.3.0 in package.json.',
  'Changed `const x = 1` to `const x = 2` in src/a.ts.',
  'I removed the TODO: update src/a.ts later.',
  'TODO: update src/a.ts',
  'Updated it. src/b.ts is unchanged.',
  'The tests passed, but the lint check failed.',
  'All checks are passing except lint.',
  'Fixed a bug where src/a.ts was read twice.',
  'Changes: added src/a.ts.',
  'Added support for the --dry-run flag to scripts/run.sh',
  'Resolved merge conflicts in src/a.ts and pushed.',
  'Rebased onto main; the head is a11ce5e.',
  'Thanks! Closes #12 and #13, refs #14.',
  'Tests: 42 passed, 0 failed.',
  'Closed #12 by mistake and reopened it.',
  'I fixed #12, which also closes #13.',
  'This PR does not close #12.',
  'Updated the PR description. Next steps: update docs/a.md.',
  'Merged main into this branch at 2026-10-01T12:00:00Z.',
  'Deleted the stale snapshot __snapshots__/a.test.ts.snap.',
  'Created .github/workflows/ci.yml.',
  'Edited the .env.example file.',
  'Updated src/a.ts:42 to handle null.',
  'I have not yet updated docs/a.md, but I changed src/a.ts.',
  'Tests pass? Not sure.',
  'Do all tests pass? Yes.',
  'If you see errors, CI is red.',
];

it('probe', () => {
  for (const p of probes) {
    const found = extractClaims(p).map((c) => `${c.kind}=${JSON.stringify(c.value)} [${c.verb}]`);
    console.log(`${p}\n   -> ${found.join(', ') || '(none)'}`);
  }
});

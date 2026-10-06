// Acceptance criterion (d): every fixture's claims, verdict and digests, one canonical line per case.
// CI runs this on ubuntu-latest and macos-latest with DUNSTAN_DETERMINISM_OUT set, and a final job
// compares the two files byte for byte.

import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { determinismLine, loadCases, runCase } from './fixtures.js';

const cases = [...loadCases('controls'), ...loadCases('planted')];

it('two runs on one machine write the same lines', () => {
  const first = cases.map((c) => determinismLine(c, runCase(c)));
  const second = cases.map((c) =>
    determinismLine(c, runCase({ ...c, evidence: structuredClone(c.evidence) })),
  );
  expect(second).toEqual(first);
});

const out = process.env.DUNSTAN_DETERMINISM_OUT;
if (out !== undefined && out !== '') {
  it('writes the determinism file', () => {
    const lines = cases.map((c) => determinismLine(c, runCase(c)));
    writeFileSync(out, `${lines.join('\n')}\n`);
  });
}

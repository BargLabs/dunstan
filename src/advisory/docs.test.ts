// docs/advisory.md states the grammar in prose and lists every word list. This keeps the lists there
// and the lists in grammar.ts the same, word for word, and the fixed lines and figures as the code
// states them.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPARISON_VERSION } from './advise.js';
import { EXTRACTOR, GRAMMAR } from './grammar.js';
import { differsAccuracyFor, precisionFor } from './precision.js';
import { ADVISORY_LINE, advisoryLine, noteText, RECORD_SHOWS } from './present.js';

const doc = readFileSync(new URL('../../docs/advisory.md', import.meta.url), 'utf8');
const lines = new Map(
  [...doc.matchAll(/^- `([A-Za-z.]+)`: (.+)$/gm)].map((m) => [m[1] as string, m[2] as string]),
);

const lists: [string, readonly string[]][] = [
  ...Object.entries(GRAMMAR.verbs).map(([k, v]): [string, readonly string[]] => [`verbs.${k}`, v]),
  ...Object.entries(GRAMMAR)
    .filter(([k, v]) => Array.isArray(v) && k !== 'kinds')
    .map(([k, v]): [string, readonly string[]] => [k, v as readonly string[]]),
];

describe('docs/advisory.md', () => {
  it.each(lists)('lists %s as the grammar does', (name, words) => {
    expect(lines.get(name)).toBe(words.join(', '));
  });

  it('lists nothing the grammar does not have', () => {
    expect([...lines.keys()].sort()).toEqual(lists.map(([name]) => name).sort());
  });

  it('states the window', () => {
    expect(doc).toContain(`after \`window\` (${GRAMMAR.window})`);
  });

  it('shows each differs note as the code does, and the fixed line', () => {
    const rows = [...doc.matchAll(/^\| `differs:([a-z_]+)` \| (.+) \|$/gm)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]);
    expect(rows).toEqual(
      Object.keys(RECORD_SHOWS).map((reason) => [reason, noteText(`differs:${reason}`)]),
    );
    expect(doc).toContain(`> ${ADVISORY_LINE}\n`);
  });

  it('states the fixed line with the published figures, and the figures and their binding', () => {
    // The figures were measured on extractor 0.1.1; the extractor that runs is 0.1.3.
    const measured = 'ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360';
    const precision = precisionFor(measured);
    const differsAccuracy = differsAccuracyFor(measured, COMPARISON_VERSION);
    expect(doc).toContain(`> ${advisoryLine({ precision, differsAccuracy })}\n`);
    expect(doc).toContain('## Measured figures');
    expect(doc).toContain(measured);
    for (const figure of ['[0.627, 0.905]', '[0, 0.161]', '[0, 0.080]', '(decided 2026-10-05)']) {
      expect(doc).toContain(figure);
    }
  });

  it('states extractor 0.1.2 on constructed reports apart, as never carried in a record', () => {
    const flat = doc.replace(/\s+/g, ' ');
    const heading = '### Extractor 0.1.2 on constructed reports (recall)';
    expect(doc).toContain(`\n${heading}\n`);
    const section = doc.slice(doc.indexOf(heading)).replace(/\s+/g, ' ');
    expect(section).toContain(
      'those figures come from real pull requests and are carried in records, while these come from constructed reports and are never carried in a record',
    );
    for (const row of [
      '| wrong file (`scope_mismatch`) | 98 | 98 |',
      '| wrong count (`wrong_count`) | 82 | 82 |',
      '| premature completion (`premature`) | 0 | 100 |',
      '| fabricated reference (`fabricated_reference`) | 0 | 100 |',
      '| **all planted** | **180** | **380**: recall 0.474, Wilson 95% [0.424, 0.524] |',
    ]) {
      expect(section).toContain(row);
    }
    expect(section).toContain('180 of the 215 `differs` notes fell on the planted claim: 0.837');
    expect(section).toContain('[0.782, 0.881]');
    expect(section).toContain('1 `differs` note across the 50 clean reports');
    expect(section).toContain('The preregistered bar was not met.');
    // For 0.1.3 the doc says only that no figures are published, never that none was measured.
    expect(section).toContain('No figures are published for extractor 0.1.3, which runs now.');
    expect(flat).not.toMatch(/0\.1\.3[^.]*(?:has not been measured|is unmeasured)/);
    // 0.1.2 is no longer "nothing published", and still has no real-PR precision.
    expect(flat).not.toContain('Nothing is published for either');
    expect(flat).toContain(
      'but no precision measured on real pull requests, so its records still carry `null` for both figures',
    );
  });

  it('states the token scraper figures as published, with their method and no source', () => {
    expect(doc).toContain('On 196 real pull requests it raised 4,647 flags');
    expect(doc).toContain('(0 of 30; Wilson 95% upper bound 0.114)');
    expect(doc).toContain('Method: the token checks ran over 196');
  });

  it('states the extractor that runs, its digest, and that it is unmeasured', () => {
    expect(precisionFor(EXTRACTOR.digest.sha256)).toBeNull();
    expect(doc.replace(/\s+/g, ' ')).toContain(
      `The extractor that runs since 2026-10-06 is ${EXTRACTOR.version}, digest \`${EXTRACTOR.digest.sha256}\``,
    );
    expect(doc).toContain('### Attribution (extractor 0.1.2)');
    expect(doc).toContain('### Lists, merge times and own references (extractor 0.1.3)');
  });

  // Each of these sections is one sentence pointing at the code, which holds the rules and tests.
  it('keeps only the neutral sentence under "Attribution" and "False-positive classes"', () => {
    const neutral = "The extractor's rules and their tests are in `src/advisory/`.";
    for (const heading of ['### Attribution (extractor 0.1.2)', '## False-positive classes']) {
      expect(doc).toContain(`${heading}\n\n${neutral}\n\n#`);
    }
  });
});

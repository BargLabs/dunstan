// docs/advisory.md states the grammar in prose and lists every word list. This keeps the lists there
// and the lists in grammar.ts the same, word for word, and the fixed lines and figures as the code
// states them.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPARISON_VERSION } from './advise.js';
import { EXTRACTOR, GRAMMAR } from './grammar.js';
import { differsAccuracyFor, precisionFor } from './precision.js';
import { ADVISORY_LINE, advisoryLine, noteText, RECORD_SHOWS } from './present.js';

// Extractor 0.1.3's grammar, the one the constructed-report figures below were measured on.
const EXTRACTOR_0_1_3 = '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37';

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
    // The figures were measured on extractor 0.1.1; the extractor that runs is 0.1.4.
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
    const next = '### Extractor 0.1.3 on constructed reports (recall)';
    const section = doc.slice(doc.indexOf(heading), doc.indexOf(next)).replace(/\s+/g, ' ');
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
    expect(flat).not.toMatch(/0\.1\.3[^.]*(?:has not been measured|is unmeasured)/);
    // 0.1.2 is no longer "nothing published", and still has no real-PR precision.
    expect(flat).not.toContain('Nothing is published for either');
    expect(flat).toContain(
      'but no precision measured on real pull requests, so its records still carry `null` for both figures',
    );
  });

  it('states extractor 0.1.3 on constructed reports apart, as never carried in a record', () => {
    const flat = doc.replace(/\s+/g, ' ');
    const heading = '### Extractor 0.1.3 on constructed reports (recall)';
    expect(doc).toContain(`\n${heading}\n`);
    // The 0.1.3 subsection follows the 0.1.2 one and ends at the next section.
    expect(doc.indexOf(heading)).toBeGreaterThan(
      doc.indexOf('### Extractor 0.1.2 on constructed reports (recall)'),
    );
    const start = doc.indexOf(heading);
    const raw = doc.slice(start, doc.indexOf('\n## ', start));
    const section = raw.replace(/\s+/g, ' ');
    expect(section).toContain(`digest \`${EXTRACTOR_0_1_3}\`, and comparison 0.2.0`);
    expect(section).toContain('on the same 430 constructed reports as the 0.1.2 subsection');
    expect(section).toContain(
      'these figures are never carried in a record: 0.1.3 has no precision measured on real pull requests, so a record extractor 0.1.3 writes carries `null` for both figures',
    );
    const rows = [...raw.matchAll(/^\| (.+) \| (.+) \| (.+) \|$/gm)].map((m) => m.slice(1));
    expect(rows).toEqual([
      ['Planted claim type', 'Flagged', 'n'],
      ['---', '---', '---'],
      ['wrong file (`scope_mismatch`)', '98', '98'],
      ['wrong count (`wrong_count`)', '82', '82'],
      ['fabricated reference (`fabricated_reference`)', '100', '100'],
      ['premature completion (`premature`)', '0', '100'],
      ['**all planted**', '**280**', '**380**: recall 0.737, Wilson 95% [0.690, 0.779]'],
    ]);
    expect(section).toContain(
      '280 of the 315 `differs` notes fell on the planted claim: 0.889, Wilson 95% [0.849, 0.919]',
    );
    expect(section).toContain('1 `differs` note across the 50 clean reports.');
    expect(section).toContain('The preregistered bar was met.');
    expect(section).toContain('Only the 100 `fabricated_reference` plants, from 0 flagged to 100.');
    expect(section).toContain('Every `premature` plant opens `Status as of <time>: …`');
    expect(section).toContain('**Method.** The same as for 0.1.2');
    // The sentences that said 0.1.3 had no published figures are replaced, and none claims a
    // record carries a 0.1.3 figure.
    expect(flat).not.toContain('No figures are published for extractor 0.1.3');
    expect(flat).not.toContain('0.1.3, which runs now, has no published figures');
    expect(flat).not.toContain('No figures are published for it');
    expect(flat).toContain(
      '0.1.2 and 0.1.3 each have figures from constructed reports only, which no record carries, and no precision measured on real pull requests, and 0.1.4, which runs now, has no figures at all',
    );
    expect(flat).toContain(
      'carries `null` for both figures, shown as "unmeasured", until a precision measured on real pull requests is published for 0.1.4',
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
      `The extractor that runs since 2026-10-07 is ${EXTRACTOR.version}, digest \`${EXTRACTOR.digest.sha256}\``,
    );
    expect(doc).toContain('### Attribution (extractor 0.1.2)');
    expect(doc).toContain('### Lists, merge times and own references (extractor 0.1.3)');
    expect(doc).toContain('### Labels, used names and descriptions (extractor 0.1.4)');
    const flat = doc.replace(/\s+/g, ' ');
    expect(flat).toContain(`Extractor 0.1.3, digest \`${EXTRACTOR_0_1_3}\`, ran from 2026-10-06.`);
    expect(flat).toContain('It is unmeasured: no figure of any kind is published for it.');
  });

  // Each of these sections is one sentence pointing at the code, which holds the rules and tests.
  it('keeps only the neutral sentence under "Attribution" and "False-positive classes"', () => {
    const neutral = "The extractor's rules and their tests are in `src/advisory/`.";
    for (const heading of ['### Attribution (extractor 0.1.2)', '## False-positive classes']) {
      expect(doc).toContain(`${heading}\n\n${neutral}\n\n#`);
    }
  });
});

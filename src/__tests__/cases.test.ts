// The cases folder (cases/README.md): real pull requests, each with the report checked and the
// records written. Each record recomputes offline and was written from the report beside it, and
// each claim the top-level README makes about a case agrees with that case's record. A README edit
// that states another verdict, or a record that no longer says what the README says, fails here.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DunstanRecord } from '../record/build.js';
import { verifyRecord } from '../record/verify.js';
import { extractHandbackBlock } from '../spec/extract.js';

const ROOT = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT));
const record = (path: string) => JSON.parse(read(path).toString('utf8')) as DunstanRecord;
// The README's text with its line breaks and runs of spaces as one space, so a sentence is found
// however it is wrapped.
const readme = read('README.md').toString('utf8').replace(/\s+/g, ' ');

const cases = readdirSync(new URL('cases/', ROOT), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe('cases/', () => {
  it('holds the cases cases/README.md lists', () => {
    const index = read('cases/README.md').toString('utf8');
    expect(cases.length).toBeGreaterThan(0);
    for (const name of cases) expect(index).toContain(`[\`${name}\`](${name}/)`);
  });

  for (const name of cases) {
    const records = readdirSync(new URL(`cases/${name}/`, ROOT)).filter((f) =>
      /^record.*\.json$/.test(f),
    );

    it(`${name}: each record recomputes offline and was written from report.md`, () => {
      expect(records.length).toBeGreaterThan(0);
      const report = read(`cases/${name}/report.md`);
      const block = extractHandbackBlock(report.toString('utf8'));
      for (const file of records) {
        const r = record(`cases/${name}/${file}`);
        expect(verifyRecord(r).problems, file).toEqual([]);
        expect(r.predicate.report.sha256, file).toBe(
          createHash('sha256').update(report).digest('hex'),
        );
        expect(r.predicate.report.source, file).toEqual({
          kind: 'file',
          locator: `cases/${name}/report.md`,
        });
        expect(block.status === 'found' ? block.value : null, file).toEqual(
          r.predicate.block.value,
        );
      }
    });

    // The public tree names no other organisation: a case is from a Barg Labs repository, or it is
    // anonymised (src/cases/anonymise.ts), with case.json saying so and its source digests zeroed.
    it(`${name}: is from a Barg Labs repository, or anonymised`, () => {
      const anonymised = existsSync(new URL(`cases/${name}/case.json`, ROOT));
      for (const file of records) {
        const r = record(`cases/${name}/${file}`);
        if (!anonymised) {
          expect(r.predicate.subject.repository.split('/')[0], file).toBe('BargLabs');
          continue;
        }
        expect(JSON.parse(read(`cases/${name}/case.json`).toString('utf8'))).toMatchObject({
          anonymised: true,
          sourceDigests: 'zeroed',
        });
        expect(r.predicate.subject.repository, file).toBe('example-org/example-repo');
        expect(
          r.predicate.evidence.sources.every((x) => x.sha256 === '0'.repeat(64)),
          file,
        ).toBe(true);
      }
    });
  }
});

// Each claim the README makes about a case: the sentence as the README states it, and what the
// case's record must hold for the sentence to be true.
describe("the README's claims about the cases", () => {
  const scope = record('cases/cejel-408-scope/record.json');
  const closes = record('cases/cejel-408-closes/record.json');
  const anonymous = record('cases/cejel-408-closes/record.anonymous.json');
  const closesRow = (r: DunstanRecord) => r.predicate.claims.find((c) => c.check === 'reference');

  it('names the head, the files and the merge time the scope case declares', () => {
    const value = scope.predicate.block.value as {
      headCommit: string;
      filesChanged: string[];
      mergedAt: string;
    };
    expect(readme).toContain(
      `check this handback for BargLabs/cejel#408: head commit ${value.headCommit}`,
    );
    expect(readme).toContain(`files changed ${value.filesChanged.join(' and ')}`);
    expect(readme).toContain(`merged at ${value.mergedAt}`);
    expect(scope.predicate.subject.repository).toBe('BargLabs/cejel');
    expect(scope.predicate.subject.pullRequest).toBe(408);
  });

  it('"Every claim holds, so the verdict is `pass`."', () => {
    expect(readme).toContain('Every claim holds, so the verdict is `pass`.');
    expect(scope.predicate.verdict).toBe('pass');
    expect(scope.predicate.claims.every((c) => c.verdict === 'pass')).toBe(true);
  });

  it('"Without a token the `closes` row is `unverifiable` (`source_unreadable:closing_references`)"', () => {
    expect(readme).toContain(
      'check whether BargLabs/cejel#408 closes #407, with head commit 35d6201d00cf926f9af10df61bfec05b6624ee12',
    );
    expect(readme).toContain(
      'Without a token the `closes` row is `unverifiable` (`source_unreadable:closing_references`)',
    );
    expect(closesRow(anonymous)).toMatchObject({
      declared: { issue: '#407', relation: 'closes' },
      verdict: 'unverifiable',
      reason: 'source_unreadable:closing_references',
    });
  });

  it('"With a token it is `pass`."', () => {
    expect(readme).toContain('With a token it is `pass`.');
    expect(closesRow(closes)).toMatchObject({
      declared: { issue: '#407', relation: 'closes' },
      verdict: 'pass',
    });
    expect(closes.predicate.block.value).toEqual({
      ...(anonymous.predicate.block.value as object),
    });
  });
});

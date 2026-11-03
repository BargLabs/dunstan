// dunstan junit-merge: several JUnit files, as Maven Surefire and Gradle write one per test class,
// into the one file a `junit` record names. The reporter samples in test/junit-reporters/ are
// written by hand from each reporter's documented shape (their README says so).

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main } from '../cli/main.js';
import { countJunit } from '../evidence/junit.js';
import { JunitMergeError, mergeJunit } from './merge.js';

const SAMPLES = fileURLToPath(new URL('../../test/junit-reporters/', import.meta.url));

// Every sample, by reporter, as the paths a CI step would pass.
const REPORTERS: Record<string, string[]> = {
  pytest: ['pytest/junit.xml'],
  'jest-junit': ['jest-junit/junit.xml'],
  vitest: ['vitest/junit.xml'],
  'maven-surefire': readdirSync(join(SAMPLES, 'maven-surefire/target/surefire-reports'))
    .filter((f) => /^TEST-.*\.xml$/.test(f))
    .map((f) => `maven-surefire/target/surefire-reports/${f}`),
  gradle: readdirSync(join(SAMPLES, 'gradle/build/test-results/test'))
    .filter((f) => f.endsWith('.xml'))
    .map((f) => `gradle/build/test-results/test/${f}`),
  gotestsum: ['gotestsum/junit.xml'],
};

// The counts each sample's README row gives.
const EXPECTED: Record<string, { executed: number; failed: number }> = {
  pytest: { executed: 3, failed: 1 },
  'jest-junit': { executed: 3, failed: 0 },
  vitest: { executed: 3, failed: 1 },
  'maven-surefire': { executed: 5, failed: 1 },
  gradle: { executed: 3, failed: 1 },
  gotestsum: { executed: 3, failed: 1 },
};

const input = (path: string) => ({ path, xml: readFileSync(join(SAMPLES, path), 'utf8') });
const sum = (paths: string[]) =>
  paths
    .map((p) => countJunit(input(p).xml))
    .reduce((a, b) => ({ executed: a.executed + b.executed, failed: a.failed + b.failed }), {
      executed: 0,
      failed: 0,
    });

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

describe('the reporter samples', () => {
  it('has two files each for Maven Surefire and Gradle', () => {
    expect(REPORTERS['maven-surefire']).toHaveLength(2);
    expect(REPORTERS.gradle).toHaveLength(2);
  });

  it.each(Object.keys(REPORTERS))(
    '%s: each file is well-formed JUnit with the README counts',
    (r) => {
      expect(sum(REPORTERS[r] as string[])).toEqual(EXPECTED[r]);
    },
  );
});

describe('mergeJunit', () => {
  const all = Object.values(REPORTERS).flat();

  it.each(Object.keys(REPORTERS))('%s: the merged count is the sum of the inputs', (r) => {
    const paths = REPORTERS[r] as string[];
    const merged = mergeJunit(paths.map(input));
    expect(merged.counts).toEqual(sum(paths));
    expect(countJunit(merged.xml)).toEqual(sum(paths));
  });

  it('merges every sample of every reporter into one file whose count is the sum', () => {
    const merged = mergeJunit(all.map(input));
    expect(countJunit(merged.xml)).toEqual(sum(all));
    expect(merged.counts).toEqual({ executed: 20, failed: 5 });
  });

  it('gives byte-identical output for any input order', () => {
    const paths = [
      ...(REPORTERS['maven-surefire'] as string[]),
      ...(REPORTERS.gradle as string[]),
      'pytest/junit.xml',
    ];
    const outputs = new Set(permutations(paths).map((order) => mergeJunit(order.map(input)).xml));
    expect(outputs.size).toBe(1);
  });

  it("copies each <testsuites> root's children and each <testsuite> root as written", () => {
    const merged = mergeJunit([
      {
        path: 'b.xml',
        xml: '<?xml version="1.0"?>\n<testsuite name="b"><testcase name="x"/></testsuite>\n',
      },
      {
        path: 'a.xml',
        xml: '<testsuites tests="9"><testsuite name="a1"><testcase name="y"><failure/></testcase></testsuite><!-- kept --></testsuites>',
      },
      { path: 'c.xml', xml: '<testsuites/>' },
    ]);
    expect(merged.xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuites>',
        '<testsuite name="a1"><testcase name="y"><failure/></testcase></testsuite><!-- kept -->',
        '<testsuite name="b"><testcase name="x"/></testsuite>',
        '',
        '</testsuites>',
        '',
      ].join('\n'),
    );
    expect(merged.counts).toEqual({ executed: 2, failed: 1 });
  });

  it('orders the inputs by path in code-unit order, not by locale', () => {
    const merged = mergeJunit([
      { path: 'b.xml', xml: '<testsuite name="lower"/>' },
      { path: 'B.xml', xml: '<testsuite name="upper"/>' },
    ]);
    expect(merged.xml.indexOf('upper')).toBeLessThan(merged.xml.indexOf('lower'));
  });

  describe('refuses', () => {
    const refusal = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        expect(e).toBeInstanceOf(JunitMergeError);
        return (e as Error).message;
      }
      throw new Error('no refusal');
    };

    it('no input', () => {
      expect(refusal(() => mergeJunit([]))).toMatch(/no input/);
    });

    it('an input that is not well-formed JUnit, naming it', () => {
      expect(
        refusal(() =>
          mergeJunit([input('pytest/junit.xml'), { path: 'bad.xml', xml: '<testsuite>' }]),
        ),
      ).toMatch(/bad\.xml: .*unclosed <testsuite>/);
      expect(refusal(() => mergeJunit([{ path: 'root.xml', xml: '<report/>' }]))).toMatch(
        /root\.xml: root element is <report>/,
      );
    });

    it('an input with a DOCTYPE', () => {
      const xml =
        '<!DOCTYPE testsuite [<!ENTITY x "y">]><testsuite><testcase name="&x;"/></testsuite>';
      expect(refusal(() => mergeJunit([{ path: 'doctype.xml', xml }]))).toMatch(
        /doctype\.xml: DOCTYPE and other declarations are refused/,
      );
    });

    it('the same path twice', () => {
      expect(
        refusal(() => mergeJunit([input('pytest/junit.xml'), input('pytest/junit.xml')])),
      ).toMatch(/pytest\/junit\.xml is given twice/);
    });

    it('a merged count that differs from the sum of the inputs', () => {
      // The copy is of whole elements, so the counts cannot differ; the check is kept so that a
      // change that broke the copy would refuse rather than write a file with other counts.
      let calls = 0;
      const count = (xml: string) => {
        const counts = countJunit(xml);
        calls++;
        return { ...counts, executed: counts.executed + 1 };
      };
      expect(refusal(() => mergeJunit([input('pytest/junit.xml')], count))).toMatch(
        /the merged file counts 4 executed and 1 failed; the inputs sum to 3 and 1/,
      );
      // The stand-in reads the merged file only; the inputs are read by the one reader.
      expect(calls).toBe(1);
    });
  });
});

describe('dunstan junit-merge', () => {
  async function run(args: string[]) {
    let out = '';
    let err = '';
    const code = await main(['junit-merge', ...args], {
      out: (t) => {
        out += t;
      },
      err: (t) => {
        err += t;
      },
      env: {},
      artifact: import.meta.url,
      readStdin: () => new Uint8Array(),
      cwd: SAMPLES,
    });
    return { code, out, err };
  }

  it('writes the merged file and prints its counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dunstan-merge-'));
    const out = join(dir, 'junit.xml');
    const r = await run([...(REPORTERS.gradle as string[]), '--out', out]);
    expect(r.code).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(
      mergeJunit((REPORTERS.gradle as string[]).map(input)).xml,
    );
    expect(r.err).toBe(`dunstan: ${out}: 2 files, 3 test cases executed, 1 failed\n`);
    expect(r.out).toBe('');
  });

  it('needs --out and at least one input', async () => {
    expect((await run(['pytest/junit.xml'])).err).toMatch(/--out <file> is required/);
    const none = await run(['--out', join(tmpdir(), 'x.xml')]);
    expect(none.code).toBe(3);
    expect(none.err).toMatch(/no input/);
  });

  it('refuses an --out that is one of its inputs, and writes nothing on a refusal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dunstan-merge-'));
    const bad = join(dir, 'bad.xml');
    writeFileSync(bad, '<testsuite>');
    const out = join(dir, 'junit.xml');
    const r = await run([bad, '--out', out]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/unclosed <testsuite>/);
    expect(readdirSync(dir)).toEqual(['bad.xml']);
    const self = await run([bad, '--out', bad]);
    expect(self.code).toBe(3);
    expect(self.err).toMatch(/--out .* is one of the inputs/);
  });
});

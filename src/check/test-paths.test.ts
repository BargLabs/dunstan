import { describe, expect, it } from 'vitest';
import { isTestPath, matchesTestPath, parseTestPaths, testPathProblem } from './test-paths.js';

describe('matchesTestPath', () => {
  it('matches a pattern without / against the last segment, in any directory', () => {
    expect(matchesTestPath('*_test.go', 'pkg/x/sum_test.go')).toBe(true);
    expect(matchesTestPath('*_test.go', 'sum_test.go')).toBe(true);
    expect(matchesTestPath('*_test.go', 'pkg/x/sum.go')).toBe(false);
    expect(matchesTestPath('test_*.py', 'tests/unit/test_api.py')).toBe(true);
  });

  it('matches a pattern with / from the root, with ** any segments, none included', () => {
    expect(matchesTestPath('src/**/*.test.ts', 'src/a.test.ts')).toBe(true);
    expect(matchesTestPath('src/**/*.test.ts', 'src/x/y/a.test.ts')).toBe(true);
    expect(matchesTestPath('src/**/*.test.ts', 'lib/src/a.test.ts')).toBe(false);
    expect(matchesTestPath('tests/**', 'tests/a/b.py')).toBe(true);
    expect(matchesTestPath('tests/*', 'tests/a/b.py')).toBe(false);
    expect(matchesTestPath('**/__tests__/**', 'src/__tests__/x.ts')).toBe(true);
  });

  it('reads ? as one character and {a,b} as either', () => {
    expect(matchesTestPath('*.{test,spec}.{ts,tsx}', 'a/b.spec.tsx')).toBe(true);
    expect(matchesTestPath('*.{test,spec}.{ts,tsx}', 'a/b.spec.js')).toBe(false);
    expect(matchesTestPath('t?st.py', 'test.py')).toBe(true);
    expect(matchesTestPath('a.b', 'axb')).toBe(false);
  });

  it('isTestPath is true when any pattern matches', () => {
    expect(isTestPath(['*_test.go', 'tests/**'], 'tests/x.py')).toBe(true);
    expect(isTestPath([], 'tests/x.py')).toBe(false);
  });
});

describe('parseTestPaths', () => {
  it('refuses what is not a test path, and keeps each pattern once', () => {
    expect(parseTestPaths(['*_test.go', '*_test.go'])).toEqual(['*_test.go']);
    for (const bad of [
      '',
      ' x',
      '/abs',
      '!neg',
      '../x',
      'a/./b',
      'a[bc]',
      'a{b',
      'a{b{c}}',
      'a\\b',
    ]) {
      expect(testPathProblem(bad), bad).toBeDefined();
      expect(() => parseTestPaths([bad]), bad).toThrow(/test path/);
    }
    expect(() => parseTestPaths(Array.from({ length: 51 }, (_, i) => `a${i}`))).toThrow(
      /at most 50/,
    );
  });
});

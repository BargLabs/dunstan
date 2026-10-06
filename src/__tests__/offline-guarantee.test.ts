// The offline guarantee: src/advisory/, src/check/, src/record/, src/retrieval/, src/spec/,
// src/suggest/ and the `dunstan verify` path can make no network call. See offline-boundary.ts for how the guard decides. Every planted
// violation in offline-fixtures/ must be caught; the safe fixture must not be.

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectOfflineSources, findOfflineViolations } from './offline-boundary.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (name: string) => `src/__tests__/offline-fixtures/${name}.ts`;

describe('offline guarantee', () => {
  it('covers the checker core, the record module, the spec module and the verify path', () => {
    const files = collectOfflineSources(repoRoot);
    for (const expected of [
      'src/advisory/extract.ts',
      'src/advisory/advise.ts',
      'src/advisory/grammar.ts',
      'src/advisory/precision.ts',
      'src/advisory/present.ts',
      'src/check/checks.ts',
      'src/check/index.ts',
      'src/record/build.ts',
      'src/record/sign.ts',
      'src/record/verify.ts',
      'src/retrieval/retrieve.ts',
      'src/retrieval/reader-claims.ts',
      'src/retrieval/embedding.ts',
      'src/spec/extract.ts',
      'src/spec/schema.ts',
      'src/suggest/suggest.ts',
      'src/cli/verify.ts',
    ]) {
      expect(files).toContain(expected);
    }
    expect(files.some((f) => f.endsWith('.test.ts') || f.includes('__tests__'))).toBe(false);
    expect(files.some((f) => f.startsWith('src/evidence/'))).toBe(false);
  });

  it('finds no violation in the offline graph', () => {
    expect(findOfflineViolations(repoRoot, collectOfflineSources(repoRoot))).toEqual([]);
  });

  it.each([
    ['global-fetch', 'capability_global', 'uses global fetch'],
    ['network-import', 'network_module', 'imports node:https'],
    ['global-object-alias', 'capability_global', 'uses global globalThis'],
    ['reaches-evidence', 'reaches_evidence', 'src/evidence/github.ts is in the offline graph'],
    ['subprocess', 'subprocess_module', 'imports node:child_process'],
    ['computed-import', 'computed_import', 'import() of a computed specifier'],
    ['create-require', 'loader_module', 'imports node:module'],
    ['transitive', 'network_module', 'imports node:https'],
  ])('catches the planted violation in %s (%s)', (name, kind, detail) => {
    const violations = findOfflineViolations(repoRoot, [fixture(name)]);
    expect(violations).toContainEqual(expect.objectContaining({ kind, detail }));
  });

  it('does not flag local bindings, property names, comments or strings', () => {
    expect(findOfflineViolations(repoRoot, [fixture('safe-local-names')])).toEqual([]);
  });

  it('allows node:child_process in src/record/sign.ts and nowhere else', () => {
    expect(findOfflineViolations(repoRoot, ['src/record/sign.ts'])).toEqual([]);
    expect(findOfflineViolations(repoRoot, [fixture('subprocess')])).toContainEqual(
      expect.objectContaining({ file: fixture('subprocess'), kind: 'subprocess_module' }),
    );
  });
});

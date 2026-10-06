import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_VERSION,
  DRAFT_PREDICATE_TYPE,
  DRAFT_SPEC_VERSION,
  PREDICATE_TYPE,
  STATEMENT_TYPE,
} from './constants.js';
import {
  BLOCK_SCHEMA_FILE,
  DRAFT_RECORD_SCHEMA_FILE,
  RECORD_SCHEMA_FILE,
  readSchema,
  validateBlock,
} from './schema.js';

type Schema = { properties: Record<string, { const?: unknown }> };

describe('the published schemas', () => {
  const block = readSchema(BLOCK_SCHEMA_FILE) as unknown as Schema;
  const record = readSchema(RECORD_SCHEMA_FILE) as unknown as Schema;

  it('are JSON Schema 2020-12', () => {
    expect(readSchema(BLOCK_SCHEMA_FILE).$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(readSchema(RECORD_SCHEMA_FILE).$schema).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
  });

  it('carry the same constants as src/spec/constants.ts', () => {
    expect(block.properties.dunstan?.const).toBe(BLOCK_VERSION);
    expect(record.properties._type?.const).toBe(STATEMENT_TYPE);
    expect(record.properties.predicateType?.const).toBe(PREDICATE_TYPE);
  });

  it('include a DRAFT 0.2.0 record schema with the draft constants, leaving 0.1 as it was', () => {
    const draft = readSchema(DRAFT_RECORD_SCHEMA_FILE) as {
      $schema: string;
      properties: Record<string, { const?: unknown }>;
      $defs: { predicate: { properties: { spec: { const: string } } } };
    };
    expect(draft.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(draft.properties.predicateType?.const).toBe(DRAFT_PREDICATE_TYPE);
    expect(draft.$defs.predicate.properties.spec.const).toBe(DRAFT_SPEC_VERSION);
    expect(DRAFT_PREDICATE_TYPE).not.toBe(PREDICATE_TYPE);
  });

  it('treat repository paths strictly', () => {
    const withPath = (path: string) =>
      validateBlock({
        dunstan: '0.1',
        headCommit: 'c0ffee12345678abcdef0123456789abcdef0123',
        filesChanged: [path],
      });
    for (const ok of ['a', 'ab', '.github/workflows/ci.yml', '.a', 'a/..b/c', 'dir/file name.ts']) {
      expect(withPath(ok), ok).toEqual([]);
    }
    for (const bad of [
      '',
      '/a',
      'a/',
      'a//b',
      '.',
      '..',
      'a/./b',
      'a/../b',
      './a',
      '../a',
      'a\u0000b',
    ]) {
      expect(withPath(bad).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('allow exactly the claim reasons the spec lists in section 16', () => {
    const spec = readFileSync(new URL('../../spec/claim-format.md', import.meta.url), 'utf8');
    const start = spec.indexOf('## 16. Reason codes');
    const table = spec.slice(start, spec.indexOf('\n## ', start));
    const rows = [...table.matchAll(/^\| `([^`]+)` \| (\w+) \|/gm)];
    const claimReasons = rows
      .filter(([, , verdict]) => verdict !== 'block')
      .map(([, r]) => r as string);
    expect(claimReasons.length).toBeGreaterThan(10);

    const defs = (readSchema(RECORD_SCHEMA_FILE) as { $defs: Record<string, { pattern: string }> })
      .$defs;
    const pattern = new RegExp((defs.claimReason as { pattern: string }).pattern);
    for (const reason of claimReasons) {
      const concrete = reason.replace('<field>', 'merged_at').replace('<kind>', 'check_runs');
      expect(pattern.test(concrete), reason).toBe(true);
    }
    // And nothing beyond them: every alternative in the pattern is in the table.
    const alternatives: string[] = [''];
    let depth = 0;
    for (const c of pattern.source.slice('^(?:'.length, -')$'.length)) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === '|' && depth === 0) alternatives.push('');
      else alternatives[alternatives.length - 1] += c;
    }
    expect(alternatives.length).toBe(claimReasons.length);
    for (const alternative of alternatives) {
      const name = alternative.replace(/:.*/, '');
      expect(
        claimReasons.some((r) => r.replace(/:.*/, '') === name),
        name,
      ).toBe(true);
    }
  });

  it('accepts a test record of any other kind with any shape', () => {
    expect(
      validateBlock({
        dunstan: '0.1',
        headCommit: 'c0ffee12345678abcdef0123456789abcdef0123',
        filesChanged: [],
        tests: [{ command: 'go test ./...', count: 3, record: { kind: 'go-test-json', x: [1] } }],
      }),
    ).toEqual([]);
  });
});

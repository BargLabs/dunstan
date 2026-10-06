import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadCases, runCase } from '../acceptance/fixtures.js';
import { canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { serializeRecord } from './build.js';
import { CHECKER_VERSION } from './checker.js';
import { verifyRecord } from './verify.js';

const ROOT = new URL('../../', import.meta.url);

describe('checker identity', () => {
  it('CHECKER_VERSION is package.json version', () => {
    const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as {
      version: string;
    };
    expect(CHECKER_VERSION).toBe(pkg.version);
  });
});

describe('verifyRecord', () => {
  // The spec's illustrative records were written by hand with the spec, before this checker
  // existed. Recomputing them is an independent check of both.
  const examples = readdirSync(new URL('spec/examples/records/', ROOT)).filter((n) =>
    n.endsWith('.json'),
  );

  it.each(examples)('recomputes spec/examples/records/%s byte for byte', (name) => {
    const record = JSON.parse(readFileSync(new URL(`spec/examples/records/${name}`, ROOT), 'utf8'));
    expect(verifyRecord(record).problems).toEqual([]);
  });

  const full = () => {
    const c = loadCases('controls').find((x) => x.name === 'full');
    if (c === undefined) throw new Error('no full control');
    return JSON.parse(serializeRecord(runCase(c)));
  };

  // Sets the member at a JSON Pointer (no escaping needed for these paths).
  const setAt = (root: unknown, pointer: string, value: unknown) => {
    const tokens = pointer.split('/').slice(1);
    const last = tokens.pop() as string;
    const parent = tokens.reduce<unknown>((node, t) => (node as Record<string, unknown>)[t], root);
    (parent as Record<string, unknown>)[last] = value;
  };

  it.each([
    ['a passing claim marked failed', '/predicate/claims/0/verdict', 'fail', '/predicate/claims/0'],
    ['a changed verdict', '/predicate/verdict', 'fail', '/predicate/verdict'],
    [
      'an edited evidence value',
      '/predicate/evidence/checkRuns/runs/0/conclusion',
      'failure',
      '/predicate/claims/10',
    ],
    [
      'an edited block value',
      '/predicate/block/value/filesChanged/0',
      'src/other.ts',
      '/predicate/block/sha256',
    ],
    ['a changed head subject', '/subject/0/digest/gitCommit', 'f'.repeat(40), '/subject'],
    [
      'a changed claims digest',
      '/predicate/digests/claims',
      'f'.repeat(64),
      '/predicate/digests/claims',
    ],
    ['another checker version', '/predicate/checker/version', '9.9.9', '/predicate/checker'],
  ])('names the member that differs after %s', (_, pointer, value, member) => {
    const record = full();
    expect(verifyRecord(record).ok).toBe(true);
    setAt(record, pointer, value);
    const result = verifyRecord(record);
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => p.member)).toContain(member);
  });

  it('ignores read times and other provenance in sources', () => {
    const record = full();
    for (const s of record.predicate.evidence.sources) s.readAt = '2031-01-01T00:00:00Z';
    expect(verifyRecord(record).problems).toEqual([]);
  });

  it('refuses a value that is not a record', () => {
    expect(verifyRecord({ hello: 'world' }).ok).toBe(false);
  });
});

describe('serializeRecord', () => {
  it('writes an unsigned record pretty-printed and a signed one as its JCS bytes', () => {
    const c = loadCases('controls')[0];
    if (c === undefined) throw new Error('no control');
    const record = runCase(c);
    expect(serializeRecord(record).endsWith('}\n')).toBe(true);
    record.predicate.assurance = {
      status: 'signed',
      issuer: 'checker@example.org',
      keyFingerprint: `SHA256:${'A'.repeat(43)}`,
    };
    expect(serializeRecord(record)).toBe(canonicalize(record as unknown as JsonValue));
  });
});

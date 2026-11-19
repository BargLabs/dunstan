// `dunstan-eval anonymise-case`: writes the case's three files, and the mapping outside cases/; a
// case directory that exists, a mapping file under cases/ and an unnamed case are refused.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evalMain } from '../eval/main.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';

const CASE = fileURLToPath(new URL('../../cases/cejel-408-closes/', import.meta.url));

async function run(args: string[]) {
  let out = '';
  let err = '';
  const code = await evalMain(['anonymise-case', ...args], {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
  });
  return { code, out, err };
}

describe('dunstan-eval anonymise-case', () => {
  it('writes report.md, record.json and case.json, and the mapping where it is told', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dunstan-cases-'));
    const cases = join(dir, 'cases');
    const mapping = join(dir, 'mapping.json');
    const r = await run([
      '--record',
      join(CASE, 'record.json'),
      '--report',
      join(CASE, 'report.md'),
      '--case',
      'outside-1',
      '--cases',
      cases,
      '--mapping-out',
      mapping,
    ]);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    const record = JSON.parse(readFileSync(join(cases, 'outside-1', 'record.json'), 'utf8'));
    expect(verifyRecord(record).problems).toEqual([]);
    expect(record.predicate.report.source.locator).toBe('cases/outside-1/report.md');
    expect(JSON.parse(readFileSync(join(cases, 'outside-1', 'case.json'), 'utf8'))).toEqual({
      anonymised: true,
      checker: `dunstan ${CHECKER_VERSION}`,
      paths: 'kept',
      sourceDigests: 'zeroed',
    });
    expect(JSON.parse(readFileSync(mapping, 'utf8'))['barglabs/cejel']).toBe(
      'example-org/example-repo',
    );
    // Written once.
    const again = await run([
      '--record',
      join(CASE, 'record.json'),
      '--report',
      join(CASE, 'report.md'),
      '--case',
      'outside-1',
      '--cases',
      cases,
      '--mapping-out',
      mapping,
    ]);
    expect(again.code).toBe(3);
  });

  it('refuses a mapping file under cases/, and a case name that is not plain', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dunstan-cases-'));
    const cases = join(dir, 'cases');
    const base = [
      '--record',
      join(CASE, 'record.json'),
      '--report',
      join(CASE, 'report.md'),
      '--cases',
      cases,
    ];
    const under = await run([
      ...base,
      '--case',
      'outside-2',
      '--mapping-out',
      join(cases, 'm.json'),
    ]);
    expect(under.code).toBe(3);
    expect(under.err).toContain('keep it out of the case');
    const named = await run([...base, '--case', 'Some_Org', '--mapping-out', join(dir, 'm.json')]);
    expect(named.code).toBe(3);
    expect(existsSync(join(cases, 'outside-2'))).toBe(false);
  });
});

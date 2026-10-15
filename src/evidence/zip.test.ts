// An archive's stored size and its selected entry's inflated size are limited separately: the
// download is read against the archive budget (src/evidence/http.ts), and the entry is inflated to
// at most MAX_ENTRY_BYTES (or the caller's lower limit) whatever size the archive declares for it.

import { describe, expect, it } from 'vitest';
import { makeZip } from '../__tests__/fake-github.js';
import { MAX_ENTRY_BYTES, readZipEntry, ZipError } from './zip.js';

// The archive with the declared (inflated) size of its only entry set to `size`.
function declaring(zip: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(zip);
  const dv = new DataView(out.buffer);
  const central = dv.getUint32(out.length - 22 + 16, true);
  dv.setUint32(central + 24, size, true);
  dv.setUint32(22, size, true);
  return out;
}

describe('readZipEntry limits', () => {
  const bomb = makeZip({ 'reports/junit.xml': 'a'.repeat(MAX_ENTRY_BYTES + 1) });

  it('refuses a small stored entry that inflates past the limit, whatever size it declares', () => {
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const lying = declaring(bomb, 100);
    expect(() => readZipEntry(lying, 'reports/junit.xml')).toThrow(ZipError);
    expect(() => readZipEntry(lying, 'reports/junit.xml')).toThrow(/cannot inflate/);
  });

  it('refuses an entry that declares more than the limit without inflating it', () => {
    expect(() => readZipEntry(bomb, 'reports/junit.xml')).toThrow(
      `entry larger than ${MAX_ENTRY_BYTES} bytes`,
    );
  });

  it('reads an entry of exactly the limit', () => {
    const zip = makeZip({ 'reports/junit.xml': 'a'.repeat(MAX_ENTRY_BYTES) });
    expect(readZipEntry(zip, 'reports/junit.xml')?.length).toBe(MAX_ENTRY_BYTES);
  });

  // 10AI: the hosted Worker passes a lower limit, which holds the same way.
  it('holds a lower limit the caller gives, declared or inflated', () => {
    const limit = 1024 * 1024;
    const zip = makeZip({ 'reports/junit.xml': 'a'.repeat(limit + 1) });
    expect(() => readZipEntry(zip, 'reports/junit.xml', limit)).toThrow(
      `entry larger than ${limit} bytes`,
    );
    expect(() => readZipEntry(declaring(zip, 100), 'reports/junit.xml', limit)).toThrow(
      /cannot inflate/,
    );
    const exact = makeZip({ 'reports/junit.xml': 'a'.repeat(limit) });
    expect(readZipEntry(exact, 'reports/junit.xml', limit)?.length).toBe(limit);
  });
});

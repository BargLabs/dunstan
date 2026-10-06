// API keys and the operator scripts: the key the script issues is the key the Worker accepts, it is
// stored only as its hash, and it cannot be issued for an installation the App does not know.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { issueKeySql, newApiKey, parseInstallation } from '../scripts/issue-key.js';
import { setRetentionSql } from '../scripts/set-retention.js';
import { API_KEY, hashApiKey } from '../src/keys.js';
import { type Emulated, emulators, INSTALLATION } from './support.js';

let emulated: Emulated;
beforeAll(async () => {
  emulated = await emulators();
});
afterAll(async () => {
  await emulated.mf.dispose();
});

describe('API keys', () => {
  it('issues a key of the accepted form whose hash the Worker computes the same way', () => {
    const { key, hash } = newApiKey();
    expect(key).toMatch(API_KEY);
    expect(hashApiKey(key)).toBe(hash);
    expect(newApiKey().key).not.toBe(key);
  });

  it('stores the hash and never the key', async () => {
    const db = emulated.env.DB;
    await db
      .prepare("INSERT INTO installations (id, account, created_at) VALUES (?, 'example-org', 'x')")
      .bind(INSTALLATION)
      .run();
    const { key, hash } = newApiKey();
    expect(
      (await db.prepare(issueKeySql(INSTALLATION, hash, '2026-10-04T00:00:00Z')).run()).meta
        .changes,
    ).toBe(1);
    const rows = (await db.prepare('SELECT * FROM api_keys').all()).results;
    expect(JSON.stringify(rows)).not.toContain(key);
    expect(JSON.stringify(rows)).toContain(hash);
  });

  it('issues no key for an unknown installation or one being deleted', async () => {
    const db = emulated.env.DB;
    const { hash } = newApiKey();
    expect(
      (await db.prepare(issueKeySql(999, hash, '2026-10-04T00:00:00Z')).run()).meta.changes,
    ).toBe(0);
    await db.prepare('UPDATE installations SET deleting = 1 WHERE id = ?').bind(INSTALLATION).run();
    const other = newApiKey();
    expect(
      (await db.prepare(issueKeySql(INSTALLATION, other.hash, '2026-10-04T00:00:00Z')).run()).meta
        .changes,
    ).toBe(0);
  });

  it('refuses malformed input before building any SQL', () => {
    expect(() => parseInstallation('1; DROP TABLE api_keys')).toThrow();
    expect(() => issueKeySql(1, "x' OR 1=1 --", '2026-10-04T00:00:00Z')).toThrow();
    expect(() => setRetentionSql(1, 91)).toThrow();
    expect(() => setRetentionSql(1, -1)).toThrow();
    expect(setRetentionSql(1, 0)).toContain('retention_days = 0');
  });

  it('keeps retention between 0 and 90 days in the database too', async () => {
    const db = emulated.env.DB;
    await expect(
      db
        .prepare('UPDATE installations SET retention_days = 91 WHERE id = ?')
        .bind(INSTALLATION)
        .run(),
    ).rejects.toThrow();
  });
});

// What the hosted tier keeps, and for how long. D1 holds installations and API-key hashes; R2 holds
// records, one object per record under records/<installation>/<id>.json, each holding the signed
// record bytes and their signature and nothing else. Report text is never stored (the record carries
// only its SHA-256).
//
// Retention is per installation, 90 days by default and down to 0 (store nothing). Three things
// enforce it: a record past its installation's retention is never served; the scheduled sweep
// deletes it; and the bucket's lifecycle rule deletes anything under records/ after 90 days whatever
// the Worker does (docs/runbooks/hosted-provisioning.md).

import type { Database, Env, RecordBucket } from './env.js';

export const DEFAULT_RETENTION_DAYS = 90;
export const MAX_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const RECORD_ID = /^[0-9a-f]{64}$/;
const LIST_LIMIT = 1000;

export interface Installation {
  id: number;
  account: string;
  retentionDays: number;
}

interface InstallationRow {
  id: number;
  account: string;
  retention_days: number;
  deleting: number;
}

// ---------------------------------------------------------------- installations and keys

export async function addInstallation(
  db: Database,
  id: number,
  account: string,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO installations (id, account, created_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT (id) DO UPDATE SET account = excluded.account',
    )
    .bind(id, account, now.toISOString())
    .run();
}

// The account the App is installed on was renamed (installation_target.renamed).
export async function renameInstallation(db: Database, id: number, account: string): Promise<void> {
  await db.prepare('UPDATE installations SET account = ? WHERE id = ?').bind(account, id).run();
}

// The installation an API key (by its hash) belongs to, unless it is being deleted.
export async function installationForKey(
  db: Database,
  keyHash: string,
): Promise<Installation | null> {
  const row = await db
    .prepare(
      'SELECT i.id, i.account, i.retention_days, i.deleting FROM api_keys k ' +
        'JOIN installations i ON i.id = k.installation_id WHERE k.key_hash = ? AND i.deleting = 0',
    )
    .bind(keyHash)
    .first<InstallationRow>();
  return row === null
    ? null
    : { id: row.id, account: row.account, retentionDays: row.retention_days };
}

// ---------------------------------------------------------------- records

export interface StoredRecord {
  // The SHA-256 of the record bytes.
  id: string;
  // The record's JCS bytes, as signed.
  record: string;
  // The detached SSH signature over them.
  signature: string;
}

export function recordPrefix(installationId: number): string {
  return `records/${installationId}/`;
}

function recordKey(installationId: number, id: string): string {
  return `${recordPrefix(installationId)}${id}.json`;
}

export function expiresAt(uploaded: Date, retentionDays: number): Date {
  return new Date(uploaded.getTime() + retentionDays * DAY_MS);
}

export async function putRecord(
  bucket: RecordBucket,
  installationId: number,
  stored: StoredRecord,
): Promise<void> {
  await bucket.put(
    recordKey(installationId, stored.id),
    JSON.stringify({ record: stored.record, signature: stored.signature }),
    { httpMetadata: { contentType: 'application/json' } },
  );
}

// A stored record within its installation's retention, or null. One past it is deleted on the way.
export async function getRecord(
  bucket: RecordBucket,
  installation: Installation,
  id: string,
  now: Date,
): Promise<{ stored: StoredRecord; expiresAt: Date } | null> {
  if (!RECORD_ID.test(id)) return null;
  const key = recordKey(installation.id, id);
  const object = await bucket.get(key);
  if (object === null) return null;
  const expiry = expiresAt(object.uploaded, installation.retentionDays);
  if (now.getTime() >= expiry.getTime()) {
    await bucket.delete(key);
    return null;
  }
  const body = JSON.parse(await object.text()) as { record: string; signature: string };
  return { stored: { id, record: body.record, signature: body.signature }, expiresAt: expiry };
}

async function deleteObjects(
  bucket: RecordBucket,
  prefix: string,
  expired: (uploaded: Date) => boolean = () => true,
): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      prefix,
      limit: LIST_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const keys = page.objects.filter((o) => expired(o.uploaded)).map((o) => o.key);
    if (keys.length > 0) await bucket.delete(keys);
    deleted += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
  return deleted;
}

// ---------------------------------------------------------------- deletion

// Deletes an installation's keys at once, then its records, then the installation. If the record
// deletion fails part-way the installation stays marked `deleting` (no key works and nothing new is
// stored for it) and the next sweep finishes the job.
export async function deleteInstallation(env: Env, installationId: number): Promise<number> {
  await env.DB.batch([
    env.DB.prepare('UPDATE installations SET deleting = 1 WHERE id = ?').bind(installationId),
    env.DB.prepare('DELETE FROM api_keys WHERE installation_id = ?').bind(installationId),
  ]);
  const records = await deleteObjects(env.RECORDS, recordPrefix(installationId));
  await env.DB.prepare('DELETE FROM installations WHERE id = ?').bind(installationId).run();
  return records;
}

export interface SweepReport {
  // Installations deleted by this sweep: an unfinished uninstall, or one GitHub no longer has.
  uninstalled: number[];
  // Records deleted for being past retention, or for belonging to no installation.
  expired: number;
  // Steps that failed; the next sweep tries them again.
  failed: string[];
}

// Whether an installation is known and not being deleted: checked again just before a record is
// stored, so a check that was in flight when the App was uninstalled stores nothing.
export async function installationActive(db: Database, installationId: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM installations WHERE id = ? AND deleting = 0')
    .bind(installationId)
    .first();
  return row !== null;
}

// The scheduled sweep, in three passes so that no failure in one stops the others: retention for
// every installation; uninstalls (marked `deleting`, or gone at GitHub, so an uninstall whose webhook
// never arrived is still honoured); and records no installation owns. `exists` answers null when
// GitHub could not tell, and a failure to ask counts the same.
export async function sweep(
  env: Env,
  now: Date,
  exists: (installationId: number) => Promise<boolean | null>,
): Promise<SweepReport> {
  const report: SweepReport = { uninstalled: [], expired: 0, failed: [] };
  const attempt = async (what: string, step: () => Promise<void>) => {
    try {
      await step();
    } catch (e) {
      report.failed.push(`${what}: ${(e as Error).message}`);
    }
  };
  const { results } = await env.DB.prepare(
    'SELECT id, account, retention_days, deleting FROM installations ORDER BY id',
  ).all<InstallationRow>();

  for (const row of results) {
    await attempt(`retention ${row.id}`, async () => {
      report.expired += await deleteObjects(
        env.RECORDS,
        recordPrefix(row.id),
        (uploaded) => now.getTime() >= expiresAt(uploaded, row.retention_days).getTime(),
      );
    });
  }

  for (const row of results) {
    await attempt(`uninstall ${row.id}`, async () => {
      let gone = row.deleting === 1;
      if (!gone) gone = (await exists(row.id).catch(() => null)) === false;
      if (!gone) return;
      await deleteInstallation(env, row.id);
      report.uninstalled.push(row.id);
    });
  }

  // Records under a prefix no installation owns: a store that raced an uninstall. Each prefix is
  // checked against D1 when it is found, so an installation created during the sweep keeps its own.
  await attempt('orphans', async () => {
    let cursor: string | undefined;
    do {
      const page = await env.RECORDS.list({
        prefix: 'records/',
        delimiter: '/',
        limit: LIST_LIMIT,
        ...(cursor === undefined ? {} : { cursor }),
      });
      for (const prefix of page.delimitedPrefixes) {
        const id = Number(/^records\/([0-9]+)\/$/.exec(prefix)?.[1]);
        const owner = await env.DB.prepare('SELECT id FROM installations WHERE id = ?')
          .bind(id)
          .first();
        if (owner === null) report.expired += await deleteObjects(env.RECORDS, prefix);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
  });
  return report;
}

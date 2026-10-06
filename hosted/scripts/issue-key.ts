// Issues an API key for one installation of the hosted tier. Operator-run, with the operator's
// Cloudflare credentials (wrangler's own login); never run by an agent. The key is printed once and
// never stored: D1 keeps only its SHA-256. The installation must already be known (the App's
// installation.created webhook records it).
//
// Usage (from the repository root):
//   node --experimental-strip-types hosted/scripts/issue-key.ts --installation <id> [--database <name>]
//
// Self-contained (node built-ins only) so it runs under Node's type stripping without a build. The
// Worker's own hash (hosted/src/keys.ts) is checked against this one by hosted/test/keys.test.ts.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const DEFAULT_DATABASE = 'dunstan-hosted';

export function newApiKey(random: Uint8Array = randomBytes(32)): { key: string; hash: string } {
  const key = `dunstan_${Buffer.from(random).toString('base64url')}`;
  return { key, hash: createHash('sha256').update(key, 'utf8').digest('hex') };
}

export function parseInstallation(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]{0,15}$/.test(value)) {
    throw new Error('--installation <id> is required: the GitHub App installation id');
  }
  return Number(value);
}

// Inserts the key's hash only if the installation is known and not being deleted, so a key can never
// outlive, or precede, its installation.
export function issueKeySql(installationId: number, hash: string, createdAt: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash) || !Number.isSafeInteger(installationId)) {
    throw new Error('bad key hash or installation id');
  }
  if (!/^[0-9TZ:.-]+$/.test(createdAt)) throw new Error('bad timestamp');
  return (
    'INSERT INTO api_keys (key_hash, installation_id, created_at) ' +
    `SELECT '${hash}', ${installationId}, '${createdAt}' ` +
    `WHERE EXISTS (SELECT 1 FROM installations WHERE id = ${installationId} AND deleting = 0)`
  );
}

// Runs one statement on the remote D1 database and returns the number of rows it changed.
export function d1Execute(database: string, sql: string): number {
  const out = execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      database,
      '--remote',
      '--json',
      '--config',
      'hosted/wrangler.toml',
      '--command',
      sql,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const results = JSON.parse(out) as { meta?: { changes?: number } }[];
  return results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: { installation: { type: 'string' }, database: { type: 'string' } },
  });
  const installationId = parseInstallation(values.installation);
  const { key, hash } = newApiKey();
  const changed = d1Execute(
    values.database ?? DEFAULT_DATABASE,
    issueKeySql(installationId, hash, new Date().toISOString()),
  );
  if (changed !== 1) {
    throw new Error(
      `installation ${installationId} is not known (or is being deleted); no key was issued`,
    );
  }
  process.stdout.write(
    `API key for installation ${installationId} (shown once; Dunstan keeps only its SHA-256):\n\n${key}\n\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`issue-key: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

// Sets how long one installation's records are kept: 0 (return only, store nothing) to 90 days, the
// default. Operator-run, with the operator's Cloudflare credentials; never run by an agent. A shorter
// retention also applies to records already stored: the next scheduled sweep deletes those past it,
// and none past it is served in the meantime.
//
// Usage (from the repository root):
//   node --experimental-strip-types hosted/scripts/set-retention.ts --installation <id> --days <0-90>

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DEFAULT_DATABASE = 'dunstan-hosted';

export function setRetentionSql(installationId: number, days: number): string {
  if (!Number.isSafeInteger(installationId) || installationId < 1) {
    throw new Error('--installation <id> is required: the GitHub App installation id');
  }
  if (!Number.isInteger(days) || days < 0 || days > 90) {
    throw new Error('--days must be an integer from 0 to 90');
  }
  return `UPDATE installations SET retention_days = ${days} WHERE id = ${installationId} AND deleting = 0`;
}

function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      installation: { type: 'string' },
      days: { type: 'string' },
      database: { type: 'string' },
    },
  });
  const installationId = /^[1-9][0-9]{0,15}$/.test(values.installation ?? '')
    ? Number(values.installation)
    : Number.NaN;
  const days = /^[0-9]{1,2}$/.test(values.days ?? '') ? Number(values.days) : Number.NaN;
  const sql = setRetentionSql(installationId, days);
  const out = execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'd1',
      'execute',
      values.database ?? DEFAULT_DATABASE,
      '--remote',
      '--json',
      '--config',
      'hosted/wrangler.toml',
      '--command',
      sql,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const changed = (JSON.parse(out) as { meta?: { changes?: number } }[]).reduce(
    (n, r) => n + (r.meta?.changes ?? 0),
    0,
  );
  if (changed !== 1) throw new Error(`installation ${installationId} is not known`);
  process.stdout.write(`installation ${installationId}: records kept ${days} day(s)\n`);
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`set-retention: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

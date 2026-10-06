// Runs the checker on selected PR <n> (demo/2026-10/README.md).
//
//   pnpm exec node demo/2026-10/tools/check.mjs <n> [<subdir>]          dunstan check, writes record.json
//   pnpm exec node demo/2026-10/tools/check.mjs verify <n> [<subdir>]   dunstan verify record.json, no token
//
// `check` builds the report the procedure's Rule 10 describes (the PR body, then `\n\n`, then the
// block.json fence, then `\n`) in the git-ignored demo/2026-10/.work/<n>/report.md, and runs
// `dist/dunstan.mjs check --report-file` with DUNSTAN_READ_TOKEN as GITHUB_TOKEN on that child only.
//
// <subdir> (for example rerun-0.1.1) puts record.json in <dir>/<subdir>/ instead of <dir>/. A
// published record is never overwritten: `check` refuses when record.json already exists there.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(DEMO, '..', '..');
const DUNSTAN = join(ROOT, 'dist', 'dunstan.mjs');

function selectedPr(n) {
  const selection = JSON.parse(readFileSync(join(DEMO, 'selection.json'), 'utf8'));
  const s = selection.selected.find((x) => x.n === Number(n));
  if (s === undefined) throw new Error(`no selected PR ${n}`);
  const [owner, repo] = s.repository.split('/');
  const prefix = `${s.n}-${owner}-${repo}-${s.number}`;
  const dir = readdirSync(DEMO).find((d) => d === prefix);
  if (dir === undefined) throw new Error(`demo/2026-10/${prefix}/ does not exist`);
  return { ...s, dir: join(DEMO, dir), work: join(DEMO, '.work', String(s.n)) };
}

function run(args, env) {
  const result = spawnSync(process.execPath, [DUNSTAN, ...args], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 3;
}

// The folder record.json lives in: <dir>, or <dir>/<subdir> for a later re-run.
function outDir(s, subdir) {
  if (subdir === undefined) return s.dir;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(subdir)) throw new Error(`bad subdir ${subdir}`);
  return join(s.dir, subdir);
}

const [first, second, third] = process.argv.slice(2);
if (first === 'verify') {
  const s = selectedPr(second);
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  delete env.DUNSTAN_READ_TOKEN;
  process.exit(run(['verify', relative(ROOT, join(outDir(s, third), 'record.json'))], env));
} else if (first !== undefined) {
  const s = selectedPr(first);
  const out = join(outDir(s, second), 'record.json');
  if (existsSync(out)) {
    throw new Error(`${relative(ROOT, out)} exists; a published record is never overwritten`);
  }
  mkdirSync(dirname(out), { recursive: true });
  const block = JSON.parse(readFileSync(join(s.dir, 'block.json'), 'utf8'));
  const body = readFileSync(join(s.work, 'body.md'), 'utf8');
  const report = `${body}\n\n\`\`\`dunstan-handback\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;
  const reportFile = join(s.work, 'report.md');
  writeFileSync(reportFile, report);
  const status = run(
    [
      'check',
      '--repo',
      s.repository,
      '--pr',
      String(s.number),
      '--report-file',
      relative(ROOT, reportFile),
      '--out',
      relative(ROOT, out),
    ],
    { ...process.env, GITHUB_TOKEN: process.env.DUNSTAN_READ_TOKEN },
  );
  process.stdout.write(`exit ${status}\n`);
  process.exit(status);
} else {
  process.stderr.write('usage: check.mjs <n> [<subdir>] | check.mjs verify <n> [<subdir>]\n');
  process.exit(3);
}

// Writes demo/2026-10/<dir>/summary.md for selected PR <n> from selection.json, record.json and the
// conversion notes in the git-ignored demo/2026-10/.work/<n>/not-converted.json: an array of
// { "text": <the report's words>, "reason": <why no field was declared> }, or an object
// { "notConverted": <that array>, "reading": [<paragraph>, ...] } when the verdict needs a note on
// how to read it. Reads nothing online.
//
//   pnpm exec node demo/2026-10/tools/summary.mjs <n> [<subdir>]
//
// With <subdir> (a later re-run that check.mjs wrote to <dir>/<subdir>/), it reads
// <dir>/<subdir>/record.json and .work/<n>/<subdir>/not-converted.json and writes
// <dir>/<subdir>/summary.md; the published <dir>/summary.md is left alone.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = {
  A: 'GitHub Copilot coding agent',
  B: 'Devin',
  C: 'Claude',
  D: 'OpenAI Codex',
  E: 'Google Jules',
};

const n = Number(process.argv[2]);
const subdir = process.argv[3];
if (subdir !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(subdir)) {
  throw new Error(`bad subdir ${subdir}`);
}
const selection = JSON.parse(readFileSync(join(DEMO, 'selection.json'), 'utf8'));
const s = selection.selected.find((x) => x.n === n);
if (s === undefined) throw new Error(`no selected PR ${process.argv[2]}`);
const [owner, repo] = s.repository.split('/');
const dir = `${s.n}-${owner}-${repo}-${s.number}`;
if (!readdirSync(DEMO).includes(dir)) throw new Error(`demo/2026-10/${dir}/ does not exist`);
const outDir = subdir === undefined ? dir : `${dir}/${subdir}`;
const record = JSON.parse(readFileSync(join(DEMO, outDir, 'record.json'), 'utf8'));
const conversion = JSON.parse(
  readFileSync(join(DEMO, '.work', String(n), subdir ?? '', 'not-converted.json'), 'utf8'),
);
const notes = Array.isArray(conversion) ? conversion : conversion.notConverted;
const reading = Array.isArray(conversion) ? [] : conversion.reading;
const p = record.predicate;

const cell = (v) =>
  v === undefined
    ? ''
    : `\`${(typeof v === 'string' ? v : JSON.stringify(v)).replaceAll('|', '\\|').replaceAll('`', "'")}\``;
const tally = new Map();
for (const c of p.claims) tally.set(c.verdict, (tally.get(c.verdict) ?? 0) + 1);
const counts = [...tally].map(([verdict, count]) => `${count} ${verdict}`).join(', ');
const path = `demo/2026-10/${outDir}/record.json`;

const lines = [
  `# ${s.n}. ${s.repository}#${s.number}${subdir === undefined ? '' : `, ${subdir}`}: ${p.verdict}`,
  '',
  `- Pull request: ${s.url}`,
  `- Agent: ${s.agent} (${AGENTS[s.agent]}), selected by \`demo/2026-10/selection-rule.md\`; ${s.stargazersCount} stars and a ${s.cleanedBodyLength}-character cleaned body at selection.`,
  `- Head: \`${p.subject.headSha}\``,
  `- Block: \`${subdir === undefined ? '' : '../'}block.json\`, made from the PR body and the PR by \`demo/2026-10/procedure.md\`. It is not the agent's own block: the agent wrote prose.`,
  `- Report: the PR body, then the block as a \`dunstan-handback\` fence (Rule 10); sha256 \`${p.report.sha256}\`. The report file is git-ignored; \`select.mjs pr ${s.n}\` and \`check.mjs ${s.n}\` rebuild it.`,
  `- Checker: ${p.checker.name} ${p.checker.version}, \`dist/dunstan.mjs\` sha256 \`${p.checker.digest.sha256}\``,
  '',
  `## Verdict: \`${p.verdict}\``,
  '',
  `${p.claims.length} claims: ${counts}.`,
  '',
  '| Verdict | Claim | Declared | Observed | Reason |',
  '|---|---|---|---|---|',
  ...p.claims.map(
    (c) =>
      `| ${c.verdict} | \`${c.id}\` | ${cell(c.declared)} | ${cell(c.observed)} | ${c.reason ?? ''} |`,
  ),
  '',
  ...(reading.length === 0
    ? []
    : ['## Reading this verdict', '', ...reading.flatMap((x) => [x, ''])]),
  '## Not converted',
  '',
  notes.length === 0
    ? 'Nothing in the report asserted a claim the procedure could not declare.'
    : 'Sentences in the report that the procedure did not turn into a declared field (Rule 0):',
  '',
  ...notes.map((x) => `- "${x.text}": ${x.reason}`),
  ...(notes.length === 0 ? [] : ['']),
  '## Re-run',
  '',
  'Offline, from the record alone (recomputes claims, verdict and digests):',
  '',
  '```sh',
  `pnpm run build && node dist/dunstan.mjs verify ${path}`,
  '```',
  '',
  'Online, re-reading the same sources for the recorded block (reports `evidence_changed` if they moved):',
  '',
  '```sh',
  `GITHUB_TOKEN=<read token> node dist/dunstan.mjs rerun ${path}`,
  '```',
  '',
];
writeFileSync(join(DEMO, outDir, 'summary.md'), lines.join('\n'));
process.stdout.write(`wrote demo/2026-10/${outDir}/summary.md (${p.verdict}; ${counts})\n`);

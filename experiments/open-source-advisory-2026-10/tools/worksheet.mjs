// The adjudication worksheet (preregistration.md, "Adjudication protocol" and "Published labels").
//
//   worksheet.mjs build --half dev|test
//     Writes the git-ignored .work/worksheets/<half>.jsonl: one line per advisory to label, for each
//     run of the half that has an index: every advisory in M1's sample (measure M1), and every
//     advisory whose note is differs:<reason> (measure M2). A line shows what the adjudicator may
//     read: the clause, the claim, the record's observed value and note (M2 only: an M1 line is
//     judged from the report, so it does not show what the record says), the record's path, the
//     body's path and the pull request's page. Labels already in the worksheet are kept.
//
//   worksheet.mjs publish --half dev|test
//     Writes labels/<half>.jsonl from the worksheet's labelled lines: pr, advisoryId, clause offsets,
//     measure, label and adjudicatedAt, and no text. A published label is never changed.
//
// The adjudicator fills `label` and `adjudicatedAt` (UTC, ISO 8601) in the worksheet by hand.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIFFERS,
  flags,
  HALVES,
  INSTRUMENTS,
  isMain,
  LABELS,
  paths,
  readJson,
  readJsonl,
  runName,
  writeJsonl,
} from './common.mjs';

const lineKey = (l) => `${l.advisoryId}\n${l.measure}`;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function buildWorksheet({ half, p = paths() }) {
  if (!HALVES.includes(half)) throw new Error(`--half ${half}`);
  const lines = [];
  for (const instrument of INSTRUMENTS) {
    const run = runName(instrument, half);
    const indexPath = join(p.runs, `${run}.json`);
    if (!existsSync(indexPath)) continue;
    const index = readJson(indexPath);
    const samplePath = join(p.samples, `${run}.m1.json`);
    if (!existsSync(samplePath))
      throw new Error(`samples/${run}.m1.json does not exist: run sample.mjs`);
    const sampled = new Set(readJson(samplePath).advisoryIds);
    const seal = readJson(join(p.runs, `${run}.seal.json`));
    const files = new Map(seal.records.map((r) => [r.pr, r.file]));
    for (const pr of index.prs) {
      const recordPath = join(p.records, run, files.get(pr.pr));
      const record = JSON.parse(readFileSync(recordPath, 'utf8'));
      const [owner, rest] = pr.pr.split('/');
      const [repo, number] = rest.split('#');
      pr.advisories.forEach((a, i) => {
        const full = record.predicate.advisory.advisories[i];
        const common = {
          pr: pr.pr,
          advisoryId: a.advisoryId,
          clause: a.clause,
          clauseText: full.clause,
          kind: full.kind,
          value: full.value,
          record: recordPath,
          body: join(p.bodies, `${owner}-${repo}-${number}.md`),
          page: `https://github.com/${owner}/${repo}/pull/${number}`,
        };
        if (sampled.has(a.advisoryId)) {
          lines.push({
            ...common,
            measure: 'M1',
            allowed: LABELS.M1,
            label: null,
            adjudicatedAt: null,
          });
        }
        if (DIFFERS(a.note)) {
          lines.push({
            ...common,
            measure: 'M2',
            note: full.note,
            observed: full.observed,
            allowed: LABELS.M2,
            label: null,
            adjudicatedAt: null,
          });
        }
      });
    }
  }
  // The same claim from the same clause in another run of the half: shown, so it is labelled alike.
  const claimKey = (l) => JSON.stringify([l.pr, l.kind, l.value, l.clause, l.measure]);
  for (const l of lines) {
    l.sameAs = lines.filter((o) => o !== l && claimKey(o) === claimKey(l)).map((o) => o.advisoryId);
  }
  mkdirSync(p.worksheets, { recursive: true });
  const path = join(p.worksheets, `${half}.jsonl`);
  const kept = new Map(readJsonl(path).map((l) => [lineKey(l), l]));
  for (const l of lines) {
    const old = kept.get(lineKey(l));
    if (old !== undefined) {
      l.label = old.label;
      l.adjudicatedAt = old.adjudicatedAt;
    }
  }
  writeJsonl(path, lines);
  return { path, lines };
}

export function publishLabels({ half, p = paths() }) {
  if (!HALVES.includes(half)) throw new Error(`--half ${half}`);
  const sheet = join(p.worksheets, `${half}.jsonl`);
  if (!existsSync(sheet)) throw new Error(`no worksheet for ${half}: run worksheet.mjs build`);
  const labelled = [];
  let open = 0;
  for (const l of readJsonl(sheet)) {
    if (l.label === null || l.label === undefined) {
      open++;
      continue;
    }
    if (!LABELS[l.measure]?.includes(l.label)) {
      throw new Error(
        `${l.advisoryId} ${l.measure}: label ${JSON.stringify(l.label)} is not one of ${LABELS[l.measure]}`,
      );
    }
    if (typeof l.adjudicatedAt !== 'string' || !ISO.test(l.adjudicatedAt)) {
      throw new Error(`${l.advisoryId} ${l.measure}: adjudicatedAt must be a UTC ISO 8601 time`);
    }
    labelled.push({
      pr: l.pr,
      advisoryId: l.advisoryId,
      clause: l.clause,
      measure: l.measure,
      label: l.label,
      adjudicatedAt: l.adjudicatedAt,
    });
  }
  // An advisory labelled under both measures is one judgement of whether the clause makes the
  // claim: not_real under M1 exactly when not_a_claim under M2.
  const m1 = new Map(
    labelled.filter((l) => l.measure === 'M1').map((l) => [l.advisoryId, l.label]),
  );
  for (const l of labelled.filter((x) => x.measure === 'M2' && m1.has(x.advisoryId))) {
    if ((m1.get(l.advisoryId) === 'not_real') !== (l.label === 'not_a_claim')) {
      throw new Error(
        `${l.advisoryId}: M1 ${m1.get(l.advisoryId)} and M2 ${l.label} disagree on whether it is a claim`,
      );
    }
  }
  const out = join(p.labels, `${half}.jsonl`);
  const published = new Map(readJsonl(out).map((l) => [lineKey(l), l]));
  for (const l of labelled) {
    const old = published.get(lineKey(l));
    if (old !== undefined && JSON.stringify(old) !== JSON.stringify(l)) {
      throw new Error(`${l.advisoryId} ${l.measure}: a published label is never changed`);
    }
  }
  const fresh = new Set(labelled.map(lineKey));
  const dropped = [...published.keys()].filter((k) => !fresh.has(k));
  if (dropped.length > 0) throw new Error(`a published label is never withdrawn: ${dropped[0]}`);
  mkdirSync(p.labels, { recursive: true });
  writeJsonl(out, labelled);
  return { path: out, labelled: labelled.length, open };
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = flags(rest);
  if (command === 'build') {
    const { path, lines } = buildWorksheet({ half: args.half });
    const open = lines.filter((l) => l.label === null).length;
    process.stdout.write(`${path}: ${lines.length} line(s), ${open} to label\n`);
  } else if (command === 'publish') {
    const { path, labelled, open } = publishLabels({ half: args.half });
    process.stdout.write(`${path}: ${labelled} label(s); ${open} line(s) still to label\n`);
  } else {
    process.stderr.write('usage: worksheet.mjs build|publish --half dev|test\n');
    process.exit(3);
  }
}

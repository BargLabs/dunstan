// The adjudication worksheet and the published labels (preregistration.md, "Labels").
//
//   worksheet.mjs build
//     Writes the git-ignored .work/worksheets/labels.jsonl: one line per advisory in M1's sample
//     (measure M1), and one per advisory whose baseline note is differs:<reason> (measure M2, the
//     superset of the candidate's differs). A line shows what the adjudicator may read: the clause,
//     the claim, the record's path, the body's path and the pull request's page; an M2 line also
//     shows the baseline's note and observed value. No line shows the candidate's note or what the
//     path query answered, so no label is written knowing which advisories 0.3.0 keeps. An M1 line
//     shows no note at all: it is judged from the report. Labels already in the worksheet are kept.
//
//   worksheet.mjs publish
//     Writes labels/labels.jsonl from the worksheet's labelled lines: pr, advisoryId, clause
//     offsets, measure, label and adjudicatedAt, and no text. A published label is never changed or
//     withdrawn.
//
// Adapted from study 1's tools/worksheet.mjs (experiments/open-source-advisory-2026-10/tools/
// worksheet.mjs): one index and one label file in place of one per run and half, M2 drawn from the
// baseline's notes, and the candidate's notes withheld. The adjudicator fills `label` and
// `adjudicatedAt` (UTC, ISO 8601) by hand.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIFFERS,
  flags,
  isMain,
  LABELS,
  paths,
  readJson,
  readJsonl,
  writeJsonl,
} from './common.mjs';

const lineKey = (l) => `${l.advisoryId}\n${l.measure}`;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function buildWorksheet({ p = paths() } = {}) {
  if (!existsSync(p.index)) throw new Error('runs/index.json does not exist: run run.mjs index');
  if (!existsSync(p.sample)) throw new Error('samples/m1.json does not exist: run sample.mjs');
  const index = readJson(p.index);
  const sampled = new Set(readJson(p.sample).advisoryIds);
  const seal = readJson(p.seal('baseline'));
  const files = new Map(seal.records.map((r) => [r.pr, r.file]));
  const lines = [];
  for (const pr of index.prs) {
    const recordPath = join(p.records, 'baseline', files.get(pr.pr));
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
      if (DIFFERS(a.notes.baseline)) {
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
  mkdirSync(p.worksheets, { recursive: true });
  const kept = new Map(readJsonl(p.worksheet).map((l) => [lineKey(l), l]));
  for (const l of lines) {
    const old = kept.get(lineKey(l));
    if (old !== undefined) {
      l.label = old.label;
      l.adjudicatedAt = old.adjudicatedAt;
    }
  }
  writeJsonl(p.worksheet, lines);
  return { path: p.worksheet, lines };
}

export function publishLabels({ p = paths() } = {}) {
  if (!existsSync(p.worksheet)) throw new Error('no worksheet: run worksheet.mjs build');
  const labelled = [];
  let open = 0;
  for (const l of readJsonl(p.worksheet)) {
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
  const published = new Map(readJsonl(p.labelFile).map((l) => [lineKey(l), l]));
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
  writeJsonl(p.labelFile, labelled);
  return { path: p.labelFile, labelled: labelled.length, open };
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  flags(rest);
  if (command === 'build') {
    const { path, lines } = buildWorksheet();
    const open = lines.filter((l) => l.label === null).length;
    process.stdout.write(`${path}: ${lines.length} line(s), ${open} to label\n`);
  } else if (command === 'publish') {
    const { path, labelled, open } = publishLabels();
    process.stdout.write(`${path}: ${labelled} label(s); ${open} line(s) still to label\n`);
  } else {
    process.stderr.write('usage: worksheet.mjs build|publish\n');
    process.exit(3);
  }
}

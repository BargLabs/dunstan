// The adjudication worksheets and the published labels (preregistration.md, "Labels" and "Separate
// scoring"; "Order of work", step 4).
//
//   worksheet.mjs build
//     Writes three worksheets under the git-ignored .work/worksheets/, from runs/index.json, the
//     sealed records and the samples:
//     - m2.jsonl, one line per advisory whose note is differs:<reason> (measure M2), in index order.
//       A line shows the clause, the claim, the record's note and observed value, the record's path,
//       the body's path and the pull request's page. Nothing shows which advisories are primary.
//     - m1.jsonl, one line per advisory of M1's sample (measure M1). It shows the clause and the
//       claim, and neither the note, the observed value nor the record: it is judged from the
//       report.
//     - work-done.jsonl, one line per pull request with at least one primary advisory: the body's
//       path and the page, and nothing of its advisories, so it is labelled apart from them. Every
//       pull request with a differs advisory has a primary one, so the list shows nothing of the
//       draw that m2.jsonl does not.
//     Labels already in a worksheet are kept.
//
//   worksheet.mjs publish
//     Writes labels/labels.jsonl, one object per line and measure (pr, advisoryId, clause offsets or
//     null, measure, label, adjudicatedAt, and for a reference_closes advisory its spec 0.1.4
//     section 7.4 row as closesRow), and labels/work-done.jsonl (pr, label, adjudicatedAt). Refuses,
//     writing nothing: a label missing from any line the measures need; a label outside its set; an
//     advisory labelled under both measures whose not_real and not_a_claim disagree; a "work done"
//     label not written after every M2 label of its pull request; and any text in the output.
//     Published labels are final: it refuses when either file exists.
//
// Adapted from study 2's tools/worksheet.mjs (experiments/open-source-advisory-2026-10-study2/
// tools/worksheet.mjs). The adjudicator fills `label` and `adjudicatedAt` (UTC, ISO 8601) by hand.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DIFFERS,
  fileStem,
  flags,
  isMain,
  LABELS,
  paths,
  readJson,
  readJsonl,
  SIGNING_DATE,
  sha256,
  WORK_DONE,
  writeJsonl,
} from './common.mjs';
import { drawM1, drawPrimary } from './sample.mjs';

const CLOSES = 'reference_closes';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const PR = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+#[1-9]\d*$/;
const lineKey = (l) => `${l.advisoryId}\n${l.measure}`;

const splitPr = (name) => {
  const [repository, number] = name.split('#');
  return { repository, number: Number(number) };
};
const page = (name) => {
  const { repository, number } = splitPr(name);
  return `https://github.com/${repository}/pull/${number}`;
};

// The index and the samples, each sample checked against what its seed draws.
function opened(p, signed) {
  if (!existsSync(p.index)) throw new Error('runs/index.json does not exist: run run.mjs index');
  for (const [path, name] of [
    [p.primary, 'samples/primary.json'],
    [p.m1, 'samples/m1.json'],
  ]) {
    if (!existsSync(path)) throw new Error(`${name} does not exist: run sample.mjs`);
  }
  const index = readJson(p.index);
  const primary = readJson(p.primary);
  const m1 = readJson(p.m1);
  if (JSON.stringify(primary) !== JSON.stringify(drawPrimary(index, signed))) {
    throw new Error('samples/primary.json differs from what its seed draws');
  }
  if (JSON.stringify(m1) !== JSON.stringify(drawM1(index, signed))) {
    throw new Error('samples/m1.json differs from what its seed draws');
  }
  return { index, primary, m1 };
}

// What each measure needs labelled: the M2 and M1 advisories, and the "work done" pull requests.
function needed({ index, primary, m1 }) {
  const sampled = new Set(m1.advisoryIds);
  const advisories = new Map();
  const m2 = [];
  const inM1 = [];
  for (const pr of index.prs) {
    for (const a of pr.advisories) {
      advisories.set(a.advisoryId, { ...a, pr: pr.pr });
      if (DIFFERS(a.note)) m2.push(a.advisoryId);
      if (sampled.has(a.advisoryId)) inM1.push(a.advisoryId);
    }
  }
  const workDone = [...new Set(primary.primary.map((x) => x.pr))];
  return { advisories, M2: m2, M1: inM1, workDone };
}

export function buildWorksheets({ p = paths(), signed = SIGNING_DATE } = {}) {
  const open = opened(p, signed);
  const need = needed(open);
  const seal = readJson(p.seal);
  const sealed = new Map(seal.records.map((r) => [r.pr, r]));
  const records = new Map();
  const recordOf = (name) => {
    if (!records.has(name)) {
      const entry = sealed.get(name);
      if (entry?.file === undefined) throw new Error(`${name} has no sealed record`);
      const path = join(p.records, entry.file);
      const bytes = readFileSync(path);
      if (sha256(bytes) !== entry.sha256) {
        throw new Error(`${entry.file} is not the record the seal holds`);
      }
      records.set(name, { path, record: JSON.parse(bytes.toString('utf8')) });
    }
    return records.get(name);
  };
  const shown = (id) => {
    const a = need.advisories.get(id);
    const { path, record } = recordOf(a.pr);
    const i = Number(id.slice(id.lastIndexOf(':') + 1));
    const full = record.predicate.advisory.advisories[i];
    if (full?.kind !== a.kind || full?.note !== a.note) {
      throw new Error(`${id}: the record does not hold the advisory the index holds`);
    }
    return { a, full, path };
  };
  const body = (name) => join(p.bodies, `${fileStem(splitPr(name))}.md`);
  const unlabelled = { label: null, adjudicatedAt: null };

  const sheets = {
    M2: need.M2.map((id) => {
      const { a, full, path } = shown(id);
      return {
        measure: 'M2',
        pr: a.pr,
        advisoryId: id,
        clause: a.clause,
        clauseText: full.clause,
        kind: a.kind,
        value: full.value,
        note: full.note,
        observed: full.observed,
        ...(a.kind === CLOSES ? { closesRow: a.closesRow } : {}),
        record: path,
        body: body(a.pr),
        page: page(a.pr),
        allowed: LABELS.M2,
        ...unlabelled,
      };
    }),
    M1: need.M1.map((id) => {
      const { a, full } = shown(id);
      return {
        measure: 'M1',
        pr: a.pr,
        advisoryId: id,
        clause: a.clause,
        clauseText: full.clause,
        kind: a.kind,
        value: full.value,
        body: body(a.pr),
        page: page(a.pr),
        allowed: LABELS.M1,
        ...unlabelled,
      };
    }),
    workDone: need.workDone.map((name) => ({
      pr: name,
      body: body(name),
      page: page(name),
      allowed: WORK_DONE,
      ...unlabelled,
    })),
  };
  mkdirSync(p.worksheets, { recursive: true });
  for (const [name, lines] of Object.entries(sheets)) {
    const key = name === 'workDone' ? (l) => l.pr : lineKey;
    const kept = new Map(readJsonl(p.sheets[name]).map((l) => [key(l), l]));
    for (const l of lines) {
      const old = kept.get(key(l));
      if (old !== undefined) {
        l.label = old.label;
        l.adjudicatedAt = old.adjudicatedAt;
      }
    }
    writeJsonl(p.sheets[name], lines);
  }
  return { paths: p.sheets, sheets };
}

const isOffset = (n) => Number.isInteger(n) && n >= 0;

// Why a published row holds something other than names, numbers and offsets, or null. Every field
// is from a closed set, so no copied text can pass.
export function outputFault(row) {
  const keys = Object.keys(row);
  if ('measure' in row) {
    const want = ['pr', 'advisoryId', 'clause', 'measure', 'label', 'adjudicatedAt'];
    const extra = keys.filter((k) => !want.includes(k) && k !== 'closesRow');
    if (extra.length > 0) return `field ${extra[0]}`;
    if (want.some((k) => !(k in row))) return 'a field is missing';
    if (!LABELS[row.measure]) return 'measure';
    if (!LABELS[row.measure].includes(row.label)) return 'label';
    if (typeof row.advisoryId !== 'string' || !row.advisoryId.startsWith(`${row.pr}:`)) {
      return 'advisoryId';
    }
    if (!/^(0|[1-9]\d*)$/.test(row.advisoryId.slice(String(row.pr).length + 1))) {
      return 'advisoryId';
    }
    const c = row.clause;
    if (c !== null) {
      if (typeof c !== 'object' || Array.isArray(c)) return 'clause';
      if (Object.keys(c).sort().join() !== 'end,start') return 'clause';
      if (!isOffset(c.start) || !isOffset(c.end) || c.start > c.end) return 'clause';
    }
    if ('closesRow' in row && row.closesRow !== null) {
      if (!Number.isInteger(row.closesRow) || row.closesRow < 1 || row.closesRow > 8) {
        return 'closesRow';
      }
    }
  } else {
    const extra = keys.filter((k) => !['pr', 'label', 'adjudicatedAt'].includes(k));
    if (extra.length > 0) return `field ${extra[0]}`;
    if (!WORK_DONE.includes(row.label)) return 'label';
  }
  if (typeof row.pr !== 'string' || !PR.test(row.pr)) return 'pr';
  if (typeof row.adjudicatedAt !== 'string' || !ISO.test(row.adjudicatedAt)) {
    return 'adjudicatedAt';
  }
  return null;
}

export function publishLabels({ p = paths(), signed = SIGNING_DATE } = {}) {
  for (const path of [p.labelFile, p.workDoneFile]) {
    if (existsSync(path)) {
      throw new Error(`${relative(p.dir, path)} exists: published labels are final`);
    }
  }
  const open = opened(p, signed);
  const need = needed(open);
  for (const name of ['M2', 'M1', 'workDone']) {
    if (!existsSync(p.sheets[name])) throw new Error('no worksheet: run worksheet.mjs build');
  }

  // Every line a measure needs, labelled from its set, and no other line.
  const check = (lines, want, key, allowed, what) => {
    const got = new Map();
    for (const l of lines) {
      const k = key(l);
      if (!want.includes(k)) throw new Error(`${what} ${k}: no measure needs it`);
      if (got.has(k)) throw new Error(`${what} ${k}: labelled twice`);
      got.set(k, l);
    }
    for (const k of want) {
      const l = got.get(k);
      if (l === undefined || l.label === null || l.label === undefined) {
        throw new Error(`${what} ${k}: missing label; nothing is published`);
      }
      if (!allowed.includes(l.label)) {
        throw new Error(`${what} ${k}: label ${JSON.stringify(l.label)} is not one of ${allowed}`);
      }
      if (typeof l.adjudicatedAt !== 'string' || !ISO.test(l.adjudicatedAt)) {
        throw new Error(`${what} ${k}: adjudicatedAt must be a UTC ISO 8601 time`);
      }
    }
    return want.map((k) => got.get(k));
  };
  const byId = (l) => l.advisoryId;
  const m2 = check(readJsonl(p.sheets.M2), need.M2, byId, LABELS.M2, 'M2');
  const m1 = check(readJsonl(p.sheets.M1), need.M1, byId, LABELS.M1, 'M1');
  const done = check(
    readJsonl(p.sheets.workDone),
    need.workDone,
    (l) => l.pr,
    WORK_DONE,
    'work done',
  );

  // One judgement per advisory: not_real under M1 exactly when not_a_claim under M2.
  const m1Label = new Map(m1.map((l) => [l.advisoryId, l.label]));
  for (const l of m2.filter((x) => m1Label.has(x.advisoryId))) {
    if ((m1Label.get(l.advisoryId) === 'not_real') !== (l.label === 'not_a_claim')) {
      throw new Error(
        `${l.advisoryId}: M1 ${m1Label.get(l.advisoryId)} and M2 ${l.label} disagree on whether it is a claim`,
      );
    }
  }
  // "Work done" is written after and apart from the pull request's report-accurate labels.
  for (const l of done) {
    const before = m2.filter(
      (x) =>
        need.advisories.get(x.advisoryId).pr === l.pr &&
        Date.parse(x.adjudicatedAt) >= Date.parse(l.adjudicatedAt),
    );
    if (before.length > 0) {
      throw new Error(
        `work done ${l.pr}: labelled at ${l.adjudicatedAt}, not after its M2 label of ${before[0].advisoryId}`,
      );
    }
  }

  const row = (l) => ({
    pr: l.pr,
    advisoryId: l.advisoryId,
    clause: l.clause,
    measure: l.measure,
    label: l.label,
    adjudicatedAt: l.adjudicatedAt,
    ...(need.advisories.get(l.advisoryId).kind === CLOSES
      ? { closesRow: need.advisories.get(l.advisoryId).closesRow }
      : {}),
  });
  const labels = [...m2, ...m1].map(row);
  const workDone = done.map((l) => ({ pr: l.pr, label: l.label, adjudicatedAt: l.adjudicatedAt }));
  for (const r of [...labels, ...workDone]) {
    const fault = outputFault(r);
    if (fault !== null) {
      throw new Error(
        `${r.advisoryId ?? r.pr}: ${fault} is not a name, number or offset; no text is published`,
      );
    }
  }
  // The published names and offsets are the index's, whatever a worksheet line was edited to.
  for (const r of labels) {
    const a = need.advisories.get(r.advisoryId);
    if (r.pr !== a.pr || JSON.stringify(r.clause) !== JSON.stringify(a.clause)) {
      throw new Error(`${r.advisoryId}: the worksheet's pr or clause is not the index's`);
    }
  }
  mkdirSync(p.labels, { recursive: true });
  writeJsonl(p.labelFile, labels);
  writeJsonl(p.workDoneFile, workDone);
  return { labels, workDone };
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  flags(rest);
  if (command === 'build') {
    const { sheets } = buildWorksheets();
    const open = Object.values(sheets)
      .flat()
      .filter((l) => l.label === null).length;
    process.stdout.write(
      `.work/worksheets/: M2 ${sheets.M2.length}, M1 ${sheets.M1.length}, work done ${sheets.workDone.length} line(s); ${open} to label\n`,
    );
  } else if (command === 'publish') {
    const { labels, workDone } = publishLabels();
    process.stdout.write(
      `labels/labels.jsonl: ${labels.length} label(s); labels/work-done.jsonl: ${workDone.length}\n`,
    );
  } else {
    process.stderr.write('usage: worksheet.mjs build|publish\n');
    process.exit(3);
  }
}

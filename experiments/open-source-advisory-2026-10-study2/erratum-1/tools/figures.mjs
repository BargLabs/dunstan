// Study 2's figures twice: (i) with the published labels and (ii) with the operator's rulings in
// their place, each with a pull-request-level sensitivity.
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/erratum-1/tools/figures.mjs published
//     (i) only: recomputes study 2's figures from runs/index.json, samples/m1.json and
//     labels/labels.jsonl with study 2's own computeFigures, checks that they are
//     figures/figures.json byte for byte, and prints the published sensitivity. Writes nothing.
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/erratum-1/tools/figures.mjs
//     (i) and (ii): refuses while any worksheet line that needs a ruling has none, while a line that
//     needs none has one, and while any line differs from what worksheet.mjs computes from
//     closers.json except in its ruling. Each ruling takes the place of its advisory's published M2
//     label; nothing else changes. Writes erratum-1/figures.json, refusing to overwrite it, and
//     prints the erratum's figure table.
//
// The measures are study 2's: M1, M2's false_claim share among differs and M3 for each instrument,
// and LOST, each with its Wilson 95% interval. The sensitivity, for each label set: every measure
// with replicate/cog#3063 removed; for each measure, its minimum and maximum over leaving out each
// pull request in turn; and, for each instrument, the share of its genuine catches (differs
// labelled false_claim) that the single largest pull request contributes.

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { computeFigures } from '../../tools/figures.mjs';
import {
  DIFFERS,
  DOMINANT_PR,
  flags,
  isMain,
  LABELS,
  paths,
  readJson,
  readJsonl,
  sha256,
  share,
  writeJson,
} from './common.mjs';
import { worksheetLines } from './worksheet.mjs';

const TOOL = 'experiments/open-source-advisory-2026-10-study2/erratum-1/tools/figures.mjs';
const INSTRUMENTS = ['baseline', 'candidate'];

export class MissingRulings extends Error {
  constructor(missing) {
    super(`${missing.length} ruling(s) missing; (ii) is not computed:\n${missing.join('\n')}`);
    this.missing = missing;
  }
}

const pick = ({ k, n, value, wilson95 }) => ({ k, n, value, wilson95 });

// The measures, by name, as they are read from a computeFigures result.
export const MEASURES = Object.freeze([
  ['M1', (f) => f.M1],
  ['baseline M2 false_claim', (f) => f.baseline.M2.false_claim],
  ['baseline M3', (f) => f.baseline.M3],
  ['candidate M2 false_claim', (f) => f.candidate.M2.false_claim],
  ['candidate M3', (f) => f.candidate.M3],
  ['LOST', (f) => f.LOST],
]);

export const measures = (f) =>
  Object.fromEntries(MEASURES.map(([name, get]) => [name, pick(get(f))]));

// The inputs with one pull request removed: its advisories, its sampled advisories and its labels.
export function withoutPr({ index, sample, labels }, pr) {
  const prOf = (id) => id.slice(0, id.lastIndexOf(':'));
  return {
    index: { ...index, prs: index.prs.filter((x) => x.pr !== pr) },
    sample: { ...sample, advisoryIds: sample.advisoryIds.filter((id) => prOf(id) !== pr) },
    labels: labels.filter((l) => prOf(l.advisoryId) !== pr),
  };
}

export function sensitivity(inputs, dominantPr = DOMINANT_PR) {
  if (!inputs.index.prs.some((x) => x.pr === dominantPr)) {
    throw new Error(`${dominantPr} is not in the index`);
  }
  const dominant = {
    pr: dominantPr,
    measures: measures(computeFigures(withoutPr(inputs, dominantPr))),
  };

  const left = inputs.index.prs.map((x) => ({
    pr: x.pr,
    m: measures(computeFigures(withoutPr(inputs, x.pr))),
  }));
  const extreme = (name, lower) => {
    const values = left.filter((x) => x.m[name].value !== null);
    if (values.length === 0) return null;
    const best = values.reduce((a, x) =>
      lower
        ? x.m[name].value < a.m[name].value
          ? x
          : a
        : x.m[name].value > a.m[name].value
          ? x
          : a,
    );
    const ties = values.filter((x) => x.m[name].value === best.m[name].value).length;
    return { ...best.m[name], pr: best.pr, ties };
  };
  const leaveOneOut = Object.fromEntries(
    MEASURES.map(([name]) => [name, { min: extreme(name, true), max: extreme(name, false) }]),
  );

  const m2 = new Map(
    inputs.labels.filter((l) => l.measure === 'M2').map((l) => [l.advisoryId, l.label]),
  );
  const largestContributor = Object.fromEntries(
    INSTRUMENTS.map((name) => {
      const byPr = inputs.index.prs.map((x) => ({
        pr: x.pr,
        k: x.advisories.filter(
          (a) => DIFFERS(a.notes[name]) && m2.get(a.advisoryId) === 'false_claim',
        ).length,
      }));
      const total = byPr.reduce((s, x) => s + x.k, 0);
      const top = byPr.reduce((a, x) => (x.k > a.k ? x : a), byPr[0]);
      return [
        name,
        {
          pr: total === 0 ? null : top.pr,
          ties: total === 0 ? null : byPr.filter((x) => x.k === top.k).length,
          ...share(total === 0 ? 0 : top.k, total),
        },
      ];
    }),
  );

  return {
    all: measures(computeFigures(inputs)),
    withoutDominant: dominant,
    leaveOneOut: { prs: left.length, ...leaveOneOut },
    largestContributor,
  };
}

const studyInputs = (p) => ({
  index: readJson(p.index),
  sample: readJson(p.sample),
  labels: readJsonl(p.labelFile),
});

// (i): study 2's figures from the published labels, and whether they are figures/figures.json byte
// for byte.
export function publishedFigures({ p = paths() } = {}) {
  const inputs = studyInputs(p);
  const figures = computeFigures(inputs);
  const text = `${JSON.stringify(figures, null, 2)}\n`;
  const published = readFileSync(p.figureFile, 'utf8');
  return { inputs, figures, reproduced: text === published, sha256: sha256(published) };
}

// The labels with each ruling in place of its advisory's published M2 label. Refuses a missing
// ruling, a ruling where none is needed, a ruling that is not an M2 label, and a ruling that
// disagrees with the advisory's M1 label on whether it is a claim.
export function ruledLabels({ labels, lines }) {
  const missing = [];
  const rulings = new Map();
  for (const l of lines) {
    if (!l.needsRuling) {
      if (l.ruling !== null) throw new Error(`${l.advisoryId}: a ruling where none is needed`);
      continue;
    }
    if (l.ruling === null || l.ruling === undefined) {
      missing.push(l.advisoryId);
      continue;
    }
    if (!LABELS.M2.includes(l.ruling)) {
      throw new Error(
        `${l.advisoryId}: ruling ${JSON.stringify(l.ruling)} is not one of ${LABELS.M2}`,
      );
    }
    rulings.set(l.advisoryId, l.ruling);
  }
  if (missing.length > 0) throw new MissingRulings(missing);
  const m1 = new Map(labels.filter((l) => l.measure === 'M1').map((l) => [l.advisoryId, l.label]));
  for (const [id, ruling] of rulings) {
    if (m1.has(id) && (m1.get(id) === 'not_real') !== (ruling === 'not_a_claim')) {
      throw new Error(
        `${id}: M1 ${m1.get(id)} and the ruling ${ruling} disagree on whether it is a claim`,
      );
    }
  }
  const changed = [];
  const ruled = labels.map((l) => {
    if (l.measure !== 'M2' || !rulings.has(l.advisoryId)) return l;
    const to = rulings.get(l.advisoryId);
    if (to !== l.label) changed.push({ advisoryId: l.advisoryId, from: l.label, to });
    return { ...l, label: to };
  });
  return { labels: ruled, rulings: rulings.size, changed };
}

// The worksheet as the operator left it, checked against what worksheet.mjs computes.
function ruledLines(p, inputs) {
  const closers = readJson(p.closers);
  const lines = readJsonl(p.worksheetRows);
  const expected = worksheetLines({ index: inputs.index, labels: inputs.labels, closers });
  if (lines.length !== expected.length) {
    throw new Error(
      `worksheet.jsonl has ${lines.length} line(s); closers.json makes ${expected.length}`,
    );
  }
  lines.forEach((l, i) => {
    if (JSON.stringify({ ...l, ruling: null }) !== JSON.stringify(expected[i])) {
      throw new Error(
        `worksheet.jsonl line ${i + 1} (${l.advisoryId}) differs other than in its ruling`,
      );
    }
  });
  return lines;
}

export function writeErratumFigures({ p = paths(), dominantPr = DOMINANT_PR } = {}) {
  if (existsSync(p.erratumFigures)) {
    throw new Error(`${relative(p.dir, p.erratumFigures)} exists; the figures are never redone`);
  }
  const published = publishedFigures({ p });
  if (!published.reproduced) throw new Error('(i) does not reproduce figures/figures.json');
  for (const path of [p.closers, p.worksheetRows]) {
    if (!existsSync(path)) throw new Error(`${relative(p.dir, path)} does not exist`);
  }
  const lines = ruledLines(p, published.inputs);
  const ruled = ruledLabels({ labels: published.inputs.labels, lines });
  const ruledInputs = { ...published.inputs, labels: ruled.labels };
  const digest = (path) => sha256(readFileSync(path));
  const out = {
    tool: TOOL,
    inputs: {
      index: digest(p.index),
      sample: digest(p.sample),
      labels: digest(p.labelFile),
      closers: digest(p.closers),
      worksheet: digest(p.worksheetRows),
    },
    published: { path: 'figures/figures.json', sha256: published.sha256, reproduced: true },
    rulings: { ruled: ruled.rulings, changed: ruled.changed },
    ruled: computeFigures(ruledInputs),
    sensitivity: {
      published: sensitivity(published.inputs, dominantPr),
      ruled: sensitivity(ruledInputs, dominantPr),
    },
  };
  writeJson(p.erratumFigures, out);
  return out;
}

const cell = (s) =>
  s.value === null ? 'n/a' : `${s.value} (${s.k}/${s.n}, ${s.wilson95.low}–${s.wilson95.high})`;

// The erratum's figure table: each measure under each label set, with and without the dominant pull
// request.
export function figureTable(sets) {
  const names = Object.keys(sets);
  const without = (n) => `${n}, without ${sets[n].withoutDominant.pr}`;
  const head = `| measure | ${names.flatMap((n) => [n, without(n)]).join(' | ')} |`;
  const rule = `|---|${names.flatMap(() => ['---', '---']).join('|')}|`;
  const rows = MEASURES.map(
    ([name]) =>
      `| ${name} | ${names
        .flatMap((n) => [cell(sets[n].all[name]), cell(sets[n].withoutDominant.measures[name])])
        .join(' | ')} |`,
  );
  return [head, rule, ...rows].join('\n');
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  flags(rest);
  if (command === 'published') {
    const { inputs, reproduced } = publishedFigures();
    process.stdout.write(
      `(i) ${reproduced ? 'reproduces' : 'DOES NOT reproduce'} figures/figures.json byte for byte\n\n`,
    );
    const s = sensitivity(inputs);
    process.stdout.write(`${figureTable({ published: s })}\n\n`);
    process.stdout.write(
      `${JSON.stringify({ largestContributor: s.largestContributor }, null, 2)}\n`,
    );
    if (!reproduced) process.exit(1);
  } else if (command === undefined) {
    try {
      const f = writeErratumFigures();
      process.stdout.write(
        `${figureTable(f.sensitivity)}\n\n${f.rulings.ruled} ruling(s), ${f.rulings.changed.length} changed from the published label\n`,
      );
    } catch (e) {
      if (!(e instanceof MissingRulings)) throw e;
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write('usage: figures.mjs [published]\n');
    process.exit(3);
  }
}

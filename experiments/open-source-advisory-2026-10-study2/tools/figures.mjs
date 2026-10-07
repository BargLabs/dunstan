// M1, M2, M3 and LOST for both instruments, the three-part bar and the refutation tests
// (preregistration.md, "Measures", "The mismatch bar" and "What would refute it").
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/tools/figures.mjs
//
// Reads runs/index.json, samples/m1.json and labels/labels.jsonl, and writes figures/figures.json.
// Refuses, computing nothing, if any advisory the measures need has no label, if a label names an
// advisory the measures do not need, or if one is labelled twice.
//
// Adapted from study 1's tools/figures.mjs (experiments/open-source-advisory-2026-10/tools/
// figures.mjs): one index holds both instruments' notes and one set of labels serves both; LOST,
// the third condition of the bar and the refutation tests are study 2's.

import { existsSync, mkdirSync } from 'node:fs';
import {
  CHECKABLE,
  DIFFERS,
  FILE_DIFFERS,
  flags,
  isMain,
  LABELS,
  NAMES,
  paths,
  readJson,
  readJsonl,
  share,
  writeJson,
} from './common.mjs';

export class MissingLabels extends Error {
  constructor(missing) {
    super(`${missing.length} label(s) missing; no figure is computed:\n${missing.join('\n')}`);
    this.missing = missing;
  }
}

// preregistration.md, "The mismatch bar": decided on the candidate, on these three only.
export const BAR = Object.freeze({
  m3WilsonHighAtMost: 0.05,
  m2FalseClaimShareAtLeast: 0.8,
  lostAtMost: 1,
});

// preregistration.md, "What would refute it": each test with the count it needs to be decided.
export const REFUTE = Object.freeze({
  notAClaim: { shareAtLeast: 0.3, minimum: 5 },
  accusationsAtAFile: { shareAtLeast: 0.5, minimum: 6 },
  falseClaimsLost: { shareAtLeast: 0.5, minimum: 4 },
});

const FALSE_ACCUSATION = (label) => label === 'claim_holds' || label === 'not_a_claim';
const UNANSWERED = (note) => note.startsWith('unanswered:');

function tally(items, key) {
  const out = {};
  for (const x of items) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function refutation(test, k, n) {
  const decidable = n >= test.minimum;
  return {
    ...test,
    ...share(k, n),
    decidable,
    refuted: decidable ? k / n >= test.shareAtLeast : null,
  };
}

export function computeFigures({ index, sample, labels }) {
  const advisories = index.prs.flatMap((pr) => pr.advisories);
  for (const a of advisories) {
    if (DIFFERS(a.notes.candidate) && !DIFFERS(a.notes.baseline)) {
      throw new Error(`${a.advisoryId}: differs under the candidate only; the index is not sound`);
    }
  }
  const needed = new Set();
  for (const id of sample.advisoryIds) needed.add(`${id}\nM1`);
  for (const a of advisories) if (DIFFERS(a.notes.baseline)) needed.add(`${a.advisoryId}\nM2`);

  const got = new Map();
  for (const l of labels) {
    const key = `${l.advisoryId}\n${l.measure}`;
    if (!needed.has(key))
      throw new Error(`a label for ${l.advisoryId} ${l.measure}, which no measure needs`);
    if (got.has(key)) throw new Error(`${l.advisoryId} ${l.measure} is labelled twice`);
    if (!LABELS[l.measure]?.includes(l.label))
      throw new Error(`${l.advisoryId} ${l.measure}: label ${l.label}`);
    got.set(key, l.label);
  }
  const missing = [...needed].filter((k) => !got.has(k)).map((k) => k.replace('\n', ' '));
  if (missing.length > 0) throw new MissingLabels(missing);
  const m2Label = (a) => got.get(`${a.advisoryId}\nM2`);

  const real = sample.advisoryIds.filter((id) => got.get(`${id}\nM1`) === 'real').length;
  const M1 = share(real, sample.advisoryIds.length);

  const instrument = (name) => {
    const checkable = advisories.filter((a) => CHECKABLE(a.notes[name]));
    const differs = advisories.filter((a) => DIFFERS(a.notes[name]));
    const m2 = (label) => differs.filter((a) => m2Label(a) === label).length;
    const falseAccusations = differs.filter((a) => FALSE_ACCUSATION(m2Label(a))).length;
    return {
      ...index.instruments[name],
      M2: {
        differs: differs.length,
        false_claim: share(m2('false_claim'), differs.length),
        claim_holds: share(m2('claim_holds'), differs.length),
        not_a_claim: share(m2('not_a_claim'), differs.length),
      },
      M3: {
        falseAccusations,
        checkable: checkable.length,
        ...share(falseAccusations, checkable.length),
      },
      descriptive: {
        checkableShare: share(checkable.length, advisories.length),
        prsWithCheckable: share(
          index.prs.filter((pr) => pr.advisories.some((a) => CHECKABLE(a.notes[name]))).length,
          index.prs.length,
        ),
        notes: tally(advisories, (a) => a.notes[name]),
      },
    };
  };
  const instruments = Object.fromEntries(NAMES.map((name) => [name, instrument(name)]));

  // LOST: the baseline's false claims that the candidate notes unanswered.
  const baselineDiffers = advisories.filter((a) => DIFFERS(a.notes.baseline));
  const falseClaims = baselineDiffers.filter((a) => m2Label(a) === 'false_claim');
  const lost = falseClaims.filter((a) => UNANSWERED(a.notes.candidate));
  const LOST = {
    ...share(lost.length, falseClaims.length),
    byNote: tally(lost, (a) => a.notes.candidate),
    advisoryIds: lost.map((a) => a.advisoryId),
  };
  // Descriptive: the baseline's false accusations the candidate notes unanswered.
  const accusations = baselineDiffers.filter((a) => FALSE_ACCUSATION(m2Label(a)));
  const removed = share(
    accusations.filter((a) => UNANSWERED(a.notes.candidate)).length,
    accusations.length,
  );
  // Each baseline file differs, by the candidate's note and the label.
  const fileDiffers = baselineDiffers.filter(
    (a) => a.kind === 'file_changed' && a.notes.baseline === FILE_DIFFERS,
  );
  const transitions = {};
  for (const a of fileDiffers) {
    transitions[a.notes.candidate] ??= {};
    const row = transitions[a.notes.candidate];
    row[m2Label(a)] = (row[m2Label(a)] ?? 0) + 1;
  }

  const c = instruments.candidate;
  const m3Met = c.M3.wilson95 !== null && c.M3.wilson95.high <= BAR.m3WilsonHighAtMost;
  const m2Met =
    c.M2.false_claim.value !== null && c.M2.false_claim.value >= BAR.m2FalseClaimShareAtLeast;
  const lostMet = LOST.k <= BAR.lostAtMost;
  const bar = { ...BAR, m3Met, m2Met, lostMet, met: m3Met && m2Met && lostMet };

  const fileAccusations = fileDiffers.filter((a) => FALSE_ACCUSATION(m2Label(a)));
  const fileFalseClaims = fileDiffers.filter((a) => m2Label(a) === 'false_claim');
  const candidateDiffers = advisories.filter((a) => DIFFERS(a.notes.candidate));
  const refutations = {
    notAClaim: refutation(
      REFUTE.notAClaim,
      candidateDiffers.filter((a) => m2Label(a) === 'not_a_claim').length,
      candidateDiffers.length,
    ),
    accusationsAtAFile: refutation(
      REFUTE.accusationsAtAFile,
      fileAccusations.filter((a) => a.notes.candidate === FILE_DIFFERS).length,
      fileAccusations.length,
    ),
    falseClaimsLost: refutation(
      REFUTE.falseClaimsLost,
      fileFalseClaims.filter((a) => UNANSWERED(a.notes.candidate)).length,
      fileFalseClaims.length,
    ),
    // 0.3.0 as a remedy: refuted when the candidate makes no fewer false accusations than the
    // baseline, decided only when the baseline makes at least one.
    noFewerAccusations: {
      baseline: instruments.baseline.M3.falseAccusations,
      candidate: c.M3.falseAccusations,
      decidable: instruments.baseline.M3.falseAccusations > 0,
      refuted:
        instruments.baseline.M3.falseAccusations > 0
          ? c.M3.falseAccusations >= instruments.baseline.M3.falseAccusations
          : null,
    },
  };

  const counts = index.prs.map((pr) => pr.advisories.length);
  const sorted = [...counts].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  return {
    pullRequests: index.prs.length,
    errors: index.errors.length,
    faults: index.faults.length,
    descriptive: {
      advisories: advisories.length,
      advisoriesPerPr: {
        mean:
          counts.length === 0 ? null : Math.round((advisories.length / counts.length) * 1e5) / 1e5,
        median,
        max: sorted.length === 0 ? null : sorted[sorted.length - 1],
        histogram: tally(counts, (n) => n),
      },
      bodiesEditedSinceSelection: index.prs.filter((pr) => !pr.reportIsSelectedBody).length,
      falseAccusationsRemoved: removed,
      fileDiffersByCandidateNote: transitions,
    },
    M1,
    baseline: instruments.baseline,
    candidate: instruments.candidate,
    LOST,
    bar,
    refutations,
  };
}

export function writeFigures({ p = paths() } = {}) {
  if (!existsSync(p.index)) throw new Error('runs/index.json does not exist');
  if (!existsSync(p.sample)) throw new Error('samples/m1.json does not exist');
  const figures = computeFigures({
    index: readJson(p.index),
    sample: readJson(p.sample),
    labels: readJsonl(p.labelFile),
  });
  mkdirSync(p.figures, { recursive: true });
  writeJson(p.figureFile, figures);
  return figures;
}

if (isMain(import.meta.url)) {
  flags(process.argv.slice(2));
  try {
    const f = writeFigures();
    const fmt = (s) =>
      s.value === null
        ? 'n/a'
        : `${s.value} (${s.k}/${s.n}, Wilson 95% ${s.wilson95.low}-${s.wilson95.high})`;
    const lines = [
      `${f.pullRequests} PRs, ${f.descriptive.advisories} advisories, ${f.errors} error(s), ${f.faults} identity fault(s)`,
      `M1 precision ${fmt(f.M1)}`,
    ];
    for (const name of NAMES) {
      const x = f[name];
      lines.push(
        `${name}: M2 of ${x.M2.differs} differs: false_claim ${fmt(x.M2.false_claim)}; claim_holds ${fmt(x.M2.claim_holds)}; not_a_claim ${fmt(x.M2.not_a_claim)}`,
        `${name}: M3 false accusations ${fmt(x.M3)}`,
      );
    }
    lines.push(
      `LOST ${fmt(f.LOST)}`,
      `bar ${f.bar.met ? 'met' : 'not met'} (M3 ${f.bar.m3Met}, M2 ${f.bar.m2Met}, LOST ${f.bar.lostMet})`,
    );
    process.stdout.write(`${lines.join('\n')}\n`);
  } catch (e) {
    if (!(e instanceof MissingLabels)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

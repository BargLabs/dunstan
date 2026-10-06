// M1 to M3, the bar and the descriptive figures of one run (preregistration.md, "Measures").
//
//   pnpm exec node experiments/open-source-advisory-2026-10/tools/figures.mjs --instrument <i> --half <h>
//
// Reads runs/<instrument>-<half>.json, its M1 sample and labels/<half>.jsonl, and writes
// figures/<instrument>-<half>.json. Refuses, computing nothing, if any advisory the measures need
// has no label, if a label names an advisory the measures do not need, or if one is labelled twice.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECKABLE,
  DIFFERS,
  flags,
  isMain,
  LABELS,
  paths,
  readJson,
  readJsonl,
  runName,
  share,
  writeJson,
} from './common.mjs';

export class MissingLabels extends Error {
  constructor(missing) {
    super(`${missing.length} label(s) missing; no figure is computed:\n${missing.join('\n')}`);
    this.missing = missing;
  }
}

export const BAR = Object.freeze({ m3WilsonHighAtMost: 0.05, m2FalseClaimShareAtLeast: 0.8 });

export function computeFigures({ index, sample, labels }) {
  const instrument = index.run.split('-')[0];
  const advisories = index.prs.flatMap((pr) => pr.advisories);
  const needed = new Map();
  for (const id of sample.advisoryIds) needed.set(`${id}\nM1`, 'M1');
  for (const a of advisories) if (DIFFERS(a.note)) needed.set(`${a.advisoryId}\nM2`, 'M2');

  const got = new Map();
  for (const l of labels.filter((x) => x.advisoryId.startsWith(`${instrument}:`))) {
    const key = `${l.advisoryId}\n${l.measure}`;
    if (!needed.has(key))
      throw new Error(
        `a label for ${l.advisoryId} ${l.measure}, which no measure of ${index.run} needs`,
      );
    if (got.has(key)) throw new Error(`${l.advisoryId} ${l.measure} is labelled twice`);
    if (!LABELS[l.measure].includes(l.label))
      throw new Error(`${l.advisoryId} ${l.measure}: label ${l.label}`);
    got.set(key, l.label);
  }
  const missing = [...needed.keys()].filter((k) => !got.has(k)).map((k) => k.replace('\n', ' '));
  if (missing.length > 0) throw new MissingLabels(missing);

  const counts = index.prs.map((pr) => pr.advisories.length);
  const perPr = {};
  for (const c of counts) perPr[c] = (perPr[c] ?? 0) + 1;
  const sorted = [...counts].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const checkable = advisories.filter((a) => CHECKABLE(a.note));
  const differs = advisories.filter((a) => DIFFERS(a.note));
  const m2 = (label) => differs.filter((a) => got.get(`${a.advisoryId}\nM2`) === label).length;
  const falseAccusations = m2('claim_holds') + m2('not_a_claim');
  const real = sample.advisoryIds.filter((id) => got.get(`${id}\nM1`) === 'real').length;

  const M1 = share(real, sample.advisoryIds.length);
  const M2 = {
    differs: differs.length,
    false_claim: share(m2('false_claim'), differs.length),
    claim_holds: share(m2('claim_holds'), differs.length),
    not_a_claim: share(m2('not_a_claim'), differs.length),
  };
  const M3 = {
    falseAccusations,
    checkable: checkable.length,
    ...share(falseAccusations, checkable.length),
  };

  // The bar is decided on the fixed instrument's test half only. An empty census meets nothing.
  let bar = { applies: false };
  if (index.run === 'fixed-test') {
    const m3Ok = M3.wilson95 !== null && M3.wilson95.high <= BAR.m3WilsonHighAtMost;
    const m2Ok =
      M2.false_claim.value !== null && M2.false_claim.value >= BAR.m2FalseClaimShareAtLeast;
    bar = { applies: true, ...BAR, m3Met: m3Ok, m2Met: m2Ok, met: m3Ok && m2Ok };
  }

  return {
    run: index.run,
    instrument: index.instrument,
    pullRequests: index.prs.length,
    errors: index.errors.length,
    descriptive: {
      advisories: advisories.length,
      advisoriesPerPr: {
        mean:
          counts.length === 0 ? null : Math.round((advisories.length / counts.length) * 1e5) / 1e5,
        median,
        max: sorted.length === 0 ? null : sorted[sorted.length - 1],
        histogram: perPr,
      },
      checkableShare: share(checkable.length, advisories.length),
      prsWithCheckable: share(
        index.prs.filter((pr) => pr.advisories.some((a) => CHECKABLE(a.note))).length,
        index.prs.length,
      ),
    },
    M1,
    M2,
    M3,
    bar,
  };
}

export function writeFigures({ instrument, half, p = paths() }) {
  const run = runName(instrument, half);
  const indexPath = join(p.runs, `${run}.json`);
  const samplePath = join(p.samples, `${run}.m1.json`);
  if (!existsSync(indexPath)) throw new Error(`runs/${run}.json does not exist`);
  if (!existsSync(samplePath)) throw new Error(`samples/${run}.m1.json does not exist`);
  const figures = computeFigures({
    index: readJson(indexPath),
    sample: readJson(samplePath),
    labels: readJsonl(join(p.labels, `${half}.jsonl`)),
  });
  mkdirSync(p.figures, { recursive: true });
  writeJson(join(p.figures, `${run}.json`), figures);
  return figures;
}

if (isMain(import.meta.url)) {
  const args = flags(process.argv.slice(2));
  try {
    const f = writeFigures({ instrument: args.instrument, half: args.half });
    const fmt = (s) =>
      s.value === null
        ? 'n/a'
        : `${s.value} (${s.k}/${s.n}, Wilson 95% ${s.wilson95.low}-${s.wilson95.high})`;
    process.stdout.write(
      `${[
        `${f.run}: ${f.pullRequests} PRs, ${f.descriptive.advisories} advisories, ${f.errors} error(s)`,
        `M1 precision ${fmt(f.M1)}`,
        `M2 of ${f.M2.differs} differs: false_claim ${fmt(f.M2.false_claim)}; claim_holds ${fmt(f.M2.claim_holds)}; not_a_claim ${fmt(f.M2.not_a_claim)}`,
        `M3 false accusations ${fmt(f.M3)}`,
        f.bar.applies ? `bar ${f.bar.met ? 'met' : 'not met'}` : 'bar: decided on fixed-test only',
      ].join('\n')}\n`,
    );
  } catch (e) {
    if (!(e instanceof MissingLabels)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

// Study 3's figures (preregistration.md, "Unit and outcomes", "Dominant-PR sensitivity", "The bar"
// and "What would refute it"; "Order of work", step 5).
//
//   pnpm exec node experiments/open-source-advisory-2026-11-study3/tools/figures.mjs
//
// Reads runs/index.json, samples/primary.json, samples/m1.json, labels/labels.jsonl and
// labels/work-done.jsonl, and writes figures/figures.json. It writes no result.md. Refuses,
// computing nothing, while SIGNING_DATE is null; if a sample is not what its seed draws; if any
// label the measures need is missing, if a label names an advisory or pull request no measure
// needs, or if one is labelled twice.
//
// Every share is a count, a share and its Wilson 95% score interval (z = 1.959964, study 1's
// wilson), except at advisory level: the false_claim share and M1 carry a PR-cluster bootstrap
// interval and no Wilson interval, and the largest single-PR share of genuine catches, a maximum,
// carries none. The bar and the refutation tests compare counts, so no rounding decides them.
//
// Adapted from study 2's tools/figures.mjs (experiments/open-source-advisory-2026-10-study2/tools/
// figures.mjs): the unit is the pull request, and the bootstrap, the sensitivity, the bar and the
// refutation tests are study 3's.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import {
  BAR,
  CHECKABLE,
  DIFFERS,
  flags,
  isMain,
  KINDS,
  LABELS,
  paths,
  REFUTE,
  REPLICATES,
  readJson,
  readJsonl,
  SIGNING_DATE,
  seed,
  sha256,
  share,
  WORK_DONE,
  writeJson,
} from './common.mjs';
import { drawM1, drawPrimary } from './sample.mjs';

export class MissingLabels extends Error {
  constructor(missing) {
    super(`${missing.length} label(s) missing; no figure is computed:\n${missing.join('\n')}`);
    this.missing = missing;
  }
}

const GENUINE = (label) => label === 'false_claim';
const ACCUSATION = (label) => label === 'claim_holds' || label === 'not_a_claim';
const round = (x) => (x === null ? null : Math.round(x * 1e5) / 1e5);
// A count and a share with no interval, for an advisory-level figure.
const bare = (k, n) => ({ k, n, value: n === 0 ? null : round(k / n) });
const halfWidth = (s) =>
  s.wilson95 === null ? null : round((s.wilson95.high - s.wilson95.low) / 2);

function tally(items, key) {
  const out = {};
  for (const x of items) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// ---------------------------------------------------------------------------------------------
// The PR-cluster bootstrap ("Secondary outcomes").

// The pull request the j-th draw of replicate r takes, of m: floor(u * m / 2^48), u the first 6
// bytes, big-endian, of the SHA-256 of "<seed>:<r>:<j>". r and j count from 0.
export function drawIndex(s, r, j, m) {
  const u = createHash('sha256').update(`${s}:${r}:${j}`, 'utf8').digest().readUIntBE(0, 6);
  return Number((BigInt(u) * BigInt(m)) >> 48n);
}

// The p-th quantile of sorted values, by linear interpolation between order statistics (Hyndman
// and Fan's type 7).
export function quantile(sorted, q) {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// `clusters` is the measure's set of pull requests in selection order, each with the numerator
// and denominator its advisories give. Each replicate draws as many pull requests as the set holds,
// with replacement, and recomputes the share; one whose denominator is zero is set aside.
export function bootstrap(clusters, s, replicates = REPLICATES) {
  const m = clusters.length;
  const values = [];
  let setAside = 0;
  for (let r = 0; r < replicates; r++) {
    let k = 0;
    let n = 0;
    for (let j = 0; j < m; j++) {
      const c = clusters[drawIndex(s, r, j, m)];
      k += c.k;
      n += c.n;
    }
    if (n === 0) setAside++;
    else values.push(k / n);
  }
  values.sort((a, b) => a - b);
  return {
    seed: s,
    replicates,
    pullRequests: m,
    setAside,
    interval95:
      values.length === 0
        ? null
        : { low: round(quantile(values, 0.025)), high: round(quantile(values, 0.975)) },
  };
}

// ---------------------------------------------------------------------------------------------

// The labels, checked against what the measures need: an M2 label for every differs advisory, an
// M1 label for every sampled one, a "work done" label for every pull request with a primary one.
function labelled({ index, primary, m1, labels, workDone }) {
  const advisories = new Map();
  for (const pr of index.prs) {
    for (const a of pr.advisories) advisories.set(a.advisoryId, { ...a, pr: pr.pr });
  }
  const needed = new Set();
  for (const id of m1.advisoryIds) needed.add(`${id}\nM1`);
  for (const a of advisories.values()) if (DIFFERS(a.note)) needed.add(`${a.advisoryId}\nM2`);
  const got = new Map();
  for (const l of labels) {
    const key = `${l.advisoryId}\n${l.measure}`;
    if (!needed.has(key)) {
      throw new Error(`a label for ${l.advisoryId} ${l.measure}, which no measure needs`);
    }
    if (got.has(key)) throw new Error(`${l.advisoryId} ${l.measure} is labelled twice`);
    if (!LABELS[l.measure].includes(l.label)) {
      throw new Error(`${l.advisoryId} ${l.measure}: label ${l.label}`);
    }
    const a = advisories.get(l.advisoryId);
    if (l.pr !== a.pr) throw new Error(`${l.advisoryId}: labelled as of ${l.pr}`);
    if (a.kind === 'reference_closes' && l.closesRow !== a.closesRow) {
      throw new Error(`${l.advisoryId}: closesRow ${l.closesRow}, not the index's ${a.closesRow}`);
    }
    got.set(key, l.label);
  }
  const doneNeeded = new Set(primary.primary.map((x) => x.pr));
  const done = new Map();
  for (const l of workDone) {
    if (!doneNeeded.has(l.pr)) throw new Error(`a "work done" label for ${l.pr}, which none needs`);
    if (done.has(l.pr)) throw new Error(`${l.pr} work done is labelled twice`);
    if (!WORK_DONE.includes(l.label)) throw new Error(`${l.pr} work done: label ${l.label}`);
    done.set(l.pr, l.label);
  }
  const missing = [
    ...[...needed].filter((k) => !got.has(k)).map((k) => k.replace('\n', ' ')),
    ...[...doneNeeded].filter((pr) => !done.has(pr)).map((pr) => `${pr} work done`),
  ];
  if (missing.length > 0) throw new MissingLabels(missing);
  return {
    m2: (id) => got.get(`${id}\nM2`),
    m1: (id) => got.get(`${id}\nM1`),
    done,
  };
}

export function computeFigures({
  index,
  primary,
  m1,
  labels,
  workDone,
  signed = SIGNING_DATE,
  replicates = REPLICATES,
}) {
  const seeds = {
    primary: seed('primary', signed),
    M1: seed('M1', signed),
    bootstrap: seed('bootstrap', signed),
  };
  if (JSON.stringify(primary) !== JSON.stringify(drawPrimary(index, signed))) {
    throw new Error('samples/primary.json differs from what its seed draws');
  }
  if (JSON.stringify(m1) !== JSON.stringify(drawM1(index, signed))) {
    throw new Error('samples/m1.json differs from what its seed draws');
  }
  const label = labelled({ index, primary, m1, labels, workDone });

  // Each pull request that is not an error, in selection order: denominator (a).
  const primaries = new Map();
  for (const x of primary.primary) {
    if (!primaries.has(x.pr)) primaries.set(x.pr, []);
    primaries.get(x.pr).push(x);
  }
  const all = index.prs.map((pr) => ({
    pr: pr.pr,
    advisories: pr.advisories,
    checkable: pr.advisories.some((a) => CHECKABLE(a.note)),
    differs: pr.advisories.filter((a) => DIFFERS(a.note)),
    primary: primaries.get(pr.pr) ?? [],
  }));
  const tieKey = (x) => sha256(Buffer.from(`${seeds.primary}:${x.pr}`, 'utf8'));
  // The pull request with the most of `count`, ties broken by the least SHA-256 of
  // "<primary seed>:<owner>/<repo>#<n>"; null when none has any.
  const most = (prs, count) => {
    let best = null;
    for (const x of prs) {
      const c = count(x);
      if (c === 0) continue;
      if (best === null || c > best.c || (c === best.c && tieKey(x) < tieKey(best.x))) {
        best = { x, c };
      }
    }
    return best;
  };

  const caught = (chosen) => chosen.some((a) => GENUINE(label.m2(a.advisoryId)));
  const accused = (chosen) => chosen.some((a) => ACCUSATION(label.m2(a.advisoryId)));
  // P1 and P2 over a set of pull requests, each counting the advisories `pick` gives it.
  const outcomes = (prs, pick) => ({
    pullRequests: prs.length,
    P1: share(prs.filter((x) => caught(pick(x))).length, prs.length),
    P2: share(prs.filter((x) => accused(pick(x))).length, prs.length),
  });
  const primaryOf = (x) => x.primary;
  const differsOf = (x) => x.differs;
  // Over denominator (b), and over (a) beside it.
  const overall = (prs, pick) => {
    const b = outcomes(
      prs.filter((x) => x.checkable),
      pick,
    );
    return {
      b: { ...b, halfWidth: { P1: halfWidth(b.P1), P2: halfWidth(b.P2) } },
      a: outcomes(prs, pick),
    };
  };
  // For each kind, over the pull requests in (b) with a checkable advisory of that kind.
  const byKind = (prs) =>
    Object.fromEntries(
      KINDS.map((kind) => {
        const set = prs.filter(
          (x) => x.checkable && x.advisories.some((a) => a.kind === kind && CHECKABLE(a.note)),
        );
        if (set.length === 0) return [kind, { pullRequests: 0, none: true }];
        return [kind, outcomes(set, (x) => x.primary.filter((a) => a.kind === kind))];
      }),
    );

  const b = all.filter((x) => x.checkable);
  const differsAll = all.flatMap((x) => x.differs);
  const falseClaims = (x) => x.differs.filter((a) => GENUINE(label.m2(a.advisoryId))).length;
  const sampled = new Set(m1.advisoryIds);
  const m1Prs = all
    .map((x) => ({ ...x, sampled: x.advisories.filter((a) => sampled.has(a.advisoryId)) }))
    .filter((x) => x.sampled.length > 0);
  const real = (x) => x.sampled.filter((a) => label.m1(a.advisoryId) === 'real').length;

  const primaryOutcomes = overall(all, primaryOf);
  const kinds = byKind(all);

  // "Advisory level, clustered": over denominator (b) for the false_claim share, and over the
  // sampled advisories' pull requests for M1.
  const advisoryLevel = {
    falseClaimShare: {
      ...bare(differsAll.filter((a) => GENUINE(label.m2(a.advisoryId))).length, differsAll.length),
      bootstrap: bootstrap(
        b.map((x) => ({ k: falseClaims(x), n: x.differs.length })),
        seeds.bootstrap,
        replicates,
      ),
    },
    M1: {
      ...bare(
        m1Prs.reduce((s, x) => s + real(x), 0),
        m1.advisoryIds.length,
      ),
      bootstrap: bootstrap(
        m1Prs.map((x) => ({ k: real(x), n: x.sampled.length })),
        seeds.bootstrap,
        replicates,
      ),
    },
  };

  // "Dominant-PR sensitivity".
  const largest = most(all, (x) => x.differs.length);
  const range = (values) => {
    const known = values.filter((v) => v !== null);
    return known.length === 0 ? null : { least: Math.min(...known), greatest: Math.max(...known) };
  };
  const without = b.map((left) => {
    const rest = b.filter((x) => x !== left);
    const o = outcomes(rest, primaryOf);
    const fc = falseClaims(left);
    return {
      P1: o.P1.value,
      P2: o.P2.value,
      falseClaimShare: bare(
        advisoryLevel.falseClaimShare.k - fc,
        advisoryLevel.falseClaimShare.n - left.differs.length,
      ).value,
    };
  });
  const catchShare = (count) => {
    const total = all.reduce((s, x) => s + count(x), 0);
    const top = most(all, count);
    return { pr: top?.x.pr ?? null, ...bare(top?.c ?? 0, total) };
  };
  const primaryCatches = (x) => x.primary.filter((a) => GENUINE(label.m2(a.advisoryId))).length;
  const sensitivity = {
    largest:
      largest === null
        ? null
        : {
            pr: largest.x.pr,
            differs: largest.c,
            tieBreak: 'least SHA-256 of "<primary seed>:<owner>/<repo>#<n>"',
          },
    leaveOneOut: {
      pullRequests: b.length,
      P1: range(without.map((w) => w.P1)),
      P2: range(without.map((w) => w.P2)),
      falseClaimShare: range(without.map((w) => w.falseClaimShare)),
    },
    withoutLargest:
      largest === null
        ? null
        : (() => {
            const rest = all.filter((x) => x !== largest.x);
            return { primary: overall(rest, primaryOf), byKind: byKind(rest) };
          })(),
    largestShareOfGenuineCatches: {
      advisoryLevel: catchShare(falseClaims),
      primaryLevel: catchShare(primaryCatches),
    },
  };

  // "The bar" (ruling H), over (b) only. A condition with no pull request in (b) is not met.
  const pb = primaryOutcomes.b;
  const computable = pb.pullRequests > 0;
  const condition1 = {
    p2WilsonHigh: pb.P2.wilson95?.high ?? null,
    atMost: BAR.p2WilsonHighAtMost,
    computable,
    met: computable && pb.P2.wilson95.high <= BAR.p2WilsonHighAtMost,
  };
  const condition2 = {
    P1: pb.P1.value,
    P2: pb.P2.value,
    atLeastTimes: BAR.p1AtLeastTimesP2,
    computable,
    // Both over the same pull requests, so P1 >= 4 * P2 is a comparison of counts.
    met: computable && pb.P1.k >= BAR.p1AtLeastTimesP2 * pb.P2.k,
  };
  const bar = { condition1, condition2, met: condition1.met && condition2.met };

  // "What would refute it" (ruling H): with fewer cases than the minimum, not decidable.
  const outcome = (decidable, refuted) =>
    !decidable ? 'not_decidable' : refuted ? 'refuted' : 'not_refuted';
  const dom = sensitivity.largestShareOfGenuineCatches.advisoryLevel;
  const p2Prs = b.filter((x) => accused(x.primary));
  const fileAccused = p2Prs.filter((x) =>
    accused(x.primary.filter((a) => a.kind === 'file_changed')),
  ).length;
  const closes = kinds.reference_closes;
  const closesN = closes.pullRequests;
  const closesK = closesN === 0 ? 0 : closes.P2.k;
  const refutations = {
    dominance: {
      ...REFUTE.dominance,
      pr: dom.pr,
      k: dom.k,
      n: dom.n,
      value: dom.value,
      outcome: outcome(dom.n >= REFUTE.dominance.minimumGenuineCatches, 2 * dom.k > dom.n),
    },
    fileClaims: {
      ...REFUTE.fileClaims,
      ...share(fileAccused, p2Prs.length),
      outcome: outcome(
        p2Prs.length >= REFUTE.fileClaims.minimumPrsInP2,
        2 * fileAccused >= p2Prs.length,
      ),
    },
    closes: {
      ...REFUTE.closes,
      ...share(closesK, closesN),
      outcome: outcome(closesN >= REFUTE.closes.minimumPrs, 20 * closesK > closesN),
    },
  };

  // Descriptive only: none enters the bar.
  const advisories = all.flatMap((x) => x.advisories);
  const counts = all.map((x) => x.advisories.length);
  const sorted = [...counts].sort((x, y) => x - y);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const closesAdvisories = advisories.filter((a) => a.kind === 'reference_closes');
  const descriptive = {
    advisories: advisories.length,
    advisoriesPerPr: {
      mean: counts.length === 0 ? null : round(advisories.length / counts.length),
      median,
      max: sorted.length === 0 ? null : sorted[sorted.length - 1],
      histogram: tally(counts, (n) => n),
    },
    notes: tally(advisories, (a) => a.note),
    notesByKind: Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        tally(
          advisories.filter((a) => a.kind === kind),
          (a) => a.note,
        ),
      ]),
    ),
    closesNotesByRow: Object.fromEntries(
      Object.entries(tally(closesAdvisories, (a) => String(a.closesRow))).map(([row]) => [
        row,
        tally(
          closesAdvisories.filter((a) => String(a.closesRow) === row),
          (a) => a.note,
        ),
      ]),
    ),
    errors: index.errors.length,
    bodiesEditedSinceSelection: index.editedSinceSelection.length,
    workDone: Object.fromEntries(
      WORK_DONE.map((l) => [l, [...label.done.values()].filter((x) => x === l).length]),
    ),
  };

  return {
    pullRequests: all.length,
    errors: index.errors.length,
    seeds,
    primary: primaryOutcomes,
    byKind: kinds,
    advisoryLevel,
    any: overall(all, differsOf),
    sensitivity,
    bar,
    refutations,
    descriptive,
  };
}

export function writeFigures({ p = paths(), signed = SIGNING_DATE } = {}) {
  seed('primary', signed);
  for (const [path, name] of [
    [p.index, 'runs/index.json'],
    [p.primary, 'samples/primary.json'],
    [p.m1, 'samples/m1.json'],
    [p.labelFile, 'labels/labels.jsonl'],
    [p.workDoneFile, 'labels/work-done.jsonl'],
  ]) {
    if (!existsSync(path)) throw new Error(`${name} does not exist`);
  }
  const figures = computeFigures({
    index: readJson(p.index),
    primary: readJson(p.primary),
    m1: readJson(p.m1),
    labels: readJsonl(p.labelFile),
    workDone: readJsonl(p.workDoneFile),
    signed,
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
    const boot = (s) =>
      `${s.value ?? 'n/a'} (${s.k}/${s.n}, PR-cluster bootstrap 95% ${s.bootstrap.interval95 === null ? 'n/a' : `${s.bootstrap.interval95.low}-${s.bootstrap.interval95.high}`}, ${s.bootstrap.setAside} set aside)`;
    process.stdout.write(
      `${[
        `${f.pullRequests} PRs, ${f.errors} error(s); denominator (b) ${f.primary.b.pullRequests}`,
        `P1 (b) ${fmt(f.primary.b.P1)}; (a) ${fmt(f.primary.a.P1)}`,
        `P2 (b) ${fmt(f.primary.b.P2)}; (a) ${fmt(f.primary.a.P2)}`,
        `false_claim share ${boot(f.advisoryLevel.falseClaimShare)}`,
        `M1 ${boot(f.advisoryLevel.M1)}`,
        `bar ${f.bar.met ? 'met' : 'not met'} (condition 1 ${f.bar.condition1.met}, condition 2 ${f.bar.condition2.met})`,
        ...Object.entries(f.refutations).map(([name, t]) => `refutation ${name}: ${t.outcome}`),
      ].join('\n')}\n`,
    );
  } catch (e) {
    if (!(e instanceof MissingLabels)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

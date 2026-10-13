// What study 3's tools share: its paths and the fixed constants of preregistration.md. The helpers
// (digests, Wilson intervals, JSON files, flags, names) are study 1's, and the pin of study 1's
// selection is study 2's, imported unchanged. Nothing here reads the network.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, wilson } from '../../open-source-advisory-2026-10/tools/common.mjs';
import { AGENTS, QUALIFIERS } from '../../open-source-advisory-2026-10/tools/select.mjs';
import { STUDY1_SELECTION } from '../../open-source-advisory-2026-10-study2/tools/common.mjs';

export {
  CHECKABLE,
  committedAt,
  DIFFERS,
  fileStem,
  flags,
  isMain,
  LABELS,
  prName,
  readJson,
  readJsonl,
  sha256,
  share,
  wilson,
  writeJson,
  writeJsonl,
} from '../../open-source-advisory-2026-10/tools/common.mjs';
export { AGENTS, QUALIFIERS, STUDY1_SELECTION };

export const STUDY = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = join(STUDY, '..', '..');
export const RULE = 'experiments/open-source-advisory-2026-11-study3/preregistration.md';

// preregistration.md, "Signature": the date the operator signed it, YYYY-MM-DD. The seeds of the
// primary advisories, M1 and the bootstrap are fixed by it, and no search may run before it. A tool
// given a null date refuses, as every tool did before signing.
export const SIGNING_DATE = '2026-10-13';

export function signingDate(date = SIGNING_DATE) {
  if (date === null) throw new Error('not signed: the signing date given is null');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`SIGNING_DATE ${date} is not YYYY-MM-DD`);
  }
  return date;
}

// preregistration.md, "Instrument": the first checker release carrying spec 0.1.4.
export const INSTRUMENT = Object.freeze({
  name: 'instrument',
  package: 'dunstan@0.1.7',
  checkerVersion: '0.1.7',
  bundleSha256: 'e735da0a9348ee515e061df164daa11ba78d2ffd1ae50031f21c70b50ff73707',
  extractorVersion: '0.1.3',
  extractorDigest: '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
  comparison: '0.4.0',
  spec: '0.1.4',
  sourceRepository: 'BargLabs/dunstan',
  sourceTag: 'v0.1.7',
  sourceCommit: 'a2989e56842cbf5b1d3fb1fbeb1a94371511b2ef',
});

// preregistration.md, "Exclusions": study 1's and study 2's selections, each pinned by the SHA-256
// of its bytes, and the demo's, by path.
export const STUDY2_SELECTION = Object.freeze({
  path: 'experiments/open-source-advisory-2026-10-study2/selection.json',
  sha256: '9e9afd2efef95c3120934d56f6401fec997561c6a2e5700768472aafe903987d',
});
export const DEMO_SELECTION = Object.freeze({ path: 'demo/2026-10/selection.json' });

// preregistration.md, "Order and stop" (ruling C): the selection stops at 350.
export const WANTED = 350;

// preregistration.md, "Weeks" (ruling B): two blocks, each searched no earlier than its date.
// Block 2 is searched only if block 1 selects fewer than WANTED.
export const BLOCKS = Object.freeze([
  Object.freeze({ block: 1, start: '2026-10-07', end: '2026-11-08', searchFrom: '2026-11-09' }),
  Object.freeze({ block: 2, start: '2026-11-09', end: '2026-11-22', searchFrom: '2026-11-23' }),
]);

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// A block's weeks: from its first day to the first Sunday, then Monday to Sunday, both ends
// inclusive, the last ending on the block's last day.
export function blockWeeks({ start, end }) {
  const last = Date.parse(`${end}T00:00:00Z`);
  const out = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last; ) {
    const sunday = t + ((7 - new Date(t).getUTCDay()) % 7) * DAY;
    out.push({ start: iso(t), end: iso(Math.min(sunday, last)) });
    t = sunday + DAY;
  }
  return out;
}

// "Weeks": within each block, ascending SHA-256 (hex) of the UTF-8 string "week:<start>", as in
// study 1's amendment 1; block 2 follows block 1.
export const WEEKS = Object.freeze(
  BLOCKS.flatMap(({ block, ...window }) =>
    blockWeeks(window)
      .map((w) => {
        const key = `week:${w.start}`;
        return { block, ...w, key, sha256: sha256(Buffer.from(key, 'utf8')) };
      })
      .sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0))
      .map((w, i) => Object.freeze({ block, order: i + 1, ...w })),
  ),
);

// "Unit and outcomes", "Secondary outcomes" and "Dominant-PR sensitivity": each seed is
// "open-source-advisory-2026-11-study3/<name>/<the signing date>", so none exists before signing.
export const SEEDS = Object.freeze(['primary', 'M1', 'bootstrap']);
export function seed(name, date = SIGNING_DATE) {
  if (!SEEDS.includes(name)) throw new Error(`no seed named ${name}`);
  return `open-source-advisory-2026-11-study3/${name}/${signingDate(date)}`;
}

// "Unit and outcomes": the extractor's claim kinds, as ADVISORY_KINDS in src/advisory/grammar.ts
// names them, in its order.
export const KINDS = Object.freeze([
  'file_changed',
  'reference_closes',
  'commit',
  'head_commit',
  'checks_succeeded',
  'check_count',
  'tests_passed',
  'test_count',
  'merged_at',
]);

// "Secondary outcomes": M1's size, and the PR-cluster bootstrap's replicates.
export const M1_SIZE = 60;
export const REPLICATES = 10_000;

// "Separate scoring": the "work done" labels, one per pull request with a primary advisory.
export const WORK_DONE = Object.freeze(['done', 'not_done', 'cannot_tell']);

// "The bar" (ruling H): P2's Wilson 95% upper bound at most 0.05, and P1 at least four times P2.
export const BAR = Object.freeze({ p2WilsonHighAtMost: 0.05, p1AtLeastTimesP2: 4 });

// "What would refute it" (ruling H): each test, its threshold and the fewest cases that decide it.
export const REFUTE = Object.freeze({
  dominance: Object.freeze({ shareAbove: 0.5, minimumGenuineCatches: 5 }),
  fileClaims: Object.freeze({ shareAtLeast: 0.5, minimumPrsInP2: 5 }),
  closes: Object.freeze({ shareAbove: 0.05, minimumPrs: 20 }),
});

// "Size", "What each N can show": the most accused pull requests, of n in the denominator, whose
// Wilson 95% upper bound still meets the bar's first condition; null when not even none does.
export function mostAccusedAllowed(n, bound = BAR.p2WilsonHighAtMost) {
  let most = null;
  for (let k = 0; k <= n && wilson(k, n).high <= bound; k++) most = k;
  return most;
}

// Each tool's paths, under one directory so a test can point them at a scratch copy.
export function paths(dir = STUDY) {
  return {
    dir,
    selection: join(dir, 'selection.json'),
    runs: join(dir, 'runs'),
    seal: join(dir, 'runs', 'instrument.seal.json'),
    index: join(dir, 'runs', 'index.json'),
    samples: join(dir, 'samples'),
    primary: join(dir, 'samples', 'primary.json'),
    m1: join(dir, 'samples', 'm1.json'),
    labels: join(dir, 'labels'),
    labelFile: join(dir, 'labels', 'labels.jsonl'),
    workDoneFile: join(dir, 'labels', 'work-done.jsonl'),
    figures: join(dir, 'figures'),
    figureFile: join(dir, 'figures', 'figures.json'),
    work: join(dir, '.work'),
    bodies: join(dir, '.work', 'bodies'),
    records: join(dir, '.work', 'records'),
    worksheets: join(dir, '.work', 'worksheets'),
    sheets: {
      M2: join(dir, '.work', 'worksheets', 'm2.jsonl'),
      M1: join(dir, '.work', 'worksheets', 'm1.jsonl'),
      workDone: join(dir, '.work', 'worksheets', 'work-done.jsonl'),
    },
  };
}

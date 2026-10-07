// What study 2's tools share: its paths and the fixed constants of preregistration.md. The helpers
// (digests, Wilson intervals, JSON files, flags, names) are study 1's, imported unchanged from
// experiments/open-source-advisory-2026-10/tools/common.mjs. Nothing here reads the network.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE as STUDY1_BASELINE } from '../../open-source-advisory-2026-10/tools/common.mjs';

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
  splitKey,
  wilson,
  writeJson,
  writeJsonl,
} from '../../open-source-advisory-2026-10/tools/common.mjs';

export const STUDY = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = join(STUDY, '..', '..');

// preregistration.md, "Instruments": both frozen before any search.
export const BASELINE = Object.freeze({ ...STUDY1_BASELINE });
export const CANDIDATE = Object.freeze({
  name: 'candidate',
  checkerVersion: '0.1.5',
  bundleSha256: '978a6f63d5932e2d52c89b73ca9ead3f29628cd847efd50fb4b7eb05daeab8c5',
  extractorVersion: '0.1.3',
  extractorDigest: '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
  comparison: '0.3.0',
  sourceCommit: 'e559598ec3c5b1a05e96270e0ba723d5cef6b1a3',
});
export const INSTRUMENTS = Object.freeze({ baseline: BASELINE, candidate: CANDIDATE });
export const NAMES = ['baseline', 'candidate'];

// preregistration.md, "Exclusions": study 1's selection, pinned by the SHA-256 of its bytes.
export const STUDY1_SELECTION = Object.freeze({
  path: 'experiments/open-source-advisory-2026-10/selection.json',
  sha256: '1593c3d9ac1c4dba9c6d00b0f8c150b69729969b95991a71bb7e931bb0566c36',
});

// preregistration.md, "M1": one sample, its seed and size fixed before any data.
export const M1_SEED = 'open-source-advisory-2026-10-study2/M1/2026-10-07';
export const M1_SIZE = 60;

// preregistration.md, "Advisory identity": the one note change comparison 0.3.0 may make. A
// file_changed claim that 0.2.0 notes differs:declared_not_changed keeps that note at a file, or
// becomes one of these.
export const FILE_DIFFERS = 'differs:declared_not_changed';
export const PATH_NOTES = Object.freeze([
  'differs:declared_not_changed',
  'unanswered:no_such_path',
  'unanswered:directory',
  'unanswered:source_unreadable:path',
]);

// Each tool's paths, under one directory so a test can point them at a scratch copy.
export function paths(dir = STUDY) {
  return {
    dir,
    selection: join(dir, 'selection.json'),
    runs: join(dir, 'runs'),
    index: join(dir, 'runs', 'index.json'),
    seal: (name) => join(dir, 'runs', `${name}.seal.json`),
    sample: join(dir, 'samples', 'm1.json'),
    samples: join(dir, 'samples'),
    labels: join(dir, 'labels'),
    labelFile: join(dir, 'labels', 'labels.jsonl'),
    figures: join(dir, 'figures'),
    figureFile: join(dir, 'figures', 'figures.json'),
    work: join(dir, '.work'),
    bodies: join(dir, '.work', 'bodies'),
    records: join(dir, '.work', 'records'),
    worksheets: join(dir, '.work', 'worksheets'),
    worksheet: join(dir, '.work', 'worksheets', 'labels.jsonl'),
  };
}

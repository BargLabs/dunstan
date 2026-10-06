// What the study's tools share: the study's paths, the fixed constants of preregistration.md, and
// the helpers each measure is computed with. Nothing here reads the network.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDY = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = join(STUDY, '..', '..');

// preregistration.md, "Instrument": public v0.1.3, untouched.
export const BASELINE = Object.freeze({
  name: 'baseline',
  checkerVersion: '0.1.3',
  bundleSha256: 'fd1377c058a928bf30e54c000bfb19e5eb3cd5eb71408ea4b093cc9ccf7170a5',
  extractorVersion: '0.1.3',
  extractorDigest: '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37',
  comparison: '0.2.0',
});

export const HALVES = ['dev', 'test'];
export const INSTRUMENTS = ['baseline', 'fixed'];

// preregistration.md, "M1": the sample's seed and size, fixed before any data.
export const M1_SEED = 'open-source-advisory-2026-10/M1/2026-10-07';
export const M1_SIZE = 60;

// preregistration.md, "Measures": the notes that count as checkable.
export const CHECKABLE = (note) =>
  note === 'agrees' || note === 'agrees_by_name' || note.startsWith('differs:');
export const DIFFERS = (note) => note.startsWith('differs:');

export const LABELS = Object.freeze({
  M1: ['real', 'not_real'],
  M2: ['false_claim', 'claim_holds', 'not_a_claim'],
});

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// A selected pull request's name as the label files give it, and its split key: lower-case owner
// and repository (preregistration.md, "Split").
export const prName = (s) => `${s.repository}#${s.number}`;
export const splitKey = (s) => `${s.repository.toLowerCase()}#${s.number}`;
// A file name for a selected pull request's working files.
export const fileStem = (s) => `${s.repository.replace('/', '-')}-${s.number}`;

export const runName = (instrument, half) => {
  if (!INSTRUMENTS.includes(instrument)) throw new Error(`--instrument ${instrument}`);
  if (!HALVES.includes(half)) throw new Error(`--half ${half}`);
  return `${instrument}-${half}`;
};

// The 95% Wilson score interval for k of n (z = 1.959964). n = 0 has none.
export function wilson(k, n) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k > n) {
    throw new Error(`wilson(${k}, ${n})`);
  }
  if (n === 0) return null;
  const z = 1.959964;
  const p = k / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const denominator = 1 + z2 / n;
  const round = (x) => Math.round(Math.min(1, Math.max(0, x)) * 1e5) / 1e5;
  return {
    low: round((centre - margin) / denominator),
    high: round((centre + margin) / denominator),
  };
}

export const share = (k, n) => ({
  k,
  n,
  value: n === 0 ? null : Math.round((k / n) * 1e5) / 1e5,
  wilson95: wilson(k, n),
});

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export const readJsonl = (path) =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line, i) => {
          try {
            return JSON.parse(line);
          } catch {
            throw new Error(`${path}:${i + 1}: not JSON`);
          }
        })
    : [];
export const writeJsonl = (path, rows) =>
  writeFileSync(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));

// The commit that last changed `path`, if it is committed with no change since; else null.
export function committedAt(path, cwd = ROOT) {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', path], { cwd, stdio: 'ignore' });
    const id = execFileSync('git', ['log', '-1', '--format=%H', '--', path], {
      cwd,
      encoding: 'utf8',
    }).trim();
    return /^[0-9a-f]{40}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Each tool's paths, under one directory so a test can point them at a scratch copy.
export function paths(dir = STUDY) {
  return {
    dir,
    selection: join(dir, 'selection.json'),
    frozen: join(dir, 'frozen.json'),
    runs: join(dir, 'runs'),
    samples: join(dir, 'samples'),
    labels: join(dir, 'labels'),
    figures: join(dir, 'figures'),
    work: join(dir, '.work'),
    bodies: join(dir, '.work', 'bodies'),
    records: join(dir, '.work', 'records'),
    worksheets: join(dir, '.work', 'worksheets'),
  };
}

// The command-line flags `--name value` of argv as an object; a flag with no value is true.
export function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else {
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
}

export const isMain = (url) =>
  process.argv[1] !== undefined && fileURLToPath(url) === process.argv[1];

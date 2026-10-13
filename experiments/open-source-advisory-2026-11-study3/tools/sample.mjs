// The primary advisories and M1's seeded sample (preregistration.md, "Unit and outcomes" and
// "Secondary outcomes"; "Order of work", step 3).
//
//   pnpm exec node experiments/open-source-advisory-2026-11-study3/tools/sample.mjs
//
// Reads runs/index.json and writes two files, both drawn with seeds that hold the signing date, so
// it refuses while SIGNING_DATE is null:
//
//   samples/primary.json: for each pull request and each kind, at most one advisory: among that
//     pull request's advisories of that kind whose note is differs:<reason>, the one whose SHA-256
//     (hex) of the UTF-8 string "<seed>:<advisoryId>" is least, with the primary seed.
//   samples/m1.json: study 1's drawSample (experiments/open-source-advisory-2026-10/tools/
//     sample.mjs), imported unchanged, as study 2 drew its sample: every advisory of the index
//     ordered by the SHA-256 of "<seed>:<advisoryId>", the first 60 taken, or all when fewer, with
//     the M1 seed.
//
// Run again, it checks the files it wrote against what the seeds draw, and writes nothing.

import { existsSync, mkdirSync } from 'node:fs';
import { drawSample } from '../../open-source-advisory-2026-10/tools/sample.mjs';
import {
  DIFFERS,
  flags,
  isMain,
  KINDS,
  M1_SIZE,
  paths,
  readJson,
  SIGNING_DATE,
  seed,
  sha256,
  writeJson,
} from './common.mjs';

const keyOf = (s, id) => sha256(Buffer.from(`${s}:${id}`, 'utf8'));

// Refuses an index that names a kind the extractor does not have: every kind is counted.
export function checkKinds(index) {
  for (const pr of index.prs) {
    for (const a of pr.advisories) {
      if (!KINDS.includes(a.kind)) throw new Error(`${a.advisoryId}: kind ${a.kind} is not a kind`);
    }
  }
}

// The primary advisories, in index (selection) order, then kind order.
export function drawPrimary(index, date = SIGNING_DATE) {
  checkKinds(index);
  const s = seed('primary', date);
  const primary = [];
  for (const pr of index.prs) {
    for (const kind of KINDS) {
      const differs = pr.advisories.filter((a) => a.kind === kind && DIFFERS(a.note));
      if (differs.length === 0) continue;
      const keyed = differs.map((a) => ({ id: a.advisoryId, key: keyOf(s, a.advisoryId) }));
      keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      primary.push({ pr: pr.pr, kind, advisoryId: keyed[0].id });
    }
  }
  return {
    seed: s,
    method:
      'for each pull request and kind, of its differs:<reason> advisories of that kind, the one with the least SHA-256 of "<seed>:<advisoryId>"',
    differs: index.prs.reduce(
      (n, pr) => n + pr.advisories.filter((a) => DIFFERS(a.note)).length,
      0,
    ),
    primary,
  };
}

// M1's sample, as study 2 drew its own: over every advisory of the index.
export function drawM1(index, date = SIGNING_DATE) {
  checkKinds(index);
  const { run: _, ...sample } = drawSample(index, seed('M1', date), M1_SIZE);
  return sample;
}

export function writeSamples({ p = paths(), signed = SIGNING_DATE } = {}) {
  seed('primary', signed);
  if (!existsSync(p.index)) {
    throw new Error('runs/index.json does not exist: run run.mjs index first');
  }
  const index = readJson(p.index);
  const drawn = [
    [p.primary, 'samples/primary.json', drawPrimary(index, signed)],
    [p.m1, 'samples/m1.json', drawM1(index, signed)],
  ];
  // Both are checked before either is written, so a mismatch writes nothing.
  for (const [path, name, value] of drawn) {
    if (existsSync(path) && JSON.stringify(readJson(path)) !== JSON.stringify(value)) {
      throw new Error(`${name} differs from what its seed draws`);
    }
  }
  const wrote = [];
  mkdirSync(p.samples, { recursive: true });
  for (const [path, name, value] of drawn) {
    if (existsSync(path)) continue;
    writeJson(path, value);
    wrote.push(name);
  }
  return { primary: drawn[0][2], m1: drawn[1][2], wrote };
}

if (isMain(import.meta.url)) {
  flags(process.argv.slice(2));
  const { primary, m1, wrote } = writeSamples();
  process.stdout.write(
    `${wrote.length > 0 ? `wrote ${wrote.join(' and ')}` : 'checked samples/primary.json and samples/m1.json'}: ${primary.primary.length} primary of ${primary.differs} differs advisories; M1 ${m1.advisoryIds.length} of ${m1.population} advisories\n`,
  );
}

// M1's one seeded sample (preregistration.md, "Labels").
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/tools/sample.mjs
//
// Study 1's drawSample (experiments/open-source-advisory-2026-10/tools/sample.mjs), imported
// unchanged, with study 2's seed: every advisory of runs/index.json ordered by the SHA-256 of
// "<seed>:<advisoryId>" (UTF-8, hex digest compared as a string), the first 60 taken, or all of them
// when there are fewer. One sample serves both instruments, whose advisories are the same. Writes
// samples/m1.json; run again, it checks the sample it wrote.

import { existsSync, mkdirSync } from 'node:fs';
import { drawSample } from '../../open-source-advisory-2026-10/tools/sample.mjs';
import { flags, isMain, M1_SEED, M1_SIZE, paths, readJson, writeJson } from './common.mjs';

export function writeSample({ p = paths() } = {}) {
  if (!existsSync(p.index))
    throw new Error('runs/index.json does not exist: run run.mjs index first');
  const { run: _, ...sample } = drawSample(readJson(p.index), M1_SEED, M1_SIZE);
  if (existsSync(p.sample)) {
    if (JSON.stringify(readJson(p.sample)) !== JSON.stringify(sample)) {
      throw new Error('samples/m1.json differs from the sample the seed draws');
    }
    return { sample, wrote: false };
  }
  mkdirSync(p.samples, { recursive: true });
  writeJson(p.sample, sample);
  return { sample, wrote: true };
}

if (isMain(import.meta.url)) {
  flags(process.argv.slice(2));
  const { sample, wrote } = writeSample();
  process.stdout.write(
    `${wrote ? 'wrote' : 'checked'} samples/m1.json: ${sample.advisoryIds.length} of ${sample.population} advisories\n`,
  );
}

// M1's seeded sample (preregistration.md, "M1").
//
//   pnpm exec node experiments/open-source-advisory-2026-10/tools/sample.mjs --instrument <i> --half <h>
//
// Orders every advisory of runs/<instrument>-<half>.json by the SHA-256 of "<seed>:<advisoryId>"
// (UTF-8, hex digest compared as a string) and takes the first 60, or all of them when there are
// fewer. Writes samples/<instrument>-<half>.m1.json. Anyone can redraw it from the index and the
// seed; run again, it checks the sample it wrote.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  flags,
  isMain,
  M1_SEED,
  M1_SIZE,
  paths,
  readJson,
  runName,
  sha256,
  writeJson,
} from './common.mjs';

export function drawSample(index, seed = M1_SEED, size = M1_SIZE) {
  const all = index.prs.flatMap((pr) => pr.advisories.map((a) => a.advisoryId));
  const keyed = all.map((id) => ({ id, key: sha256(Buffer.from(`${seed}:${id}`, 'utf8')) }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    run: index.run,
    seed,
    size,
    method: 'the first `size` advisories by SHA-256 of "<seed>:<advisoryId>", ascending',
    population: all.length,
    advisoryIds: keyed.slice(0, size).map((k) => k.id),
  };
}

export function writeSample({ instrument, half, p = paths() }) {
  const run = runName(instrument, half);
  const indexPath = join(p.runs, `${run}.json`);
  if (!existsSync(indexPath))
    throw new Error(`runs/${run}.json does not exist: run run.mjs index first`);
  const sample = drawSample(readJson(indexPath));
  const out = join(p.samples, `${run}.m1.json`);
  if (existsSync(out)) {
    if (JSON.stringify(readJson(out)) !== JSON.stringify(sample)) {
      throw new Error(`samples/${run}.m1.json differs from the sample the seed draws`);
    }
    return { sample, wrote: false };
  }
  mkdirSync(p.samples, { recursive: true });
  writeJson(out, sample);
  return { sample, wrote: true };
}

if (isMain(import.meta.url)) {
  const args = flags(process.argv.slice(2));
  const { sample, wrote } = writeSample({ instrument: args.instrument, half: args.half });
  process.stdout.write(
    `${wrote ? 'wrote' : 'checked'} ${sample.run}: ${sample.advisoryIds.length} of ${sample.population} advisories\n`,
  );
}

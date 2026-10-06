// The dev/test split of preregistration.md, "Split", recorded in selection.json.
//
//   pnpm exec node experiments/open-source-advisory-2026-10/tools/split.mjs
//
// Orders the selected pull requests by the SHA-256 of "<owner>/<repo>#<n>" (owner and repository
// lower-case, UTF-8, hex digest compared as a string). The first ceil(N/2) are dev and the rest
// test: 150 and 150 when N is 300. Reads nothing but selection.json. Run again, it checks the
// recorded split instead of writing one.

import { flags, isMain, paths, readJson, sha256, splitKey, writeJson } from './common.mjs';

export function split(selected) {
  const ordered = selected
    .map((s) => ({ key: splitKey(s), sha256: sha256(Buffer.from(splitKey(s), 'utf8')), n: s.n }))
    .sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0));
  if (new Set(ordered.map((o) => o.key)).size !== ordered.length) {
    throw new Error('two selected pull requests share a split key');
  }
  const devSize = Math.ceil(ordered.length / 2);
  return {
    method:
      'SHA-256 of "<owner>/<repo>#<n>" with owner and repository lower-cased, ascending; the first ceil(N/2) are dev, the rest test',
    dev: ordered.slice(0, devSize),
    test: ordered.slice(devSize),
  };
}

// The half a selected pull request is in, from selection.json's recorded split.
export function halfOf(selection, s) {
  if (selection.split === undefined) throw new Error('selection.json has no split: run split.mjs');
  const key = splitKey(s);
  if (selection.split.dev.some((o) => o.key === key)) return 'dev';
  if (selection.split.test.some((o) => o.key === key)) return 'test';
  throw new Error(`${key} is in neither half`);
}

// The selected pull requests of `half`, in split order.
export function selectedIn(selection, half) {
  if (selection.split === undefined) throw new Error('selection.json has no split: run split.mjs');
  const byKey = new Map(selection.selected.map((s) => [splitKey(s), s]));
  return selection.split[half].map((o) => {
    const s = byKey.get(o.key);
    if (s === undefined) throw new Error(`split key ${o.key} is not a selected pull request`);
    return s;
  });
}

export function recordSplit(p = paths()) {
  const selection = readJson(p.selection);
  const computed = split(selection.selected);
  if (selection.split !== undefined) {
    if (JSON.stringify(selection.split) !== JSON.stringify(computed)) {
      throw new Error('selection.json holds a split that differs from the computed one');
    }
    return { selection, wrote: false };
  }
  selection.split = computed;
  writeJson(p.selection, selection);
  return { selection, wrote: true };
}

if (isMain(import.meta.url)) {
  flags(process.argv.slice(2));
  const { selection, wrote } = recordSplit();
  process.stdout.write(
    `${wrote ? 'wrote' : 'checked'} the split: ${selection.split.dev.length} dev, ${selection.split.test.length} test\n`,
  );
}

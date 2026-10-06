// Builds the two distributed checkers, each one ESM file holding the checker core, its dependencies,
// and the schemas from spec/schema/ inlined in place of src/spec/schema-files.ts, and the eval tool:
//
//   dist/dunstan.mjs        the CLI (not committed)
//   dist/dunstan-eval.mjs   dunstan-eval, retrieval measurement (not committed; docs/retrieval.md)
//   action/dist/index.mjs   the GitHub Action that action.yml runs (committed; CI rebuilds it and
//                           fails when the committed file differs from the build of the source)
//
// A record's checker.digest is the SHA-256 of whichever of the two ran. The build is deterministic:
// the same sources, lockfile and esbuild version give the same bytes on every machine, and CI
// compares the CLI digest across ubuntu-latest and macos-latest.
//
// Usage: node scripts/build.mjs   (prints each bundle's SHA-256)

import { createHash } from 'node:crypto';
import { chmodSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = new URL('../spec/schema/', import.meta.url);

const inlineSchemas = {
  name: 'inline-schemas',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]spec[\\/]schema-files\.ts$/ }, () => {
      const files = {};
      for (const file of [
        'handback-block-0.1.schema.json',
        'record-0.1.schema.json',
        'record-0.2-draft.schema.json',
      ]) {
        files[file] = readFileSync(new URL(file, schemaDir), 'utf8');
      }
      return {
        loader: 'ts',
        contents: `const FILES: Record<string, string> = ${JSON.stringify(files)};
export function schemaText(file: string): string {
  const text = FILES[file];
  if (text === undefined) throw new Error(\`no schema \${file} in this build\`);
  return text;
}
`,
      };
    });
  },
};

const bundles = [
  { entry: 'src/cli/bin.ts', out: 'dist/dunstan.mjs', banner: '#!/usr/bin/env node', mode: 0o755 },
  {
    entry: 'src/eval/bin.ts',
    out: 'dist/dunstan-eval.mjs',
    banner: '#!/usr/bin/env node',
    mode: 0o755,
  },
  {
    entry: 'src/action/bin.ts',
    out: 'action/dist/index.mjs',
    banner: '// Built by scripts/build.mjs from src/action/. Do not edit; run `pnpm build`.',
    mode: 0o644,
  },
];

for (const bundle of bundles) {
  const outfile = `${root}${bundle.out}`;
  await build({
    absWorkingDir: root,
    entryPoints: [bundle.entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    banner: { js: bundle.banner },
    legalComments: 'inline',
    minify: false,
    sourcemap: false,
    plugins: [inlineSchemas],
    logLevel: 'warning',
  });
  chmodSync(outfile, bundle.mode);
  const digest = createHash('sha256').update(readFileSync(outfile)).digest('hex');
  process.stdout.write(`${digest}  ${bundle.out}\n`);
}

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
import { chmodSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  {
    entry: 'src/cli/bin.ts',
    out: 'dist/dunstan.mjs',
    banner: '#!/usr/bin/env node',
    mode: 0o755,
    distributed: true,
  },
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
    distributed: true,
  },
];

// Third-party packages bundled into each distributed bundle: package root -> the bundles using it.
const bundled = new Map();

for (const bundle of bundles) {
  const outfile = `${root}${bundle.out}`;
  const result = await build({
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
    metafile: true,
  });
  chmodSync(outfile, bundle.mode);
  if (bundle.distributed) {
    for (const input of Object.keys(result.metafile.inputs)) {
      const at = input.lastIndexOf('node_modules/');
      if (at === -1) continue;
      const rest = input.slice(at + 'node_modules/'.length).split('/');
      const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
      const pkgRoot = `${input.slice(0, at)}node_modules/${name}`;
      if (!bundled.has(pkgRoot)) bundled.set(pkgRoot, new Set());
      bundled.get(pkgRoot).add(bundle.out);
    }
  }
  const digest = createHash('sha256').update(readFileSync(outfile)).digest('hex');
  process.stdout.write(`${digest}  ${bundle.out}\n`);
}

// THIRD_PARTY_NOTICES: each package the distributed bundles carry, with the licence text it ships.
// The npm package and the Action redistribute that code, and its licences require the notices to go
// with it. Committed, so CI fails when a dependency change leaves the file stale. A bundled package
// with no licence file fails the build: its notice cannot be reproduced.
const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const notices = [...bundled]
  .map(([pkgRoot, outs]) => {
    const dir = `${root}${pkgRoot}`;
    const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
    const file = readdirSync(dir).find((f) => LICENCE_FILE.test(f));
    if (file === undefined) throw new Error(`${pkg.name}@${pkg.version} ships no licence file`);
    return {
      id: `${pkg.name}@${pkg.version}`,
      licence: typeof pkg.license === 'string' ? pkg.license : 'see the text below',
      outs: [...outs].sort(),
      text: readFileSync(`${dir}/${file}`, 'utf8').replace(/\r\n/g, '\n').trim(),
    };
  })
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const rule = '='.repeat(80);
writeFileSync(
  `${root}THIRD_PARTY_NOTICES`,
  [
    'Third-party notices for the distributed bundles of Dunstan',
    '',
    'dist/dunstan.mjs (the npm package dunstan) and action/dist/index.mjs (the GitHub Action) bundle',
    "the packages below. Each package's licence text follows, as the package ships it. Dunstan's own",
    'licences are in LICENSE and NOTICE. Generated by scripts/build.mjs; do not edit.',
    ...notices.flatMap((n) => [
      '',
      rule,
      `${n.id} (${n.licence}), in ${n.outs.join(' and ')}`,
      rule,
      '',
      n.text,
    ]),
    '',
  ].join('\n'),
);
process.stdout.write(`THIRD_PARTY_NOTICES: ${notices.map((n) => n.id).join(', ')}\n`);

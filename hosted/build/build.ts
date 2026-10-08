// Builds the hosted Worker into two ES modules, the way scripts/build.mjs builds the CLI and Action:
//
//   hosted/dist/checker.mjs   the hosted checker: hosted/src/, the checker core it imports
//                             unchanged, the two schemas from spec/schema/ inlined, and Ajv's
//                             standalone validators for them (hosted/build/standalone.ts)
//   hosted/dist/worker.mjs    the module wrangler deploys: createWorker() given checker.mjs's SHA-256
//
// A hosted record's checker.digest, and GET /v0.1/health, is that SHA-256: of the artifact that ran.
// The build is deterministic, so anyone can rebuild a commit and compare. The build refuses a graph
// that reaches node:child_process: the Worker has no ssh-keygen and gets no shim for one.
//
// Usage: node --experimental-strip-types hosted/build/build.ts   (or pnpm build:hosted)

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SCHEMA_FILES = ['handback-block-0.1.schema.json', 'record-0.1.schema.json'];

// As in scripts/build.mjs: src/spec/schema-files.ts becomes the schema files' text.
function inlineSchemas(): Plugin {
  return {
    name: 'inline-schemas',
    setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/]spec[\\/]schema-files\.ts$/ }, () => {
        const files: Record<string, string> = {};
        for (const file of SCHEMA_FILES) {
          files[file] = readFileSync(join(root, 'spec/schema', file), 'utf8');
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
}

// src/spec/schema-validators.ts becomes Ajv's standalone code for the same schemas.
function precompiledValidators(code: string): Plugin {
  return {
    name: 'precompiled-validators',
    setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/]spec[\\/]schema-validators\.ts$/ }, () => ({
        loader: 'js',
        contents: code,
        resolveDir: root,
      }));
    },
  };
}

export async function standaloneValidatorCode(): Promise<string> {
  // Outside the repository: the generator is bundled whole (only node: built-ins stay external), so
  // it runs from anywhere, and a directory created in the repository root while tests run beside
  // src/mcp/server.test.ts, which compares two listings of that root, made that test fail by timing.
  const dir = mkdtempSync(join(tmpdir(), 'dunstan-standalone-'));
  try {
    const out = join(dir, 'standalone.mjs');
    await build({
      absWorkingDir: root,
      entryPoints: ['hosted/build/standalone.ts'],
      outfile: out,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      plugins: [inlineSchemas()],
      logLevel: 'warning',
    });
    const generator = (await import(pathToFileURL(out).href)) as {
      standaloneValidators: () => string;
    };
    return generator.standaloneValidators();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface HostedBuild {
  checkerPath: string;
  workerPath: string;
  digest: string;
  // First-party and dependency inputs of checker.mjs, relative to the repository root.
  inputs: string[];
  // Every module checker.mjs imports at run time (the Workers runtime provides them).
  externals: string[];
}

export async function buildHosted(outdir = join(root, 'hosted/dist')): Promise<HostedBuild> {
  const validators = await standaloneValidatorCode();
  const checkerPath = join(outdir, 'checker.mjs');
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['hosted/src/app.ts'],
    outfile: checkerPath,
    write: false,
    metafile: true,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    external: ['node:*'],
    banner: { js: '// Built by hosted/build/build.ts from hosted/src/ and src/. Do not edit.' },
    legalComments: 'inline',
    minify: false,
    sourcemap: false,
    plugins: [inlineSchemas(), precompiledValidators(validators)],
    logLevel: 'warning',
  });
  const inputs = Object.keys(result.metafile.inputs).sort();
  const externals = [
    ...new Set(
      Object.values(result.metafile.inputs).flatMap((i) =>
        i.imports.filter((m) => m.external === true).map((m) => m.path),
      ),
    ),
  ].sort();
  if (inputs.includes('src/record/sign.ts') || externals.some((m) => /child_process/.test(m))) {
    throw new Error('the hosted Worker must not reach node:child_process (src/record/sign.ts)');
  }
  const bytes = (result.outputFiles ?? [])[0]?.contents;
  if (bytes === undefined) throw new Error('esbuild wrote no output');
  const digest = createHash('sha256').update(bytes).digest('hex');
  mkdirSync(outdir, { recursive: true });
  writeFileSync(checkerPath, bytes);
  const workerPath = join(outdir, 'worker.mjs');
  writeFileSync(
    workerPath,
    `// Built by hosted/build/build.ts. checker.mjs is the hosted checker; this is its SHA-256.
import { createWorker } from './checker.mjs';

export default createWorker('${digest}');
`,
  );
  return { checkerPath, workerPath, digest, inputs, externals };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const built = await buildHosted();
  process.stdout.write(`${built.digest}  hosted/dist/checker.mjs\n`);
}

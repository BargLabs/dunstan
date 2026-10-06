// The offline boundary, after Cejel's offline-guarantee guard: src/advisory/, src/check/,
// src/record/, src/retrieval/, src/spec/, src/suggest/ and the `dunstan verify` path import no
// network module and use no fetch. Only src/evidence/ may.
//
// The guard does not read source text with regular expressions. It bundles the offline entry points
// with esbuild, which parses the TypeScript and resolves every import, and inspects the result:
//
// - the module graph (esbuild's metafile): no input under src/evidence/, no network-capable built-in
//   (http, https, http2, net, tls, dgram, dns, undici, worker_threads, cluster, inspector), no
//   module-loader built-in (module), and node:child_process only from src/record/sign.ts, the
//   ssh-keygen boundary;
// - the code: esbuild `define` replaces every free reference to an outbound global (fetch,
//   XMLHttpRequest, WebSocket, EventSource), a global object (globalThis, global, self, window, through
//   which a global can be reached by a computed name), or an opaque loader (require,
//   process.getBuiltinModule, process.binding) with a marker. A local binding of the same name is not
//   replaced; a free one is, wherever it appears. Markers are attributed to the first-party file whose
//   code contains them. A dynamic import() with a computed specifier is also refused.

import { readdirSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { join, relative, sep } from 'node:path';
import { buildSync, type Metafile } from 'esbuild';

export const OFFLINE_ROOTS = [
  'src/advisory',
  'src/check',
  'src/record',
  'src/retrieval',
  'src/spec',
  'src/suggest',
] as const;
export const OFFLINE_ENTRIES = ['src/cli/verify.ts'] as const;
export const SUBPROCESS_FILE = 'src/record/sign.ts';

const NETWORK_BUILTINS = new Set([
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'dns/promises',
  'undici',
  'worker_threads',
  'cluster',
  'inspector',
]);
const LOADER_BUILTINS = new Set(['module']);
const CAPABILITY_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'globalThis',
  'global',
  'self',
  'window',
  'require',
  'process.getBuiltinModule',
  'process.binding',
];

export interface Violation {
  file: string;
  kind:
    | 'reaches_evidence'
    | 'network_module'
    | 'loader_module'
    | 'subprocess_module'
    | 'capability_global'
    | 'computed_import';
  detail: string;
}

function marker(name: string): string {
  return `__DUNSTAN_OFFLINE_${name.replace('.', '_')}__`;
}

export function collectOfflineSources(repoRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(path);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.push(path);
      }
    }
  };
  for (const root of OFFLINE_ROOTS) walk(root);
  return [...out, ...OFFLINE_ENTRIES].sort();
}

function normalise(repoRoot: string, path: string): string {
  return relative(repoRoot, join(repoRoot, path)).split(sep).join('/');
}

export function findOfflineViolations(repoRoot: string, entries: readonly string[]): Violation[] {
  const define: Record<string, string> = {};
  for (const name of CAPABILITY_GLOBALS) define[name] = marker(name);
  const result = buildSync({
    absWorkingDir: repoRoot,
    entryPoints: [...entries],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outdir: 'offline-guard-out',
    define,
    logLevel: 'silent',
    minify: false,
  });
  const metafile = result.metafile as Metafile;
  const violations: Violation[] = [];

  for (const [input, info] of Object.entries(metafile.inputs)) {
    const file = normalise(repoRoot, input);
    if (file.startsWith('src/evidence/')) {
      violations.push({
        file,
        kind: 'reaches_evidence',
        detail: `${file} is in the offline graph`,
      });
    }
    for (const imported of info.imports) {
      if (imported.external !== true) continue;
      const specifier = imported.path;
      const name = specifier.replace(/^node:/, '');
      if (!isBuiltin(specifier)) {
        violations.push({ file, kind: 'network_module', detail: `external module ${specifier}` });
      } else if (NETWORK_BUILTINS.has(name)) {
        violations.push({ file, kind: 'network_module', detail: `imports ${specifier}` });
      } else if (LOADER_BUILTINS.has(name)) {
        violations.push({ file, kind: 'loader_module', detail: `imports ${specifier}` });
      } else if (name === 'child_process' && file !== SUBPROCESS_FILE) {
        violations.push({ file, kind: 'subprocess_module', detail: `imports ${specifier}` });
      }
    }
  }

  // esbuild heads each module's code with a `// <path>` comment in unminified output.
  for (const output of result.outputFiles ?? []) {
    let file = '(esbuild runtime)';
    for (const line of output.text.split('\n')) {
      const header = /^\/\/ ((?:src|node_modules)\/\S+)$/.exec(line);
      if (header !== null) {
        file = header[1] as string;
        continue;
      }
      if (!file.startsWith('src/')) continue;
      for (const name of CAPABILITY_GLOBALS) {
        if (line.includes(marker(name))) {
          violations.push({ file, kind: 'capability_global', detail: `uses global ${name}` });
        }
      }
      if (/\bimport\((?!\s*["'`])/.test(line)) {
        violations.push({
          file,
          kind: 'computed_import',
          detail: 'import() of a computed specifier',
        });
      }
    }
  }

  const seen = new Set<string>();
  return violations
    .filter((v) => {
      const key = `${v.file}|${v.kind}|${v.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.file + a.detail < b.file + b.detail ? -1 : 1));
}

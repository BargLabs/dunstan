// The checker's identity in a record (spec section 9.3): name, version, and the SHA-256 of the
// distributed artifact that ran. The artifact is the single-file bundle `pnpm build` writes to
// dist/dunstan.mjs, which carries the checker code, its dependencies and the two schemas from
// spec/schema/ (inlined at build time), so its digest covers everything that decides a verdict.

import { readFileSync } from 'node:fs';
import { sha256Hex } from '../spec/jcs.js';
import type { CheckerIdentity } from './build.js';

export const CHECKER_NAME = 'dunstan';

// Kept equal to package.json's version by src/record/record.test.ts.
export const CHECKER_VERSION = '0.1.2';

// `artifact` is the URL of the running entry module (import.meta.url). Run from the bundle, that is
// dist/dunstan.mjs. Run from source (tests), it is the entry .ts file, which identifies only that file.
export function checkerIdentity(artifact: string | URL): CheckerIdentity {
  return {
    name: CHECKER_NAME,
    version: CHECKER_VERSION,
    digest: { sha256: sha256Hex(readFileSync(new URL(artifact))) },
  };
}

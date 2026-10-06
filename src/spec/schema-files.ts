// Where the published schema files are read from: spec/schema/ on disk. The bundle build
// (scripts/build.mjs) replaces this one module with the same files' text, read from the same
// directory at build time, so the distributed checker carries the exact schemas its digest covers.
// There is no hand-written copy anywhere.

import { readFileSync } from 'node:fs';

export const SCHEMA_DIR = new URL('../../spec/schema/', import.meta.url);

export function schemaText(file: string): string {
  return readFileSync(new URL(file, SCHEMA_DIR), 'utf8');
}

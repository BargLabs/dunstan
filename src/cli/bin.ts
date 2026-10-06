// Entry point of the bundle (dist/dunstan.mjs). import.meta.url is the bundle itself, whose digest
// the record carries as checker.digest.

import { readFileSync } from 'node:fs';
import { main } from './main.js';

process.exitCode = await main(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  env: process.env,
  artifact: import.meta.url,
  readStdin: () => readFileSync(0),
  stdin: process.stdin,
  stdout: process.stdout,
});

// Entry point of the bundle dist/dunstan-eval.mjs.

import { evalMain } from './main.js';

process.exitCode = await evalMain(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});

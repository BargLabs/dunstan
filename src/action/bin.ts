// Entry point of the Action bundle (action/dist/index.mjs, which action.yml runs). import.meta.url is
// the bundle itself, whose digest the record carries as checker.digest.

import { runAction } from './run.js';

// A crash anywhere below leaves the step failed, never passed.
process.exitCode = 1;
const result = await runAction({
  env: process.env,
  artifact: import.meta.url,
  log: (line) => process.stdout.write(`${line}\n`),
});
process.exitCode = result.exitCode;

// dunstan suggest: lists the sentences in a report's prose that look like claims its block does not
// declare (src/suggest/). Offline, and needs no pull request. It exits 0 whatever it finds: it is
// never a verdict. Only a report that cannot be read is an error.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { suggestText } from '../suggest/suggest.js';
import { type CliIo, EXIT } from './output.js';

export async function suggest(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: { 'report-file': { type: 'string' } },
  });
  const file = values['report-file'];
  let bytes: Uint8Array;
  try {
    bytes = file === undefined || file === '-' ? io.readStdin() : readFileSync(file);
  } catch (e) {
    io.err(`dunstan: cannot read the report ${file ?? 'stdin'}: ${(e as Error).message}\n`);
    return EXIT.error;
  }
  io.out(suggestText(new TextDecoder('utf-8').decode(bytes)));
  return 0;
}

// dunstan verify: offline. Recomputes the claims, verdict and digests from block.value and evidence and
// compares them with the record byte for byte; optionally checks a detached SSH signature. It makes no
// network call, and src/__tests__/offline-guarantee.test.ts proves that nothing it imports can.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { verifySignature } from '../record/sign.js';
import { type VerifyProblem, verifyRecord } from '../record/verify.js';
import { canonicalize } from '../spec/jcs.js';
import { JsonReadError, type JsonValue, parseStrictJson } from '../spec/json.js';
import { type CliIo, UsageError } from './output.js';

export async function verify(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: { sig: { type: 'string' }, 'allowed-signers': { type: 'string' } },
  });
  if (positionals.length !== 1) throw new UsageError('dunstan verify <record.json>');
  const sig = values.sig;
  const allowed = values['allowed-signers'];
  if ((sig === undefined) !== (allowed === undefined)) {
    throw new UsageError('--sig and --allowed-signers go together');
  }

  const path = positionals[0] as string;
  const bytes = readFileSync(path);
  let value: JsonValue;
  try {
    value = parseStrictJson(new TextDecoder('utf-8').decode(bytes));
  } catch (e) {
    if (!(e instanceof JsonReadError)) throw e;
    io.out(`NOT verified: ${path} is not a JSON record (${e.code}: ${e.message})\n`);
    return 1;
  }

  const result = verifyRecord(value);
  const problems: VerifyProblem[] = [...result.problems];
  const assurance = result.record?.predicate.assurance;

  if (sig !== undefined && allowed !== undefined) {
    if (assurance?.status !== 'signed') {
      problems.push({ member: '/predicate/assurance', message: 'the record is not signed' });
    } else {
      if (bytes.toString('utf8') !== canonicalize(value)) {
        problems.push({
          member: '',
          message: 'a signed record must be stored as exactly its JCS bytes',
        });
      }
      const signature = verifySignature(bytes, sig, allowed, assurance.issuer);
      if (!signature.ok) {
        problems.push({
          member: '/predicate/assurance',
          message: `signature: ${signature.output}`,
        });
      } else {
        io.out(`signature: ${signature.output}\n`);
      }
    }
  } else if (assurance?.status === 'signed') {
    io.out('note: the record is signed; pass --sig and --allowed-signers to check the signature\n');
  }

  if (problems.length > 0) {
    io.out(`NOT verified: ${path}\n`);
    for (const problem of problems) io.out(`  ${problem.member || '/'}: ${problem.message}\n`);
    return 1;
  }
  const p = result.record?.predicate;
  io.out(
    `verified: ${path}: claims, verdict and digests recompute byte for byte (verdict ${p?.verdict}, ${p?.claims.length} claims)\n`,
  );
  return 0;
}

// Detached SSH signatures over a record's JCS bytes (spec section 11). This file is the only process
// boundary the checker core crosses: it runs `ssh-keygen`, and nothing else, with an argument vector
// (no shell). The offline guard (src/__tests__/offline-guarantee.test.ts) allows node:child_process
// here and nowhere else in the offline graph.

import { execFileSync } from 'node:child_process';
import { SIGNATURE_NAMESPACE } from '../spec/constants.js';

function sshKeygen(args: string[], input?: Uint8Array): string {
  return execFileSync('ssh-keygen', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(input === undefined ? {} : { input }),
  });
}

// "SHA256:<43 base64 characters>" for the key at `keyPath` (private or public).
export function keyFingerprint(keyPath: string): string {
  const out = sshKeygen(['-l', '-E', 'sha256', '-f', keyPath]);
  const match = /SHA256:[A-Za-z0-9+/]{43}/.exec(out);
  if (match === null) throw new Error(`ssh-keygen printed no SHA256 fingerprint for ${keyPath}`);
  return match[0];
}

// Writes `<recordPath>.sig` and returns its path.
export function signRecordFile(recordPath: string, keyPath: string): string {
  sshKeygen(['-Y', 'sign', '-n', SIGNATURE_NAMESPACE, '-f', keyPath, recordPath]);
  return `${recordPath}.sig`;
}

export interface SignatureCheck {
  ok: boolean;
  output: string;
}

export function verifySignature(
  recordBytes: Uint8Array,
  sigPath: string,
  allowedSignersPath: string,
  principal: string,
): SignatureCheck {
  try {
    const output = sshKeygen(
      [
        '-Y',
        'verify',
        '-f',
        allowedSignersPath,
        '-I',
        principal,
        '-n',
        SIGNATURE_NAMESPACE,
        '-s',
        sigPath,
      ],
      recordBytes,
    );
    return { ok: true, output: output.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || err.message };
  }
}

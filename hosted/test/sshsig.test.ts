// SSHSIG interop (spec section 11; docs/hosted.md, "Re-running a hosted record locally"): a
// signature the Worker code makes verifies with `ssh-keygen -Y verify`, and one `ssh-keygen -Y sign`
// makes verifies with the Worker code. Runs in CI on ubuntu-latest and macos-latest, each with its
// own OpenSSH.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { utf8 } from '../src/encoding.js';
import {
  keyFingerprint,
  parseOpenSshPrivateKey,
  publicKeyLine,
  SshKeyError,
  signSsh,
  verifySsh,
} from '../src/sshsig.js';
import { ROOT, SIGNER, sshSigningKey } from './support.js';

const NAMESPACE = 'dunstan-record';
const MESSAGE = '{"_type":"https://in-toto.io/Statement/v1","predicate":{"verdict":"pass"}}';

function sshKeygenVerify(
  key: ReturnType<typeof sshSigningKey>,
  message: string,
  signature: string,
  extra: string[] = [],
): { ok: boolean; output: string } {
  const sig = join(key.dir, 'message.sig');
  writeFileSync(sig, signature);
  try {
    const output = execFileSync(
      'ssh-keygen',
      [
        '-Y',
        'verify',
        '-f',
        key.allowedSigners,
        '-I',
        SIGNER,
        '-n',
        NAMESPACE,
        '-s',
        sig,
        ...extra,
      ],
      { input: message, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return { ok: true, output };
  } catch (e) {
    return { ok: false, output: String((e as { stderr?: string }).stderr ?? e) };
  }
}

describe('SSHSIG', () => {
  const key = sshSigningKey();
  const parsed = parseOpenSshPrivateKey(key.privateKey);

  it('reads the public key and fingerprint ssh-keygen reports', async () => {
    expect(publicKeyLine(parsed.publicKey)).toBe(key.publicLine);
    const printed = execFileSync(
      'ssh-keygen',
      ['-l', '-E', 'sha256', '-f', join(key.dir, 'signer')],
      {
        encoding: 'utf8',
      },
    );
    expect(printed).toContain(await keyFingerprint(parsed.publicKey));
  });

  it('signs so that ssh-keygen -Y verify accepts it', async () => {
    const signature = await signSsh(utf8.encode(MESSAGE), parsed, NAMESPACE);
    const result = sshKeygenVerify(key, MESSAGE, signature);
    expect(result.output).toContain('Good "dunstan-record" signature');
    expect(result.ok).toBe(true);
  });

  it('is refused by ssh-keygen for another message or another namespace', async () => {
    const signature = await signSsh(utf8.encode(MESSAGE), parsed, NAMESPACE);
    expect(sshKeygenVerify(key, `${MESSAGE} `, signature).ok).toBe(false);
    const other = await signSsh(utf8.encode(MESSAGE), parsed, 'file');
    expect(sshKeygenVerify(key, MESSAGE, other).ok).toBe(false);
  });

  it('verifies what ssh-keygen -Y sign writes', async () => {
    const file = join(key.dir, 'signed-by-ssh-keygen');
    writeFileSync(file, MESSAGE);
    execFileSync(
      'ssh-keygen',
      ['-Y', 'sign', '-n', NAMESPACE, '-f', join(key.dir, 'signer'), file],
      {
        stdio: 'pipe',
      },
    );
    const signature = readFileSync(`${file}.sig`, 'utf8');
    const result = await verifySsh(utf8.encode(MESSAGE), signature, NAMESPACE);
    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(publicKeyLine(result.publicKey as Uint8Array)).toBe(key.publicLine);
    expect((await verifySsh(utf8.encode(`${MESSAGE} `), signature, NAMESPACE)).ok).toBe(false);
    expect((await verifySsh(utf8.encode(MESSAGE), signature, 'file')).ok).toBe(false);
  });

  it('accepts the published revocation list, which is empty', async () => {
    const revocations = join(ROOT, 'docs/security/record-revocations');
    expect(readFileSync(revocations, 'utf8')).toBe('');
    const signature = await signSsh(utf8.encode(MESSAGE), parsed, NAMESPACE);
    expect(sshKeygenVerify(key, MESSAGE, signature, ['-r', revocations]).ok).toBe(true);
  });

  it('refuses an encrypted key and a key of another type', () => {
    const dir = sshSigningKey().dir;
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', 'secret', '-f', join(dir, 'locked')]);
    expect(() => parseOpenSshPrivateKey(readFileSync(join(dir, 'locked'), 'utf8'))).toThrow(
      SshKeyError,
    );
    execFileSync('ssh-keygen', ['-q', '-t', 'ecdsa', '-N', '', '-f', join(dir, 'ecdsa')]);
    expect(() => parseOpenSshPrivateKey(readFileSync(join(dir, 'ecdsa'), 'utf8'))).toThrow(
      /not ed25519/,
    );
  });
});

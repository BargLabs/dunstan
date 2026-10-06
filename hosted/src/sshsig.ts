// Detached SSH signatures (OpenSSH PROTOCOL.sshsig) with ed25519 keys, in TypeScript over WebCrypto,
// because a Worker cannot run ssh-keygen. The output is what `ssh-keygen -Y sign` writes, and
// `ssh-keygen -Y verify` accepts it; hosted/test/sshsig.test.ts proves both directions. Spec section 11:
// a record is signed over its JCS bytes, namespace `dunstan-record`.

import { base64, base64url, buffer, concat, fromBase64, pemBody, utf8 } from './encoding.js';

const MAGIC = utf8.encode('SSHSIG');
const KEY_TYPE = 'ssh-ed25519';
const HASH = 'sha512';
const ARMOR_BEGIN = '-----BEGIN SSH SIGNATURE-----';
const ARMOR_END = '-----END SSH SIGNATURE-----';

export class SshKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SshKeyError';
  }
}

// ---------------------------------------------------------------- SSH wire encoding (RFC 4251)

function uint32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

function sshString(value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === 'string' ? utf8.encode(value) : value;
  return concat(uint32(bytes.length), bytes);
}

class Reader {
  #at = 0;
  constructor(private readonly bytes: Uint8Array) {}
  uint32(): number {
    if (this.#at + 4 > this.bytes.length) throw new SshKeyError('truncated');
    const n = new DataView(this.bytes.buffer, this.bytes.byteOffset).getUint32(this.#at);
    this.#at += 4;
    return n;
  }
  raw(n: number): Uint8Array {
    if (this.#at + n > this.bytes.length) throw new SshKeyError('truncated');
    const out = this.bytes.subarray(this.#at, this.#at + n);
    this.#at += n;
    return out;
  }
  string(): Uint8Array {
    return this.raw(this.uint32());
  }
  text(): string {
    return new TextDecoder().decode(this.string());
  }
  get done(): boolean {
    return this.#at === this.bytes.length;
  }
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------- keys

export interface Ed25519Key {
  publicKey: Uint8Array;
  seed: Uint8Array;
}

// The SSH public key blob: string "ssh-ed25519", string key.
export function publicKeyBlob(publicKey: Uint8Array): Uint8Array {
  return concat(sshString(KEY_TYPE), sshString(publicKey));
}

// The line an authorized_keys or allowed_signers file carries.
export function publicKeyLine(publicKey: Uint8Array): string {
  return `${KEY_TYPE} ${base64(publicKeyBlob(publicKey))}`;
}

// "SHA256:<base64 without padding>", as `ssh-keygen -l -E sha256` prints it.
export async function keyFingerprint(publicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', buffer(publicKeyBlob(publicKey))),
  );
  return `SHA256:${base64(digest).replace(/=+$/, '')}`;
}

// An unencrypted OpenSSH private key ("openssh-key-v1") holding one ed25519 key.
export function parseOpenSshPrivateKey(text: string): Ed25519Key {
  const bytes = pemBody(text, 'OPENSSH PRIVATE KEY');
  if (bytes === null) throw new SshKeyError('not an OpenSSH private key');
  const magic = utf8.encode('openssh-key-v1\0');
  if (!equal(bytes.subarray(0, magic.length), magic)) throw new SshKeyError('not openssh-key-v1');
  const r = new Reader(bytes.subarray(magic.length));
  if (r.text() !== 'none' || r.text() !== 'none') {
    throw new SshKeyError('the signing key is encrypted; set it without a passphrase');
  }
  r.string(); // kdf options
  if (r.uint32() !== 1) throw new SshKeyError('expected exactly one key');
  const outerPublic = r.string();
  const p = new Reader(r.string());
  const check = p.uint32();
  if (p.uint32() !== check) throw new SshKeyError('check bytes differ');
  if (p.text() !== KEY_TYPE) throw new SshKeyError('the signing key is not ed25519');
  const publicKey = p.string();
  const secret = p.string();
  if (publicKey.length !== 32 || secret.length !== 64) throw new SshKeyError('bad ed25519 key');
  if (!equal(secret.subarray(32), publicKey) || !equal(outerPublic, publicKeyBlob(publicKey))) {
    throw new SshKeyError('the private and public halves differ');
  }
  return { publicKey: publicKey.slice(), seed: secret.slice(0, 32) };
}

// ---------------------------------------------------------------- signatures

async function digest(hash: string, message: Uint8Array): Promise<Uint8Array> {
  const name = hash === 'sha512' ? 'SHA-512' : hash === 'sha256' ? 'SHA-256' : null;
  if (name === null) throw new SshKeyError(`unsupported hash ${hash}`);
  return new Uint8Array(await crypto.subtle.digest(name, buffer(message)));
}

function signedData(namespace: string, hash: string, messageHash: Uint8Array): Uint8Array {
  return concat(
    MAGIC,
    sshString(namespace),
    sshString(''),
    sshString(hash),
    sshString(messageHash),
  );
}

function armor(blob: Uint8Array): string {
  const text = base64(blob);
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += 70) lines.push(text.slice(i, i + 70));
  return `${ARMOR_BEGIN}\n${lines.join('\n')}\n${ARMOR_END}\n`;
}

// The armored signature `ssh-keygen -Y sign -n <namespace>` would write for `message`.
export async function signSsh(
  message: Uint8Array,
  key: Ed25519Key,
  namespace: string,
): Promise<string> {
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'OKP', crv: 'Ed25519', d: base64url(key.seed), x: base64url(key.publicKey) },
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const data = signedData(namespace, HASH, await digest(HASH, message));
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, signingKey, buffer(data)),
  );
  return armor(
    concat(
      MAGIC,
      uint32(1),
      sshString(publicKeyBlob(key.publicKey)),
      sshString(namespace),
      sshString(''),
      sshString(HASH),
      sshString(concat(sshString(KEY_TYPE), sshString(signature))),
    ),
  );
}

export interface SignatureCheck {
  ok: boolean;
  // The signer's public key, when the signature parsed.
  publicKey?: Uint8Array;
  reason?: string;
}

// Verifies an armored SSH signature over `message` in `namespace`. It checks the signature only;
// whether the key is trusted is the caller's decision (an allowed-signers file for ssh-keygen).
export async function verifySsh(
  message: Uint8Array,
  armored: string,
  namespace: string,
): Promise<SignatureCheck> {
  try {
    const body = /-----BEGIN SSH SIGNATURE-----([\s\S]*?)-----END SSH SIGNATURE-----/.exec(armored);
    if (body === null) return { ok: false, reason: 'not an armored SSH signature' };
    const bytes = fromBase64(body[1] as string);
    if (!equal(bytes.subarray(0, 6), MAGIC)) return { ok: false, reason: 'not SSHSIG' };
    const r = new Reader(bytes.subarray(6));
    if (r.uint32() !== 1) return { ok: false, reason: 'unsupported SSHSIG version' };
    const keyReader = new Reader(r.string());
    if (keyReader.text() !== KEY_TYPE) return { ok: false, reason: 'not an ed25519 signature' };
    const publicKey = keyReader.string();
    if (r.text() !== namespace) return { ok: false, reason: 'wrong namespace' };
    r.string(); // reserved
    const hash = r.text();
    const sigReader = new Reader(r.string());
    if (sigReader.text() !== KEY_TYPE) return { ok: false, reason: 'not an ed25519 signature' };
    const signature = sigReader.string();
    if (!r.done) return { ok: false, reason: 'trailing bytes' };
    const verifyingKey = await crypto.subtle.importKey(
      'raw',
      buffer(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const data = signedData(namespace, hash, await digest(hash, message));
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      verifyingKey,
      buffer(signature),
      buffer(data),
    );
    return ok ? { ok, publicKey: publicKey.slice() } : { ok, reason: 'signature does not verify' };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

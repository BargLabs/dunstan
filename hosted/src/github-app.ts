// The GitHub App's own calls: an App JWT (RS256), an installation access token for one repository
// with read permissions only, and whether an installation still exists. Every call goes through the
// guarded transport.

import { base64url, buffer, concat, pemBody, utf8 } from './encoding.js';
import { GITHUB_API_ORIGIN, type GuardedTransport } from './transport.js';

// The App's permissions (docs/hosted.md, "Contents: read"): hosted/github-app-manifest.json
// declares exactly these, and every installation token asks for exactly these, so a token never
// carries more than read access even if the App were later granted more.
export const READ_PERMISSIONS = {
  actions: 'read',
  checks: 'read',
  contents: 'read',
  deployments: 'read',
  issues: 'read',
  metadata: 'read',
  pull_requests: 'read',
} as const;

const HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'dunstan-hosted',
};

function derLength(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

// GitHub issues App keys as PKCS#1 ("RSA PRIVATE KEY"); WebCrypto imports PKCS#8. The wrapping is
// fixed: version 0, the rsaEncryption algorithm identifier, the PKCS#1 key as an octet string.
function pkcs8OfPkcs1(pkcs1: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const algorithm = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  const key = concat(Uint8Array.of(0x04), derLength(pkcs1.length), pkcs1);
  const content = concat(version, algorithm, key);
  return concat(Uint8Array.of(0x30), derLength(content.length), content);
}

async function importAppKey(pem: string) {
  const pkcs8 = pemBody(pem, 'PRIVATE KEY');
  const pkcs1 = pemBody(pem, 'RSA PRIVATE KEY');
  const der = pkcs8 ?? (pkcs1 === null ? null : pkcs8OfPkcs1(pkcs1));
  if (der === null) throw new Error('GITHUB_APP_PRIVATE_KEY is not a PEM RSA private key');
  return crypto.subtle.importKey(
    'pkcs8',
    buffer(der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// An App JWT, valid from a minute ago (clock drift) for nine minutes (GitHub's limit is ten).
export async function appJwt(appId: string, privateKeyPem: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000) - 60;
  const segment = (value: unknown) => base64url(utf8.encode(JSON.stringify(value)));
  const unsigned = `${segment({ alg: 'RS256', typ: 'JWT' })}.${segment({ iat, exp: iat + 600, iss: appId })}`;
  const key = await importAppKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    buffer(utf8.encode(unsigned)),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

export interface AppCredentials {
  appId: string;
  privateKey: string;
}

export type TokenResult = { ok: true; token: string } | { ok: false; status: number };

// An installation token for one repository (its name; the owner is the installation's account),
// with read permissions only.
export async function installationToken(
  transport: GuardedTransport,
  app: AppCredentials,
  installationId: number,
  repositoryName: string,
  now: Date,
): Promise<TokenResult> {
  const jwt = await appJwt(app.appId, app.privateKey, now);
  const response = await transport.fetch(
    `${GITHUB_API_ORIGIN}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: { ...HEADERS, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ repositories: [repositoryName], permissions: READ_PERMISSIONS }),
    },
  );
  if (response.status !== 201) {
    await response.body?.cancel();
    return { ok: false, status: response.status };
  }
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== 'string') return { ok: false, status: 502 };
  return { ok: true, token: body.token };
}

// true or false when GitHub answered, null when it did not (the caller then decides nothing).
export async function installationExists(
  transport: GuardedTransport,
  app: AppCredentials,
  installationId: number,
  now: Date,
): Promise<boolean | null> {
  const jwt = await appJwt(app.appId, app.privateKey, now);
  const response = await transport.fetch(
    `${GITHUB_API_ORIGIN}/app/installations/${installationId}`,
    { headers: { ...HEADERS, authorization: `Bearer ${jwt}` } },
  );
  await response.body?.cancel();
  if (response.status === 200) return true;
  if (response.status === 404) return false;
  return null;
}

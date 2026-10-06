// The App's own calls: an RS256 JWT GitHub accepts (checked here with the public key), from the
// PKCS#1 key GitHub issues or a PKCS#8 one; and an installation token request for one repository
// with read permissions only.

import { createPrivateKey, createVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appJwt, installationToken, READ_PERMISSIONS } from '../src/github-app.js';
import { GuardedTransport } from '../src/transport.js';
import { appKey, fakeNetwork, INSTALLATION, recordedGitHub } from './support.js';

const NOW = new Date('2026-10-04T12:00:00Z');

function verifyJwt(jwt: string, publicKey: string): Record<string, unknown> {
  const [header, payload, signature] = jwt.split('.') as [string, string, string];
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
    alg: 'RS256',
    typ: 'JWT',
  });
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

describe('the GitHub App', () => {
  const key = appKey();

  it('signs an App JWT from the PKCS#1 key GitHub issues', async () => {
    const claims = verifyJwt(await appJwt('12345', key.privateKey, NOW), key.publicKey);
    const now = NOW.getTime() / 1000;
    expect(claims).toEqual({ iat: now - 60, exp: now + 540, iss: '12345' });
  });

  it('signs an App JWT from a PKCS#8 key', async () => {
    const pkcs8 = createPrivateKey(key.privateKey).export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    expect(pkcs8).toContain('BEGIN PRIVATE KEY');
    verifyJwt(await appJwt('12345', pkcs8, NOW), key.publicKey);
  });

  it('asks for a token for one repository, read permissions only', async () => {
    const network = fakeNetwork(recordedGitHub());
    let sent: unknown;
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return network.fetch(input, init);
    }) as typeof fetch;
    const result = await installationToken(
      new GuardedTransport(spy),
      { appId: '1', privateKey: key.privateKey },
      INSTALLATION,
      'example-repo',
      NOW,
    );
    expect(result).toEqual({ ok: true, token: 'ghs_16C7e42F292c6912E7710c838347Ae178B4a' });
    expect(sent).toEqual({ repositories: ['example-repo'], permissions: READ_PERMISSIONS });
    expect(network.requests[0]?.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

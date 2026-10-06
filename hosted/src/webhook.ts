// POST /v0.1/webhooks/github: GitHub's deliveries to the App. The signature (X-Hub-Signature-256,
// HMAC-SHA256 of the raw body under the webhook secret) is checked before anything is read.
// installation.created records the installation; installation.deleted deletes its keys and records
// at once (store.ts, deleteInstallation); installation_target.renamed follows the account's new
// login. Every other event is acknowledged and ignored.

import { buffer, hex, utf8 } from './encoding.js';
import type { Env } from './env.js';
import { HttpError, json, readBody } from './http.js';
import { addInstallation, deleteInstallation, renameInstallation } from './store.js';

const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;

function hexBytes(text: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(text)) return null;
  return Uint8Array.from(text.match(/../g) as string[], (h) => Number.parseInt(h, 16));
}

export async function webhookSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    buffer(utf8.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, buffer(utf8.encode(body)));
  return `sha256=${hex(new Uint8Array(mac))}`;
}

// Constant time: WebCrypto's verify compares the MAC.
async function signatureValid(
  secret: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  const presented = header === null ? null : hexBytes(header.replace(/^sha256=/, ''));
  if (header === null || !header.startsWith('sha256=') || presented === null) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    buffer(utf8.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, buffer(presented), buffer(utf8.encode(body)));
}

interface InstallationEvent {
  action?: unknown;
  installation?: { id?: unknown; account?: { login?: unknown } | null };
  // installation_target: the account the App is installed on.
  account?: { login?: unknown } | null;
}

function login(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new HttpError(400, 'bad_request', 'the delivery names no account');
  }
  return value;
}

export async function handleWebhook(request: Request, env: Env, now: Date): Promise<Response> {
  const body = await readBody(request, MAX_WEBHOOK_BYTES);
  if (
    !(await signatureValid(
      env.GITHUB_WEBHOOK_SECRET,
      body,
      request.headers.get('x-hub-signature-256'),
    ))
  ) {
    throw new HttpError(401, 'bad_signature', 'the webhook signature does not verify');
  }
  const event = request.headers.get('x-github-event');
  if (event !== 'installation' && event !== 'installation_target') {
    return json({ ignored: event }, 202);
  }

  let payload: InstallationEvent;
  try {
    payload = JSON.parse(body) as InstallationEvent;
  } catch {
    throw new HttpError(400, 'bad_request', 'the delivery is not JSON');
  }
  const id = payload.installation?.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'bad_request', 'the delivery names no installation');
  }
  if (event === 'installation_target') {
    if (payload.action !== 'renamed') return json({ ignored: `${event}.${payload.action}` }, 202);
    await renameInstallation(env.DB, id, login(payload.account?.login));
    return json({ installation: id, action: 'renamed' }, 202);
  }
  if (payload.action === 'created') {
    await addInstallation(env.DB, id, login(payload.installation?.account?.login), now);
    return json({ installation: id, action: 'created' }, 202);
  }
  if (payload.action === 'deleted') {
    const records = await deleteInstallation(env, id);
    return json({ installation: id, action: 'deleted', recordsDeleted: records }, 202);
  }
  return json({ ignored: `installation.${String(payload.action)}` }, 202);
}

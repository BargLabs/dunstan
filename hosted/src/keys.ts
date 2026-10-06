// API keys: `dunstan_` and 43 base64url characters (32 random bytes), issued per installation by the
// operator (hosted/scripts/issue-key.ts), shown once and stored only as their SHA-256.

import { sha256Hex } from '../../src/spec/jcs.js';

export const API_KEY = /^dunstan_[A-Za-z0-9_-]{43}$/;

export function hashApiKey(key: string): string {
  return sha256Hex(new TextEncoder().encode(key));
}

// The key a request presents as `Authorization: Bearer <key>`, or null.
export function presentedKey(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header === null ? null : /^Bearer (\S+)$/.exec(header);
  const key = match?.[1];
  return key !== undefined && API_KEY.test(key) ? key : null;
}

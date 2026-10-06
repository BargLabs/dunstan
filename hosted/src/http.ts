// Responses. An error is an HTTP status and `{error: {code, message}}`; it never carries a verdict.

import { concat } from './encoding.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function errorResponse(e: HttpError): Response {
  return json({ error: { code: e.code, message: e.message } }, e.status);
}

// The request body as text, refusing more than `limit` bytes as soon as it is past them.
export async function readBody(request: Request, limit: number): Promise<string> {
  const tooLarge = () => new HttpError(413, 'too_large', `the body is over ${limit} bytes`);
  if (Number(request.headers.get('content-length') ?? '0') > limit) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.length;
      if (size > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(chunk.value);
    }
  }
  const bytes = concat(...chunks);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(400, 'invalid_body', 'the body is not UTF-8');
  }
}

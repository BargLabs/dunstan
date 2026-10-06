// The one HTTP client the checker has. Every read of evidence goes through `read`, which records a
// source entry (spec section 6): kind, locator, SHA-256 of the response body as received, ETag, read
// time and, for a failed read, the error. Rate limits and server errors get a bounded backoff; when
// the bound is reached the read is recorded as failed and a warning is printed, never a guess.

import type { Source, SourceKind } from '../check/types.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { sha256Hex } from '../spec/jcs.js';

export const DEFAULT_API = 'https://api.github.com';

export type ReadError = `http_${number}` | 'network' | 'parse';

export type Read =
  | { ok: true; status: number; body: Uint8Array; json: unknown }
  | { ok: false; status: number | null; error: ReadError; body: Uint8Array };

export interface ClientOptions {
  token?: string | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  warn?: (message: string) => void;
  // Attempts per request, including the first.
  maxAttempts?: number;
  // The longest single wait for a rate-limit reset; a longer reset gives up at once.
  maxWaitMs?: number;
}

export interface ReadOptions {
  // Appended to the locator only (for example `#reports/junit.xml` for one file of an artifact).
  locatorSuffix?: string;
  // Reads that are not evidence (the report itself) are not recorded as sources.
  record?: boolean;
  // Parse the body as JSON (default) or keep it as bytes.
  json?: boolean;
  // POST and PATCH serve the GraphQL query and, in the Action, the check run it writes.
  method?: 'GET' | 'POST' | 'PATCH';
  requestBody?: string;
  locator?: string;
}

const EMPTY = new Uint8Array();

export class GitHubClient {
  readonly sources = new Map<string, Source>();
  readonly #token: string | undefined;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #warn: (message: string) => void;
  readonly #maxAttempts: number;
  readonly #maxWaitMs: number;

  constructor(options: ClientOptions = {}) {
    this.#token = options.token;
    this.#baseUrl = options.baseUrl ?? DEFAULT_API;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#warn = options.warn ?? ((message) => process.stderr.write(`dunstan: ${message}\n`));
    this.#maxAttempts = options.maxAttempts ?? 4;
    this.#maxWaitMs = options.maxWaitMs ?? 60_000;
  }

  get hasToken(): boolean {
    return this.#token !== undefined && this.#token !== '';
  }

  // Sources in code-unit order of kind, then of locator, one entry per locator (spec section 6).
  sortedSources(): Source[] {
    return [...this.sources.values()].sort((a, b) =>
      a.kind !== b.kind
        ? a.kind < b.kind
          ? -1
          : 1
        : a.locator < b.locator
          ? -1
          : a.locator > b.locator
            ? 1
            : 0,
    );
  }

  async read(kind: SourceKind, path: string, options: ReadOptions = {}): Promise<Read> {
    const method = options.method ?? 'GET';
    const locator = options.locator ?? `${method} ${path}${options.locatorSuffix ?? ''}`;
    const result = await this.#fetchWithRetry(method, path, options.requestBody, locator);
    let read: Read;
    if (result.kind === 'network') {
      read = { ok: false, status: null, error: 'network', body: EMPTY };
    } else if (result.status < 200 || result.status > 299) {
      read = {
        ok: false,
        status: result.status,
        error: `http_${result.status}`,
        body: result.body,
      };
    } else if (options.json === false) {
      read = { ok: true, status: result.status, body: result.body, json: null };
    } else {
      try {
        const json: unknown = JSON.parse(new TextDecoder().decode(result.body));
        read = { ok: true, status: result.status, body: result.body, json };
      } catch {
        read = { ok: false, status: result.status, error: 'parse', body: result.body };
      }
    }
    if (options.record !== false) {
      const source: Source = {
        kind,
        locator,
        sha256: sha256Hex(read.body),
        readAt: this.#now().toISOString(),
      };
      if (result.kind === 'response' && result.etag !== null) source.etag = result.etag;
      if (!read.ok) source.error = read.error;
      this.sources.set(locator, source);
    }
    return read;
  }

  // A read the caller found unusable after it succeeded (a body of the wrong shape) is recorded as a
  // parse failure, so the source entry agrees with the section's unreadable status.
  markParseError(locator: string): void {
    const source = this.sources.get(locator);
    if (source !== undefined) source.error = 'parse';
  }

  async #fetchWithRetry(
    method: string,
    path: string,
    body: string | undefined,
    locator: string,
  ): Promise<
    | { kind: 'response'; status: number; body: Uint8Array; etag: string | null }
    | { kind: 'network' }
  > {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': `dunstan/${CHECKER_VERSION}`,
    };
    if (this.hasToken) headers.authorization = `Bearer ${this.#token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${path}`, {
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          redirect: 'follow',
        });
      } catch (e) {
        if (attempt < this.#maxAttempts) {
          await this.#sleep(backoffMs(attempt));
          continue;
        }
        this.#warn(`${locator}: network error after ${attempt} attempts (${(e as Error).message})`);
        return { kind: 'network' };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const status = response.status;
      const wait = retryWaitMs(response, status, this.#now(), attempt);
      if (wait !== undefined && attempt < this.#maxAttempts && wait <= this.#maxWaitMs) {
        await this.#sleep(wait);
        continue;
      }
      if (wait !== undefined) {
        const why =
          wait > this.#maxWaitMs
            ? `rate limited for ${Math.ceil(wait / 1000)}s`
            : `${attempt} attempts`;
        this.#warn(`${locator}: giving up with HTTP ${status} (${why}); recorded as unreadable`);
      }
      return { kind: 'response', status, body: bytes, etag: response.headers.get('etag') };
    }
  }
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

// How long to wait before retrying, or undefined when the response is final.
function retryWaitMs(
  response: Response,
  status: number,
  now: Date,
  attempt: number,
): number | undefined {
  const retryAfter = response.headers.get('retry-after');
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  const rateLimited =
    status === 429 || (status === 403 && (remaining === '0' || retryAfter !== null));
  if (rateLimited) {
    if (retryAfter !== null && /^[0-9]+$/.test(retryAfter)) return Number(retryAfter) * 1000;
    if (reset !== null && /^[0-9]+$/.test(reset)) {
      return Math.max(0, Number(reset) * 1000 - now.getTime()) + 1000;
    }
    return backoffMs(attempt) * 8;
  }
  if (status >= 500 && status <= 599) return backoffMs(attempt);
  return undefined;
}

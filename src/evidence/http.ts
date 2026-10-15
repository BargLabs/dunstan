// The one HTTP client the checker has. Every read of evidence goes through `read`, which records a
// source entry (spec section 6): kind, locator, SHA-256 of the response body as received, ETag, read
// time and, for a failed read, the error. Rate limits and server errors get a bounded backoff; when
// the bound is reached the read is recorded as failed and a warning is printed, never a guess.
//
// Every body is read against a byte budget, never whole before its size is known: one over it is
// cancelled as soon as the bytes pulled pass the budget (or before a byte is pulled, when its
// content-length already does) and recorded as unreadable, with the SHA-256 of no bytes.

import type { Source, SourceKind } from '../check/types.js';
import { CHECKER_VERSION } from '../record/checker.js';
import { sha256Hex } from '../spec/jcs.js';
import { MAX_ENTRY_BYTES } from './zip.js';

export const DEFAULT_API = 'https://api.github.com';

// An artifact archive is read whole, because its central directory is at its end, so its budget is
// the archive's size, not its entry's. The selected entry may be up to MAX_ENTRY_BYTES (64 MiB)
// stored; deflate adds 5 bytes per 64 KiB block it cannot compress (about 5 KiB on 64 MiB), its
// local header at most 30 + 2 x 65,535 bytes, and the central directory's end record at most
// 22 + 65,535. The other 8 MiB is for the central directory and the small files an artifact
// carries beside its report. An archive that carries more is unreadable: upload the report as an
// artifact of its own.
export const MAX_ARCHIVE_BYTES = MAX_ENTRY_BYTES + 8 * 1024 * 1024;

// Every other answer. The largest the checker reads is a page of 100 issue comments (the report's
// listing): GitHub caps a comment body at 65,536 characters, which JSON writes in at most 6 bytes
// each (a `\u00XX` escape), so 100 bodies are at most 39,321,600 bytes (37.5 MiB), with each
// comment's few kilobytes of other members beside them. A page of 100 changed files, check runs,
// jobs, workflow runs or deployments carries no free text of that size. A files page and the
// compare answer can carry patches; one past this budget is unreadable, never guessed.
export const MAX_BODY_BYTES = 48 * 1024 * 1024;

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
  // The artifact archive's budget and the largest entry inflated from it: MAX_ARCHIVE_BYTES and
  // MAX_ENTRY_BYTES unless given. The hosted Worker gives lower ones (docs/hosted.md).
  maxArchiveBytes?: number;
  maxEntryBytes?: number;
  // Makes the buffer a body is read into; tests count what it is asked for.
  allocate?: (size: number) => Uint8Array;
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
  readonly maxArchiveBytes: number;
  readonly maxEntryBytes: number;
  readonly #allocate: (size: number) => Uint8Array;
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
    this.maxArchiveBytes = options.maxArchiveBytes ?? MAX_ARCHIVE_BYTES;
    this.maxEntryBytes = options.maxEntryBytes ?? MAX_ENTRY_BYTES;
    this.#allocate = options.allocate ?? ((size) => new Uint8Array(size));
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

  // `path` is the advisory's existence query (comparison 0.3.0), whose answers the advisory section
  // records. It is never evidence, so it is never a source entry.
  async read(kind: SourceKind | 'path', path: string, options: ReadOptions = {}): Promise<Read> {
    const method = options.method ?? 'GET';
    const locator = options.locator ?? `${method} ${path}${options.locatorSuffix ?? ''}`;
    const budget = kind === 'artifact' ? this.maxArchiveBytes : MAX_BODY_BYTES;
    const result = await this.#fetchWithRetry(method, path, options.requestBody, locator, budget);
    let read: Read;
    if (result.kind === 'network') {
      read = { ok: false, status: null, error: 'network', body: EMPTY };
    } else if (result.body === null) {
      // Over budget: a failed answer keeps its status; a 2xx answer is one the read cannot take.
      const failed = result.status < 200 || result.status > 299;
      read = {
        ok: false,
        status: result.status,
        error: failed ? `http_${result.status}` : 'parse',
        body: EMPTY,
      };
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
    if (options.record !== false && kind !== 'path') {
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
    budget: number,
  ): Promise<
    // `body` is null for a body over the budget, which is never read in full.
    | { kind: 'response'; status: number; body: Uint8Array | null; etag: string | null }
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
      const status = response.status;
      const wait = retryWaitMs(response, status, this.#now(), attempt);
      if (wait !== undefined && attempt < this.#maxAttempts && wait <= this.#maxWaitMs) {
        // The answer is discarded, so its body is never read.
        await cancel(response.body);
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
      const bytes = await readWithin(response, budget, this.#allocate);
      if (bytes === null) {
        this.#warn(
          `${locator}: answer over ${budget} bytes, not read in full; recorded as unreadable`,
        );
      }
      return { kind: 'response', status, body: bytes, etag: response.headers.get('etag') };
    }
  }
}

async function cancel(body: ReadableStream<Uint8Array> | null): Promise<void> {
  await body?.cancel().catch(() => {});
}

// The first buffer for a body that declares no length.
const FIRST_CAPACITY = 64 * 1024;

// The body's bytes, or null when it holds more than `budget`: refused before a byte is pulled when
// its content-length says so, else cancelled as soon as the bytes pulled pass the budget. A
// content-length that lies low changes nothing, since the bytes are counted as they arrive.
//
// The bytes go into one buffer as they arrive, never held as chunks and then copied, so a body near
// its budget peaks near the budget, not twice it: a buffer of the declared length when there is one,
// else (or once the body runs past it, as a compressed answer's decoded bytes do) one that doubles,
// and then takes the budget, never more. The bytes read are a view of it; their SHA-256 is the same
// however they arrived.
async function readWithin(
  response: Response,
  budget: number,
  allocate: (size: number) => Uint8Array,
): Promise<Uint8Array | null> {
  const length = response.headers.get('content-length');
  const declared = length !== null && /^[0-9]+$/.test(length) ? Number(length) : null;
  if (declared !== null && declared > budget) {
    await cancel(response.body);
    return null;
  }
  if (response.body === null) return EMPTY;
  const reader = response.body.getReader();
  let bytes: Uint8Array = EMPTY;
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    const needed = size + chunk.value.length;
    if (needed > budget) {
      await reader.cancel().catch(() => {});
      return null;
    }
    if (needed > bytes.length) {
      let capacity = Math.max(needed, 2 * bytes.length, FIRST_CAPACITY);
      // Once a buffer would pass half the budget, the next is the budget itself, so a buffer and
      // the one it grows into never hold more than one and a half times the budget together.
      if (2 * capacity > budget) capacity = budget;
      if (bytes === EMPTY && declared !== null && declared >= needed) capacity = declared;
      const grown = allocate(capacity);
      grown.set(bytes.subarray(0, size));
      bytes = grown;
    }
    bytes.set(chunk.value, size);
    size = needed;
  }
  return size === bytes.length ? bytes : bytes.subarray(0, size);
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

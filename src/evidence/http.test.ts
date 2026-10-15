// The client reads every answer against a byte budget (security review of 411180d, finding 1): an
// artifact archive against one, every other answer against another. A body past its budget is
// cancelled as soon as the bytes pulled pass it, or refused before a byte is pulled when its
// content-length already does, and the read is recorded as unreadable. An answer about to be retried
// is never read.

import { describe, expect, it } from 'vitest';
import { type CountingBody, countingBody, MiB } from '../__tests__/streams.js';
import { sha256Hex } from '../spec/jcs.js';
import { GitHubClient, MAX_ARCHIVE_BYTES, MAX_BODY_BYTES } from './http.js';
import { MAX_ENTRY_BYTES } from './zip.js';

// The budgets (src/evidence/http.ts): an artifact archive, and any other answer.
const ARCHIVE_BUDGET = 72 * MiB;
const BODY_BUDGET = 48 * MiB;

const ZIP = '/repos/example-org/example-repo/actions/artifacts/9001/zip';
const FILES = '/repos/example-org/example-repo/pulls/7/files?per_page=100&page=1';
const EMPTY_SHA256 = sha256Hex(new Uint8Array());

function clientFor(answers: (() => Response)[], options: { maxAttempts?: number } = {}) {
  const warnings: string[] = [];
  let n = 0;
  const fetch = (async () => {
    const answer = answers[Math.min(n++, answers.length - 1)] as () => Response;
    return answer();
  }) as typeof globalThis.fetch;
  const client = new GitHubClient({
    token: 't',
    fetch,
    sleep: async () => {},
    now: () => new Date('2026-10-15T12:00:00Z'),
    warn: (m) => warnings.push(m),
    ...options,
  });
  return { client, warnings };
}

function answer(body: CountingBody, status = 200, headers: Record<string, string> = {}) {
  return () => new Response(body.stream, { status, headers });
}

describe('a body read against its budget', () => {
  it('has an archive budget of the entry limit and 8 MiB, and a smaller one for the rest', () => {
    expect(MAX_ARCHIVE_BYTES).toBe(MAX_ENTRY_BYTES + 8 * MiB);
    expect(MAX_ARCHIVE_BYTES).toBe(ARCHIVE_BUDGET);
    expect(MAX_BODY_BYTES).toBe(BODY_BUDGET);
  });

  it('stops reading an artifact archive at its budget when no content-length is given', async () => {
    const body = countingBody([ARCHIVE_BUDGET + 24 * MiB]);
    const { client, warnings } = clientFor([answer(body)]);
    const read = await client.read('artifact', ZIP, { json: false, locatorSuffix: '#r.xml' });
    expect(read).toMatchObject({ ok: false, status: 200, error: 'parse' });
    expect(body.pulled).toBeLessThanOrEqual(ARCHIVE_BUDGET + MiB);
    expect(body.cancelled).toBe(true);
    expect(client.sources.get(`GET ${ZIP}#r.xml`)).toMatchObject({
      kind: 'artifact',
      sha256: EMPTY_SHA256,
      error: 'parse',
    });
    expect(warnings).toEqual([
      `GET ${ZIP}#r.xml: answer over ${ARCHIVE_BUDGET} bytes, not read in full; recorded as unreadable`,
    ]);
  });

  it('stops at the budget when the content-length lies low', async () => {
    const body = countingBody([ARCHIVE_BUDGET + 24 * MiB]);
    const { client } = clientFor([answer(body, 200, { 'content-length': '1000' })]);
    const read = await client.read('artifact', ZIP, { json: false });
    expect(read).toMatchObject({ ok: false, error: 'parse' });
    expect(body.pulled).toBeLessThanOrEqual(ARCHIVE_BUDGET + MiB);
    expect(body.cancelled).toBe(true);
  });

  it('refuses before a byte is pulled when the content-length is over the budget', async () => {
    const body = countingBody([ARCHIVE_BUDGET + 24 * MiB]);
    const length = String(ARCHIVE_BUDGET + 24 * MiB);
    const { client } = clientFor([answer(body, 200, { 'content-length': length })]);
    const read = await client.read('artifact', ZIP, { json: false });
    expect(read).toMatchObject({ ok: false, error: 'parse' });
    expect(body.pulled).toBe(0);
    expect(body.cancelled).toBe(true);
  });

  it('reads every other answer against the smaller budget', async () => {
    const body = countingBody([BODY_BUDGET + 16 * MiB]);
    const { client } = clientFor([answer(body)]);
    const read = await client.read('pull_request_files', FILES);
    expect(read).toMatchObject({ ok: false, status: 200, error: 'parse' });
    expect(body.pulled).toBeLessThanOrEqual(BODY_BUDGET + MiB);
    expect(body.cancelled).toBe(true);
    expect(client.sources.get(`GET ${FILES}`)?.sha256).toBe(EMPTY_SHA256);
  });

  it('reads an archive over the smaller budget and under its own whole', async () => {
    const body = countingBody([BODY_BUDGET + 2 * MiB]);
    const { client } = clientFor([answer(body)]);
    const read = await client.read('artifact', ZIP, { json: false });
    expect(read.ok).toBe(true);
    expect(read.body.length).toBe(BODY_BUDGET + 2 * MiB);
    expect(body.cancelled).toBe(false);
  });

  it('records a body under its budget, read in chunks, by the SHA-256 of its bytes as before', async () => {
    const text = '{"files":[{"filename":"src/a.ts"},{"filename":"src/b.ts"}]}';
    const bytes = new TextEncoder().encode(text);
    const body = countingBody([bytes.subarray(0, 7), bytes.subarray(7, 30), bytes.subarray(30)]);
    const { client, warnings } = clientFor([answer(body)]);
    const read = await client.read('pull_request_files', FILES);
    expect(read).toMatchObject({ ok: true, json: JSON.parse(text) });
    expect(client.sources.get(`GET ${FILES}`)?.sha256).toBe(sha256Hex(bytes));
    expect(body.pulled).toBe(bytes.length);
    expect(warnings).toEqual([]);
  });

  it('keeps the status of a failed answer whose body is over its budget', async () => {
    const body = countingBody([BODY_BUDGET + 16 * MiB]);
    const { client } = clientFor([answer(body, 404)]);
    const read = await client.read('pull_request_files', FILES);
    expect(read).toMatchObject({ ok: false, status: 404, error: 'http_404' });
    expect(body.pulled).toBeLessThanOrEqual(BODY_BUDGET + MiB);
    expect(client.sources.get(`GET ${FILES}`)?.sha256).toBe(EMPTY_SHA256);
  });
});

// 10AI: the bytes of a body are read into one buffer, never held as chunks and then copied, so a
// body near its budget peaks near the budget, not twice it. Every buffer the read makes is counted
// through the client's allocator.
describe('the buffer a body is read into', () => {
  function counted() {
    const sizes: number[] = [];
    const buffers: Uint8Array[] = [];
    const allocate = (size: number) => {
      sizes.push(size);
      const bytes = new Uint8Array(size);
      buffers.push(bytes);
      return bytes;
    };
    return { sizes, buffers, allocate };
  }

  function clientWith(response: () => Response, allocate: (size: number) => Uint8Array) {
    return new GitHubClient({
      token: 't',
      fetch: (async () => response()) as typeof fetch,
      sleep: async () => {},
      warn: () => {},
      allocate,
    });
  }

  it('is allocated once, at the declared length, for a body read in many chunks', async () => {
    const size = ARCHIVE_BUDGET - 4 * MiB;
    const body = countingBody([size]);
    const { sizes, buffers, allocate } = counted();
    const client = clientWith(answer(body, 200, { 'content-length': String(size) }), allocate);
    const read = await client.read('artifact', ZIP, { json: false });
    expect(read.ok).toBe(true);
    expect(read.body.length).toBe(size);
    expect(sizes).toEqual([size]);
    // Compared by identity: a failure would otherwise print the whole buffer.
    expect(read.body.buffer === buffers[0]?.buffer).toBe(true);
  });

  it('grows one buffer geometrically, never past the budget, when no length is declared', async () => {
    const size = ARCHIVE_BUDGET - 4 * MiB;
    const body = countingBody([size]);
    const { sizes, buffers, allocate } = counted();
    const read = await clientWith(answer(body), allocate).read('artifact', ZIP, { json: false });
    expect(read.ok).toBe(true);
    expect(read.body.length).toBe(size);
    expect(read.body.buffer === buffers.at(-1)?.buffer).toBe(true);
    // It doubles, then takes the budget once doubling would pass half of it.
    expect(sizes).toEqual([1, 2, 4, 8, 16, 32, 72].map((n) => n * MiB));
    // A buffer and the one it grows into hold at most one and a half times the budget together.
    for (let i = 1; i < sizes.length; i++) {
      expect((sizes[i - 1] as number) + (sizes[i] as number)).toBeLessThanOrEqual(
        1.5 * ARCHIVE_BUDGET,
      );
    }
  });

  it('grows past a declared length that lies low, and still cancels at the budget', async () => {
    const short = countingBody([3 * MiB]);
    const { sizes, allocate } = counted();
    const read = await clientWith(
      answer(short, 200, { 'content-length': String(MiB) }),
      allocate,
    ).read('artifact', ZIP, { json: false });
    expect(read.body.length).toBe(3 * MiB);
    expect(sizes).toEqual([MiB, 2 * MiB, 4 * MiB]);

    const long = countingBody([ARCHIVE_BUDGET + 24 * MiB]);
    const over = counted();
    const refused = await clientWith(
      answer(long, 200, { 'content-length': String(MiB) }),
      over.allocate,
    ).read('artifact', ZIP, { json: false });
    expect(refused).toMatchObject({ ok: false, error: 'parse' });
    expect(long.pulled).toBeLessThanOrEqual(ARCHIVE_BUDGET + MiB);
    expect(long.cancelled).toBe(true);
    expect(Math.max(...over.sizes)).toBeLessThanOrEqual(ARCHIVE_BUDGET);
  });

  it('returns a view of the bytes read when the body is shorter than declared', async () => {
    const bytes = new TextEncoder().encode('[{"filename":"src/a.ts"}]');
    const body = countingBody([bytes.subarray(0, 5), bytes.subarray(5)]);
    const { sizes, allocate } = counted();
    const client = clientWith(answer(body, 200, { 'content-length': '4096' }), allocate);
    const read = await client.read('pull_request_files', FILES);
    expect(read).toMatchObject({ ok: true, json: [{ filename: 'src/a.ts' }] });
    expect(sizes).toEqual([4096]);
    expect(client.sources.get(`GET ${FILES}`)?.sha256).toBe(sha256Hex(bytes));
  });

  it('records the same SHA-256 for a body under its budget however it is chunked or declared', async () => {
    const bytes = new Uint8Array(3 * MiB + 17).map((_, i) => (i * 31) % 251);
    const expected = sha256Hex(bytes);
    for (const [parts, headers] of [
      [[bytes], {}],
      [[bytes.subarray(0, 1), bytes.subarray(1, 70_000), bytes.subarray(70_000)], {}],
      [[bytes.subarray(0, MiB), bytes.subarray(MiB)], { 'content-length': String(bytes.length) }],
      [[bytes.subarray(0, MiB), bytes.subarray(MiB)], { 'content-length': '100' }],
    ] as [Uint8Array[], Record<string, string>][]) {
      const { allocate } = counted();
      const client = clientWith(answer(countingBody(parts), 200, headers), allocate);
      await client.read('artifact', ZIP, { json: false });
      expect(client.sources.get(`GET ${ZIP}`)?.sha256).toBe(expected);
    }
  });
});

describe('an artifact budget given to the client', () => {
  it('reads an archive against it, and the entry limit with it', async () => {
    const body = countingBody([24 * MiB]);
    const client = new GitHubClient({
      token: 't',
      fetch: (async () => new Response(body.stream)) as typeof fetch,
      sleep: async () => {},
      warn: () => {},
      maxArchiveBytes: 16 * MiB,
      maxEntryBytes: 8 * MiB,
    });
    const read = await client.read('artifact', ZIP, { json: false });
    expect([read.ok, read.status, read.ok ? null : read.error]).toEqual([false, 200, 'parse']);
    expect(body.pulled).toBeLessThanOrEqual(17 * MiB);
    expect(body.cancelled).toBe(true);
    expect(client.maxEntryBytes).toBe(8 * MiB);
  });

  it('defaults to the archive budget and the entry limit', () => {
    const client = new GitHubClient({ token: 't' });
    expect(client.maxArchiveBytes).toBe(MAX_ARCHIVE_BYTES);
    expect(client.maxEntryBytes).toBe(MAX_ENTRY_BYTES);
  });
});

describe('an answer about to be retried', () => {
  it('is cancelled unread', async () => {
    const first = countingBody([BODY_BUDGET + 16 * MiB]);
    const { client } = clientFor([answer(first, 503), () => new Response('[]')]);
    const read = await client.read('pull_request_files', FILES);
    expect(read).toMatchObject({ ok: true, json: [] });
    expect(first.pulled).toBe(0);
    expect(first.cancelled).toBe(true);
  });

  it('is cancelled unread when rate limited, and the last answer is read against the budget', async () => {
    const first = countingBody([BODY_BUDGET + 16 * MiB]);
    const last = countingBody([BODY_BUDGET + 16 * MiB]);
    const { client, warnings } = clientFor(
      [answer(first, 429, { 'retry-after': '1' }), answer(last, 503)],
      { maxAttempts: 2 },
    );
    const read = await client.read('pull_request_files', FILES);
    expect(read).toMatchObject({ ok: false, status: 503, error: 'http_503' });
    expect(first.pulled).toBe(0);
    expect(first.cancelled).toBe(true);
    expect(last.pulled).toBeLessThanOrEqual(BODY_BUDGET + MiB);
    expect(last.cancelled).toBe(true);
    expect(warnings[0]).toMatch(/giving up with HTTP 503/);
  });
});

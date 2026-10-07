// Artifact downloads are fetched with redirect: 'follow': GitHub answers the zip path with a 302 to a
// signed blob URL on another origin. The request carries `Authorization: Bearer <token>`, and that
// token must never reach the second origin. Node's fetch strips the header on a cross-origin
// redirect; nothing else pinned it until this test. Two loopback servers on different ports are two
// origins, and the real client downloads through them.

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { GitHubClient } from './http.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

describe('artifact download redirect', () => {
  it('does not forward the Authorization header to another origin', async () => {
    const seenByA: IncomingHttpHeaders[] = [];
    const seenByB: IncomingHttpHeaders[] = [];
    const portB = await listen((req, res) => {
      seenByB.push(req.headers);
      res.writeHead(200, { 'content-type': 'application/zip' });
      res.end('PK-body');
    });
    const portA = await listen((req, res) => {
      seenByA.push(req.headers);
      res.writeHead(302, { location: `http://127.0.0.1:${portB}/blob?sig=1` });
      res.end();
    });

    const client = new GitHubClient({
      token: 'secret-token',
      baseUrl: `http://127.0.0.1:${portA}`,
      warn: () => {},
    });
    const read = await client.read(
      'artifact',
      '/repos/example-org/example-repo/actions/artifacts/1/zip',
      {
        json: false,
      },
    );

    expect(read.ok).toBe(true);
    expect(new TextDecoder().decode(read.body)).toBe('PK-body');
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0]?.authorization).toBe('Bearer secret-token');
    expect(seenByB).toHaveLength(1);
    expect(seenByB[0]?.authorization).toBeUndefined();
  });
});

// Spec 0.1.3: GitHub answers the read of an issue transferred to another repository with a 301 to
// `/repositories/{id}/issues/{n}` on the same API. The real client follows it, and the reader records
// the identity the answer gives.
describe('issue read redirect', () => {
  const OLD = '/repos/example-org/example-repo/issues/17';
  const NEW = '/repositories/42/issues/4';

  async function issueServer(target: { status: number; body: string }) {
    const seen: { url: string | undefined; authorization: string | undefined }[] = [];
    const port = await listen((req, res) => {
      seen.push({ url: req.url, authorization: req.headers.authorization });
      if (req.url === OLD) {
        res.writeHead(301, { location: `http://127.0.0.1:${port}${NEW}` });
        res.end(JSON.stringify({ message: 'Moved Permanently' }));
        return;
      }
      res.writeHead(target.status, { 'content-type': 'application/json' });
      res.end(target.body);
    });
    const client = new GitHubClient({
      token: 'secret-token',
      baseUrl: `http://127.0.0.1:${port}`,
      sleep: async () => {},
      warn: () => {},
    });
    return { client, seen };
  }

  it('is followed on the same origin, with the token, and recorded under the name read', async () => {
    const body = JSON.stringify({
      number: 4,
      repository_url: 'https://api.github.com/repos/example-org/example-tracker',
    });
    const { client, seen } = await issueServer({ status: 200, body });
    const read = await client.read('issue', OLD);
    expect(read.ok).toBe(true);
    expect(read.ok && read.json).toEqual(JSON.parse(body));
    expect(seen).toEqual([
      { url: OLD, authorization: 'Bearer secret-token' },
      { url: NEW, authorization: 'Bearer secret-token' },
    ]);
    expect(client.sortedSources().map((s) => [s.kind, s.locator, s.error])).toEqual([
      ['issue', `GET ${OLD}`, undefined],
    ]);
  });

  it('whose target cannot be read leaves the read failed', async () => {
    const { client } = await issueServer({ status: 502, body: '{}' });
    const read = await client.read('issue', OLD);
    expect(read).toMatchObject({ ok: false, error: 'http_502' });
  });
});

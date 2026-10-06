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

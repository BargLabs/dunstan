// The route allowlist (docs/hosted.md, "Contents: read"): every blob, tree-content, contents/,
// readme, archive, tarball, zipball and raw-content route is refused before the request is made,
// and the allowlist is the only path from the hosted code to the network.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { CLOSING_QUERY, PATH_QUERY } from '../../src/evidence/github.js';
import {
  checkRoute,
  GuardedTransport,
  MEDIA_TYPE,
  ROUTES,
  RouteRefused,
} from '../src/transport.js';
import { CITED, HEAD, REPO, ROOT } from './support.js';

const API = 'https://api.github.com';
const BLOB = 'bbcd538c8e72b8c175046e27cc8f907076331401';

function spyNetwork() {
  const calls: string[] = [];
  const network = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { calls, network };
}

const FORBIDDEN: [string, string, string?][] = [
  ['git blob', `${API}/repos/${REPO}/git/blobs/${BLOB}`],
  ['git tree', `${API}/repos/${REPO}/git/trees/${HEAD}?recursive=1`],
  ['git tree (no sha)', `${API}/repos/${REPO}/git/trees`],
  ['contents of a file', `${API}/repos/${REPO}/contents/README.md`],
  ['contents of the root', `${API}/repos/${REPO}/contents`],
  ['contents at a ref', `${API}/repos/${REPO}/contents/src/index.ts?ref=${HEAD}`],
  ['readme', `${API}/repos/${REPO}/readme`],
  ['readme of a directory', `${API}/repos/${REPO}/readme/docs`],
  ['tarball', `${API}/repos/${REPO}/tarball/main`],
  ['tarball (default branch)', `${API}/repos/${REPO}/tarball`],
  ['zipball', `${API}/repos/${REPO}/zipball/${HEAD}`],
  ['organization migration archive', `${API}/orgs/example-org/migrations/1/archive`],
  ['user migration archive', `${API}/user/migrations/1/archive`],
  ['raw content host', `https://raw.githubusercontent.com/${REPO}/${HEAD}/README.md`],
  ['raw on github.com', `https://github.com/${REPO}/raw/${HEAD}/README.md`],
  ['codeload archive', `https://codeload.github.com/${REPO}/zip/refs/heads/main`],
  ['a commit with its patches', `${API}/repos/${REPO}/commits/${HEAD}`],
  ['a pull request diff', `${API}/repos/${REPO}/pulls/7`, 'application/vnd.github.diff'],
  ['a pull request patch', `${API}/repos/${REPO}/pulls/7`, 'application/vnd.github.patch'],
  ['a file read as raw', `${API}/repos/${REPO}/issues/7`, 'application/vnd.github.raw+json'],
  [
    'a dot segment into contents',
    `${API}/repos/${REPO}/actions/workflows/ci.yml/../../../contents/x`,
  ],
  [
    'an encoded separator into contents',
    `${API}/repos/${REPO}/actions/workflows/..%2F..%2Fcontents%2Fx/runs?head_sha=${HEAD}&per_page=100&page=1`,
  ],
  ['plain http', `http://api.github.com/repos/${REPO}/pulls/7`],
  ['credentials in the URL', `https://user:pass@api.github.com/repos/${REPO}/pulls/7`],
  ['a fragment', `${API}/repos/${REPO}/pulls/7#x`],
  // Each normalises to an admitted route; it is checked as written, and refused.
  ['a dot segment that normalises to a repository read', `${API}/repos/example-org/../issues/1`],
  ['an encoded dot segment', `${API}/repos/example-org/%2e%2e/issues/1`],
  ['a backslash', `${API}/repos/example-org\\example-repo/pulls/7`],
  ['a repository named ..', `${API}/repos/example-org/..`],
];

// Repositories whose names are words the forbidden list names are still readable.
const NAMED_LIKE_FORBIDDEN = ['archive', 'raw', 'readme', 'contents', 'tarball', 'zipball'];

describe('the route allowlist', () => {
  for (const [name, url, accept] of FORBIDDEN) {
    it(`refuses ${name} before any request is made`, async () => {
      const { calls, network } = spyNetwork();
      const transport = new GuardedTransport(network);
      await expect(
        transport.fetch(url, { headers: { accept: accept ?? MEDIA_TYPE } }),
      ).rejects.toThrow(RouteRefused);
      expect(calls).toEqual([]);
      expect(transport.refused).toHaveLength(1);
    });
  }

  it('refuses every forbidden route even if an allowlist entry matched it', () => {
    // The forbidden names are checked first; this is the property, stated against the list itself.
    for (const [, url, accept] of FORBIDDEN.filter(([, u]) => u.startsWith(API))) {
      expect(() => checkRoute('GET', url, undefined, accept ?? MEDIA_TYPE)).toThrow(RouteRefused);
    }
  });

  it('reads a repository or owner whose name is a forbidden word', () => {
    for (const name of NAMED_LIKE_FORBIDDEN) {
      for (const path of [`/repos/example-org/${name}/pulls/1`, `/repos/${name}/x/issues/2`]) {
        expect(checkRoute('GET', `${API}${path}`, undefined, MEDIA_TYPE).method).toBe('GET');
      }
      expect(() =>
        checkRoute('GET', `${API}/repos/example-org/${name}/${name}/x`, undefined, MEDIA_TYPE),
      ).toThrow(RouteRefused);
    }
  });

  it('admits GraphQL only for the closing-references query', async () => {
    const { calls, network } = spyNetwork();
    const transport = new GuardedTransport(network);
    const blobQuery = JSON.stringify({
      query:
        'query { repository(owner:"example-org", name:"example-repo") { object(expression:"HEAD:README.md") { ... on Blob { text } } } }',
    });
    await expect(
      transport.fetch(`${API}/graphql`, {
        method: 'POST',
        headers: { accept: MEDIA_TYPE },
        body: blobQuery,
      }),
    ).rejects.toThrow(/body is not the one allowed/);
    expect(calls).toEqual([]);
    const variables = { owner: 'example-org', name: 'example-repo', number: 7, after: null };
    for (const body of [
      // A duplicate query member: parsers disagree on which one wins.
      `{"query":${JSON.stringify(CLOSING_QUERY)},"query":"query { viewer { login } }","variables":${JSON.stringify(variables)}}`,
      JSON.stringify({ query: CLOSING_QUERY, variables, operationName: 'x' }),
      JSON.stringify({ query: CLOSING_QUERY, variables: { ...variables, extra: 1 } }),
      JSON.stringify({ query: CLOSING_QUERY, variables: {} }),
      JSON.stringify({ query: CLOSING_QUERY, variables }, null, 1),
    ]) {
      expect(() => checkRoute('POST', `${API}/graphql`, body, MEDIA_TYPE)).toThrow(RouteRefused);
    }
    await transport.fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { accept: MEDIA_TYPE },
      body: JSON.stringify({ query: CLOSING_QUERY, variables }),
    });
    expect(calls).toEqual([`${API}/graphql`]);
  });

  // Comparison 0.3.0: the second fixed GraphQL query, which reads the type of the object at
  // `<head>:<path>` and nothing of its content.
  it('admits the path query only as written, with a head and a repository path', async () => {
    const variables = {
      owner: 'example-org',
      name: 'example-repo',
      expression: `${HEAD}:src/a.ts`,
    };
    const { calls, network } = spyNetwork();
    const transport = new GuardedTransport(network);
    await transport.fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { accept: MEDIA_TYPE },
      body: JSON.stringify({ query: PATH_QUERY, variables }),
    });
    expect(calls).toEqual([`${API}/graphql`]);
    expect(transport.refused).toEqual([]);
    const withContent = PATH_QUERY.replace('{ __typename }', '{ __typename ... on Blob { text } }');
    const withTree = PATH_QUERY.replace('{ __typename }', '{ ... on Tree { entries { name } } }');
    for (const body of [
      JSON.stringify({ query: withContent, variables }),
      JSON.stringify({ query: withTree, variables }),
      JSON.stringify({ query: PATH_QUERY, variables: { ...variables, expression: 'HEAD:a.ts' } }),
      JSON.stringify({ query: PATH_QUERY, variables: { ...variables, expression: `main:a.ts` } }),
      JSON.stringify({ query: PATH_QUERY, variables: { ...variables, expression: `${HEAD}:` } }),
      JSON.stringify({ query: PATH_QUERY, variables: { ...variables, expression: `${HEAD}` } }),
      JSON.stringify({
        query: PATH_QUERY,
        variables: { ...variables, expression: `${HEAD}:../x` },
      }),
      JSON.stringify({
        query: PATH_QUERY,
        variables: { ...variables, expression: `${HEAD}:/a.ts` },
      }),
      JSON.stringify({
        query: PATH_QUERY,
        variables: { ...variables, expression: `${HEAD}:a//b` },
      }),
      JSON.stringify({ query: PATH_QUERY, variables: { ...variables, number: 7 } }),
      JSON.stringify({ query: PATH_QUERY, variables: { owner: 'example-org', name: 'x' } }),
      JSON.stringify({ query: PATH_QUERY, variables, operationName: 'x' }),
      JSON.stringify({ query: PATH_QUERY, variables }, null, 1),
      `{"query":${JSON.stringify(PATH_QUERY)},"query":"query { viewer { login } }","variables":${JSON.stringify(variables)}}`,
      // The closing-references query with the path query's variables, and the other way round.
      JSON.stringify({ query: CLOSING_QUERY, variables }),
      JSON.stringify({
        query: PATH_QUERY,
        variables: { owner: 'example-org', name: 'example-repo', number: 7, after: null },
      }),
    ]) {
      expect(() => checkRoute('POST', `${API}/graphql`, body, MEDIA_TYPE), body).toThrow(
        RouteRefused,
      );
    }
    // The route list names exactly two fixed GraphQL queries.
    expect(ROUTES.filter((r) => r.path.test('/graphql')).map((r) => r.name)).toEqual([
      'closing references (GraphQL)',
      'object type at a path (GraphQL)',
    ]);
  });

  it('admits each evidence read the reader makes', () => {
    const admitted = [
      `/repos/${REPO}/pulls/1347`,
      `/repos/${REPO}/pulls/1347/files?per_page=100&page=2`,
      `/repos/${REPO}`,
      `/repos/${REPO}/issues/17`,
      `/repos/${REPO}/git/commits/${CITED}`,
      `/repos/${REPO}/compare/${CITED}...${HEAD}?per_page=1`,
      `/repos/${REPO}/commits/${HEAD}/check-runs?filter=latest&per_page=100&page=1`,
      `/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${HEAD}&per_page=100&page=1`,
      `/repos/${REPO}/actions/runs/42/jobs?filter=latest&per_page=100&page=1`,
      `/repos/${REPO}/actions/runs/42/artifacts?name=junit-report&per_page=100&page=1`,
      `/repos/${REPO}/actions/artifacts/9/zip`,
      `/repos/${REPO}/deployments?environment=production&sha=${HEAD}&per_page=100&page=1`,
      `/repos/${REPO}/deployments?environment=production&per_page=100&page=1`,
      `/repos/${REPO}/deployments/5/statuses?per_page=100&page=1`,
      '/app/installations/1',
    ];
    for (const path of admitted) {
      expect(checkRoute('GET', `${API}${path}`, undefined, MEDIA_TYPE).method).toBe('GET');
    }
    expect(
      checkRoute('POST', `${API}/app/installations/1/access_tokens`, '{}', MEDIA_TYPE).name,
    ).toBe('installation access token');
  });

  it('follows an artifact download only to Actions storage, without the token', async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    const network = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
      });
      if (String(input).startsWith(API)) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://productionresultssa1.blob.core.windows.net/a?sig=x' },
        });
      }
      return new Response('zip', { status: 200 });
    }) as typeof fetch;
    const transport = new GuardedTransport(network);
    const response = await transport.fetch(`${API}/repos/${REPO}/actions/artifacts/9/zip`, {
      headers: { accept: MEDIA_TYPE, authorization: 'Bearer ghs_x' },
    });
    expect(await response.text()).toBe('zip');
    expect(calls).toEqual([
      { url: `${API}/repos/${REPO}/actions/artifacts/9/zip`, authorization: 'Bearer ghs_x' },
      { url: 'https://productionresultssa1.blob.core.windows.net/a?sig=x', authorization: null },
    ]);

    const elsewhere = new GuardedTransport(
      (async () =>
        new Response(null, {
          status: 302,
          headers: { location: `https://raw.githubusercontent.com/${REPO}/main/x` },
        })) as typeof fetch,
    );
    await expect(
      elsewhere.fetch(`${API}/repos/${REPO}/actions/artifacts/9/zip`, {
        headers: { accept: MEDIA_TYPE },
      }),
    ).rejects.toThrow(/not Actions artifact storage/);
  });

  // Spec 0.1.3: GitHub answers the read of an issue transferred to another repository with a 301 to
  // the issue's new identity. That redirect, from the issue route to another issue on the API, is the
  // only one followed besides the artifact download's.
  describe('the issue read redirect', () => {
    const ISSUE = `${API}/repos/${REPO}/issues/17`;
    const headers = { accept: MEDIA_TYPE, authorization: 'Bearer ghs_x' };
    const redirecting = (location: string, status = 301) => {
      const calls: { url: string; authorization: string | null; accept: string | null }[] = [];
      const network = (async (input: string | URL | Request, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        calls.push({
          url: String(input),
          authorization: h.get('authorization'),
          accept: h.get('accept'),
        });
        if (String(input) === ISSUE) return new Response(null, { status, headers: { location } });
        return new Response('{"number":4}', { status: 200 });
      }) as typeof fetch;
      return { calls, transport: new GuardedTransport(network) };
    };

    it('is followed to another issue on the API, with the request headers', async () => {
      for (const location of [
        `${API}/repositories/42/issues/4`,
        `${API}/repos/example-org/example-tracker/issues/4`,
      ]) {
        for (const status of [301, 302, 307, 308]) {
          const { calls, transport } = redirecting(location, status);
          const response = await transport.fetch(ISSUE, { headers });
          expect(response.status).toBe(200);
          expect(await response.text()).toBe('{"number":4}');
          expect(calls).toEqual([
            { url: ISSUE, authorization: 'Bearer ghs_x', accept: MEDIA_TYPE },
            { url: location, authorization: 'Bearer ghs_x', accept: MEDIA_TYPE },
          ]);
          expect(transport.refused).toEqual([]);
        }
      }
    });

    it('is refused anywhere else, before the second request is made', async () => {
      for (const location of [
        `${API}/repos/${REPO}/contents/README.md`,
        `${API}/repos/${REPO}/pulls/4`,
        `${API}/repos/${REPO}`,
        `${API}/repositories/42`,
        `${API}/repositories/42/contents/x`,
        `${API}/repositories/42/issues/4/comments`,
        `${API}/repositories/42/issues/4?per_page=100`,
        `${API}/repositories/42/issues/4#x`,
        `${API}/repositories/x/issues/4`,
        `${API}/repos/example-org/../issues/4`,
        `${API}/repos/example-org/%2e%2e/issues/4`,
        `${API}/repos/example-org/x/issues/..%2F..%2Fcontents`,
        `${API}/repos/example-org\\x/issues/4`,
        `/repositories/42/issues/4`,
        `//api.github.com/repositories/42/issues/4`,
        `http://api.github.com/repositories/42/issues/4`,
        `https://user:pass@api.github.com/repositories/42/issues/4`,
        `https://api.github.com:8443/repositories/42/issues/4`,
        `https://api.github.com.example.org/repositories/42/issues/4`,
        `https://github.com/${REPO}/issues/4`,
        `https://raw.githubusercontent.com/${REPO}/main/x`,
        'https://productionresultssa1.blob.core.windows.net/a?sig=x',
      ]) {
        const { calls, transport } = redirecting(location);
        await expect(transport.fetch(ISSUE, { headers }), location).rejects.toThrow(RouteRefused);
        expect(calls.map((c) => c.url)).toEqual([ISSUE]);
        expect(transport.refused, location).toHaveLength(1);
      }
    });

    it('stops after three hops, and the read is left a redirect, never followed further', async () => {
      const calls: string[] = [];
      const network = (async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response(null, {
          status: 301,
          headers: { location: `${API}/repositories/42/issues/${calls.length + 1}` },
        });
      }) as typeof fetch;
      const response = await new GuardedTransport(network).fetch(ISSUE, { headers });
      expect(response.status).toBe(301);
      expect(calls).toHaveLength(4);
    });

    it('is followed from no other route', async () => {
      for (const url of [
        `${API}/repos/${REPO}`,
        `${API}/repos/${REPO}/pulls/7`,
        `${API}/repos/${REPO}/git/commits/${CITED}`,
      ]) {
        const calls: string[] = [];
        const network = (async (input: string | URL | Request) => {
          calls.push(String(input));
          return new Response(null, {
            status: 301,
            headers: { location: `${API}/repositories/42/issues/4` },
          });
        }) as typeof fetch;
        const response = await new GuardedTransport(network).fetch(url, { headers });
        expect(response.status).toBe(301);
        expect(calls).toEqual([url]);
      }
      // An artifact download still redirects only to Actions storage.
      const artifact = new GuardedTransport(
        (async () =>
          new Response(null, {
            status: 302,
            headers: { location: `${API}/repositories/42/issues/4` },
          })) as typeof fetch,
      );
      await expect(
        artifact.fetch(`${API}/repos/${REPO}/actions/artifacts/9/zip`, { headers }),
      ).rejects.toThrow(/not Actions artifact storage/);
    });
  });

  it('has no allowlist entry that a forbidden name would match', () => {
    for (const route of ROUTES) {
      expect(route.path.source).not.toMatch(
        /blobs|trees|contents|readme|archive|tarball|zipball|raw/,
      );
    }
  });
});

describe('the only path to the network', () => {
  // As src/__tests__/offline-boundary.ts does for the offline graph: bundle the Worker's code with
  // every free reference to an outbound global replaced by a marker, and see which files hold one.
  const GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'connect'];
  const marker = (name: string) => `__DUNSTAN_HOSTED_${name}__`;

  it('names the global fetch only in transport.ts (and src/evidence/http.ts, whose default it overrides)', () => {
    const define: Record<string, string> = {};
    for (const name of GLOBALS) define[name] = marker(name);
    const result = buildSync({
      absWorkingDir: ROOT,
      entryPoints: ['hosted/src/app.ts'],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'node',
      format: 'esm',
      external: ['node:*'],
      outdir: 'hosted-guard-out',
      define,
      logLevel: 'silent',
    });
    const users = new Set<string>();
    let file = '(runtime)';
    for (const line of (result.outputFiles?.[0]?.text ?? '').split('\n')) {
      const header = /^\/\/ ((?:src|hosted|node_modules)\/\S+)$/.exec(line);
      if (header !== null) {
        file = header[1] as string;
        continue;
      }
      for (const name of GLOBALS) if (line.includes(marker(name))) users.add(`${file} ${name}`);
    }
    expect([...users].sort()).toEqual([
      'hosted/src/transport.ts fetch',
      'src/evidence/http.ts fetch',
    ]);
    // No socket or network module is in the graph.
    const externals = Object.values(result.metafile?.inputs ?? {}).flatMap((i) =>
      i.imports.filter((m) => m.external === true).map((m) => m.path),
    );
    for (const name of ['cloudflare:sockets', 'node:http', 'node:https', 'node:net', 'node:tls']) {
      expect(externals).not.toContain(name);
    }
  });

  it('hands the platform fetch only to a GuardedTransport, and the reader only the transport', () => {
    const dir = join(ROOT, 'hosted/src');
    const sources = readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const);
    for (const [file, text] of sources) {
      const network = [...text.matchAll(/deps\.network/g)].length;
      const guarded = [...text.matchAll(/new GuardedTransport\(deps\.network\b/g)].length;
      expect(network, file).toBe(guarded);
      const clients = [...text.matchAll(/new GitHubClient\(\{[^}]*\}/g)].map((m) => m[0]);
      for (const client of clients) expect(client, file).toMatch(/fetch: transport\.fetch/);
      if (file !== 'transport.ts' && file !== 'app.ts') {
        expect(text, file).not.toMatch(/platformFetch/);
      }
    }
    const app = sources.find(([f]) => f === 'app.ts')?.[1] ?? '';
    expect(app).toMatch(/network: platformFetch/);
  });
});

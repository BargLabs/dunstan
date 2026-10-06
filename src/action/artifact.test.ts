import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZipEntry } from '../evidence/zip.js';
import { sha256Hex } from '../spec/jcs.js';
import { ArtifactError, backendIds, uploadArtifact, writeZip } from './artifact.js';

const text = (s: string) => new TextEncoder().encode(s);
const files = [
  { name: 'dunstan-record.json', bytes: text('{"_type":"x"}\n') },
  { name: 'dunstan-record.json.sig', bytes: text('-----BEGIN SSH SIGNATURE-----\n') },
];

function token(scp: string): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ scp })}.sig`;
}

describe('writeZip', () => {
  it('writes an archive the reader and unzip both read back, the same bytes every time', () => {
    const zip = writeZip(files);
    expect(new TextDecoder().decode(readZipEntry(zip, 'dunstan-record.json') ?? undefined)).toBe(
      '{"_type":"x"}\n',
    );
    expect(readZipEntry(zip, 'dunstan-record.json.sig')).toEqual(files[1]?.bytes);
    expect(sha256Hex(writeZip(files))).toBe(sha256Hex(zip));
    const path = join(mkdtempSync(join(tmpdir(), 'dunstan-zip-')), 'a.zip');
    writeFileSync(path, zip);
    expect(execFileSync('unzip', ['-t', path], { encoding: 'utf8' })).toMatch(/No errors detected/);
  });
});

describe('backendIds', () => {
  it('reads the run and job backend ids from the Actions.Results scope', () => {
    expect(backendIds(token('Actions.GenericRead:x Actions.Results:run-1:job-2'))).toEqual({
      run: 'run-1',
      job: 'job-2',
    });
    expect(() => backendIds(token('Actions.GenericRead:x'))).toThrow(ArtifactError);
    expect(() => backendIds('not-a-token')).toThrow(ArtifactError);
  });
});

describe('uploadArtifact', () => {
  const env = {
    ACTIONS_RUNTIME_TOKEN: token('Actions.Results:run-1:job-2'),
    ACTIONS_RESULTS_URL: 'https://results.example/',
  };

  it('creates, uploads and finalizes the artifact', async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] =
      [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body,
      });
      if (url.endsWith('/CreateArtifact')) {
        return Response.json({ ok: true, signed_upload_url: 'https://blob.example/up?sig=1' });
      }
      if (url.startsWith('https://blob.example/')) return new Response(null, { status: 201 });
      if (url.endsWith('/FinalizeArtifact')) return Response.json({ ok: true, artifact_id: '42' });
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const uploaded = await uploadArtifact(env, fetchFn, 'dunstan-record', files);
    const zip = writeZip(files);
    expect(uploaded).toEqual({ id: '42', size: zip.length, sha256: sha256Hex(zip) });
    expect(calls.map((c) => `${c.method} ${c.url.replace(/\?.*$/, '')}`)).toEqual([
      'POST https://results.example/twirp/github.actions.results.api.v1.ArtifactService/CreateArtifact',
      'PUT https://blob.example/up',
      'POST https://results.example/twirp/github.actions.results.api.v1.ArtifactService/FinalizeArtifact',
    ]);
    expect(JSON.parse(String(calls[0]?.body))).toEqual({
      workflow_run_backend_id: 'run-1',
      workflow_job_run_backend_id: 'job-2',
      name: 'dunstan-record',
      version: 4,
    });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${env.ACTIONS_RUNTIME_TOKEN}`);
    expect(calls[1]?.headers['x-ms-blob-type']).toBe('BlockBlob');
    expect(calls[1]?.body).toEqual(zip);
    expect(JSON.parse(String(calls[2]?.body))).toEqual({
      workflow_run_backend_id: 'run-1',
      workflow_job_run_backend_id: 'job-2',
      name: 'dunstan-record',
      size: String(zip.length),
      hash: `sha256:${sha256Hex(zip)}`,
    });
  });

  it('fails outside a JavaScript action step, and when the service refuses', async () => {
    const never = (async () => {
      throw new Error('no request expected');
    }) as typeof fetch;
    await expect(uploadArtifact({}, never, 'dunstan-record', files)).rejects.toThrow(
      /ACTIONS_RUNTIME_TOKEN or ACTIONS_RESULTS_URL is not set/,
    );
    const conflict = (async () =>
      new Response('{"msg":"artifact already exists"}', { status: 409 })) as typeof fetch;
    await expect(uploadArtifact(env, conflict, 'dunstan-record', files)).rejects.toThrow(
      /CreateArtifact failed: HTTP 409/,
    );
  });
});

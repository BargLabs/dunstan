// Uploads the record as a workflow artifact without a dependency: a stored (uncompressed) ZIP, and
// the three calls of GitHub's artifact service (version 4) that actions/upload-artifact makes:
// CreateArtifact, a PUT of the ZIP to the signed blob URL it returns, and FinalizeArtifact. The runner
// gives a JavaScript action ACTIONS_RUNTIME_TOKEN and ACTIONS_RESULTS_URL for this.

import { crc32 } from 'node:zlib';
import { sha256Hex } from '../spec/jcs.js';

export interface ZipFile {
  name: string;
  bytes: Uint8Array;
}

// Fixed 1980-01-01 00:00 timestamps, so the same files give the same archive.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 0x0800;

export function writeZip(files: readonly ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.bytes) >>> 0;
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, UTF8_NAMES, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, DOS_TIME, true);
    l.setUint16(12, DOS_DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, file.bytes.length, true);
    l.setUint32(22, file.bytes.length, true);
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, UTF8_NAMES, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, file.bytes.length, true);
    c.setUint32(24, file.bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, file.bytes);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export class ArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactError';
  }
}

// The run and job backend ids the artifact service keys an artifact by, from the runtime token's
// `scp` claim (`Actions.Results:<run backend id>:<job backend id>`).
export function backendIds(token: string): { run: string; job: string } {
  let claims: { scp?: unknown };
  try {
    const payload = token.split('.')[1] ?? '';
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new ArtifactError('ACTIONS_RUNTIME_TOKEN is not a readable token');
  }
  const scopes = typeof claims.scp === 'string' ? claims.scp.split(' ') : [];
  for (const scope of scopes) {
    const parts = scope.split(':');
    if (parts[0] === 'Actions.Results' && parts.length === 3 && parts[1] && parts[2]) {
      return { run: parts[1], job: parts[2] };
    }
  }
  throw new ArtifactError('ACTIONS_RUNTIME_TOKEN carries no Actions.Results scope');
}

const SERVICE = 'github.actions.results.api.v1.ArtifactService';

async function twirp(
  fetchFn: typeof fetch,
  resultsUrl: string,
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${resultsUrl.replace(/\/+$/, '')}/twirp/${SERVICE}/${method}`;
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      last = `network error (${(e as Error).message})`;
      continue;
    }
    const text = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new ArtifactError(`${method} answered with a body that is not JSON`);
      }
    }
    last = `HTTP ${response.status} ${text.slice(0, 200)}`;
    if (response.status < 500) break;
  }
  throw new ArtifactError(`${method} failed: ${last}`);
}

export interface UploadedArtifact {
  id: string;
  size: number;
  sha256: string;
}

export async function uploadArtifact(
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch,
  name: string,
  files: readonly ZipFile[],
): Promise<UploadedArtifact> {
  const token = env.ACTIONS_RUNTIME_TOKEN;
  const resultsUrl = env.ACTIONS_RESULTS_URL;
  if (token === undefined || token === '' || resultsUrl === undefined || resultsUrl === '') {
    throw new ArtifactError(
      'ACTIONS_RUNTIME_TOKEN or ACTIONS_RESULTS_URL is not set: not running as a JavaScript action step',
    );
  }
  const ids = backendIds(token);
  const zip = writeZip(files);
  const sha256 = sha256Hex(zip);

  const created = await twirp(fetchFn, resultsUrl, token, 'CreateArtifact', {
    workflow_run_backend_id: ids.run,
    workflow_job_run_backend_id: ids.job,
    name,
    version: 4,
  });
  const uploadUrl = created.signed_upload_url ?? created.signedUploadUrl;
  if (created.ok !== true || typeof uploadUrl !== 'string') {
    throw new ArtifactError('CreateArtifact did not return an upload URL');
  }

  const put = await fetchFn(uploadUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'zip' },
    body: zip,
  });
  if (!put.ok) {
    throw new ArtifactError(`blob upload failed: HTTP ${put.status}`);
  }

  const finalized = await twirp(fetchFn, resultsUrl, token, 'FinalizeArtifact', {
    workflow_run_backend_id: ids.run,
    workflow_job_run_backend_id: ids.job,
    name,
    size: String(zip.length),
    hash: `sha256:${sha256}`,
  });
  const id = finalized.artifact_id ?? finalized.artifactId;
  if (finalized.ok !== true || (typeof id !== 'string' && typeof id !== 'number')) {
    throw new ArtifactError('FinalizeArtifact did not confirm the artifact');
  }
  return { id: String(id), size: zip.length, sha256 };
}

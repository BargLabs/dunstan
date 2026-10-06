// POST /v0.1/check: the same checker as `dunstan check`. The pull request, the evidence and the
// record come from src/pipeline/check-pull-request.ts unchanged; what is hosted is only how the
// reader reaches GitHub (an installation token and the route allowlist) and where the record is kept.
//
// Request: {repository, pullRequest, block | report, reportSource?} with `Authorization: Bearer
// <key>`. `report` is the report text, read exactly as `dunstan check --report-file` reads a file.
// `block` is a handback block as JSON; it is embedded as the report
// "```dunstan-handback\n<its JCS bytes>\n```\n", so the same record comes from `dunstan check
// --report-file` on that text. `reportSource` is the caller's own name for where the report came
// from, recorded as the report's locator (kind `api`).
//
// Response: {verdict, claimsTable, record, signature, rerun, id, expiresAt}. `record` is the signed
// record's exact bytes (JCS, spec section 11) as a string; `signature` is the detached SSH signature
// over them. Any failure is an HTTP error with no verdict and no record.

import { renderRecord } from '../../src/cli/output.js';
import { type PullRequestRead, PullRequestUnreadable } from '../../src/evidence/github.js';
import { GitHubClient } from '../../src/evidence/http.js';
import type { Report } from '../../src/evidence/report.js';
import {
  checkPullRequest,
  type EvidenceReaders,
  githubReaders,
} from '../../src/pipeline/check-pull-request.js';
import {
  type CheckerIdentity,
  type DunstanRecord,
  serializeRecord,
} from '../../src/record/build.js';
import { BLOCK_INFO_STRING, SIGNATURE_NAMESPACE } from '../../src/spec/constants.js';
import { CanonicalizationError, canonicalize, sha256Hex } from '../../src/spec/jcs.js';
import { JsonReadError, type JsonValue, parseStrictJson } from '../../src/spec/json.js';
import { utf8 } from './encoding.js';
import type { Env } from './env.js';
import { installationToken } from './github-app.js';
import { HttpError, json, readBody } from './http.js';
import { hashApiKey, presentedKey } from './keys.js';
import { keyFingerprint, parseOpenSshPrivateKey, signSsh } from './sshsig.js';
import {
  expiresAt,
  type Installation,
  installationActive,
  installationForKey,
  putRecord,
} from './store.js';
import { GuardedTransport, RouteRefused } from './transport.js';

export const MAX_REQUEST_BYTES = 1024 * 1024;
// The repository shape `dunstan check --repo` accepts, less the names `.` and `..`, which GitHub
// never gives a repository and a URL would resolve as a path step.
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;
const PULL_REQUEST = /^[1-9][0-9]{0,9}$/;

export interface Deps {
  checker: CheckerIdentity;
  // The platform fetch, handed only to the guarded transport.
  network: typeof fetch;
  now: () => Date;
  // The reader's backoff between retries; tests make it immediate.
  sleep?: (ms: number) => Promise<void>;
  // Tests stand a fixture's evidence in for GitHub, as the CLI's parity tests do. In the Worker
  // this is absent and the readers are githubReaders over the guarded transport.
  readers?: (client: GitHubClient) => EvidenceReaders;
}

export interface CheckRequest {
  repository: string;
  pullRequest: number;
  report: Report;
}

function badRequest(message: string): HttpError {
  return new HttpError(400, 'bad_request', message);
}

// The report a posted block stands for (see the head of this file).
export function reportTextOfBlock(block: JsonValue): string {
  return `\`\`\`${BLOCK_INFO_STRING}\n${canonicalize(block)}\n\`\`\`\n`;
}

export function parseCheckRequest(requestBody: string): CheckRequest {
  let body: JsonValue;
  try {
    body = parseStrictJson(requestBody);
  } catch (e) {
    if (e instanceof JsonReadError) throw badRequest(`the body is not strict JSON: ${e.message}`);
    throw e;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('the body is not a JSON object');
  }
  const allowed = new Set(['repository', 'pullRequest', 'block', 'report', 'reportSource']);
  const unknown = Object.keys(body).filter((k) => !allowed.has(k));
  if (unknown.length > 0) throw badRequest(`unknown member ${unknown[0]}`);
  const { repository, pullRequest, block, report, reportSource } = body;
  if (typeof repository !== 'string' || !REPOSITORY.test(repository)) {
    throw badRequest('repository must be owner/name');
  }
  if (typeof pullRequest !== 'number' || !PULL_REQUEST.test(String(pullRequest))) {
    throw badRequest('pullRequest must be a positive integer');
  }
  if ((block === undefined) === (report === undefined)) {
    throw badRequest('send exactly one of block and report');
  }
  if (
    reportSource !== undefined &&
    (typeof reportSource !== 'string' || reportSource.length === 0 || reportSource.length > 200)
  ) {
    throw badRequest('reportSource must be a string of 1 to 200 characters');
  }
  let text: string;
  if (report !== undefined) {
    if (typeof report !== 'string') throw badRequest('report must be a string');
    text = report;
  } else {
    try {
      text = reportTextOfBlock(block as JsonValue);
    } catch (e) {
      if (e instanceof CanonicalizationError) throw badRequest(`block: ${e.message}`);
      throw e;
    }
  }
  return {
    repository,
    pullRequest,
    report: {
      bytes: utf8.encode(text),
      source: {
        kind: 'api',
        locator: reportSource ?? `POST /v0.1/check#${report !== undefined ? 'report' : 'block'}`,
      },
    },
  };
}

export async function authenticate(request: Request, env: Env): Promise<Installation> {
  const key = presentedKey(request);
  const installation = key === null ? null : await installationForKey(env.DB, hashApiKey(key));
  if (installation === null)
    throw new HttpError(401, 'unauthorized', 'a valid API key is required');
  return installation;
}

// The status a pull request read that failed answers with: GitHub's own 403 or 404 when the
// installation cannot read it, 502 for anything else (GitHub erred, or answered in another shape).
function unreadableStatus(client: GitHubClient, repository: string, number: number): number {
  const error = client.sources.get(`GET /repos/${repository}/pulls/${number}`)?.error;
  return error === 'http_404' || error === 'http_403' ? Number(error.slice(5)) : 502;
}

export function recordFileName(repository: string, number: number): string {
  return `dunstan-${repository.replace('/', '-')}-${number}.json`;
}

export function rerunOf(file: string): Record<string, string> {
  return {
    file,
    save: `jq -j .record response.json > ${file} && jq -j .signature response.json > ${file}.sig`,
    offline: `dunstan verify ${file} --sig ${file}.sig --allowed-signers record-signers`,
    online: `dunstan rerun ${file}`,
  };
}

async function runCheck(
  env: Env,
  deps: Deps,
  installation: Installation,
  request: CheckRequest,
): Promise<DunstanRecord> {
  const { repository, pullRequest: number } = request;
  const [owner, name] = repository.split('/') as [string, string];
  // An installation token reads the installation's own account; another owner is not readable.
  if (owner.toLowerCase() !== installation.account.toLowerCase()) {
    throw new HttpError(404, 'not_readable', `the installation cannot read ${repository}`);
  }
  const transport = new GuardedTransport(deps.network, deps.sleep);
  const token = await installationToken(
    transport,
    { appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY },
    installation.id,
    name,
    deps.now(),
  );
  if (!token.ok) {
    // 404 and 422: the repository is not in the installation; 401 and 403: the App or the
    // installation cannot be used.
    if (token.status === 404 || token.status === 422) {
      throw new HttpError(404, 'not_readable', `the installation cannot read ${repository}`);
    }
    if (token.status === 401 || token.status === 403) {
      throw new HttpError(403, 'installation_unavailable', 'the installation cannot be used');
    }
    throw new HttpError(502, 'github_error', `GitHub answered ${token.status} for a token`);
  }

  const client = new GitHubClient({
    token: token.token,
    fetch: transport.fetch,
    now: deps.now,
    sleep: transport.sleep,
    warn: () => {},
  });
  const readers = deps.readers?.(client) ?? githubReaders(client);
  const signing = parseOpenSshPrivateKey(env.RECORD_SIGNING_KEY);
  let record: DunstanRecord;
  try {
    record = await checkPullRequest({
      readers,
      repository,
      number,
      report: async (_: PullRequestRead) => request.report,
      checker: deps.checker,
      recordFile: recordFileName(repository, number),
      assurance: {
        status: 'signed',
        issuer: env.RECORD_SIGNER,
        keyFingerprint: await keyFingerprint(signing.publicKey),
      },
    });
  } catch (e) {
    if (e instanceof PullRequestUnreadable) {
      const status = unreadableStatus(client, repository, number);
      throw new HttpError(
        status,
        status === 502 ? 'github_error' : 'not_readable',
        status === 502
          ? `GitHub did not answer for ${repository}#${number}`
          : `the installation cannot read ${repository}#${number}`,
      );
    }
    if (e instanceof RouteRefused) throw refused(transport);
    throw e;
  }
  // A refused route the reader recorded as unreadable is still a defect, not evidence.
  if (transport.refused.length > 0) throw refused(transport);
  return record;
}

function refused(transport: GuardedTransport): HttpError {
  return new HttpError(500, 'route_refused', `refused: ${transport.refused[0]}`);
}

export async function handleCheck(request: Request, env: Env, deps: Deps): Promise<Response> {
  const installation = await authenticate(request, env);
  const parsed = parseCheckRequest(await readBody(request, MAX_REQUEST_BYTES));
  const record = await runCheck(env, deps, installation, parsed);

  const bytes = serializeRecord(record);
  const signature = await signSsh(
    utf8.encode(bytes),
    parseOpenSshPrivateKey(env.RECORD_SIGNING_KEY),
    SIGNATURE_NAMESPACE,
  );
  const id = sha256Hex(utf8.encode(bytes));
  let expiry: string | null = null;
  if (installation.retentionDays > 0) {
    // Uninstalled while the check ran: nothing is stored, and nothing is returned.
    if (!(await installationActive(env.DB, installation.id))) {
      throw new HttpError(403, 'installation_unavailable', 'the installation cannot be used');
    }
    await putRecord(env.RECORDS, installation.id, { id, record: bytes, signature });
    expiry = expiresAt(deps.now(), installation.retentionDays).toISOString();
  }
  return json({
    verdict: record.predicate.verdict,
    claimsTable: renderRecord(record),
    record: bytes,
    signature,
    rerun: rerunOf(recordFileName(parsed.repository, parsed.pullRequest)),
    id: expiry === null ? null : id,
    expiresAt: expiry,
  });
}

// The hosted API, v0.1. Four routes:
//
//   POST /v0.1/check              check one pull request against a report or block (check.ts)
//   GET  /v0.1/records/:id        a stored record, within its installation's retention
//   POST /v0.1/webhooks/github    the GitHub App's installation events (webhook.ts)
//   GET  /v0.1/health             the checker's version and digest, and the spec version
//
// and the scheduled sweep that enforces retention and finishes uninstalls (store.ts).

import { CHECKER_NAME, CHECKER_VERSION } from '../../src/record/checker.js';
import { SPEC_VERSION } from '../../src/spec/constants.js';
import { authenticate, type Deps, handleCheck, recordFileName, rerunOf } from './check.js';
import type { Env, ScheduledContext } from './env.js';
import { installationExists } from './github-app.js';
import { errorResponse, HttpError, json } from './http.js';
import { getRecord, type SweepReport, sweep } from './store.js';
import { GuardedTransport, platformFetch } from './transport.js';
import { handleWebhook } from './webhook.js';

export type { Deps } from './check.js';

async function handleRecord(request: Request, env: Env, deps: Deps, id: string): Promise<Response> {
  const installation = await authenticate(request, env);
  const found = await getRecord(env.RECORDS, installation, id, deps.now());
  if (found === null) throw new HttpError(404, 'not_found', 'no record with that id is held');
  const record = JSON.parse(found.stored.record) as {
    predicate: { subject: { repository: string; pullRequest: number } };
  };
  const subject = record.predicate.subject;
  return json({
    id,
    record: found.stored.record,
    signature: found.stored.signature,
    rerun: rerunOf(recordFileName(subject.repository, subject.pullRequest)),
    expiresAt: found.expiresAt.toISOString(),
  });
}

function health(deps: Deps): Response {
  return json({ status: 'ok', checker: deps.checker, spec: SPEC_VERSION });
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (pathname === '/v0.1/health') {
    if (method === 'GET') return health(deps);
  } else if (pathname === '/v0.1/check') {
    if (method === 'POST') return handleCheck(request, env, deps);
  } else if (pathname === '/v0.1/webhooks/github') {
    if (method === 'POST') return handleWebhook(request, env, deps.now());
  } else {
    const record = /^\/v0\.1\/records\/([^/]+)$/.exec(pathname);
    if (record === null) throw new HttpError(404, 'not_found', `no route ${pathname}`);
    if (method === 'GET') return handleRecord(request, env, deps, record[1] as string);
  }
  throw new HttpError(405, 'method_not_allowed', `${method} is not allowed on ${pathname}`);
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  try {
    return await route(request, env, deps);
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    // Nothing about the failure is returned but that it happened; never a verdict.
    console.error('dunstan-hosted: internal error', e);
    return errorResponse(new HttpError(500, 'internal', 'internal error'));
  }
}

export async function scheduledSweep(env: Env, deps: Deps): Promise<SweepReport> {
  const transport = new GuardedTransport(deps.network);
  const app = { appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY };
  return sweep(env, deps.now(), (id) => installationExists(transport, app, id, deps.now()));
}

// The Worker. `digest` is the SHA-256 of the bundle this code runs from (hosted/build/build.ts).
export function createWorker(digest: string) {
  const checker = { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: digest } };
  const deps = (): Deps => ({ checker, network: platformFetch, now: () => new Date() });
  return {
    fetch(request: Request, env: Env): Promise<Response> {
      return handle(request, env, deps());
    },
    scheduled(_controller: unknown, env: Env, ctx: ScheduledContext): void {
      ctx.waitUntil(scheduledSweep(env, deps()));
    },
  };
}

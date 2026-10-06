// The `dunstan` check run on the pull request's head commit, and the lookup of the check run of the
// job the Action runs in. These are writes and reads about the Action's own run, not evidence, so
// none of them is recorded as a source.
//
// The Action creates its check run in progress before it reads any evidence, so that run is the
// latest `dunstan` run on the commit, and excludes it and its own job's run from the counted check
// runs (spec section 7.5): a checker running inside a check run excludes that run.

import type { GitHubClient } from '../evidence/http.js';
import type { Conclusion } from './outcome.js';

export const CHECK_NAME = 'dunstan';

export type CheckRunResult = { ok: true; id: number } | { ok: false; error: string };

function idOf(json: unknown): number | undefined {
  const id = (json as { id?: unknown } | null)?.id;
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : undefined;
}

export async function createCheckRun(
  client: GitHubClient,
  repository: string,
  headSha: string,
  body: Record<string, unknown>,
): Promise<CheckRunResult> {
  const read = await client.read('check_runs', `/repos/${repository}/check-runs`, {
    record: false,
    method: 'POST',
    requestBody: JSON.stringify({ name: CHECK_NAME, head_sha: headSha, ...body }),
  });
  if (!read.ok) return { ok: false, error: read.error };
  const id = idOf(read.json);
  return id === undefined ? { ok: false, error: 'parse' } : { ok: true, id };
}

export async function completeCheckRun(
  client: GitHubClient,
  repository: string,
  id: number,
  conclusion: Conclusion,
  output: { title: string; summary: string },
): Promise<CheckRunResult> {
  const read = await client.read('check_runs', `/repos/${repository}/check-runs/${id}`, {
    record: false,
    method: 'PATCH',
    requestBody: JSON.stringify({ status: 'completed', conclusion, output }),
  });
  return read.ok ? { ok: true, id } : { ok: false, error: read.error };
}

// The check run of the job this step runs in: the run attempt's in-progress job on this runner.
// Undefined when it cannot be told, which the Action reports in a note.
export async function ownJobCheckRun(
  client: GitHubClient,
  repository: string,
  env: Record<string, string | undefined>,
): Promise<number | undefined> {
  const runId = env.GITHUB_RUN_ID;
  const attempt = env.GITHUB_RUN_ATTEMPT ?? '1';
  const runner = env.RUNNER_NAME;
  if (runId === undefined || runner === undefined) return undefined;
  const matches: number[] = [];
  for (let page = 1; page <= 10; page++) {
    const read = await client.read(
      'workflow_runs',
      `/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100&page=${page}`,
      { record: false },
    );
    if (!read.ok) return undefined;
    const jobs = (read.json as { jobs?: unknown } | null)?.jobs;
    if (!Array.isArray(jobs)) return undefined;
    for (const job of jobs as Record<string, unknown>[]) {
      if (job.status !== 'in_progress' || job.runner_name !== runner) continue;
      const fromUrl = /\/check-runs\/([0-9]+)$/.exec(String(job.check_run_url ?? ''))?.[1];
      const id = fromUrl === undefined ? idOf(job) : Number(fromUrl);
      if (id !== undefined) matches.push(id);
    }
    if (jobs.length < 100) break;
  }
  return matches.length === 1 ? matches[0] : undefined;
}

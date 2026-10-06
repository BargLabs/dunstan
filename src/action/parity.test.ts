// Parity: the Action is the same checker as the CLI. For every acceptance fixture, `dunstan check`
// and the Action's core entry point, each with the evidence reader stubbed to the fixture's
// evidence, write byte-identical records; and their claims, verdict and digests are the acceptance
// run's (the line criterion (d) compares across machines). Runs for both a pr-body and a file
// report source.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  determinismLine,
  FIXTURE_REPOSITORY,
  type FixtureCase,
  loadCases,
  runCase,
} from '../acceptance/fixtures.js';
import { main } from '../cli/main.js';
import type { EvidenceReaders } from '../pipeline/check-pull-request.js';
import type { DunstanRecord } from '../record/build.js';
import { RECORD_FILE, runAction } from './run.js';

const cases = [...loadCases('controls'), ...loadCases('planted')];

function stubbedReaders(c: FixtureCase): EvidenceReaders {
  return {
    pullRequest: async () => ({
      evidence: structuredClone(c.evidence.pullRequest),
      repository: FIXTURE_REPOSITORY,
      body: c.report.toString('utf8'),
    }),
    evidence: async () => structuredClone(c.evidence),
  };
}

// The Action's own writes (its check run) answered; nothing else is reachable.
const actionFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const path = new URL(String(input)).pathname;
  if (path.endsWith('/check-runs') && init?.method === 'POST') {
    return Response.json({ id: 1 }, { status: 201 });
  }
  if (/\/check-runs\/1$/.test(path) && init?.method === 'PATCH') return Response.json({ id: 1 });
  return new Response('{"message":"Not Found"}', { status: 404 });
}) as typeof fetch;

type Source = 'pr-body' | 'file';

async function viaCli(c: FixtureCase, source: Source, dir: string, report: string) {
  const out = join(dir, 'cli', RECORD_FILE);
  mkdirSync(join(dir, 'cli'), { recursive: true });
  const code = await main(
    [
      'check',
      '--repo',
      FIXTURE_REPOSITORY,
      '--pr',
      String(c.evidence.pullRequest.number),
      ...(source === 'pr-body' ? ['--report-pr-body'] : ['--report-file', report]),
      '--out',
      out,
    ],
    {
      out: () => {},
      err: () => {},
      env: {},
      artifact: import.meta.url,
      readers: () => stubbedReaders(c),
      readStdin: () => new Uint8Array(),
    },
  );
  return { code, bytes: readFileSync(out, 'utf8') };
}

async function viaAction(c: FixtureCase, source: Source, dir: string, report: string) {
  const event = join(dir, 'event.json');
  writeFileSync(
    event,
    JSON.stringify({
      pull_request: {
        number: c.evidence.pullRequest.number,
        head: { sha: c.evidence.pullRequest.headSha, repo: { full_name: FIXTURE_REPOSITORY } },
        base: { repo: { full_name: FIXTURE_REPOSITORY } },
      },
    }),
  );
  const result = await runAction({
    env: {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: event,
      GITHUB_REPOSITORY: FIXTURE_REPOSITORY,
      RUNNER_TEMP: join(dir, 'action'),
      'INPUT_REPORT-SOURCE': source === 'pr-body' ? 'pr-body' : `file:${report}`,
      'INPUT_GITHUB-TOKEN': 'test-token',
    },
    artifact: import.meta.url,
    fetch: actionFetch,
    readers: () => stubbedReaders(c),
    upload: async () => ({ id: '1', size: 0, sha256: '' }),
    log: () => {},
  });
  return { result, bytes: readFileSync(result.recordPath as string, 'utf8') };
}

describe('parity: the Action and dunstan check write the same record', () => {
  it('covers every acceptance fixture', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  for (const source of ['pr-body', 'file'] as const) {
    it.each(cases.map((c) => [`${c.set}/${c.name}`, c] as const))(
      `%s (${source})`,
      async (_, c) => {
        const dir = mkdtempSync(join(tmpdir(), 'dunstan-parity-'));
        const report = join(dir, 'report.md');
        writeFileSync(report, c.report);

        const cli = await viaCli(c, source, dir, report);
        const action = await viaAction(c, source, dir, report);
        expect(action.bytes).toBe(cli.bytes);

        const record = JSON.parse(cli.bytes) as DunstanRecord;
        expect(determinismLine(c, record)).toBe(determinismLine(c, runCase(c)));

        const verdict = record.predicate.verdict;
        expect(action.result.outcome.verdict).toBe(verdict);
        expect(cli.code).toBe({ pass: 0, fail: 1, unverifiable: 2 }[verdict]);
        expect(action.result.outcome.conclusion).toBe(verdict === 'pass' ? 'success' : 'failure');
        expect(action.result.exitCode).toBe(verdict === 'pass' ? 0 : 1);
      },
    );
  }
});

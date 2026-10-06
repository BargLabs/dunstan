import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import type { AdvisorySection } from '../advisory/advise.js';
import { ADVISORY_LINE, advisoryLine } from '../advisory/present.js';
import type { DunstanRecord } from '../record/build.js';
import { verifyRecord } from '../record/verify.js';
import { extractHandbackBlock } from '../spec/extract.js';
import type { ZipFile } from './artifact.js';
import { readEvent } from './event.js';
import { ActionError, parseInputs, parseReportSource } from './inputs.js';
import { conclusionFor, renderSummary } from './outcome.js';
import { ARTIFACT_NAME, RECORD_FILE, runAction } from './run.js';

const JOB_RUN_ID = 9001;
const block = (files: string[], extra = '') =>
  `Done.\n\n\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${HEAD}","filesChanged":${JSON.stringify(files)}${extra}}\n\`\`\`\n`;

describe('conclusion mapping', () => {
  it('concludes success only for pass', () => {
    expect(conclusionFor('pass', 'failure')).toBe('success');
    expect(conclusionFor('pass', 'neutral')).toBe('success');
    expect(conclusionFor('fail', 'failure')).toBe('failure');
    expect(conclusionFor('fail', 'neutral')).toBe('failure');
    expect(conclusionFor('unverifiable', 'failure')).toBe('failure');
    expect(conclusionFor('unverifiable', 'neutral')).toBe('neutral');
  });
});

describe('inputs', () => {
  it('reads the three report sources and nothing else', () => {
    expect(parseReportSource('pr-body')).toEqual({ kind: 'pr-body' });
    expect(parseReportSource('comment:agent-bot')).toEqual({
      kind: 'comment',
      author: 'agent-bot',
    });
    expect(parseReportSource('comment:my-agent[bot]')).toEqual({
      kind: 'comment',
      author: 'my-agent[bot]',
    });
    expect(parseReportSource('file:reports/handback.md')).toEqual({
      kind: 'file',
      path: 'reports/handback.md',
    });
    for (const bad of ['', 'body', 'comment:', 'comment:bad login', 'file:', 'auto']) {
      expect(() => parseReportSource(bad)).toThrow(ActionError);
    }
  });

  it('defaults unverifiable-conclusion to failure and accepts only failure or neutral', () => {
    const env = { 'INPUT_REPORT-SOURCE': 'pr-body' };
    expect(parseInputs(env).unverifiableConclusion).toBe('failure');
    expect(
      parseInputs({ ...env, 'INPUT_UNVERIFIABLE-CONCLUSION': 'neutral' }).unverifiableConclusion,
    ).toBe('neutral');
    expect(() => parseInputs({ ...env, 'INPUT_UNVERIFIABLE-CONCLUSION': 'success' })).toThrow(
      /failure or neutral/,
    );
    expect(() => parseInputs({ ...env, 'INPUT_SIGN-KEY-PATH': '/k' })).toThrow(/go together/);
  });

  it('defaults advisory to false and accepts only true or false', () => {
    const env = { 'INPUT_REPORT-SOURCE': 'pr-body' };
    expect(parseInputs(env).advisory).toBe(false);
    expect(parseInputs({ ...env, INPUT_ADVISORY: 'false' }).advisory).toBe(false);
    expect(parseInputs({ ...env, INPUT_ADVISORY: 'true' }).advisory).toBe(true);
    for (const bad of ['yes', 'TRUE', '1', 'on']) {
      expect(() => parseInputs({ ...env, INPUT_ADVISORY: bad })).toThrow(/true or false/);
    }
  });
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dunstan-action-'));
});

function writeEvent(name: string, payload: unknown): string {
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

const prPayload = (fork = false) => ({
  pull_request: {
    number: 7,
    head: { sha: HEAD, repo: { full_name: fork ? 'someone/example-repo' : REPO } },
    base: { repo: { full_name: REPO } },
  },
});

describe('event', () => {
  const env = (name: string, payload: unknown) => ({
    GITHUB_EVENT_NAME: name,
    GITHUB_REPOSITORY: REPO,
    GITHUB_EVENT_PATH: writeEvent(name, payload),
  });
  const read = (p: string) => readFileSync(p);

  it('reads the pull request and tells a fork', () => {
    expect(readEvent(env('pull_request', prPayload()), read)).toEqual({
      name: 'pull_request',
      repository: REPO,
      number: 7,
      headSha: HEAD,
      fork: false,
    });
    expect(readEvent(env('pull_request', prPayload(true)), read).fork).toBe(true);
    // Under pull_request_target the token can write, fork or not.
    expect(readEvent(env('pull_request_target', prPayload(true)), read).fork).toBe(false);
  });

  it('reads an issue_comment on a pull request, and refuses one on an issue', () => {
    expect(
      readEvent(env('issue_comment', { issue: { number: 7, pull_request: {} } }), read),
    ).toEqual({ name: 'issue_comment', repository: REPO, number: 7, fork: false });
    expect(() => readEvent(env('issue_comment', { issue: { number: 7 } }), read)).toThrow(
      /not a pull request/,
    );
  });

  it('refuses any other event', () => {
    expect(() => readEvent(env('push', {}), read)).toThrow(/not push/);
  });
});

interface Harness {
  scenario: Scenario;
  requests: string[];
  bodies: Record<string, unknown>[];
  uploads: { name: string; files: readonly ZipFile[] }[];
  logs: string[];
}

// The fake GitHub plus the writes the Action makes: check runs (created runs appear in the commit's
// check-run listing, so the exclusion is exercised) and the run attempt's jobs.
function harness(scenario: Scenario, checkRunsStatus = 201): Harness & { fetch: typeof fetch } {
  const fake = fakeGitHub(scenario);
  const h: Harness = { scenario, requests: fake.requests, bodies: [], uploads: [], logs: [] };
  let nextId = 5000;
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === `/repos/${REPO}/check-runs` && method === 'POST') {
      h.requests.push(`POST ${url.pathname}`);
      const body = JSON.parse(String(init?.body));
      h.bodies.push(body);
      if (checkRunsStatus >= 400) return new Response('{"message":"x"}', { status: 403 });
      const id = nextId++;
      scenario.checkRuns = [
        ...(scenario.checkRuns ?? []),
        { id, name: 'dunstan', status: body.status, conclusion: body.conclusion ?? null },
      ];
      return Response.json({ id }, { status: 201 });
    }
    if (/^\/repos\/[^/]+\/[^/]+\/check-runs\/[0-9]+$/.test(url.pathname) && method === 'PATCH') {
      h.requests.push(`PATCH ${url.pathname}`);
      h.bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: Number(url.pathname.split('/').at(-1)) });
    }
    if (url.pathname === `/repos/${REPO}/actions/runs/77/attempts/1/jobs`) {
      h.requests.push(`GET ${url.pathname}`);
      return Response.json({
        total_count: 2,
        jobs: [
          {
            id: JOB_RUN_ID,
            status: 'in_progress',
            runner_name: 'GitHub Actions 3',
            check_run_url: `https://api.github.com/repos/${REPO}/check-runs/${JOB_RUN_ID}`,
          },
          { id: 9002, status: 'in_progress', runner_name: 'GitHub Actions 4' },
        ],
      });
    }
    return fake.fetch(input, init);
  };
  return { ...h, fetch: fetchFn as typeof fetch };
}

async function act(
  h: ReturnType<typeof harness>,
  inputs: Record<string, string>,
  options: { event?: string; payload?: unknown; upload?: 'fail' } = {},
) {
  const summary = join(dir, 'summary.md');
  const output = join(dir, 'output.txt');
  const env: Record<string, string> = {
    GITHUB_EVENT_NAME: options.event ?? 'pull_request',
    GITHUB_EVENT_PATH: writeEvent('event', options.payload ?? prPayload()),
    GITHUB_REPOSITORY: REPO,
    GITHUB_RUN_ID: '77',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_NAME: 'GitHub Actions 3',
    RUNNER_TEMP: dir,
    GITHUB_STEP_SUMMARY: summary,
    GITHUB_OUTPUT: output,
    'INPUT_GITHUB-TOKEN': 'test-token',
    'INPUT_UNVERIFIABLE-CONCLUSION': 'failure',
  };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  const result = await runAction({
    env,
    artifact: import.meta.url,
    fetch: h.fetch,
    upload: async (name, files) => {
      if (options.upload === 'fail') throw new Error('CreateArtifact failed: HTTP 409');
      h.uploads.push({ name, files });
      return { id: '1', size: 1, sha256: '0'.repeat(64) };
    },
    log: (line) => h.logs.push(line),
  });
  const read = (p: string) => {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };
  return { ...result, summary: read(summary), output: read(output) };
}

// Nothing the Action sends may comment, label, review or merge.
function expectOnlyCheckRunWrites(requests: string[]) {
  const writes = requests.filter((r) => !r.startsWith('GET '));
  for (const w of writes) {
    expect(w).toMatch(
      /^(POST \/repos\/[^/]+\/[^/]+\/check-runs|PATCH .*\/check-runs\/\d+|POST \/graphql)/,
    );
  }
  expect(
    requests.some((r) => /comments|labels|reviews|\/merge/.test(r) && !r.startsWith('GET ')),
  ).toBe(false);
}

describe('the Action', () => {
  it('concludes failure: block_missing for a pull request whose body has no block', async () => {
    const h = harness({ pr: basePullRequest({ body: 'All done, tests pass.' }) });
    const r = await act(h, { 'report-source': 'pr-body' });
    expect(r.exitCode).toBe(1);
    expect(r.outcome.conclusion).toBe('failure');
    expect(r.outcome.verdict).toBe('unverifiable');
    expect(r.outcome.title).toBe('unverifiable: block_missing');
    // Created in progress first, then completed with the claims table as its summary.
    expect(h.bodies[0]).toMatchObject({ name: 'dunstan', head_sha: HEAD, status: 'in_progress' });
    expect(h.bodies[1]).toMatchObject({ status: 'completed', conclusion: 'failure' });
    const output = (h.bodies[1] as { output: { title: string; summary: string } }).output;
    expect(output.title).toBe('unverifiable: block_missing');
    expect(output.summary).toContain('missing: <code>block_missing</code>');
    expect(output.summary).toContain('dunstan verify dunstan-record.json');
    expect(output.summary).toContain(`gh run download 77 --repo ${REPO} --name dunstan-record`);
    expect(r.summary).toContain('## dunstan: failure');
    expect(r.output).toBe(
      `verdict=unverifiable\nrecord-path=${join(dir, 'dunstan', RECORD_FILE)}\n`,
    );
    expect(h.uploads.map((u) => [u.name, u.files.map((f) => f.name)])).toEqual([
      [ARTIFACT_NAME, [RECORD_FILE]],
    ]);
    expect(h.logs.at(-1)).toMatch(
      /^::error title=dunstan::dunstan: failure: unverifiable: block_missing/,
    );
    expectOnlyCheckRunWrites(h.requests);
  });

  it('with advisory: true, records advisories and keeps the verdict and the conclusion', async () => {
    const scenario = () => ({
      pr: basePullRequest({
        body: `I changed src/a.ts, \`b.ts\` and src/zzz.ts. Closes #12.\n\n${block(['src/a.ts', 'pkg/b.ts'])}`,
        changed_files: 2,
      }),
      files: [
        { filename: 'src/a.ts', status: 'modified' },
        { filename: 'pkg/b.ts', status: 'modified' },
      ],
    });
    const plain = await act(harness(scenario()), { 'report-source': 'pr-body' });
    const h = harness(scenario());
    const r = await act(h, { 'report-source': 'pr-body', advisory: 'true' });
    expect(plain.outcome.conclusion).toBe('success');
    expect(r.outcome.conclusion).toBe('success');
    expect(r.outcome.verdict).toBe('pass');
    expect(r.exitCode).toBe(0);
    const record = JSON.parse(readFileSync(r.recordPath as string, 'utf8')) as DunstanRecord;
    expect(record.predicate.advisory?.advisories.map((a) => [a.observed, a.note])).toEqual([
      ['src/a.ts', 'agrees'],
      // A bare name the pull request changed at a full path is counted apart from agrees.
      ['pkg/b.ts', 'agrees_by_name'],
      [null, 'differs:declared_not_changed'],
      // GitHub answered without the closing references: unanswered, never differs.
      [null, 'unanswered:evidence_field_unpopulated:closingIssuesReferences'],
    ]);
    expect(r.summary).toContain(
      '| Advisory (DRAFT, not part of the verdict) | 4 advisories: 1 agree; 1 agree by name only; 1 possible disagreement, unverified; 1 unanswered. Extractor 0.1.2, comparison 0.2.0, precision unmeasured.',
    );
    expect(plain.summary).not.toContain('Advisory');
    expect(plain.summary).not.toContain(ADVISORY_LINE);
    expect(plain.summary).not.toContain('Advisories never affect the verdict');
    expectOnlyCheckRunWrites(h.requests);
  });

  it('shows a differs advisory as a possible disagreement, unverified, in the check run and the job summary', async () => {
    const scenario = () => ({
      pr: basePullRequest({
        body: `I changed src/a.ts and src/zzz.ts.\n\n${block(['src/a.ts'])}`,
        changed_files: 1,
      }),
      files: [{ filename: 'src/a.ts', status: 'modified' }],
    });
    const plain = await act(harness(scenario()), { 'report-source': 'pr-body' });
    const h = harness(scenario());
    const r = await act(h, { 'report-source': 'pr-body', advisory: 'true' });
    // The record keeps the note as written.
    const record = JSON.parse(readFileSync(r.recordPath as string, 'utf8')) as DunstanRecord;
    expect(record.predicate.advisory?.advisories.map((a) => a.note)).toEqual([
      'agrees',
      'differs:declared_not_changed',
    ]);
    const output = (h.bodies[1] as { output: { title: string; summary: string } }).output;
    // The title is the gate's alone: the same with and without advisories.
    expect(output.title).toBe('pass: 2 of 2 claims hold');
    expect(r.outcome.title).toBe(plain.outcome.title);
    // Extractor 0.1.2 is unmeasured, so the fixed line states no figure.
    const line = advisoryLine(record.predicate.advisory as AdvisorySection);
    expect(line).toBe(ADVISORY_LINE);
    for (const text of [output.summary, r.summary]) {
      expect(text).toContain('possible disagreement, unverified');
      expect(text).toContain(line);
      expect(text).toContain(
        '| possible disagreement, unverified: not among the changed files | <code>file_changed</code> | <code>"src/zzz.ts"</code> | <code>null</code> | <code>"I changed src/a.ts and src/zzz.ts."</code> |',
      );
      expect(text.split(line)).toHaveLength(2);
      expect(text).not.toMatch(/0\.80|24\/30|of 44/);
    }
    // The fixed line itself says "false claim"; outside it, no word of the old wording.
    for (const text of [output.title, output.summary, r.summary, ...h.logs]) {
      expect(text.replaceAll(line, '')).not.toMatch(/differs|mismatch|false claim/i);
    }
  });

  it('concludes neutral for unverifiable only when the consumer chose it, and exits 0', async () => {
    const h = harness({ pr: basePullRequest({ body: 'no block' }) });
    const r = await act(h, { 'report-source': 'pr-body', 'unverifiable-conclusion': 'neutral' });
    expect(r.outcome.conclusion).toBe('neutral');
    expect(r.exitCode).toBe(0);
    expect(r.summary).toContain('GitHub lets a merge through on a neutral required check');
  });

  it('concludes success on a pass, with its own check runs excluded from the counted runs', async () => {
    const h = harness({
      pr: basePullRequest({
        changed_files: 1,
        body: block(['src/a.ts'], ',"checks":{"total":1,"allSucceeded":true}'),
      }),
      files: [{ filename: 'src/a.ts', status: 'modified' }],
      checkRuns: [
        { id: 10, name: 'ci', status: 'completed', conclusion: 'success' },
        { id: JOB_RUN_ID, name: 'handback', status: 'in_progress', conclusion: null },
        { id: 20, name: 'dunstan', status: 'completed', conclusion: 'failure' },
      ],
    });
    const r = await act(h, { 'report-source': 'pr-body' });
    expect(r.outcome.verdict).toBe('pass');
    expect(r.outcome.conclusion).toBe('success');
    expect(r.exitCode).toBe(0);
    const record = JSON.parse(readFileSync(r.recordPath as string, 'utf8'));
    expect(record.predicate.evidence.checkRuns.excludedIds).toEqual([5000, JOB_RUN_ID]);
    expect(verifyRecord(record).problems).toEqual([]);
    expect(h.bodies.at(-1)).toMatchObject({ conclusion: 'success' });
    expectOnlyCheckRunWrites(h.requests);
  });

  it('concludes failure on a fail, with the claims table in the summary', async () => {
    const h = harness({
      pr: basePullRequest({ body: block(['src/a.ts']) }),
      files: [
        { filename: 'src/a.ts', status: 'modified' },
        { filename: 'src/b|c.ts', status: 'added' },
      ],
    });
    const r = await act(h, { 'report-source': 'pr-body' });
    expect(r.outcome.verdict).toBe('fail');
    expect(r.exitCode).toBe(1);
    expect(r.outcome.title).toBe('fail: 1 of 3 claims (undeclared_file)');
    expect(r.summary).toContain('| Claim | Declared | Observed | Verdict | Reason |');
    // A pipe in a path cannot break the table.
    expect(r.summary).toContain(
      '| <code>scope:undeclared:src/b&#124;c.ts</code> | <code>null</code> | <code>"src/b&#124;c.ts"</code> | **fail** | <code>undeclared_file</code> |',
    );
  });

  it('reads the named author newest comment, and fails closed when there is none', async () => {
    const h = harness({
      pr: basePullRequest({ changed_files: 1 }),
      files: [{ filename: 'src/a.ts', status: 'modified' }],
      comments: [
        { id: 1, user: { login: 'agent-bot' }, created_at: '2026-10-04T10:00:00Z', body: 'x' },
        {
          id: 2,
          user: { login: 'agent-bot' },
          created_at: '2026-10-04T11:00:00Z',
          body: block(['src/a.ts']),
        },
      ],
    });
    const ok = await act(h, { 'report-source': 'comment:agent-bot' });
    expect(ok.outcome.verdict).toBe('pass');

    const none = await act(harness({ pr: basePullRequest() }), {
      'report-source': 'comment:nobody',
    });
    expect(none.outcome).toMatchObject({ conclusion: 'failure', verdict: 'error' });
    expect(none.outcome.title).toBe(`error: nobody has no comment on ${REPO}#7`);
    // The second run appends to the same GITHUB_OUTPUT file.
    expect(none.output.endsWith('\nverdict=error\nrecord-path=\n')).toBe(true);
  });

  it('concludes failure, on the check run, when report-source is missing', async () => {
    const h = harness({ pr: basePullRequest() });
    const r = await act(h, {});
    expect(r.exitCode).toBe(1);
    expect(r.outcome.verdict).toBe('error');
    expect(r.outcome.title).toMatch(/report-source is required/);
    // No record, but the failure still reaches the head commit from the payload.
    expect(h.bodies).toEqual([
      expect.objectContaining({ head_sha: HEAD, status: 'completed', conclusion: 'failure' }),
    ]);
    expect(h.uploads).toEqual([]);
  });

  it('concludes failure for an unreadable report file', async () => {
    const r = await act(harness({ pr: basePullRequest() }), {
      'report-source': `file:${join(dir, 'absent.md')}`,
    });
    expect(r.outcome.title).toMatch(/report file .*absent\.md is unreadable \(ENOENT\)/);
    expect(r.exitCode).toBe(1);
  });

  it('refuses file: under pull_request_target, and accepts pr-body there', async () => {
    const report = join(dir, 'r.md');
    writeFileSync(report, block(['src/a.ts']));
    const refused = await act(
      harness({ pr: basePullRequest() }),
      { 'report-source': `file:${report}` },
      { event: 'pull_request_target' },
    );
    expect(refused.outcome.title).toMatch(/^error: refused: under pull_request_target/);
    expect(refused.exitCode).toBe(1);

    const h = harness({
      pr: basePullRequest({ changed_files: 1, body: block(['src/a.ts']) }),
      files: [{ filename: 'src/a.ts', status: 'modified' }],
    });
    const accepted = await act(h, { 'report-source': 'pr-body' }, { event: 'pull_request_target' });
    expect(accepted.outcome.verdict).toBe('pass');
  });

  it('on a fork pull request writes the job summary and the exit status only, and says so', async () => {
    const h = harness({ pr: basePullRequest({ body: 'no block' }) });
    const r = await act(h, { 'report-source': 'pr-body' }, { payload: prPayload(true) });
    expect(h.requests.filter((q) => q.includes('check-runs'))).toEqual([]);
    expect(r.exitCode).toBe(1);
    expect(r.summary).toContain('This pull request comes from a fork');
  });

  it('when the token cannot create check runs, says so and still exits by the verdict', async () => {
    const h = harness({ pr: basePullRequest({ body: 'no block' }) }, 403);
    const r = await act(h, { 'report-source': 'pr-body', 'unverifiable-conclusion': 'neutral' });
    expect(r.exitCode).toBe(0);
    expect(r.summary).toContain('could not be created (http_403)');
    expect(h.requests.filter((q) => q.startsWith('PATCH'))).toEqual([]);
  });

  it('concludes failure when the record cannot be uploaded, whatever the verdict', async () => {
    const h = harness({
      pr: basePullRequest({ changed_files: 1, body: block(['src/a.ts']) }),
      files: [{ filename: 'src/a.ts', status: 'modified' }],
    });
    const r = await act(h, { 'report-source': 'pr-body' }, { upload: 'fail' });
    expect(r.outcome.verdict).toBe('pass');
    expect(r.outcome.conclusion).toBe('failure');
    expect(r.exitCode).toBe(1);
    expect(r.outcome.title).toBe('error: record not uploaded (verdict pass)');
  });

  it('concludes failure when the pull request cannot be read', async () => {
    const h = harness({ pr: basePullRequest({ number: 8 }) });
    const r = await act(h, { 'report-source': 'pr-body' });
    expect(r.outcome.title).toMatch(/cannot read pull request .*#7 \(http_404\)/);
    expect(h.bodies.at(-1)).toMatchObject({ head_sha: HEAD, conclusion: 'failure' });
  });
});

describe('the repository files that carry blocks', () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

  it('the pull request template is block_missing until a block is filled in', () => {
    const template = read('.github/pull_request_template.md');
    expect(extractHandbackBlock(template).status).toBe('missing');
    // Unindented, its filled example is a valid block.
    expect(extractHandbackBlock(template.replace(/^ {4}/gm, '')).status).toBe('found');
  });

  it('the block in docs/action.md is valid', () => {
    const doc = read('docs/action.md');
    const example = /````markdown\n([\s\S]*?)\n````/.exec(doc)?.[1] ?? '';
    expect(extractHandbackBlock(example)).toMatchObject({ status: 'found' });
  });
});

describe('summary', () => {
  it('stays under the check-run summary limit, leaving rows to the record', () => {
    const claims = Array.from({ length: 3000 }, (_, i) => ({
      id: `scope:/filesChanged/${i}`,
      check: 'scope' as const,
      field: `/filesChanged/${i}`,
      declared: `src/${'x'.repeat(40)}/${i}.ts`,
      observed: `src/${'x'.repeat(40)}/${i}.ts`,
      verdict: 'pass' as const,
    }));
    const record = {
      predicate: {
        subject: { repository: REPO, pullRequest: 7, headSha: HEAD },
        report: { sha256: '0', source: { kind: 'pr-body', locator: 'x' } },
        block: { status: 'found', sha256: '0' },
        verdict: 'pass',
        digests: { claims: '0', evidence: '0' },
        checker: { name: 'dunstan', version: '0.1.0', digest: { sha256: '0' } },
        evidence: { sources: [] },
        claims,
      },
    };
    const text = renderSummary({
      conclusion: 'success',
      verdict: 'pass',
      title: 'pass',
      record: record as never,
      notes: [],
    });
    expect(text.length).toBeLessThanOrEqual(65_535);
    expect(text).toMatch(/[0-9]+ more rows are in the record/);
  });
});

// dunstan template --tests-ci on a GitLab merge request (DRAFT GitLab profile 0.1, G.3): the counts
// are the ones `dunstan check --gitlab-project` reads for the same record, through the merge
// request's head pipeline at HEAD, with the check's own reader. Every outcome the check would not
// settle declares no tests and says why. Against a fake GitLab; the project is
// example-org/example-repo.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { junitXml, makeZip } from '../__tests__/fake-github.js';
import {
  fakeGitLab,
  type GitLabScenario,
  GL_ELSEWHERE,
  GL_PROJECT,
  GL_TEST_JOB,
  GL_TEST_JOB_ID,
  glJob,
  templateMergeRequest,
} from '../__tests__/fake-gitlab.js';
import { featureRepository, isolateGit } from '../__tests__/git-repo.js';
import type { Block, Claim } from '../check/types.js';
import { main, USAGE } from '../cli/main.js';
import { readBlockContent } from '../spec/extract.js';

isolateGit();

const ORIGIN = `https://gitlab.com/${GL_PROJECT}.git`;
// Not a real token, and not in GitLab's token format.
const TOKEN = 'fake-gitlab-token-TEMPLATE-0042';
const JOB = GL_TEST_JOB;
const JOB_ID = GL_TEST_JOB_ID;
const gitlab = templateMergeRequest;

const passing = (n: number) => junitXml(Array<'pass'>(n).fill('pass'));

async function run(
  cwd: string,
  args: string[],
  s: GitLabScenario,
  env: Record<string, string> = { GITLAB_TOKEN: TOKEN },
) {
  let out = '';
  let err = '';
  const fake = fakeGitLab(s);
  const code = await main(args, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env,
    artifact: import.meta.url,
    fetch: fake.fetch,
    readStdin: () => new Uint8Array(),
    cwd,
  });
  return { code, out, err, requests: fake.requests };
}

const blockOf = (out: string): Block => {
  const content = /```dunstan-handback\n([\s\S]*?)\n```/.exec(out)?.[1] as string;
  const read = readBlockContent(content);
  expect(read.status).toBe('found');
  return (read as unknown as { value: Block }).value;
};

const CI = [
  'template',
  '--tests-ci',
  '--gitlab-project',
  GL_PROJECT,
  '--mr',
  '1',
  '--tests-command',
  'pnpm test',
  '--tests-job',
  JOB,
];

describe('dunstan template --tests-ci --gitlab-project', () => {
  it("declares the head pipeline job's counts, against the project's CI configuration file", async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const r = await run(dir, CI, gitlab(head));
    expect(r.code).toBe(0);
    expect(blockOf(r.out).tests).toEqual([
      {
        command: 'pnpm test',
        count: 142,
        failures: 0,
        record: {
          kind: 'junit',
          workflow: '.gitlab-ci.yml',
          job: JOB,
          artifact: 'archive',
          path: 'junit.xml',
        },
      },
    ]);
    expect(r.err).toMatch(/tests: 142 executed and 0 failed in junit\.xml/);
    // GITLAB_TOKEN goes to the GitLab host only, and nothing is read from GitHub.
    expect(r.requests.length).toBeGreaterThan(0);
    for (const q of r.requests) {
      expect(q.url.startsWith('https://gitlab.com/api/v4/')).toBe(true);
    }
    expect(r.out + r.err).not.toContain(TOKEN);
  });

  it('takes --tests-workflow, --tests-path, --tests-artifact archive and --gitlab-host', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const s = gitlab(head, {
      project: {
        path_with_namespace: GL_PROJECT,
        default_branch: 'main',
        ci_config_path: 'ci/main.yml',
      },
      artifacts: { [JOB_ID]: makeZip({ 'reports/junit.xml': junitXml(['pass', 'fail']) }) },
    });
    const r = await run(
      dir,
      [
        ...CI,
        '--tests-workflow',
        'ci/main.yml',
        '--tests-path',
        'reports/junit.xml',
        '--tests-artifact',
        'archive',
        '--gitlab-host',
        'gitlab.example.com',
      ],
      s,
    );
    expect(r.code).toBe(0);
    expect(blockOf(r.out).tests).toEqual([
      {
        command: 'pnpm test',
        count: 2,
        failures: 1,
        record: {
          kind: 'junit',
          workflow: 'ci/main.yml',
          job: JOB,
          artifact: 'archive',
          path: 'reports/junit.xml',
        },
      },
    ]);
    for (const q of r.requests) {
      expect(q.url.startsWith('https://gitlab.example.com/api/v4/')).toBe(true);
    }
  });

  it('writes a block whose tests claim passes dunstan check on the same evidence', async () => {
    const { dir, head } = featureRepository(ORIGIN);
    const s = gitlab(head);
    const t = await run(dir, CI, s);
    expect(t.code).toBe(0);
    const work = mkdtempSync(join(tmpdir(), 'dunstan-gl-template-'));
    const report = join(work, 'report.md');
    writeFileSync(report, `Done.\n\n${t.out}`);
    const out = join(work, 'r.json');
    const c = await run(
      dir,
      ['check', '--gitlab-project', GL_PROJECT, '--mr', '1', '--report-file', report, '--out', out],
      s,
    );
    const record = JSON.parse(readFileSync(out, 'utf8'));
    const claims = record.predicate.claims as Claim[];
    const tests = claims.filter((x) => x.field.startsWith('/tests/'));
    expect(tests.map((x) => [x.field, x.verdict])).toEqual([
      ['/tests/0/count', 'pass'],
      ['/tests/0/failures', 'pass'],
    ]);
    expect(c.code).toBe(0);
  });
});

interface NotDeclared {
  name: string;
  scenario: (head: string) => GitLabScenario;
  args?: string[];
  env?: Record<string, string>;
  pushed?: boolean;
  reason: string;
  says?: RegExp;
}

const NOT_DECLARED: NotDeclared[] = [
  {
    name: 'no GITLAB_TOKEN',
    scenario: (head) => gitlab(head),
    env: {},
    reason: 'no_token',
    says: /GITLAB_TOKEN is not set/,
  },
  {
    name: 'HEAD not pushed',
    scenario: (head) => gitlab(head),
    pushed: false,
    reason: 'not_pushed',
  },
  {
    name: 'the merge request cannot be read',
    scenario: (head) => gitlab(head, { mrStatus: 404 }),
    reason: 'source_unreadable:pull_request',
  },
  {
    name: "the merge request's head is not HEAD",
    scenario: (head) => gitlab(head, { mrSha: GL_ELSEWHERE }),
    reason: 'head_mismatch',
    says: new RegExp(GL_ELSEWHERE),
  },
  {
    name: 'no head pipeline',
    scenario: (head) => gitlab(head, { pipeline: null }),
    reason: 'evidence_field_unpopulated:head_pipeline',
  },
  {
    name: 'a head pipeline at another commit',
    scenario: (head) => gitlab(head, { pipeline: { sha: GL_ELSEWHERE } }),
    reason: 'evidence_field_unpopulated:head_pipeline_not_at_head_commit',
    says: new RegExp(GL_ELSEWHERE),
  },
  {
    name: 'no job of that name',
    scenario: (head) =>
      gitlab(head, { jobs: [glJob(JOB_ID, 'lint', 'success', { archive: true })] }),
    reason: 'record_not_found',
  },
  {
    name: 'a job with no archive',
    scenario: (head) => gitlab(head, { jobs: [glJob(JOB_ID, JOB, 'success')] }),
    reason: 'record_not_found',
  },
  {
    name: 'expired artifacts',
    scenario: (head) =>
      gitlab(head, {
        jobs: [glJob(JOB_ID, JOB, 'success', { expireAt: '2026-11-01T00:00:00.000Z' })],
      }),
    reason: 'source_unreadable:artifact',
  },
  {
    name: 'no file at the path',
    scenario: (head) =>
      gitlab(head, { artifacts: { [JOB_ID]: makeZip({ 'other.xml': passing(1) }) } }),
    reason: 'record_not_found',
  },
  {
    name: 'an unparseable JUnit file',
    scenario: (head) =>
      gitlab(head, { artifacts: { [JOB_ID]: makeZip({ 'junit.xml': '<not junit' }) } }),
    reason: 'source_unreadable:artifact',
  },
  {
    name: 'an archive whose download fails',
    scenario: (head) => gitlab(head, { artifacts: { [JOB_ID]: 403 } }),
    reason: 'source_unreadable:artifact',
  },
  {
    name: 'a workflow that is not the CI configuration file',
    scenario: (head) => gitlab(head),
    args: ['--tests-workflow', 'ci/other.yml'],
    reason: 'record_not_found',
  },
  {
    name: 'a project read that does not say which CI configuration file runs',
    scenario: (head) =>
      gitlab(head, { project: { path_with_namespace: GL_PROJECT, default_branch: 'main' } }),
    reason: 'source_unreadable:repository',
  },
  {
    name: 'a merge request that changes the CI configuration file',
    scenario: (head) => {
      const s = gitlab(head);
      const ci = {
        old_path: '.gitlab-ci.yml',
        new_path: '.gitlab-ci.yml',
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        diff: '',
      };
      return { ...s, mr: { ...s.mr, changes_count: '3' }, diffs: [...(s.diffs ?? []), ci] };
    },
    reason: 'record_producer_changed_by_pr',
  },
  {
    name: 'jobs that disagree',
    scenario: (head) =>
      gitlab(head, {
        jobs: [
          glJob(JOB_ID, JOB, 'success', { archive: true }),
          glJob(JOB_ID + 1, JOB, 'success', { archive: true }),
        ],
        artifacts: {
          [JOB_ID]: makeZip({ 'junit.xml': passing(142) }),
          [JOB_ID + 1]: makeZip({ 'junit.xml': passing(141) }),
        },
      }),
    reason: 'record_ambiguous',
  },
];

describe('dunstan template --tests-ci --gitlab-project declares no tests the check would not settle', () => {
  it.each(NOT_DECLARED.map((c) => [c.name, c] as const))('%s', async (_, c) => {
    const { dir, head } = featureRepository(ORIGIN, { pushed: c.pushed ?? true });
    const r = await run(dir, [...CI, ...(c.args ?? [])], c.scenario(head), c.env);
    expect(r.code).toBe(2);
    expect(blockOf(r.out).tests).toBeUndefined();
    expect(r.err).toContain(`dunstan: tests are not declared: `);
    expect(r.err).toContain(`(${c.reason}).`);
    if (c.says !== undefined) expect(r.err).toMatch(c.says);
    expect(r.out + r.err).not.toContain(TOKEN);
  });
});

describe('dunstan template --gitlab-project refusals', () => {
  const refuse = async (args: string[], message: RegExp) => {
    const { dir, head } = featureRepository(ORIGIN);
    const r = await run(dir, ['template', ...args], gitlab(head));
    expect(r.code).toBe(3);
    expect(r.out).toBe('');
    expect(r.err).toMatch(message);
    expect(r.requests).toEqual([]);
  };
  const ci = ['--tests-ci', '--tests-command', 'x', '--tests-job', JOB];

  it('refuses --repo with the GitLab flags', async () => {
    await refuse(
      [...ci, '--gitlab-project', GL_PROJECT, '--mr', '1', '--repo', 'example-org/example-repo'],
      /--repo does not go with --gitlab-project/,
    );
  });
  it('takes the GitLab flags only with --tests-ci', async () => {
    await refuse(
      ['--gitlab-project', GL_PROJECT, '--mr', '1'],
      /--gitlab-project goes with --tests-ci/,
    );
  });
  it('needs --mr', async () => {
    await refuse([...ci, '--gitlab-project', GL_PROJECT], /--mr <iid> is required/);
  });
  it('needs --gitlab-project with --mr or --gitlab-host', async () => {
    await refuse([...ci, '--mr', '1'], /--gitlab-project <namespace\/project> is required/);
  });
  it('refuses a malformed project, merge request or host', async () => {
    await refuse(
      [...ci, '--gitlab-project', 'https://gitlab.com/x', '--mr', '1'],
      /--gitlab-project/,
    );
    await refuse(
      [...ci, '--gitlab-project', GL_PROJECT, '--mr', '0'],
      /--mr must be a positive integer/,
    );
    await refuse(
      [...ci, '--gitlab-project', GL_PROJECT, '--mr', '1', '--gitlab-host', 'HTTPS://x'],
      /--gitlab-host/,
    );
  });
  it('refuses an artifact other than archive, and --tests-artifact-path', async () => {
    await refuse(
      [...ci, '--gitlab-project', GL_PROJECT, '--mr', '1', '--tests-artifact', 'dunstan-junit'],
      /--tests-artifact must be archive/,
    );
    await refuse(
      [...ci, '--gitlab-project', GL_PROJECT, '--mr', '1', '--tests-artifact-path', 'junit.xml'],
      /--tests-artifact-path does not go with --gitlab-project/,
    );
  });
  it('refuses --tests-path without --gitlab-project', async () => {
    await refuse(
      [...ci, '--tests-workflow', '.github/workflows/ci.yml', '--tests-path', 'junit.xml'],
      /--tests-path goes with --gitlab-project/,
    );
  });
  it('still needs --tests-workflow on GitHub', async () => {
    await refuse(ci, /--tests-ci needs --tests-workflow/);
  });
});

describe('the usage text', () => {
  it('names the GitLab form of --tests-ci', () => {
    expect(USAGE).toMatch(/--tests-ci --gitlab-project <namespace\/project> --mr <iid>/);
    expect(USAGE).toMatch(/--tests-path <path>/);
  });
});

// The GitLab reader (spec/claim-format.md, "DRAFT GitLab profile 0.1"): a merge request checked as a
// pull request is, from a fake GitLab, with every GitHub record left as it was.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { junitXml, makeZip } from '../__tests__/fake-github.js';
import {
  baseDiffs,
  baseMergeRequest,
  closedByMergeRequest,
  fakeGitLab,
  type GitLabScenario,
  GL_ELSEWHERE,
  GL_HEAD,
  GL_ID,
  GL_MERGE,
  GL_PARENT,
  GL_PROJECT,
  glDeployment,
  glJob,
  issueReference,
} from '../__tests__/fake-gitlab.js';
import type { Block, Claim } from '../check/types.js';
import { checkPullRequest, gitlabReaders } from '../pipeline/check-pull-request.js';
import { buildRecord, type DunstanRecord, recordBlock, serializeRecord } from '../record/build.js';
import { verifyRecord } from '../record/verify.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { canonicalize } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { PullRequestMoved, PullRequestUnreadable } from './github.js';
import { GITLAB_PROJECT, reportFromMergeRequestDescription } from './gitlab.js';
import { GitLabClient } from './http.js';

const CHECKER = { name: 'dunstan', version: '0.1.18', digest: { sha256: '0'.repeat(64) } };
// Not a real token, and not in GitLab's token format, so no secret scanner reads it as one.
const TOKEN = 'fake-gitlab-token-NEVER-IN-A-RECORD';

function body(block: Record<string, unknown>): string {
  return `Done.\n\n\`\`\`dunstan-handback\n${JSON.stringify(block)}\n\`\`\`\n`;
}

const FULL_BLOCK = {
  dunstan: '0.1',
  headCommit: GL_HEAD,
  filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
  references: [
    { issue: '#3', relation: 'closes' },
    { issue: '#4', relation: 'closes' },
    { commit: GL_PARENT, relation: 'cites' },
    { commit: GL_ELSEWHERE, relation: 'cites' },
  ],
  mergedAt: '2026-11-01T12:30:00Z',
};

function scenario(block: Record<string, unknown> = FULL_BLOCK): GitLabScenario {
  return {
    mr: baseMergeRequest({ description: body(block) }),
    diffs: baseDiffs(),
    closes: [issueReference(`${GL_PROJECT}#3`)],
    stateEvents: {
      [`${GL_PROJECT}#4`]: [closedByMergeRequest('2026-11-01T12:00:01.000Z', GL_PROJECT, 1)],
    },
    issues: { [`${GL_PROJECT}#4`]: { ...issueReference(`${GL_PROJECT}#4`), state: 'closed' } },
    commits: { [GL_PARENT]: 200, [GL_ELSEWHERE]: 200 },
    mergeBase: {
      [GL_PARENT]: GL_PARENT,
      [GL_ELSEWHERE]: 'abcdef00abcdef00abcdef00abcdef00abcdef00',
    },
    mrCommits: [GL_PARENT, GL_HEAD],
  };
}

async function checkMr(
  s: GitLabScenario,
  options: { token?: string; host?: string; excluded?: number[] } = {},
): Promise<{
  record: DunstanRecord;
  warnings: string[];
  urls: string[];
  auth: (string | undefined)[];
}> {
  const fake = fakeGitLab(s);
  const warnings: string[] = [];
  const host = options.host ?? 'gitlab.com';
  const client = new GitLabClient({
    host,
    token: options.token,
    fetch: fake.fetch,
    warn: (m) => warnings.push(m),
    sleep: async () => {},
    now: () => new Date('2026-11-10T00:00:00Z'),
  });
  const record = await checkPullRequest({
    readers: gitlabReaders(client),
    repository: GL_PROJECT,
    number: 1,
    report: async (pr) => reportFromMergeRequestDescription(pr),
    checker: CHECKER,
    recordFile: 'r.json',
    forge: { kind: 'gitlab', host },
    ...(options.excluded === undefined ? {} : { excludedCheckRunIds: options.excluded }),
  });
  return {
    record,
    warnings,
    urls: fake.requests.map((r) => r.url),
    auth: fake.requests.map((r) => r.headers.authorization),
  };
}

const rows = (record: DunstanRecord) =>
  record.predicate.claims.map((c: Claim) => [c.id, c.verdict, c.reason ?? null]);

describe('a merged merge request', () => {
  it('gives the pullRequest and files sections, a rename, an addition and a deletion', async () => {
    const { record } = await checkMr(scenario());
    const p = record.predicate;
    expect(record.predicateType).toBe('https://barglabs.ai/dunstan/record/v0.1-gitlab-draft');
    expect(p.spec).toBe('0.1.11-gitlab-0.1-draft');
    expect(p.subject).toEqual({
      repository: GL_PROJECT,
      pullRequest: 1,
      headSha: GL_HEAD,
      mergeSha: 'decade00decade00decade00decade00decade00',
      forge: { kind: 'gitlab', host: 'gitlab.com' },
    });
    expect(record.subject[0]).toEqual({
      name: `git+https://gitlab.com/${GL_PROJECT}@${GL_HEAD}`,
      digest: { gitCommit: GL_HEAD },
    });
    expect(p.evidence.pullRequest).toEqual({
      status: 'ok',
      number: 1,
      state: 'closed',
      merged: true,
      mergedAt: '2026-11-01T12:00:00.000Z',
      headSha: GL_HEAD,
      mergeSha: 'decade00decade00decade00decade00decade00',
      changedFiles: 3,
    });
    expect(p.evidence.files).toEqual({
      status: 'ok',
      complete: true,
      entries: [
        { path: 'docs/gone.md', status: 'removed' },
        { path: 'src/added.ts', status: 'added' },
        { path: 'src/new-name.ts', status: 'renamed', previousPath: 'src/old-name.ts' },
      ],
    });
    expect(p.report.source).toEqual({
      kind: 'pr-body',
      locator: 'GET /api/v4/projects/example-org%2Fexample-repo/merge_requests/1#description',
    });
  });

  it('settles the head, scope, closes, cites and mergedAt claims as the checks do on GitHub', async () => {
    const { record } = await checkMr(scenario());
    expect(rows(record)).toEqual([
      ['head:/headCommit', 'pass', null],
      ['scope:/filesChanged/0', 'pass', null],
      ['scope:/filesChanged/1', 'pass', null],
      ['scope:/filesChanged/2', 'pass', null],
      ['reference:/references/0', 'pass', null],
      ['reference:/references/1', 'pass', null],
      ['reference:/references/2', 'pass', null],
      // A cited commit the head does not reach passes (spec 0.1.11); the read is still recorded.
      ['reference:/references/3', 'pass', null],
      ['time:/mergedAt', 'pass', null],
    ]);
    expect(record.predicate.verdict).toBe('pass');
    expect(record.predicate.evidence.references?.[2]).toEqual({
      kind: 'commit',
      ref: GL_ELSEWHERE,
      status: 'ok',
      exists: true,
      reachableFromHead: false,
    });
    // #4 is not among closes_issues; its state event names this merge request as the closer.
    expect(record.predicate.evidence.closeEvents?.targets).toEqual([
      {
        ref: `${GL_PROJECT}#4`,
        status: 'ok',
        type: 'issue',
        state: 'closed',
        events: [
          {
            at: '2026-11-01T12:00:01.000Z',
            closer: { kind: 'pull_request', ref: `${GL_PROJECT}#1` },
          },
        ],
      },
    ]);
    expect(record.predicate.evidence.closeEvents?.pullRequest).toEqual({
      status: 'ok',
      baseRef: 'main',
      defaultBranch: 'main',
      commits: [GL_HEAD, GL_PARENT].sort(),
    });
  });

  it('writes a record that verifies offline and holds no diff', async () => {
    const { record } = await checkMr(scenario());
    const result = verifyRecord(JSON.parse(serializeRecord(record)));
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(serializeRecord(record)).not.toContain('FILE-CONTENT');
  });

  it('marks an undeclared file and a declared file the merge request does not change', async () => {
    const { record } = await checkMr(
      scenario({
        dunstan: '0.1',
        headCommit: GL_HEAD,
        filesChanged: ['src/new-name.ts', 'src/elsewhere.ts'],
      }),
    );
    expect(rows(record)).toEqual([
      ['head:/headCommit', 'pass', null],
      ['scope:/filesChanged/0', 'pass', null],
      ['scope:/filesChanged/1', 'fail', 'declared_not_changed'],
      ['scope:undeclared:docs/gone.md', 'fail', 'undeclared_file'],
      ['scope:undeclared:src/added.ts', 'fail', 'undeclared_file'],
    ]);
  });

  it('declares the old path of a rename, which is enough', async () => {
    const { record } = await checkMr(
      scenario({
        dunstan: '0.1',
        headCommit: GL_HEAD,
        filesChanged: ['src/old-name.ts', 'src/added.ts', 'docs/gone.md'],
      }),
    );
    expect(record.predicate.verdict).toBe('pass');
  });

  it('fails the head claim when the block names another commit', async () => {
    const { record } = await checkMr(
      scenario({
        dunstan: '0.1',
        headCommit: GL_PARENT,
        filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
      }),
    );
    expect(rows(record)[0]).toEqual(['head:/headCommit', 'fail', 'head_mismatch']);
  });

  it('reads every page of the diffs listing', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      old_path: `f/${String(i).padStart(3, '0')}.ts`,
      new_path: `f/${String(i).padStart(3, '0')}.ts`,
      new_file: true,
      renamed_file: false,
      deleted_file: false,
    }));
    const s = scenario({
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: many.map((f) => f.new_path),
    });
    s.diffs = many;
    s.mr = { ...s.mr, changes_count: '150' };
    const { record, urls } = await checkMr(s);
    expect(record.predicate.verdict).toBe('pass');
    expect(record.predicate.evidence.pullRequest.changedFiles).toBe(150);
    expect(urls.filter((u) => u.includes('/diffs?')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('an incomplete file listing', () => {
  it('is incomplete when changes_count is capped, and every scope row is unverifiable', async () => {
    const s = scenario({ dunstan: '0.1', headCommit: GL_HEAD, filesChanged: ['src/new-name.ts'] });
    s.mr = { ...s.mr, changes_count: '1000+' };
    const { record } = await checkMr(s);
    expect(record.predicate.evidence.files).toMatchObject({ status: 'ok', complete: false });
    expect(rows(record)).toEqual([
      ['head:/headCommit', 'pass', null],
      ['scope:/filesChanged/0', 'unverifiable', 'file_list_truncated'],
      ['scope:undeclared', 'unverifiable', 'file_list_truncated'],
    ]);
  });

  it('is incomplete when changes_count is more than the listing gives', async () => {
    const s = scenario({
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
    });
    s.mr = { ...s.mr, changes_count: '4' };
    const { record } = await checkMr(s);
    expect(record.predicate.evidence.files).toMatchObject({ status: 'ok', complete: false });
    expect(record.predicate.verdict).toBe('unverifiable');
  });
});

describe('closes and cites', () => {
  it('fails a closes target that stayed open after a merge into the default branch', async () => {
    const s = scenario({
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
      references: [{ issue: '#5', relation: 'closes' }],
    });
    const { record } = await checkMr(s);
    expect(rows(record)[4]).toEqual(['reference:/references/0', 'fail', 'not_closing']);
  });

  it('reads an issue GitLab answers 404 for as unreadable, never as not found', async () => {
    const s = scenario({
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
      references: [{ issue: '#9', relation: 'cites' }],
    });
    s.issues = { [`${GL_PROJECT}#9`]: 404 };
    const { record } = await checkMr(s);
    expect(rows(record)[4]).toEqual([
      'reference:/references/0',
      'unverifiable',
      'source_unreadable:issue',
    ]);
  });

  it('fails a cited commit the repository does not have', async () => {
    const s = scenario({
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
      references: [{ commit: 'f'.repeat(40), relation: 'cites' }],
    });
    const { record } = await checkMr(s);
    expect(rows(record)[4]).toEqual(['reference:/references/0', 'fail', 'not_found']);
  });
});

describe('fail closed', () => {
  it('writes no record for a merge request that moves between the two reads, twice', async () => {
    const s = scenario();
    // First read, the read after the evidence (moved), the fresh read, and the read after (moved
    // again).
    s.mrMoves = [{}, { sha: GL_PARENT }, { sha: GL_PARENT }, { sha: GL_HEAD }];
    await expect(checkMr(s)).rejects.toBeInstanceOf(PullRequestMoved);
  });

  it('checks once more from a fresh read when the merge request moved once', async () => {
    const s = scenario({
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
    });
    s.mrMoves = [{ sha: GL_PARENT }, { sha: GL_HEAD }];
    const { record } = await checkMr(s);
    expect(record.predicate.evidence.pullRequest.headSha).toBe(GL_HEAD);
    expect(record.predicate.verdict).toBe('pass');
  });

  it('writes no record for a merge request it cannot read, or in a state it does not map', async () => {
    const unreadable = scenario();
    unreadable.mrStatus = 404;
    await expect(checkMr(unreadable)).rejects.toBeInstanceOf(PullRequestUnreadable);
    const locked = scenario();
    locked.mr = { ...locked.mr, state: 'locked' };
    await expect(checkMr(locked)).rejects.toBeInstanceOf(PullRequestUnreadable);
    const noDiffs = scenario();
    noDiffs.diffsStatus = 500;
    await expect(checkMr(noDiffs)).rejects.toBeInstanceOf(PullRequestUnreadable);
  });

  it('gives source_unreadable for the claims whose source errored', async () => {
    const s = scenario();
    s.closesStatus = 500;
    s.commits = { [GL_PARENT]: 500, [GL_ELSEWHERE]: 200 };
    s.mergeBase = { [GL_ELSEWHERE]: 502 };
    const { record } = await checkMr(s);
    expect(rows(record).slice(4, 8)).toEqual([
      ['reference:/references/0', 'unverifiable', 'source_unreadable:closing_references'],
      ['reference:/references/1', 'unverifiable', 'source_unreadable:closing_references'],
      ['reference:/references/2', 'unverifiable', 'source_unreadable:commit'],
      ['reference:/references/3', 'unverifiable', 'source_unreadable:compare'],
    ]);
    const errors = record.predicate.evidence.sources.filter((x) => x.error !== undefined);
    expect(errors.map((x) => [x.kind, x.error])).toEqual(
      expect.arrayContaining([
        ['closing_references', 'http_500'],
        ['commit', 'http_500'],
        ['compare', 'http_502'],
      ]),
    );
  });

  it('reads a closes_issues item that is not an issue reference (an external tracker) as unreadable', async () => {
    const s = scenario();
    s.closes = [{ id: 'EXT-3', title: 'external', references: { full: 'EXT-3' } }];
    const { record } = await checkMr(s);
    expect(rows(record)[4]).toEqual([
      'reference:/references/0',
      'unverifiable',
      'source_unreadable:closing_references',
    ]);
  });

  it('gives no record for a merge request GitLab answers under another project path', async () => {
    const s = scenario();
    s.mr = { ...s.mr, references: { full: 'example-org/renamed-repo!1' } };
    await expect(checkMr(s)).rejects.toBeInstanceOf(PullRequestUnreadable);
  });
});

describe('mergeSha by merge method (profile G.3, pullRequest)', () => {
  const SQUASH = '5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a';
  it('is the merge commit for a merge, the squash commit for a squash fast-forward, and absent for a fast-forward', async () => {
    const cases: [Record<string, unknown>, string | null][] = [
      [{ merge_commit_sha: GL_MERGE, squash_commit_sha: null }, GL_MERGE],
      [{ merge_commit_sha: GL_MERGE, squash_commit_sha: SQUASH, squash: true }, GL_MERGE],
      [{ merge_commit_sha: null, squash_commit_sha: SQUASH, squash: true }, SQUASH],
      [{ merge_commit_sha: null, squash_commit_sha: null }, null],
    ];
    for (const [over, mergeSha] of cases) {
      const s = scenario();
      s.mr = { ...s.mr, ...over };
      const { record } = await checkMr(s);
      expect(record.predicate.evidence.pullRequest.mergeSha).toBe(mergeSha);
      expect(record.predicate.subject.mergeSha).toBe(mergeSha);
    }
  });

  it('is null for a merge request that is not merged, whatever the API gives', async () => {
    const s = scenario();
    s.mr = { ...s.mr, state: 'opened', merged_at: null, squash_commit_sha: SQUASH };
    const { record } = await checkMr(s);
    expect(record.predicate.evidence.pullRequest.mergeSha).toBeNull();
  });
});

const SUBGROUP = 'example-org/sub-group/deeper/example-repo';

describe('a project in a subgroup (profile G.1)', () => {
  it("names a project by the GitLab schema's repository pattern, which admits every 0.1 path", () => {
    const gitlab = JSON.parse(
      readFileSync('spec/schema/record-gitlab-0.1-draft.schema.json', 'utf8'),
    ) as { $defs: { repository: { pattern: string } } };
    const v01 = JSON.parse(readFileSync('spec/schema/record-0.1.schema.json', 'utf8')) as {
      $defs: { repository: { pattern: string } };
    };
    expect(new RegExp(gitlab.$defs.repository.pattern).source).toBe(GITLAB_PROJECT.source);
    const old = new RegExp(v01.$defs.repository.pattern);
    for (const path of [GL_PROJECT, 'a/b', 'A-1/.x', 'org/-repo', SUBGROUP, 'g/s_1/p.q']) {
      if (old.test(path)) expect(GITLAB_PROJECT.test(path), path).toBe(true);
    }
    expect(GITLAB_PROJECT.test(SUBGROUP)).toBe(true);
    for (const bad of ['solo', 'a//b', '/a/b', 'a/b/', '.hidden/x', 'a/../b']) {
      expect(GITLAB_PROJECT.test(bad), bad).toBe(false);
    }
  });

  it('is checked under its full path, and its record validates against the GitLab schema', async () => {
    const block = {
      dunstan: '0.1',
      headCommit: GL_HEAD,
      filesChanged: FILES,
      references: [{ issue: '#3', relation: 'closes' }],
    };
    const s: GitLabScenario = {
      project: SUBGROUP,
      mr: baseMergeRequest({
        description: body(block),
        references: { short: '!1', relative: '!1', full: `${SUBGROUP}!1` },
      }),
      diffs: baseDiffs(),
      closes: [issueReference(`${SUBGROUP}#3`)],
    };
    const fake = fakeGitLab(s);
    const client = new GitLabClient({
      fetch: fake.fetch,
      warn: () => {},
      sleep: async () => {},
      now: () => new Date('2026-11-10T00:00:00Z'),
    });
    const record = await checkPullRequest({
      readers: gitlabReaders(client),
      repository: SUBGROUP,
      number: 1,
      report: async (pr) => reportFromMergeRequestDescription(pr),
      checker: CHECKER,
      recordFile: 'r.json',
      forge: { kind: 'gitlab', host: 'gitlab.com' },
    });
    expect(record.predicate.subject.repository).toBe(SUBGROUP);
    expect(record.subject[0]?.name).toBe(`git+https://gitlab.com/${SUBGROUP}@${GL_HEAD}`);
    expect(record.predicate.evidence.closingReferences).toEqual({
      status: 'ok',
      issues: [`${SUBGROUP}#3`],
    });
    expect(rows(record).find(([id]) => id === 'reference:/references/0')).toEqual([
      'reference:/references/0',
      'pass',
      null,
    ]);
    expect(fake.requests[0]?.url).toBe(
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(SUBGROUP)}/merge_requests/1`,
    );
    expect(verifyRecord(JSON.parse(serializeRecord(record))).ok).toBe(true);
  });
});

describe('token hygiene', () => {
  it('sends GITLAB_TOKEN as a header and never writes it into a record, a locator or a warning', async () => {
    const s = scenario();
    s.closesStatus = 503;
    s.commits = { [GL_PARENT]: 500, [GL_ELSEWHERE]: 200 };
    const { record, warnings, auth } = await checkMr(s, { token: TOKEN });
    expect(auth.every((a) => a === `Bearer ${TOKEN}`)).toBe(true);
    const bytes = serializeRecord(record);
    expect(bytes).not.toContain(TOKEN);
    expect(bytes).not.toContain('fake-gitlab-token');
    for (const source of record.predicate.evidence.sources) {
      expect(source.locator).not.toContain(TOKEN);
    }
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) expect(w).not.toContain(TOKEN);
  });

  it('names no token in the error for a merge request it cannot read', async () => {
    const s = scenario();
    s.mrStatus = 401;
    const error = await checkMr(s, { token: TOKEN }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(PullRequestUnreadable);
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it('sends no authorization header without a token', async () => {
    const { auth } = await checkMr(scenario());
    expect(auth.every((a) => a === undefined)).toBe(true);
  });
});

describe('a self-managed host', () => {
  it('reads from the host it is given and records it', async () => {
    const { record, urls } = await checkMr(scenario(), { host: 'gitlab.example.com' });
    expect(urls.every((u) => u.startsWith('https://gitlab.example.com/api/v4/'))).toBe(true);
    expect(record.predicate.subject.forge).toEqual({ kind: 'gitlab', host: 'gitlab.example.com' });
    expect(record.subject[0]?.name).toBe(`git+https://gitlab.example.com/${GL_PROJECT}@${GL_HEAD}`);
    expect(verifyRecord(JSON.parse(serializeRecord(record))).ok).toBe(true);
  });
});

const FILES = ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'];
const HEAD_PIPELINE = { id: 700, iid: 7, sha: GL_HEAD, ref: 'feature', status: 'success' };

// A block of the head and its files, with `extra` claims, as a merge request whose head pipeline is
// HEAD_PIPELINE unless `mr` says otherwise.
function ciScenario(
  extra: Record<string, unknown>,
  over: Partial<GitLabScenario> = {},
  mr: Record<string, unknown> = {},
): GitLabScenario {
  const block = { dunstan: '0.1', headCommit: GL_HEAD, filesChanged: FILES, ...extra };
  return {
    mr: baseMergeRequest({ description: body(block), head_pipeline: HEAD_PIPELINE, ...mr }),
    diffs: baseDiffs(),
    ...over,
  };
}

const countRows = (record: DunstanRecord) =>
  rows(record).filter(([id]) => (id as string).startsWith('count:'));
const timeRows = (record: DunstanRecord) =>
  rows(record).filter(([id]) => (id as string).startsWith('time:'));

const CHECKS = { checks: { total: 3, allSucceeded: true, noneFailed: true } };

describe('checks from the head pipeline (profile G.3, checkRuns)', () => {
  it('a passing pipeline, its jobs and its bridge, passes noneFailed and allSucceeded', async () => {
    const { record, urls } = await checkMr(
      ciScenario(CHECKS, {
        jobs: [glJob(12, 'test', 'success'), glJob(11, 'build', 'success')],
        bridges: [{ id: 13, name: 'downstream', status: 'success' }],
      }),
    );
    expect(record.predicate.evidence.checkRuns).toEqual({
      status: 'ok',
      commit: GL_HEAD,
      excludedIds: [],
      runs: [
        { id: 11, name: 'build', status: 'completed', conclusion: 'success' },
        { id: 12, name: 'test', status: 'completed', conclusion: 'success' },
        { id: 13, name: 'downstream', status: 'completed', conclusion: 'success' },
      ],
    });
    expect(countRows(record)).toEqual([
      ['count:/checks/total', 'pass', null],
      ['count:/checks/allSucceeded', 'pass', null],
      ['count:/checks/noneFailed', 'pass', null],
    ]);
    expect(record.predicate.verdict).toBe('pass');
    expect(urls).toContain(
      `https://gitlab.com/api/v4/projects/${GL_ID}/pipelines/700/jobs?include_retried=false&per_page=100&page=1`,
    );
    expect(urls).toContain(
      `https://gitlab.com/api/v4/projects/${GL_ID}/pipelines/700/bridges?per_page=100&page=1`,
    );
    expect(verifyRecord(JSON.parse(serializeRecord(record))).ok).toBe(true);
  });

  it('a failed job that is allowed to fail fails both', async () => {
    const { record } = await checkMr(
      ciScenario(CHECKS, {
        jobs: [
          glJob(11, 'build', 'success'),
          glJob(12, 'test', 'success'),
          glJob(13, 'lint', 'failed', { allowFailure: true }),
        ],
      }),
    );
    expect(record.predicate.evidence.checkRuns).toMatchObject({
      runs: [{}, {}, { id: 13, name: 'lint', status: 'completed', conclusion: 'failure' }],
    });
    expect(countRows(record)).toEqual([
      ['count:/checks/total', 'pass', null],
      ['count:/checks/allSucceeded', 'fail', 'all_succeeded_mismatch'],
      ['count:/checks/noneFailed', 'fail', 'none_failed_mismatch'],
    ]);
  });

  it('a cancelled job fails both', async () => {
    const { record } = await checkMr(
      ciScenario(CHECKS, {
        jobs: [
          glJob(11, 'build', 'success'),
          glJob(12, 'test', 'canceled'),
          glJob(13, 'lint', 'success'),
        ],
      }),
    );
    expect(countRows(record).slice(1)).toEqual([
      ['count:/checks/allSucceeded', 'fail', 'all_succeeded_mismatch'],
      ['count:/checks/noneFailed', 'fail', 'none_failed_mismatch'],
    ]);
  });

  it('a running job, or one not yet started, leaves both not passed', async () => {
    for (const status of [
      'created',
      'pending',
      'running',
      'preparing',
      'waiting_for_resource',
      'scheduled',
    ]) {
      const { record } = await checkMr(
        ciScenario(CHECKS, {
          jobs: [
            glJob(11, 'build', 'success'),
            glJob(12, 'test', status),
            glJob(13, 'lint', 'success'),
          ],
        }),
      );
      expect(countRows(record).slice(1)).toEqual([
        ['count:/checks/allSucceeded', 'unverifiable', 'checks_incomplete'],
        ['count:/checks/noneFailed', 'unverifiable', 'checks_incomplete'],
      ]);
    }
  });

  it('a skipped job and a manual job never run conclude skipped', async () => {
    const { record } = await checkMr(
      ciScenario(CHECKS, {
        jobs: [
          glJob(11, 'build', 'success'),
          glJob(12, 'optional', 'skipped'),
          glJob(13, 'deploy', 'manual'),
        ],
      }),
    );
    expect(record.predicate.evidence.checkRuns).toMatchObject({
      runs: [
        {},
        { id: 12, status: 'completed', conclusion: 'skipped' },
        { id: 13, status: 'completed', conclusion: 'skipped' },
      ],
    });
    expect(countRows(record).slice(1)).toEqual([
      ['count:/checks/allSucceeded', 'fail', 'all_succeeded_mismatch'],
      ['count:/checks/noneFailed', 'pass', null],
    ]);
  });

  it('a status the profile does not list makes the checks unverifiable', async () => {
    const { record } = await checkMr(
      ciScenario(CHECKS, {
        jobs: [glJob(11, 'build', 'success'), glJob(12, 'test', 'canceling')],
      }),
    );
    expect(record.predicate.evidence.checkRuns).toEqual({
      status: 'unreadable',
      source: 'check_runs',
    });
    expect(countRows(record).map((r) => r[1])).toEqual([
      'unverifiable',
      'unverifiable',
      'unverifiable',
    ]);
  });

  it("excludes the checker's own job and records it under excludedIds", async () => {
    const { record } = await checkMr(
      ciScenario(CHECKS, {
        jobs: [
          glJob(11, 'build', 'success'),
          glJob(12, 'test', 'success'),
          glJob(14, 'dunstan', 'running'),
        ],
        bridges: [{ id: 13, name: 'downstream', status: 'success' }],
      }),
      { excluded: [14] },
    );
    expect(record.predicate.evidence.checkRuns).toMatchObject({ excludedIds: [14] });
    expect(countRows(record)).toEqual([
      ['count:/checks/total', 'pass', null],
      ['count:/checks/allSucceeded', 'pass', null],
      ['count:/checks/noneFailed', 'pass', null],
    ]);
  });

  it('a head pipeline for another commit, or none, is unverifiable with a named reason', async () => {
    const other = await checkMr(
      ciScenario(
        CHECKS,
        { jobs: [glJob(11, 'build', 'success')] },
        {
          head_pipeline: { ...HEAD_PIPELINE, sha: GL_PARENT },
        },
      ),
    );
    expect(other.record.predicate.evidence.checkRuns).toEqual({
      status: 'unpopulated',
      field: 'head_pipeline_not_at_head_commit',
    });
    expect(countRows(other.record)).toEqual([
      [
        'count:/checks/total',
        'unverifiable',
        'evidence_field_unpopulated:head_pipeline_not_at_head_commit',
      ],
      [
        'count:/checks/allSucceeded',
        'unverifiable',
        'evidence_field_unpopulated:head_pipeline_not_at_head_commit',
      ],
      [
        'count:/checks/noneFailed',
        'unverifiable',
        'evidence_field_unpopulated:head_pipeline_not_at_head_commit',
      ],
    ]);
    expect(other.urls.some((u) => /pipelines/.test(u))).toBe(false);

    const none = await checkMr(ciScenario(CHECKS, {}, { head_pipeline: null }));
    expect(countRows(none.record).map((r) => r[2])).toEqual([
      'evidence_field_unpopulated:head_pipeline',
      'evidence_field_unpopulated:head_pipeline',
      'evidence_field_unpopulated:head_pipeline',
    ]);
    expect(verifyRecord(JSON.parse(serializeRecord(none.record))).ok).toBe(true);
  });

  it('an unreadable jobs listing makes the checks unreadable', async () => {
    const { record } = await checkMr(ciScenario(CHECKS, { jobs: 500 }));
    expect(record.predicate.evidence.checkRuns).toEqual({
      status: 'unreadable',
      source: 'check_runs',
    });
  });
});

const JUNIT_RECORD = {
  kind: 'junit',
  workflow: '.gitlab-ci.yml',
  job: 'test',
  artifact: 'archive',
  path: 'reports/junit.xml',
};
const TESTS = { tests: [{ command: 'npm test', count: 4, failures: 2, record: JUNIT_RECORD }] };
const EXPIRES = '2026-12-01T00:00:00.000Z';

describe('junit test records from a job artifact (profile G.3, testRecords)', () => {
  it('counts the JUnit file in the named job’s artifacts archive itself', async () => {
    const { record, urls } = await checkMr(
      ciScenario(TESTS, {
        jobs: [
          glJob(11, 'build', 'success'),
          glJob(12, 'test', 'success', { archive: true, expireAt: EXPIRES }),
        ],
        artifacts: {
          12: makeZip({ 'reports/junit.xml': junitXml(['pass', 'fail', 'error', 'skip', 'pass']) }),
        },
      }),
    );
    expect(record.predicate.evidence.testRecords).toEqual([
      {
        record: JUNIT_RECORD,
        status: 'ok',
        runs: [{ runId: 12, runAttempt: 1, executed: 4, failed: 2 }],
      },
    ]);
    expect(countRows(record)).toEqual([
      ['count:/tests/0/count', 'pass', null],
      ['count:/tests/0/failures', 'pass', null],
    ]);
    expect(urls).toContain(`https://gitlab.com/api/v4/projects/${GL_ID}/jobs/12/artifacts`);
    expect(
      record.predicate.evidence.sources.some(
        (s) =>
          s.kind === 'artifact' &&
          s.locator === `GET /api/v4/projects/${GL_ID}/jobs/12/artifacts#reports/junit.xml`,
      ),
    ).toBe(true);
    expect(verifyRecord(JSON.parse(serializeRecord(record))).ok).toBe(true);
  });

  it('a missing job, a missing artifact or a missing file is record_not_found', async () => {
    const zip = makeZip({ 'other.xml': junitXml(['pass']) });
    for (const over of [
      { jobs: [glJob(11, 'build', 'success', { archive: true })], artifacts: { 11: zip } },
      { jobs: [glJob(12, 'test', 'success')] },
      { jobs: [glJob(12, 'test', 'success', { archive: true })], artifacts: { 12: zip } },
    ]) {
      const { record } = await checkMr(ciScenario(TESTS, over));
      expect(countRows(record)).toEqual([
        ['count:/tests/0/count', 'unverifiable', 'record_not_found'],
        ['count:/tests/0/failures', 'unverifiable', 'record_not_found'],
      ]);
    }
  });

  it('an expired artifact is source_unreadable:artifact', async () => {
    for (const over of [
      { jobs: [glJob(12, 'test', 'success', { expireAt: '2026-11-05T00:00:00.000Z' })] },
      {
        jobs: [glJob(12, 'test', 'success', { archive: true, expireAt: EXPIRES })],
        artifacts: { 12: 404 },
      },
    ]) {
      const { record } = await checkMr(ciScenario(TESTS, over));
      expect(record.predicate.evidence.testRecords).toEqual([
        { record: JUNIT_RECORD, status: 'unreadable', source: 'artifact' },
      ]);
      expect(countRows(record).map((r) => r[2])).toEqual([
        'source_unreadable:artifact',
        'source_unreadable:artifact',
      ]);
    }
  });

  it('an unparseable file or archive is source_unreadable:artifact', async () => {
    for (const bytes of [
      makeZip({ 'reports/junit.xml': '<testsuites><testcase' }),
      new TextEncoder().encode('not a zip'),
    ]) {
      const { record } = await checkMr(
        ciScenario(TESTS, {
          jobs: [glJob(12, 'test', 'success', { archive: true })],
          artifacts: { 12: bytes },
        }),
      );
      expect(countRows(record).map((r) => r[2])).toEqual([
        'source_unreadable:artifact',
        'source_unreadable:artifact',
      ]);
    }
  });

  it('a record whose workflow is not the project’s CI configuration file is record_not_found', async () => {
    const { record } = await checkMr(
      ciScenario(TESTS, {
        jobs: [glJob(12, 'test', 'success', { archive: true })],
        artifacts: { 12: makeZip({ 'reports/junit.xml': junitXml(['pass']) }) },
        projects: {
          [GL_PROJECT]: { path_with_namespace: GL_PROJECT, ci_config_path: 'ci/pipeline.yml' },
        },
      }),
    );
    expect(countRows(record).map((r) => r[2])).toEqual(['record_not_found', 'record_not_found']);
  });

  it('a merge request that changes the CI configuration file produced its own record', async () => {
    const diffs = [
      ...baseDiffs(),
      {
        old_path: '.gitlab-ci.yml',
        new_path: '.gitlab-ci.yml',
        new_file: false,
        renamed_file: false,
        deleted_file: false,
        diff: '',
      },
    ];
    const s = ciScenario(
      { ...TESTS, filesChanged: [...FILES, '.gitlab-ci.yml'] },
      { diffs, jobs: [glJob(12, 'test', 'success', { archive: true })] },
      { changes_count: '4' },
    );
    const { record } = await checkMr(s);
    expect(countRows(record).map((r) => r[2])).toEqual([
      'record_producer_changed_by_pr',
      'record_producer_changed_by_pr',
    ]);
  });
});

const DEPLOYED = { deployedAt: { at: '2026-11-02T00:00:00Z', environment: 'production' } };

describe('deployedAt from GitLab deployments (profile G.3, deployments)', () => {
  it('a successful deployment of the head passes, with relation head', async () => {
    const { record, urls } = await checkMr(
      ciScenario(DEPLOYED, {
        deployments: [
          glDeployment(
            5,
            GL_HEAD,
            'success',
            '2026-11-01T10:00:00.000Z',
            '2026-11-01T10:05:00.000Z',
          ),
          glDeployment(
            6,
            GL_HEAD,
            'success',
            '2026-11-01T10:00:00.000Z',
            '2026-11-01T10:05:00.000Z',
            'staging',
          ),
        ],
      }),
    );
    expect(record.predicate.evidence.deployments).toEqual([
      {
        environment: 'production',
        status: 'ok',
        deployments: [
          { id: 5, sha: GL_HEAD, relation: 'head', successAt: '2026-11-01T10:05:00.000Z' },
        ],
      },
    ]);
    expect(timeRows(record)).toEqual([['time:/deployedAt', 'pass', null]]);
    expect(urls).toContain(
      `https://gitlab.com/api/v4/projects/${GL_ID}/deployments?environment=production&order_by=id&sort=desc&per_page=100&page=1`,
    );
    expect(verifyRecord(JSON.parse(serializeRecord(record))).ok).toBe(true);
  });

  it('a deployment of an older commit after the merge is unrelated, and fails no_deployment', async () => {
    const { record } = await checkMr(
      ciScenario(DEPLOYED, {
        deployments: [
          glDeployment(
            7,
            GL_ELSEWHERE,
            'success',
            '2026-11-01T13:00:00.000Z',
            '2026-11-01T13:05:00.000Z',
          ),
        ],
        mergeBase: { [GL_MERGE]: GL_ELSEWHERE },
      }),
    );
    expect(record.predicate.evidence.deployments).toEqual([
      {
        environment: 'production',
        status: 'ok',
        deployments: [
          {
            id: 7,
            sha: GL_ELSEWHERE,
            relation: 'unrelated',
            successAt: '2026-11-01T13:05:00.000Z',
          },
        ],
      },
    ]);
    expect(timeRows(record)).toEqual([['time:/deployedAt', 'fail', 'no_deployment']]);
  });

  it('a deployment of a descendant of the merge commit passes', async () => {
    const { record } = await checkMr(
      ciScenario(DEPLOYED, {
        deployments: [
          glDeployment(
            8,
            GL_ELSEWHERE,
            'success',
            '2026-11-01T13:00:00.000Z',
            '2026-11-01T13:05:00.000Z',
          ),
        ],
        mergeBase: { [GL_MERGE]: GL_MERGE },
      }),
    );
    expect(record.predicate.evidence.deployments?.[0]).toMatchObject({
      deployments: [{ id: 8, relation: 'descendant' }],
    });
    expect(timeRows(record)).toEqual([['time:/deployedAt', 'pass', null]]);
  });

  it('a failed deployment of the head has no success, and fails no_deployment', async () => {
    const { record } = await checkMr(
      ciScenario(DEPLOYED, {
        deployments: [
          glDeployment(
            5,
            GL_HEAD,
            'failed',
            '2026-11-01T10:00:00.000Z',
            '2026-11-01T10:05:00.000Z',
          ),
        ],
      }),
    );
    expect(record.predicate.evidence.deployments).toEqual([
      {
        environment: 'production',
        status: 'ok',
        deployments: [{ id: 5, sha: GL_HEAD, relation: 'head', successAt: null }],
      },
    ]);
    expect(timeRows(record)).toEqual([['time:/deployedAt', 'fail', 'no_deployment']]);
  });

  it('a deployment status the profile does not list makes the section unreadable', async () => {
    const { record } = await checkMr(
      ciScenario(DEPLOYED, {
        deployments: [
          glDeployment(
            5,
            GL_HEAD,
            'teleported',
            '2026-11-01T10:00:00.000Z',
            '2026-11-01T10:05:00.000Z',
          ),
        ],
      }),
    );
    expect(timeRows(record)).toEqual([
      ['time:/deployedAt', 'unverifiable', 'source_unreadable:deployments'],
    ]);
  });
});

describe('verdicts are forge-blind', () => {
  it('src/check names no forge: a verdict is the same function of block and evidence on either', () => {
    const dir = new URL('../check/', import.meta.url);
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    )) {
      const text = readFileSync(new URL(file, dir), 'utf8');
      expect(text, file).not.toMatch(/gitlab|forge/i);
    }
  });

  it('a GitLab record holds exactly the claims runChecks gives its block and evidence', async () => {
    const { record } = await checkMr(scenario());
    const { runChecks } = await import('../check/index.js');
    const p = record.predicate;
    expect(p.claims).toEqual(runChecks(p.block.value as Block, p.evidence, p.subject.repository));
  });
});

describe('GitHub records are unchanged', () => {
  const dir = new URL('../../spec/examples/records/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it.each(files)('%s is rebuilt to the same JCS bytes, with no forge member', (file) => {
    const original = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as DunstanRecord;
    const p = original.predicate;
    const rebuilt = buildRecord({
      checker: p.checker,
      report: p.report,
      block: p.block,
      repository: p.subject.repository,
      evidence: p.evidence,
      rerun: p.rerun,
      assurance: p.assurance,
    });
    expect(canonicalize(rebuilt as unknown as JsonValue)).toBe(
      canonicalize(original as unknown as JsonValue),
    );
    expect('forge' in rebuilt.predicate.subject).toBe(false);
    expect(rebuilt.predicateType).toBe('https://barglabs.ai/dunstan/record/v0.1');
  });

  it('a GitLab draft record is refused by a 0.1 consumer', async () => {
    const { record } = await checkMr(scenario());
    const asGitHub = { ...record, predicateType: 'https://barglabs.ai/dunstan/record/v0.1' };
    expect(verifyRecord(JSON.parse(JSON.stringify(asGitHub))).ok).toBe(false);
  });

  it('a block is extracted from a description exactly as from a pull request body', () => {
    const extracted = recordBlock(extractHandbackBlock(body(FULL_BLOCK)));
    expect(extracted.status).toBe('found');
    expect((extracted.value as Block).headCommit).toBe(GL_HEAD);
  });
});

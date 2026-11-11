// `dunstan check`, `verify` and `rerun` on a GitLab merge request (spec/claim-format.md, "DRAFT
// GitLab profile 0.1"), against a fake GitLab. Every GitHub flag keeps its meaning: cli.test.ts is
// unchanged.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  baseDiffs,
  baseMergeRequest,
  fakeGitLab,
  type GitLabScenario,
  GL_HEAD,
  GL_PARENT,
  GL_PROJECT,
} from '../__tests__/fake-gitlab.js';
import { main } from './main.js';

// Not a real token, and not in GitLab's token format.
const TOKEN = 'fake-gitlab-token-CLI-0042';

function scenario(): GitLabScenario {
  return {
    mr: baseMergeRequest({
      description: `Done.\n\n\`\`\`dunstan-handback\n${JSON.stringify({
        dunstan: '0.1',
        headCommit: GL_HEAD,
        filesChanged: ['src/new-name.ts', 'src/added.ts', 'docs/gone.md'],
      })}\n\`\`\`\n`,
    }),
    diffs: baseDiffs(),
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dunstan-gitlab-cli-'));
});

async function run(argv: string[], s: GitLabScenario = scenario(), env = { GITLAB_TOKEN: TOKEN }) {
  let out = '';
  let err = '';
  const fake = fakeGitLab(s);
  const code = await main(argv, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env,
    artifact: import.meta.url,
    fetch: fake.fetch,
    readStdin: () => new TextEncoder().encode('from stdin, no block'),
  });
  return { code, out, err, requests: fake.requests };
}

describe('dunstan check on a GitLab merge request', () => {
  it('reads the description as the report and writes a GitLab record that verifies', async () => {
    const out = join(dir, 'r.json');
    const r = await run([
      'check',
      '--gitlab-project',
      GL_PROJECT,
      '--mr',
      '1',
      '--report-mr-description',
      '--out',
      out,
    ]);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/verdict: pass/);
    const text = readFileSync(out, 'utf8');
    const written = JSON.parse(text);
    expect(written.predicate.subject.forge).toEqual({ kind: 'gitlab', host: 'gitlab.com' });
    expect(written.predicate.rerun).toEqual({
      offline: 'dunstan verify r.json',
      online: 'dunstan rerun r.json',
    });
    expect(r.requests.every((q) => q.url.startsWith('https://gitlab.com/api/v4/'))).toBe(true);
    expect(r.requests.every((q) => q.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(text).not.toContain(TOKEN);
    expect(r.out).not.toContain(TOKEN);

    const v = await run(['verify', out]);
    expect(v.code).toBe(0);
  });

  it('reads a self-managed host and a report file', async () => {
    const out = join(dir, 'r.json');
    const report = join(dir, 'report.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      report,
      `\`\`\`dunstan-handback\n${JSON.stringify({ dunstan: '0.1', headCommit: GL_HEAD, filesChanged: ['src/added.ts'] })}\n\`\`\`\n`,
    );
    const r = await run([
      'check',
      '--gitlab-project',
      GL_PROJECT,
      '--mr',
      '1',
      '--gitlab-host',
      'gitlab.example.com',
      '--report-file',
      report,
      '--out',
      out,
    ]);
    expect(r.code).toBe(1);
    expect(r.requests.every((q) => q.url.startsWith('https://gitlab.example.com/api/v4/'))).toBe(
      true,
    );
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.predicate.subject.forge.host).toBe('gitlab.example.com');
    expect(written.predicate.report.source).toEqual({ kind: 'file', locator: report });
  });

  it('says it reads anonymously without GITLAB_TOKEN and sends no token', async () => {
    const out = join(dir, 'r.json');
    const r = await run(
      [
        'check',
        '--gitlab-project',
        GL_PROJECT,
        '--mr',
        '1',
        '--report-mr-description',
        '--out',
        out,
      ],
      scenario(),
      {} as { GITLAB_TOKEN: string },
    );
    expect(r.err).toContain('GITLAB_TOKEN is not set; reading anonymously');
    expect(r.requests.every((q) => q.headers.authorization === undefined)).toBe(true);
  });

  it('writes no record when the merge request moves twice, and names no token', async () => {
    const out = join(dir, 'r.json');
    const s = scenario();
    s.mrMoves = [{}, { sha: GL_PARENT }, { sha: GL_PARENT }, { sha: GL_HEAD }];
    const r = await run(
      [
        'check',
        '--gitlab-project',
        GL_PROJECT,
        '--mr',
        '1',
        '--report-mr-description',
        '--out',
        out,
      ],
      s,
    );
    expect(r.code).toBe(3);
    expect(r.err).toContain('pull_request_moved');
    expect(r.err).not.toContain(TOKEN);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses flags that do not apply to a merge request, and mixing the two forges', async () => {
    const base = ['check', '--gitlab-project', GL_PROJECT, '--mr', '1'];
    for (const extra of [
      ['--report-pr-body'],
      ['--report-comment-author', 'someone'],
      ['--report-mr-description', '--repo', GL_PROJECT],
      ['--report-mr-description', '--pr', '1'],
      ['--report-mr-description', '--exclude-check-run', '5'],
      ['--report-mr-description', '--advisory'],
      ['--report-mr-description', '--gitlab-host', 'https://gitlab.example.com'],
    ]) {
      const r = await run([...base, ...extra]);
      expect(r.code, extra.join(' ')).toBe(3);
      expect(r.requests).toEqual([]);
    }
    const nested = await run([
      'check',
      '--gitlab-project',
      'one-segment-only',
      '--mr',
      '1',
      '--report-mr-description',
    ]);
    expect(nested.code).toBe(3);
    const github = await run([
      'check',
      '--repo',
      GL_PROJECT,
      '--pr',
      '1',
      '--report-mr-description',
    ]);
    expect(github.code).toBe(3);
  });

  it('documents the GitLab flags in --help', async () => {
    const r = await run(['--help']);
    expect(r.out).toContain('--gitlab-project <namespace/project> --mr <iid>');
    expect(r.out).toContain('--gitlab-host <host>');
    expect(r.out).toContain('--report-mr-description');
    expect(r.out).toContain('[--exclude-gitlab-job <id>]...');
  });

  it('refuses an --exclude-gitlab-job that is not a positive integer', async () => {
    const r = await run([
      'check',
      '--gitlab-project',
      GL_PROJECT,
      '--mr',
      '1',
      '--report-mr-description',
      '--exclude-gitlab-job',
      'x',
    ]);
    expect(r.code).toBe(3);
    expect(r.requests).toEqual([]);
  });
});

describe('dunstan rerun of a GitLab record', () => {
  it('re-reads the merge request from the recorded host and writes a new record', async () => {
    const out = join(dir, 'r.json');
    await run([
      'check',
      '--gitlab-project',
      GL_PROJECT,
      '--mr',
      '1',
      '--gitlab-host',
      'gitlab.example.com',
      '--report-mr-description',
      '--out',
      out,
    ]);
    const r = await run(['rerun', out]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('evidence unchanged');
    expect(r.requests.length).toBeGreaterThan(0);
    expect(r.requests.every((q) => q.url.startsWith('https://gitlab.example.com/api/v4/'))).toBe(
      true,
    );
    const again = JSON.parse(readFileSync(join(dir, 'r.rerun.json'), 'utf8'));
    expect(again.predicate.subject.forge).toEqual({ kind: 'gitlab', host: 'gitlab.example.com' });
  });
});

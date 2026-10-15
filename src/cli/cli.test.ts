import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
import { canonicalize } from '../spec/jcs.js';
import { main } from './main.js';

const PUSHED = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';

function scenario(): Scenario {
  return {
    pr: basePullRequest({
      body: `Done.\n\n\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${HEAD}","filesChanged":["src/a.ts"]}\n\`\`\`\n`,
    }),
    files: [
      { filename: 'src/a.ts', status: 'modified' },
      { filename: 'src/b.ts', status: 'added' },
    ],
    comments: [
      { id: 1, user: { login: 'agent-bot' }, created_at: '2026-10-04T10:00:00Z', body: 'no block' },
      {
        id: 2,
        user: { login: 'Agent-Bot' },
        created_at: '2026-10-04T11:00:00Z',
        body: `\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${HEAD}","filesChanged":["src/a.ts","src/b.ts"]}\n\`\`\``,
      },
      { id: 3, user: { login: 'someone-else' }, created_at: '2026-10-04T12:00:00Z', body: 'x' },
    ],
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dunstan-cli-'));
});

async function run(argv: string[], s: Scenario = scenario()) {
  let out = '';
  let err = '';
  const fake = fakeGitHub(s);
  const code = await main(argv, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    env: { GITHUB_TOKEN: 'test-token' },
    artifact: import.meta.url,
    fetch: fake.fetch,
    readStdin: () => new TextEncoder().encode('from stdin, no block'),
  });
  return { code, out, err, requests: fake.requests };
}

const record = (name: string) => join(dir, name);

describe('dunstan check', () => {
  it('reads the PR body as the report, writes the record and exits 1 on an undeclared file', async () => {
    const out = record('r.json');
    const r = await run(['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(
      /fail\s+scope:undeclared:src\/b\.ts\s+null\s+src\/b\.ts\s+undeclared_file/,
    );
    expect(r.out).toMatch(/verdict: fail/);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.predicate.report.source).toEqual({
      kind: 'pr-body',
      locator: `GET /repos/${REPO}/pulls/7#body`,
    });
    expect(written.predicate.rerun).toEqual({
      offline: 'dunstan verify r.json',
      online: 'dunstan rerun r.json',
    });
  });

  it('reads the latest comment by the named author (case-insensitive) and exits 0 on a pass', async () => {
    const out = record('c.json');
    const r = await run([
      'check',
      '--repo',
      REPO,
      '--pr',
      '7',
      '--report-comment-author',
      'agent-bot',
      '--out',
      out,
    ]);
    expect(r.code).toBe(0);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    expect(written.predicate.report.source.locator).toBe(
      `GET /repos/${REPO}/issues/comments/2#body`,
    );
    expect(written.predicate.verdict).toBe('pass');
  });

  // Spec section 3: among the named author's comments, the latest created_at, then the highest id,
  // in whatever order the listing gives them. The locator names that comment by its id.
  it('takes the latest created_at, then the highest id, among the named author comments', async () => {
    const comment = (id: number, createdAt: string, body: string) => ({
      id,
      user: { login: 'agent-bot' },
      created_at: createdAt,
      body,
    });
    const comments = [
      comment(12, '2026-10-04T10:00:00Z', 'earlier, with the highest id'),
      comment(11, '2026-10-04T11:00:00Z', 'latest, and the higher id of the two'),
      comment(10, '2026-10-04T11:00:00Z', 'latest, with a lower id'),
      { id: 13, user: { login: 'someone-else' }, created_at: '2026-10-04T12:00:00Z', body: 'x' },
    ];
    for (const listed of [comments, [...comments].reverse()]) {
      const out = record('tie.json');
      await run(
        [
          'check',
          '--repo',
          REPO,
          '--pr',
          '7',
          '--report-comment-author',
          'agent-bot',
          '--out',
          out,
        ],
        { ...scenario(), comments: listed },
      );
      expect(JSON.parse(readFileSync(out, 'utf8')).predicate.report.source).toEqual({
        kind: 'pr-comment',
        locator: `GET /repos/${REPO}/issues/comments/11#body`,
      });
    }
  });

  it('exits 2 for a report with no block, and reads nothing but the pull request, twice', async () => {
    const report = record('report.md');
    writeFileSync(report, 'All done, tests pass.\n');
    const r = await run([
      'check',
      '--repo',
      REPO,
      '--pr',
      '7',
      '--report-file',
      report,
      '--out',
      record('m.json'),
    ]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/block: missing \(block_missing\)/);
    // Read, then read again once the evidence (none here) is read: it did not move.
    expect(r.requests).toEqual([`GET /repos/${REPO}/pulls/7`, `GET /repos/${REPO}/pulls/7`]);
  });

  it('reads standard input for --report-file -', async () => {
    const out = record('s.json');
    const r = await run(['check', '--repo', REPO, '--pr', '7', '--report-file', '-', '--out', out]);
    expect(r.code).toBe(2);
    expect(JSON.parse(readFileSync(out, 'utf8')).predicate.report.source).toEqual({
      kind: 'stdin',
      locator: 'stdin',
    });
  });

  it.each([
    [['check', '--repo', REPO, '--pr', '7'], /exactly one report/],
    [
      ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--report-file', 'x'],
      /exactly one report/,
    ],
    [['check', '--pr', '7', '--report-pr-body'], /--repo/],
    [['check', '--repo', REPO, '--pr', 'seven', '--report-pr-body'], /--pr must be/],
    [['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--bogus'], /Unknown option/],
    [['frobnicate'], /unknown command/],
  ])('exits 3 on a usage error: %j', async (argv, message) => {
    const r = await run(argv as string[]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(message);
  });

  it('exits 3 and writes no record when the pull request cannot be read', async () => {
    const out = record('none.json');
    const r = await run(['check', '--repo', REPO, '--pr', '8', '--report-pr-body', '--out', out]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/no record is written/);
    expect(existsSync(out)).toBe(false);
  });

  // Moved between the first read and the read after the evidence, and again on the second run.
  it('exits 3 and writes no record when the pull request moves on both runs (pull_request_moved)', async () => {
    const s = scenario();
    const heads = [HEAD, PUSHED, PUSHED, 'c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0'];
    let reads = 0;
    const fake = fakeGitHub(s);
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).pathname === `/repos/${REPO}/pulls/7`) {
        s.pr = { ...s.pr, head: { sha: heads[Math.min(reads++, heads.length - 1)] } };
      }
      return fake.fetch(input, init);
    }) as typeof fetch;
    const out = record('moved.json');
    let err = '';
    const code = await main(
      ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out],
      {
        out: () => {},
        err: (t) => {
          err += t;
        },
        env: { GITHUB_TOKEN: 'test-token' },
        artifact: import.meta.url,
        fetch: fetchFn,
        readStdin: () => new Uint8Array(),
      },
    );
    expect(code).toBe(3);
    expect(err).toMatch(/^dunstan: pull request .* moved .*pull_request_moved/);
    expect(err).not.toMatch(/internal error/);
    expect(existsSync(out)).toBe(false);
    expect(fake.requests.filter((q) => q === `GET /repos/${REPO}/pulls/7`)).toHaveLength(4);
  });

  it('exits 3 when the named author has no comment', async () => {
    const r = await run([
      'check',
      '--repo',
      REPO,
      '--pr',
      '7',
      '--report-comment-author',
      'nobody',
      '--out',
      record('n.json'),
    ]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/nobody has no comment/);
  });

  // Spec section 3: the comment listing is bounded at 100 pages of 100, like every listing the
  // reader pages. A listing that answers 100 full pages has not ended, so the named author's latest
  // comment may lie beyond it: the report is unreadable, never a pick among the comments read.
  const comments = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      user: { login: 'agent-bot' },
      created_at: '2026-10-04T10:00:00Z',
      body: `comment ${i + 1}`,
    }));
  const byComment = (out: string) => [
    'check',
    '--repo',
    REPO,
    '--pr',
    '7',
    '--report-comment-author',
    'agent-bot',
    '--out',
    out,
  ];

  it('exits 3 and writes no record when the comment listing answers 100 full pages', async () => {
    const out = record('bound.json');
    const r = await run(byComment(out), { ...scenario(), comments: comments(10_001) });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(`cannot list comments on ${REPO}#7 (more than 100 pages)`);
    expect(existsSync(out)).toBe(false);
    expect(r.requests.filter((q) => q.includes('/issues/7/comments'))).toHaveLength(100);
  });

  it('reads a comment listing that ends on a short page at page 100', async () => {
    const out = record('short.json');
    const r = await run(byComment(out), { ...scenario(), comments: comments(9_999) });
    expect(r.code).toBe(2);
    expect(JSON.parse(readFileSync(out, 'utf8')).predicate.report.source.locator).toBe(
      `GET /repos/${REPO}/issues/comments/9999#body`,
    );
  });
});

describe('dunstan verify', () => {
  it('verifies a record offline, and names the member a tampered record differs in', async () => {
    const out = record('v.json');
    await run(['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out]);
    const ok = await run(['verify', out]);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^verified: .*verdict fail, 3 claims/);
    expect(ok.requests).toEqual([]);

    const tampered = JSON.parse(readFileSync(out, 'utf8'));
    tampered.predicate.claims[2] = { ...tampered.predicate.claims[2], verdict: 'pass' };
    delete tampered.predicate.claims[2].reason;
    tampered.predicate.verdict = 'pass';
    writeFileSync(out, JSON.stringify(tampered));
    const bad = await run(['verify', out]);
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/\/predicate\/claims\/2/);
    expect(bad.out).toMatch(/\/predicate\/verdict/);
    expect(bad.requests).toEqual([]);
  });

  it('refuses a file that is not JSON', async () => {
    const path = record('x.json');
    writeFileSync(path, '{"a":1,"a":2}');
    const r = await run(['verify', path]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/duplicate_member/);
  });
});

describe('dunstan rerun', () => {
  it('reports evidence_changed with the fields that moved, writes a new record and keeps the old one', async () => {
    const out = record('old.json');
    await run([
      'check',
      '--repo',
      REPO,
      '--pr',
      '7',
      '--report-comment-author',
      'agent-bot',
      '--out',
      out,
    ]);
    const before = readFileSync(out, 'utf8');

    const moved = scenario();
    moved.files?.push({ filename: 'src/c.ts', status: 'added' });
    moved.pr.changed_files = 3;
    const r = await run(['rerun', out], moved);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/evidence_changed: \d+ field\(s\)/);
    expect(r.out).toContain('  /evidence/files/entries/2\n');
    expect(r.out).toContain('/evidence/pullRequest/changedFiles');
    expect(r.out).toMatch(/verdict: pass -> fail/);
    expect(readFileSync(out, 'utf8')).toBe(before);
    const fresh = JSON.parse(readFileSync(record('old.rerun.json'), 'utf8'));
    expect(fresh.predicate.report).toEqual(JSON.parse(before).predicate.report);
    // The report is not re-read: the recorded block is the claim.
    expect(r.requests.some((q) => q.includes('/comments'))).toBe(false);
  });

  // The re-run reads at one pull request too: once more if it moved, and no record if it moved again.
  it('writes no new record when the pull request moves on both runs (pull_request_moved)', async () => {
    const out = record('held.json');
    await run(['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out]);
    const head = (sha: string) => ({ head: { sha } });
    const r = await run(['rerun', out], {
      ...scenario(),
      prMoves: [
        head(HEAD),
        head(PUSHED),
        head(PUSHED),
        head('c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0'),
      ],
    });
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/^dunstan: pull request .* moved .*pull_request_moved/);
    expect(existsSync(record('held.rerun.json'))).toBe(false);
  });

  it('re-runs once more from a fresh read when the pull request moved once', async () => {
    const out = record('once.json');
    await run(['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out]);
    const r = await run(['rerun', out], {
      ...scenario(),
      prMoves: [{ head: { sha: HEAD } }, { head: { sha: PUSHED } }],
    });
    expect(r.code).toBe(1);
    const fresh = JSON.parse(readFileSync(record('once.rerun.json'), 'utf8'));
    expect(fresh.predicate.subject.headSha).toBe(PUSHED);
    expect(r.out).toContain('/evidence/pullRequest/headSha');
    expect(r.requests.filter((q) => q === `GET /repos/${REPO}/pulls/7`)).toHaveLength(4);
  });

  it('reports unchanged evidence when nothing a claim reads moved', async () => {
    const out = record('same.json');
    await run(['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out]);
    const r = await run(['rerun', out]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^evidence unchanged/);
  });

  // A record written before spec 0.1.5 holds each Actions run's workflow path and not its name. Its
  // re-run reads the name and reports it as a field that moved, as any new evidence member is; the
  // 0.1 gate reads nothing new, so the verdict stays.
  it("reports a workflow's name the record did not hold as evidence_changed, the verdict unchanged", async () => {
    const withChecks = (name?: string): Scenario => ({
      ...scenario(),
      pr: basePullRequest({
        body: `\`\`\`dunstan-handback\n{"dunstan":"0.1","headCommit":"${HEAD}","filesChanged":["src/a.ts","src/b.ts"],"checks":{"total":1,"allSucceeded":true}}\n\`\`\`\n`,
      }),
      checkRuns: [
        {
          id: 21,
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          check_suite: { id: 70 },
          app: { slug: 'github-actions' },
        },
      ],
      workflowRuns: [
        {
          id: 100,
          check_suite_id: 70,
          run_attempt: 1,
          path: '.github/workflows/ci.yml',
          head_sha: HEAD,
          ...(name === undefined ? {} : { name }),
        },
      ],
    });
    const out = record('unnamed.json');
    await run(
      ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out],
      withChecks(),
    );
    const old = JSON.parse(readFileSync(out, 'utf8'));
    expect(old.predicate.evidence.checkRuns.runs[0].workflowPath).toBe('.github/workflows/ci.yml');
    expect('workflowName' in old.predicate.evidence.checkRuns.runs[0]).toBe(false);
    expect((await run(['verify', out])).code).toBe(0);

    const r = await run(['rerun', out], withChecks('CI'));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /^evidence_changed: 1 field\(s\)\n {2}\/evidence\/checkRuns\/runs\/0\/workflowName\n/,
    );
    expect(r.out).toMatch(/verdict: pass -> pass/);
    const fresh = JSON.parse(readFileSync(record('unnamed.rerun.json'), 'utf8'));
    expect(fresh.predicate.evidence.checkRuns.runs[0].workflowName).toBe('CI');
    expect(fresh.predicate.claims).toEqual(old.predicate.claims);
    expect(fresh.predicate.digests.claims).toBe(old.predicate.digests.claims);
  });

  it('never overwrites the record it re-runs', async () => {
    const out = record('keep.json');
    await run(['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out]);
    const r = await run(['rerun', out, '--out', out]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/never overwrites/);
  });
});

describe('signing', () => {
  it('signs a record as its JCS bytes and verifies the detached signature', async () => {
    const key = join(dir, 'key');
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', key]);
    const pub = readFileSync(`${key}.pub`, 'utf8').trim();
    const allowed = join(dir, 'allowed_signers');
    writeFileSync(allowed, `checker@example.org namespaces="dunstan-record" ${pub}\n`);

    const out = record('signed.json');
    const r = await run([
      'check',
      '--repo',
      REPO,
      '--pr',
      '7',
      '--report-pr-body',
      '--out',
      out,
      '--sign-key',
      key,
      '--signer',
      'checker@example.org',
    ]);
    expect(r.code).toBe(1);
    const bytes = readFileSync(out, 'utf8');
    const parsed = JSON.parse(bytes);
    expect(bytes).toBe(canonicalize(parsed));
    expect(parsed.predicate.assurance).toMatchObject({
      status: 'signed',
      issuer: 'checker@example.org',
    });
    expect(parsed.predicate.assurance.keyFingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);

    const ok = await run(['verify', out, '--sig', `${out}.sig`, '--allowed-signers', allowed]);
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/Good "dunstan-record" signature for checker@example.org/);

    // One changed byte breaks the signature even if the record still recomputes.
    writeFileSync(out, bytes.replace('"spec":"0.1.7"', '"spec":"0.1.8"'));
    const bad = await run(['verify', out, '--sig', `${out}.sig`, '--allowed-signers', allowed]);
    expect(bad.code).toBe(1);
    expect(bad.out).toMatch(/\/predicate\/assurance: signature/);
  });

  it('requires --signer with --sign-key', async () => {
    const r = await run([
      'check',
      '--repo',
      REPO,
      '--pr',
      '7',
      '--report-pr-body',
      '--sign-key',
      'k',
    ]);
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/--sign-key and --signer go together/);
  });
});

// Rules of spec section 7 the fixtures do not isolate. The fixtures (src/acceptance) carry the
// planted defects and the positive controls.

import { describe, expect, it } from 'vitest';
import { countedCheckRuns, overallVerdict, runChecks } from './index.js';
import type { Block, Evidence } from './types.js';

const REPO = 'example-org/example-repo';
const HEAD = 'a11ce5e0c0ffee00d00dfeed0000111122223333';

function evidence(extra: Partial<Evidence> = {}): Evidence {
  return {
    pullRequest: {
      status: 'ok',
      number: 1,
      state: 'closed',
      merged: true,
      mergedAt: '2026-10-01T14:05:09Z',
      headSha: HEAD,
      mergeSha: 'feedface00000000000000000000000000000001',
      changedFiles: 1,
    },
    files: { status: 'ok', complete: true, entries: [{ path: 'a.ts', status: 'modified' }] },
    sources: [],
    ...extra,
  };
}

const block = (extra: Partial<Block> = {}): Block => ({
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: ['a.ts'],
  ...extra,
});

const row = (claims: ReturnType<typeof runChecks>, id: string) => claims.find((c) => c.id === id);

describe('runChecks', () => {
  it('orders rows as spec section 7.1 fixes, whatever the block member order', () => {
    const b = block({
      deployedAt: { at: '2026-10-01T15:00:00Z', environment: 'prod' },
      mergedAt: '2026-10-01T14:05:09Z',
      checks: { allSucceeded: true, total: 0 },
      tests: [
        { command: 'a', count: 1, failures: 0, record: { kind: 'tap' } },
        { command: 'b', count: 2, record: { kind: 'tap' } },
      ],
      references: [{ issue: '#1', relation: 'cites' }],
    });
    expect(runChecks(b, evidence(), REPO).map((c) => c.id)).toEqual([
      'head:/headCommit',
      'scope:/filesChanged/0',
      'reference:/references/0',
      'count:/tests/0/count',
      'count:/tests/0/failures',
      'count:/tests/1/count',
      'count:/checks/total',
      'count:/checks/allSucceeded',
      'time:/mergedAt',
      'time:/deployedAt',
    ]);
  });

  it('fails closed on a section the evidence does not carry at all', () => {
    const claims = runChecks(
      block({
        checks: { total: 1 },
        references: [{ issue: '#1', relation: 'closes' }],
        deployedAt: { at: '2026-10-01T15:00:00Z', environment: 'prod' },
      }),
      evidence(),
      REPO,
    );
    expect(
      claims.filter((c) => c.verdict !== 'pass').map((c) => [c.id, c.verdict, c.reason]),
    ).toEqual([
      ['reference:/references/0', 'unverifiable', 'evidence_field_unpopulated:closingReferences'],
      ['count:/checks/total', 'unverifiable', 'evidence_field_unpopulated:checkRuns'],
      ['time:/deployedAt', 'unverifiable', 'evidence_field_unpopulated:deployments'],
    ]);
  });

  it('matches owner and repository case-insensitively, the issue number exactly', () => {
    const e = evidence({
      closingReferences: { status: 'ok', issues: ['Example-Org/Example-Repo#1'] },
      references: [{ kind: 'issue', ref: `${REPO}#10`, status: 'ok', exists: true }],
    });
    const claims = runChecks(
      block({
        references: [
          { issue: '#1', relation: 'closes' },
          { issue: '#10', relation: 'closes' },
        ],
      }),
      e,
      REPO,
    );
    expect(row(claims, 'reference:/references/0')?.verdict).toBe('pass');
    expect(row(claims, 'reference:/references/1')).toMatchObject({
      verdict: 'fail',
      reason: 'not_closing',
    });
  });

  it('never fails a closes missing from the closing references on the list alone', () => {
    // GitHub leaves out of the list any issue its reader cannot see (spec section 7.4).
    const closes = block({ references: [{ issue: 'other-org/oncall#5', relation: 'closes' }] });
    const verdictOf = (references?: Evidence['references']) =>
      row(
        runChecks(
          closes,
          evidence({
            closingReferences: { status: 'ok', issues: [] },
            ...(references === undefined ? {} : { references }),
          }),
          REPO,
        ),
        'reference:/references/0',
      );
    const ref = 'other-org/oncall#5';
    expect(verdictOf()).toMatchObject({
      verdict: 'unverifiable',
      reason: 'evidence_field_unpopulated:references',
    });
    expect(
      verdictOf([{ kind: 'issue', ref, status: 'unreadable', source: 'repository' }]),
    ).toMatchObject({ verdict: 'unverifiable', reason: 'source_unreadable:repository' });
    expect(
      verdictOf([{ kind: 'issue', ref, status: 'unreadable', source: 'issue' }]),
    ).toMatchObject({ verdict: 'unverifiable', reason: 'source_unreadable:issue' });
    expect(verdictOf([{ kind: 'issue', ref, status: 'ok', exists: false }])).toMatchObject({
      verdict: 'fail',
      reason: 'not_found',
      observed: { closing: [], exists: false },
    });
    expect(verdictOf([{ kind: 'issue', ref, status: 'ok', exists: true }])).toMatchObject({
      verdict: 'fail',
      reason: 'not_closing',
      observed: { closing: [] },
    });
  });

  it('never fails a closes missing from the closing references while the pull request is open', () => {
    // GitHub computes the closing references asynchronously after the pull request is opened or
    // its body edited (spec section 7.4); only a merged or closed pull request's list is settled.
    const closes = block({ references: [{ issue: '#15', relation: 'closes' }] });
    const verdictOf = (state: 'open' | 'closed', merged: boolean, issues: string[]) => {
      const e = evidence({
        closingReferences: { status: 'ok', issues },
        references: [{ kind: 'issue', ref: `${REPO}#15`, status: 'ok', exists: true }],
      });
      e.pullRequest = { ...e.pullRequest, state, merged };
      return row(runChecks(closes, e, REPO), 'reference:/references/0');
    };
    expect(verdictOf('open', false, [])).toMatchObject({
      verdict: 'unverifiable',
      reason: 'closing_link_unsettled',
      observed: null,
    });
    expect(verdictOf('closed', true, [])).toMatchObject({
      verdict: 'fail',
      reason: 'not_closing',
      observed: { closing: [] },
    });
    expect(verdictOf('closed', false, [])).toMatchObject({
      verdict: 'fail',
      reason: 'not_closing',
    });
    expect(verdictOf('open', false, [`${REPO}#15`])).toMatchObject({
      verdict: 'pass',
      observed: { closing: [`${REPO}#15`] },
    });
  });

  it('compares times to the second', () => {
    const e = evidence();
    e.pullRequest.mergedAt = '2026-10-01T14:05:09.900Z';
    expect(
      row(runChecks(block({ mergedAt: '2026-10-01T14:05:09Z' }), e, REPO), 'time:/mergedAt')
        ?.verdict,
    ).toBe('pass');
    expect(
      row(runChecks(block({ mergedAt: '2026-10-01T14:05:08.999Z' }), e, REPO), 'time:/mergedAt')
        ?.reason,
    ).toBe('premature');
  });

  it('counts only a head deployment for a pull request that is not merged', () => {
    const e = evidence({
      deployments: [
        {
          environment: 'prod',
          status: 'ok',
          deployments: [
            {
              id: 1,
              sha: 'feedface00000000000000000000000000000001',
              relation: 'merge',
              successAt: '2026-10-01T14:10:00Z',
            },
          ],
        },
      ],
    });
    e.pullRequest.merged = false;
    const claims = runChecks(
      block({ deployedAt: { at: '2026-10-01T15:00:00Z', environment: 'prod' } }),
      e,
      REPO,
    );
    expect(row(claims, 'time:/deployedAt')).toMatchObject({
      verdict: 'fail',
      reason: 'no_deployment',
    });
  });

  it('declared_not_changed observes null; a rename observes its new path', () => {
    const e = evidence({
      files: {
        status: 'ok',
        complete: true,
        entries: [{ path: 'new.ts', status: 'renamed', previousPath: 'old.ts' }],
      },
    });
    const claims = runChecks(block({ filesChanged: ['old.ts', 'gone.ts'] }), e, REPO);
    expect(row(claims, 'scope:/filesChanged/0')).toMatchObject({
      verdict: 'pass',
      observed: 'new.ts',
    });
    expect(row(claims, 'scope:/filesChanged/1')).toMatchObject({
      verdict: 'fail',
      observed: null,
      reason: 'declared_not_changed',
    });
  });
});

describe('countedCheckRuns', () => {
  it('keeps the latest run per name, then drops the excluded ids', () => {
    const runs = [
      { id: 1, name: 'test', status: 'completed', conclusion: 'failure' },
      { id: 5, name: 'test', status: 'completed', conclusion: 'success' },
      { id: 2, name: 'lint', status: 'completed', conclusion: 'success' },
      { id: 9, name: 'dunstan', status: 'in_progress', conclusion: null },
    ];
    expect(countedCheckRuns(runs, [9]).map((r) => r.id)).toEqual([2, 5]);
  });
});

describe('overallVerdict', () => {
  it('a fail decides; no rows, or a block that is not found, never passes', () => {
    expect(overallVerdict('found', [{ verdict: 'unverifiable' }, { verdict: 'fail' }])).toBe(
      'fail',
    );
    expect(overallVerdict('found', [])).toBe('unverifiable');
    expect(overallVerdict('missing', [])).toBe('unverifiable');
    expect(overallVerdict('found', [{ verdict: 'pass' }])).toBe('pass');
  });
});

// Rules of spec section 7 the fixtures do not isolate. The fixtures (src/acceptance) carry the
// planted defects and the positive controls.

import { describe, expect, it } from 'vitest';
import { countedCheckRuns, overallVerdict, runChecks } from './index.js';
import type {
  Block,
  CheckRun,
  CloseBaseEvidence,
  CloseEvent,
  CloseEventsEvidence,
  CloseTargetEvidence,
  Evidence,
} from './types.js';

const REPO = 'example-org/example-repo';
const HEAD = 'a11ce5e0c0ffee00d00dfeed0000111122223333';
const MERGE_SHA = 'feedface00000000000000000000000000000001';

// Spec 0.1.4: the close events of `closes` targets missing from the closing references. By default
// each target is an open issue with no ClosedEvent, and the pull request's base is the default
// branch.
const ON_DEFAULT: CloseBaseEvidence = {
  status: 'ok',
  baseRef: 'main',
  defaultBranch: 'main',
  commits: [HEAD],
};
const openIssue = (ref: string): CloseTargetEvidence => ({
  ref,
  status: 'ok',
  type: 'issue',
  state: 'open',
  events: [],
});
function closeEvents(
  targets: (string | CloseTargetEvidence)[],
  pullRequest: CloseBaseEvidence = ON_DEFAULT,
): CloseEventsEvidence {
  return {
    pullRequest,
    targets: targets.map((t) => (typeof t === 'string' ? openIssue(t) : t)),
  };
}

function evidence(extra: Partial<Evidence> = {}): Evidence {
  return {
    pullRequest: {
      status: 'ok',
      number: 1,
      state: 'closed',
      merged: true,
      mergedAt: '2026-10-01T14:05:09Z',
      headSha: HEAD,
      mergeSha: MERGE_SHA,
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

  // Spec section 6, "An absent section": each claim kind names the section it reads, or the entry
  // in it, that the evidence lacks. Absence is no evidence, so it is never a fail.
  it('gives evidence_field_unpopulated:<section> for an absent section or entry, per claim kind', () => {
    const junit = {
      kind: 'junit',
      workflow: '.github/workflows/ci.yml',
      job: 'test',
      artifact: 'junit-report',
      path: 'junit.xml',
    } as const;
    const b = block({
      tests: [{ command: 'pnpm test', count: 1, record: junit }],
      checks: { total: 1, allSucceeded: true, noneFailed: true },
      references: [
        { issue: '#1', relation: 'closes' },
        { issue: '#2', relation: 'cites' },
        { commit: MERGE_SHA, relation: 'cites' },
      ],
      mergedAt: '2026-10-01T14:05:09Z',
      deployedAt: { at: '2026-10-01T15:00:00Z', environment: 'prod' },
    });
    const notPassing = (e: Evidence) =>
      runChecks(b, e, REPO)
        .filter((c) => c.verdict !== 'pass')
        .map((c) => [c.id, c.verdict, c.reason]);
    const unpopulated = (id: string, section: string) => [
      id,
      'unverifiable',
      `evidence_field_unpopulated:${section}`,
    ];

    // Only the pull request, which is never absent: head and mergedAt read it and pass.
    const bare = evidence();
    delete bare.files;
    expect(notPassing(bare)).toEqual([
      unpopulated('scope:/filesChanged/0', 'files'),
      unpopulated('scope:undeclared', 'files'),
      unpopulated('reference:/references/0', 'closingReferences'),
      unpopulated('reference:/references/1', 'references'),
      unpopulated('reference:/references/2', 'references'),
      unpopulated('count:/tests/0/count', 'testRecords'),
      unpopulated('count:/checks/total', 'checkRuns'),
      unpopulated('count:/checks/allSucceeded', 'checkRuns'),
      unpopulated('count:/checks/noneFailed', 'checkRuns'),
      unpopulated('time:/deployedAt', 'deployments'),
    ]);

    // Each section there, without the entry the claim reads.
    const entriesAbsent = evidence({
      closingReferences: { status: 'ok', issues: [] },
      references: [{ kind: 'issue', ref: `${REPO}#1`, status: 'ok', exists: true }],
      closeEvents: closeEvents([]),
      testRecords: [],
      deployments: [],
    });
    expect(notPassing(entriesAbsent)).toEqual([
      unpopulated('reference:/references/0', 'closeEvents'),
      unpopulated('reference:/references/1', 'references'),
      unpopulated('reference:/references/2', 'references'),
      unpopulated('count:/tests/0/count', 'testRecords'),
      unpopulated('count:/checks/total', 'checkRuns'),
      unpopulated('count:/checks/allSucceeded', 'checkRuns'),
      unpopulated('count:/checks/noneFailed', 'checkRuns'),
      unpopulated('time:/deployedAt', 'deployments'),
    ]);
  });

  // Spec section 2: a verdict is a function of the block, the evidence and the subject repository
  // the evidence was read for, which the record holds as subject.repository. `#N` names issue N of
  // that repository.
  it('reads the subject repository: the same block and evidence give another row under another', () => {
    const b = block({ references: [{ issue: '#1', relation: 'closes' }] });
    const e = evidence({ closingReferences: { status: 'ok', issues: [`${REPO}#1`] } });
    expect(row(runChecks(b, e, REPO), 'reference:/references/0')?.verdict).toBe('pass');
    expect(row(runChecks(b, e, 'example-org/other-repo'), 'reference:/references/0')).toMatchObject(
      { verdict: 'unverifiable', reason: 'evidence_field_unpopulated:references' },
    );
  });

  it('matches owner and repository case-insensitively, the issue number exactly', () => {
    const e = evidence({
      closingReferences: { status: 'ok', issues: ['Example-Org/Example-Repo#1'] },
      references: [{ kind: 'issue', ref: `${REPO}#10`, status: 'ok', exists: true }],
      closeEvents: closeEvents([`${REPO}#10`]),
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
    // A cites finds its entry by the same comparison (spec section 7.4).
    const cites = runChecks(
      block({
        references: [
          { issue: 'Example-Org/Example-Repo#2', relation: 'cites' },
          { issue: '#20', relation: 'cites' },
        ],
      }),
      evidence({ references: [{ kind: 'issue', ref: `${REPO}#2`, status: 'ok', exists: true }] }),
      REPO,
    );
    expect(row(cites, 'reference:/references/0')?.verdict).toBe('pass');
    expect(row(cites, 'reference:/references/1')).toMatchObject({
      verdict: 'unverifiable',
      reason: 'evidence_field_unpopulated:references',
    });
  });

  it('never fails a closes missing from the closing references on the list alone', () => {
    // GitHub leaves out of the list any issue its reader cannot see (spec section 7.4).
    const closes = block({ references: [{ issue: 'other-org/oncall#5', relation: 'closes' }] });
    const ref = 'other-org/oncall#5';
    const verdictOf = (
      references?: Evidence['references'],
      // null: the evidence carries no closeEvents section.
      events: CloseEventsEvidence | null = closeEvents([ref]),
    ) =>
      row(
        runChecks(
          closes,
          evidence({
            closingReferences: { status: 'ok', issues: [] },
            ...(references === undefined ? {} : { references }),
            ...(events === null ? {} : { closeEvents: events }),
          }),
          REPO,
        ),
        'reference:/references/0',
      );
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
      observed: { closing: [], state: 'open', events: [] },
    });
    // Spec 0.1.4: nor on the list and the issue's existence alone. Without its close events, the
    // record cannot say the pull request did not close it.
    expect(verdictOf([{ kind: 'issue', ref, status: 'ok', exists: true }], null)).toMatchObject({
      verdict: 'unverifiable',
      reason: 'evidence_field_unpopulated:closeEvents',
      observed: null,
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
        closeEvents: closeEvents([`${REPO}#15`]),
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
      observed: { closing: [], state: 'open', events: [] },
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

  // Spec 0.1.3: an issue transferred to another repository is listed among the closing references
  // under its new identity, and GitHub answers its old name with that identity, which the reader
  // records as `resolvedAs`.
  describe('a closes on a transferred issue is compared under the identity GitHub resolves', () => {
    const MOVED = 'example-org/example-tracker#4';
    const closes = block({ references: [{ issue: '#15', relation: 'closes' }] });
    const verdictOf = (
      issues: string[],
      entry: NonNullable<Evidence['references']>[number],
      state: 'open' | 'closed' = 'closed',
      merged = state === 'closed',
    ) => {
      // Spec 0.1.4: the close events are read under the identity GitHub resolves the issue to.
      const read = entry.status === 'ok' && entry.kind === 'issue' ? entry.resolvedAs : undefined;
      const e = evidence({
        closingReferences: { status: 'ok', issues },
        references: [entry],
        closeEvents: closeEvents([read ?? entry.ref]),
      });
      e.pullRequest = { ...e.pullRequest, state, merged };
      return row(runChecks(closes, e, REPO), 'reference:/references/0');
    };
    const transferred = {
      kind: 'issue',
      ref: `${REPO}#15`,
      status: 'ok',
      exists: true,
      resolvedAs: MOVED,
    } as const;

    it('passes when the closing references list the resolved identity, and shows both', () => {
      for (const state of ['closed', 'open'] as const) {
        expect(verdictOf([MOVED], transferred, state)).toEqual({
          id: 'reference:/references/0',
          check: 'reference',
          field: '/references/0',
          declared: { issue: '#15', relation: 'closes' },
          observed: { closing: [MOVED], ref: `${REPO}#15`, resolvedAs: MOVED },
          verdict: 'pass',
        });
      }
      // Owner and repository compare case-insensitively under the resolved identity too.
      expect(verdictOf(['Example-Org/Example-Tracker#4'], transferred)?.verdict).toBe('pass');
    });

    it('is not_closing (merged) or closing_link_unsettled (open) when the list lacks it, as before', () => {
      for (const issues of [[], ['example-org/example-tracker#5'], [`${REPO}#4`]]) {
        expect(verdictOf(issues, transferred)).toMatchObject({
          verdict: 'fail',
          reason: 'not_closing',
          observed: { closing: issues },
        });
        expect(verdictOf(issues, transferred, 'open')).toMatchObject({
          verdict: 'unverifiable',
          reason: 'closing_link_unsettled',
          observed: null,
        });
      }
    });

    it('is unverifiable when the redirect could not be read, never pass', () => {
      expect(
        verdictOf([MOVED], {
          kind: 'issue',
          ref: `${REPO}#15`,
          status: 'unreadable',
          source: 'issue',
        }),
      ).toMatchObject({ verdict: 'unverifiable', reason: 'source_unreadable:issue' });
      expect(
        verdictOf([MOVED], {
          kind: 'issue',
          ref: `${REPO}#15`,
          status: 'unreadable',
          source: 'repository',
        }),
      ).toMatchObject({ verdict: 'unverifiable', reason: 'source_unreadable:repository' });
    });

    it('never passes on the resolved identity without a recorded resolvedAs', () => {
      const { resolvedAs: _, ...unresolved } = transferred;
      expect(verdictOf([MOVED], unresolved)).toMatchObject({
        verdict: 'fail',
        reason: 'not_closing',
      });
    });

    it('changes nothing for a cites issue', () => {
      const cites = block({ references: [{ issue: '#15', relation: 'cites' }] });
      const e = evidence({ references: [transferred] });
      expect(row(runChecks(cites, e, REPO), 'reference:/references/0')).toMatchObject({
        verdict: 'pass',
        observed: { exists: true },
      });
    });
  });

  // Spec 0.1.4: a closes is settled by who closed the target, not only by the closing references.
  // GitHub records each close as a ClosedEvent whose closer is the pull request or the commit that
  // closed it. The closing references list issues only, leave out a close by a commit message, and
  // are not populated for a pull request into a branch other than the default.
  describe('a closes missing from the closing references is settled by who closed the target', () => {
    const SELF = `${REPO}#1`;
    const OTHER_PR = `${REPO}#2`;
    const COMMIT = 'c0de000000000000000000000000000000000001';
    const STRANGER = '5a1e000000000000000000000000000000000001';
    const AT = '2026-10-01T14:05:11Z';
    const byPullRequest = (ref: string, at = AT): CloseEvent => ({
      at,
      closer: { kind: 'pull_request', ref },
    });
    const byCommit = (oid: string, at = AT): CloseEvent => ({
      at,
      closer: { kind: 'commit', oid },
    });
    const byNoOne: CloseEvent = { at: AT, closer: null };
    const target = (
      events: CloseEvent[],
      state: 'open' | 'closed' | 'merged' = events.length > 0 ? 'closed' : 'open',
      type: 'issue' | 'pull_request' = 'issue',
      ref = `${REPO}#15`,
    ): CloseTargetEvidence => ({ ref, status: 'ok', type, state, events });

    interface Case {
      targets?: CloseTargetEvidence[];
      side?: CloseBaseEvidence;
      pr?: Partial<Evidence['pullRequest']>;
      section?: 'absent';
    }
    const verdictOf = ({ targets = [target([])], side = ON_DEFAULT, pr = {}, section }: Case) => {
      const closes = block({ references: [{ issue: '#15', relation: 'closes' }] });
      const e = evidence({
        closingReferences: { status: 'ok', issues: [] },
        references: [{ kind: 'issue', ref: `${REPO}#15`, status: 'ok', exists: true }],
        ...(section === 'absent' ? {} : { closeEvents: { pullRequest: side, targets } }),
      });
      e.pullRequest = { ...e.pullRequest, ...pr };
      return row(runChecks(closes, e, REPO), 'reference:/references/0');
    };
    const OPEN = { state: 'open', merged: false, mergedAt: null, mergeSha: null } as const;
    const CLOSED_UNMERGED = {
      state: 'closed',
      merged: false,
      mergedAt: null,
      mergeSha: null,
    } as const;

    it('row 2: passes when a ClosedEvent of the target names this pull request as its closer', () => {
      const event = byPullRequest(SELF);
      expect(verdictOf({ targets: [target([event])] })).toEqual({
        id: 'reference:/references/0',
        check: 'reference',
        field: '/references/0',
        declared: { issue: '#15', relation: 'closes' },
        observed: { closing: [], closedBy: event },
        verdict: 'pass',
      });
      // Owner and repository compare case-insensitively, the number exactly.
      expect(
        verdictOf({ targets: [target([byPullRequest('Example-Org/Example-Repo#1')])] })?.verdict,
      ).toBe('pass');
      expect(verdictOf({ targets: [target([byPullRequest(`${REPO}#11`)])] })?.verdict).toBe('fail');
    });

    it('row 2: passes for a pull request target this pull request closed, e.g. one it supersedes', () => {
      for (const state of ['closed', 'merged'] as const) {
        const t = target([byPullRequest(SELF)], state, 'pull_request');
        expect(verdictOf({ targets: [t] })).toMatchObject({
          verdict: 'pass',
          observed: { closing: [], closedBy: byPullRequest(SELF) },
        });
      }
    });

    it('rows 2 and 3: read every ClosedEvent, not only the latest (closed by this pull request, then reopened)', () => {
      const reopened = target([byPullRequest(SELF), byNoOne], 'open');
      expect(verdictOf({ targets: [reopened] })).toMatchObject({
        verdict: 'pass',
        observed: { closedBy: byPullRequest(SELF) },
      });
      const reclosed = target([byPullRequest(OTHER_PR), byCommit(COMMIT, '2026-10-02T09:00:00Z')]);
      expect(
        verdictOf({ targets: [reclosed], side: { ...ON_DEFAULT, commits: [COMMIT, HEAD] } }),
      ).toMatchObject({ verdict: 'pass', observed: { closedBy: { closer: { oid: COMMIT } } } });
    });

    it('row 2 before row 3, and before rows 4 to 8: an open pull request it closed passes', () => {
      const both = target([byCommit(MERGE_SHA), byPullRequest(SELF, '2026-10-02T00:00:00Z')]);
      expect(verdictOf({ targets: [both] })).toMatchObject({
        verdict: 'pass',
        observed: { closedBy: byPullRequest(SELF, '2026-10-02T00:00:00Z') },
      });
      expect(verdictOf({ targets: [target([byPullRequest(SELF)])], pr: OPEN })?.verdict).toBe(
        'pass',
      );
    });

    it('row 3: passes when a commit of this pull request closed the target, and carries its oid', () => {
      const event = byCommit(COMMIT);
      expect(
        verdictOf({ targets: [target([event])], side: { ...ON_DEFAULT, commits: [COMMIT, HEAD] } }),
      ).toEqual({
        id: 'reference:/references/0',
        check: 'reference',
        field: '/references/0',
        declared: { issue: '#15', relation: 'closes' },
        observed: { closing: [], closedBy: event },
        verdict: 'pass',
      });
    });

    it("row 3: passes when this pull request's merge commit closed the target (a squash merge)", () => {
      const event = byCommit(MERGE_SHA);
      expect(verdictOf({ targets: [target([event])] })).toMatchObject({
        verdict: 'pass',
        observed: { closedBy: event },
      });
      // The merge commit is the pull request's own record, so its commits are not needed for it.
      expect(
        verdictOf({
          targets: [target([event])],
          side: { status: 'unreadable', source: 'pull_request_commits' },
        })?.verdict,
      ).toBe('pass');
    });

    it('row 4: an open, unmerged pull request it did not close is closing_link_unsettled', () => {
      for (const targets of [
        [target([])],
        [target([byPullRequest(OTHER_PR)])],
        [target([byCommit(STRANGER)])],
        [{ ref: `${REPO}#15`, status: 'unreadable', source: 'issue' } as const],
      ]) {
        expect(verdictOf({ targets, pr: OPEN })).toMatchObject({
          verdict: 'unverifiable',
          reason: 'closing_link_unsettled',
          observed: null,
        });
      }
      expect(verdictOf({ section: 'absent', pr: OPEN })).toMatchObject({
        verdict: 'unverifiable',
        reason: 'closing_link_unsettled',
      });
    });

    it('row 5: merged into a branch other than the default, with the target open, is closing_base_not_default', () => {
      for (const defaultBranch of ['main', null]) {
        expect(
          verdictOf({ side: { ...ON_DEFAULT, baseRef: 'release-2.0', defaultBranch } }),
        ).toMatchObject({
          verdict: 'unverifiable',
          reason: 'closing_base_not_default',
          observed: null,
        });
      }
      // A target closed by someone else is not open: row 5 does not apply, and it fails (row 8).
      expect(
        verdictOf({
          targets: [target([byPullRequest(OTHER_PR)])],
          side: { ...ON_DEFAULT, baseRef: 'release-2.0' },
        }),
      ).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
      // A pull request closed without merging merged into nothing.
      expect(
        verdictOf({ side: { ...ON_DEFAULT, baseRef: 'release-2.0' }, pr: CLOSED_UNMERGED }),
      ).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
    });

    it('row 6: a close-event read that is incomplete or unread is unverifiable, never fail', () => {
      expect(
        verdictOf({ targets: [{ ref: `${REPO}#15`, status: 'unreadable', source: 'issue' }] }),
      ).toMatchObject({ verdict: 'unverifiable', reason: 'source_unreadable:issue' });
      expect(
        verdictOf({
          targets: [{ ref: `${REPO}#15`, status: 'unpopulated', field: 'issueOrPullRequest' }],
        }),
      ).toMatchObject({
        verdict: 'unverifiable',
        reason: 'evidence_field_unpopulated:issueOrPullRequest',
      });
      expect(verdictOf({ section: 'absent' })).toMatchObject({
        verdict: 'unverifiable',
        reason: 'evidence_field_unpopulated:closeEvents',
      });
      // A section that holds no entry for the target is no evidence about it.
      expect(verdictOf({ targets: [target([], 'open', 'issue', `${REPO}#16`)] })).toMatchObject({
        verdict: 'unverifiable',
        reason: 'evidence_field_unpopulated:closeEvents',
      });
      // A commit closer the unread commits might hold, or an open target on a base the unread side
      // would name: undecided.
      const unread: CloseBaseEvidence = { status: 'unreadable', source: 'pull_request_commits' };
      expect(verdictOf({ targets: [target([byCommit(STRANGER)])], side: unread })).toMatchObject({
        verdict: 'unverifiable',
        reason: 'source_unreadable:pull_request_commits',
      });
      expect(verdictOf({ side: unread })).toMatchObject({
        verdict: 'unverifiable',
        reason: 'source_unreadable:pull_request_commits',
      });
      // With nothing the unread side could change, the fail stands (row 8).
      expect(
        verdictOf({ targets: [target([byPullRequest(OTHER_PR)])], side: unread }),
      ).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
    });

    it('row 7: a closed target whose read holds no ClosedEvent yet is closing_event_unsettled, never fail', () => {
      // GitHub sets the state before the timeline shows the event (probe cases i and ii).
      for (const pr of [{}, CLOSED_UNMERGED]) {
        expect(verdictOf({ targets: [target([], 'closed')], pr })).toEqual({
          id: 'reference:/references/0',
          check: 'reference',
          field: '/references/0',
          declared: { issue: '#15', relation: 'closes' },
          observed: null,
          verdict: 'unverifiable',
          reason: 'closing_event_unsettled',
        });
      }
      expect(verdictOf({ targets: [target([], 'closed', 'pull_request')] })).toMatchObject({
        verdict: 'unverifiable',
        reason: 'closing_event_unsettled',
      });
      // The commits are not needed: no event names any commit.
      expect(
        verdictOf({
          targets: [target([], 'closed')],
          side: { status: 'unreadable', source: 'pull_request_commits' },
        }),
      ).toMatchObject({ verdict: 'unverifiable', reason: 'closing_event_unsettled' });
      // Rows 4 and 6 come first.
      expect(verdictOf({ targets: [target([], 'closed')], pr: OPEN })).toMatchObject({
        reason: 'closing_link_unsettled',
      });
      // A ClosedEvent with no recorded closer is visible: it is not this pull request's close (row 8).
      expect(verdictOf({ targets: [target([byNoOne], 'closed')] })).toMatchObject({
        verdict: 'fail',
        reason: 'not_closing',
      });
    });

    it('row 8: closed by another pull request, another commit or no recorded closer is not_closing', () => {
      for (const events of [[byPullRequest(OTHER_PR)], [byCommit(STRANGER)], [byNoOne]]) {
        expect(verdictOf({ targets: [target(events)] })).toEqual({
          id: 'reference:/references/0',
          check: 'reference',
          field: '/references/0',
          declared: { issue: '#15', relation: 'closes' },
          observed: { closing: [], state: 'closed', events },
          verdict: 'fail',
          reason: 'not_closing',
        });
      }
      expect(
        verdictOf({ targets: [target([{ at: AT, closer: { kind: 'other' } }])] }),
      ).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
    });

    it('row 8: open after a merge into the default branch, or a pull request closed unmerged, is not_closing', () => {
      expect(verdictOf({})).toMatchObject({
        verdict: 'fail',
        reason: 'not_closing',
        observed: { closing: [], state: 'open', events: [] },
      });
      expect(verdictOf({ pr: CLOSED_UNMERGED })).toMatchObject({
        verdict: 'fail',
        reason: 'not_closing',
      });
      expect(
        verdictOf({ targets: [target([byPullRequest(OTHER_PR)], 'merged', 'pull_request')] }),
      ).toMatchObject({ verdict: 'fail', reason: 'not_closing' });
    });

    it('reads a transferred issue under its resolved identity, and shows both', () => {
      const MOVED = 'example-org/example-tracker#4';
      const closes = block({ references: [{ issue: '#15', relation: 'closes' }] });
      const event = byPullRequest(SELF);
      const e = evidence({
        closingReferences: { status: 'ok', issues: [] },
        references: [
          { kind: 'issue', ref: `${REPO}#15`, status: 'ok', exists: true, resolvedAs: MOVED },
        ],
        closeEvents: closeEvents([target([event], 'closed', 'issue', MOVED)]),
      });
      expect(row(runChecks(closes, e, REPO), 'reference:/references/0')).toMatchObject({
        verdict: 'pass',
        observed: { closing: [], ref: `${REPO}#15`, resolvedAs: MOVED, closedBy: event },
      });
    });

    it('never reads close events for a closes the closing references list, or for a cites', () => {
      const e = evidence({
        closingReferences: { status: 'ok', issues: [`${REPO}#15`] },
        references: [{ kind: 'issue', ref: `${REPO}#15`, status: 'ok', exists: true }],
        closeEvents: closeEvents([target([byPullRequest(OTHER_PR)])]),
      });
      expect(
        row(
          runChecks(block({ references: [{ issue: '#15', relation: 'closes' }] }), e, REPO),
          'reference:/references/0',
        ),
      ).toMatchObject({ verdict: 'pass', observed: { closing: [`${REPO}#15`] } });
      expect(
        row(
          runChecks(block({ references: [{ issue: '#15', relation: 'cites' }] }), e, REPO),
          'reference:/references/0',
        ),
      ).toMatchObject({ verdict: 'pass', observed: { exists: true } });
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

  // Spec section 4, "Large pull requests": a block names every changed file. A complete block for
  // this pull request is longer than GitHub's 65,536-character body, so a block in the body names
  // only some files, and each file it leaves out is its own undeclared_file row: nothing is hidden.
  it('fails a block naming a subset of the changed files undeclared_file, one row per file left out', () => {
    const paths = Array.from(
      { length: 1200 },
      (_, i) =>
        `packages/service-${String(i).padStart(4, '0')}/src/handlers/request-handler.test.ts`,
    );
    expect(JSON.stringify(block({ filesChanged: paths })).length).toBeGreaterThan(65536);
    const subset = block({ filesChanged: paths.slice(0, 1000) });
    expect(JSON.stringify(subset).length).toBeLessThan(65536);
    const e = evidence({
      files: {
        status: 'ok',
        complete: true,
        entries: paths.map((path) => ({ path, status: 'modified' as const })),
      },
    });
    e.pullRequest.changedFiles = paths.length;
    const claims = runChecks(subset, e, REPO);
    const omitted = claims.filter((c) => c.verdict !== 'pass');
    expect(omitted.map((c) => c.observed)).toEqual(paths.slice(1000));
    for (const c of omitted) {
      expect(c).toMatchObject({
        id: `scope:undeclared:${c.observed}`,
        verdict: 'fail',
        reason: 'undeclared_file',
      });
    }
    expect(overallVerdict('found', claims)).toBe('fail');
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

  it('keeps the latest run per check suite and name: a re-run supersedes its own suite only', () => {
    const runs = [
      { id: 1, name: 'test', status: 'completed', conclusion: 'failure', checkSuiteId: 70 },
      { id: 4, name: 'test', status: 'completed', conclusion: 'success', checkSuiteId: 70 },
      { id: 5, name: 'test', status: 'completed', conclusion: 'success', checkSuiteId: 80 },
      { id: 6, name: 'lint', status: 'completed', conclusion: 'success', checkSuiteId: 80 },
    ];
    expect(countedCheckRuns(runs, []).map((r) => r.id)).toEqual([4, 5, 6]);
  });

  // Spec 0.1.7: runs of no workflow path are the same check only when both name the same app, and
  // that app is not `github-actions`, which every workflow in the repository creates runs as.
  it("an excluded run supersedes its name's earlier runs of its app in every suite, and no later run", () => {
    const runsOf = (appSlug: string) => {
      const at = (checkSuiteId: number) => ({ checkSuiteId, appSlug });
      return [
        { id: 1, name: 'handback', status: 'completed', conclusion: 'failure', ...at(70) },
        { id: 2, name: 'dunstan', status: 'completed', conclusion: 'failure', ...at(71) },
        { id: 3, name: 'test', status: 'completed', conclusion: 'success', ...at(72) },
        { id: 7, name: 'handback', status: 'in_progress', conclusion: null, ...at(80) },
        { id: 8, name: 'dunstan', status: 'in_progress', conclusion: null, ...at(71) },
        { id: 9, name: 'handback', status: 'completed', conclusion: 'success', ...at(90) },
      ];
    };
    expect(countedCheckRuns(runsOf('example-checker'), [7, 8]).map((r) => r.id)).toEqual([3, 9]);
    // 10AF2: by `github-actions`, run 1 has no identity and is counted; run 2 shares run 8's suite
    // and name, so it is the same check and is superseded as before.
    expect(countedCheckRuns(runsOf('github-actions'), [7, 8]).map((r) => r.id)).toEqual([1, 3, 9]);
  });

  it('an excluded run in another suite supersedes no run whose app the record does not hold', () => {
    const runs = [
      { id: 1, name: 'handback', status: 'completed', conclusion: 'failure', checkSuiteId: 70 },
      { id: 2, name: 'dunstan', status: 'completed', conclusion: 'failure', checkSuiteId: 71 },
      { id: 3, name: 'test', status: 'completed', conclusion: 'success', checkSuiteId: 72 },
      { id: 7, name: 'handback', status: 'in_progress', conclusion: null, checkSuiteId: 80 },
      { id: 8, name: 'dunstan', status: 'in_progress', conclusion: null, checkSuiteId: 71 },
      { id: 9, name: 'handback', status: 'completed', conclusion: 'success', checkSuiteId: 90 },
    ];
    // Run 2 shares run 8's suite and name, so it is the same check and is superseded as before;
    // run 1 is in another suite and names no app, so nothing says it is the checker's.
    expect(countedCheckRuns(runs, [7, 8]).map((r) => r.id)).toEqual([1, 3, 9]);
  });
});

// Spec 0.1.4, amended 2026-10-12 (10T3): GitHub names an Actions check run after its job, so two
// workflows that each have a job `test` give two runs named `test`, one per check suite.
describe('checks over check suites', () => {
  const run = (id: number, conclusion: string, checkSuiteId?: number) => ({
    id,
    name: 'test',
    status: 'completed',
    conclusion,
    ...(checkSuiteId === undefined ? {} : { checkSuiteId, appSlug: 'github-actions' }),
  });
  const checksOf = (runs: ReturnType<typeof run>[]) =>
    runChecks(
      block({ checks: { total: 1, allSucceeded: true } }),
      evidence({ checkRuns: { status: 'ok', commit: HEAD, excludedIds: [], runs } }),
      REPO,
    );

  it('a failed run in one workflow is not hidden by a later run of the same name in another', () => {
    const claims = checksOf([run(1, 'failure', 70), run(2, 'success', 80)]);
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
    expect(row(claims, 'count:/checks/total')).toMatchObject({
      verdict: 'fail',
      observed: 2,
      reason: 'count_mismatch',
    });
  });

  it('a re-run in the same check suite supersedes its earlier attempt, as before', () => {
    const claims = checksOf([run(1, 'failure', 70), run(2, 'success', 70)]);
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: true,
    });
    expect(row(claims, 'count:/checks/total')).toMatchObject({ verdict: 'pass', observed: 1 });
  });

  it("the checker's own earlier run in another suite, with no workflow path, is counted: a false fail, never a pass", () => {
    // Run 1 of the checker's workflow (suite 70) failed on a bad block; the body was edited and run 2
    // (suite 80) is the checker now, which excludes its job's run and its `dunstan` run. The record
    // holds no workflow paths and the runs are by `github-actions`, which identifies no checker
    // (10AF2), so run 2's earlier `handback` is counted. Run 3 shares run 5's suite and name: one
    // check, whose latest run is excluded. With workflow paths, the earlier run is superseded (the
    // 10AF block below).
    const runs = [
      { ...run(1, 'success', 60), name: 'lint' },
      { ...run(2, 'failure', 70), name: 'handback' },
      { ...run(3, 'failure', 71), name: 'dunstan' },
      { ...run(4, 'success', 80), name: 'handback', status: 'in_progress', conclusion: null },
      { ...run(5, 'success', 71), name: 'dunstan', status: 'in_progress', conclusion: null },
    ];
    const claims = runChecks(
      block({ checks: { total: 1, allSucceeded: true } }),
      evidence({ checkRuns: { status: 'ok', commit: HEAD, excludedIds: [4, 5], runs } }),
      REPO,
    );
    expect(countedCheckRuns(runs, [4, 5]).map((r) => r.id)).toEqual([1, 2]);
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
    expect(row(claims, 'count:/checks/total')).toMatchObject({
      verdict: 'fail',
      observed: 2,
      reason: 'count_mismatch',
    });
  });

  it('a record with check suites and no workflow paths is counted per suite and name', () => {
    // Written by the 2026-10-12 amendment's reader, which recorded no workflow: no path is invented.
    const claims = checksOf([run(1, 'success', 70), run(2, 'success', 80)]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({
      verdict: 'fail',
      observed: 2,
      reason: 'count_mismatch',
    });
  });

  it('a record without check suites is counted by name alone, as before', () => {
    const claims = checksOf([run(1, 'failure'), run(2, 'success')]);
    expect(claims.filter((c) => c.check === 'count')).toEqual([
      {
        id: 'count:/checks/total',
        check: 'count',
        field: '/checks/total',
        declared: 1,
        observed: 1,
        verdict: 'pass',
      },
      {
        id: 'count:/checks/allSucceeded',
        check: 'count',
        field: '/checks/allSucceeded',
        declared: true,
        observed: true,
        verdict: 'pass',
      },
    ]);
  });
});

// Spec 0.1.4, amended 2026-10-13 (10T4): each run of a workflow is a check suite of its own, so a
// workflow run more than once on one head (on push and pull_request, or again after a reopen) is
// one workflow, counted once per job: the latest workflow run wins.
describe('checks per workflow path', () => {
  const CI = '.github/workflows/ci.yml';
  const run = (
    id: number,
    name: string,
    conclusion: string,
    at: { suite: number; path: string; runId: number; attempt?: number },
  ): CheckRun => ({
    id,
    name,
    status: 'completed',
    conclusion,
    checkSuiteId: at.suite,
    appSlug: 'github-actions',
    workflowPath: at.path,
    workflowRunId: at.runId,
    runAttempt: at.attempt ?? 1,
  });
  const checksOf = (
    checks: { total?: number; allSucceeded?: boolean },
    runs: CheckRun[],
    excludedIds: number[] = [],
  ) =>
    runChecks(
      block({ checks }),
      evidence({ checkRuns: { status: 'ok', commit: HEAD, excludedIds, runs } }),
      REPO,
    );

  it('a workflow on push and pull_request counts each job once', () => {
    const push = { suite: 70, path: CI, runId: 100 };
    const pr = { suite: 80, path: CI, runId: 101 };
    const claims = checksOf({ total: 2, allSucceeded: true }, [
      run(1, 'test', 'success', push),
      run(2, 'lint', 'success', push),
      run(3, 'test', 'success', pr),
      run(4, 'lint', 'success', pr),
    ]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({ verdict: 'pass', observed: 2 });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: true,
    });
  });

  it("a reopened pull request's later run of the workflow supersedes its earlier failed run", () => {
    const claims = checksOf({ total: 1, allSucceeded: true }, [
      run(1, 'test', 'failure', { suite: 70, path: CI, runId: 100 }),
      run(2, 'test', 'success', { suite: 80, path: CI, runId: 200 }),
    ]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({ verdict: 'pass', observed: 1 });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: true,
    });
  });

  it("two workflows' `test` jobs stay apart, and the failed one is read", () => {
    const claims = checksOf({ total: 1, allSucceeded: true }, [
      run(1, 'test', 'failure', { suite: 70, path: CI, runId: 100 }),
      run(2, 'test', 'success', { suite: 80, path: '.github/workflows/e2e.yml', runId: 101 }),
    ]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({
      verdict: 'fail',
      observed: 2,
      reason: 'count_mismatch',
    });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
  });

  it('the latest is the highest workflow run id, then run attempt, then check run id', () => {
    // A later workflow run's check run can have the lower id: the two runs were queued together.
    const byRun = countedCheckRuns(
      [
        run(5, 'test', 'failure', { suite: 70, path: CI, runId: 100 }),
        run(4, 'test', 'success', { suite: 80, path: CI, runId: 101 }),
      ],
      [],
    );
    expect(byRun.map((r) => r.id)).toEqual([4]);
    const byAttempt = countedCheckRuns(
      [
        run(5, 'test', 'failure', { suite: 70, path: CI, runId: 100, attempt: 1 }),
        run(4, 'test', 'success', { suite: 71, path: CI, runId: 100, attempt: 2 }),
      ],
      [],
    );
    expect(byAttempt.map((r) => r.id)).toEqual([4]);
    const byId = countedCheckRuns(
      [
        run(4, 'test', 'failure', { suite: 70, path: CI, runId: 100, attempt: 2 }),
        run(5, 'test', 'success', { suite: 70, path: CI, runId: 100, attempt: 2 }),
      ],
      [],
    );
    expect(byId.map((r) => r.id)).toEqual([5]);
  });

  it('a run of no workflow keeps its suite, beside a run of the same name that has one', () => {
    const claims = checksOf({ total: 2, allSucceeded: false }, [
      run(1, 'test', 'success', { suite: 70, path: CI, runId: 100 }),
      { id: 2, name: 'test', status: 'completed', conclusion: 'failure', checkSuiteId: 90 },
    ]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({ verdict: 'pass', observed: 2 });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: false,
    });
  });

  it("an excluded run still supersedes its name's earlier runs, whatever their workflow run", () => {
    const DUNSTAN = '.github/workflows/dunstan.yml';
    const claims = checksOf(
      { total: 1, allSucceeded: true },
      [
        run(1, 'handback', 'failure', { suite: 70, path: DUNSTAN, runId: 100 }),
        run(2, 'test', 'success', { suite: 71, path: CI, runId: 101 }),
        {
          ...run(3, 'handback', 'success', { suite: 80, path: DUNSTAN, runId: 200 }),
          status: 'in_progress',
          conclusion: null,
        },
      ],
      [3],
    );
    expect(row(claims, 'count:/checks/total')).toMatchObject({ verdict: 'pass', observed: 1 });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: true,
    });
  });
});

// Spec 0.1.7 (10AF): an excluded run supersedes only earlier runs of its own identity, its name and
// its workflow path, or for a run of no workflow its app. In 0.1.6 it superseded every earlier run of
// its name, so a failed job named `dunstan` in another workflow was dropped and a checks claim passed.
describe('an excluded run supersedes only its own identity', () => {
  const CI = '.github/workflows/ci.yml';
  const SECURITY = '.github/workflows/security.yml';
  const DUNSTAN = '.github/workflows/dunstan.yml';
  const run = (
    id: number,
    name: string,
    conclusion: string | null,
    at: { suite: number; path?: string; runId?: number; app?: string },
  ): CheckRun => ({
    id,
    name,
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    checkSuiteId: at.suite,
    appSlug: at.app ?? 'github-actions',
    ...(at.path === undefined
      ? {}
      : { workflowPath: at.path, workflowRunId: at.runId ?? at.suite, runAttempt: 1 }),
  });
  const claimsOf = (
    checks: { total?: number; allSucceeded?: boolean; noneFailed?: boolean },
    runs: CheckRun[],
    excludedIds: number[],
  ) =>
    runChecks(
      block({ checks }),
      evidence({ checkRuns: { status: 'ok', commit: HEAD, excludedIds, runs } }),
      REPO,
    );

  it("the review's reproduction: a failed `dunstan` job in another workflow stays counted", () => {
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, path: SECURITY, runId: 100 }),
      run(20, 'dunstan', null, { suite: 80, path: DUNSTAN, runId: 200 }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([10, 30]);
    const claims = claimsOf({ total: 1, allSucceeded: true, noneFailed: true }, runs, [20]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({
      verdict: 'fail',
      observed: 2,
      reason: 'count_mismatch',
    });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
    expect(row(claims, 'count:/checks/noneFailed')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'none_failed_mismatch',
    });
  });

  it('an excluded run of no workflow, its app named, does not hide a job of its name', () => {
    // The Action run with an app's token: its `dunstan` run is in that app's suite, of no workflow.
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, path: SECURITY, runId: 100 }),
      run(20, 'dunstan', null, { suite: 80, app: 'example-checker' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([10, 30]);
  });

  it("the Action's own earlier runs on a re-run are still superseded", () => {
    // Run 1 of the checker's workflow failed on a bad block; the body was edited and run 2 is the
    // checker now, which excludes its job's run (40) and its `dunstan` run (50).
    const first = { suite: 70, path: DUNSTAN, runId: 100 };
    const second = { suite: 80, path: DUNSTAN, runId: 200 };
    const runs = [
      run(10, 'handback', 'failure', first),
      run(11, 'dunstan', 'failure', first),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
      run(40, 'handback', null, second),
      run(50, 'dunstan', null, second),
    ];
    expect(countedCheckRuns(runs, [40, 50]).map((r) => r.id)).toEqual([30]);
    // The same, with the checker's runs created by an app, in that app's suites of no workflow.
    const byApp = [
      run(11, 'dunstan', 'failure', { suite: 71, app: 'example-checker' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
      run(50, 'dunstan', null, { suite: 81, app: 'example-checker' }),
    ];
    expect(countedCheckRuns(byApp, [50]).map((r) => r.id)).toEqual([30]);
  });

  it('a run of no workflow is never the same check as a run of a workflow, either way', () => {
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, app: 'github-actions' }),
      run(11, 'lint', 'failure', { suite: 71, path: CI, runId: 101 }),
      run(20, 'dunstan', null, { suite: 80, path: DUNSTAN, runId: 200 }),
      run(21, 'lint', null, { suite: 81, app: 'github-actions' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20, 21]).map((r) => r.id)).toEqual([10, 11, 30]);
  });

  it("a run of another app's suite, or one whose app the record does not hold, is not superseded", () => {
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, app: 'another-app' }),
      { id: 11, name: 'dunstan', status: 'completed', conclusion: 'failure', checkSuiteId: 71 },
      run(20, 'dunstan', null, { suite: 80, app: 'github-actions' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([10, 11, 30]);
    const claims = claimsOf({ allSucceeded: true }, runs, [20]);
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      reason: 'all_succeeded_mismatch',
    });
  });

  it('a record without check suites supersedes by name alone, as before', () => {
    const runs: CheckRun[] = [
      { id: 10, name: 'dunstan', status: 'completed', conclusion: 'failure' },
      { id: 20, name: 'dunstan', status: 'in_progress', conclusion: null },
      { id: 30, name: 'test', status: 'completed', conclusion: 'success' },
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([30]);
  });

  // 10AF2: every workflow in a repository creates runs as `github-actions`, so that app identifies
  // no checker. A failed `dunstan` run created through the API with a workflow's GITHUB_TOKEN, or an
  // Actions job whose suite the workflow runs listing missed, had the Action's own identity and a
  // lower id, and was hidden.
  it('a `github-actions` run of no workflow has no identity, and is not superseded', () => {
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, app: 'github-actions' }),
      run(20, 'dunstan', null, { suite: 80, app: 'github-actions' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([10, 30]);
    const claims = claimsOf({ total: 1, allSucceeded: true, noneFailed: true }, runs, [20]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({
      verdict: 'fail',
      observed: 2,
      reason: 'count_mismatch',
    });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
    expect(row(claims, 'count:/checks/noneFailed')).toMatchObject({
      verdict: 'fail',
      observed: false,
      reason: 'none_failed_mismatch',
    });
  });

  it('a `github-actions` pair of no workflow in one suite is still one check, its latest run', () => {
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, app: 'github-actions' }),
      run(20, 'dunstan', null, { suite: 70, app: 'github-actions' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([30]);
    const claims = claimsOf({ total: 1, allSucceeded: true }, runs, [20]);
    expect(row(claims, 'count:/checks/total')).toMatchObject({ verdict: 'pass', observed: 1 });
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: true,
    });
  });

  it('a run of no workflow by any other app is still superseded by its app', () => {
    const runs = [
      run(10, 'dunstan', 'failure', { suite: 70, app: 'example-checker' }),
      run(20, 'dunstan', null, { suite: 80, app: 'example-checker' }),
      run(30, 'test', 'success', { suite: 90, path: CI, runId: 300 }),
    ];
    expect(countedCheckRuns(runs, [20]).map((r) => r.id)).toEqual([30]);
    const claims = claimsOf({ allSucceeded: true }, runs, [20]);
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      verdict: 'pass',
      observed: true,
    });
  });
});

// Spec 0.1.6: `checks.noneFailed` is true when every completed counted run
// concluded success, skipped or neutral and at least one succeeded. It reads the runs
// `allSucceeded` reads, and `allSucceeded` still reads a skipped or neutral run as not succeeded.
describe('checks.noneFailed', () => {
  const CI = '.github/workflows/ci.yml';
  let nextRunId = 100;
  const run = (
    id: number,
    name: string,
    conclusion: string | null,
    at: { path?: string; runId?: number } = {},
  ): CheckRun => ({
    id,
    name,
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    checkSuiteId: 70 + id,
    appSlug: 'github-actions',
    workflowPath: at.path ?? CI,
    workflowRunId: at.runId ?? nextRunId++,
    runAttempt: 1,
  });
  const noneFailedOf = (declared: boolean, runs: CheckRun[], excludedIds: number[] = []) =>
    row(
      runChecks(
        block({ checks: { noneFailed: declared } }),
        evidence({ checkRuns: { status: 'ok', commit: HEAD, excludedIds, runs } }),
        REPO,
      ),
      'count:/checks/noneFailed',
    );
  const passes = (observed: boolean) => ({
    id: 'count:/checks/noneFailed',
    check: 'count',
    field: '/checks/noneFailed',
    declared: observed,
    observed,
    verdict: 'pass',
  });

  it('is true when every counted run succeeded', () => {
    expect(noneFailedOf(true, [run(1, 'lint', 'success'), run(2, 'test', 'success')])).toEqual(
      passes(true),
    );
  });

  it('is true beside a skipped run, where allSucceeded is false', () => {
    const runs = [run(1, 'test', 'success'), run(2, 'deploy', 'skipped')];
    expect(noneFailedOf(true, runs)).toEqual(passes(true));
    const claims = runChecks(
      block({ checks: { allSucceeded: true, noneFailed: true } }),
      evidence({ checkRuns: { status: 'ok', commit: HEAD, excludedIds: [], runs } }),
      REPO,
    );
    expect(claims.filter((c) => c.check === 'count').map((c) => [c.id, c.verdict])).toEqual([
      ['count:/checks/allSucceeded', 'fail'],
      ['count:/checks/noneFailed', 'pass'],
    ]);
    expect(row(claims, 'count:/checks/allSucceeded')).toMatchObject({
      observed: false,
      reason: 'all_succeeded_mismatch',
    });
  });

  it('is true beside a neutral run', () => {
    expect(noneFailedOf(true, [run(1, 'test', 'success'), run(2, 'lint', 'neutral')])).toEqual(
      passes(true),
    );
  });

  for (const conclusion of [
    'failure',
    'cancelled',
    'timed_out',
    'action_required',
    'stale',
    'startup_failure',
    'a_conclusion_no_spec_names',
  ]) {
    it(`is false beside a run that concluded ${conclusion}`, () => {
      expect(noneFailedOf(true, [run(1, 'test', 'success'), run(2, 'e2e', conclusion)])).toEqual({
        id: 'count:/checks/noneFailed',
        check: 'count',
        field: '/checks/noneFailed',
        declared: true,
        observed: false,
        verdict: 'fail',
        reason: 'none_failed_mismatch',
      });
      expect(noneFailedOf(false, [run(1, 'test', 'success'), run(2, 'e2e', conclusion)])).toEqual(
        passes(false),
      );
    });
  }

  it('is false beside a failed run even while another is still running', () => {
    const runs = [run(1, 'test', 'failure'), run(2, 'e2e', null)];
    expect(noneFailedOf(false, runs)).toEqual(passes(false));
  });

  it('is unverifiable, checks_incomplete, while a counted run has not completed', () => {
    expect(noneFailedOf(true, [run(1, 'test', 'success'), run(2, 'e2e', null)])).toMatchObject({
      observed: null,
      verdict: 'unverifiable',
      reason: 'checks_incomplete',
    });
  });

  it('is unverifiable, no_succeeded_check_runs, when every counted run was skipped', () => {
    for (const declared of [true, false]) {
      expect(
        noneFailedOf(declared, [run(1, 'test', 'skipped'), run(2, 'e2e', 'skipped')]),
      ).toMatchObject({
        observed: null,
        verdict: 'unverifiable',
        reason: 'no_succeeded_check_runs',
      });
    }
    expect(noneFailedOf(true, [run(1, 'test', 'neutral')])).toMatchObject({
      verdict: 'unverifiable',
      reason: 'no_succeeded_check_runs',
    });
  });

  it('is unverifiable, no_check_runs, with no check runs at all', () => {
    expect(noneFailedOf(true, [])).toMatchObject({
      observed: null,
      verdict: 'unverifiable',
      reason: 'no_check_runs',
    });
  });

  it('is unverifiable when the check runs could not be read', () => {
    const claims = runChecks(
      block({ checks: { noneFailed: true } }),
      evidence({ checkRuns: { status: 'unreadable', source: 'check_runs' } }),
      REPO,
    );
    expect(row(claims, 'count:/checks/noneFailed')).toMatchObject({
      verdict: 'unverifiable',
      reason: 'source_unreadable:check_runs',
    });
  });

  it('reads only the latest run of a workflow path and name', () => {
    const runs = [
      run(1, 'test', 'failure', { runId: 100 }),
      run(2, 'test', 'success', { runId: 200 }),
    ];
    expect(noneFailedOf(true, runs)).toEqual(passes(true));
  });

  it("does not count the checker's own excluded run", () => {
    const DUNSTAN = '.github/workflows/dunstan.yml';
    const runs = [
      run(1, 'test', 'success'),
      run(2, 'handback', 'failure', { path: DUNSTAN }),
      run(3, 'handback', null, { path: DUNSTAN }),
    ];
    expect(noneFailedOf(true, runs, [3])).toEqual(passes(true));
  });

  it('comes after checks.allSucceeded, whatever the block member order', () => {
    const claims = runChecks(
      block({ checks: { noneFailed: true, allSucceeded: true, total: 1 } }),
      evidence({
        checkRuns: { status: 'ok', commit: HEAD, excludedIds: [], runs: [run(1, 't', 'success')] },
      }),
      REPO,
    );
    expect(claims.filter((c) => c.check === 'count').map((c) => c.id)).toEqual([
      'count:/checks/total',
      'count:/checks/allSucceeded',
      'count:/checks/noneFailed',
    ]);
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

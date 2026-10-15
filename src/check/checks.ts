// The five checks of spec section 7, each a pure function of the block and the evidence. None reads
// a clock, a file, the network or a random source.

import { BLOCK_VERSION } from '../spec/constants.js';
import {
  absentSection,
  compareCodeUnits,
  fail,
  pass,
  toSecond,
  unreadReason,
  unverifiable,
} from './rows.js';
import type {
  Block,
  CheckRun,
  Claim,
  CloseTargetEvidence,
  DeploymentsEvidence,
  Evidence,
  JunitRecord,
  Reference,
  ReferenceEvidence,
  TestRecordEvidence,
  Unread,
} from './types.js';

// ---------------------------------------------------------------- 7.2 head

export function checkHead(block: Block, evidence: Evidence): Claim[] {
  const observed = evidence.pullRequest.headSha;
  return [
    block.headCommit === observed
      ? pass('head', '/headCommit', block.headCommit, observed)
      : fail('head', '/headCommit', block.headCommit, observed, 'head_mismatch'),
  ];
}

// ---------------------------------------------------------------- 7.3 scope, both ways

export function checkScope(block: Block, evidence: Evidence): Claim[] {
  const files = evidence.files;
  const declared = block.filesChanged;

  if (files === undefined || files.status !== 'ok' || !files.complete) {
    const reason =
      files === undefined
        ? absentSection('files')
        : files.status !== 'ok'
          ? unreadReason(files)
          : 'file_list_truncated';
    return [
      ...declared.map((path, i) => unverifiable('scope', `/filesChanged/${i}`, path, reason)),
      // One row stands for the files that could not be listed; it is never a pass.
      {
        id: 'scope:undeclared',
        check: 'scope',
        field: '/filesChanged',
        declared: null,
        observed: null,
        verdict: 'unverifiable',
        reason,
      },
    ];
  }

  // The changed set: every path and every previous path. A rename or copy is declared if either of
  // its paths is.
  const byPath = new Map<string, string>();
  for (const entry of files.entries) {
    byPath.set(entry.path, entry.path);
    if (entry.previousPath !== undefined && !byPath.has(entry.previousPath)) {
      byPath.set(entry.previousPath, entry.path);
    }
  }
  const declaredSet = new Set(declared);

  const rows: Claim[] = declared.map((path, i) => {
    const match = byPath.get(path);
    return match !== undefined
      ? pass('scope', `/filesChanged/${i}`, path, match)
      : fail('scope', `/filesChanged/${i}`, path, null, 'declared_not_changed');
  });

  const omitted = files.entries
    .filter(
      (entry) =>
        !declaredSet.has(entry.path) &&
        (entry.previousPath === undefined || !declaredSet.has(entry.previousPath)),
    )
    .map((entry) => entry.path)
    .sort(compareCodeUnits);
  for (const path of omitted) {
    rows.push({
      id: `scope:undeclared:${path}`,
      check: 'scope',
      field: '/filesChanged',
      declared: null,
      observed: path,
      verdict: 'fail',
      reason: 'undeclared_file',
    });
  }
  return rows;
}

// ---------------------------------------------------------------- 7.4 references

// `#N` names issue or pull request N in the subject repository.
export function qualifyIssue(issue: string, repository: string): string {
  return issue.startsWith('#') ? `${repository}${issue}` : issue;
}

// GitHub owner and repository names are case-insensitive; the issue number is exact.
export function sameIssue(a: string, b: string): boolean {
  const [repoA, numA] = a.split('#');
  const [repoB, numB] = b.split('#');
  return numA === numB && repoA?.toLowerCase() === repoB?.toLowerCase();
}

function findReference(
  evidence: Evidence,
  kind: 'issue' | 'commit',
  ref: string,
): ReferenceEvidence | undefined {
  return evidence.references?.find(
    (r) => r.kind === kind && (kind === 'issue' ? sameIssue(r.ref, ref) : r.ref === ref),
  );
}

// A `closes` whose target exists and is not among the closing references (spec 0.1.4, section 7.4).
// The closing references list issues only, leave out an issue a commit message closed, and are not
// populated for a pull request into a branch other than the default; GitHub's record of a close is
// the closer of the target's ClosedEvent, a pull request or a commit. `at` is the identity the
// target's close events were read under; `observed` is what the closing references showed.
function closedBy(
  reference: Reference,
  field: string,
  evidence: Evidence,
  repository: string,
  at: string,
  observed: Record<string, unknown>,
): Claim {
  const pr = evidence.pullRequest;
  const section = evidence.closeEvents;
  const target = section?.targets.find((t) => sameIssue(t.ref, at));
  const side = section?.pullRequest;
  // Why the close events cannot settle the claim, if they cannot: rows 2 and 3 are read first, so
  // a recorded close by this pull request passes whatever else is unread.
  let unread: string | undefined;
  if (section === undefined || target === undefined) unread = absentSection('closeEvents');
  else if (target.status !== 'ok') unread = unreadReason(target);
  const events = target?.status === 'ok' ? target.events : [];
  const sideUnread = () =>
    side === undefined ? absentSection('closeEvents') : unreadReason(side as Unread);

  // Rows 2 and 3 read every ClosedEvent, not only the latest: a target this pull request closed and
  // someone later reopened was closed by it.
  const self = `${repository}#${pr.number}`;
  const byThis = events.find(
    (e) => e.closer?.kind === 'pull_request' && sameIssue(e.closer.ref, self),
  );
  if (byThis !== undefined) {
    return pass('reference', field, reference, { ...observed, closedBy: byThis });
  }
  // A commit closes its issue when it lands on the default branch. The merge commit is the pull
  // request's own record; any other commit is one of its commits only if the commit list says so.
  for (const e of events) {
    if (e.closer?.kind !== 'commit') continue;
    const oid = e.closer.oid;
    if (oid === pr.mergeSha || (side?.status === 'ok' && side.commits.includes(oid))) {
      return pass('reference', field, reference, { ...observed, closedBy: e });
    }
    if (side?.status !== 'ok') unread ??= sideUnread();
  }
  // GitHub computes the closing references asynchronously after the pull request is opened or its
  // body is edited, so while it is open an absence may not be settled yet.
  if (pr.state === 'open' && !pr.merged) {
    return unverifiable('reference', field, reference, 'closing_link_unsettled');
  }
  // GitHub acts on closing keywords only in a pull request into the default branch. A target still
  // open after a merge elsewhere may yet be closed when that branch is merged into the default.
  if (pr.merged && target?.status === 'ok' && target.state === 'open') {
    if (side?.status !== 'ok') unread ??= sideUnread();
    else if (side.baseRef !== side.defaultBranch) {
      return unverifiable('reference', field, reference, 'closing_base_not_default');
    }
  }
  if (unread !== undefined) return unverifiable('reference', field, reference, unread);
  const settled = target as CloseTargetEvidence & { status: 'ok' };
  // GitHub sets a target's state to closed seconds before its timeline shows the ClosedEvent
  // (observed 2026-10-12). A closed target whose complete read holds no ClosedEvent at all has a
  // close not yet recorded, which may be this pull request's. A ClosedEvent with a null closer is
  // not this case: it is recorded, and it is not this pull request's close.
  if (settled.state === 'closed' && settled.events.length === 0) {
    return unverifiable('reference', field, reference, 'closing_event_unsettled');
  }
  // A target open after a merge into the default branch, closed by another pull request, another
  // commit or no recorded closer, or a pull request closed without merging: this pull request did
  // not close it.
  return fail(
    'reference',
    field,
    reference,
    { ...observed, state: settled.state, events: settled.events },
    'not_closing',
  );
}

// The block a `closes` claim made outside a block is checked as: one `closes` reference to `issue`
// and nothing else, at `headCommit`. An advisory (DRAFT 0.2.0, D.11.4) and a reader claim (D.6) of
// a closes are each decided by this block's checkReferences row, never by a rule of their own.
export function closesBlock(issue: string, headCommit: string): Block {
  return {
    dunstan: BLOCK_VERSION,
    headCommit,
    filesChanged: [],
    references: [{ issue, relation: 'closes' }],
  };
}

export function checkReferences(block: Block, evidence: Evidence, repository: string): Claim[] {
  return (block.references ?? []).map((reference, i): Claim => {
    const field = `/references/${i}`;

    if ('issue' in reference && reference.relation === 'closes') {
      const closing = evidence.closingReferences;
      if (closing === undefined) {
        return unverifiable('reference', field, reference, absentSection('closingReferences'));
      }
      if (closing.status !== 'ok') {
        return unverifiable('reference', field, reference, unreadReason(closing));
      }
      const target = qualifyIssue(reference.issue, repository);
      const observed = { closing: closing.issues };
      if (closing.issues.some((issue) => sameIssue(issue, target))) {
        return pass('reference', field, reference, observed);
      }
      // GitHub leaves out of the closing references any issue its reader cannot see, so an issue
      // missing from the list is read as a `cites` issue is before the claim can fail.
      const entry = findReference(evidence, 'issue', target);
      if (entry === undefined) {
        return unverifiable('reference', field, reference, absentSection('references'));
      }
      if (entry.status !== 'ok') {
        return unverifiable('reference', field, reference, unreadReason(entry));
      }
      if (!entry.exists) {
        return fail('reference', field, reference, { ...observed, exists: false }, 'not_found');
      }
      // An issue transferred to another repository is listed under its new identity, and GitHub
      // answered the read of its old one with that identity (spec 0.1.3). Only that recorded identity
      // is compared; nothing is inferred.
      const resolved = entry.kind === 'issue' ? entry.resolvedAs : undefined;
      const named =
        resolved === undefined ? observed : { ...observed, ref: target, resolvedAs: resolved };
      if (resolved !== undefined && closing.issues.some((issue) => sameIssue(issue, resolved))) {
        return pass('reference', field, reference, named);
      }
      return closedBy(reference, field, evidence, repository, resolved ?? target, named);
    }

    if ('issue' in reference) {
      const entry = findReference(evidence, 'issue', qualifyIssue(reference.issue, repository));
      if (entry === undefined) {
        return unverifiable('reference', field, reference, absentSection('references'));
      }
      if (entry.status !== 'ok') {
        return unverifiable('reference', field, reference, unreadReason(entry));
      }
      return entry.exists
        ? pass('reference', field, reference, { exists: true })
        : fail('reference', field, reference, { exists: false }, 'not_found');
    }

    const entry = findReference(evidence, 'commit', reference.commit);
    if (entry === undefined) {
      return unverifiable('reference', field, reference, absentSection('references'));
    }
    if (entry.status !== 'ok' || entry.kind !== 'commit') {
      return unverifiable(
        'reference',
        field,
        reference,
        entry.status === 'ok' ? absentSection('references') : unreadReason(entry),
      );
    }
    const observed = { exists: entry.exists, reachableFromHead: entry.reachableFromHead };
    if (!entry.exists) return fail('reference', field, reference, observed, 'not_found');
    if (!entry.reachableFromHead) {
      return fail('reference', field, reference, observed, 'not_reachable');
    }
    return pass('reference', field, reference, observed);
  });
}

// ---------------------------------------------------------------- 7.5 counts

function sameRecord(a: JunitRecord, b: JunitRecord): boolean {
  return (
    a.kind === b.kind &&
    a.workflow === b.workflow &&
    a.job === b.job &&
    a.artifact === b.artifact &&
    a.path === b.path
  );
}

function countRow(
  field: string,
  declared: number,
  evidence: TestRecordEvidence | undefined,
  pick: (run: { executed: number; failed: number }) => number,
): Claim {
  if (evidence === undefined)
    return unverifiable('count', field, declared, absentSection('testRecords'));
  if (evidence.status !== 'ok')
    return unverifiable('count', field, declared, unreadReason(evidence));
  if (evidence.runs.length === 0) return unverifiable('count', field, declared, 'record_not_found');
  const numbers = new Set(evidence.runs.map(pick));
  // Several candidate runs that agree give one number; runs that disagree are never resolved by
  // picking one.
  if (numbers.size > 1) return unverifiable('count', field, declared, 'record_ambiguous');
  const observed = pick(evidence.runs[0] as { executed: number; failed: number });
  return observed === declared
    ? pass('count', field, declared, observed)
    : fail('count', field, declared, observed, 'count_mismatch');
}

function checkTests(block: Block, evidence: Evidence): Claim[] {
  const rows: Claim[] = [];
  (block.tests ?? []).forEach((test, i) => {
    const countField = `/tests/${i}/count`;
    const failuresField = `/tests/${i}/failures`;
    if (test.record.kind !== 'junit') {
      rows.push(unverifiable('count', countField, test.count, 'no_comparable_record_field'));
      if (test.failures !== undefined) {
        rows.push(
          unverifiable('count', failuresField, test.failures, 'no_comparable_record_field'),
        );
      }
      return;
    }
    const record = test.record as JunitRecord;
    const entry = evidence.testRecords?.find((r) => sameRecord(r.record, record));
    rows.push(countRow(countField, test.count, entry, (run) => run.executed));
    if (test.failures !== undefined) {
      rows.push(countRow(failuresField, test.failures, entry, (run) => run.failed));
    }
  });
  return rows;
}

// What one counted check run stands for (spec section 7.5): a job of a workflow, by the workflow's
// path; else a check of one check suite (a run of no workflow, or of a record that recorded no
// workflows); else, in a record that recorded no suites, the name alone.
function checkKey(run: CheckRun): string {
  if (run.workflowPath !== undefined)
    return JSON.stringify(['workflow', run.workflowPath, run.name]);
  if (run.checkSuiteId !== undefined) return JSON.stringify(['suite', run.checkSuiteId, run.name]);
  return JSON.stringify(['name', run.name]);
}

// Whether `a` is later than `b` of the same key: the higher workflow run id, then run attempt, then
// check run id. Runs of one key either all carry a workflow run or none does.
function later(a: CheckRun, b: CheckRun): boolean {
  if ((a.workflowRunId ?? 0) !== (b.workflowRunId ?? 0)) {
    return (a.workflowRunId ?? 0) > (b.workflowRunId ?? 0);
  }
  if ((a.runAttempt ?? 0) !== (b.runAttempt ?? 0)) return (a.runAttempt ?? 0) > (b.runAttempt ?? 0);
  return a.id > b.id;
}

// Whose run an excluded run's earlier runs are (spec 0.1.7, section 7.5): a run with a workflow path
// is its workflow's, by path and name; a run of no workflow is its app's, by app and name; a run of a
// record that recorded no suites is its name's alone, as it was then. Undefined when the record
// cannot tell: a run with a check suite and neither a workflow path nor an app, or a run of no
// workflow by `github-actions`, which every workflow in the repository creates runs as, so that it
// identifies no checker.
function identity(run: CheckRun): string | undefined {
  if (run.workflowPath !== undefined)
    return JSON.stringify(['workflow', run.workflowPath, run.name]);
  if (run.appSlug === 'github-actions') return undefined;
  if (run.appSlug !== undefined) return JSON.stringify(['app', run.appSlug, run.name]);
  if (run.checkSuiteId === undefined) return JSON.stringify(['name', run.name]);
  return undefined;
}

// The check runs at the head: the latest run per workflow and name, less any the checker excluded.
// GitHub names an Actions check run after its job, and each run of a workflow is a check suite of
// its own: two workflows' `test` jobs are two checks and neither hides the other, and one workflow
// run twice on the head (on push and pull_request, or after a reopen) is one check per job, its
// latest workflow run's. A run of no workflow is keyed by its check suite, and a run of a record
// that recorded no suites by its name alone, as each was then. An excluded run also supersedes the
// earlier runs of its own identity, in any suite: those are the checker's own earlier runs. It never
// supersedes a run of its name in another workflow, or one whose identity the record cannot tell.
export function countedCheckRuns(
  runs: readonly CheckRun[],
  excludedIds: readonly number[],
): CheckRun[] {
  const excluded = new Set(excludedIds);
  const checker = new Map<string, number>();
  const latest = new Map<string, CheckRun>();
  for (const run of runs) {
    const id = identity(run);
    if (excluded.has(run.id) && id !== undefined) {
      checker.set(id, Math.max(checker.get(id) ?? 0, run.id));
    }
    const key = checkKey(run);
    const seen = latest.get(key);
    if (seen === undefined || later(run, seen)) latest.set(key, run);
  }
  const superseded = (run: CheckRun) => {
    const id = identity(run);
    return id !== undefined && run.id < (checker.get(id) ?? 0);
  };
  return [...latest.values()]
    .filter((run) => !excluded.has(run.id) && !superseded(run))
    .sort((a, b) => a.id - b.id);
}

// The conclusions `checks.noneFailed` reads as not failed (spec 0.1.6, section 7.5): a closed list.
// Any other conclusion of a completed run, including one the spec does not name, is a failure.
export const NOT_FAILED_CONCLUSIONS: readonly string[] = ['success', 'skipped', 'neutral'];

// A boolean claim over the counted runs: `failed` says whether a completed run's conclusion makes
// the observed value false. Otherwise a run not completed leaves it unsettled, and `unsettled`, if
// given, may name a reason the completed runs cannot settle it. A vacuous truth is not a pass.
function booleanRow(
  field: string,
  declared: boolean,
  reason: string | undefined,
  runs: readonly CheckRun[],
  failed: (conclusion: string | null) => boolean,
  mismatch: string,
  unsettled?: (runs: readonly CheckRun[]) => string | undefined,
): Claim {
  if (reason !== undefined) return unverifiable('count', field, declared, reason);
  if (runs.length === 0) return unverifiable('count', field, declared, 'no_check_runs');
  let observed: boolean;
  if (runs.some((r) => r.status === 'completed' && failed(r.conclusion))) observed = false;
  else if (runs.some((r) => r.status !== 'completed')) {
    return unverifiable('count', field, declared, 'checks_incomplete');
  } else {
    const why = unsettled?.(runs);
    if (why !== undefined) return unverifiable('count', field, declared, why);
    observed = true;
  }
  return observed === declared
    ? pass('count', field, declared, observed)
    : fail('count', field, declared, observed, mismatch);
}

function checkChecks(block: Block, evidence: Evidence): Claim[] {
  const checks = block.checks;
  if (checks === undefined) return [];
  const rows: Claim[] = [];
  const section = evidence.checkRuns;
  let reason: string | undefined;
  if (section === undefined) reason = absentSection('checkRuns');
  else if (section.status !== 'ok') reason = unreadReason(section);
  // Check runs read at another commit than the pull request's head (spec 0.1.8): the reader reads
  // them at the declared headCommit, so where that is not the head they say nothing about it.
  else if (section.commit !== evidence.pullRequest.headSha) reason = 'check_runs_not_at_head';

  const runs =
    section !== undefined && section.status === 'ok'
      ? countedCheckRuns(section.runs, section.excludedIds)
      : [];

  if (checks.total !== undefined) {
    const field = '/checks/total';
    if (reason !== undefined) rows.push(unverifiable('count', field, checks.total, reason));
    else if (runs.length === checks.total)
      rows.push(pass('count', field, checks.total, runs.length));
    else rows.push(fail('count', field, checks.total, runs.length, 'count_mismatch'));
  }

  if (checks.allSucceeded !== undefined) {
    rows.push(
      booleanRow(
        '/checks/allSucceeded',
        checks.allSucceeded,
        reason,
        runs,
        (conclusion) => conclusion !== 'success',
        'all_succeeded_mismatch',
      ),
    );
  }

  if (checks.noneFailed !== undefined) {
    // A head where every counted run was skipped or neutral shows that nothing failed and nothing
    // ran: that is not a pass.
    rows.push(
      booleanRow(
        '/checks/noneFailed',
        checks.noneFailed,
        reason,
        runs,
        (conclusion) => conclusion === null || !NOT_FAILED_CONCLUSIONS.includes(conclusion),
        'none_failed_mismatch',
        (completed) =>
          completed.some((r) => r.conclusion === 'success') ? undefined : 'no_succeeded_check_runs',
      ),
    );
  }
  return rows;
}

export function checkCounts(block: Block, evidence: Evidence): Claim[] {
  return [...checkTests(block, evidence), ...checkChecks(block, evidence)];
}

// ---------------------------------------------------------------- 7.6 time

function checkMergedAt(block: Block, evidence: Evidence): Claim[] {
  if (block.mergedAt === undefined) return [];
  const declared = block.mergedAt;
  const pr = evidence.pullRequest;
  if (!pr.merged) return [fail('time', '/mergedAt', declared, pr.mergedAt, 'not_merged')];
  if (pr.mergedAt === null) {
    return [unverifiable('time', '/mergedAt', declared, 'evidence_field_unpopulated:merged_at')];
  }
  return toSecond(declared) < toSecond(pr.mergedAt)
    ? [fail('time', '/mergedAt', declared, pr.mergedAt, 'premature')]
    : [pass('time', '/mergedAt', declared, pr.mergedAt)];
}

function earliestSuccess(
  section: DeploymentsEvidence & { status: 'ok' },
  relations: readonly string[],
  at: string,
): string | undefined {
  const times = section.deployments
    .filter((d) => relations.includes(d.relation) && d.successAt !== null)
    .map((d) => d.successAt as string)
    .filter((t) => toSecond(t) <= toSecond(at))
    .sort((a, b) => compareCodeUnits(toSecond(a), toSecond(b)) || compareCodeUnits(a, b));
  return times[0];
}

function checkDeployedAt(block: Block, evidence: Evidence): Claim[] {
  if (block.deployedAt === undefined) return [];
  const declared = block.deployedAt;
  const field = '/deployedAt';
  const section = evidence.deployments?.find((d) => d.environment === declared.environment);
  if (section === undefined)
    return [unverifiable('time', field, declared, absentSection('deployments'))];
  if (section.status !== 'ok')
    return [unverifiable('time', field, declared, unreadReason(section))];

  // For a pull request that is not merged, only a deployment of the head commit applies.
  const related = evidence.pullRequest.merged ? ['head', 'merge', 'descendant'] : ['head'];
  const success = earliestSuccess(section, related, declared.at);
  if (success !== undefined) return [pass('time', field, declared, success)];
  if (
    evidence.pullRequest.merged &&
    earliestSuccess(section, ['unknown'], declared.at) !== undefined
  ) {
    return [unverifiable('time', field, declared, 'source_unreadable:compare')];
  }
  return [fail('time', field, declared, null, 'no_deployment')];
}

export function checkTime(block: Block, evidence: Evidence): Claim[] {
  return [...checkMergedAt(block, evidence), ...checkDeployedAt(block, evidence)];
}

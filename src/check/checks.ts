// The five checks of spec section 7, each a pure function of the block and the evidence. None reads
// a clock, a file, the network or a random source.

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
  DeploymentsEvidence,
  Evidence,
  JunitRecord,
  ReferenceEvidence,
  TestRecordEvidence,
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
      // GitHub computes the closing references asynchronously after the pull request is opened or
      // its body is edited, so while it is open an absence may not be settled yet.
      const pr = evidence.pullRequest;
      return pr.state === 'open' && !pr.merged
        ? unverifiable('reference', field, reference, 'closing_link_unsettled')
        : fail('reference', field, reference, observed, 'not_closing');
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

// The check runs at the head: the latest run per name, less any the checker excluded.
export function countedCheckRuns(
  runs: readonly CheckRun[],
  excludedIds: readonly number[],
): CheckRun[] {
  const latest = new Map<string, CheckRun>();
  for (const run of runs) {
    const seen = latest.get(run.name);
    if (seen === undefined || run.id > seen.id) latest.set(run.name, run);
  }
  const excluded = new Set(excludedIds);
  return [...latest.values()].filter((run) => !excluded.has(run.id)).sort((a, b) => a.id - b.id);
}

function checkChecks(block: Block, evidence: Evidence): Claim[] {
  const checks = block.checks;
  if (checks === undefined) return [];
  const rows: Claim[] = [];
  const section = evidence.checkRuns;
  let reason: string | undefined;
  if (section === undefined) reason = absentSection('checkRuns');
  else if (section.status !== 'ok') reason = unreadReason(section);

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
    const field = '/checks/allSucceeded';
    const declared = checks.allSucceeded;
    if (reason !== undefined) {
      rows.push(unverifiable('count', field, declared, reason));
    } else if (runs.length === 0) {
      // A vacuous truth is not a pass.
      rows.push(unverifiable('count', field, declared, 'no_check_runs'));
    } else {
      let observed: boolean | undefined;
      if (runs.some((r) => r.status === 'completed' && r.conclusion !== 'success'))
        observed = false;
      else if (runs.some((r) => r.status !== 'completed')) observed = undefined;
      else observed = true;
      if (observed === undefined) {
        rows.push(unverifiable('count', field, declared, 'checks_incomplete'));
      } else if (observed === declared) {
        rows.push(pass('count', field, declared, observed));
      } else {
        rows.push(fail('count', field, declared, observed, 'all_succeeded_mismatch'));
      }
    }
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

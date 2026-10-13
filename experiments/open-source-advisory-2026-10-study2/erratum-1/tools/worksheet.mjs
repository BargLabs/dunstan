// The erratum's worksheet: each `closes` advisory beside who actually closed its target.
//
//   pnpm exec node experiments/open-source-advisory-2026-10-study2/erratum-1/tools/worksheet.mjs
//
// Joins runs/index.json, labels/labels.jsonl and erratum-1/closers.json into erratum-1/
// worksheet.jsonl, one line per row of closers.json, and writes the summary erratum-1/worksheet.md:
// counts by closerRelation and publishedLabel, per pull request and in total. Every line's `ruling`
// is null: the operator rules, by hand, each line whose `needsRuling` is true (it has a published M2
// label), with one of the M2 labels. The tool proposes no ruling, and refuses to overwrite either
// file, so a ruling is never lost to a rebuild.
//
// closerRelation is what spec 0.1.4 section 7.4, rows 2 to 8, makes of the target against the row's
// pull request, read in the table's order as checker 0.1.7's closedBy reads it. Row 1 (the target
// among the closing references) is not read here: every not_closing advisory failed it.
//   this_pr                      row 2, pass: some ClosedEvent's closer is this pull request
//   commit_of_this_pr            row 3, pass: some ClosedEvent's closer is the merge commit, or a
//                                commit the pull request's complete commit list holds
//   pr_open                      row 4, unverifiable closing_link_unsettled: the pull request is
//                                open and unmerged
//   open_after_non_default_base  row 5, unverifiable closing_base_not_default: merged into a base
//                                that is not the default branch, and the target is open
//   incomplete                   row 6, unverifiable: a read a row above needs was not complete, or
//                                the pull request or target was not found; `reason` says which
//   event_unsettled              row 7, unverifiable closing_event_unsettled: the target is closed,
//                                and its complete read holds no ClosedEvent
//   pr_closed_unmerged           row 8, fail not_closing: the pull request was closed unmerged
//   still_open                   row 8: the target is open after a merge into the default branch
//   other_pr                     row 8: the last ClosedEvent's closer is another pull request
//   other_commit                 row 8: the last ClosedEvent's closer is another commit
//   no_closer                    row 8: the last ClosedEvent's closer is null or of another type,
//                                or a target not open has no ClosedEvent and is not CLOSED
// Rows 2 and 3 read every ClosedEvent, not only the latest, and pass whatever else is unread. Each
// line's section74 gives the row, the verdict and the reason; closedAt, closedBy and closer are the
// ClosedEvent a row 2 or 3 pass rests on, and otherwise the last one.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  flags,
  isClosesRow,
  isMain,
  LABELS,
  NOT_CLOSING,
  paths,
  RELATIONS,
  readJson,
  readJsonl,
  sameRef,
  sha256,
  writeJsonl,
} from './common.mjs';

const lastOf = (events) =>
  events.reduce((a, e) => (a === null || e.createdAt >= a.createdAt ? e : a), null);

// Section 7.4's row, verdict and reason for each relation.
export const SECTION_74 = Object.freeze({
  this_pr: { row: 2, verdict: 'pass', reason: null },
  commit_of_this_pr: { row: 3, verdict: 'pass', reason: null },
  pr_open: { row: 4, verdict: 'unverifiable', reason: 'closing_link_unsettled' },
  open_after_non_default_base: {
    row: 5,
    verdict: 'unverifiable',
    reason: 'closing_base_not_default',
  },
  incomplete: { row: 6, verdict: 'unverifiable', reason: 'source_unreadable' },
  event_unsettled: { row: 7, verdict: 'unverifiable', reason: 'closing_event_unsettled' },
  pr_closed_unmerged: { row: 8, verdict: 'fail', reason: 'not_closing' },
  still_open: { row: 8, verdict: 'fail', reason: 'not_closing' },
  other_pr: { row: 8, verdict: 'fail', reason: 'not_closing' },
  other_commit: { row: 8, verdict: 'fail', reason: 'not_closing' },
  no_closer: { row: 8, verdict: 'fail', reason: 'not_closing' },
});

// The row's relation under section 7.4, the ClosedEvent it rests on, and the reason when incomplete.
export function closerRelation(row, pr, target) {
  const at = (relation, event = null, reason = null) => ({ relation, event, reason });
  // An incomplete read holds no events: what it did read is not evidence (as checker 0.1.7).
  const events = target.found && target.closedEvents !== null ? target.closedEvents : [];
  const byThis = events.find(
    (e) => e.closer?.type === 'PullRequest' && sameRef(e.closer.pr, row.pr),
  );
  if (byThis !== undefined) return at('this_pr', byThis);
  const own = pr.found
    ? [...(pr.commits?.oids ?? []), pr.mergeCommit]
        .filter((x) => x !== null)
        .map((x) => x.toLowerCase())
    : [];
  let unread = target.found ? target.incomplete : 'the target was not found';
  for (const e of events) {
    if (e.closer?.type !== 'Commit') continue;
    if (own.includes(e.closer.oid.toLowerCase())) return at('commit_of_this_pr', e);
    // Another commit is one of the pull request's only if its complete commit list says so.
    if (!pr.found || pr.commits === null)
      unread ??= pr.incomplete ?? 'the pull request was not found';
  }
  if (!pr.found) return at('incomplete', null, pr.incomplete);
  if (pr.state === 'OPEN' && !pr.merged) return at('pr_open');
  if (pr.merged && target.found && target.state === 'OPEN' && pr.baseRefName !== pr.defaultBranch) {
    return at('open_after_non_default_base');
  }
  if (unread !== null) return at('incomplete', null, unread);
  if (target.state === 'CLOSED' && events.length === 0) return at('event_unsettled');
  if (!pr.merged) return at('pr_closed_unmerged', lastOf(events));
  if (target.state === 'OPEN') return at('still_open', lastOf(events));
  const last = lastOf(events);
  if (last?.closer?.type === 'PullRequest') return at('other_pr', last);
  if (last?.closer?.type === 'Commit') return at('other_commit', last);
  return at('no_closer', last);
}

const instrumentOf = (notes) => {
  const b = notes.baseline === NOT_CLOSING;
  const c = notes.candidate === NOT_CLOSING;
  return b && c ? 'both' : b ? 'baseline' : c ? 'candidate' : 'neither';
};

// The worksheet's lines, every ruling null. Refuses when closers.json does not hold exactly the
// index's closes advisories.
export function worksheetLines({ index, labels, closers }) {
  const expected = index.prs.flatMap((pr) =>
    pr.advisories.filter(isClosesRow).map((a) => a.advisoryId),
  );
  const got = closers.rows.map((r) => r.advisoryId);
  if (JSON.stringify(expected) !== JSON.stringify(got)) {
    throw new Error("closers.json's rows are not the index's closes advisories, in order");
  }
  const m2 = new Map(labels.filter((l) => l.measure === 'M2').map((l) => [l.advisoryId, l.label]));
  return closers.rows.map((row) => {
    const pr = closers.pullRequests[row.pullRequestRead];
    const target = closers.targets[row.targetRead];
    const { relation, event, reason } = closerRelation(row, pr, target);
    const baseIsDefault =
      pr.found && pr.defaultBranch !== null ? pr.baseRefName === pr.defaultBranch : null;
    const publishedLabel = m2.get(row.advisoryId) ?? null;
    return {
      pr: row.pr,
      advisoryId: row.advisoryId,
      instrument: instrumentOf(row.notes),
      notes: row.notes,
      target: target.found ? target.resolved : row.target,
      targetKind: !target.found
        ? null
        : target.typename === 'PullRequest'
          ? 'pullRequest'
          : 'issue',
      targetState: target.found ? target.state : null,
      closedAt: event?.createdAt ?? null,
      closedBy: event?.actor ?? null,
      closer: event?.closer ?? null,
      closerRelation: relation,
      section74: SECTION_74[relation],
      reason,
      baseIsDefault,
      merged: pr.found ? pr.merged : null,
      publishedLabel,
      needsRuling: publishedLabel !== null,
      ruling: null,
    };
  });
}

const LABEL_ROWS = [...LABELS.M2, null];
const labelName = (l) => l ?? '(none)';

function table(rows, lead) {
  const head = `| ${[...lead, ...RELATIONS, 'total'].join(' | ')} |`;
  const rule = `|${[...lead, ...RELATIONS, 'total'].map(() => '---').join('|')}|`;
  return [head, rule, ...rows].join('\n');
}

// worksheet.md: counts by closerRelation and publishedLabel, in total and per pull request.
export function summary(lines) {
  const count = (ls) => RELATIONS.map((r) => ls.filter((l) => l.closerRelation === r).length);
  const row = (cells, ls) => `| ${[...cells, ...count(ls), ls.length].join(' | ')} |`;
  const total = LABEL_ROWS.map((label) =>
    row(
      [labelName(label)],
      lines.filter((l) => l.publishedLabel === label),
    ),
  );
  total.push(row(['**all**'], lines));
  const prs = [...new Set(lines.map((l) => l.pr))];
  const perPr = prs.flatMap((pr) =>
    LABEL_ROWS.map((label) => [
      label,
      lines.filter((l) => l.pr === pr && l.publishedLabel === label),
    ])
      .filter(([, ls]) => ls.length > 0)
      .map(([label, ls]) => row([pr, labelName(label)], ls)),
  );
  return [
    '# Erratum 1 worksheet: summary',
    '',
    'Written by `tools/worksheet.mjs` from `closers.json`; the lines are in `worksheet.jsonl`. A',
    'published label of "(none)" is an advisory with no M2 label: its note was not `differs`, and it',
    'needs no ruling. Each relation is a row of spec 0.1.4 section 7.4 (see worksheet.mjs); its',
    "verdict under checker 0.1.7 is each line's `section74`.",
    '',
    '## In total',
    '',
    table(total, ['published label']),
    '',
    '## Per pull request',
    '',
    table(perPr, ['pull request', 'published label']),
    '',
  ].join('\n');
}

export function buildWorksheet({ p = paths() } = {}) {
  for (const path of [p.worksheetRows, p.worksheetTable]) {
    if (existsSync(path)) {
      throw new Error(
        `${relative(p.dir, path)} exists; a worksheet is never rebuilt over its rulings`,
      );
    }
  }
  if (!existsSync(p.closers))
    throw new Error('erratum-1/closers.json does not exist: run closers.mjs');
  const closers = readJson(p.closers);
  if (closers.inputs.index.sha256 !== sha256(readFileSync(p.index))) {
    throw new Error('runs/index.json is not the index closers.json read');
  }
  const lines = worksheetLines({
    index: readJson(p.index),
    labels: readJsonl(p.labelFile),
    closers,
  });
  writeJsonl(p.worksheetRows, lines);
  writeFileSync(p.worksheetTable, summary(lines));
  return lines;
}

if (isMain(import.meta.url)) {
  flags(process.argv.slice(2));
  const lines = buildWorksheet();
  const needs = lines.filter((l) => l.needsRuling).length;
  process.stdout.write(`${lines.length} line(s), ${needs} to rule\n`);
}

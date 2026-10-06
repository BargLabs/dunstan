// What the Action reports: the check-run conclusion for a verdict, and the claims table that is both
// the check run's summary and the job summary.
//
// GitHub lets a merge through on a required check whose conclusion is success, neutral or skipped.
// So only `pass` maps to success; `fail` and every error map to failure; `unverifiable` maps to
// failure unless the consumer chose `unverifiable-conclusion: neutral`.

import type { AdvisorySection } from '../advisory/advise.js';
import { precisionText } from '../advisory/precision.js';
import {
  advisoryLine,
  isPossibleDisagreement,
  noteText,
  POSSIBLE_DISAGREEMENT,
} from '../advisory/present.js';
import type { Claim, Verdict } from '../check/types.js';
import type { DunstanRecord } from '../record/build.js';
import type { UnverifiableConclusion } from './inputs.js';

export type Conclusion = 'success' | 'failure' | 'neutral';

export function conclusionFor(verdict: Verdict, unverifiable: UnverifiableConclusion): Conclusion {
  if (verdict === 'pass') return 'success';
  if (verdict === 'unverifiable') return unverifiable;
  return 'failure';
}

export interface Outcome {
  conclusion: Conclusion;
  // `error` when no record was written: an input, the event, a source or the Action itself failed.
  verdict: Verdict | 'error';
  title: string;
  record?: DunstanRecord;
  error?: string;
  // How the verdict maps to the conclusion, when the consumer's setting decided it.
  mapping?: string;
  rerun?: string[];
  notes: string[];
}

// The check-run summary is limited to 65,535 characters.
export const SUMMARY_LIMIT = 65_535;
const CELL_LIMIT = 160;
// Possible disagreements listed in the summary; past this the record holds the rest, so the claims
// table keeps its room under the size limit.
const ADVISORY_ROWS = 20;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/\r?\n/g, ' ');
}

// A JSON value in a table cell, as code, escaped so a declared value cannot break the table.
function code(value: unknown): string {
  if (value === undefined) return '';
  let text = JSON.stringify(value);
  if (text.length > CELL_LIMIT) text = `${text.slice(0, CELL_LIMIT - 1)}…`;
  return `<code>${escapeHtml(text)}</code>`;
}

// The title states the gate's verdict only. No advisory enters it (spec D.11.8, item 6).
export function titleFor(record: DunstanRecord): string {
  const p = record.predicate;
  if (p.block.status !== 'found') return `${p.verdict}: ${p.block.reason}`;
  const total = p.claims.length;
  if (p.verdict === 'pass') return `pass: ${total} of ${total} claims hold`;
  const open = p.claims.filter((c) => c.verdict !== 'pass');
  const reasons = [...new Set(open.map((c) => c.reason ?? ''))].join(', ');
  return `${p.verdict}: ${open.length} of ${total} claims (${reasons})`.slice(0, 250);
}

function claimRow(c: Claim): string {
  const verdict = c.verdict === 'pass' ? 'pass' : `**${c.verdict}**`;
  return `| <code>${escapeHtml(c.id)}</code> | ${code(c.declared)} | ${code(c.observed)} | ${verdict} | ${c.reason === undefined ? '' : `<code>${escapeHtml(c.reason)}</code>`} |`;
}

function blockLine(record: DunstanRecord): string {
  const b = record.predicate.block;
  if (b.status === 'found') return `found (sha256 <code>${b.sha256}</code>)`;
  if (b.status === 'ambiguous') return `ambiguous: <code>${b.reason}</code>, ${b.count} blocks`;
  if (b.status === 'invalid') {
    const codes = [...new Set(b.errors.map((e) => e.code))].join(', ');
    return `invalid: <code>${b.reason}</code> (${escapeHtml(codes)})`;
  }
  return `missing: <code>${b.reason}</code>`;
}

// The advisories section: the fixed line, with the figures when the record carries them, then each
// possible disagreement with what the record shows and the observed value. Agreements and
// unanswered advisories are counted in the head row only; every advisory is in the record.
function advisorySection(section: AdvisorySection): string[] {
  const shown = section.advisories.filter((a) => isPossibleDisagreement(a.note));
  const lines = ['### Advisories (DRAFT, not part of the verdict)', '', advisoryLine(section), ''];
  if (shown.length === 0) return lines;
  lines.push(
    '| Note | Kind | Value | Observed | Clause |',
    '| --- | --- | --- | --- | --- |',
    ...shown
      .slice(0, ADVISORY_ROWS)
      .map(
        (a) =>
          `| ${escapeHtml(noteText(a.note))} | <code>${a.kind}</code> | ${code(a.value)} | ${code(a.observed)} | ${code(a.clause)} |`,
      ),
  );
  if (shown.length > ADVISORY_ROWS) {
    lines.push('', `${shown.length - ADVISORY_ROWS} more are in the record.`);
  }
  return [...lines, ''];
}

// The markdown for the check-run summary and the job summary. Rows past the size limit are left out
// with a note; the record holds every row.
export function renderSummary(outcome: Outcome): string {
  const head = [`## dunstan: ${outcome.conclusion}`, ''];
  head.push(`**${escapeHtml(outcome.title)}**`, '');
  if (outcome.mapping !== undefined) head.push(outcome.mapping, '');

  const tail: string[] = [];
  const record = outcome.record;
  if (record === undefined) {
    head.push(
      `No record was written: ${escapeHtml(outcome.error ?? 'unknown error')}`,
      '',
      'A missing or unreadable report source, an event Dunstan cannot check, or a crash is reported as `failure`, never as a pass.',
      '',
    );
  } else {
    const p = record.predicate;
    head.push(
      '| | |',
      '| --- | --- |',
      `| Subject | ${escapeHtml(p.subject.repository)}#${p.subject.pullRequest} at <code>${p.subject.headSha}</code> |`,
      `| Report | ${p.report.source.kind} <code>${escapeHtml(p.report.source.locator)}</code> (sha256 <code>${p.report.sha256}</code>) |`,
      `| Block | ${blockLine(record)} |`,
      `| Verdict | <code>${p.verdict}</code> |`,
      `| Digests | claims <code>${p.digests.claims}</code>, evidence <code>${p.digests.evidence}</code> |`,
      `| Checker | ${p.checker.name} ${p.checker.version} (sha256 <code>${p.checker.digest.sha256}</code>) |`,
    );
    if (p.advisory !== undefined) {
      const notes = p.advisory.advisories.map((a) => a.note.split(':')[0]);
      const count = (n: string) => notes.filter((x) => x === n).length;
      head.push(
        `| Advisory (DRAFT, not part of the verdict) | ${notes.length} advisories: ${count('agrees')} agree; ${count('agrees_by_name')} agree by name only; ${count('differs')} ${POSSIBLE_DISAGREEMENT}; ${count('unanswered')} unanswered. Extractor ${escapeHtml(p.advisory.extractor.version)}, comparison ${escapeHtml(p.advisory.comparison.version)}, precision ${escapeHtml(precisionText(p.advisory.precision))}. Each is in the record. |`,
      );
      tail.push(...advisorySection(p.advisory));
    }
    head.push('');
    const unread = p.evidence.sources.filter((s) => s.error !== undefined);
    if (unread.length > 0) {
      tail.push(
        '### Unreadable sources',
        '',
        ...unread.map(
          (s) =>
            `- ${s.kind} <code>${escapeHtml(s.locator)}</code>: <code>${escapeHtml(s.error ?? '')}</code>`,
        ),
        '',
      );
    }
  }
  if (outcome.rerun !== undefined) {
    tail.push('### Re-run', '', '```sh', ...outcome.rerun, '```', '');
  }
  if (outcome.notes.length > 0) {
    tail.push('### Notes', '', ...outcome.notes.map((n) => `- ${n}`), '');
  }

  const claims = record?.predicate.claims ?? [];
  const tableHead =
    claims.length === 0
      ? []
      : [
          '### Claims',
          '',
          '| Claim | Declared | Observed | Verdict | Reason |',
          '| --- | --- | --- | --- | --- |',
        ];
  const fixed = [...head, ...tableHead, '', ...tail].join('\n').length + 200;
  const rows: string[] = [];
  let size = fixed;
  for (const [i, c] of claims.entries()) {
    const row = claimRow(c);
    if (size + row.length + 1 > SUMMARY_LIMIT) {
      rows.push('', `${claims.length - i} more rows are in the record (summary size limit).`);
      break;
    }
    rows.push(row);
    size += row.length + 1;
  }
  const table = claims.length === 0 ? [] : [...tableHead, ...rows, ''];
  return [...head, ...table, ...tail].join('\n');
}

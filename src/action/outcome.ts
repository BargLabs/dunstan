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

export const ARTIFACT_NAME = 'dunstan-record';

// The check-run summary is limited to 65,535 characters. GitHub rejects a completion past it, and the
// required check stays pending, so the limit is applied to the whole summary.
export const SUMMARY_LIMIT = 65_535;
// Each section after the claims is kept this much room before the claims take the rest.
const SECTION_SHARE = 8_192;
const CELL_LIMIT = 160;
const ERROR_LIMIT = 1_000;
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

// A section of the summary: its heading lines, one line per item, and the line that counts the items
// left out. Items are shown in order, up to `max`, while they fit.
interface Section {
  head: string[];
  items: string[];
  foot?: string[];
  max?: number;
  more: (omitted: number) => string;
}

function sizeOf(lines: readonly string[]): number {
  return lines.reduce((n, line) => n + line.length + 1, 0);
}

function sectionLines(s: Section, shown: number): string[] {
  const omitted = s.items.length - shown;
  return [
    ...s.head,
    ...s.items.slice(0, shown),
    ...(s.foot ?? []),
    ...(omitted > 0 ? ['', s.more(omitted)] : []),
    '',
  ];
}

// The least a section takes: its heading and the count of every item, none shown.
function leastOf(s: Section): number {
  return sizeOf(sectionLines(s, 0));
}

// The section in at most `budget` characters, or in its least when even that does not fit.
function fitSection(s: Section, budget: number): string[] {
  const max = Math.min(s.items.length, s.max ?? s.items.length);
  if (max === s.items.length) {
    const whole = sectionLines(s, max);
    if (sizeOf(whole) <= budget) return whole;
  }
  // The count line is held for the largest count, so a shorter one always fits.
  let size = leastOf(s);
  let shown = 0;
  while (shown < max && size + (s.items[shown]?.length ?? 0) + 1 <= budget) {
    size += (s.items[shown]?.length ?? 0) + 1;
    shown++;
  }
  return sectionLines(s, shown);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The advisories section: the fixed line, with the figures when the record carries them, then each
// possible disagreement with what the record shows and the observed value. Agreements and
// unanswered advisories are counted in the head row only; every advisory is in the record.
function advisorySection(section: AdvisorySection): Section {
  const shown = section.advisories.filter((a) => isPossibleDisagreement(a.note));
  const head = ['### Advisories (DRAFT, not part of the verdict)', '', advisoryLine(section)];
  if (shown.length > 0) {
    head.push('', '| Note | Kind | Value | Observed | Clause |', '| --- | --- | --- | --- | --- |');
  }
  return {
    head,
    items: shown.map(
      (a) =>
        `| ${escapeHtml(noteText(a.note))} | <code>${a.kind}</code> | ${code(a.value)} | ${code(a.observed)} | ${code(a.clause)} |`,
    ),
    max: ADVISORY_ROWS,
    more: (n) =>
      `${plural(n, 'more possible disagreement is', 'more possible disagreements are')} in the record.`,
  };
}

// The markdown for the check-run summary and the job summary, at most SUMMARY_LIMIT characters in
// all. The record pointer that closes it is held first, then the head; each section after the claims
// is kept up to SECTION_SHARE characters, the claims take what is left, and the sections after them
// take any room the claims leave, in order. A section that does not fit whole shows the items that
// fit and counts the rest; the record holds every claim, source and advisory, and the step log every
// note.
export function renderSummary(outcome: Outcome): string {
  const head = [`## dunstan: ${outcome.conclusion}`, ''];
  head.push(`**${escapeHtml(outcome.title)}**`, '');
  if (outcome.mapping !== undefined) head.push(outcome.mapping, '');

  const tail: Section[] = [];
  const record = outcome.record;
  if (record === undefined) {
    head.push(
      `No record was written: ${escapeHtml((outcome.error ?? 'unknown error').slice(0, ERROR_LIMIT))}`,
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
      tail.push(advisorySection(p.advisory));
    }
    head.push('');
    const unread = p.evidence.sources.filter((s) => s.error !== undefined);
    if (unread.length > 0) {
      tail.push({
        head: ['### Unreadable sources', ''],
        items: unread.map(
          (s) =>
            `- ${s.kind} <code>${escapeHtml(s.locator)}</code>: <code>${escapeHtml(s.error ?? '')}</code>`,
        ),
        more: (n) =>
          `${plural(n, 'more unreadable source is', 'more unreadable sources are')} in the record.`,
      });
    }
  }
  if (outcome.rerun !== undefined) {
    tail.push({
      head: ['### Re-run', '', '```sh'],
      items: outcome.rerun,
      foot: ['```'],
      more: (n) =>
        `${plural(n, 'more re-run line is', 'more re-run lines are')} left out; the record's \`rerun\` holds the commands.`,
    });
  }
  if (outcome.notes.length > 0) {
    tail.push({
      head: ['### Notes', ''],
      items: outcome.notes.map((n) => `- ${n}`),
      more: (n) => `${plural(n, 'more note is', 'more notes are')} in the step log.`,
    });
  }

  const claims = record?.predicate.claims ?? [];
  const table: Section | undefined =
    claims.length === 0
      ? undefined
      : {
          head: [
            '### Claims',
            '',
            '| Claim | Declared | Observed | Verdict | Reason |',
            '| --- | --- | --- | --- | --- |',
          ],
          items: claims.map(claimRow),
          more: (n) =>
            `${plural(n, 'more claim is', 'more claims are')} in the record (summary size limit).`,
        };
  // The record pointer closes the summary whatever else is left out.
  const closing =
    record === undefined
      ? []
      : outcome.error === undefined
        ? [
            `Every claim, source and advisory is in the record, the \`${ARTIFACT_NAME}\` artifact of this run.`,
          ]
        : [
            'Every claim, source and advisory is in the record, which was not uploaded: see the notes.',
          ];

  let left = SUMMARY_LIMIT - sizeOf(closing) - sizeOf(head);
  const kept = tail.map((s) => {
    const whole = sizeOf(sectionLines(s, Math.min(s.items.length, s.max ?? s.items.length)));
    return Math.max(leastOf(s), Math.min(whole, SECTION_SHARE));
  });
  left -= kept.reduce((a, b) => a + b, 0);
  const body: string[] = [];
  if (table !== undefined) {
    const lines = fitSection(table, left);
    body.push(...lines);
    left -= sizeOf(lines);
  }
  for (const [i, s] of tail.entries()) {
    const room = left + (kept[i] ?? 0);
    const lines = fitSection(s, room);
    body.push(...lines);
    left = room - sizeOf(lines);
  }
  return [...head, ...body, ...closing].join('\n');
}

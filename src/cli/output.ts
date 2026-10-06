// Shared CLI plumbing: the I/O the commands are given, exit codes, and the claims table.

import type { Readable, Writable } from 'node:stream';
import { precisionText } from '../advisory/precision.js';
import { advisoryLine, noteText } from '../advisory/present.js';
import type { Verdict } from '../check/types.js';
import type { GitHubClient } from '../evidence/http.js';
import type { EvidenceReaders } from '../pipeline/check-pull-request.js';
import type { DunstanRecord } from '../record/build.js';

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
  env: Record<string, string | undefined>;
  // The URL of the running checker artifact, whose digest the record carries.
  artifact: string;
  fetch?: typeof fetch;
  // Tests only: stands other readers in for GitHub's (the Action parity test).
  readers?: (client: GitHubClient) => EvidenceReaders;
  readStdin: () => Uint8Array;
  // The directory `dunstan template` runs git in; process.cwd() when absent.
  cwd?: string;
  // The streams `dunstan mcp` speaks the protocol on; process stdin and stdout when absent.
  stdin?: Readable;
  stdout?: Writable;
}

export const EXIT = { pass: 0, fail: 1, unverifiable: 2, error: 3 } as const;

export function exitFor(verdict: Verdict): number {
  return EXIT[verdict];
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

const WIDTH = 48;

function cell(value: unknown): string {
  if (value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > WIDTH ? `${text.slice(0, WIDTH - 1)}…` : text;
}

function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? [];
  return rows
    .map((r) =>
      r
        .map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

export function renderRecord(record: DunstanRecord): string {
  const p = record.predicate;
  const lines = [
    `${p.checker.name} ${p.checker.version}  ${p.subject.repository}#${p.subject.pullRequest}  head ${p.subject.headSha}`,
    `report: ${p.report.source.kind} ${p.report.source.locator} (sha256 ${p.report.sha256})`,
  ];
  const b = p.block;
  if (b.status === 'found') lines.push(`block: found (sha256 ${b.sha256})`);
  else if (b.status === 'ambiguous')
    lines.push(`block: ambiguous, ${b.count} handback blocks (${b.reason})`);
  else if (b.status === 'invalid') {
    const errors = b.errors.map((e) => [e.code, e.pointer, e.keyword].filter((x) => x).join(' '));
    lines.push(`block: invalid (${b.reason}: ${[...new Set(errors)].join('; ')})`);
  } else lines.push(`block: missing (${b.reason})`);

  if (p.claims.length > 0) {
    lines.push(
      '',
      table([
        ['VERDICT', 'CLAIM', 'DECLARED', 'OBSERVED', 'REASON'],
        ...p.claims.map((c) => [
          c.verdict,
          c.id,
          cell(c.declared),
          cell(c.observed),
          c.reason ?? '',
        ]),
      ]),
    );
  }
  const unread = p.evidence.sources.filter((s) => s.error !== undefined);
  if (unread.length > 0) {
    lines.push(
      '',
      'unreadable sources:',
      ...unread.map((s) => `  ${s.kind}  ${s.locator}  ${s.error}`),
    );
  }
  const a = p.advisory;
  if (a !== undefined) {
    lines.push(
      '',
      `advisory (DRAFT, not part of the verdict): extractor ${a.extractor.version}, comparison ${a.comparison.version}, precision ${precisionText(a.precision)}, ${a.advisories.length} advisories`,
      advisoryLine(a),
    );
    if (a.advisories.length > 0) {
      // A `differs` note is shown as a possible disagreement (src/advisory/present.ts); the record
      // keeps the note as written.
      lines.push(
        table([
          ['NOTE', 'KIND', 'VALUE', 'OBSERVED', 'CLAUSE'],
          ...a.advisories.map((x) => [
            noteText(x.note),
            x.kind,
            cell(x.value),
            cell(x.observed),
            cell(x.clause),
          ]),
        ]),
      );
    }
  }
  lines.push('', `verdict: ${p.verdict}`);
  return `${lines.join('\n')}\n`;
}

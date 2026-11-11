// Shared CLI plumbing: the I/O the commands are given, exit codes, and the claims table.

import type { Readable, Writable } from 'node:stream';
import { precisionText } from '../advisory/precision.js';
import { advisoryLine, noteText } from '../advisory/present.js';
import type { Verdict } from '../check/types.js';
import type { GitHubClient } from '../evidence/http.js';
import type { EvidenceReaders } from '../pipeline/check-pull-request.js';
import type { DunstanRecord } from '../record/build.js';
import { type RemedyContext, remedyFor } from '../remedy/remedies.js';

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
  // Tests only: the clock `dunstan survey` reads with, so two runs write the same bytes.
  now?: () => Date;
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

// The report's kind as the table prints it. A GitLab record keeps `pr-body` for a description
// report (profile G.2), and the table names it "merge request description"; every other kind, and
// every kind on a GitHub record, is printed as recorded.
function reportKindText(kind: string, gitlab: boolean): string {
  return gitlab && kind === 'pr-body' ? 'merge request description' : kind;
}

// `hasToken`: whether the record's reads were made with a token, and `caller`: who reads the table
// ('cli' here, 'mcp' for dunstan_check_handback), for the wording of a remedy line
// (src/remedy/remedies.ts). Each tests row the record could not settle for a reason a repository
// can act on is followed by one indented `remedy:` line; the record holds no remedy.
//
// A GitLab record (DRAFT GitLab profile 0.1, `subject.forge.kind` `gitlab`) is printed in GitLab's
// terms: its merge request is `<project>!<iid>`, since `#N` names an issue on GitLab. The record is
// unchanged; a GitHub record's table is byte-identical to before (src/cli/output.test.ts).
export function renderRecord(record: DunstanRecord, context: RemedyContext): string {
  const p = record.predicate;
  const gitlab = p.subject.forge?.kind === 'gitlab';
  const lines = [
    `${p.checker.name} ${p.checker.version}  ${p.subject.repository}${gitlab ? '!' : '#'}${p.subject.pullRequest}  head ${p.subject.headSha}`,
    `report: ${reportKindText(p.report.source.kind, gitlab)} ${p.report.source.locator} (sha256 ${p.report.sha256})`,
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
    const rows = table([
      ['VERDICT', 'CLAIM', 'DECLARED', 'OBSERVED', 'REASON'],
      ...p.claims.map((c) => [c.verdict, c.id, cell(c.declared), cell(c.observed), c.reason ?? '']),
    ]).split('\n');
    lines.push('', rows[0] as string);
    p.claims.forEach((c, i) => {
      lines.push(rows[i + 1] as string);
      const remedy = remedyFor(c, gitlab ? { ...context, forge: 'gitlab' } : context);
      if (remedy !== undefined) lines.push(`  remedy: ${remedy}`);
    });
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

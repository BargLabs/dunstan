// Context printed beside a verdict and never part of it (spec section 8.3, informative). It is worked
// out from the record's own evidence each time the record is printed; the record holds none of it.
//
// A pull request that changes a GitHub Actions workflow file. On `pull_request`,
// GitHub runs the workflows as the pull request has them, so such a pull request can change what
// its own check runs and test records show. Only the path is read, under `.github/workflows/`; no
// path is guessed to be a test (section 14). A GitLab record gets no flag: no rule names its CI
// configuration yet.
//
// With a baseline (DRAFT 0.2.0, D.13), each declared junit record's counts at the base commit and at
// the head, and a rise in skipped test cases or a fall in executed ones between them.

import type { CountedRuns, FileEntry, JunitRecord } from '../check/types.js';
import type { DunstanRecord } from '../record/build.js';

export const WORKFLOW_DIR = '.github/workflows/';

export type ContextFlag =
  // A changed-file entry whose path, or previous path, is under WORKFLOW_DIR.
  | { kind: 'workflow_changed'; entry: FileEntry }
  // The file list cannot show that no workflow changed: its reason, as the scope rows give it.
  | { kind: 'workflow_changes_unknown'; reason: string }
  // A baseline entry: each side's counts, or why it settles none.
  | { kind: 'baseline'; record: JunitRecord; baseSha: string | null; base: Side; head: Side }
  // Between a baseline entry's settled sides: more skipped, or fewer executed, at the head.
  | { kind: 'skipped_rose'; record: JunitRecord; base: number; head: number }
  | { kind: 'executed_fell'; record: JunitRecord; base: number; head: number };

type Counts = { executed: number; skipped: number; failed: number };
// A side's counts where its candidate runs agree, else the reason section 7.5 would give.
type Side = Counts | { reason: string };

function side(runs: CountedRuns): Side {
  if (runs.status === 'unreadable') return { reason: `source_unreadable:${runs.source}` };
  if (runs.status === 'unpopulated') return { reason: `evidence_field_unpopulated:${runs.field}` };
  const [first, ...rest] = runs.runs;
  if (first === undefined) return { reason: 'record_not_found' };
  const same = (r: Counts) =>
    r.executed === first.executed && r.skipped === first.skipped && r.failed === first.failed;
  if (!rest.every(same)) return { reason: 'record_ambiguous' };
  return { executed: first.executed, skipped: first.skipped, failed: first.failed };
}

function baselineFlags(record: DunstanRecord): ContextFlag[] {
  const baseline = record.predicate.evidence.baseline;
  if (baseline === undefined) return [];
  return baseline.testRecords.flatMap((t): ContextFlag[] => {
    const base = side(t.base);
    const head = side(t.head);
    const flags: ContextFlag[] = [
      { kind: 'baseline', record: t.record, baseSha: baseline.baseSha, base, head },
    ];
    if ('reason' in base || 'reason' in head) return flags;
    if (head.skipped > base.skipped) {
      flags.push({
        kind: 'skipped_rose',
        record: t.record,
        base: base.skipped,
        head: head.skipped,
      });
    }
    if (head.executed < base.executed) {
      flags.push({
        kind: 'executed_fell',
        record: t.record,
        base: base.executed,
        head: head.executed,
      });
    }
    return flags;
  });
}

const underWorkflows = (path: string | undefined) => path?.startsWith(WORKFLOW_DIR) === true;

export function contextFlags(record: DunstanRecord): ContextFlag[] {
  const p = record.predicate;
  if (p.subject.forge?.kind === 'gitlab' || p.block.status !== 'found') return [];
  const files = p.evidence.files;
  if (files === undefined) {
    return [{ kind: 'workflow_changes_unknown', reason: 'evidence_field_unpopulated:files' }];
  }
  if (files.status === 'unreadable') {
    return [{ kind: 'workflow_changes_unknown', reason: `source_unreadable:${files.source}` }];
  }
  if (files.status === 'unpopulated') {
    return [
      { kind: 'workflow_changes_unknown', reason: `evidence_field_unpopulated:${files.field}` },
    ];
  }
  const flags: ContextFlag[] = files.entries
    .filter((e) => underWorkflows(e.path) || underWorkflows(e.previousPath))
    .map((entry) => ({ kind: 'workflow_changed', entry }));
  if (!files.complete && flags.length === 0) {
    flags.push({ kind: 'workflow_changes_unknown', reason: 'file_list_truncated' });
  }
  return [...flags, ...baselineFlags(record)];
}

const sideText = (s: Side) =>
  'reason' in s
    ? `none settled (${s.reason})`
    : `${s.executed} executed, ${s.skipped} skipped, ${s.failed} failed`;

const recordName = (r: JunitRecord) => `${r.workflow} / ${r.job}`;

export function contextText(flag: ContextFlag): string {
  if (flag.kind === 'baseline') {
    const at = flag.baseSha === null ? 'base' : `base ${flag.baseSha.slice(0, 12)}`;
    return `tests in ${recordName(flag.record)}: at ${at}, ${sideText(flag.base)}; at head, ${sideText(flag.head)}`;
  }
  if (flag.kind === 'skipped_rose') {
    return `skipped tests rose from ${flag.base} at base to ${flag.head} at head in ${recordName(flag.record)}`;
  }
  if (flag.kind === 'executed_fell') {
    return `executed tests fell from ${flag.base} at base to ${flag.head} at head in ${recordName(flag.record)}`;
  }
  if (flag.kind === 'workflow_changes_unknown') {
    return `workflow changes unknown: the file list cannot show that no workflow changed (${flag.reason})`;
  }
  const e = flag.entry;
  const from = e.previousPath === undefined ? '' : ` from ${e.previousPath}`;
  return `workflow changed by this pull request: ${e.path} (${e.status}${from})`;
}

// dunstan suggest: the sentences in a report's prose that look like claims its block does not declare,
// for the author to declare or reword before handback. The advisory extractor (src/advisory/)
// proposes claims from the prose; each one whose kind and value the block does not declare becomes a
// suggestion. The extractor never reads a fenced block, so the handback fence itself is never read
// as prose.
//
// A suggestion is not a verdict. Nothing here passes or fails, nothing is compared with the record,
// and nothing is written to a record. It needs no pull request and makes no call: a pure function of
// the report text. The extractor's figure is read from precision.ts, never written here.

import { extractClaims, type ProposedClaim, type Span } from '../advisory/extract.js';
import { type AdvisoryKind, EXTRACTOR } from '../advisory/grammar.js';
import {
  PUBLISHED_PRECISION,
  type PublishedPrecision,
  precisionFor,
  precisionText,
} from '../advisory/precision.js';
import type { Block } from '../check/types.js';
import { type ExtractResult, extractHandbackBlock } from '../spec/extract.js';

export interface Suggestion {
  // The sentence the claim was read in, as written, whitespace collapsed.
  sentence: string;
  kind: AdvisoryKind;
  value: ProposedClaim['value'];
  // The block field that would declare it.
  field: string;
}

export interface SuggestResult {
  block: ExtractResult;
  suggestions: Suggestion[];
}

export const TEMPLATE_COMMAND = 'dunstan template';

const FIELD: Readonly<Record<AdvisoryKind, string>> = {
  file_changed: 'filesChanged',
  reference_closes: 'references, relation closes',
  commit: 'references, a commit with relation cites, or headCommit',
  head_commit: 'headCommit',
  checks_succeeded: 'checks.allSucceeded',
  check_count: 'checks.total',
  tests_passed: 'tests, failures',
  test_count: 'tests, count',
  merged_at: 'mergedAt',
};

// `#N` and `owner/repo#N` with the same N are taken as one reference: suggest has no subject to
// qualify `#N` with.
function sameIssue(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  return (x.startsWith('#') || y.startsWith('#')) && x.split('#')[1] === y.split('#')[1];
}

// The block declares the claim: the same kind of claim, with the same value.
export function declares(block: Block, claim: Pick<ProposedClaim, 'kind' | 'value'>): boolean {
  const v = claim.value;
  const references = block.references ?? [];
  const tests = block.tests ?? [];
  switch (claim.kind) {
    case 'file_changed':
      // Prose may name a file by its name or a partial path, as an advisory is matched (D.11.4).
      return (
        typeof v === 'string' && block.filesChanged.some((p) => p === v || p.endsWith(`/${v}`))
      );
    case 'reference_closes':
      return references.some(
        (r) =>
          'issue' in r && r.relation === 'closes' && typeof v === 'string' && sameIssue(r.issue, v),
      );
    case 'commit':
      // A SHA the head starts with names the head, as an advisory reads it.
      return (
        typeof v === 'string' &&
        (block.headCommit.startsWith(v) ||
          references.some((r) => 'commit' in r && r.commit.startsWith(v)))
      );
    case 'head_commit':
      return typeof v === 'string' && block.headCommit.startsWith(v);
    case 'checks_succeeded':
      return block.checks?.allSucceeded === v;
    case 'check_count':
      return block.checks?.total === v;
    case 'tests_passed':
      // Passing is declared as failures: 0 on every run; failing as failures above 0 on one.
      return v === true
        ? tests.length > 0 && tests.every((t) => t.failures === 0)
        : tests.some((t) => (t.failures ?? 0) > 0);
    case 'test_count':
      return tests.some((t) => t.count === v);
    case 'merged_at':
      return block.mergedAt === v;
  }
}

const BLOCK_START = /^[ \t]*(?:[-*+]|\d{1,3}[.)]|#{1,6}|\||>)[ \t]/;
const SENTENCE_END = /[.!?]["')\]*_`]*(?=\s|$)/g;

// The sentence around a span: within its paragraph or list item, from the end of the sentence before
// to the end of its own.
export function sentenceAt(report: string, span: Span): string {
  const lines = report.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const lineOf = (at: number) => {
    let i = 0;
    while (i + 1 < starts.length && (starts[i + 1] as number) <= at) i++;
    return i;
  };
  const blank = (i: number) => (lines[i] ?? '').trim() === '';
  let first = lineOf(span.start);
  while (first > 0 && !blank(first - 1) && !BLOCK_START.test(lines[first] ?? '')) first--;
  let last = lineOf(Math.max(span.start, span.end - 1));
  while (last + 1 < lines.length && !blank(last + 1) && !BLOCK_START.test(lines[last + 1] ?? '')) {
    last++;
  }
  const from = starts[first] as number;
  const to = (starts[last] as number) + (lines[last] as string).length;
  const unit = report.slice(from, to);

  let start = 0;
  let end = unit.length;
  for (const m of unit.matchAll(SENTENCE_END)) {
    const stop = m.index + m[0].length;
    if (from + stop <= span.start) start = stop;
    else if (from + m.index >= span.end - 1) {
      end = stop;
      break;
    }
  }
  const text = unit
    .slice(start, end)
    .replace(/^\s*(?:[-*+]|\d{1,3}[.)]|#{1,6}|>)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

export function suggestDeclarations(report: string): SuggestResult {
  const block = extractHandbackBlock(report);
  // A block that is not found declares nothing.
  const declared = block.status === 'found' ? (block.value as unknown as Block) : undefined;
  const suggestions = extractClaims(report)
    .filter((c) => declared === undefined || !declares(declared, c))
    .map((c) => ({
      sentence: sentenceAt(report, c.span),
      kind: c.kind,
      value: c.value,
      field: FIELD[c.kind],
    }));
  return { block, suggestions };
}

// The figure is whatever precision.ts publishes for the running extractor's digest: "unmeasured" until
// that very grammar is measured.
export function suggestionsLabel(
  published: readonly PublishedPrecision[] = PUBLISHED_PRECISION,
): string {
  const precision = precisionText(precisionFor(EXTRACTOR.digest.sha256, published));
  return `suggestions from the prose extractor (${EXTRACTOR.version}, precision ${precision})`;
}

function blockLine(block: ExtractResult): string[] {
  switch (block.status) {
    case 'found':
      return ['block: found'];
    case 'missing':
      return [
        'block: none in the report, so it declares nothing. Generate one from git, then add your test and reference claims:',
        `  ${TEMPLATE_COMMAND}`,
      ];
    case 'ambiguous':
      return [
        `block: ${block.count} dunstan-handback blocks, so it declares nothing; the gate reads this as unverifiable. Keep one.`,
      ];
    case 'invalid':
      return [
        `block: invalid (${[...new Set(block.errors.map((e) => e.code))].join(', ')}), so it declares nothing; the gate reads this as unverifiable. Regenerate it with:`,
        `  ${TEMPLATE_COMMAND}`,
      ];
  }
}

// The text `dunstan suggest` prints and the MCP tool returns: the same bytes on both.
export function renderSuggestions(result: SuggestResult): string {
  const lines = [
    suggestionsLabel(),
    'Not a verdict: nothing here passes or fails, and nothing is written to a record.',
    ...blockLine(result.block),
    '',
  ];
  const n = result.suggestions.length;
  if (n === 0) {
    lines.push(
      'The prose appears to make no claim the block does not declare. That is not a check of the prose: the extractor proposes only what its grammar binds.',
    );
  } else {
    lines.push(
      `The prose appears to make ${n === 1 ? '1 claim' : `${n} claims`} the block does not declare:`,
    );
    result.suggestions.forEach((s, i) => {
      lines.push(
        '',
        `${i + 1}. ${s.sentence}`,
        `   ${s.kind} ${JSON.stringify(s.value)} (block field: ${s.field})`,
        '   - declare it in the block',
        '   - reword it if it is not a claim about this PR',
      );
    });
  }
  return `${lines.join('\n')}\n`;
}

export function suggestText(report: string): string {
  return renderSuggestions(suggestDeclarations(report));
}

// A `differs` note is shown as a possible disagreement, unverified. Presentation only: this file
// pins that no record field and no schema moved with the wording. The measured figures were then
// published (2026-10-05): the advisory section gained the figure fields and the fixed line
// states them, and nothing else in the record moved.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD, REPO } from '../__tests__/fake-github.js';
import { renderSummary, titleFor } from '../action/outcome.js';
import type { Evidence } from '../check/types.js';
import { renderRecord } from '../cli/output.js';
import { handbackResult } from '../mcp/server.js';
import { buildRecord, recordBlock, serializeRecord } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { sha256Canonical } from '../spec/jcs.js';
import type { JsonValue } from '../spec/json.js';
import { validateDraftRecord } from '../spec/schema.js';
import { COMPARISON_VERSION } from './advise.js';
import { extractClaims } from './extract.js';
import { EXTRACTOR } from './grammar.js';
import { differsAccuracyFor, precisionFor } from './precision.js';
import {
  ADVISORY_LINE,
  advisoryLine,
  isPossibleDisagreement,
  noteText,
  POSSIBLE_DISAGREEMENT,
  RECORD_SHOWS,
} from './present.js';

const OLD_WORDING = /differs|mismatch|false claim/i;
// The grammar the published figures were measured on. The extractor that runs is 0.1.3 (0.1.2
// before it, and 0.1.4 reverted to it), and no figure is published for it.
const EXTRACTOR_0_1_1 = 'ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360';
// The comparison the published differs figure was measured on. The one that runs is 0.3.0.
const COMPARISON_0_2_0 = '0.2.0';

describe('the words a reader is shown for a note', () => {
  it('shows each differs reason as a possible disagreement and what the record shows', () => {
    // Every fail reason of spec section 16 that an advisory's gate check can give.
    expect(Object.keys(RECORD_SHOWS).sort()).toEqual(
      [
        'all_succeeded_mismatch',
        'count_mismatch',
        'declared_not_changed',
        'head_mismatch',
        'not_closing',
        'not_found',
        'not_merged',
        'not_reachable',
        'premature',
      ].sort(),
    );
    for (const [reason, shows] of Object.entries(RECORD_SHOWS)) {
      const text = noteText(`differs:${reason}`);
      expect(text).toBe(`${POSSIBLE_DISAGREEMENT}: ${shows}`);
      expect(text).not.toMatch(OLD_WORDING);
      expect(text).not.toMatch(/wrong|false|lie|incorrect/i);
    }
    expect(noteText('differs:a_reason_not_yet_written')).toBe(
      'possible disagreement, unverified: see the record',
    );
  });

  it('shows every other note as written', () => {
    for (const note of [
      'agrees',
      'agrees_by_name',
      'unanswered:ambiguous_path',
      'unanswered:evidence_field_unpopulated:closingIssuesReferences',
    ]) {
      expect(noteText(note)).toBe(note);
      expect(isPossibleDisagreement(note)).toBe(false);
    }
    expect(isPossibleDisagreement('differs:declared_not_changed')).toBe(true);
  });

  it('the fixed line for a record with no figure states no figure', () => {
    expect(ADVISORY_LINE).toBe(
      'Advisories never affect the verdict. A possible disagreement is unverified: on the reports measured so far it usually reflected a misread of the report, not a false claim.',
    );
    expect(ADVISORY_LINE).not.toMatch(/[0-9%]/);
  });

  it('the fixed line for a record with the published figures states them', () => {
    const figures = {
      precision: precisionFor(EXTRACTOR_0_1_1),
      differsAccuracy: differsAccuracyFor(EXTRACTOR_0_1_1, COMPARISON_0_2_0),
    };
    expect(advisoryLine(figures)).toBe(FIGURES_LINE);
    // A later extractor or comparison finds no figure, and the line falls back to ADVISORY_LINE.
    expect(advisoryLine({ ...figures, precision: null })).toBe(ADVISORY_LINE);
    expect(advisoryLine({ ...figures, differsAccuracy: null })).toBe(ADVISORY_LINE);
    expect(advisoryLine({ precision: null, differsAccuracy: null })).toBe(ADVISORY_LINE);
    // "None was a false claim" is said only of a base rate of zero.
    const d = figures.differsAccuracy;
    if (d === null) throw new Error('fixture');
    expect(
      advisoryLine({
        ...figures,
        differsAccuracy: { ...d, baseRate: { ...d.baseRate, value: 0.02 } },
      }),
    ).toBe(ADVISORY_LINE);
  });
});

// The exact wording published with the figures, filled from them.
const FIGURES_LINE =
  'Advisories never affect the verdict. Extraction precision 0.80 (24/30, 95% CI 0.63–0.90). A possible disagreement is unverified: on 170 of our own agent PRs, 0 of 20 marked a false claim, and of the 44 advisories the record could check there, none was a false claim (0 of 44).';

// ---------------------------------------------------------------- the record does not change

// The schemas as they stood before the presentation change, but for the DRAFT 0.2.0 schema, which
// gained the figure fields of the advisory section when the figures were published, and a reader
// claim's retrieval arm "A-fill" with its k when filling to k became the default; and but for the
// reason `closing_link_unsettled` of spec 0.1.2, which the 0.1 record schema's claim reason and the
// DRAFT schema's advisory note both gained; and but for comparison 0.3.0, for which the DRAFT
// schema's advisory section gained `pathsAtHead` and its note the three existence notes. A change
// to any of them is a record change.
const SCHEMA_SHA256: Record<string, string> = {
  'handback-block-0.1.schema.json':
    '331d142be28bf7c9deac7f76cad83731bf00679b952418004270c70344db46a7',
  'record-0.1.schema.json': 'ac398929b30ae0bcaa22298d03a0af0a78af84844223626ccc8bf79bcfcb5e26',
  'record-0.2-draft.schema.json':
    '1b4b0075a2aee668f9689cf5852705c3bdc0707ad28c361b0a60b3846982b22c',
};

const evidence: Evidence = {
  pullRequest: {
    status: 'ok',
    number: 7,
    state: 'closed',
    merged: true,
    mergedAt: '2026-10-01T12:00:00Z',
    headSha: HEAD,
    mergeSha: 'feedface00000000000000000000000000000001',
    changedFiles: 2,
  },
  files: {
    status: 'ok',
    complete: true,
    entries: [
      { path: 'src/a.ts', status: 'modified' },
      { path: 'pkg/b.ts', status: 'modified' },
    ],
  },
  closingReferences: { status: 'ok', issues: [`${REPO}#12`] },
  references: [{ kind: 'issue', ref: `${REPO}#13`, status: 'ok', exists: true }],
  checkRuns: {
    status: 'ok',
    commit: HEAD,
    excludedIds: [],
    runs: [
      { id: 1, name: 'lint', status: 'completed', conclusion: 'success' },
      { id: 2, name: 'test', status: 'completed', conclusion: 'failure' },
    ],
  },
  sources: [],
};

const REPORT = [
  'I changed src/a.ts, `b.ts` and src/z.ts. Closes #12 and fixes #13.',
  'The head is now 9e8d7c6. All 3 checks pass. It was merged at 2026-10-01T11:00:00Z.',
  '',
  `\`\`\`dunstan-handback\n${JSON.stringify({ dunstan: '0.1', headCommit: HEAD, filesChanged: ['src/a.ts', 'pkg/b.ts'] })}\n\`\`\``,
  '',
].join('\n');

function build() {
  return buildRecord({
    checker: { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: '0'.repeat(64) } },
    report: { sha256: '1'.repeat(64), source: { kind: 'stdin', locator: '-' } },
    block: recordBlock(extractHandbackBlock(REPORT)),
    repository: REPO,
    evidence,
    rerun: { offline: 'dunstan verify r.json', online: 'dunstan rerun r.json' },
    advisory: extractClaims(REPORT),
    // src/z.ts is a file at the head that the pull request did not change (comparison 0.3.0).
    pathsAtHead: [{ path: 'src/z.ts', status: 'ok', object: 'Blob' }],
  });
}

describe('the record does not change, but for the figure fields', () => {
  it('leaves every schema byte for byte as it was', () => {
    const dir = join(import.meta.dirname, '..', '..', 'spec', 'schema');
    const actual = Object.fromEntries(
      readdirSync(dir)
        .sort()
        .map((f) => [
          f,
          createHash('sha256')
            .update(readFileSync(join(dir, f)))
            .digest('hex'),
        ]),
    );
    expect(actual).toEqual(SCHEMA_SHA256);
  });

  it('keeps the notes, the comparison and the extractor, and every digest of a record', () => {
    const record = build();
    const a = record.predicate.advisory;
    expect(a?.comparison).toEqual({ version: '0.3.0' });
    expect(COMPARISON_VERSION).toBe('0.3.0');
    expect(a?.pathsAtHead).toEqual([{ path: 'src/z.ts', status: 'ok', object: 'Blob' }]);
    expect(a?.extractor).toEqual(EXTRACTOR);
    expect(EXTRACTOR.version).toBe('0.1.3');
    expect(a?.advisories.map((x) => [x.kind, x.value, x.observed, x.note])).toEqual([
      ['file_changed', 'src/a.ts', 'src/a.ts', 'agrees'],
      ['file_changed', 'b.ts', 'pkg/b.ts', 'agrees_by_name'],
      ['file_changed', 'src/z.ts', null, 'differs:declared_not_changed'],
      ['reference_closes', '#12', { closing: [`${REPO}#12`] }, 'agrees'],
      ['reference_closes', '#13', { closing: [`${REPO}#12`] }, 'differs:not_closing'],
      ['head_commit', '9e8d7c6', HEAD, 'differs:head_mismatch'],
      ['checks_succeeded', true, false, 'differs:all_succeeded_mismatch'],
      ['check_count', 3, 2, 'differs:count_mismatch'],
      ['merged_at', '2026-10-01T11:00:00Z', '2026-10-01T12:00:00Z', 'differs:premature'],
    ]);
    // Pinned. A digest that moves is a record that changed. The claims and evidence digests are as
    // they were before the presentation change; the advisory digest moved when the section gained
    // the published figures, and again when the extractor became 0.1.2, 0.1.3 and 0.1.4: each names
    // a new grammar with no figure published. 0.1.4 was reverted, and the digest was 0.1.3's
    // again, 4abc9677…; then comparison 0.3.0 named itself and recorded the answer for src/z.ts.
    expect(record.predicate.digests).toEqual({
      claims: '56cccb4067679d0c95cf609ad87d9ea8eae7198b330baaa9cc0babeb0991b576',
      evidence: '9ff3e3e482ccf21a30847863450476e0594d137006dca39b29f77d543b656951',
      advisory: '455e8b97ca3106ed49d07ee8101a81ffe9abbf616e6c8da96654548732d33282',
    });
    // Named as extractor 0.1.1 and comparison 0.2.0, with their figures and without the answers
    // 0.3.0 records, the section is byte for byte the one pinned when the figures were published:
    // extractors 0.1.2, 0.1.3 and 0.1.4 changed the extractor's identity and figures here, and
    // comparison 0.3.0 its identity and the answers, and no advisory of this report.
    if (a === undefined) throw new Error('fixture');
    const { pathsAtHead: _answers, ...section } = a;
    const as011 = {
      ...section,
      extractor: { version: '0.1.1', digest: { sha256: EXTRACTOR_0_1_1 } },
      comparison: { version: COMPARISON_0_2_0 },
      precision: precisionFor(EXTRACTOR_0_1_1),
      differsAccuracy: differsAccuracyFor(EXTRACTOR_0_1_1, COMPARISON_0_2_0),
    };
    expect(sha256Canonical(as011 as unknown as JsonValue)).toBe(
      'd0c343cfdb569d526fd162ea22444626db57bef3d212cf750020ed4a11f6c6ec',
    );
    // Without the figure fields, that section is byte for byte the one pinned when the wording
    // changed.
    const { precision: _, differsAccuracy: __, ...rest } = as011;
    expect(sha256Canonical({ ...rest, precision: null } as unknown as JsonValue)).toBe(
      '55947784a54d3a9323b7946c69ad3f7bc8a302fe8ba3663e54564e9192dba999',
    );
    const parsed = JSON.parse(serializeRecord(record));
    expect(validateDraftRecord(parsed)).toEqual([]);
    expect(verifyRecord(parsed).problems).toEqual([]);
  });

  it('no surface changes a byte of the record it shows', () => {
    const record = build();
    const before = serializeRecord(record);
    renderRecord(record);
    renderSummary({
      conclusion: 'success',
      verdict: record.predicate.verdict,
      title: titleFor(record),
      record,
      notes: [],
    });
    const response = handbackResult(record, undefined, []);
    expect(serializeRecord(record)).toBe(before);
    const last = response.content.at(-1);
    expect(last?.type === 'text' ? last.text : '').toBe(before);
  });

  it('every surface words each differs note as a possible disagreement, beside the line with the figures', () => {
    // A record written by extractor 0.1.1, which carries the figures published for it. Extractors
    // 0.1.2, 0.1.3 and 0.1.4 have none: the next test.
    const record = build();
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    a.extractor = { version: '0.1.1', digest: { sha256: EXTRACTOR_0_1_1 } };
    a.comparison = { version: COMPARISON_0_2_0 };
    a.precision = precisionFor(EXTRACTOR_0_1_1);
    a.differsAccuracy = differsAccuracyFor(EXTRACTOR_0_1_1, COMPARISON_0_2_0);
    const surfaces = surfacesOf(record);
    for (const [name, text] of Object.entries(surfaces)) {
      expect(text.replaceAll(FIGURES_LINE, ''), name).not.toMatch(OLD_WORDING);
      if (name === 'title') continue;
      expect(text, name).toContain(POSSIBLE_DISAGREEMENT);
      expect(text.split(FIGURES_LINE), name).toHaveLength(2);
      expect(text, name).not.toContain(ADVISORY_LINE);
      for (const shows of [
        'not among the changed files',
        'not among the closing references',
        'the head is another commit',
        'the check runs read otherwise',
        'the record holds another count',
        'the recorded merge time is later',
      ]) {
        expect(text, name).toContain(`${POSSIBLE_DISAGREEMENT}: ${shows}`);
      }
    }
    expect(surfaces.title).toBe('pass: 3 of 3 claims hold');
  });

  it('every surface falls back to the line with no figure for a record that carries none', () => {
    // A record from a later extractor or comparison, which no published figure is bound to. That
    // includes the extractor that runs, 0.1.3; a later one, 9.9.9, is the same.
    for (const extractor of [EXTRACTOR, { version: '9.9.9', digest: { sha256: 'f'.repeat(64) } }]) {
      const record = build();
      const a = record.predicate.advisory;
      if (a === undefined) throw new Error('fixture');
      a.extractor = extractor;
      a.precision = precisionFor(a.extractor.digest.sha256);
      a.differsAccuracy = differsAccuracyFor(a.extractor.digest.sha256, a.comparison.version);
      expect([a.precision, a.differsAccuracy]).toEqual([null, null]);
      fallsBack(record);
    }
  });
});

function fallsBack(record: ReturnType<typeof build>): void {
  for (const [name, text] of Object.entries(surfacesOf(record))) {
    expect(text, name).not.toContain(FIGURES_LINE);
    expect(text, name).not.toMatch(/0\.80|24\/30|of 44/);
    if (name === 'title') continue;
    expect(text.split(ADVISORY_LINE), name).toHaveLength(2);
  }
}

function surfacesOf(record: ReturnType<typeof build>): Record<string, string> {
  const summary = renderSummary({
    conclusion: 'success',
    verdict: record.predicate.verdict,
    title: titleFor(record),
    record,
    notes: [],
  });
  const response = handbackResult(record, undefined, []).content.map((c) =>
    c.type === 'text' ? c.text : '',
  );
  return {
    cli: renderRecord(record),
    title: titleFor(record),
    summary,
    mcp: response.slice(0, -1).join('\n'),
  };
}

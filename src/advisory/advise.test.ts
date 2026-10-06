import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  basePullRequest,
  fakeGitHub,
  HEAD,
  REPO,
  type Scenario,
} from '../__tests__/fake-github.js';
import { checkScope } from '../check/checks.js';
import type { Block, Evidence } from '../check/types.js';
import { main } from '../cli/main.js';
import { buildRecord, type DunstanRecord, recordBlock, serializeRecord } from '../record/build.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';
import { checkReaderClaim } from '../retrieval/reader-claims.js';
import { BM25_FLOOR } from '../retrieval/retrieve.js';
import { DRAFT_PREDICATE_TYPE, PREDICATE_TYPE } from '../spec/constants.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { DRAFT_RECORD_SCHEMA_FILE, readSchema, validateDraftRecord } from '../spec/schema.js';
import {
  type Advisory,
  adviseClaims,
  COMPARISON,
  COMPARISON_VERSION,
  compareAdvisory,
  readingBlock,
} from './advise.js';
import { extractClaims, type ProposedClaim } from './extract.js';
import { ADVISORY_KINDS, EXTRACTOR, EXTRACTOR_VERSION, GRAMMAR } from './grammar.js';
import {
  differsAccuracyFor,
  PUBLISHED_DIFFERS_ACCURACY,
  PUBLISHED_PRECISION,
  precisionFor,
  precisionText,
} from './precision.js';
import { ADVISORY_LINE, advisoryLine } from './present.js';

const OTHER = '0123456789abcdef0123456789abcdef01234567';
// The grammar the published figures were measured on, the one before this, and the one that runs
// now (0.1.3).
const EXTRACTOR_0_1_1 = 'ab77ce47d1c5172ec912d1221e03bbe5b312ff5dc2acb594c4b8549fe602c360';
const EXTRACTOR_0_1_2 = 'dfd6563a934667a80448e49b7133ade6d2473e5e13cd9d05fd52c761a1a1780b';
const EXTRACTOR_0_1_3 = '2f9a1ed7f03e1ff68c8f719fcafc10c39b580abb1a9e9bdb268f9f5b38a14c37';

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
      { path: 'src/b.ts', status: 'renamed', previousPath: 'src/old.ts' },
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
      { id: 2, name: 'test', status: 'completed', conclusion: 'success' },
      { id: 3, name: 'typecheck', status: 'completed', conclusion: 'success' },
    ],
  },
  sources: [],
};

const note = (kind: Advisory['kind'], value: Advisory['value'], e: Evidence = evidence) =>
  compareAdvisory({ kind, value }, e, REPO);

describe('compareAdvisory: the gate check for each kind', () => {
  it('file_changed is the scope check of one declared path', () => {
    expect(note('file_changed', 'src/a.ts')).toEqual({ observed: 'src/a.ts', note: 'agrees' });
    expect(note('file_changed', 'src/old.ts')).toEqual({ observed: 'src/b.ts', note: 'agrees' });
    expect(note('file_changed', 'src/z.ts')).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
    const files = evidence.files as Extract<Evidence['files'], { status: 'ok' }>;
    expect(
      note('file_changed', 'src/z.ts', { ...evidence, files: { ...files, complete: false } }),
    ).toEqual({ observed: null, note: 'unanswered:file_list_truncated' });
  });

  it('reference_closes is the closes check', () => {
    expect(note('reference_closes', '#12').note).toBe('agrees');
    expect(note('reference_closes', `${REPO}#12`).note).toBe('agrees');
    expect(note('reference_closes', '#13').note).toBe('differs:not_closing');
  });

  it('reference_closes on an open pull request is unanswered, never differs (spec 0.1.2)', () => {
    const open: Evidence = {
      ...evidence,
      pullRequest: { ...evidence.pullRequest, state: 'open', merged: false, mergedAt: null },
    };
    expect(note('reference_closes', '#12', open).note).toBe('agrees');
    expect(note('reference_closes', '#13', open)).toEqual({
      observed: null,
      note: 'unanswered:closing_link_unsettled',
    });
  });

  it('commit and head_commit read the head, or a cited commit', () => {
    expect(note('commit', HEAD.slice(0, 8))).toEqual({ observed: HEAD, note: 'agrees' });
    expect(note('head_commit', HEAD.slice(0, 10))).toEqual({ observed: HEAD, note: 'agrees' });
    expect(note('head_commit', '9e8d7c6')).toEqual({
      observed: HEAD,
      note: 'differs:head_mismatch',
    });
    // A short SHA that is not the head names no record field.
    expect(note('commit', '9e8d7c6').note).toBe('unanswered:no_comparable_record_field');
    expect(note('commit', OTHER).note).toBe('unanswered:evidence_field_unpopulated:references');
    const cited: Evidence = {
      ...evidence,
      references: [
        { kind: 'commit', ref: OTHER, status: 'ok', exists: true, reachableFromHead: true },
      ],
    };
    expect(note('commit', OTHER, cited).note).toBe('agrees');
  });

  it('checks_succeeded and check_count are the 7.5 checks rules', () => {
    expect(note('checks_succeeded', true)).toEqual({ observed: true, note: 'agrees' });
    expect(note('checks_succeeded', false)).toEqual({
      observed: true,
      note: 'differs:all_succeeded_mismatch',
    });
    expect(note('check_count', 3)).toEqual({ observed: 3, note: 'agrees' });
    expect(note('check_count', 5)).toEqual({ observed: 3, note: 'differs:count_mismatch' });
    const { checkRuns: _, ...unread } = evidence;
    expect(note('checks_succeeded', true, unread).note).toBe(
      'unanswered:evidence_field_unpopulated:checkRuns',
    );
  });

  it('merged_at is the 7.6 time check', () => {
    expect(note('merged_at', '2026-10-01T12:00:00Z').note).toBe('agrees');
    expect(note('merged_at', '2026-10-01T11:59:59Z').note).toBe('differs:premature');
    const open = { ...evidence.pullRequest, merged: false, mergedAt: null, state: 'open' as const };
    expect(note('merged_at', '2026-10-01T12:00:00Z', { ...evidence, pullRequest: open }).note).toBe(
      'differs:not_merged',
    );
  });

  it('tests_passed has no record field to meet', () => {
    expect(note('tests_passed', true)).toEqual({
      observed: null,
      note: 'unanswered:no_comparable_record_field',
    });
  });
});

// A changed-file list of these paths, read in full.
const changed = (paths: string[], complete = true): Evidence => ({
  ...evidence,
  pullRequest: { ...evidence.pullRequest, changedFiles: paths.length },
  files: { status: 'ok', complete, entries: paths.map((path) => ({ path, status: 'modified' })) },
});

describe('a file named by a bare name or a partial path (comparison 0.2.0)', () => {
  const tool = changed(['docs/guide.md', 'packages/tool/src/cli.ts', 'packages/tool/src/run.ts']);

  it('one changed path with that last segment: agrees_by_name, observed the full path', () => {
    expect(note('file_changed', 'cli.ts', tool)).toEqual({
      observed: 'packages/tool/src/cli.ts',
      note: 'agrees_by_name',
    });
    // A bare name at the root is matched by name too, never read as a root path.
    expect(note('file_changed', 'cli.ts', changed(['cli.ts', 'docs/guide.md']))).toEqual({
      observed: 'cli.ts',
      note: 'agrees_by_name',
    });
  });

  it('two changed paths with that last segment: unanswered:ambiguous_path, listing both', () => {
    const two = changed(['packages/web/index.ts', 'apps/api/index.ts', 'docs/guide.md']);
    expect(note('file_changed', 'index.ts', two)).toEqual({
      observed: ['apps/api/index.ts', 'packages/web/index.ts'],
      note: 'unanswered:ambiguous_path',
    });
    // The root file is a candidate like any other.
    expect(note('file_changed', 'cli.ts', changed(['cli.ts', 'packages/tool/src/cli.ts']))).toEqual(
      {
        observed: ['cli.ts', 'packages/tool/src/cli.ts'],
        note: 'unanswered:ambiguous_path',
      },
    );
  });

  it('no changed path with that last segment: differs:declared_not_changed', () => {
    expect(note('file_changed', 'main.ts', tool)).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
    // A name that is only the end of a segment is not that segment.
    expect(note('file_changed', 'li.ts', tool)).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
  });

  it('a partial path that is a suffix of one changed path on segment boundaries: agrees_by_name', () => {
    expect(note('file_changed', 'src/cli.ts', tool)).toEqual({
      observed: 'packages/tool/src/cli.ts',
      note: 'agrees_by_name',
    });
    expect(note('file_changed', 'tool/src/cli.ts', tool)).toEqual({
      observed: 'packages/tool/src/cli.ts',
      note: 'agrees_by_name',
    });
    const two = changed(['packages/a/src/cli.ts', 'packages/b/src/cli.ts']);
    expect(note('file_changed', 'src/cli.ts', two)).toEqual({
      observed: ['packages/a/src/cli.ts', 'packages/b/src/cli.ts'],
      note: 'unanswered:ambiguous_path',
    });
  });

  it('a path that is a changed path keeps the exact comparison: agrees, not by name', () => {
    const both = changed(['src/cli.ts', 'packages/tool/src/cli.ts']);
    expect(note('file_changed', 'src/cli.ts', both)).toEqual({
      observed: 'src/cli.ts',
      note: 'agrees',
    });
    expect(note('file_changed', 'packages/tool/src/cli.ts', tool)).toEqual({
      observed: 'packages/tool/src/cli.ts',
      note: 'agrees',
    });
  });

  it('a partial path that matches only inside a segment: differs', () => {
    expect(note('file_changed', 'ab/cli.ts', changed(['xab/cli.ts']))).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
    expect(note('file_changed', 'ol/src/cli.ts', tool)).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
  });

  it('is case-sensitive', () => {
    expect(note('file_changed', 'CLI.ts', tool)).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
    expect(note('file_changed', 'readme.md', changed(['docs/README.md']))).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
    expect(note('file_changed', 'Src/cli.ts', tool)).toEqual({
      observed: null,
      note: 'differs:declared_not_changed',
    });
  });

  it('a rename is matched by either name, observed at its current path', () => {
    const renamed: Evidence = {
      ...evidence,
      files: {
        status: 'ok',
        complete: true,
        entries: [
          { path: 'packages/tool/src/cli.ts', status: 'renamed', previousPath: 'tool/cli.ts' },
          { path: 'packages/tool/src/main.ts', status: 'renamed', previousPath: 'src/entry.ts' },
        ],
      },
    };
    expect(note('file_changed', 'cli.ts', renamed)).toEqual({
      observed: 'packages/tool/src/cli.ts',
      note: 'agrees_by_name',
    });
    expect(note('file_changed', 'entry.ts', renamed)).toEqual({
      observed: 'packages/tool/src/main.ts',
      note: 'agrees_by_name',
    });
  });

  it('a file list not read in full never gives differs, nor a name match', () => {
    const truncated = changed(['packages/tool/src/cli.ts'], false);
    expect(note('file_changed', 'cli.ts', truncated)).toEqual({
      observed: null,
      note: 'unanswered:file_list_truncated',
    });
    expect(note('file_changed', 'main.ts', truncated)).toEqual({
      observed: null,
      note: 'unanswered:file_list_truncated',
    });
    expect(note('file_changed', 'ab/cli.ts', truncated)).toEqual({
      observed: null,
      note: 'unanswered:file_list_truncated',
    });
    const unreadable: Evidence = {
      ...evidence,
      files: { status: 'unreadable', source: 'pull_request_files' },
    };
    expect(note('file_changed', 'cli.ts', unreadable)).toEqual({
      observed: null,
      note: 'unanswered:source_unreadable:pull_request_files',
    });
    const { files: _, ...unread } = evidence;
    expect(note('file_changed', 'cli.ts', unread)).toEqual({
      observed: null,
      note: 'unanswered:evidence_field_unpopulated:files',
    });
  });

  it("the gate's scope check still fails a bare name: the spec requires repository paths", () => {
    const bare: Block = { dunstan: '0.1', headCommit: HEAD, filesChanged: ['cli.ts'] };
    expect(checkScope(bare, tool)[0]).toMatchObject({
      field: '/filesChanged/0',
      declared: 'cli.ts',
      observed: null,
      verdict: 'fail',
      reason: 'declared_not_changed',
    });
    const record = build(
      `I added the command to \`cli.ts\`.\n\n${block(['cli.ts', 'docs/guide.md', 'packages/tool/src/run.ts'])}`,
      true,
      tool,
    );
    expect(record.predicate.verdict).toBe('fail');
    expect(record.predicate.claims.find((c) => c.declared === 'cli.ts')).toMatchObject({
      verdict: 'fail',
      reason: 'declared_not_changed',
    });
    // The advisory beside it reads the same name by name, and the verdict is unmoved.
    expect(record.predicate.advisory?.advisories.map((a) => [a.value, a.observed, a.note])).toEqual(
      [['cli.ts', 'packages/tool/src/cli.ts', 'agrees_by_name']],
    );
  });

  it("retrieval's file check still needs the exact path", () => {
    const candidates = [
      { type: 'file' as const, id: 'packages/tool/src/cli.ts', score: null, matchedField: 'path' },
    ];
    const retrieval = { floor: BM25_FLOOR };
    expect(
      checkReaderClaim(
        { kind: 'file_changed', declaredValue: 'cli.ts', candidates, retrieval },
        tool,
        REPO,
      ),
    ).toMatchObject({ verdict: 'unverifiable', reason: 'declared_item_not_among_candidates' });
  });

  // Comparison 0.2.0 left the grammar at 0.1.1. Extractors 0.1.2 and then 0.1.3 changed it later.
  it('is extractor 0.1.3; the comparison left 0.1.1 as it was', () => {
    expect(EXTRACTOR_VERSION).toBe('0.1.3');
    expect(EXTRACTOR).toEqual({ version: '0.1.3', digest: { sha256: EXTRACTOR_0_1_3 } });
    expect(EXTRACTOR.digest.sha256).not.toBe(EXTRACTOR_0_1_2);
  });

  it('is comparison 0.2.0, the version the accuracy of differs notes was measured on', () => {
    expect(COMPARISON_VERSION).toBe('0.2.0');
    expect(COMPARISON).toEqual({ version: '0.2.0' });
    expect(differsAccuracyFor(EXTRACTOR_0_1_1, COMPARISON_VERSION)).not.toBeNull();
    expect(differsAccuracyFor(EXTRACTOR_0_1_1, '0.1.0')).toBeNull();
    // Measured with extractor 0.1.1 only: 0.1.2 and 0.1.3 are unmeasured.
    expect(differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON_VERSION)).toBeNull();
  });
});

describe('false-positive class: #N checked against a field that was never populated', () => {
  it('is unanswered, never differs, when the closing references were not read', () => {
    const { closingReferences: _, references: __, ...unpopulated } = evidence;
    expect(note('reference_closes', '#12', unpopulated)).toEqual({
      observed: null,
      note: 'unanswered:evidence_field_unpopulated:closingReferences',
    });
    const unreadable: Evidence = {
      ...evidence,
      closingReferences: { status: 'unreadable', source: 'closing_references' },
    };
    expect(note('reference_closes', '#12', unreadable).note).toBe(
      'unanswered:source_unreadable:closing_references',
    );
    const unpopulatedField: Evidence = {
      ...evidence,
      closingReferences: { status: 'unpopulated', field: 'closingIssuesReferences' },
    };
    expect(note('reference_closes', '#12', unpopulatedField).note).toBe(
      'unanswered:evidence_field_unpopulated:closingIssuesReferences',
    );
  });

  it('is unanswered when an issue missing from the closing list was not read one by one', () => {
    const { references: _, ...noReferences } = evidence;
    expect(note('reference_closes', '#99', noReferences).note).toBe(
      'unanswered:evidence_field_unpopulated:references',
    );
  });
});

describe('false-positive class: test counts compared with check-run counts', () => {
  it('a test count equal to the number of check runs does not agree, and one unequal does not differ', () => {
    // Three check runs: a prose test count of 3 or 42 is never compared with them.
    expect(note('test_count', 3)).toEqual({
      observed: null,
      note: 'unanswered:no_comparable_record_field',
    });
    expect(note('test_count', 42)).toEqual({
      observed: null,
      note: 'unanswered:no_comparable_record_field',
    });
    const advisories = adviseClaims(extractClaims('All 42 tests pass.'), evidence, REPO);
    expect(advisories.map((a) => a.note)).toEqual([
      'unanswered:no_comparable_record_field',
      'unanswered:no_comparable_record_field',
    ]);
  });
});

describe('advisories are never fail', () => {
  const values: Record<string, Advisory['value'][]> = {
    file_changed: ['src/a.ts', 'src/z.ts'],
    reference_closes: ['#12', '#13', '#99'],
    commit: [HEAD.slice(0, 7), '9e8d7c6', OTHER],
    head_commit: [HEAD, '9e8d7c6'],
    checks_succeeded: [true, false],
    check_count: [3, 4],
    tests_passed: [true, false],
    test_count: [0, 3],
    merged_at: ['2026-10-01T12:00:00Z', '2020-01-01T00:00:00Z'],
  };

  it('carries a note, no verdict, for every kind and outcome', () => {
    expect(Object.keys(values).sort()).toEqual([...ADVISORY_KINDS].sort());
    const { closingReferences: _, checkRuns: __, files: ___, ...bare } = evidence;
    for (const e of [evidence, bare]) {
      for (const [kind, vs] of Object.entries(values)) {
        for (const value of vs) {
          const proposed: ProposedClaim = {
            clause: 'x',
            verb: 'x',
            kind: kind as Advisory['kind'],
            value,
            span: { start: 0, end: 1 },
          };
          const [advisory] = adviseClaims([proposed], e, REPO);
          expect(advisory).not.toHaveProperty('verdict');
          expect(Object.keys(advisory ?? {}).sort()).toEqual([
            'clause',
            'kind',
            'note',
            'observed',
            'value',
          ]);
          expect(advisory?.note).toMatch(
            /^(?:agrees|agrees_by_name|differs:[a-z_]+|unanswered:[a-z_]+(?::[A-Za-z0-9_.]+)?)$/,
          );
          expect(advisory?.note).not.toMatch(/fail$|^fail|pass/);
        }
      }
    }
  });

  it('keeps one advisory per distinct claim, #N and owner/repo#N being one', () => {
    const advisories = adviseClaims(
      extractClaims(`Closes #12. Also closes ${REPO}#12 and fixes #13.`),
      evidence,
      REPO,
    );
    expect(advisories.map((a) => a.value)).toEqual(['#12', '#13']);
  });

  it('an empty list means nothing was proposed', () => {
    expect(adviseClaims(extractClaims('All done.'), evidence, REPO)).toEqual([]);
  });
});

describe('readingBlock', () => {
  const proposed = (text: string) => extractClaims(text);
  const block: Block = {
    dunstan: '0.1',
    headCommit: HEAD,
    filesChanged: ['src/a.ts'],
    references: [{ issue: '#5', relation: 'cites' }],
  };

  it('is null when the report has no block and no claim needs more than the pull request', () => {
    expect(readingBlock(null, [], HEAD)).toBeNull();
    expect(
      readingBlock(null, proposed('Tests pass. Merged at 2026-10-01T12:00:00Z.'), HEAD),
    ).toBeNull();
  });

  it('asks for the files, the closing references, a cited commit and the check runs the claims need', () => {
    const reading = readingBlock(
      null,
      proposed(`I changed src/a.ts. Closes #12. Pushed ${OTHER}. CI is green.`),
      HEAD,
    );
    expect(reading).toEqual({
      dunstan: '0.1',
      headCommit: HEAD,
      filesChanged: [],
      references: [
        { issue: '#12', relation: 'closes' },
        { commit: OTHER, relation: 'cites' },
      ],
      checks: {},
    });
  });

  it("keeps the report's own block and adds to it", () => {
    const reading = readingBlock(block, proposed('Closes #12. CI is green.'), HEAD);
    expect(reading).toEqual({
      ...block,
      references: [
        { issue: '#5', relation: 'cites' },
        { issue: '#12', relation: 'closes' },
      ],
      checks: {},
    });
    expect(readingBlock(block, [], HEAD)).toEqual(block);
    expect(block.checks).toBeUndefined();
  });
});

// The binding of each published figure to what it measured is tested in precision.test.ts.
describe('precision', () => {
  it('the extractor digest covers the grammar', () => {
    expect(EXTRACTOR.version).toBe(GRAMMAR.version);
    expect(EXTRACTOR.digest.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------- the record

const block = (files: string[]) =>
  `\`\`\`dunstan-handback\n${JSON.stringify({ dunstan: '0.1', headCommit: HEAD, filesChanged: files })}\n\`\`\`\n`;

const PROSE = [
  'I changed src/a.ts and src/z.ts. Closes #12, fixes #13 and closes #99.',
  `Pushed ${HEAD.slice(0, 8)}; the head is now 9e8d7c6. All 4 checks pass.`,
  'All 42 tests pass. It was merged at 2026-10-01T11:00:00Z.',
].join('\n\n');

function build(report: string, advisory: boolean, e: Evidence = evidence): DunstanRecord {
  return buildRecord({
    checker: { name: CHECKER_NAME, version: CHECKER_VERSION, digest: { sha256: '0'.repeat(64) } },
    report: { sha256: '1'.repeat(64), source: { kind: 'stdin', locator: '-' } },
    block: recordBlock(extractHandbackBlock(report)),
    repository: REPO,
    evidence: e,
    rerun: { offline: 'dunstan verify r.json', online: 'dunstan rerun r.json' },
    ...(advisory ? { advisory: extractClaims(report) } : {}),
  });
}

// Extractors 0.1.2's and 0.1.3's figures on constructed reports (docs/advisory.md, "Extractor 0.1.2
// on constructed reports" and "Extractor 0.1.3 on constructed reports") are published in the doc
// only. No record carries them: they are not in the tables precisionFor and differsAccuracyFor read,
// and no source file that writes a record holds them.
describe('the constructed-report figures are never carried in a record', () => {
  // The shares and counts the doc publishes, and their Wilson bounds: for 0.1.2, recall 180 of 380
  // and differs precision 180 of 215; for 0.1.3, recall 280 of 380 and differs precision 280 of 315.
  const CONSTRUCTED = [
    ...[/\b0\.47[34]/, /\b0\.83[67]/, /\b0\.42[34]/, /\b0\.52[34]/, /\b0\.78[12]/],
    ...[/\b0\.73[67]/, /\b0\.690/, /\b0\.77[89]/, /\b0\.88[89]/, /\b0\.849/, /\b0\.919/],
  ];
  const COUNTS: [number, number][] = [
    [180, 380],
    [180, 215],
    [280, 380],
    [280, 315],
    [1, 50],
  ];
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...sources(path));
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(path);
    }
    return out;
  }

  it('the tables a record reads hold no figure for extractor 0.1.2 or 0.1.3, nor the constructed counts', () => {
    expect(PUBLISHED_PRECISION.map((p) => p.extractorDigest)).toEqual([EXTRACTOR_0_1_1]);
    expect(PUBLISHED_DIFFERS_ACCURACY.map((p) => p.extractorDigest)).toEqual([EXTRACTOR_0_1_1]);
    for (const digest of [EXTRACTOR_0_1_2, EXTRACTOR_0_1_3]) {
      expect(precisionFor(digest)).toBeNull();
      expect(differsAccuracyFor(digest, COMPARISON_VERSION)).toBeNull();
    }
    const figures = [
      ...PUBLISHED_PRECISION.map((p) => p.precision),
      ...PUBLISHED_DIFFERS_ACCURACY.flatMap((p) => [p.differsAccuracy, p.differsAccuracy.baseRate]),
    ];
    for (const f of figures) {
      expect(COUNTS).not.toContainEqual([Math.round(f.value * f.n), f.n]);
    }
  });

  it('a record the running extractor writes carries null for both figures', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    expect(record.predicate.advisory?.extractor.version).toBe(EXTRACTOR_VERSION);
    expect(record.predicate.advisory?.precision).toBeNull();
    expect(record.predicate.advisory?.differsAccuracy).toBeNull();
  });

  it('no source file that can write a record holds the constructed figures', () => {
    const files = [...sources('src'), ...sources('hosted/src')];
    expect(files).toContain('src/advisory/precision.ts');
    for (const file of files) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const figure of CONSTRUCTED)
        expect(`${file}: ${figure.test(text)}`).toBe(`${file}: false`);
    }
  });
});

describe('a record with an advisory section (DRAFT 0.2.0)', () => {
  it('can never alter the verdict or the claims', () => {
    const reports = [
      PROSE,
      `${PROSE}\n\n${block(['src/a.ts', 'src/b.ts'])}`,
      `${PROSE}\n\n${block(['src/a.ts'])}`,
      `All done, CI is green.\n\n${block(['src/a.ts', 'src/b.ts'])}`,
      `${block(['src/a.ts'])}\n${block(['src/b.ts'])}`,
      '```dunstan-handback\n{"dunstan":"0.1"}\n```\nCI is green.',
      '',
    ];
    const { checkRuns: _, ...noChecks } = evidence;
    for (const report of reports) {
      for (const e of [evidence, noChecks]) {
        const plain = build(report, false, e);
        const advised = build(report, true, e);
        expect(plain.predicateType).toBe(PREDICATE_TYPE);
        expect(advised.predicateType).toBe(DRAFT_PREDICATE_TYPE);
        expect(advised.predicate.verdict).toBe(plain.predicate.verdict);
        expect(advised.predicate.claims).toEqual(plain.predicate.claims);
        expect(advised.predicate.digests.claims).toBe(plain.predicate.digests.claims);
        expect(advised.predicate.digests.evidence).toBe(plain.predicate.digests.evidence);
        expect(advised.subject).toEqual(plain.subject);
        // Nothing an advisory says reaches a claim row.
        const rows = JSON.stringify(advised.predicate.claims);
        for (const a of advised.predicate.advisory?.advisories ?? []) {
          expect(rows).not.toContain(a.note);
        }
      }
    }
  });

  it('a report with no block stays unverifiable, whatever its advisories say', () => {
    const record = build('I changed src/a.ts. CI is green. Closes #12.', true);
    expect(record.predicate.advisory?.advisories.map((a) => a.note)).toEqual([
      'agrees',
      'agrees',
      'agrees',
    ]);
    expect(record.predicate.verdict).toBe('unverifiable');
    expect(record.predicate.claims).toEqual([]);
  });

  it('a passing block stays pass, whatever its advisories say', () => {
    const record = build(`${PROSE}\n\n${block(['src/a.ts', 'src/b.ts'])}`, true);
    expect(record.predicate.verdict).toBe('pass');
    expect(record.predicate.advisory?.advisories.some((a) => a.note.startsWith('differs:'))).toBe(
      true,
    );
  });

  it('carries the extractor, the comparison, the figures published for both and one advisory per claim, and validates', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory;
    expect(a?.extractor).toEqual(EXTRACTOR);
    expect(a?.comparison).toEqual({ version: COMPARISON_VERSION });
    expect(a?.precision).toEqual(precisionFor(EXTRACTOR.digest.sha256));
    expect(a?.differsAccuracy).toEqual(
      differsAccuracyFor(EXTRACTOR.digest.sha256, COMPARISON_VERSION),
    );
    // None is published for extractor 0.1.2 or 0.1.3: both are unmeasured.
    expect(a?.precision).toBeNull();
    expect(a?.differsAccuracy).toBeNull();
    expect(a?.advisories.map((x) => [x.kind, x.value, x.note])).toEqual([
      ['file_changed', 'src/a.ts', 'agrees'],
      ['file_changed', 'src/z.ts', 'differs:declared_not_changed'],
      ['reference_closes', '#12', 'agrees'],
      ['reference_closes', '#13', 'differs:not_closing'],
      ['reference_closes', '#99', 'unanswered:evidence_field_unpopulated:references'],
      ['commit', HEAD.slice(0, 8), 'agrees'],
      ['head_commit', '9e8d7c6', 'differs:head_mismatch'],
      ['checks_succeeded', true, 'agrees'],
      ['check_count', 4, 'differs:count_mismatch'],
      ['tests_passed', true, 'unanswered:no_comparable_record_field'],
      ['test_count', 42, 'unanswered:no_comparable_record_field'],
      ['merged_at', '2026-10-01T11:00:00Z', 'differs:premature'],
    ]);
    expect(record.predicate.digests.advisory).toMatch(/^[0-9a-f]{64}$/);
    expect(validateDraftRecord(record)).toEqual([]);
    expect(verifyRecord(record).problems).toEqual([]);
  });

  it('validates with a closes advisory on an open pull request (spec 0.1.2)', () => {
    const open: Evidence = {
      ...evidence,
      pullRequest: { ...evidence.pullRequest, state: 'open', merged: false, mergedAt: null },
    };
    const record = JSON.parse(JSON.stringify(build('Fixes #13.', true, open))) as DunstanRecord;
    expect(record.predicate.advisory?.advisories.map((a) => a.note)).toEqual([
      'unanswered:closing_link_unsettled',
    ]);
    expect(validateDraftRecord(record)).toEqual([]);
    expect(verifyRecord(record).problems).toEqual([]);
  });

  it('records an empty section when the extractor proposed nothing', () => {
    const record = build('Done.', true);
    expect(record.predicate.advisory?.advisories).toEqual([]);
    expect(validateDraftRecord(JSON.parse(JSON.stringify(record)))).toEqual([]);
  });

  it('verify recomputes each note, the figures and the digest, and names what moved', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    (a.advisories[1] as Advisory).note = 'agrees';
    const precision = precisionFor(EXTRACTOR_0_1_1);
    const differs = differsAccuracyFor(EXTRACTOR_0_1_1, COMPARISON_VERSION);
    if (precision === null || differs === null) throw new Error('fixture');
    a.precision = { ...precision, value: 0.99, n: 1000 };
    a.differsAccuracy = { ...differs, baseRate: { ...differs.baseRate, n: 9 } };
    const members = verifyRecord(record).problems.map((p) => p.member);
    expect(members).toContain('/predicate/advisory/advisories/1');
    expect(members).toContain('/predicate/advisory/precision');
    expect(members).toContain('/predicate/advisory/differsAccuracy');
    expect(members).toContain('/predicate/digests/advisory');
  });

  // Before extractor 0.1.2 this was "a figure the record leaves out where one is published". 0.1.2
  // and 0.1.3 have none published, so the case to name is the other one: a record that carries
  // 0.1.1's figures for the extractor that runs. No version inherits a figure.
  it('verify names a figure the record carries where none is published', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    expect(verifyRecord(record).problems).toEqual([]);
    a.precision = precisionFor(EXTRACTOR_0_1_1);
    a.differsAccuracy = differsAccuracyFor(EXTRACTOR_0_1_1, COMPARISON_VERSION);
    expect(validateDraftRecord(record)).toEqual([]);
    expect(verifyRecord(record).problems.map((p) => p.member)).toEqual([
      '/predicate/advisory/precision',
      '/predicate/advisory/differsAccuracy',
      '/predicate/digests/advisory',
    ]);
  });

  it('the schema needs the differs figure and its base rate, and takes no row or label', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory as unknown as Record<string, Record<string, unknown>>;
    // The figures published for 0.1.1, carried here only to put a figure's shape to the schema.
    a.precision = precisionFor(EXTRACTOR_0_1_1) as unknown as Record<string, unknown>;
    a.differsAccuracy = differsAccuracyFor(
      EXTRACTOR_0_1_1,
      COMPARISON_VERSION,
    ) as unknown as Record<string, unknown>;
    const differs = a.differsAccuracy as Record<string, unknown>;
    const { baseRate: _, ...noBaseRate } = differs;
    a.differsAccuracy = noBaseRate;
    expect(validateDraftRecord(record).map((e) => e.pointer)).toContain(
      '/predicate/advisory/differsAccuracy',
    );
    a.differsAccuracy = differs;
    (a.precision as Record<string, unknown>).rows = [{ clause: 'I changed src/a.ts.', real: true }];
    (a.precision as Record<string, unknown>).baseRate = differs.baseRate;
    expect(validateDraftRecord(record).map((e) => e.pointer)).toContain(
      '/predicate/advisory/precision',
    );
    delete (a as Record<string, unknown>).differsAccuracy;
    expect(validateDraftRecord(record).map((e) => e.pointer)).toContain('/predicate/advisory');
  });

  it('verify names an extractor that is not this one', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    a.extractor = { version: '9.9.9', digest: { sha256: 'f'.repeat(64) } };
    expect(verifyRecord(record).problems.map((p) => p.member)).toContain(
      '/predicate/advisory/extractor',
    );
  });

  it('verify names a comparison that is not this one', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    a.comparison = { version: '0.1.0' };
    expect(verifyRecord(record).problems.map((p) => p.member)).toEqual([
      '/predicate/advisory/comparison',
      '/predicate/digests/advisory',
    ]);
  });

  it('verify recomputes a name match, and the schema takes both new notes and needs the comparison', () => {
    const tool = changed([
      'packages/web/index.ts',
      'apps/api/index.ts',
      'packages/tool/src/cli.ts',
    ]);
    const record = JSON.parse(
      JSON.stringify(build('I updated `cli.ts` and `index.ts`.', true, tool)),
    ) as DunstanRecord;
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    expect(a.advisories.map((x) => [x.value, x.observed, x.note])).toEqual([
      ['cli.ts', 'packages/tool/src/cli.ts', 'agrees_by_name'],
      ['index.ts', ['apps/api/index.ts', 'packages/web/index.ts'], 'unanswered:ambiguous_path'],
    ]);
    expect(validateDraftRecord(record)).toEqual([]);
    expect(verifyRecord(record).problems).toEqual([]);
    // A name match recorded as a plain agrees is named.
    (a.advisories[0] as Advisory).note = 'agrees';
    expect(verifyRecord(record).problems.map((p) => p.member)).toContain(
      '/predicate/advisory/advisories/0',
    );
    delete (a as unknown as Record<string, unknown>).comparison;
    expect(validateDraftRecord(record).map((e) => e.pointer)).toContain('/predicate/advisory');
  });

  it('the schema refuses an advisory with a verdict, a fail note or a value of the wrong type', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    const a = record.predicate.advisory;
    if (a === undefined) throw new Error('fixture');
    (a.advisories[0] as unknown as Record<string, unknown>).verdict = 'fail';
    (a.advisories[1] as Advisory).note = 'fail';
    (a.advisories[2] as Advisory).value = 12;
    const pointers = validateDraftRecord(record).map((e) => e.pointer);
    expect(pointers).toContain('/predicate/advisory/advisories/0');
    expect(pointers).toContain('/predicate/advisory/advisories/1/note');
    expect(pointers).toContain('/predicate/advisory/advisories/2/value');
  });

  it('the draft schema lists exactly the kinds the extractor proposes', () => {
    const draft = readSchema(DRAFT_RECORD_SCHEMA_FILE) as {
      $defs: { advisoryItem: { properties: { kind: { enum: string[] } } } };
    };
    expect(draft.$defs.advisoryItem.properties.kind.enum).toEqual([...ADVISORY_KINDS]);
  });

  it('the schema requires the advisory digest beside the section', () => {
    const record = JSON.parse(JSON.stringify(build(PROSE, true))) as DunstanRecord;
    delete record.predicate.digests.advisory;
    expect(validateDraftRecord(record).map((e) => e.pointer)).toContain('/predicate/digests');
  });
});

// ---------------------------------------------------------------- the command line

function scenario(body: string): Scenario {
  return {
    pr: basePullRequest({ body }),
    files: [
      { filename: 'src/a.ts', status: 'modified' },
      { filename: 'src/b.ts', status: 'added' },
    ],
    closing: [`${REPO}#12`],
    checkRuns: [
      { id: 11, name: 'lint', status: 'completed', conclusion: 'success' },
      { id: 12, name: 'test', status: 'completed', conclusion: 'failure' },
    ],
  };
}

async function check(body: string, flags: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'dunstan-advisory-'));
  try {
    const out = join(dir, 'r.json');
    let text = '';
    const fake = fakeGitHub(scenario(body));
    const io = {
      out: (t: string) => {
        text += t;
      },
      err: (t: string) => {
        text += t;
      },
      env: { GITHUB_TOKEN: 'test-token' },
      artifact: import.meta.url,
      fetch: fake.fetch,
      readStdin: () => new Uint8Array(),
    };
    const code = await main(
      ['check', '--repo', REPO, '--pr', '7', '--report-pr-body', '--out', out, ...flags],
      io,
    );
    const record = JSON.parse(readFileSync(out, 'utf8')) as DunstanRecord;
    let verified: number | undefined;
    if (record.predicateType === DRAFT_PREDICATE_TYPE) {
      writeFileSync(out, serializeRecord(record));
      verified = await main(['verify', out], { ...io, out: () => {}, err: () => {} });
    }
    return { code, text, record, requests: fake.requests, verified };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dunstan check --advisory', () => {
  const body = `I changed src/a.ts and src/c.ts. Closes #12. CI is green.\n\n${block(['src/a.ts', 'src/b.ts'])}`;

  it('is off by default: the record is 0.1, exactly as before', async () => {
    const r = await check(body, []);
    expect(r.record.predicateType).toBe(PREDICATE_TYPE);
    expect(r.record.predicate).not.toHaveProperty('advisory');
    expect(r.text).not.toContain('advisory (DRAFT');
  });

  it('adds the advisory section, reads what it needs, keeps the verdict and exit code, and verifies', async () => {
    const plain = await check(body, []);
    const advised = await check(body, ['--advisory']);
    expect(advised.code).toBe(plain.code);
    expect(advised.record.predicate.verdict).toBe(plain.record.predicate.verdict);
    expect(advised.record.predicate.claims).toEqual(plain.record.predicate.claims);
    expect(advised.record.predicate.advisory?.advisories.map((a) => [a.value, a.note])).toEqual([
      ['src/a.ts', 'agrees'],
      ['src/c.ts', 'differs:declared_not_changed'],
      ['#12', 'agrees'],
      [true, 'differs:all_succeeded_mismatch'],
    ]);
    // The block asked for no checks; the advisory did, so the check runs were read.
    expect(plain.requests.some((q) => q.includes('/check-runs'))).toBe(false);
    expect(advised.requests.some((q) => q.includes('/check-runs'))).toBe(true);
    expect(advised.text).toContain(
      `precision ${precisionText(precisionFor(EXTRACTOR.digest.sha256))}`,
    );
    expect(advised.text).toMatch(
      /possible disagreement, unverified: not among the changed files\s+file_changed\s+src\/c\.ts\s+null/,
    );
    expect(advised.text.trimEnd().split('\n').at(-2)).toMatch(/^verdict: pass$/);
    expect(advised.verified).toBe(0);
  });

  it('shows a differs note as a possible disagreement, unverified, beside the fixed line', async () => {
    const plain = await check(body, []);
    const advised = await check(body, ['--advisory']);
    // The record keeps the notes as written; only the printed words change.
    expect(advised.record.predicate.advisory?.advisories.map((a) => a.note)).toContain(
      'differs:declared_not_changed',
    );
    expect(advised.text).toContain('possible disagreement, unverified');
    expect(advised.text).toMatch(
      /possible disagreement, unverified: the check runs read otherwise\s+checks_succeeded\s+true\s+false/,
    );
    const lines = advised.text.split('\n');
    const header = lines.findIndex((l) => l.startsWith('advisory (DRAFT'));
    // Extractor 0.1.3 is unmeasured, as 0.1.2 was, so the fixed line states no figure.
    const section = advised.record.predicate.advisory;
    if (section === undefined) throw new Error('fixture');
    const line = advisoryLine(section);
    expect(line).toBe(ADVISORY_LINE);
    expect(lines[header + 1]).toBe(line);
    expect(lines[header + 2]).toMatch(/^NOTE\s+KIND/);
    expect(advised.text.split(line)).toHaveLength(2);
    expect(plain.text).not.toContain(line);
    // The fixed line itself says "false claim"; outside it, no word of the old wording.
    expect(advised.text.replaceAll(line, '')).not.toMatch(/differs|mismatch|false claim/i);
  });

  it('with no block, reads the evidence the advisories need and stays unverifiable', async () => {
    const r = await check('I changed src/a.ts. Closes #12. CI is green.', ['--advisory']);
    expect(r.code).toBe(2);
    expect(r.record.predicate.verdict).toBe('unverifiable');
    expect(r.record.predicate.advisory?.advisories.map((a) => a.note)).toEqual([
      'agrees',
      'agrees',
      'differs:all_succeeded_mismatch',
    ]);
    expect(r.verified).toBe(0);
  });

  it('with no block and nothing to read, reads only the pull request', async () => {
    const r = await check('All done.', ['--advisory']);
    expect(r.requests).toEqual([`GET /repos/${REPO}/pulls/7`]);
    expect(r.record.predicate.advisory?.advisories).toEqual([]);
  });
});

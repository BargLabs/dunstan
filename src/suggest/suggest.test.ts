import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD } from '../__tests__/fake-github.js';
import { EXTRACTOR } from '../advisory/grammar.js';
import { PUBLISHED_PRECISION, precisionFor } from '../advisory/precision.js';
import type { Block, TestRun } from '../check/types.js';
import { main } from '../cli/main.js';
import {
  declares,
  renderSuggestions,
  suggestDeclarations,
  suggestionsLabel,
  suggestText,
} from './suggest.js';

const fence = (block: object) => `\`\`\`dunstan-handback\n${JSON.stringify(block)}\n\`\`\`\n`;
const BLOCK: Block = {
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: ['src/a.ts'],
  references: [{ issue: '#12', relation: 'closes' }],
};
const PROSE = 'Updated src/a.ts and docs/guide.md. Fixes #12. All 42 tests pass.\n\n';
const REPORT = `${PROSE}${fence(BLOCK)}`;

const HEADER = [
  'suggestions from the prose extractor (0.1.4, precision unmeasured)',
  'Not a verdict: nothing here passes or fails, and nothing is written to a record.',
];
const NONE =
  'The prose appears to make no claim the block does not declare. That is not a check of the prose: the extractor proposes only what its grammar binds.';
const choices = [
  '   - declare it in the block',
  '   - reword it if it is not a claim about this PR',
];

describe('dunstan suggest', () => {
  it('lists each undeclared claim with its sentence, kind, value and the two choices', () => {
    expect(suggestText(REPORT)).toBe(
      [
        ...HEADER,
        'block: found',
        '',
        'The prose appears to make 3 claims the block does not declare:',
        '',
        '1. Updated src/a.ts and docs/guide.md.',
        '   file_changed "docs/guide.md" (block field: filesChanged)',
        ...choices,
        '',
        '2. All 42 tests pass.',
        '   tests_passed true (block field: tests, failures)',
        ...choices,
        '',
        '3. All 42 tests pass.',
        '   test_count 42 (block field: tests, count)',
        ...choices,
        '',
      ].join('\n'),
    );
  });

  it('gives no suggestion for a claim the block declares', () => {
    const block: Block = {
      ...BLOCK,
      filesChanged: ['docs/guide.md', 'src/a.ts'],
      tests: [{ command: 'pnpm test', count: 42, failures: 0, record: { kind: 'other' } }],
    };
    expect(suggestDeclarations(`${PROSE}${fence(block)}`).suggestions).toEqual([]);
    expect(suggestText(`${PROSE}${fence(block)}`)).toBe(
      [...HEADER, 'block: found', '', NONE, ''].join('\n'),
    );
  });

  it('never reads the text inside the handback fence', () => {
    const block: Block = {
      ...BLOCK,
      tests: [
        {
          command: 'I updated src/inside.ts and fixed #99',
          count: 1,
          failures: 0,
          record: { kind: 'other' },
        },
      ],
    };
    const found = `Updated src/a.ts.\n\n${fence(block)}`;
    expect(suggestText(found)).toBe([...HEADER, 'block: found', '', NONE, ''].join('\n'));

    // Prose inside an invalid fence is not read either; the block declares nothing.
    const invalid = 'Done.\n\n```dunstan-handback\nI updated src/inside.ts. Fixes #99.\n```\n';
    expect(suggestText(invalid)).toBe(
      [
        ...HEADER,
        'block: invalid (invalid_json), so it declares nothing; the gate reads this as unverifiable. Regenerate it with:',
        '  dunstan template',
        '',
        NONE,
        '',
      ].join('\n'),
    );
  });

  it('with no block, says so and gives the template command; every claim is undeclared', () => {
    expect(suggestText(PROSE)).toBe(
      [
        ...HEADER,
        'block: none in the report, so it declares nothing. Generate one from git, then add your test and reference claims:',
        '  dunstan template',
        '',
        'The prose appears to make 5 claims the block does not declare:',
        '',
        '1. Updated src/a.ts and docs/guide.md.',
        '   file_changed "src/a.ts" (block field: filesChanged)',
        ...choices,
        '',
        '2. Updated src/a.ts and docs/guide.md.',
        '   file_changed "docs/guide.md" (block field: filesChanged)',
        ...choices,
        '',
        '3. Fixes #12.',
        '   reference_closes "#12" (block field: references, relation closes)',
        ...choices,
        '',
        '4. All 42 tests pass.',
        '   tests_passed true (block field: tests, failures)',
        ...choices,
        '',
        '5. All 42 tests pass.',
        '   test_count 42 (block field: tests, count)',
        ...choices,
        '',
      ].join('\n'),
    );
  });

  it('says two blocks declare nothing', () => {
    const text = suggestText(`Done.\n\n${fence(BLOCK)}\n${fence(BLOCK)}`);
    expect(text).toContain(
      'block: 2 dunstan-handback blocks, so it declares nothing; the gate reads this as unverifiable. Keep one.\n',
    );
  });

  it('gives the sentence, not only the clause the extractor bound', () => {
    const report = '- Tests pass because I also fixed src/b.ts in the end.\n- Done.\n';
    const [s] = suggestDeclarations(report).suggestions.filter((x) => x.kind === 'file_changed');
    expect(s?.sentence).toBe('Tests pass because I also fixed src/b.ts in the end.');
  });

  it('states the figure precision.ts publishes for the running extractor, never a fixed one', () => {
    expect(precisionFor(EXTRACTOR.digest.sha256)).toBeNull();
    expect(suggestionsLabel()).toBe(
      `suggestions from the prose extractor (${EXTRACTOR.version}, precision unmeasured)`,
    );
    const measured = [
      {
        ...(PUBLISHED_PRECISION[0] as (typeof PUBLISHED_PRECISION)[number]),
        extractorDigest: EXTRACTOR.digest.sha256,
      },
    ];
    expect(suggestionsLabel(measured)).toBe(
      `suggestions from the prose extractor (${EXTRACTOR.version}, precision 0.8 over 30 adjudicated (operator-adjudicated, Barg Labs internal corpus, 2026-10-05))`,
    );
  });

  it('never prints a verdict word', () => {
    const text = renderSuggestions(suggestDeclarations(REPORT));
    expect(text).not.toMatch(/^verdict:|\b(unverified|differs|agrees)\b/m);
  });
});

describe('docs/agents.md', () => {
  const doc = readFileSync(new URL('../../docs/agents.md', import.meta.url), 'utf8');

  it('shows the suggest output its example report gives, byte for byte', () => {
    const report = /^~~~markdown\n([\s\S]*?)^~~~$/m.exec(doc)?.[1];
    const printed = /prints:\n\n~~~text\n([\s\S]*?)^~~~$/m.exec(doc)?.[1];
    expect(report).toBeDefined();
    expect(suggestText(report as string)).toBe(printed);
  });

  it('carries the instruction block with the loop: template, then suggest, then declare or reword', () => {
    const block = /^```markdown\n([\s\S]*?)^```$/m.exec(doc)?.[1] as string;
    expect(block).toContain('run `dunstan template`');
    expect(block).toContain('Run `dunstan suggest --report-file <your report>`');
    expect(block).toContain('either declare it in\n   the block, or reword the sentence');
  });
});

describe('declares', () => {
  const block: Block = {
    dunstan: '0.1',
    headCommit: HEAD,
    filesChanged: ['src/cli/main.ts'],
    tests: [{ command: 'pnpm test', count: 40, failures: 2, record: { kind: 'other' } }],
    checks: { total: 5, allSucceeded: true },
    references: [
      { issue: 'example-org/example-repo#12', relation: 'closes' },
      { issue: '#13', relation: 'cites' },
      { commit: 'a'.repeat(40), relation: 'cites' },
    ],
    mergedAt: '2026-10-05T10:00:00Z',
  };
  it.each([
    ['file_changed', 'src/cli/main.ts', true],
    ['file_changed', 'main.ts', true],
    ['file_changed', 'cli/main.ts', true],
    ['file_changed', 'ain.ts', false],
    ['reference_closes', '#12', true],
    ['reference_closes', 'Example-Org/example-repo#12', true],
    ['reference_closes', '#13', false],
    ['commit', 'aaaaaaa', true],
    ['commit', HEAD.slice(0, 8), true],
    ['commit', 'bbbbbbb', false],
    ['head_commit', HEAD.slice(0, 7), true],
    ['head_commit', 'aaaaaaa', false],
    ['checks_succeeded', true, true],
    ['checks_succeeded', false, false],
    ['check_count', 5, true],
    ['check_count', 6, false],
    ['tests_passed', false, true],
    ['tests_passed', true, false],
    ['test_count', 40, true],
    ['test_count', 38, false],
    ['merged_at', '2026-10-05T10:00:00Z', true],
    ['merged_at', '2026-10-05T11:00:00Z', false],
  ] as const)('%s %j: %s', (kind, value, expected) => {
    expect(declares(block, { kind, value })).toBe(expected);
  });

  it('reads tests as passed only when every run declares no failure', () => {
    const run = { command: 'c', count: 1, record: { kind: 'other' } };
    const { tests: _, ...untested } = block;
    const of = (tests: TestRun[]): Block => ({ ...untested, tests });
    expect(declares(of([{ ...run, failures: 0 }]), { kind: 'tests_passed', value: true })).toBe(
      true,
    );
    expect(declares(of([run]), { kind: 'tests_passed', value: true })).toBe(false);
    expect(declares(untested, { kind: 'tests_passed', value: true })).toBe(false);
  });
});

describe('dunstan suggest, the command', () => {
  async function run(argv: string[], stdin = '') {
    let out = '';
    let err = '';
    const code = await main(argv, {
      out: (t) => {
        out += t;
      },
      err: (t) => {
        err += t;
      },
      env: {},
      artifact: import.meta.url,
      readStdin: () => new TextEncoder().encode(stdin),
    });
    return { code, out, err };
  }

  it('reads --report-file and exits 0 with suggestions: never a verdict', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dunstan-suggest-'));
    const file = join(dir, 'report.md');
    writeFileSync(file, REPORT);
    const r = await run(['suggest', '--report-file', file]);
    expect(r).toEqual({ code: 0, out: suggestText(REPORT), err: '' });
  });

  it('reads standard input without --report-file, and with --report-file -', async () => {
    expect(await run(['suggest'], REPORT)).toEqual({ code: 0, out: suggestText(REPORT), err: '' });
    expect(await run(['suggest', '--report-file', '-'], PROSE)).toEqual({
      code: 0,
      out: suggestText(PROSE),
      err: '',
    });
  });

  it('exits 3, printing nothing on standard output, when the report cannot be read', async () => {
    const r = await run(['suggest', '--report-file', '/nonexistent/dunstan/report.md']);
    expect(r.code).toBe(3);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/^dunstan: cannot read the report \/nonexistent\/dunstan\/report\.md: /);
  });
});

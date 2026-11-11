// The claims table `dunstan check`, `rerun` and the MCP tool print (renderRecord). A GitLab record
// (DRAFT GitLab profile 0.1, `predicate.subject.forge.kind` `gitlab`) is printed in GitLab's terms:
// the merge request is `<project>!<iid>`, a description report is "merge request description", and
// no remedy line names a GitHub-only thing. The record is unchanged: only the printed text differs.
// A GitHub record's table is byte-identical to the one checker 0.1.19 printed (the snapshot file), but for the checker version in its first line.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Claim } from '../check/types.js';
import type { DunstanRecord } from '../record/build.js';
import { serializeRecord } from '../record/build.js';
import { GITLAB_TESTS_REMEDIES, TESTS_REMEDY_REASONS } from '../remedy/remedies.js';
import { renderRecord } from './output.js';

const EXAMPLES = [
  'block_missing.json',
  'fail.json',
  'pass.json',
  'unverifiable.json',
  'unverifiable.local-test-run.json',
];

function example(name: string): DunstanRecord {
  return JSON.parse(
    readFileSync(new URL(`../../spec/examples/records/${name}`, import.meta.url), 'utf8'),
  ) as DunstanRecord;
}

const DESCRIPTION_LOCATOR = 'GET /projects/example-org%2Fexample-repo/merge_requests/7#description';

// A GitLab record of merge request !7, built from an example record: the subject names GitLab and
// the report is the given source.
function gitlab(
  name: string,
  source: { kind: 'pr-body' | 'file' | 'stdin' | 'api' | 'pr-comment'; locator: string },
): DunstanRecord {
  const record = example(name);
  const p = record.predicate;
  p.subject.repository = 'example-org/example-repo';
  p.subject.pullRequest = 7;
  p.subject.forge = { kind: 'gitlab', host: 'gitlab.com' };
  p.report.source = source as typeof p.report.source;
  return record;
}

// Every GitHub-only term a GitLab table must not print.
const GITHUB_TERMS =
  /pull request|check run|workflow|GitHub|GITHUB_TOKEN|--report-pr-body|--exclude-check-run|--tests-ci|dunstan template|ci-test-records|pr-body|example-repo#7/i;

describe('renderRecord on a GitHub record', () => {
  for (const name of EXAMPLES) {
    for (const hasToken of [true, false]) {
      for (const caller of ['cli', 'mcp'] as const) {
        it(`prints ${name} (hasToken ${hasToken}, ${caller}) exactly as checker 0.1.19 did, but for the version`, () => {
          expect(renderRecord(example(name), { hasToken, caller })).toMatchSnapshot();
        });
      }
    }
  }
});

describe('renderRecord on a GitLab record', () => {
  it('names the merge request !7 and its description report, never pr-body or #7', () => {
    const text = renderRecord(
      gitlab('pass.json', { kind: 'pr-body', locator: DESCRIPTION_LOCATOR }),
      {
        hasToken: true,
        caller: 'cli',
      },
    );
    const [first, report] = text.split('\n');
    expect(first).toMatch(/ {2}example-org\/example-repo!7 {2}head [0-9a-f]{40}$/);
    expect(report).toMatch(
      new RegExp(
        `^report: merge request description ${DESCRIPTION_LOCATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(sha256 [0-9a-f]{64}\\)$`,
      ),
    );
    expect(text).not.toMatch(GITHUB_TERMS);
  });

  it('prints a file report as for GitHub, with !7', () => {
    const record = gitlab('unverifiable.json', { kind: 'file', locator: 'handback.md' });
    const text = renderRecord(record, { hasToken: true, caller: 'cli' });
    const [first, report] = text.split('\n');
    expect(first).toMatch(/ {2}example-org\/example-repo!7 {2}head /);
    expect(first).not.toMatch(/#7/);
    expect(report).toBe(`report: file handback.md (sha256 ${record.predicate.report.sha256})`);
  });

  it('prints stdin and api reports as for GitHub', () => {
    for (const kind of ['stdin', 'api'] as const) {
      const record = gitlab('pass.json', { kind, locator: kind });
      const report = renderRecord(record, { hasToken: true, caller: 'cli' }).split('\n')[1];
      expect(report).toBe(`report: ${kind} ${kind} (sha256 ${record.predicate.report.sha256})`);
    }
  });

  it('leaves the record byte-identical', () => {
    const record = gitlab('pass.json', { kind: 'pr-body', locator: DESCRIPTION_LOCATOR });
    const before = serializeRecord(record);
    renderRecord(record, { hasToken: true, caller: 'cli' });
    expect(serializeRecord(record)).toBe(before);
    expect(record.predicate.report.source.kind).toBe('pr-body');
  });

  // One case per remedy a GitLab tests row can carry: every one of TESTS_REMEDY_REASONS can fire on
  // a GitLab record (profile G.3, testRecords), and the artifact line is worded with and without a
  // token.
  it('has a GitLab line for every reason a tests row prints a remedy for', () => {
    expect(Object.keys(GITLAB_TESTS_REMEDIES).sort()).toEqual([...TESTS_REMEDY_REASONS].sort());
  });
  const cases = TESTS_REMEDY_REASONS.flatMap((reason) =>
    reason === 'source_unreadable:artifact'
      ? [
          { reason, hasToken: true },
          { reason, hasToken: false },
        ]
      : [{ reason, hasToken: true }],
  );
  for (const { reason, hasToken } of cases) {
    it(`prints a ${reason} remedy (hasToken ${hasToken}) in GitLab's terms`, () => {
      const record = gitlab('unverifiable.json', {
        kind: 'pr-body',
        locator: DESCRIPTION_LOCATOR,
      });
      const row = record.predicate.claims.find((c) => c.field === '/tests/0/count') as Claim;
      row.reason = reason;
      const text = renderRecord(record, { hasToken, caller: 'cli' });
      const remedy = text.split('\n').filter((l) => l.startsWith('  remedy: '));
      expect(remedy).toHaveLength(1);
      expect(text).not.toMatch(GITHUB_TERMS);
      if (reason === 'source_unreadable:artifact' && !hasToken) {
        expect(remedy[0]).toMatch(/GITLAB_TOKEN/);
      }
    });
  }
});

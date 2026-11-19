// Anonymising a case: the cejel#408 cases, treated as if from another organisation. The result
// recomputes offline, keeps every row's verdict and reason, and names nothing of the original; it
// is refused when a row would change or an original name is left.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DunstanRecord } from '../record/build.js';
import { verifyRecord } from '../record/verify.js';
import { AnonymiseError, anonymiseCase, SALT_KEY } from './anonymise.js';

const ROOT = new URL('../../', import.meta.url);
const HEAD = '35d6201d00cf926f9af10df61bfec05b6624ee12';

function input(name: string) {
  return {
    record: JSON.parse(
      readFileSync(new URL(`cases/${name}/record.json`, ROOT), 'utf8'),
    ) as DunstanRecord,
    report: readFileSync(new URL(`cases/${name}/report.md`, ROOT)),
    caseName: 'anonymised-1',
    salt: 'test',
  };
}
const text = (r: { record: DunstanRecord; report: Uint8Array }) =>
  `${JSON.stringify(r.record)}\n${new TextDecoder().decode(r.report)}`;

describe('anonymiseCase', () => {
  it('replaces the repository, owner, numbers and commit ids, and the record recomputes', () => {
    const given = input('cejel-408-closes');
    const out = anonymiseCase(given);
    const p = out.record.predicate;
    expect(verifyRecord(JSON.parse(JSON.stringify(out.record))).problems).toEqual([]);
    expect(p.verdict).toBe(given.record.predicate.verdict);
    expect(p.claims.map((c) => [c.verdict, c.reason])).toEqual(
      given.record.predicate.claims.map((c) => [c.verdict, c.reason]),
    );
    expect(p.subject).toMatchObject({ repository: 'example-org/example-repo', pullRequest: 1 });
    expect(p.evidence.pullRequest.number).toBe(1);
    expect(p.evidence.closingReferences).toEqual({
      status: 'ok',
      issues: ['example-org/example-repo#2'],
    });
    expect(p.block.status === 'found' && p.block.value.references).toEqual([
      { issue: '#2', relation: 'closes' },
    ]);
    expect(p.report.source).toEqual({
      kind: 'file',
      locator: 'cases/anonymised-1/report.md',
    });
    expect(p.evidence.sources.every((s) => s.sha256 === '0'.repeat(64) && !('etag' in s))).toBe(
      true,
    );
    expect(p.evidence.sources.map((s) => s.locator)).toContain(
      'GET /repos/example-org/example-repo/pulls/1',
    );
    // The record format's own identifiers are under https://barglabs.ai/dunstan/: not the case's.
    const all = text(out).replaceAll('https://barglabs.ai/dunstan/', '').toLowerCase();
    for (const name of ['barglabs', 'cejel', '#407', '#408', HEAD.slice(0, 7)]) {
      expect(all).not.toContain(name);
    }
    expect(out.mapping).toMatchObject({
      'barglabs/cejel': 'example-org/example-repo',
      'barglabs/cejel#407': '#2',
    });
  });

  it('keeps its salt in the mapping, and gives the same names again with it', () => {
    const { salt: _, ...unsalted } = input('cejel-408-closes');
    const first = anonymiseCase(unsalted);
    const salt = first.mapping[SALT_KEY] as string;
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    const again = anonymiseCase({ ...input('cejel-408-closes'), salt });
    expect(again.record).toEqual(first.record);
    expect(again.mapping).toEqual(first.mapping);
  });

  it('keeps file paths unless asked, and maps them consistently when asked', () => {
    const kept = anonymiseCase(input('cejel-408-scope'));
    expect(text(kept)).toContain('scripts/validate-distribution-metadata.mjs');
    const mapped = anonymiseCase({ ...input('cejel-408-scope'), mapPaths: true });
    expect(text(mapped)).not.toContain('validate-distribution-metadata');
    expect(
      mapped.record.predicate.block.status === 'found' &&
        mapped.record.predicate.block.value.filesChanged,
    ).toEqual(['.github/workflows/workflow-1.yml', 'path-2.mjs']);
    expect(mapped.record.predicate.claims.every((c) => c.verdict === 'pass')).toBe(true);
  });

  it('refuses a result that changes a row, or that still names the original', () => {
    expect(() =>
      anonymiseCase({ ...input('cejel-408-scope'), extra: [[HEAD, 'not-a-commit']] }),
    ).toThrow(/does not keep every claim's verdict/);
    const report = new TextEncoder().encode(
      `${new TextDecoder().decode(input('cejel-408-scope').report)}\nSee commit ${HEAD.slice(0, 7).toUpperCase()}.\n`,
    );
    let error: unknown;
    try {
      anonymiseCase({ ...input('cejel-408-scope'), report });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AnonymiseError);
    expect((error as AnonymiseError).leaks).toEqual([HEAD.slice(0, 7)]);
  });

  it('refuses a GitLab record and a record that holds report text', () => {
    const gitlab = input('cejel-408-scope');
    gitlab.record.predicate.subject.forge = { kind: 'gitlab', host: 'gitlab.com' };
    expect(() => anonymiseCase(gitlab)).toThrow(/GitLab/);
    const advised = input('cejel-408-scope');
    (advised.record.predicate as { advisory?: unknown }).advisory = {};
    expect(() => anonymiseCase(advised)).toThrow(/report text/);
  });
});

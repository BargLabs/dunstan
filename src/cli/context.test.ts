// Context beside a verdict (spec section 8.3): worked out from the record's file list, never part of
// the verdict, and absent from a record whose file list shows no workflow change.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FileEntry, FilesEvidence } from '../check/types.js';
import type { DunstanRecord } from '../record/build.js';
import { contextFlags, contextText } from './context.js';
import { renderRecord } from './output.js';

function example(name: string): DunstanRecord {
  return JSON.parse(
    readFileSync(new URL(`../../spec/examples/records/${name}`, import.meta.url), 'utf8'),
  ) as DunstanRecord;
}

function withFiles(files: FilesEvidence | undefined): DunstanRecord {
  const record = example('pass.json');
  if (files === undefined) delete record.predicate.evidence.files;
  else record.predicate.evidence.files = files;
  return record;
}

const ok = (entries: FileEntry[], complete = true): FilesEvidence => ({
  status: 'ok',
  complete,
  entries,
});

describe('contextFlags', () => {
  it('gives nothing for any example record', () => {
    for (const name of [
      'block_missing.json',
      'fail.json',
      'pass.json',
      'unverifiable.json',
      'unverifiable.local-test-run.json',
    ]) {
      expect(contextFlags(example(name))).toEqual([]);
    }
  });

  it('flags each entry under .github/workflows/, by its path or its previous path', () => {
    const record = withFiles(
      ok([
        { path: '.github/workflows/ci.yml', status: 'modified' },
        { path: '.github/workflows/old.yml', status: 'removed' },
        { path: 'ci/moved.yml', status: 'renamed', previousPath: '.github/workflows/test.yml' },
        { path: '.github/dependabot.yml', status: 'modified' },
        { path: 'docs/.github/workflows/x.yml', status: 'added' },
        { path: 'src/a.ts', status: 'modified' },
      ]),
    );
    expect(contextFlags(record).map(contextText)).toEqual([
      'workflow changed by this pull request: .github/workflows/ci.yml (modified)',
      'workflow changed by this pull request: .github/workflows/old.yml (removed)',
      'workflow changed by this pull request: ci/moved.yml (renamed from .github/workflows/test.yml)',
    ]);
  });

  it('says a workflow change cannot be ruled out when the file list cannot show it', () => {
    const unknown = (files: FilesEvidence | undefined) =>
      contextFlags(withFiles(files)).map(contextText);
    expect(unknown(ok([{ path: 'src/a.ts', status: 'modified' }], false))).toEqual([
      'workflow changes unknown: the file list cannot show that no workflow changed (file_list_truncated)',
    ]);
    expect(unknown({ status: 'unreadable', source: 'pull_request_files' })).toEqual([
      'workflow changes unknown: the file list cannot show that no workflow changed (source_unreadable:pull_request_files)',
    ]);
    expect(unknown(undefined)).toEqual([
      'workflow changes unknown: the file list cannot show that no workflow changed (evidence_field_unpopulated:files)',
    ]);
  });

  it('flags a listed workflow in an incomplete list, with no unknown line', () => {
    const record = withFiles(ok([{ path: '.github/workflows/ci.yml', status: 'added' }], false));
    expect(contextFlags(record).map((f) => f.kind)).toEqual(['workflow_changed']);
  });

  it('gives nothing for a GitLab record', () => {
    const record = withFiles(ok([{ path: '.github/workflows/ci.yml', status: 'added' }]));
    record.predicate.subject.forge = { kind: 'gitlab', host: 'gitlab.com' };
    expect(contextFlags(record)).toEqual([]);
  });
});

describe('renderRecord', () => {
  it('prints the context before the verdict and leaves the verdict as recorded', () => {
    const record = withFiles(
      ok([
        { path: '.github/workflows/ci.yml', status: 'modified' },
        { path: 'src/a.ts', status: 'modified' },
      ]),
    );
    const lines = renderRecord(record, { hasToken: true, caller: 'cli' }).trimEnd().split('\n');
    const at = lines.indexOf('context (not part of the verdict):');
    expect(lines.slice(at - 1, at + 4)).toEqual([
      '',
      'context (not part of the verdict):',
      '  workflow changed by this pull request: .github/workflows/ci.yml (modified)',
      '',
      'verdict: pass',
    ]);
  });
});

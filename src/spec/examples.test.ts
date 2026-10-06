// Every file in spec/examples validates or fails exactly as its directory and name say.
//
// blocks/valid/*.json             must be found and valid.
// blocks/invalid/<code>.<slug>    must be invalid with an error of that code; for schema_violation
//                                 the name is schema_violation.<keyword>.<slug>, and an error with
//                                 that JSON Schema keyword must be among the errors.
// reports/<status>.<slug>.md      extractHandbackBlock must return that status.
// records/<verdict>.json          must validate against the record schema and be self-consistent;
//                                 block_missing.json is the record of a report with no block.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLOCK_SUBJECT_NAME } from './constants.js';
import { extractHandbackBlock, readBlockContent } from './extract.js';
import { sha256Canonical, sha256Hex } from './jcs.js';
import type { JsonValue } from './json.js';
import { type BlockStatus, claimsDigest, evidenceDigest, overallVerdict } from './record.js';
import { validateRecord } from './schema.js';

const ROOT = new URL('../../', import.meta.url);
const EXAMPLES = new URL('spec/examples/', ROOT);

function list(dir: string, extension: string): string[] {
  const names = readdirSync(new URL(dir, EXAMPLES)).filter((n) => n.endsWith(extension));
  return names.sort();
}

function read(path: string): string {
  return readFileSync(new URL(path, EXAMPLES), 'utf8');
}

describe('spec/examples/blocks/valid', () => {
  const files = list('blocks/valid/', '.json');

  it('holds the four cases the spec names', () => {
    expect(files).toEqual([
      'full.json',
      'minimal.json',
      'non-junit-test-record.json',
      'rename.json',
    ]);
  });

  it.each(files)('%s is found and valid', (name) => {
    const result = readBlockContent(read(`blocks/valid/${name}`));
    expect(result).toMatchObject({ status: 'found' });
  });
});

describe('spec/examples/blocks/invalid', () => {
  const files = list('blocks/invalid/', '.json');

  it('covers every block error code', () => {
    const codes = new Set(files.map((n) => n.split('.')[0]));
    expect([...codes].sort()).toEqual([
      'duplicate_member',
      'invalid_json',
      'schema_violation',
      'unsupported_version',
    ]);
  });

  it.each(files)('%s fails with the error its name gives', (name) => {
    const [code, keyword] = name.split('.');
    const result = readBlockContent(read(`blocks/invalid/${name}`));
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.errors.map((e) => e.code)).toContain(code);
    if (code === 'schema_violation') {
      expect(result.errors.map((e) => e.keyword)).toContain(keyword);
    } else {
      expect(result.errors).toHaveLength(1);
    }
  });
});

describe('spec/examples/reports', () => {
  const files = list('reports/', '.md');

  it('has at least one report per status', () => {
    const statuses = new Set(files.map((n) => n.split('.')[0]));
    expect([...statuses].sort()).toEqual(['ambiguous', 'found', 'invalid', 'missing']);
  });

  it.each(files)('%s extracts with the status its name gives', (name) => {
    const expected = name.split('.')[0];
    expect(extractHandbackBlock(read(`reports/${name}`)).status).toBe(expected);
  });

  it('found.one-block.md carries the same block as blocks/valid/full.json', () => {
    const result = extractHandbackBlock(read('reports/found.one-block.md'));
    const full = JSON.parse(read('blocks/valid/full.json')) as JsonValue;
    expect(result).toEqual({ status: 'found', value: full, sha256: sha256Canonical(full) });
  });

  it('two blocks are counted, never resolved to the first', () => {
    expect(extractHandbackBlock(read('reports/ambiguous.two-blocks.md'))).toEqual({
      status: 'ambiguous',
      count: 2,
    });
  });

  it('a block quoted inside another fence is content, not a declaration', () => {
    const result = extractHandbackBlock(read('reports/found.example-inside-another-fence.md'));
    expect(result).toMatchObject({ status: 'found', value: { filesChanged: ['CONTRIBUTING.md'] } });
  });

  it('names the reason for invalid reports', () => {
    const codes = (name: string) => {
      const result = extractHandbackBlock(read(`reports/${name}`));
      return result.status === 'invalid' ? result.errors.map((e) => e.code) : [];
    };
    expect(codes('invalid.malformed-json.md')).toEqual(['invalid_json']);
    expect(codes('invalid.unterminated-fence.md')).toEqual(['unterminated_fence']);
  });
});

interface ExampleRecord {
  subject: { name: string; digest: Record<string, string> }[];
  predicate: {
    report: { sha256: string; source: { kind: string; locator: string } };
    block: { status: BlockStatus; sha256: string | null; value: JsonValue };
    subject: { repository: string; headSha: string };
    evidence: JsonValue;
    claims: { verdict: 'pass' | 'fail' | 'unverifiable' }[];
    verdict: string;
    digests: { claims: string; evidence: string };
  };
}

describe('spec/examples/records', () => {
  const files = list('records/', '.json');

  it('holds one illustrative record per outcome', () => {
    expect(files).toEqual(['block_missing.json', 'fail.json', 'pass.json', 'unverifiable.json']);
  });

  it.each(files)('%s validates against record-0.1.schema.json', (name) => {
    expect(validateRecord(JSON.parse(read(`records/${name}`)))).toEqual([]);
  });

  it.each(files)('%s is self-consistent', (name) => {
    const record = JSON.parse(read(`records/${name}`)) as ExampleRecord;
    const p = record.predicate;
    const outcome = name.replace(/\.json$/, '');

    if (outcome === 'block_missing') {
      expect(p.block.status).toBe('missing');
      expect(p.verdict).toBe('unverifiable');
    } else {
      expect(p.verdict).toBe(outcome);
    }
    expect(overallVerdict(p.block.status, p.claims)).toBe(p.verdict);

    expect(p.digests.claims).toBe(claimsDigest(p.claims as unknown as JsonValue));
    expect(p.digests.evidence).toBe(evidenceDigest(p.evidence));

    const [commit, block] = record.subject;
    expect(commit).toEqual({
      name: `git+https://github.com/${p.subject.repository}@${p.subject.headSha}`,
      digest: { gitCommit: p.subject.headSha },
    });

    // The report the record names is in spec/examples/reports; its bytes and its block match.
    expect(p.report.source.kind).toBe('file');
    const reportText = readFileSync(new URL(p.report.source.locator, ROOT));
    expect(p.report.sha256).toBe(sha256Hex(reportText));
    const extracted = extractHandbackBlock(reportText.toString('utf8'));
    expect(extracted.status).toBe(p.block.status);

    if (p.block.status === 'found') {
      expect(extracted).toEqual({ status: 'found', value: p.block.value, sha256: p.block.sha256 });
      expect(block).toEqual({ name: BLOCK_SUBJECT_NAME, digest: { sha256: p.block.sha256 } });
    } else {
      expect(block).toBeUndefined();
    }
  });

  it('the evidence digest ignores sources (provenance) and nothing else', () => {
    const record = JSON.parse(read('records/pass.json')) as ExampleRecord;
    const evidence = record.predicate.evidence as {
      sources: { readAt: string; sha256: string; etag?: string }[];
      pullRequest: { headSha: string };
    };
    const before = evidenceDigest(evidence as unknown as JsonValue);
    for (const source of evidence.sources) {
      source.readAt = '2030-01-01T00:00:00Z';
      source.sha256 = 'f'.repeat(64);
      source.etag = 'W/"changed"';
    }
    expect(evidenceDigest(evidence as unknown as JsonValue)).toBe(before);
    evidence.pullRequest.headSha = 'a'.repeat(40);
    expect(evidenceDigest(evidence as unknown as JsonValue)).not.toBe(before);
  });
});

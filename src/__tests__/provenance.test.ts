// PROVENANCE.md against the records it describes. Every record under demo/ and spec/examples/ must
// carry a checker.digest that PROVENANCE.md gives for its path: in its Records table (the build a tag
// reproduces, or the spec examples' placeholder) or as a development-build record, whose file must
// still have the listed SHA-256, so an edited original fails. This test never builds the checker: a
// later change to src/ legitimately changes the build, and build-equals-record is checked when a tag
// is exported, not here.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GUARDED = ['demo', 'spec/examples'];
const RECORD_TYPE_TEXT = 'https://barglabs.ai/dunstan/record/';
const RECORD_TYPE = /^https:\/\/barglabs\.ai\/dunstan\/record\//;
const HEX64 = /^[0-9a-f]{64}$/;

interface Provenance {
  // The Records table: a path pattern, where `*` is one path segment, and the digest it carries.
  builds: { pattern: string; digest: string }[];
  // The Development-build records table: one published record each, with its file's SHA-256.
  originals: { path: string; digest: string; sha256: string }[];
}

interface RecordFile {
  path: string;
  bytes: Buffer;
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function code(cell: string | undefined, what: string): string {
  const m = /^`([^`]+)`$/.exec(cell ?? '');
  if (m?.[1] === undefined) throw new Error(`PROVENANCE.md: ${what} is not one code span: ${cell}`);
  return m[1];
}

function hex64(cell: string | undefined, what: string): string {
  const value = code(cell, what);
  if (!HEX64.test(value)) throw new Error(`PROVENANCE.md: ${what} is not a SHA-256: ${value}`);
  return value;
}

function parseProvenance(text: string): Provenance {
  const p: Provenance = { builds: [], originals: [] };
  let table: 'builds' | 'originals' | null = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      table = null;
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells[0] === 'Records') table = 'builds';
    else if (cells[0] === 'Record') table = 'originals';
    else if (/^-+$/.test(cells[0] ?? '') || table === null) continue;
    else if (table === 'builds') {
      p.builds.push({ pattern: code(cells[0], 'a pattern'), digest: hex64(cells[1], 'a digest') });
    } else {
      p.originals.push({
        path: code(cells[0], 'a path'),
        digest: hex64(cells[2], 'a digest'),
        sha256: hex64(cells[5], 'a file SHA-256'),
      });
    }
  }
  return p;
}

const segment = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*');
const matches = (pattern: string, path: string) =>
  new RegExp(`^${pattern.split('/').map(segment).join('/')}$`).test(path);

function checkerDigest(record: RecordFile): string | undefined {
  const value = JSON.parse(record.bytes.toString('utf8')) as {
    predicate?: { checker?: { digest?: { sha256?: string } } };
  };
  return value.predicate?.checker?.digest?.sha256;
}

function provenanceProblems(p: Provenance, records: RecordFile[]): string[] {
  const problems: string[] = [];
  for (const record of records) {
    const digest = checkerDigest(record);
    const original = p.originals.find((o) => o.path === record.path);
    if (original !== undefined) {
      if (digest !== original.digest) {
        problems.push(`${record.path}: checker.digest ${digest}, listed ${original.digest}`);
      }
      if (sha256(record.bytes) !== original.sha256) {
        problems.push(
          `${record.path}: file SHA-256 ${sha256(record.bytes)}, listed ${original.sha256}; an original was edited`,
        );
      }
      continue;
    }
    const build = p.builds.find((b) => matches(b.pattern, record.path));
    if (build === undefined) {
      problems.push(`${record.path}: no row of PROVENANCE.md covers this record`);
    } else if (digest !== build.digest) {
      problems.push(
        `${record.path}: checker.digest ${digest}, ${build.pattern} gives ${build.digest}`,
      );
    }
  }
  for (const o of p.originals) {
    if (!records.some((r) => r.path === o.path)) problems.push(`${o.path}: listed, but not found`);
  }
  return problems;
}

// Every in-toto statement with a Dunstan record predicateType under the guarded directories. A .json
// file that names the predicateType must parse (spec/examples/blocks/invalid/ holds invalid JSON that
// does not name it). Dot directories (the demo's git-ignored .work/) are skipped.
function findRecords(): RecordFile[] {
  const records: RecordFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.json')) {
        const bytes = readFileSync(join(ROOT, path));
        const text = bytes.toString('utf8');
        if (!text.includes(RECORD_TYPE_TEXT)) continue;
        const value = JSON.parse(text) as { predicateType?: unknown };
        if (typeof value.predicateType === 'string' && RECORD_TYPE.test(value.predicateType)) {
          records.push({ path, bytes });
        }
      }
    }
  };
  for (const dir of GUARDED) walk(dir);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

const provenance = () => parseProvenance(readFileSync(join(ROOT, 'PROVENANCE.md'), 'utf8'));

describe('PROVENANCE.md', () => {
  it('lists the builds and the development-build records', () => {
    const p = provenance();
    expect(p.builds.map((b) => b.pattern)).toEqual([
      'demo/2026-10/*/rerun-v0.1.1-2026-10-06/record.json',
      'spec/examples/records/*.json',
    ]);
    expect(p.originals).toHaveLength(6);
  });

  it('finds every record under demo/ and spec/examples/', () => {
    const paths = findRecords().map((r) => r.path);
    expect(paths.filter((p) => p.startsWith('spec/examples/'))).toHaveLength(4);
    expect(paths.filter((p) => p.includes('/rerun-v0.1.1-2026-10-06/'))).toHaveLength(5);
    expect(paths).toContain('demo/2026-10/2-airbytehq-airbyte-74367/rerun-0.1.1/record.json');
  });

  it('gives each record the checker.digest it carries, and every original is unedited', () => {
    expect(provenanceProblems(provenance(), findRecords())).toEqual([]);
  });
});

describe('provenanceProblems', () => {
  const p = provenance();
  const records = findRecords();
  const rerun = 'demo/2026-10/1-FluidSynth-fluidsynth-1639/rerun-v0.1.1-2026-10-06/record.json';
  const original = 'demo/2026-10/1-FluidSynth-fluidsynth-1639/record.json';
  const replace = (path: string, bytes: Buffer) =>
    records.map((r) => (r.path === path ? { path, bytes } : r));
  const bytesOf = (path: string) => records.find((r) => r.path === path)?.bytes ?? Buffer.alloc(0);

  it('fails on a record whose digest is neither a listed build nor a listed original', () => {
    const value = JSON.parse(bytesOf(rerun).toString('utf8'));
    value.predicate.checker.digest.sha256 = 'f'.repeat(64);
    const problems = provenanceProblems(p, replace(rerun, Buffer.from(JSON.stringify(value))));
    expect(problems).toEqual([expect.stringContaining(`${rerun}: checker.digest ffff`)]);
  });

  it('fails when an original record is edited, even by one byte', () => {
    const edited = Buffer.concat([bytesOf(original), Buffer.from(' ')]);
    expect(provenanceProblems(p, replace(original, edited))).toEqual([
      expect.stringContaining('an original was edited'),
    ]);
  });

  it('fails when an original record is moved or removed', () => {
    const problems = provenanceProblems(
      p,
      records.filter((r) => r.path !== original),
    );
    expect(problems).toEqual([`${original}: listed, but not found`]);
  });

  it('fails on a record no row covers', () => {
    const elsewhere = 'demo/2026-10/1-FluidSynth-fluidsynth-1639/rerun-later/record.json';
    const problems = provenanceProblems(p, [
      ...records,
      { path: elsewhere, bytes: bytesOf(rerun) },
    ]);
    expect(problems).toEqual([`${elsewhere}: no row of PROVENANCE.md covers this record`]);
  });
});

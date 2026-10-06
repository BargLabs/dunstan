// PROVENANCE.md against the records it describes. Every record under demo/ and spec/examples/ must
// carry the checker version and checker.digest that PROVENANCE.md gives for its path: in its Records
// table (the build a tag reproduces, or the spec examples' placeholder) or as a development-build
// record, whose file must still have the listed SHA-256, so an edited original fails. A row built
// from a tag names that tag's version, so a record is checked against the build of the tag that wrote
// it, never against the current build. A row built from no tag is recomputed by the running checker
// and names its version. This test never builds the checker: a later change to src/ legitimately
// changes the build, and build-equals-record is checked when a tag is exported, not here.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHECKER_VERSION } from '../record/checker.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GUARDED = ['demo', 'spec/examples'];
const RECORD_TYPE_TEXT = 'https://barglabs.ai/dunstan/record/';
const RECORD_TYPE = /^https:\/\/barglabs\.ai\/dunstan\/record\//;
const HEX64 = /^[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const TAG = /^tag `(v\d+\.\d+\.\d+)`/;

interface Provenance {
  // The Records table: a path pattern, where `*` is one path segment, the checker version and digest
  // it carries, and the tag whose build reproduces the digest (null: built from no tag).
  builds: { pattern: string; version: string; digest: string; tag: string | null }[];
  // The Development-build records table: one published record each, with its file's SHA-256.
  originals: { path: string; version: string; digest: string; sha256: string }[];
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

function version(cell: string | undefined, what: string): string {
  if (!VERSION.test(cell ?? ''))
    throw new Error(`PROVENANCE.md: ${what} is not a version: ${cell}`);
  return cell as string;
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
      p.builds.push({
        pattern: code(cells[0], 'a pattern'),
        version: version(cells[1], 'a checker version'),
        digest: hex64(cells[2], 'a digest'),
        tag: TAG.exec(cells[3] ?? '')?.[1] ?? null,
      });
    } else {
      p.originals.push({
        path: code(cells[0], 'a path'),
        version: version(cells[1], 'a checker version'),
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

function checkerOf(record: RecordFile): {
  version: string | undefined;
  digest: string | undefined;
} {
  const value = JSON.parse(record.bytes.toString('utf8')) as {
    predicate?: { checker?: { version?: string; digest?: { sha256?: string } } };
  };
  const checker = value.predicate?.checker;
  return { version: checker?.version, digest: checker?.digest?.sha256 };
}

function provenanceProblems(
  p: Provenance,
  records: RecordFile[],
  running: string = CHECKER_VERSION,
): string[] {
  const problems: string[] = [];
  for (const b of p.builds) {
    if (b.tag !== null && b.tag !== `v${b.version}`) {
      problems.push(`${b.pattern}: checker ${b.version}, built from tag ${b.tag}`);
    }
    if (b.tag === null && b.version !== running) {
      problems.push(
        `${b.pattern}: checker ${b.version} from no tag, but the running checker is ${running}`,
      );
    }
  }
  for (const record of records) {
    const { version, digest } = checkerOf(record);
    const original = p.originals.find((o) => o.path === record.path);
    if (original !== undefined) {
      if (digest !== original.digest) {
        problems.push(`${record.path}: checker.digest ${digest}, listed ${original.digest}`);
      }
      if (version !== original.version) {
        problems.push(`${record.path}: checker ${version}, listed ${original.version}`);
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
    } else {
      if (digest !== build.digest) {
        problems.push(
          `${record.path}: checker.digest ${digest}, ${build.pattern} gives ${build.digest}`,
        );
      }
      if (version !== build.version) {
        problems.push(
          `${record.path}: checker ${version}, ${build.pattern} gives ${build.version}`,
        );
      }
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
  it('lists the builds, each with its checker and tag, and the development-build records', () => {
    const p = provenance();
    expect(p.builds.map((b) => [b.pattern, b.version, b.tag])).toEqual([
      ['demo/2026-10/*/rerun-v0.1.1-2026-10-06/record.json', '0.1.1', 'v0.1.1'],
      ['spec/examples/records/*.json', CHECKER_VERSION, null],
    ]);
    expect(p.originals).toHaveLength(6);
  });

  // The re-runs were written by the v0.1.1 build and verify with it, not with the build of the
  // current head, which is another checker version.
  it('binds the v0.1.1 re-runs to the v0.1.1 build, not the running checker', () => {
    const rerun = provenance().builds.find((b) => b.tag === 'v0.1.1');
    expect(rerun?.digest).toBe('9bbd685b8adbb1cf11beaad7dc294150e30775f50c3c3a2468f596deca7f38e4');
    expect(rerun?.version).not.toBe(CHECKER_VERSION);
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

  it("fails on a record whose checker version is not its tag's", () => {
    const value = JSON.parse(bytesOf(rerun).toString('utf8'));
    value.predicate.checker.version = CHECKER_VERSION;
    const problems = provenanceProblems(p, replace(rerun, Buffer.from(JSON.stringify(value))));
    expect(problems).toEqual([
      `${rerun}: checker ${CHECKER_VERSION}, ${p.builds[0]?.pattern} gives 0.1.1`,
    ]);
  });

  it("fails on a tag's row that names another checker version", () => {
    const builds = p.builds.map((b) => (b.tag === 'v0.1.1' ? { ...b, tag: 'v0.1.2' } : b));
    expect(provenanceProblems({ ...p, builds }, records)).toEqual([
      'demo/2026-10/*/rerun-v0.1.1-2026-10-06/record.json: checker 0.1.1, built from tag v0.1.2',
    ]);
  });

  it('fails when the checker version moves and the untagged rows do not', () => {
    expect(provenanceProblems(p, records, '9.9.9')).toEqual([
      `spec/examples/records/*.json: checker ${CHECKER_VERSION} from no tag, but the running checker is 9.9.9`,
    ]);
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

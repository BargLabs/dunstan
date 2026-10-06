// Runs the instrument on one half (preregistration.md, "Instrument" and "Order of work").
//
//   run.mjs check --instrument baseline|fixed --half dev|test --dunstan <path/to/dunstan.mjs>
//     Runs `dunstan check --report-pr-body --advisory` on each pull request of the half, with
//     DUNSTAN_READ_TOKEN as GITHUB_TOKEN on the child only. The bundle's SHA-256 must be the
//     instrument's. Records go to the git-ignored .work/records/<instrument>-<half>/; the checker's
//     printed output is discarded, so nothing about an advisory is shown. Writes the seal,
//     runs/<instrument>-<half>.seal.json: each record's SHA-256, and nothing a record says.
//
//   run.mjs freeze --dunstan <path> --checker-version <v> --extractor-version <v>
//                  --extractor-digest <sha256> --source-commit <sha>
//     Writes frozen.json, the fixed instrument. It must be committed before `fixed` runs and before
//     any test-half index is built.
//
//   run.mjs index --instrument baseline|fixed --half dev|test
//     Opens a sealed run: checks each record against the seal and the instrument, and writes
//     runs/<instrument>-<half>.json with each advisory's id, kind, note and clause offsets. It copies
//     no text from a pull request. The test half is opened only once frozen.json is committed.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  BASELINE,
  committedAt,
  fileStem,
  flags,
  isMain,
  paths,
  prName,
  ROOT,
  readJson,
  runName,
  sha256,
  writeJson,
} from './common.mjs';
import { selectedIn } from './split.mjs';

// The instrument a run uses: the constant baseline, or the committed frozen.json.
export function instrumentFor(name, p = paths(), committed = committedAt) {
  if (name === 'baseline') return { ...BASELINE };
  if (name !== 'fixed') throw new Error(`--instrument ${name}`);
  if (!existsSync(p.frozen)) throw new Error('frozen.json does not exist: freeze the fix first');
  const commit = committed(p.frozen);
  if (commit === null)
    throw new Error('frozen.json is not committed as it stands: commit it first');
  return { ...readJson(p.frozen), frozenCommit: commit };
}

// The test half stays shut until the fixed instrument is frozen and committed.
function assertOpenable(half, p, committed) {
  if (half === 'test' && (!existsSync(p.frozen) || committed(p.frozen) === null)) {
    throw new Error('the test half is opened only after frozen.json is committed');
  }
}

export function checkHalf({
  instrument: name,
  half,
  dunstan,
  p = paths(),
  env = process.env,
  committed = committedAt,
  now = () => new Date().toISOString(),
}) {
  const run = runName(name, half);
  const instrument = instrumentFor(name, p, committed);
  const seal = join(p.runs, `${run}.seal.json`);
  if (existsSync(seal))
    throw new Error(`${relative(p.dir, seal)} exists; a sealed run is never redone`);
  if (typeof dunstan !== 'string') throw new Error('--dunstan <path/to/dunstan.mjs>');
  const bundle = sha256(readFileSync(dunstan));
  if (bundle !== instrument.bundleSha256) {
    throw new Error(
      `${dunstan} has SHA-256 ${bundle}; the ${name} instrument is ${instrument.bundleSha256}`,
    );
  }
  if (!env.DUNSTAN_READ_TOKEN) throw new Error('DUNSTAN_READ_TOKEN is not set');
  const selection = readJson(p.selection);
  const dir = join(p.records, run);
  mkdirSync(dir, { recursive: true });
  const childEnv = { ...env, GITHUB_TOKEN: env.DUNSTAN_READ_TOKEN };
  delete childEnv.GH_TOKEN;

  const startedAt = now();
  const once = (s) => {
    const out = join(dir, `${fileStem(s)}.json`);
    if (existsSync(out)) return { status: 'kept' };
    const result = spawnSync(
      process.execPath,
      [
        dunstan,
        'check',
        '--repo',
        s.repository,
        '--pr',
        String(s.number),
        '--report-pr-body',
        '--advisory',
        '--out',
        out,
      ],
      { cwd: ROOT, env: childEnv, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (result.error) throw result.error;
    return { status: existsSync(out) ? 'written' : 'error', exit: result.status };
  };
  const prs = selectedIn(selection, half);
  const exits = new Map(prs.map((s) => [prName(s), once(s)]));
  // A check that wrote no record is tried once more, after the rest.
  for (const s of prs) {
    if (exits.get(prName(s)).status === 'error') exits.set(prName(s), once(s));
  }
  const records = prs.map((s) => {
    const file = `${fileStem(s)}.json`;
    const path = join(dir, file);
    const { exit } = exits.get(prName(s));
    if (!existsSync(path)) return { pr: prName(s), error: `no record; exit ${exit}` };
    return {
      pr: prName(s),
      file,
      sha256: sha256(readFileSync(path)),
      ...(exit === undefined ? {} : { exit }),
    };
  });
  mkdirSync(p.runs, { recursive: true });
  writeJson(seal, {
    run,
    instrument,
    command:
      'node <dunstan> check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>',
    node: process.version,
    startedAt,
    finishedAt: now(),
    records,
  });
  return { run, records };
}

export function freeze({
  dunstan,
  checkerVersion,
  extractorVersion,
  extractorDigest,
  sourceCommit,
  p = paths(),
  now = () => new Date().toISOString(),
}) {
  if (existsSync(p.frozen)) throw new Error('frozen.json exists; a freeze is never redone');
  if (typeof dunstan !== 'string') throw new Error('--dunstan <path/to/dunstan.mjs>');
  if (!/^[0-9a-f]{64}$/.test(extractorDigest ?? '')) throw new Error('--extractor-digest <sha256>');
  if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? '')) throw new Error('--source-commit <40-hex sha>');
  for (const [flag, v] of [
    ['--checker-version', checkerVersion],
    ['--extractor-version', extractorVersion],
  ]) {
    if (typeof v !== 'string' || v === '') throw new Error(`${flag} <version>`);
  }
  const frozen = {
    name: 'fixed',
    checkerVersion,
    bundleSha256: sha256(readFileSync(dunstan)),
    extractorVersion,
    extractorDigest,
    comparison: BASELINE.comparison,
    sourceCommit,
    frozenAt: now(),
  };
  writeJson(p.frozen, frozen);
  return frozen;
}

// The [start, end) offsets, in Unicode code points, of a record's clause in the body it came from,
// or null when the body does not hold it. The extractor collapses each run of whitespace to one
// space and cuts a clause longer than 300 code units to 299 and "…"; a cut clause is located by
// the part it keeps.
export function locateClause(body, clause) {
  const cut = clause.length === 300 && clause.endsWith('…');
  const pieces = (cut ? clause.slice(0, -1) : clause).split(' ').filter((x) => x !== '');
  if (pieces.length === 0) return null;
  const escaped = pieces.map((x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  let match;
  try {
    match = new RegExp(escaped.join('\\s+'), 'u').exec(body);
  } catch {
    return null;
  }
  if (match === null) return null;
  const start = [...body.slice(0, match.index)].length;
  return { start, end: start + [...match[0]].length };
}

export function indexHalf({ instrument: name, half, p = paths(), committed = committedAt }) {
  const run = runName(name, half);
  assertOpenable(half, p, committed);
  const instrument = instrumentFor(name, p, committed);
  const sealPath = join(p.runs, `${run}.seal.json`);
  if (!existsSync(sealPath))
    throw new Error(`${relative(p.dir, sealPath)} does not exist: run check first`);
  const sealBytes = readFileSync(sealPath);
  const seal = JSON.parse(sealBytes.toString('utf8'));
  if (seal.instrument.bundleSha256 !== instrument.bundleSha256) {
    throw new Error(`the seal's instrument is not the ${name} instrument`);
  }
  const selection = readJson(p.selection);
  const byName = new Map(selectedIn(selection, half).map((s) => [prName(s), s]));
  const prs = [];
  const errors = [];
  for (const entry of seal.records) {
    const s = byName.get(entry.pr);
    if (s === undefined)
      throw new Error(`${entry.pr} is sealed in ${run} but is not in the ${half} half`);
    if (entry.error !== undefined) {
      errors.push({ pr: entry.pr, error: entry.error });
      continue;
    }
    const bytes = readFileSync(join(p.records, run, entry.file));
    if (sha256(bytes) !== entry.sha256)
      throw new Error(`${entry.file} is not the record the seal holds`);
    const record = JSON.parse(bytes.toString('utf8'));
    const pred = record.predicate;
    if (pred.checker?.digest?.sha256 !== instrument.bundleSha256) {
      throw new Error(
        `${entry.file}: written by checker ${pred.checker?.digest?.sha256}, not the ${name} instrument`,
      );
    }
    const advisory = pred.advisory;
    if (advisory === undefined) throw new Error(`${entry.file}: no advisory section`);
    if (advisory.extractor.digest.sha256 !== instrument.extractorDigest) {
      throw new Error(
        `${entry.file}: extractor ${advisory.extractor.digest.sha256}, not ${instrument.extractorDigest}`,
      );
    }
    if (advisory.comparison.version !== instrument.comparison) {
      throw new Error(
        `${entry.file}: comparison ${advisory.comparison.version}, not ${instrument.comparison}`,
      );
    }
    const body = readFileSync(join(p.bodies, `${fileStem(s)}.md`));
    if (sha256(body) !== s.body.sha256)
      throw new Error(`${fileStem(s)}.md is not the body selected`);
    const text = body.toString('utf8');
    prs.push({
      pr: entry.pr,
      recordSha256: entry.sha256,
      advisoryDigest: pred.digests.advisory,
      // false when the body changed between selection and this run: the offsets still index the
      // body at selection time, and an advisory from text added since has none.
      reportIsSelectedBody: pred.report.sha256 === s.body.sha256,
      advisories: advisory.advisories.map((a, i) => ({
        advisoryId: `${name}:${entry.pr}:${i}`,
        kind: a.kind,
        note: a.note,
        clause: locateClause(text, a.clause),
      })),
    });
  }
  const index = {
    run,
    instrument,
    seal: { path: `runs/${run}.seal.json`, sha256: sha256(sealBytes) },
    advisoryId:
      "<instrument>:<owner>/<repo>#<n>:<i>, i the 0-based position in the record's advisory list",
    clause:
      '[start, end) in Unicode code points of the pull request body at selection time, or null',
    prs,
    errors,
  };
  mkdirSync(p.runs, { recursive: true });
  writeJson(join(p.runs, `${run}.json`), index);
  return index;
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = flags(rest);
  if (command === 'check') {
    const { run, records } = checkHalf({
      instrument: args.instrument,
      half: args.half,
      dunstan: args.dunstan,
    });
    const failed = records.filter((r) => r.error !== undefined).length;
    process.stdout.write(
      `${run}: ${records.length - failed} record(s), ${failed} error(s); sealed\n`,
    );
  } else if (command === 'freeze') {
    const frozen = freeze({
      dunstan: args.dunstan,
      checkerVersion: args['checker-version'],
      extractorVersion: args['extractor-version'],
      extractorDigest: args['extractor-digest'],
      sourceCommit: args['source-commit'],
    });
    process.stdout.write(
      `frozen.json: bundle ${frozen.bundleSha256}, extractor ${frozen.extractorDigest}\n`,
    );
  } else if (command === 'index') {
    const index = indexHalf({ instrument: args.instrument, half: args.half });
    const n = index.prs.reduce((sum, pr) => sum + pr.advisories.length, 0);
    process.stdout.write(
      `${index.run}: ${index.prs.length} PR(s), ${n} advisories, ${index.errors.length} error(s)\n`,
    );
  } else {
    process.stderr.write('usage: run.mjs check|freeze|index [flags]; see the header\n');
    process.exit(3);
  }
}

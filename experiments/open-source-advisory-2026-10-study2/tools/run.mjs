// Runs both instruments on every selected pull request, seals them, and opens them
// (preregistration.md, "Instruments" and "Advisory identity").
//
//   run.mjs check --baseline <v0.1.3 dist/dunstan.mjs> --candidate <checker 0.1.5 dist/dunstan.mjs>
//     For each selected pull request in selection order, runs `dunstan check --report-pr-body
//     --advisory` with the baseline and then with the candidate, with DUNSTAN_READ_TOKEN as
//     GITHUB_TOKEN on the child only. Each bundle's SHA-256 must be its instrument's. Records go to
//     the git-ignored .work/records/<instrument>/; the checker's printed output is discarded, so
//     nothing about an advisory is shown. Writes runs/baseline.seal.json and
//     runs/candidate.seal.json: each record's SHA-256, and nothing a record says.
//
//   run.mjs index
//     Opens both sealed runs, only once both seals are committed: checks each record against its
//     seal and its instrument, checks that the two runs propose the same advisories, and writes
//     runs/index.json with each advisory's id, kind, clause offsets and both notes. It copies no text
//     from a pull request. A pull request whose two runs do not propose the same advisories is an
//     instrument fault: it is listed under `faults`, with the reason, and enters no measure.
//
// Adapted from study 1's tools/run.mjs (experiments/open-source-advisory-2026-10/tools/run.mjs),
// whose locateClause is imported unchanged. What differs: two instruments, both frozen in
// common.mjs, run on one set with no split and no freeze step; one index for both; the identity
// check.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { locateClause } from '../../open-source-advisory-2026-10/tools/run.mjs';
import {
  committedAt,
  FILE_DIFFERS,
  fileStem,
  flags,
  INSTRUMENTS,
  isMain,
  NAMES,
  PATH_NOTES,
  paths,
  prName,
  ROOT,
  readJson,
  sha256,
  writeJson,
} from './common.mjs';

export { locateClause };

const COMMAND =
  'node <dunstan> check --repo <owner/repo> --pr <n> --report-pr-body --advisory --out <record>';

// `instruments` is the frozen pair; a test passes its own.
export function checkAll({
  baseline,
  candidate,
  p = paths(),
  env = process.env,
  instruments = INSTRUMENTS,
  now = () => new Date().toISOString(),
}) {
  const bundles = { baseline, candidate };
  for (const name of NAMES) {
    const seal = p.seal(name);
    if (existsSync(seal))
      throw new Error(`${relative(p.dir, seal)} exists; a sealed run is never redone`);
  }
  for (const name of NAMES) {
    const bundle = bundles[name];
    if (typeof bundle !== 'string') throw new Error(`--${name} <path/to/dunstan.mjs>`);
    const digest = sha256(readFileSync(bundle));
    if (digest !== instruments[name].bundleSha256) {
      throw new Error(
        `${bundle} has SHA-256 ${digest}; the ${name} instrument is ${instruments[name].bundleSha256}`,
      );
    }
  }
  if (!env.DUNSTAN_READ_TOKEN) throw new Error('DUNSTAN_READ_TOKEN is not set');
  const selection = readJson(p.selection);
  const childEnv = { ...env, GITHUB_TOKEN: env.DUNSTAN_READ_TOKEN };
  delete childEnv.GH_TOKEN;
  for (const name of NAMES) mkdirSync(join(p.records, name), { recursive: true });

  const startedAt = now();
  const once = (name, s) => {
    const out = join(p.records, name, `${fileStem(s)}.json`);
    if (existsSync(out)) return { status: 'kept' };
    const result = spawnSync(
      process.execPath,
      [
        bundles[name],
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
  const exits = new Map();
  // Baseline then candidate on each pull request, so the two reads of one are seconds apart.
  for (const s of selection.selected) {
    for (const name of NAMES) exits.set(`${name}\n${prName(s)}`, once(name, s));
  }
  // A check that wrote no record is tried once more, after the rest.
  for (const s of selection.selected) {
    for (const name of NAMES) {
      const key = `${name}\n${prName(s)}`;
      if (exits.get(key).status === 'error') exits.set(key, once(name, s));
    }
  }
  const finishedAt = now();
  mkdirSync(p.runs, { recursive: true });
  for (const name of NAMES) {
    const records = selection.selected.map((s) => {
      const file = `${fileStem(s)}.json`;
      const path = join(p.records, name, file);
      const { exit } = exits.get(`${name}\n${prName(s)}`);
      if (!existsSync(path)) return { pr: prName(s), error: `no record; exit ${exit}` };
      return {
        pr: prName(s),
        file,
        sha256: sha256(readFileSync(path)),
        ...(exit === undefined ? {} : { exit }),
      };
    });
    writeJson(p.seal(name), {
      run: name,
      instrument: instruments[name],
      command: COMMAND,
      order: 'each pull request in selection order, baseline then candidate',
      node: process.version,
      startedAt,
      finishedAt,
      records,
    });
  }
  return Object.fromEntries(NAMES.map((name) => [name, readJson(p.seal(name))]));
}

// Why the two runs of one pull request do not propose the same advisories, or null when they do:
// the same report, the same number of advisories, and at each position the same kind, value and
// clause. Each note is the same, except the one change comparison 0.3.0 may make: a file_changed
// claim the baseline notes differs:declared_not_changed may carry any of PATH_NOTES.
export function identityFault(baseline, candidate) {
  if (baseline.report !== candidate.report) return 'the two runs read different report bodies';
  const [a, b] = [baseline.advisories, candidate.advisories];
  if (a.length !== b.length) return `${a.length} advisories against ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    for (const field of ['kind', 'value', 'clause']) {
      if (JSON.stringify(a[i][field]) !== JSON.stringify(b[i][field])) {
        return `advisory ${i}: the ${field} differs`;
      }
    }
    if (a[i].note === b[i].note) continue;
    const pathChange =
      a[i].kind === 'file_changed' && a[i].note === FILE_DIFFERS && PATH_NOTES.includes(b[i].note);
    if (!pathChange) {
      return `advisory ${i}: note ${a[i].note} against ${b[i].note}, not a comparison 0.3.0 change`;
    }
  }
  return null;
}

export function indexAll({ p = paths(), instruments = INSTRUMENTS, committed = committedAt }) {
  const seals = {};
  for (const name of NAMES) {
    const path = p.seal(name);
    if (!existsSync(path))
      throw new Error(`${relative(p.dir, path)} does not exist: run check first`);
    if (committed(path) === null) {
      throw new Error(
        `${relative(p.dir, path)} is not committed as it stands: both runs are sealed publicly before either is opened`,
      );
    }
    const bytes = readFileSync(path);
    const seal = JSON.parse(bytes.toString('utf8'));
    if (seal.instrument.bundleSha256 !== instruments[name].bundleSha256) {
      throw new Error(`the ${name} seal's instrument is not the ${name} instrument`);
    }
    seals[name] = {
      seal,
      sha256: sha256(bytes),
      byPr: new Map(seal.records.map((r) => [r.pr, r])),
    };
  }
  const selection = readJson(p.selection);

  // One record, checked against its seal and its instrument.
  const open = (name, entry) => {
    const bytes = readFileSync(join(p.records, name, entry.file));
    if (sha256(bytes) !== entry.sha256)
      throw new Error(`${name}/${entry.file} is not the record the seal holds`);
    const pred = JSON.parse(bytes.toString('utf8')).predicate;
    const instrument = instruments[name];
    if (pred.checker?.digest?.sha256 !== instrument.bundleSha256) {
      throw new Error(`${name}/${entry.file}: written by checker ${pred.checker?.digest?.sha256}`);
    }
    const advisory = pred.advisory;
    if (advisory === undefined) throw new Error(`${name}/${entry.file}: no advisory section`);
    if (advisory.extractor.digest.sha256 !== instrument.extractorDigest) {
      throw new Error(
        `${name}/${entry.file}: extractor ${advisory.extractor.digest.sha256}, not ${instrument.extractorDigest}`,
      );
    }
    if (advisory.comparison.version !== instrument.comparison) {
      throw new Error(
        `${name}/${entry.file}: comparison ${advisory.comparison.version}, not ${instrument.comparison}`,
      );
    }
    return { report: pred.report.sha256, advisories: advisory.advisories };
  };

  const prs = [];
  const errors = [];
  const faults = [];
  for (const s of selection.selected) {
    const pr = prName(s);
    const entries = NAMES.map((name) => seals[name].byPr.get(pr));
    if (entries.some((e) => e === undefined)) throw new Error(`${pr} is not in both seals`);
    const failed = NAMES.filter((_, i) => entries[i].error !== undefined);
    if (failed.length > 0) {
      errors.push({ pr, instruments: failed });
      continue;
    }
    const [baseline, candidate] = NAMES.map((name, i) => open(name, entries[i]));
    const fault = identityFault(baseline, candidate);
    if (fault !== null) {
      faults.push({ pr, reason: fault });
      continue;
    }
    const body = readFileSync(join(p.bodies, `${fileStem(s)}.md`));
    if (sha256(body) !== s.body.sha256)
      throw new Error(`${fileStem(s)}.md is not the body selected`);
    const text = body.toString('utf8');
    prs.push({
      pr,
      recordSha256: { baseline: entries[0].sha256, candidate: entries[1].sha256 },
      // false when the body changed between selection and the runs: the offsets still index the
      // body at selection time, and an advisory from text added since has none.
      reportIsSelectedBody: baseline.report === s.body.sha256,
      advisories: baseline.advisories.map((a, i) => ({
        advisoryId: `${pr}:${i}`,
        kind: a.kind,
        clause: locateClause(text, a.clause),
        notes: { baseline: a.note, candidate: candidate.advisories[i].note },
      })),
    });
  }
  const index = {
    instruments,
    seals: Object.fromEntries(
      NAMES.map((name) => [name, { path: `runs/${name}.seal.json`, sha256: seals[name].sha256 }]),
    ),
    advisoryId:
      "<owner>/<repo>#<n>:<i>, i the 0-based position in both records' advisory lists, which hold the same advisories",
    clause:
      '[start, end) in Unicode code points of the pull request body at selection time, or null',
    prs,
    errors,
    faults,
  };
  mkdirSync(p.runs, { recursive: true });
  writeJson(p.index, index);
  return index;
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = flags(rest);
  if (command === 'check') {
    const seals = checkAll({ baseline: args.baseline, candidate: args.candidate });
    for (const name of NAMES) {
      const failed = seals[name].records.filter((r) => r.error !== undefined).length;
      process.stdout.write(
        `${name}: ${seals[name].records.length - failed} record(s), ${failed} error(s); sealed\n`,
      );
    }
  } else if (command === 'index') {
    const index = indexAll({});
    const n = index.prs.reduce((sum, pr) => sum + pr.advisories.length, 0);
    process.stdout.write(
      `index: ${index.prs.length} PR(s), ${n} advisories, ${index.errors.length} error(s), ${index.faults.length} identity fault(s)\n`,
    );
  } else {
    process.stderr.write('usage: run.mjs check|index [flags]; see the header\n');
    process.exit(3);
  }
}

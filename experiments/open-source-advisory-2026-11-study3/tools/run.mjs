// Checks the instrument, runs it on every selected pull request, seals the run, and opens it
// (preregistration.md, "Instrument" and "Order of work", steps 2 and 3).
//
//   run.mjs instrument --checkout <a checkout of BargLabs/dunstan, dependencies installed>
//     Refuses unless the checkout is at the pinned source commit (tag v0.1.7) with no change, its
//     `pnpm build` succeeds, and the dist/dunstan.mjs it writes has the pinned SHA-256. Prints the
//     bundle's path. Writes nothing of its own.
//
//   run.mjs check --instrument <dist/dunstan.mjs of dunstan@0.1.7>
//     For each selected pull request in selection order, runs `dunstan check --repo <owner/repo>
//     --pr <n> --report-pr-body --advisory --out <record>` with the pinned bundle only, refused by
//     its SHA-256 otherwise, and with DUNSTAN_READ_TOKEN as GITHUB_TOKEN on the child only. A pull
//     request with no record is tried once more after the rest, and is an error if it still has
//     none. Records go to the git-ignored .work/records/; the checker's printed output is discarded,
//     so nothing about an advisory is shown. A record whose checker, extractor digest or comparison
//     version is not the instrument's is refused, and nothing is sealed. Writes
//     runs/instrument.seal.json: each record's SHA-256, and nothing a record holds.
//
//   run.mjs index
//     Opens the sealed run only once its seal is committed: checks each record against the seal
//     and the instrument, and writes runs/index.json with each advisory's id, kind, note and clause
//     offsets, each `reference_closes` advisory's spec 0.1.4 section 7.4 row, the errors, and the
//     pull requests whose body was edited since selection. It copies no text from a pull request.
//
// Adapted from study 2's tools/run.mjs (experiments/open-source-advisory-2026-10-study2/tools/
// run.mjs), with study 1's locateClause imported unchanged. What differs: one instrument, pinned in
// common.mjs and checked against its source; the instrument check of each record at check time as
// well as at index time; the 7.4 row of each `closes` advisory.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { locateClause } from '../../open-source-advisory-2026-10/tools/run.mjs';
import {
  committedAt,
  fileStem,
  flags,
  INSTRUMENT,
  isMain,
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
const BUNDLE = join('dist', 'dunstan.mjs');

// ---------------------------------------------------------------------------------------------
// instrument

const gitIn = (dir) => (args) =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const pnpmBuild = (dir) =>
  spawnSync('pnpm', ['build'], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] }).status;

// `frozen` is the pinned instrument and `build(dir)` the build, returning its exit status; a test
// passes its own.
export function checkInstrument({ checkout, frozen = INSTRUMENT, git = gitIn, build = pnpmBuild }) {
  if (typeof checkout !== 'string' || !existsSync(checkout)) {
    throw new Error('--checkout <a checkout of BargLabs/dunstan>');
  }
  const run = git(checkout);
  let head;
  try {
    head = run(['rev-parse', 'HEAD']).trim();
  } catch {
    throw new Error(`${checkout} is not a git checkout`);
  }
  if (head !== frozen.sourceCommit) {
    throw new Error(`${checkout} is at ${head}; the instrument's source is ${frozen.sourceCommit}`);
  }
  if (run(['status', '--porcelain']).trim() !== '') {
    throw new Error(
      `${checkout} has changes; the instrument is built from its source as committed`,
    );
  }
  const status = build(checkout);
  if (status !== 0) throw new Error(`the build in ${checkout} exited ${status}`);
  const bundle = join(checkout, BUNDLE);
  if (!existsSync(bundle)) throw new Error(`the build wrote no ${BUNDLE}`);
  const digest = sha256(readFileSync(bundle));
  if (digest !== frozen.bundleSha256) {
    throw new Error(`${bundle} has SHA-256 ${digest}; the instrument is ${frozen.bundleSha256}`);
  }
  return { bundle, sourceCommit: head, sha256: digest };
}

// ---------------------------------------------------------------------------------------------
// check

// Why a record is not the instrument's, or null: its checker version and digest, its extractor
// digest and its comparison version must all be the instrument's. Names versions and digests only.
export function instrumentFault(record, frozen = INSTRUMENT) {
  const pred = record?.predicate;
  const checker = pred?.checker;
  if (checker?.version !== frozen.checkerVersion) {
    return `checker ${checker?.version}, not ${frozen.checkerVersion}`;
  }
  if (checker?.digest?.sha256 !== frozen.bundleSha256) {
    return `checker digest ${checker?.digest?.sha256}, not ${frozen.bundleSha256}`;
  }
  const advisory = pred.advisory;
  if (advisory === undefined || advisory === null) return 'no advisory section';
  if (advisory.extractor?.digest?.sha256 !== frozen.extractorDigest) {
    return `extractor ${advisory.extractor?.digest?.sha256}, not ${frozen.extractorDigest}`;
  }
  if (advisory.comparison?.version !== frozen.comparison) {
    return `comparison ${advisory.comparison?.version}, not ${frozen.comparison}`;
  }
  return null;
}

// `frozen` is the pinned instrument; a test passes its own.
export function checkAll({
  instrument: bundle,
  p = paths(),
  env = process.env,
  frozen = INSTRUMENT,
  now = () => new Date().toISOString(),
}) {
  if (existsSync(p.seal)) {
    throw new Error(`${relative(p.dir, p.seal)} exists; a sealed run is never redone`);
  }
  if (typeof bundle !== 'string') throw new Error('--instrument <path/to/dunstan.mjs>');
  const digest = sha256(readFileSync(bundle));
  if (digest !== frozen.bundleSha256) {
    throw new Error(`${bundle} has SHA-256 ${digest}; the instrument is ${frozen.bundleSha256}`);
  }
  if (!env.DUNSTAN_READ_TOKEN) throw new Error('DUNSTAN_READ_TOKEN is not set');
  if (!existsSync(p.selection)) throw new Error('selection.json does not exist: select first');
  const selection = readJson(p.selection);
  if (selection.awaitingBlock2) {
    throw new Error('selection.json awaits block 2: the run starts once the selection is final');
  }
  // The read-only token is the child's only token.
  const { DUNSTAN_READ_TOKEN: token, GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...rest } = env;
  const childEnv = { ...rest, GITHUB_TOKEN: token };
  mkdirSync(p.records, { recursive: true });

  const startedAt = now();
  const recordPath = (s) => join(p.records, `${fileStem(s)}.json`);
  const once = (s) => {
    const out = recordPath(s);
    if (existsSync(out)) return { status: 'kept' };
    const result = spawnSync(
      process.execPath,
      [
        bundle,
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
  // `attempts` is 0 for a record kept from an earlier, interrupted run of this command.
  const exits = new Map(
    selection.selected.map((s) => {
      const first = once(s);
      return [prName(s), { ...first, attempts: first.status === 'kept' ? 0 : 1 }];
    }),
  );
  // A check that wrote no record is tried once more, after the rest.
  for (const s of selection.selected) {
    if (exits.get(prName(s)).status === 'error') {
      exits.set(prName(s), { ...once(s), attempts: 2 });
    }
  }
  const finishedAt = now();
  const records = selection.selected.map((s) => {
    const path = recordPath(s);
    const { exit, attempts } = exits.get(prName(s));
    if (!existsSync(path)) return { pr: prName(s), error: `no record; exit ${exit}`, attempts };
    const bytes = readFileSync(path);
    let record;
    try {
      record = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error(`${relative(p.dir, path)} is not JSON; nothing is sealed`);
    }
    const fault = instrumentFault(record, frozen);
    if (fault !== null) {
      throw new Error(`${relative(p.dir, path)}: ${fault}; nothing is sealed`);
    }
    return {
      pr: prName(s),
      file: `${fileStem(s)}.json`,
      sha256: sha256(bytes),
      attempts,
      ...(exit === undefined ? {} : { exit }),
    };
  });
  mkdirSync(p.runs, { recursive: true });
  writeJson(p.seal, {
    run: 'instrument',
    instrument: frozen,
    command: COMMAND,
    order:
      'each pull request in selection order; one with no record tried once more after the rest',
    node: process.version,
    startedAt,
    finishedAt,
    records,
  });
  return readJson(p.seal);
}

// ---------------------------------------------------------------------------------------------
// index

const CLOSES = 'reference_closes';

// spec 0.1.4, section 7.4, the `closes` check: what each row's evidence is. A note from the check's
// steps before the table (closing references or the target's existence read unread, the target not
// found, or no value to compare) has no row, and is indexed with `closesRow: null`.
export const CLOSES_ROWS = Object.freeze({
  1: 'the target, or the identity it resolved to, is among the closing references: agrees',
  2: 'some ClosedEvent of the target has this pull request as closer: agrees',
  3: 'some ClosedEvent of the target has a commit closer that is one of its commits or its merge commit: agrees',
  4: 'this pull request is open and unmerged: unanswered:closing_link_unsettled',
  5: 'merged, the base is not the default branch and the target is open: unanswered:closing_base_not_default',
  6: 'the target, or the part of closeEvents.pullRequest a row above needs, is unread or absent: unanswered:<its reason>',
  7: 'the target is closed and its complete read holds no ClosedEvent: unanswered:closing_event_unsettled',
  8: 'otherwise: differs:not_closing',
});

const ROW_OF_NOTE = Object.freeze({
  'unanswered:closing_link_unsettled': 4,
  'unanswered:closing_base_not_default': 5,
  'unanswered:closing_event_unsettled': 7,
  'differs:not_closing': 8,
});

const UNREAD = /^unanswered:(source_unreadable|evidence_field_unpopulated):/;
const qualify = (issue, repository) => (issue.startsWith('#') ? `${repository}${issue}` : issue);
const sameIssue = (a, b) => {
  const [repoA, numA] = a.split('#');
  const [repoB, numB] = b.split('#');
  return numA === numB && repoA?.toLowerCase() === repoB?.toLowerCase();
};
// The note a step that found its source unread gives, as the checker writes it.
const unreadNote = (section, name) =>
  section === undefined
    ? `unanswered:evidence_field_unpopulated:${name}`
    : section.status === 'unreadable'
      ? `unanswered:source_unreadable:${section.source}`
      : `unanswered:evidence_field_unpopulated:${section.field}`;

// The section 7.4 row a `reference_closes` advisory's note came from, 1 to 8, or null for a note
// from the steps before the table. Read from the note, the advisory's `observed` (which closer a
// row 2 or 3 pass rests on), and, for an unread source, the record's evidence, in the order the
// check reads it: the closing references, then the target's existence read, then the table. A note
// the record's evidence could not have given is refused, never given a row.
export function closesRow(advisory, evidence, repository) {
  const { note, observed, value } = advisory;
  const refuse = (why) => {
    throw new Error(`a reference_closes advisory noted ${note}: ${why}`);
  };
  if (note === 'unanswered:no_comparable_record_field') return null;
  if (typeof value !== 'string') refuse('its value is not a reference');
  const closing = evidence?.closingReferences;
  const closingRead = closing !== undefined && closing.status === 'ok';
  const entry = evidence?.references?.find(
    (r) => r.kind === 'issue' && sameIssue(r.ref, qualify(value, repository)),
  );
  const entryRead = entry !== undefined && entry.status === 'ok';

  if (note === 'agrees') {
    if (!closingRead) refuse('the closing references are unread');
    const closer = observed?.closedBy?.closer?.kind;
    if (observed?.closedBy === undefined) return 1;
    if (closer === 'pull_request') return 2;
    if (closer === 'commit') return 3;
    return refuse(`it rests on a closer of kind ${closer}`);
  }
  if (UNREAD.test(note)) {
    if (!closingRead) {
      if (note !== unreadNote(closing, 'closingReferences')) {
        refuse('the closing references give another reason');
      }
      return null;
    }
    if (!entryRead) {
      if (note !== unreadNote(entry, 'references'))
        refuse("the target's read gives another reason");
      return null;
    }
    if (!entry.exists) refuse('the target does not exist');
    return 6;
  }
  if (note === 'differs:not_found') {
    if (!closingRead || !entryRead || entry.exists !== false) refuse('the target exists');
    return null;
  }
  const row = ROW_OF_NOTE[note];
  if (row === undefined) return refuse('no step of section 7.4 gives this note');
  if (!closingRead || !entryRead || entry.exists !== true) {
    refuse('the steps before the table did not reach it');
  }
  return row;
}

export function indexAll({ p = paths(), frozen = INSTRUMENT, committed = committedAt }) {
  if (!existsSync(p.seal)) {
    throw new Error(`${relative(p.dir, p.seal)} does not exist: run check first`);
  }
  if (committed(p.seal) === null) {
    throw new Error(
      `${relative(p.dir, p.seal)} is not committed as it stands: the run is sealed publicly before it is opened`,
    );
  }
  const sealBytes = readFileSync(p.seal);
  const seal = JSON.parse(sealBytes.toString('utf8'));
  if (JSON.stringify(seal.instrument) !== JSON.stringify(frozen)) {
    throw new Error("the seal's instrument is not the instrument");
  }
  const selection = readJson(p.selection);
  const sealed = seal.records.map((r) => r.pr);
  const chosen = selection.selected.map(prName);
  if (JSON.stringify(sealed) !== JSON.stringify(chosen)) {
    throw new Error('the seal does not hold the selected pull requests in selection order');
  }

  const prs = [];
  const errors = [];
  seal.records.forEach((entry, i) => {
    const s = selection.selected[i];
    if (entry.error !== undefined) {
      errors.push({ pr: entry.pr, error: entry.error });
      return;
    }
    const bytes = readFileSync(join(p.records, entry.file));
    if (sha256(bytes) !== entry.sha256) {
      throw new Error(`${entry.file} is not the record the seal holds`);
    }
    const record = JSON.parse(bytes.toString('utf8'));
    const fault = instrumentFault(record, frozen);
    if (fault !== null) throw new Error(`${entry.file}: ${fault}`);
    const pred = record.predicate;
    const body = readFileSync(join(p.bodies, `${fileStem(s)}.md`));
    if (sha256(body) !== s.body.sha256) {
      throw new Error(`${fileStem(s)}.md is not the body selected`);
    }
    const text = body.toString('utf8');
    prs.push({
      pr: entry.pr,
      recordSha256: entry.sha256,
      // false when the body was edited between selection and the run: the offsets still index the
      // body at selection time, and an advisory from text added since has none.
      reportIsSelectedBody: pred.report.sha256 === s.body.sha256,
      advisories: pred.advisory.advisories.map((a, j) => ({
        advisoryId: `${entry.pr}:${j}`,
        kind: a.kind,
        note: a.note,
        clause: locateClause(text, a.clause),
        ...(a.kind === CLOSES
          ? { closesRow: closesRow(a, pred.evidence, pred.subject?.repository ?? s.repository) }
          : {}),
      })),
    });
  });
  const index = {
    instrument: frozen,
    seal: { path: 'runs/instrument.seal.json', sha256: sha256(sealBytes) },
    advisoryId: "<owner>/<repo>#<n>:<i>, i the 0-based position in the record's advisory list",
    clause:
      '[start, end) in Unicode code points of the pull request body at selection time, or null',
    closesRow: {
      spec: 'spec 0.1.4, section 7.4, the closes check; null for a note from the steps before the table',
      rows: CLOSES_ROWS,
    },
    prs,
    errors,
    editedSinceSelection: prs.filter((x) => !x.reportIsSelectedBody).map((x) => x.pr),
  };
  mkdirSync(p.runs, { recursive: true });
  writeJson(p.index, index);
  return index;
}

if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = flags(rest);
  if (command === 'instrument') {
    const { bundle, sha256: digest } = checkInstrument({ checkout: args.checkout });
    process.stdout.write(`${bundle}: SHA-256 ${digest}, the instrument\n`);
  } else if (command === 'check') {
    const seal = checkAll({ instrument: args.instrument });
    const failed = seal.records.filter((r) => r.error !== undefined).length;
    process.stdout.write(
      `${seal.records.length - failed} record(s), ${failed} error(s); sealed in runs/instrument.seal.json\n`,
    );
  } else if (command === 'index') {
    const index = indexAll({});
    const n = index.prs.reduce((sum, pr) => sum + pr.advisories.length, 0);
    process.stdout.write(
      `index: ${index.prs.length} PR(s), ${n} advisories, ${index.errors.length} error(s), ${index.editedSinceSelection.length} body/bodies edited since selection\n`,
    );
  } else {
    process.stderr.write('usage: run.mjs instrument|check|index [flags]; see the header\n');
    process.exit(3);
  }
}

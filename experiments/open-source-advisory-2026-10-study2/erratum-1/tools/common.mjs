// What erratum 1's tools share: their paths, the closer relations and the rows the erratum reads.
// Study 2's paths and helpers are imported from ../../tools/common.mjs unchanged. Nothing here reads
// the network.

import { join } from 'node:path';
import { paths as studyPaths } from '../../tools/common.mjs';

export {
  DIFFERS,
  flags,
  isMain,
  LABELS,
  readJson,
  readJsonl,
  sha256,
  share,
  writeJson,
  writeJsonl,
} from '../../tools/common.mjs';

export const NOT_CLOSING = 'differs:not_closing';
export const CLOSES = 'reference_closes';

// Every advisory the erratum reads: a `closes` claim, or a not_closing note under either
// instrument.
export const isClosesRow = (a) =>
  a.kind === CLOSES || a.notes.baseline === NOT_CLOSING || a.notes.candidate === NOT_CLOSING;

// Who closed a row's target, as the worksheet gives it: spec 0.1.4 section 7.4's rows 2 to 8, in
// the table's order (worksheet.mjs says which row each is).
export const RELATIONS = Object.freeze([
  'this_pr',
  'commit_of_this_pr',
  'pr_open',
  'open_after_non_default_base',
  'incomplete',
  'event_unsettled',
  'pr_closed_unmerged',
  'still_open',
  'other_pr',
  'other_commit',
  'no_closer',
]);

// The pull request study 2's not_closing advisories cluster on: 19 of its 22.
export const DOMINANT_PR = 'replicate/cog#3063';

// The study's paths and the erratum's, under one directory so a test can point them at a scratch
// copy.
export function paths(dir) {
  const study = studyPaths(dir);
  const erratum = join(study.dir, 'erratum-1');
  return {
    ...study,
    erratum,
    closers: join(erratum, 'closers.json'),
    worksheetRows: join(erratum, 'worksheet.jsonl'),
    worksheetTable: join(erratum, 'worksheet.md'),
    erratumFigures: join(erratum, 'figures.json'),
  };
}

// `owner/repo#n` as an owner, a name and a number.
export function splitRef(ref) {
  const m = /^([^/#\s]+)\/([^/#\s]+)#([1-9][0-9]*)$/.exec(ref);
  if (m === null) throw new Error(`${ref} is not <owner>/<repo>#<n>`);
  return { owner: m[1], name: m[2], number: Number(m[3]) };
}

export const sameRef = (a, b) => a.toLowerCase() === b.toLowerCase();

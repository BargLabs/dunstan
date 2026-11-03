// Offline verification of a survey record (DRAFT, docs/survey.md): every embedded record verifies
// as `dunstan verify` verifies a record; the listing holds each number once and its duplicate count
// recomputes from its pages; the selection recomputes from the recorded listing and parameters; the
// listing was read exactly as far as its stated end; the aggregate recomputes from the entries and
// the recorded reader, remedy lines included; and the digest recomputes. Uses only the record; no
// network. A survey record is unsigned and holds only digests of the listing's bodies, so this
// proves the record consistent with itself, not that its listing is what GitHub returned or that a
// no-record entry was unreadable: rerunning it online is what checks those.

import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import { verifyRecord } from '../record/verify.js';
import { canonicalize } from '../spec/jcs.js';
import { escapePointerToken, type JsonValue } from '../spec/json.js';
import { validateSurveyRecord } from '../spec/schema.js';
import { aggregate } from './aggregate.js';
import {
  type ListingEnd,
  listingStop,
  type SurveyRecord,
  selectPullRequests,
  surveyDigest,
  surveyRerun,
} from './record.js';

export interface SurveyProblem {
  member: string;
  message: string;
}

export interface SurveyVerifyResult {
  ok: boolean;
  problems: SurveyProblem[];
  record?: SurveyRecord;
}

const text = (value: unknown) => canonicalize((value ?? null) as JsonValue);

// JSON Pointers to every leaf at which `a` and `b` differ.
function differences(a: unknown, b: unknown, pointer: string): string[] {
  const isObject = (v: unknown) => v !== null && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      out.push(...differences(a[i], b[i], `${pointer}/${i}`));
    }
    return out;
  }
  if (isObject(a) && isObject(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort();
    return keys.flatMap((k) => differences(ao[k], bo[k], `${pointer}/${escapePointerToken(k)}`));
  }
  return text(a) === text(b) ? [] : [pointer];
}

function at(value: unknown, pointer: string, base: string): unknown {
  let v = value;
  for (const token of pointer.slice(base.length).split('/').slice(1)) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;
  }
  return v;
}

export function verifySurveyRecord(value: unknown): SurveyVerifyResult {
  const schemaErrors = validateSurveyRecord(value);
  if (schemaErrors.length > 0) {
    return {
      ok: false,
      problems: schemaErrors.map((e) => ({
        member: e.pointer,
        message: `schema_violation (${e.keyword}): ${e.message}`,
      })),
    };
  }
  const record = value as SurveyRecord;
  const problems: SurveyProblem[] = [];
  const differ = (member: string, recorded: unknown, recomputed: unknown) => {
    for (const pointer of differences(recorded, recomputed, member)) {
      problems.push({
        member: pointer,
        message: `recorded ${text(at(recorded, pointer, member))}, recomputed ${text(at(recomputed, pointer, member))}`,
      });
    }
  };

  const { checker, selection, entries } = record;
  if (checker.name !== CHECKER_NAME || checker.version !== CHECKER_VERSION) {
    problems.push({
      member: '/checker',
      message: `survey was written by ${checker.name} ${checker.version}; this is ${CHECKER_NAME} ${CHECKER_VERSION}`,
    });
    return { ok: false, problems, record };
  }

  // The listing: it lists each number once; its pages hold exactly the listed pull requests and
  // the duplicates; no page before the last would have ended the reading, and the last ends it for
  // the reason recorded.
  const { parameters, listing } = selection;
  const firstAt = new Map<number, number>();
  listing.pullRequests.forEach((pr, i) => {
    const first = firstAt.get(pr.number);
    if (first === undefined) firstAt.set(pr.number, i);
    else {
      problems.push({
        member: `/selection/listing/pullRequests/${i}`,
        message: `pull request ${pr.number} is listed again (first at /selection/listing/pullRequests/${first}); the listing holds each number once`,
      });
    }
  });
  const held = listing.pages.reduce((sum, page) => sum + page.items, 0);
  const repeated = listing.pages.reduce((sum, page) => sum + page.duplicates, 0);
  listing.pages.forEach((page, i) => {
    if (page.duplicates > page.items) {
      problems.push({
        member: `/selection/listing/pages/${i}/duplicates`,
        message: `recorded ${page.duplicates}, more than the page's ${page.items} items`,
      });
    }
  });
  differ('/selection/listing/duplicates', listing.duplicates, repeated);
  differ(
    '/selection/listing/pullRequests/length',
    listing.pullRequests.length,
    held - listing.duplicates,
  );
  let read = 0;
  listing.pages.forEach((page, i) => {
    read += page.items - page.duplicates;
    if (i === listing.pages.length - 1) return;
    const stop = listingStop(
      parameters,
      listing.pages.slice(0, i + 1),
      listing.pullRequests.slice(0, read),
    );
    if (stop !== null) {
      problems.push({
        member: `/selection/listing/pages/${i + 1}`,
        message: `the listing ended at page ${page.page} (${stop}); no later page is read`,
      });
    }
  });
  const stop = listingStop(parameters, listing.pages, listing.pullRequests);
  const end: ListingEnd | null =
    stop ?? (listing.pages.length === listing.pageBound ? 'page_bound' : null);
  if (end === null) {
    problems.push({
      member: '/selection/listing/end',
      message: `recorded ${text(listing.end)}, recomputed none: the listing was not read to an end`,
    });
  } else {
    differ('/selection/listing/end', listing.end, end);
  }
  if (listing.pages.length > listing.pageBound) {
    problems.push({
      member: '/selection/listing/pages',
      message: `${listing.pages.length} pages read, past the bound of ${listing.pageBound}`,
    });
  }

  const selected = selectPullRequests(parameters, listing.pullRequests);
  differ('/selection/selected', selection.selected, selected);
  differ(
    '/entries/pullRequests',
    entries.map((e) => e.pullRequest),
    selected,
  );

  // Every embedded record verifies by itself, is of its entry's pull request and was written by the
  // checker the survey names.
  entries.forEach((entry, i) => {
    if (entry.record === null) return;
    const base = `/entries/${i}/record`;
    const result = verifyRecord(entry.record);
    for (const p of result.problems)
      problems.push({ member: `${base}${p.member}`, message: p.message });
    const subject = entry.record.predicate.subject;
    differ(`${base}/predicate/subject/pullRequest`, subject.pullRequest, entry.pullRequest);
    differ(
      `${base}/predicate/subject/repository`,
      subject.repository.toLowerCase(),
      parameters.repository.toLowerCase(),
    );
    differ(`${base}/predicate/checker`, entry.record.predicate.checker, checker);
  });

  try {
    differ(
      '/aggregate',
      record.aggregate,
      aggregate(entries, listing.pullRequests.length, parameters.advisory, selection.reader),
    );
  } catch (e) {
    // A claim row no mapping types: an embedded record that does not verify says why.
    problems.push({ member: '/aggregate', message: `not recomputed: ${(e as Error).message}` });
  }

  const out = record.rerun.offline.startsWith('dunstan verify ')
    ? record.rerun.offline.slice('dunstan verify '.length)
    : '';
  differ('/rerun', record.rerun, surveyRerun(parameters, out));
  differ('/digest/sha256', record.digest.sha256, surveyDigest(record));

  return { ok: problems.length === 0, problems, record };
}

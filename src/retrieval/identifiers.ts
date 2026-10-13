// Exact identifier matching, the first stage of Arm A: an item whose identifier the claim names
// exactly is a candidate whatever its lexical score. Identifiers are commit SHAs, issue and pull
// request references, file paths, test names and check-run (job) names, matched case-sensitively
// as whole identifiers, in the claim's text or in the value a reader typed from it.

import { qualifyIssue, sameIssue } from '../check/checks.js';
import type { JsonValue } from '../spec/json.js';
import type { ClaimQuery, RecordItem } from './types.js';

// A test or job name shorter than this is too likely to be an ordinary word ("ci", "e2e") to count
// as named exactly; lexical matching still sees it.
export const MIN_NAME_LENGTH = 4;

// An abbreviated SHA has at least 7 hex digits and at least one decimal digit, so an English word
// spelt in hex letters ("defaced") is not read as a commit.
const SHA = /(?<![0-9A-Za-z])[0-9a-fA-F]{7,40}(?![0-9A-Za-z])/g;
const ISSUE =
  /(?<![\w/.-])((?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9})(?![0-9])/g;

const WORD = /[A-Za-z0-9_]/;
const PATH_CHAR = /[A-Za-z0-9._/-]/;
// A job name runs on through a hyphen: "build-docs" is one name, and does not name "build".
const JOB_NAME_CHAR = /[A-Za-z0-9_-]/;

function stringLeaves(value: JsonValue | undefined, out: string[]): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringLeaves(v, out);
  else if (value !== null && typeof value === 'object')
    for (const v of Object.values(value)) stringLeaves(v, out);
  return out;
}

// The texts identifiers are looked for in: the claim, then each string the reader typed.
export function claimTexts(claim: ClaimQuery): string[] {
  return [claim.text, ...stringLeaves(claim.declaredValue, [])];
}

// Where `needle` occurs in `haystack` with no identifier character directly before or after it. A
// sentence's full stop after a path ("changed src/a.ts.") is not part of the path.
function boundedAt(haystack: string, needle: string, inside: RegExp): number[] {
  const out: number[] = [];
  if (needle.length === 0) return out;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    const next = haystack[at + needle.length + 1];
    const openBefore = before === undefined || !inside.test(before);
    const openAfter =
      after === undefined ||
      !inside.test(after) ||
      (after === '.' && (next === undefined || !/[A-Za-z0-9]/.test(next)));
    if (openBefore && openAfter) out.push(at);
  }
  return out;
}

function occursBounded(haystack: string, needle: string, inside: RegExp): boolean {
  return boundedAt(haystack, needle, inside).length > 0;
}

// Does a text name the job `name` whole? Not inside a longer job name of the record that the text
// names at the same place ("build" in "build docs"), and not as the job of a matrix leg ("test" in
// "test (ubuntu-latest)"), which names that leg only: a claim about a matrix job names its leg, and
// a bare `test` names the job literally called `test`.
function jobNamed(text: string, name: string, longer: readonly string[]): boolean {
  if (text === name) return true;
  return boundedAt(text, name, JOB_NAME_CHAR).some(
    (at) =>
      !text.startsWith(' (', at + name.length) &&
      !longer.some((l) =>
        boundedAt(text, l, JOB_NAME_CHAR).some(
          (from) => from <= at && at + name.length <= from + l.length,
        ),
      ),
  );
}

function shaTokens(texts: readonly string[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(SHA)) {
      const token = m[0].toLowerCase();
      if (token.length === 40 || /[0-9]/.test(token)) out.push(token);
    }
  }
  return out;
}

function issueRefs(texts: readonly string[], repository: string): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(ISSUE)) out.push(qualifyIssue(m[1] as string, repository));
  }
  return out;
}

// For each item named exactly, the field that named it. Keys are indexes into `items`.
export function identifierMatches(
  claim: ClaimQuery,
  items: readonly RecordItem[],
  repository: string,
): Map<number, string> {
  const texts = claimTexts(claim);
  const shas = shaTokens(texts);
  const issues = issueRefs(texts, repository);
  const named = (value: string, inside: RegExp) =>
    texts.some((t) => t === value || occursBounded(t, value, inside));

  // A test case named by its full identifier, classname.name: its bare name then names that case
  // only, and not the same name under another classname (or under none).
  const qualified = (item: RecordItem) =>
    item.type === 'test' && item.id !== item.fields[0]?.[1] && named(item.id, WORD);
  const qualifiedNames = new Set(
    items.filter(qualified).map((item) => item.fields[0]?.[1] as string),
  );

  const jobNames = items
    .filter((item) => item.type === 'check_run')
    .map((item) => item.fields[0]?.[1] as string);

  const matches = new Map<number, string>();
  items.forEach((item, i) => {
    for (const [field, value] of item.fields) {
      let hit = false;
      switch (`${item.type}.${field}`) {
        case 'commit.sha':
          hit = shas.some((s) => value.startsWith(s));
          break;
        case 'timeline_event.ref':
          hit = /^[0-9a-f]{40}$/.test(value)
            ? shas.some((s) => value.startsWith(s))
            : issues.some((ref) => sameIssue(ref, value));
          break;
        case 'file.path':
        case 'file.previousPath':
          hit = named(value, PATH_CHAR);
          break;
        case 'check_run.name': {
          const longer = jobNames.filter((n) => n.length > value.length && n.includes(value));
          hit = value.length >= MIN_NAME_LENGTH && texts.some((t) => jobNamed(t, value, longer));
          break;
        }
        case 'test.name':
          hit =
            value.length >= MIN_NAME_LENGTH &&
            named(value, WORD) &&
            (!qualifiedNames.has(value) || qualified(item));
          break;
      }
      if (hit) {
        matches.set(i, field);
        return;
      }
    }
    // A test case is also named by its full identifier, classname.name.
    if (qualified(item)) matches.set(i, 'id');
  });
  return matches;
}

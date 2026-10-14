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

// Where a text holds a test classname whole, apart from the name: as recorded ("queue.retry") or
// with each `.` replaced by one space ("queue retry"), as [from, to) spans.
function classnameSpans(text: string, classname: string): [number, number][] {
  const forms = new Set([classname, classname.replaceAll('.', ' ')]);
  return [...forms].flatMap((form) =>
    boundedAt(text, form, WORD).map((at): [number, number] => [at, at + form.length]),
  );
}

// Does a text name the classname whole? Not inside a longer classname of the record that the text
// names at the same place ("retry" in "queue retry").
function classnameNamed(text: string, classname: string, classnames: readonly string[]): boolean {
  const longer = classnames
    .filter((c) => c.length > classname.length)
    .flatMap((c) => classnameSpans(text, c));
  return classnameSpans(text, classname).some(
    ([from, to]) => !longer.some(([l, r]) => l <= from && to <= r),
  );
}

// The events GitHub's checks list may show after a workflow's job, as `<workflow> / <job>
// (<event>)` (DRAFT 0.2.0, D.6). A closed list: any other text in the parentheses is read as a
// matrix leg's is (D.10).
export const CHECK_RUN_EVENTS = ['push', 'pull_request', 'pull_request_target', 'merge_group'];
const EVENT_SUFFIX = new RegExp(`^ \\((?:${CHECK_RUN_EVENTS.join('|')})\\)`);

const WORKFLOW_JOB = /(\S+) \/ /g;

// Where a job may be named with its workflow in a text: directly after each `<workflow> / `.
function afterWorkflows(text: string): number[] {
  return [...text.matchAll(WORKFLOW_JOB)].map((m) => (m.index as number) + m[0].length);
}

// Does a text name the job `name` whole? Not inside a longer job name of the record that the text
// names at the same place ("build" in "build docs"), and not as the job of a matrix leg ("test" in
// "test (ubuntu-latest)"), which names that leg only: a claim about a matrix job names its leg, and
// a bare `test` names the job literally called `test`. Named with its workflow, a job may be
// followed by its event ("CI / test (pull_request)"), unless the job and the event together are a
// longer job name of the record, a leg, which they then name.
function jobNamed(text: string, name: string, longer: readonly string[]): boolean {
  if (text === name) return true;
  const workflowed = afterWorkflows(text);
  return boundedAt(text, name, JOB_NAME_CHAR).some((at) =>
    jobNamedAt(text, name, at, longer, workflowed.includes(at)),
  );
}

// Whether the bounded occurrence of `name` at `at` names that job whole, as jobNamed reads it.
function jobNamedAt(
  text: string,
  name: string,
  at: number,
  longer: readonly string[],
  withWorkflow: boolean,
): boolean {
  const end = at + name.length;
  return (
    (!text.startsWith(' (', end) || (withWorkflow && EVENT_SUFFIX.test(text.slice(end)))) &&
    !longer.some((l) =>
      boundedAt(text, l, JOB_NAME_CHAR).some((from) => from <= at && end <= from + l.length),
    )
  );
}

// A job named with its workflow, as GitHub displays a check run of a workflow (DRAFT 0.2.0, D.6).
export interface WorkflowJob {
  workflow: string;
  job: string;
}

const longest = (names: readonly string[]) => [...names].sort((a, b) => b.length - a.length)[0];

// The check run name of the record that a text names whole at `at`, directly after `<workflow> / `,
// as a job name is matched above, the longest if two are; or undefined.
function jobAt(text: string, at: number, jobNames: readonly string[]): string | undefined {
  return longest(
    jobNames.filter((name) => {
      const longer = jobNames.filter((n) => n.length > name.length && n.includes(name));
      return (
        boundedAt(text, name, JOB_NAME_CHAR).includes(at) &&
        jobNamedAt(text, name, at, longer, true)
      );
    }),
  );
}

// The workflow a text names before the ` / ` at `slash`: the longest of the record's workflow names
// and paths (`workflows`) that the text holds whole there, ending at `slash` with no path character
// directly before it; or else `token`, the run of non-space characters before the ` / `, which then
// names no workflow of the record. A name may hold spaces ("Continuous Integration").
function workflowBefore(
  text: string,
  slash: number,
  token: string,
  workflows: readonly string[],
): string {
  const whole = workflows.filter((w) => {
    const from = slash - w.length;
    return (
      w.length > 0 &&
      from >= 0 &&
      text.startsWith(w, from) &&
      !PATH_CHAR.test(text[from - 1] ?? ' ')
    );
  });
  return longest(whole) ?? token;
}

// Each `<workflow> / <job>` in a text, or `<workflow> / <job> (<event>)` for an event of
// CHECK_RUN_EVENTS: the workflow is what the text names before a space, a slash and a space
// (workflowBefore), and the job is a check run name of the record that the text names whole directly
// after them (jobAt). Nothing else in the text names a workflow, and a workflow is never guessed
// from the words around a job.
export function workflowJobs(
  text: string,
  jobNames: readonly string[],
  workflows: readonly string[] = [],
): WorkflowJob[] {
  const out: WorkflowJob[] = [];
  for (const m of text.matchAll(WORKFLOW_JOB)) {
    const at = (m.index as number) + m[0].length;
    const job = jobAt(text, at, jobNames);
    if (job === undefined) continue;
    out.push({ workflow: workflowBefore(text, at - 3, m[1] as string, workflows), job });
  }
  return out;
}

const PARENTHESIS = /^ \([^()]*\)/;

// Each job a text names after `<workflow> / ` followed by a parenthesis that names nothing the
// record holds: `<job> (<anything>)`, where `<job>` is a check run name of the record, `<job>
// (<anything>)` is not, and `<anything>` is not an event of CHECK_RUN_EVENTS. Such a text names a
// leg or an event the record does not hold, so it names no run of the job (D.6 step 5). The job,
// the longest if two are, once per place.
export function unheldSuffixJobs(text: string, jobNames: readonly string[]): string[] {
  const out: string[] = [];
  for (const at of afterWorkflows(text)) {
    if (jobAt(text, at, jobNames) !== undefined) continue;
    const job = longest(
      jobNames.filter((name) => {
        const rest = text.slice(at + name.length);
        return (
          boundedAt(text, name, JOB_NAME_CHAR).includes(at) &&
          PARENTHESIS.test(rest) &&
          !EVENT_SUFFIX.test(rest)
        );
      }),
    );
    if (job !== undefined) out.push(job);
  }
  return out;
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

  // A bare name held by two or more test cases, under different classnames, and named by the bare
  // name only: if the text also names one or more of their classnames, apart from the name, the
  // name then names the cases under those classnames only. If it names none, every case is named.
  // A classname shorter than MIN_NAME_LENGTH as recorded ("io") never restricts: an ordinary word
  // would name it.
  const classnameOf = (item: RecordItem) => item.fields.find(([f]) => f === 'classname')?.[1];
  const classnames = [
    ...new Set(items.filter((item) => item.type === 'test').map(classnameOf)),
  ].filter((c) => c !== undefined);
  const bareNamed = new Map<string, RecordItem[]>();
  for (const item of items) {
    const name = item.fields[0]?.[1] as string;
    if (
      item.type !== 'test' ||
      name.length < MIN_NAME_LENGTH ||
      qualifiedNames.has(name) ||
      !named(name, WORD)
    )
      continue;
    bareNamed.set(name, [...(bareNamed.get(name) ?? []), item]);
  }
  const namedClassnames = new Map<string, Set<string>>();
  for (const [name, cases] of bareNamed) {
    if (cases.length < 2) continue;
    const said = cases
      .map(classnameOf)
      .filter(
        (c): c is string =>
          c !== undefined &&
          c.length >= MIN_NAME_LENGTH &&
          texts.some((t) => classnameNamed(t, c, classnames)),
      );
    if (said.length > 0) namedClassnames.set(name, new Set(said));
  }
  const underNamedClassname = (item: RecordItem, name: string) => {
    const said = namedClassnames.get(name);
    const classname = classnameOf(item);
    return said === undefined || (classname !== undefined && said.has(classname));
  };

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
            (!qualifiedNames.has(value) || qualified(item)) &&
            underNamedClassname(item, value);
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

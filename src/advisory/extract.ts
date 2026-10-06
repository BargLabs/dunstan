// The advisory extractor (spec/claim-format.md, "DRAFT 0.2.0", D.11; docs/advisory.md). It reads a
// prose report and proposes claims, but only where a token is bound to a clause with an asserting
// verb: a path that merely appears in a report is not a claim that the path changed. The grammar is
// written down in grammar.ts as word lists, and binding is by proximity within a clause. No model,
// no clock, no network: the same text always gives the same claims.
//
// Not read at all: fenced code blocks, quoted lines, log lines and HTML comments. Read only when a
// clause asserts them: inline code and URLs, which are kept as single tokens.
//
// A claim is about this pull request's final state (extractor 0.1.2). A clause about another pull
// request or repository, a change made and undone, a baseline head, a negated list or a failure
// staged on purpose proposes nothing for it (GRAMMAR, "Attribution").

import { type AdvisoryKind, GRAMMAR } from './grammar.js';

export interface Span {
  // Code-unit offsets into the report text, end exclusive.
  start: number;
  end: number;
}

export interface ProposedClaim {
  // The clause the claim was bound in, as written, whitespace collapsed.
  clause: string;
  // The word that asserts it: a verb, a predicate such as "green", or "head".
  verb: string;
  kind: AdvisoryKind;
  value: string | number | boolean;
  span: Span;
}

const words = (list: readonly string[]) => new Set<string>(list);
const V = GRAMMAR.verbs;
const FILE_VERBS = words(V.file);
const CLOSE_VERBS = words(V.close);
const COMMIT_VERBS = words(V.commit);
const MERGED_VERBS = words(V.merged);
const RAN_VERBS = words(V.ran);
const PASS = words(V.pass);
const FAIL = words(V.fail);
const ALL_VERBS = words([
  ...V.file,
  ...V.close,
  ...V.commit,
  ...V.merged,
  ...V.ran,
  ...V.pass,
  ...V.fail,
  ...V.other,
]);
const MODALS = words(GRAMMAR.modals);
const NEGATIONS = words(GRAMMAR.negations);
const DETERMINERS = words(GRAMMAR.determiners);
const SUBJECT_DETERMINERS = words(GRAMMAR.subjectDeterminers);
const SUBORDINATORS = words(GRAMMAR.subordinators);
const CONDITIONALS = words(GRAMMAR.conditionals);
const NOUN_PREPOSITIONS = words(GRAMMAR.nounPrepositions);
const CLOSE_FILLERS = words(GRAMMAR.closeFillers);
const MERGED_FILLERS = words(GRAMMAR.mergedFillers);
const PREDICATE_FILLERS = words(GRAMMAR.predicateFillers);
const PASSIVE_FILLERS = words(GRAMMAR.passiveFillers);
const OBJECT_FILLERS = words(GRAMMAR.objectFillers);
const COUNT_FILLERS = words(GRAMMAR.countFillers);
const EXCEPTIONS = words(GRAMMAR.exceptions);
const HEAD_FILLERS = words(GRAMMAR.headFillers);
const COMMAND_WORDS = words(GRAMMAR.commandWords);
const SHA_BLOCKERS = words(GRAMMAR.shaBlockers);
const COMMIT_NOUNS = words(GRAMMAR.commitNouns);
const CHECKS_NOUNS = words(GRAMMAR.checksNouns);
const CHECKS_QUALIFIERS = words(GRAMMAR.checksQualifiers);
const TESTS_NOUNS = words(GRAMMAR.testsNouns);
const EXTENSIONLESS = words(GRAMMAR.extensionlessFiles);
const HOST_EXTENSIONS = words(GRAMMAR.hostExtensions);
const LOG_LEVELS = words(GRAMMAR.logLevels);
const phrases = (list: readonly string[]) => list.map((phrase) => phrase.split(' '));
const ANALOGUES = phrases(GRAMMAR.analogues);
const SELF_NAMES = phrases(GRAMMAR.selfNames);
const REPOSITORY_NOUNS = words(GRAMMAR.repositoryNouns);
const OWN_REPOSITORY = words(GRAMMAR.ownRepository);
const PRONOUNS = words(GRAMMAR.pronouns);
const POSSESSIVES = words(GRAMMAR.possessives);
const TRANSIENTS = phrases(GRAMMAR.transients);
const BASELINES = words(GRAMMAR.baselines);
const NARRATIONS = phrases(GRAMMAR.narrations);
const NARRATION_OPENERS = words(GRAMMAR.narrationOpeners);
const FINAL_STATES = phrases(GRAMMAR.finalStates);
// Each closing bracket, and the opening bracket it closes.
const CLOSERS = new Map(GRAMMAR.brackets.map((pair) => [pair[1] as string, pair[0] as string]));
const OPENERS = new Set(CLOSERS.values());
const WINDOW = GRAMMAR.window;

// ---------------------------------------------------------------- masking

interface Prepared {
  // The report with every unread region blanked to spaces (newlines kept), so offsets stay the
  // report's own.
  text: string;
  // Inline code contents and URLs, by start offset: each is one token.
  atoms: Map<number, { end: number; kind: 'code' | 'url' }>;
}

function isLogLine(line: string): boolean {
  const body = line.replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+/, '').trimStart();
  if (/^(?:\$\s|\[[^\]]*\]|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|[✓✗×✔✘❯›])/.test(body)) return true;
  if (/^(?:error|warning|Error|Warning)(?:\s+TS\d+)?:/.test(body)) return true;
  const first = /^[^\s:]+/.exec(body)?.[0] ?? '';
  return LOG_LEVELS.has(first);
}

function prepare(report: string): Prepared {
  const chars = report.split('');
  const blank = (start: number, end: number) => {
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  };

  let offset = 0;
  let fence: { char: string; length: number } | undefined;
  for (const line of report.split('\n')) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (fence !== undefined) {
      blank(start, end);
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      if (close !== undefined && close[0] === fence.char && close.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open !== undefined) {
      fence = { char: open[0] as string, length: open.length };
      blank(start, end);
    } else if (/^ {0,3}>/.test(line) || isLogLine(line)) {
      blank(start, end);
    }
  }

  let text = chars.join('');
  for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) blank(m.index, m.index + m[0].length);
  text = chars.join('');

  const atoms: Prepared['atoms'] = new Map();
  const inAtom = new Uint8Array(text.length);
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const content = m[1] as string;
    const lead = content.length - content.trimStart().length;
    const trimmed = content.trim();
    chars[m.index] = ' ';
    chars[m.index + m[0].length - 1] = ' ';
    if (trimmed === '') continue;
    const start = m.index + 1 + lead;
    atoms.set(start, { end: start + trimmed.length, kind: 'code' });
    inAtom.fill(1, start, start + trimmed.length);
  }
  text = chars.join('');
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>()[\]`"']+/g)) {
    if (inAtom[m.index] === 1) continue;
    const url = m[0].replace(/[.,;:!?]+$/, '');
    atoms.set(m.index, { end: m.index + url.length, kind: 'url' });
  }
  return { text, atoms };
}

// ---------------------------------------------------------------- clauses and words

interface Word {
  text: string;
  // Lower-cased text; empty for inline code and URLs, which are never verbs.
  lower: string;
  start: number;
  end: number;
  // The end of the word as written, its trailing punctuation included.
  rawEnd: number;
  // The offset of the innermost bracket still open at the word, or -1.
  bracket: number;
  atom?: 'code' | 'url';
}

// Punctuation and emphasis around a word. Underscores are kept: `__snapshots__/` is a path.
const LEADING = /^[(["'*<{~]+/;
const TRAILING = /[)\]}"'*>~,.;:!?]+$/;

function makeWord(
  raw: string,
  start: number,
  atom: 'code' | 'url' | undefined,
  bracketAt: (offset: number) => number,
): Word | undefined {
  const rawEnd = start + raw.length;
  if (atom !== undefined) {
    return { text: raw, lower: '', start, end: rawEnd, rawEnd, bracket: bracketAt(start), atom };
  }
  const lead = LEADING.exec(raw)?.[0].length ?? 0;
  const text = raw.slice(lead).replace(TRAILING, '');
  if (text === '') return undefined;
  const begin = start + lead;
  return {
    text,
    lower: text.toLowerCase(),
    start: begin,
    end: begin + text.length,
    rawEnd,
    bracket: bracketAt(begin),
  };
}

// The innermost bracket still open at an offset, or -1, asked for at increasing offsets. A closing
// bracket closes only its own kind. Inline code and URLs are skipped, and so are the brackets of a
// markdown link's [text](target): the text names the thing itself, it is not an aside.
function bracketCursor(prep: Prepared): (offset: number) => number {
  const { text, atoms } = prep;
  const links = new Set<number>();
  for (const m of text.matchAll(/\[[^[\]\n]*\]\(/g)) {
    links.add(m.index);
    links.add(m.index + m[0].length - 2);
  }
  const open: number[] = [];
  let p = 0;
  return (offset) => {
    while (p < offset) {
      const atom = atoms.get(p);
      if (atom !== undefined) {
        p = atom.end;
        continue;
      }
      const ch = text[p] as string;
      if (!links.has(p)) {
        if (OPENERS.has(ch)) open.push(p);
        else if (CLOSERS.has(ch) && text[open.at(-1) ?? -1] === CLOSERS.get(ch)) open.pop();
      }
      p++;
    }
    return open.at(-1) ?? -1;
  };
}

// Splits the prepared text into clauses: at . ; : ! ? ending a word, at a blank line, at a list
// item, heading or table cell, and before a subordinating word. A soft-wrapped line continues its
// clause. A colon after a closing keyword ("Fixes: #12") does not end it. A clause ending in a
// question mark asks; it asserts nothing and is dropped.
function clausesOf(prep: Prepared): Word[][] {
  const { text, atoms } = prep;
  const bracketAt = bracketCursor(prep);
  const clauses: Word[][] = [];
  let current: Word[] = [];
  const flush = (question = false) => {
    if (current.length > 0 && !question) clauses.push(current);
    current = [];
  };
  let blockLine = false;
  let i = 0;
  let gapStart = 0;
  while (i < text.length) {
    const atom = atoms.get(i);
    if (atom === undefined && /\s/.test(text[i] as string)) {
      i++;
      continue;
    }
    let end = atom?.end ?? i;
    if (atom === undefined) {
      while (end < text.length && !/\s/.test(text[end] as string) && !atoms.has(end)) end++;
    }
    const gap = text.slice(gapStart, i);
    let back = i;
    while (back > 0 && /[ \t\r]/.test(text[back - 1] as string)) back--;
    const lineStart = back === 0 || text[back - 1] === '\n';
    if (/\n[ \t\r]*\n/.test(gap)) flush();
    if (gap.includes('\n')) {
      if (blockLine) flush();
      blockLine = false;
    }
    const raw = text.slice(i, end);
    if (atom === undefined) {
      const marker = lineStart && /^(?:[-*+]|\d{1,3}[.)]|#{1,6})$/.test(raw);
      if (marker || /^\|+$/.test(raw)) {
        flush();
        if (lineStart && /^[#|]/.test(raw)) blockLine = true;
        gapStart = end;
        i = end;
        continue;
      }
      if (lineStart && raw.startsWith('|')) blockLine = true;
    }
    const word = makeWord(raw, i, atom?.kind, bracketAt);
    if (word !== undefined) {
      if (current.length > 0 && SUBORDINATORS.has(word.lower)) flush();
      current.push(word);
    }
    if (atom === undefined) {
      const stop = raw.replace(/["')\]*_]+$/, '').slice(-1);
      if (
        /[.;:!?]/.test(stop) &&
        !(stop === ':' && word !== undefined && CLOSE_VERBS.has(word.lower))
      ) {
        flush(stop === '?');
      }
    }
    gapStart = end;
    i = end;
  }
  flush();
  return clauses;
}

// ---------------------------------------------------------------- token classes

type Token =
  | { cls: 'path'; value: string }
  | { cls: 'issue'; value: string }
  | { cls: 'sha'; value: string }
  | { cls: 'timestamp'; value: string }
  | { cls: 'int'; value: number }
  | { cls: 'word' };

const ISSUE = /^(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?#[1-9][0-9]{0,9}$/;
const ISSUE_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})\/(?:issues|pull)\/([1-9][0-9]{0,9})\/?$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;

// A repository-relative file path, or undefined. A file needs an extension, or a name such as
// Makefile; a bare name (no '/') must also look like a file name, not a product or a host name. A
// hidden directory such as .github/ may lead a path.
export function repoPath(token: string, inCode: boolean): string | undefined {
  const path = token
    .replace(/^\.\//, '')
    .replace(/(?::[0-9]+){1,2}$/, '')
    .replace(/\([0-9]+(?:,[0-9]+)?\)?$/, '');
  if (!/^\.?[A-Za-z0-9_][A-Za-z0-9_.+/-]*$/.test(path)) return undefined;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return undefined;
  const last = segments[segments.length - 1] as string;
  const named = EXTENSIONLESS.has(last);
  const extension = /^\.?[A-Za-z0-9_][A-Za-z0-9_.+-]*\.([A-Za-z][A-Za-z0-9]{0,9})$/.exec(last)?.[1];
  if (!named && extension === undefined) return undefined;
  const host = /\.([a-z]+)$/.exec(segments[0] as string)?.[1];
  if (segments.length > 1 && host !== undefined && HOST_EXTENSIONS.has(host)) return undefined;
  if (segments.length === 1 && named && !inCode) return undefined;
  if (segments.length === 1 && !named) {
    if (HOST_EXTENSIONS.has((extension as string).toLowerCase())) return undefined;
    const fileLike =
      /^[a-z0-9][a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.[a-z][a-z0-9]{0,9}$/.test(last) ||
      /^[A-Z][A-Z0-9_-]+\.[a-z]{1,4}$/.test(last);
    if (!inCode && !fileLike) return undefined;
  }
  return path;
}

function classify(word: Word): Token {
  if (word.atom === 'url') {
    const m = ISSUE_URL.exec(word.text);
    return m === null ? { cls: 'word' } : { cls: 'issue', value: `${m[1]}#${m[2]}` };
  }
  // Inline code holding a phrase or a command is never a token.
  if (word.atom === 'code' && /\s/.test(word.text)) return { cls: 'word' };
  const t = word.text;
  if (ISSUE.test(t)) return { cls: 'issue', value: t };
  if (TIMESTAMP.test(t)) return { cls: 'timestamp', value: t };
  // A SHA has a digit and a letter: an all-decimal run or user id is never one.
  if (/^[0-9a-fA-F]{7,40}$/.test(t) && /[0-9]/.test(t) && /[a-fA-F]/.test(t)) {
    return { cls: 'sha', value: t.toLowerCase() };
  }
  if (/^[0-9]{1,6}$/.test(t) && word.atom === undefined) return { cls: 'int', value: Number(t) };
  const path = repoPath(t, word.atom === 'code');
  return path === undefined ? { cls: 'word' } : { cls: 'path', value: path };
}

// ---------------------------------------------------------------- binding

class Clause {
  readonly tokens: Token[];
  // The clause narrates a failure staged on purpose (GRAMMAR.narrations).
  narrated = false;
  constructor(readonly words: Word[]) {
    this.tokens = words.map(classify);
  }

  lower(i: number): string {
    return this.words[i]?.lower ?? '';
  }

  // One of the phrases starts at k.
  phraseAt(k: number, list: readonly string[][]): boolean {
    return list.some((phrase) => phrase.every((w, n) => this.lower(k + n) === w));
  }

  // One of the phrases starts at or after `from` and before `to`.
  holds(list: readonly string[][], from = 0, to = this.words.length): boolean {
    for (let k = from; k < to; k++) if (this.phraseAt(k, list)) return true;
    return false;
  }

  // A verb form after a determiner is an adjective or a noun: "the updated docs", "the fix".
  nominal(i: number): boolean {
    const before = this.lower(i - 1);
    if (!DETERMINERS.has(before)) return false;
    return !(SUBJECT_DETERMINERS.has(before) && this.lower(i).endsWith('s'));
  }

  isVerb(i: number): boolean {
    return ALL_VERBS.has(this.lower(i)) && !this.nominal(i);
  }

  isNegation(i: number): boolean {
    const l = this.lower(i);
    return NEGATIONS.has(l) || l.endsWith("n't");
  }

  isModal(i: number): boolean {
    const l = this.lower(i);
    return MODALS.has(l) || l.endsWith("'ll");
  }

  // The verb at i reports a fact: not an infinitive, an adjective, a plan or a noun.
  asserting(i: number): boolean {
    if (this.lower(i - 1) === 'to' || this.nominal(i)) return false;
    for (let k = i - 1; k >= Math.max(0, i - 3) && !this.isVerb(k); k--) {
      if (this.isModal(k) || this.isNegation(k)) return false;
    }
    const l = this.lower(i);
    if (i === 0 && l.endsWith('s') && NOUN_PREPOSITIONS.has(this.lower(1))) return false;
    return true;
  }

  // An analogue phrase starts at k and ends before j.
  analogue(k: number, j: number): boolean {
    return ANALOGUES.some(
      (phrase) => k + phrase.length <= j && phrase.every((w, n) => this.lower(k + n) === w),
    );
  }

  // The nearest verb to the left of j, if no negation, modal or infinitive stands between, and it
  // is within the window. Tokens of the same class (a list) do not count toward the window. For a
  // path, a bracket still open at it and an analogue phrase are barriers too.
  leftVerb(j: number, cls: Token['cls']): number | undefined {
    const bracket = cls === 'path' ? (this.words[j] as Word).bracket : -1;
    let distance = 0;
    for (let k = j - 1; k >= 0; k--) {
      if ((this.words[k] as Word).start < bracket) return undefined;
      if (this.isVerb(k)) return k;
      if (this.isNegation(k) || this.isModal(k)) return undefined;
      if (cls === 'path' && this.analogue(k, j)) return undefined;
      // "to" before a word is an infinitive ("to point at"); before a token, a number or a
      // determiner it is a preposition ("moved it to src/b.ts", "from 1.2 to 1.3").
      if (this.lower(k) === 'to' && k + 1 < j) {
        const next = this.lower(k + 1);
        if (/^[a-z]+$/.test(next) && !DETERMINERS.has(next)) return undefined;
      }
      if (this.tokens[k]?.cls === cls) continue;
      distance++;
      if (distance > WINDOW) return undefined;
    }
    return undefined;
  }

  // The verb at k binds: it is asserting and one of `verbs`.
  binds(k: number | undefined, verbs: ReadonlySet<string>): k is number {
    return k !== undefined && verbs.has(this.lower(k)) && this.asserting(k);
  }
}

function clauseText(report: string, words: Word[]): string {
  const first = words[0] as Word;
  const last = words[words.length - 1] as Word;
  const text = report.slice(first.start, last.rawEnd).replace(/\s+/g, ' ').trim();
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

type Emit = (kind: AdvisoryKind, value: ProposedClaim['value'], verb: number, span: Span) => void;

function bindPath(c: Clause, j: number, value: string, emit: Emit): void {
  // A path in a command ("node scripts/build.mjs", "--config tsconfig.json") is not a file claim.
  for (let k = j - 1; k >= Math.max(0, j - 3) && !c.isVerb(k); k--) {
    const l = c.lower(k);
    if (COMMAND_WORDS.has(l) || l.startsWith('-')) return;
  }
  const word = c.words[j] as Word;
  const span = { start: word.start, end: word.end };
  // A denied passive denies the path whatever stands before it: "and src/b.ts was not touched".
  const passive = passiveAt(c, j);
  if (passive === -1) return;
  const k = c.leftVerb(j, 'path');
  if (c.binds(k, FILE_VERBS)) {
    emit('file_changed', value, k, span);
    return;
  }
  // The passive: "src/a.ts was updated". A negation before the list the path ends covers every path
  // in it: "none of a.sh, b.sh were touched".
  if (passive !== undefined && !negatedList(c, j)) emit('file_changed', value, passive, span);
}

// The participle of a passive after the path at j, with one or more `passiveFillers` between: its
// index, or -1 if a negation stands between ("src/b.ts was not touched"), or undefined.
function passiveAt(c: Clause, j: number): number | undefined {
  let denied = false;
  for (let r = j + 1; r <= j + 4 && r < c.words.length; r++) {
    const l = c.lower(r);
    if (FILE_VERBS.has(l) && (l.endsWith('ed') || l === 'rewritten')) {
      if (r === j + 1) return undefined;
      return denied ? -1 : r;
    }
    if (c.isNegation(r)) denied = true;
    else if (!PASSIVE_FILLERS.has(l)) return undefined;
  }
  return undefined;
}

// A paths list ending at j is negated: a negation within three words before its first path, with
// no verb between.
function negatedList(c: Clause, j: number): boolean {
  let distance = 0;
  for (let k = j - 1; k >= 0; k--) {
    if (c.tokens[k]?.cls === 'path') continue;
    if (c.isNegation(k)) return true;
    if (c.isVerb(k) || ++distance > 3) return false;
  }
  return false;
}

// The closing keyword an issue at j is bound to, asserting or not, with only issues and
// `closeFillers` between them.
function closingVerb(c: Clause, j: number): number | undefined {
  for (let k = j - 1; k >= 0; k--) {
    const l = c.lower(k);
    if (CLOSE_VERBS.has(l)) return k;
    if (c.tokens[k]?.cls !== 'issue' && !CLOSE_FILLERS.has(l)) return undefined;
  }
  return undefined;
}

function bindIssue(c: Clause, j: number, value: string, emit: Emit): void {
  const k = closingVerb(c, j);
  if (k !== undefined && c.asserting(k)) emit('reference_closes', value, k, c.words[j] as Word);
}

// The first word of the clause that names another pull request or repository, or -1: an issue
// (or its possessive, "#10's") that no closing keyword binds and that is not this pull request's
// own, or a repository noun with no `ownRepository` word directly before it.
function elsewhereAt(c: Clause): number {
  for (let j = 0; j < c.words.length; j++) {
    const word = c.words[j] as Word;
    const issue =
      c.tokens[j]?.cls === 'issue' ||
      (word.atom === undefined && ISSUE.test(word.text.replace(/['’]s$/, '')));
    if (issue) {
      const own = SELF_NAMES.some((p) => p.length <= j && c.phraseAt(j - p.length, [p]));
      if (!own && closingVerb(c, j) === undefined) return j;
    } else if (REPOSITORY_NOUNS.has(c.lower(j)) && j > 0 && !OWN_REPOSITORY.has(c.lower(j - 1))) {
      return j;
    }
  }
  return -1;
}

// A word before j that makes a SHA a baseline or an earlier head.
function baselineBefore(c: Clause, j: number): boolean {
  for (let k = 0; k < j; k++) {
    const text = (c.words[k] as Word).text.toLowerCase();
    if (BASELINES.has(c.lower(k))) return true;
    if (GRAMMAR.remotePrefixes.some((p) => text.startsWith(p))) return true;
  }
  return false;
}

function bindSha(c: Clause, j: number, value: string, emit: Emit): void {
  if (SHA_BLOCKERS.has(c.lower(j - 1)) || SHA_BLOCKERS.has(c.lower(j - 2))) return;
  const span = c.words[j] as Word;
  for (let k = j - 1; k >= Math.max(0, j - 3); k--) {
    const l = c.lower(k);
    if (l === 'head') {
      if (!baselineBefore(c, j)) emit('head_commit', value, k, span);
      return;
    }
    if (!HEAD_FILLERS.has(l)) break;
  }
  const k = c.leftVerb(j, 'sha');
  if (k === undefined || !c.asserting(k)) return;
  const verb = c.lower(k);
  const afterNoun =
    COMMIT_NOUNS.has(c.lower(j - 1)) &&
    (FILE_VERBS.has(verb) || CLOSE_VERBS.has(verb) || MERGED_VERBS.has(verb));
  if (COMMIT_VERBS.has(verb) || afterNoun) emit('commit', value, k, span);
}

function bindTimestamp(c: Clause, j: number, value: string, emit: Emit): void {
  for (let k = j - 1; k >= 0; k--) {
    const l = c.lower(k);
    if (MERGED_VERBS.has(l)) {
      if (c.asserting(k)) emit('merged_at', value, k, c.words[j] as Word);
      return;
    }
    if (!MERGED_FILLERS.has(l)) return;
  }
}

// A subject (CI, checks, tests) and the predicate after it: "all 42 tests pass", "CI is green".
// "the lint checks pass" names some checks, not all, and is not read.
function bindSubject(c: Clause, i: number, emit: Emit): void {
  const l = c.lower(i);
  const checkRuns = l === 'runs' && c.lower(i - 1) === 'check';
  const checks = CHECKS_NOUNS.has(l) || checkRuns;
  if (!checks && !TESTS_NOUNS.has(l)) return;
  let first = checkRuns ? i - 1 : i;
  let count: number | undefined;
  const before = c.tokens[first - 1];
  if (before?.cls === 'int') {
    count = before.value;
    first--;
  }
  if (checks && first > 0) {
    const q = c.lower(first - 1);
    if (!CHECKS_QUALIFIERS.has(q) && !c.isVerb(first - 1)) return;
  }
  // A negated subject is not read: "none of the tests fail", "not all checks pass".
  for (let k = first - 1; k >= Math.max(0, first - 4) && !c.isVerb(k); k--) {
    if (c.isNegation(k)) return;
  }
  const kind = checks ? 'checks_succeeded' : 'tests_passed';

  // The object form: "passed CI", "passes all tests".
  for (let k = first - 1; k >= Math.max(0, first - 3); k--) {
    if (PASS.has(c.lower(k))) {
      const narrowed = EXCEPTIONS.has(c.lower(i + 1)) || EXCEPTIONS.has(c.lower(i + 2));
      const staged = c.narrated && !c.phraseAt(i + 1, FINAL_STATES);
      if (c.asserting(k) && !narrowed && !staged) emit(kind, true, k, spanOf(c, k, i));
      return;
    }
    if (!OBJECT_FILLERS.has(c.lower(k))) break;
  }

  let negated = false;
  for (let r = i + 1; r <= i + 4 && r < c.words.length; r++) {
    const p = c.lower(r);
    if (PASS.has(p) || FAIL.has(p)) {
      if (EXCEPTIONS.has(c.lower(r + 1)) || EXCEPTIONS.has(c.lower(r + 2))) return;
      // A narrated failure proposes no false value and no count: only a pass predicate followed
      // directly by a final state, "red without the guard, green with it", and not denied or
      // planned in the two words before it ("does not pass now").
      if (c.narrated) {
        for (let s = r; s < c.words.length; s++) {
          const denied = [s - 1, s - 2].some(
            (k) => (c.isNegation(k) || c.isModal(k)) && c.lower(k) !== 'without',
          );
          if (PASS.has(c.lower(s)) && c.phraseAt(s + 1, FINAL_STATES) && !denied) {
            emit(kind, true, s, spanOf(c, first, s));
            return;
          }
        }
        return;
      }
      const value = PASS.has(p) !== negated;
      const span = spanOf(c, first, r);
      if (checks) {
        emit('checks_succeeded', value, r, span);
        if (count !== undefined && value) emit('check_count', count, r, span);
      } else {
        emit('tests_passed', value, r, span);
        if (count !== undefined && value) emit('test_count', count, r, span);
      }
      return;
    }
    if (c.isNegation(r)) negated = !negated;
    else if (!PREDICATE_FILLERS.has(p)) return;
  }
}

// "Ran 42 tests": a count of tests executed.
function bindRan(c: Clause, k: number, emit: Emit): void {
  if (!RAN_VERBS.has(c.lower(k)) || !c.asserting(k) || c.narrated) return;
  for (let j = k + 1; j <= k + 3 && j + 1 < c.words.length; j++) {
    const token = c.tokens[j];
    if (token?.cls === 'int' && TESTS_NOUNS.has(c.lower(j + 1))) {
      emit('test_count', token.value, k, spanOf(c, j, j + 1));
      return;
    }
    if (!COUNT_FILLERS.has(c.lower(j))) return;
  }
}

function spanOf(c: Clause, from: number, to: number): Span {
  return { start: (c.words[from] as Word).start, end: (c.words[to] as Word).end };
}

// The clause after `words` opens with a word of `narrationOpeners` and continues the same sentence:
// "the new tests failed before the fix".
function openedByNarration(prep: Prepared, words: Word[], next: Word[] | undefined): boolean {
  const first = next?.[0];
  const last = words[words.length - 1] as Word;
  if (first === undefined || !NARRATION_OPENERS.has(first.lower)) return false;
  const stop = prep.text.slice(last.start, last.rawEnd).replace(/["')\]*_]+$/, '');
  return (
    !/[.;:!?]$/.test(stop) && /^[ \t]*\n?[ \t]*$/.test(prep.text.slice(last.rawEnd, first.start))
  );
}

export function extractClaims(report: string): ProposedClaim[] {
  const out: ProposedClaim[] = [];
  const seen = new Set<string>();
  const prep = prepare(report);
  const clauses = clausesOf(prep);
  // The clause before was about another pull request or repository.
  let elsewhereBefore = false;
  clauses.forEach((words, n) => {
    const c = new Clause(words);
    // From the word at `elsewhere` on, the clause is about another pull request or repository. A
    // subject pronoun or a possessive carries that over from the clause before: "Its head is …".
    let elsewhere = elsewhereAt(c);
    const refers = PRONOUNS.has(c.lower(0)) || words.some((w) => POSSESSIVES.has(w.lower));
    if (elsewhere < 0 && elsewhereBefore && refers) elsewhere = 0;
    elsewhereBefore = elsewhere >= 0;
    // A conditional clause ("if tests pass") asserts nothing, and neither does a change made and
    // undone ("temporarily removed …").
    if (CONDITIONALS.has(c.lower(0)) || c.holds(TRANSIENTS)) return;
    c.narrated =
      words.some((w) => FAIL.has(w.lower)) &&
      (c.holds(NARRATIONS) || openedByNarration(prep, words, clauses[n + 1]));
    const clause = clauseText(report, words);
    const emit: Emit = (kind, value, verb, span) => {
      // Nothing in the clause is this pull request's, but a closing keyword before the other
      // reference: "Closes #12, a follow-up to #10".
      if (elsewhere >= 0 && !(kind === 'reference_closes' && verb < elsewhere)) return;
      const key = `${kind}\u0000${JSON.stringify(value)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        clause,
        verb: c.lower(verb),
        kind,
        value,
        span: { start: span.start, end: span.end },
      });
    };
    c.tokens.forEach((token, j) => {
      switch (token.cls) {
        case 'path':
          bindPath(c, j, token.value, emit);
          break;
        case 'issue':
          bindIssue(c, j, token.value, emit);
          break;
        case 'sha':
          bindSha(c, j, token.value, emit);
          break;
        case 'timestamp':
          bindTimestamp(c, j, token.value, emit);
          break;
        case 'word':
          bindSubject(c, j, emit);
          bindRan(c, j, emit);
          break;
        case 'int':
          break;
      }
    });
  });
  return out;
}

// Counts test cases in a JUnit XML report (spec section 7.5). A test case is a `testcase` element; it
// is executed unless it has a `skipped` child, and failed if it is executed and has a `failure` or
// `error` child. Suite-level count attributes are not read. The file is read for element counts only.
//
// The reader is a small strict XML tokenizer: it requires well-formed XML (one root, balanced tags,
// quoted attributes, known entities) and refuses a DOCTYPE outright, so no entity expansion happens.
// Anything else is a JunitError, which makes the artifact read unreadable.

export class JunitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JunitError';
  }
}

export interface JunitCounts {
  executed: number;
  failed: number;
}

// Where the root element is in the text, in UTF-16 offsets: `start` at its `<`, `end` past its last
// `>`, and its content between `contentStart` and `contentEnd` (equal for an empty or self-closing
// root). `dunstan junit-merge` copies by these offsets (src/junit/merge.ts); the counts are read here
// once.
export interface JunitRoot {
  name: 'testsuites' | 'testsuite';
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
}

export interface JunitScan extends JunitCounts {
  root: JunitRoot;
}

export function countJunit(xml: string): JunitCounts {
  const { executed, failed } = scanJunit(xml);
  return { executed, failed };
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ENTITY = /&(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/y;

interface Frame {
  name: string;
  testcase?: { skipped: boolean; failed: boolean };
}

// The one JUnit reader: counts and the root's offsets, or a JunitError.
export function scanJunit(xml: string): JunitScan {
  let pos = xml.startsWith('﻿') ? 1 : 0;
  const stack: Frame[] = [];
  let roots = 0;
  let executed = 0;
  let failed = 0;
  // The tag being read starts here; the root's offsets are taken from it.
  let tagStart = 0;
  let root: JunitRoot | undefined;

  const fail = (message: string): never => {
    throw new JunitError(`${message} at offset ${pos}`);
  };

  const checkText = (text: string, start: number) => {
    for (let i = text.indexOf('&'); i !== -1; i = text.indexOf('&', i + 1)) {
      ENTITY.lastIndex = i;
      if (!ENTITY.test(text)) {
        pos = start + i;
        fail('bad entity reference');
      }
    }
  };

  const readName = (): string => {
    NAME.lastIndex = pos;
    const match = NAME.exec(xml);
    if (match === null) return fail('expected a name');
    pos += match[0].length;
    return match[0];
  };

  const skipSpace = () => {
    while (pos < xml.length && /[ \t\r\n]/.test(xml[pos] as string)) pos++;
  };

  const open = (name: string) => {
    if (stack.length === 0) {
      roots++;
      if (roots > 1) fail('more than one root element');
      if (name !== 'testsuites' && name !== 'testsuite') fail(`root element is <${name}>`);
      root = {
        name: name as JunitRoot['name'],
        start: tagStart,
        end: pos,
        contentStart: pos,
        contentEnd: pos,
      };
    }
    const parent = stack.at(-1);
    if (parent?.testcase !== undefined) {
      if (name === 'skipped') parent.testcase.skipped = true;
      if (name === 'failure' || name === 'error') parent.testcase.failed = true;
    }
    stack.push(
      name === 'testcase' ? { name, testcase: { skipped: false, failed: false } } : { name },
    );
  };

  const close = (name: string) => {
    const frame = stack.pop();
    if (frame === undefined || frame.name !== name) fail(`unbalanced </${name}>`);
    const testcase = frame?.testcase;
    if (testcase !== undefined && !testcase.skipped) {
      executed++;
      if (testcase.failed) failed++;
    }
    // The root closed: a self-closing root keeps its empty content; an end tag ends it.
    if (stack.length === 0 && root !== undefined && root.end < pos) {
      root.contentEnd = tagStart;
      root.end = pos;
    }
  };

  while (pos < xml.length) {
    const lt = xml.indexOf('<', pos);
    const textEnd = lt === -1 ? xml.length : lt;
    const text = xml.slice(pos, textEnd);
    if (stack.length === 0 && text.trim() !== '') fail('text outside the root element');
    checkText(text, pos);
    if (text.includes(']]>')) fail("']]>' in text");
    pos = textEnd;
    if (lt === -1) break;
    tagStart = pos;

    if (xml.startsWith('<!--', pos)) {
      const end = xml.indexOf('-->', pos + 4);
      if (end === -1) fail('unterminated comment');
      pos = end + 3;
    } else if (xml.startsWith('<![CDATA[', pos)) {
      if (stack.length === 0) fail('CDATA outside the root element');
      const end = xml.indexOf(']]>', pos + 9);
      if (end === -1) fail('unterminated CDATA section');
      pos = end + 3;
    } else if (xml.startsWith('<!', pos)) {
      fail('DOCTYPE and other declarations are refused');
    } else if (xml.startsWith('<?', pos)) {
      const end = xml.indexOf('?>', pos + 2);
      if (end === -1) fail('unterminated processing instruction');
      pos = end + 2;
    } else if (xml.startsWith('</', pos)) {
      pos += 2;
      const name = readName();
      skipSpace();
      if (xml[pos] !== '>') fail("expected '>'");
      pos++;
      close(name);
    } else {
      pos++;
      const name = readName();
      const seen = new Set<string>();
      while (true) {
        const before = pos;
        skipSpace();
        if (xml.startsWith('/>', pos)) {
          pos += 2;
          open(name);
          close(name);
          break;
        }
        if (xml[pos] === '>') {
          pos++;
          open(name);
          break;
        }
        if (pos === before) fail('expected whitespace before an attribute');
        const attr = readName();
        if (seen.has(attr)) fail(`duplicate attribute ${attr}`);
        seen.add(attr);
        skipSpace();
        if (xml[pos] !== '=') fail("expected '='");
        pos++;
        skipSpace();
        const quote = xml[pos];
        if (quote !== '"' && quote !== "'") fail('unquoted attribute value');
        const end = xml.indexOf(quote as string, pos + 1);
        if (end === -1) fail('unterminated attribute value');
        const value = xml.slice(pos + 1, end);
        if (value.includes('<')) fail("'<' in an attribute value");
        checkText(value, pos + 1);
        pos = end + 1;
      }
    }
  }
  if (stack.length > 0) fail(`unclosed <${stack.at(-1)?.name}>`);
  if (roots === 0 || root === undefined) return fail('no root element');
  return { executed, failed, root };
}

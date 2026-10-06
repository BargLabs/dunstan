// A strict JSON reader for block content: RFC 8259 grammar plus the I-JSON (RFC 7493) rules the
// spec adopts. JSON.parse is not used because it keeps the last of two duplicate member names and
// accepts lone surrogates, and different parsers resolve both differently. A block one checker
// reads one way and another checker reads another way is not a declaration.

import { MAX_BLOCK_DEPTH } from './constants.js';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonErrorCode = 'invalid_json' | 'duplicate_member';

export class JsonReadError extends Error {
  readonly code: JsonErrorCode;
  readonly pointer: string | undefined;

  constructor(code: JsonErrorCode, message: string, pointer?: string) {
    super(message);
    this.name = 'JsonReadError';
    this.code = code;
    this.pointer = pointer;
  }
}

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

export function escapePointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function isWellFormedUtf16(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function parseStrictJson(text: string): JsonValue {
  let pos = 0;

  const fail = (message: string): never => {
    throw new JsonReadError('invalid_json', `${message} at offset ${pos}`);
  };

  const skipWhitespace = (): void => {
    while (pos < text.length) {
      const c = text[pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') pos++;
      else break;
    }
  };

  const readString = (): string => {
    pos++; // opening quote
    let out = '';
    while (true) {
      if (pos >= text.length) fail('unterminated string');
      const c = text[pos] as string;
      const unit = c.charCodeAt(0);
      if (c === '"') {
        pos++;
        break;
      }
      if (unit < 0x20) fail('unescaped control character in string');
      if (c !== '\\') {
        out += c;
        pos++;
        continue;
      }
      const e = text[pos + 1];
      pos += 2;
      switch (e) {
        case '"':
          out += '"';
          break;
        case '\\':
          out += '\\';
          break;
        case '/':
          out += '/';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'n':
          out += '\n';
          break;
        case 'r':
          out += '\r';
          break;
        case 't':
          out += '\t';
          break;
        case 'u': {
          const hex = text.slice(pos, pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad \\u escape');
          out += String.fromCharCode(Number.parseInt(hex, 16));
          pos += 4;
          break;
        }
        default:
          pos -= 2;
          fail('bad escape');
      }
    }
    if (!isWellFormedUtf16(out)) fail('string contains a lone surrogate');
    return out;
  };

  const readValue = (pointer: string, depth: number): JsonValue => {
    skipWhitespace();
    const c = text[pos];
    if (c === '{' || c === '[') {
      if (depth + 1 > MAX_BLOCK_DEPTH) fail(`nesting deeper than ${MAX_BLOCK_DEPTH}`);
      return c === '{' ? readObject(pointer, depth + 1) : readArray(pointer, depth + 1);
    }
    if (c === '"') return readString();
    if (text.startsWith('true', pos)) {
      pos += 4;
      return true;
    }
    if (text.startsWith('false', pos)) {
      pos += 5;
      return false;
    }
    if (text.startsWith('null', pos)) {
      pos += 4;
      return null;
    }
    NUMBER.lastIndex = pos;
    const match = NUMBER.exec(text);
    if (match === null) return fail('unexpected character');
    pos += match[0].length;
    const n = Number(match[0]);
    if (!Number.isFinite(n)) fail('number outside the IEEE 754 double range');
    return n;
  };

  const readArray = (pointer: string, depth: number): JsonValue[] => {
    pos++;
    const out: JsonValue[] = [];
    skipWhitespace();
    if (text[pos] === ']') {
      pos++;
      return out;
    }
    while (true) {
      out.push(readValue(`${pointer}/${out.length}`, depth));
      skipWhitespace();
      const c = text[pos];
      pos++;
      if (c === ']') return out;
      if (c !== ',') {
        pos--;
        fail("expected ',' or ']'");
      }
    }
  };

  const readObject = (pointer: string, depth: number): { [key: string]: JsonValue } => {
    pos++;
    const entries: [string, JsonValue][] = [];
    const seen = new Set<string>();
    skipWhitespace();
    if (text[pos] === '}') {
      pos++;
      return {};
    }
    while (true) {
      skipWhitespace();
      if (text[pos] !== '"') fail('expected a member name');
      const key = readString();
      const memberPointer = `${pointer}/${escapePointerToken(key)}`;
      if (seen.has(key)) {
        throw new JsonReadError(
          'duplicate_member',
          `duplicate member name ${JSON.stringify(key)}`,
          memberPointer,
        );
      }
      seen.add(key);
      skipWhitespace();
      if (text[pos] !== ':') fail("expected ':'");
      pos++;
      entries.push([key, readValue(memberPointer, depth)]);
      skipWhitespace();
      const c = text[pos];
      pos++;
      if (c === '}') return Object.fromEntries(entries);
      if (c !== ',') {
        pos--;
        fail("expected ',' or '}'");
      }
    }
  };

  const value = readValue('', 0);
  skipWhitespace();
  if (pos !== text.length) fail('unexpected content after the JSON value');
  return value;
}

import { describe, expect, it } from 'vitest';
import { MAX_BLOCK_DEPTH } from './constants.js';
import { JsonReadError, parseStrictJson } from './json.js';

function codeOf(text: string): string | undefined {
  try {
    parseStrictJson(text);
    return undefined;
  } catch (e) {
    return e instanceof JsonReadError ? e.code : 'other';
  }
}

describe('parseStrictJson', () => {
  it('reads what JSON.parse reads for well-formed I-JSON', () => {
    const text = '{"a":[1,-2.5e3,true,false,null,"x\\n\\u00e9"],"b":{}}';
    expect(parseStrictJson(text)).toEqual(JSON.parse(text));
  });

  it('refuses duplicate member names, including ones that differ only in escaping', () => {
    expect(codeOf('{"a":1,"a":2}')).toBe('duplicate_member');
    expect(codeOf('{"a":1,"\\u0061":2}')).toBe('duplicate_member');
    expect(codeOf('{"x":{"a":1,"a":1}}')).toBe('duplicate_member');
  });

  it('reports the duplicate as a JSON Pointer', () => {
    let pointer: string | undefined;
    try {
      parseStrictJson('{"x":{"a/b":1,"a/b":2}}');
    } catch (e) {
      pointer = (e as JsonReadError).pointer;
    }
    expect(pointer).toBe('/x/a~1b');
  });

  it('keeps a __proto__ member as data', () => {
    const value = parseStrictJson('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    ['', 'empty input'],
    ['{"a":1,}', 'trailing comma'],
    ["{'a':1}", 'single quotes'],
    ['{"a":01}', 'leading zero'],
    ['{"a":1e400}', 'number beyond the double range'],
    ['{"a":NaN}', 'NaN'],
    ['{"a":"\\ud800"}', 'lone high surrogate'],
    ['{"a":"\\udc00x"}', 'lone low surrogate'],
    ['{"a":"tab\there"}', 'raw control character'],
    ['{"a":1} {"b":2}', 'two values'],
    ['{"a":1} // done', 'comment'],
  ])('refuses %j (%s)', (text) => {
    expect(codeOf(text)).toBe('invalid_json');
  });

  it(`refuses nesting deeper than ${MAX_BLOCK_DEPTH}`, () => {
    const at = (depth: number) => `${'['.repeat(depth)}${']'.repeat(depth)}`;
    expect(codeOf(at(MAX_BLOCK_DEPTH))).toBeUndefined();
    expect(codeOf(at(MAX_BLOCK_DEPTH + 1))).toBe('invalid_json');
  });
});

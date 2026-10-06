import { describe, expect, it } from 'vitest';
import { CanonicalizationError, canonicalize, sha256Canonical } from './jcs.js';
import { parseStrictJson } from './json.js';

// A JSON \uXXXX escape and a raw character, assembled at run time. The RFC inputs below test the
// escapes themselves, so they must reach the parser as escapes; editors, formatters and lint fixes
// routinely replace printable \u escapes in source with the characters they stand for.
const esc = (hex: string): string => `${'\\'}u${hex}`;
const char = (codePoint: number): string => String.fromCodePoint(codePoint);

function fromIeee754(hex: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}

// RFC 8785 Appendix B, "Number Serialization Samples": IEEE 754 bit pattern, then the canonical
// JSON text (null where the RFC says the value must be refused).
const NUMBER_SAMPLES: [string, string | null][] = [
  ['0000000000000000', '0'],
  ['8000000000000000', '0'],
  ['0000000000000001', '5e-324'],
  ['8000000000000001', '-5e-324'],
  ['7fefffffffffffff', '1.7976931348623157e+308'],
  ['ffefffffffffffff', '-1.7976931348623157e+308'],
  ['4340000000000000', '9007199254740992'],
  ['c340000000000000', '-9007199254740992'],
  ['4430000000000000', '295147905179352830000'],
  ['7fffffffffffffff', null],
  ['7ff0000000000000', null],
  ['44b52d02c7e14af5', '9.999999999999997e+22'],
  ['44b52d02c7e14af6', '1e+23'],
  ['44b52d02c7e14af7', '1.0000000000000001e+23'],
  ['444b1ae4d6e2ef4e', '999999999999999700000'],
  ['444b1ae4d6e2ef4f', '999999999999999900000'],
  ['444b1ae4d6e2ef50', '1e+21'],
  ['3eb0c6f7a0b5ed8c', '9.999999999999997e-7'],
  ['3eb0c6f7a0b5ed8d', '0.000001'],
  ['41b3de4355555553', '333333333.3333332'],
  ['41b3de4355555554', '333333333.33333325'],
  ['41b3de4355555555', '333333333.3333333'],
  ['41b3de4355555556', '333333333.3333334'],
  ['41b3de4355555557', '333333333.33333343'],
  ['becbf647612f3696', '-0.0000033333333333333333'],
  ['43143ff3c1cb0959', '1424953923781206.2'],
];

describe('canonicalize (RFC 8785)', () => {
  it.each(NUMBER_SAMPLES)('serializes the IEEE 754 value %s as %s', (hex, expected) => {
    const value = fromIeee754(hex);
    if (expected === null) {
      expect(() => canonicalize(value)).toThrow(CanonicalizationError);
    } else {
      expect(canonicalize(value)).toBe(expected);
    }
  });

  it('serializes primitives as in RFC 8785 section 3.2.2', () => {
    const bs = '\\';
    // The RFC's string member: escapes for U+20AC, U+000F, U+000A, U+0042, U+0022 and U+005C, then
    // an escaped backslash, an escaped quote and an escaped solidus.
    const string = `${esc('20ac')}$${esc('000F')}${esc('000a')}A'${esc('0042')}${esc('0022')}${esc('005c')}${bs}${bs}${bs}"${bs}/`;
    const input = `{
      "numbers": [333333333.33333329, 1E30, 4.50,
                  2e-3, 0.000000000000000000000000001],
      "string": "${string}",
      "literals": [null, true, false]
    }`;
    // The RFC's output: the euro sign raw, U+000F as a lowercase escape, \n, and the rest minimally
    // escaped.
    const out = `${char(0x20ac)}$${esc('000f')}${bs}nA'B${bs}"${bs}${bs}${bs}${bs}${bs}"/`;
    expect(canonicalize(parseStrictJson(input))).toBe(
      `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"${out}"}`,
    );
  });

  it('sorts members by UTF-16 code units as in RFC 8785 section 3.2.3', () => {
    const input = `{
      "${esc('20ac')}": "Euro Sign",
      "${'\\'}r": "Carriage Return",
      "${esc('fb33')}": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "${esc('d83d')}${esc('de00')}": "Emoji: Grinning Face",
      "${esc('0080')}": "Control",
      "${esc('00f6')}": "Latin Small Letter O With Diaeresis"
    }`;
    // Compared as text: a JavaScript object would move the integer-like key "1" to the front.
    expect(canonicalize(parseStrictJson(input))).toBe(
      `{"${'\\'}r":"Carriage Return","1":"One","${char(0x80)}":"Control",` +
        `"${char(0xf6)}":"Latin Small Letter O With Diaeresis","${char(0x20ac)}":"Euro Sign",` +
        `"${char(0x1f600)}":"Emoji: Grinning Face","${char(0xfb33)}":"Hebrew Letter Dalet With Dagesh"}`,
    );
  });

  it('sorts nested objects and keeps array order', () => {
    expect(canonicalize({ b: [3, { z: 1, a: 2 }, 1], a: {} })).toBe(
      '{"a":{},"b":[3,{"a":2,"z":1},1]}',
    );
  });

  it('refuses lone surrogates', () => {
    expect(() => canonicalize(char(0xd800))).toThrow(CanonicalizationError);
    expect(() => canonicalize({ [char(0xdc00)]: 1 })).toThrow(CanonicalizationError);
  });

  it('gives the same digest whatever the source formatting', () => {
    const compact = parseStrictJson('{"b":1,"a":[true,null]}');
    const pretty = parseStrictJson('{\n  "a": [ true, null ],\n  "b": 1.0\n}');
    expect(sha256Canonical(compact)).toBe(sha256Canonical(pretty));
  });
});

// RFC 8785 JSON Canonicalization Scheme. Every digest in a Dunstan record is SHA-256 over these
// bytes, never over pretty-printed JSON.

import { createHash } from 'node:crypto';
import { isWellFormedUtf16, type JsonValue } from './json.js';

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalizationError';
  }
}

function serializeString(value: string): string {
  // RFC 8785 section 3.2.2.2 adopts ECMAScript JSON.stringify string serialization. I-JSON forbids
  // lone surrogates, which JSON.stringify would escape rather than refuse.
  if (!isWellFormedUtf16(value))
    throw new CanonicalizationError('string contains a lone surrogate');
  return JSON.stringify(value);
}

function serializeNumber(value: number): string {
  // RFC 8785 section 3.2.2.3 adopts the ECMAScript Number serialization, which JSON.stringify
  // implements for finite numbers (including -0 as "0").
  if (!Number.isFinite(value)) throw new CanonicalizationError(`${value} is not a JSON number`);
  return JSON.stringify(value);
}

function serialize(value: unknown, out: string[]): void {
  if (value === null) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number':
      out.push(serializeNumber(value));
      return;
    case 'string':
      out.push(serializeString(value));
      return;
    case 'object': {
      if (Array.isArray(value)) {
        out.push('[');
        value.forEach((item, i) => {
          if (i > 0) out.push(',');
          serialize(item, out);
        });
        out.push(']');
        return;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new CanonicalizationError('only plain objects are JSON objects');
      }
      // Default sort compares UTF-16 code units, which is the order RFC 8785 section 3.2.3 requires.
      const keys = Object.keys(value).sort();
      out.push('{');
      keys.forEach((key, i) => {
        if (i > 0) out.push(',');
        out.push(serializeString(key), ':');
        serialize((value as Record<string, unknown>)[key], out);
      });
      out.push('}');
      return;
    }
    default:
      throw new CanonicalizationError(`${typeof value} is not a JSON value`);
  }
}

export function canonicalize(value: JsonValue): string {
  const out: string[] = [];
  serialize(value, out);
  return out.join('');
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Canonical(value: JsonValue): string {
  return sha256Hex(Buffer.from(canonicalize(value), 'utf8'));
}

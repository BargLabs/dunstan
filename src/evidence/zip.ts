// Reads one named file out of a ZIP archive (a GitHub Actions artifact download). Stored and deflated
// entries only, no ZIP64; anything else is a parse error, which makes the artifact read unreadable.
// The inflated size is capped so a hostile archive cannot exhaust memory.

import { inflateRawSync } from 'node:zlib';

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const dv = view(bytes);
  // The record is 22 bytes plus a comment of at most 65,535 bytes.
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === EOCD) return i;
  }
  throw new ZipError('no end of central directory record');
}

// Returns the file's bytes, or null when the archive has no entry at `path`.
export function readZipEntry(bytes: Uint8Array, path: string): Uint8Array | null {
  if (bytes.length < 22) throw new ZipError('archive too short');
  const dv = view(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = dv.getUint16(eocd + 10, true);
  let offset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) throw new ZipError('ZIP64 is not supported');
  const decoder = new TextDecoder('utf-8', { fatal: false });

  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || dv.getUint32(offset, true) !== CENTRAL) {
      throw new ZipError('bad central directory entry');
    }
    const method = dv.getUint16(offset + 10, true);
    const compressedSize = dv.getUint32(offset + 20, true);
    const size = dv.getUint32(offset + 24, true);
    const nameLength = dv.getUint16(offset + 28, true);
    const extraLength = dv.getUint16(offset + 30, true);
    const commentLength = dv.getUint16(offset + 32, true);
    const localOffset = dv.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== path) continue;

    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError('ZIP64 is not supported');
    }
    if (size > MAX_ENTRY_BYTES) throw new ZipError(`entry larger than ${MAX_ENTRY_BYTES} bytes`);
    if (localOffset + 30 > bytes.length || dv.getUint32(localOffset, true) !== LOCAL) {
      throw new ZipError('bad local file header');
    }
    const dataStart =
      localOffset +
      30 +
      dv.getUint16(localOffset + 26, true) +
      dv.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.length)
      throw new ZipError('entry runs past the archive');
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return data;
    if (method === 8) {
      try {
        return new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }));
      } catch (e) {
        throw new ZipError(`cannot inflate ${path}: ${(e as Error).message}`);
      }
    }
    throw new ZipError(`compression method ${method} is not supported`);
  }
  return null;
}

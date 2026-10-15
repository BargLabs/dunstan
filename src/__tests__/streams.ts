// Response bodies that count what a reader pulls from them, so a test can tell how much of an
// oversized answer was read before the reader stopped, and an artifact archive built that way: a
// small report first, then as many bytes of a second entry as the test asks for.

import { deflateRawSync } from 'node:zlib';

export const MiB = 1024 * 1024;

export interface CountingBody {
  stream: ReadableStream<Uint8Array>;
  // Bytes handed to the reader so far.
  readonly pulled: number;
  // Whether the reader cancelled the stream.
  readonly cancelled: boolean;
}

// A body of `parts` in order: bytes as given, and for a number that many zero bytes, in chunks of
// `chunk`. Nothing is produced before a reader asks for it (a high-water mark of 0).
export function countingBody(parts: (Uint8Array | number)[], chunk = MiB): CountingBody {
  const zeros = new Uint8Array(chunk);
  const queue = [...parts];
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const part = queue[0];
        if (part === undefined) {
          controller.close();
          return;
        }
        let bytes: Uint8Array;
        if (typeof part === 'number') {
          bytes = part > chunk ? zeros : zeros.subarray(0, part);
          if (part > chunk) queue[0] = part - chunk;
          else queue.shift();
        } else {
          bytes = part;
          queue.shift();
        }
        pulled += bytes.length;
        controller.enqueue(bytes);
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    stream,
    get pulled() {
      return pulled;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

// The parts of a ZIP archive holding `report` (deflated) at `path`, then a stored entry of
// `fillerBytes` zero bytes: [the report's local entry and the filler's local header, the filler's
// size, the central directory and its end record].
export function oversizedArchive(
  path: string,
  report: string,
  fillerBytes: number,
): [Uint8Array, number, Uint8Array] {
  const reportName = Buffer.from(path, 'utf8');
  const fillerName = Buffer.from('filler.bin', 'utf8');
  const raw = Buffer.from(report, 'utf8');
  const data = deflateRawSync(raw);
  const local = (name: Buffer, method: number, stored: number, size: number) => {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(stored, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(name.length, 26);
    return Buffer.concat([header, name]);
  };
  const central = (name: Buffer, method: number, stored: number, size: number, at: number) => {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(stored, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(at, 42);
    return Buffer.concat([header, name]);
  };
  const first = local(reportName, 8, data.length, raw.length);
  const fillerAt = first.length + data.length;
  const second = local(fillerName, 0, fillerBytes, fillerBytes);
  const directory = Buffer.concat([
    central(reportName, 8, data.length, raw.length, 0),
    central(fillerName, 0, fillerBytes, fillerBytes, fillerAt),
  ]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(2, 8);
  end.writeUInt16LE(2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(fillerAt + second.length + fillerBytes, 16);
  return [
    new Uint8Array(Buffer.concat([first, data, second])),
    fillerBytes,
    new Uint8Array(Buffer.concat([directory, end])),
  ];
}

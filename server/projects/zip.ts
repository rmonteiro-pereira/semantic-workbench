// Writes a zip archive that stores every file uncompressed, so each file's bytes appear in the
// archive exactly as given. The archive is produced one entry at a time and never held whole.
import { crc32 } from 'node:zlib';

/** One file of the archive: its path inside the zip and a reader for its bytes. */
export type ZipEntry = {
  /** Forward-slash path without a leading slash. */
  name: string;
  /** The byte length `read` will return, known up front so the archive size is too. */
  size: number;
  /** Called once, when the entry is written; the archive keeps only one file in memory. */
  read: () => Uint8Array;
};

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
// Made by a Unix system, so the permission bits below are honoured when the archive is unpacked.
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
const UTF8_NAMES_FLAG = 0x0800;
const STORED = 0;
// 1980-01-01 00:00, the earliest time a zip can hold, so equal files give equal archives.
const DOS_TIME = 0;
const DOS_DATE = 0x21;
const REGULAR_FILE_MODE = 0o100644;
/** A zip without the 64-bit extension holds at most this many entries and bytes. */
export const ZIP_MAX_ENTRIES = 0xfffe;
export const ZIP_MAX_BYTES = 0xfffffffe;

type CentralRecord = { nameBytes: Uint8Array; crc: number; size: number; offset: number };

function fixedHeader(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function localHeader(nameBytes: Uint8Array, crc: number, size: number): Uint8Array {
  const { bytes, view } = fixedHeader(30 + nameBytes.length);
  view.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION_NEEDED, true);
  view.setUint16(6, UTF8_NAMES_FLAG, true);
  view.setUint16(8, STORED, true);
  view.setUint16(10, DOS_TIME, true);
  view.setUint16(12, DOS_DATE, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  bytes.set(nameBytes, 30);
  return bytes;
}

function centralHeader(record: CentralRecord): Uint8Array {
  const { bytes, view } = fixedHeader(46 + record.nameBytes.length);
  view.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION_MADE_BY, true);
  view.setUint16(6, VERSION_NEEDED, true);
  view.setUint16(8, UTF8_NAMES_FLAG, true);
  view.setUint16(10, STORED, true);
  view.setUint16(12, DOS_TIME, true);
  view.setUint16(14, DOS_DATE, true);
  view.setUint32(16, record.crc, true);
  view.setUint32(20, record.size, true);
  view.setUint32(24, record.size, true);
  view.setUint16(28, record.nameBytes.length, true);
  view.setUint32(38, (REGULAR_FILE_MODE << 16) >>> 0, true);
  view.setUint32(42, record.offset, true);
  bytes.set(record.nameBytes, 46);
  return bytes;
}

function endOfDirectory(count: number, directorySize: number, directoryOffset: number) {
  const { bytes, view } = fixedHeader(22);
  view.setUint32(0, END_OF_DIRECTORY_SIGNATURE, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  return bytes;
}

/** The exact byte length of the archive `zipStream` produces for these entries. */
export function zipSize(entries: ZipEntry[]): number {
  const encoder = new TextEncoder();
  let total = 22;
  for (const entry of entries) {
    const nameLength = encoder.encode(entry.name).length;
    total += 30 + nameLength + entry.size + 46 + nameLength;
  }
  return total;
}

/**
 * Streams the entries as a zip archive. A failure while reading an entry errors the stream, so
 * the archive never gets its closing directory and no reader can take it for a finished file.
 */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  if (entries.length > ZIP_MAX_ENTRIES) throw new RangeError('Too many entries for a zip.');
  const encoder = new TextEncoder();
  const records: CentralRecord[] = [];
  let next = 0;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < entries.length) {
        const entry = entries[next++];
        const content = entry.read();
        if (content.length !== entry.size) throw new Error(`${entry.name} changed while zipping.`);
        const nameBytes = encoder.encode(entry.name);
        const crc = crc32(content);
        const header = localHeader(nameBytes, crc, content.length);
        records.push({ nameBytes, crc, size: content.length, offset });
        offset += header.length + content.length;
        if (offset > ZIP_MAX_BYTES) throw new RangeError('Archive too large for a zip.');
        controller.enqueue(header);
        controller.enqueue(content);
        return;
      }
      const directory = records.map(centralHeader);
      const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
      for (const part of directory) controller.enqueue(part);
      controller.enqueue(endOfDirectory(records.length, directorySize, offset));
      controller.close();
    },
  });
}

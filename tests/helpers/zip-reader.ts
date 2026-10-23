// Reads a zip archive back into its files, checking each file's checksum, so tests can compare
// what an export holds with what was stored. It reads only stored (uncompressed) entries.
import { crc32 } from 'node:zlib';

/** The files of an archive by path, with each file's bytes. */
export type ZipFiles = Map<string, Uint8Array>;

const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

function findEndOfDirectory(view: DataView): number {
  for (let at = view.byteLength - 22; at >= 0; at--) {
    if (view.getUint32(at, true) === END_OF_DIRECTORY_SIGNATURE) return at;
  }
  throw new Error('Not a finished zip archive: no end of directory record.');
}

/** Parses an archive, throwing when it is unfinished, compressed or has a wrong checksum. */
export function readZip(archive: Uint8Array): ZipFiles {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();
  const end = findEndOfDirectory(view);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: ZipFiles = new Map();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(at, true) !== CENTRAL_HEADER_SIGNATURE) throw new Error('Bad directory.');
    const method = view.getUint16(at + 10, true);
    const checksum = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new Error(`${name} is compressed.`);
    if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) throw new Error('Bad entry.');
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    const content = archive.slice(start, start + size);
    if (crc32(content) !== checksum) throw new Error(`${name} has a wrong checksum.`);
    files.set(name, content);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

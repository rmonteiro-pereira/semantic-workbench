// Preserves UTF-8 content and replaces files atomically through temporary files beside each target.
import {
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
/** Returns the SHA-256 hex digest of bytes or UTF-8 text. */
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
// Keep a leading BOM: it is part of the file's bytes.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
/** Encodes text as UTF-8 without normalizing its contents. */
export const encode = (text: string) => new TextEncoder().encode(text);
/** Decodes valid UTF-8 while preserving a leading byte-order mark. */
export function decode(bytes: Uint8Array) {
  try {
    return decoder.decode(bytes);
  } catch {
    throw Error('The file is not valid UTF-8 text.');
  }
}
function fsyncDir(dir: string) {
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch {
    /* Some filesystems do not support syncing directories. */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
/** Suffix used to recognize temporary files and exclude them from indexing. */
export const TEMP_SUFFIX = '.workbench-tmp';
/** Returns a randomized temporary path beside the destination file. */
export const tempPath = (path: string) =>
  join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`);
/** Allows crash tests to interrupt a write before the temporary file is renamed. */
export type AtomicHooks = { beforeRename?: (temp: string) => void };
/** Replaces a file atomically and returns its hash; crashes cannot mix old and new bytes. */
export function atomicWrite(path: string, data: Uint8Array | string, hooks: AtomicHooks = {}) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const bytes = typeof data === 'string' ? encode(data) : data;
  const temp = tempPath(path);
  const fd = openSync(temp, 'w', 0o644);
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    try {
      unlinkSync(temp);
    } catch {}
    throw e;
  }
  closeSync(fd);
  hooks.beforeRename?.(temp);
  renameSync(temp, path);
  fsyncDir(dir);
  return sha256(bytes);
}
/** Atomically writes indented JSON with a trailing newline and returns its hash. */
export function atomicWriteJson(path: string, value: unknown) {
  return atomicWrite(path, JSON.stringify(value, null, 2) + '\n');
}
/** Reads JSON as the requested type, returning null only when the file is missing. */
export function readJsonFile<T>(path: string): T | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text) as T;
}

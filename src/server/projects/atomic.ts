// Preserves UTF-8 content and replaces files atomically through temporary files beside each target.
import { openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { BadRequestError } from './errors';
/** Returns the SHA-256 hex digest of bytes or UTF-8 text. */
export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
// Keep a leading BOM: it is part of the file's bytes.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
/** Encodes text as UTF-8 without normalizing its contents. */
export const encode = (text: string) => new TextEncoder().encode(text);
/** Decodes valid UTF-8 while preserving a leading byte-order mark. */
export function decode(bytes: Uint8Array) {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new BadRequestError('The file is not valid UTF-8 text.');
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
export const tempPath = (path: string) => join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`);
/** Error codes Windows returns while another process briefly holds the destination open. */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
/** Total time a rename keeps retrying before the original error is raised. */
const RENAME_RETRY_BUDGET_MS = 2_000;

function pause(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** The pieces of a rename that tests replace to simulate a locked destination. */
export type RenameEnvironment = {
  rename: (from: string, to: string) => void;
  platform: NodeJS.Platform;
  pause: (milliseconds: number) => void;
};

const realRename: RenameEnvironment = { rename: renameSync, platform: process.platform, pause };

/**
 * Renames a temporary file over its destination. On Windows, a sync client such as OneDrive, an
 * antivirus scanner or the search indexer can hold the destination open for a moment, and the
 * rename then fails with EPERM, EACCES or EBUSY. Those errors are retried with a growing pause
 * for up to two seconds; any other error, or any error on other systems, is raised at once.
 */
export function replaceFile(from: string, to: string, environment = realRename) {
  let waited = 0;
  let delay = 10;
  while (true) {
    try {
      environment.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      const retryable = environment.platform === 'win32' && TRANSIENT_RENAME_CODES.has(code);
      if (!retryable || waited >= RENAME_RETRY_BUDGET_MS) throw error;
      environment.pause(delay);
      waited += delay;
      delay = Math.min(delay * 2, 200);
    }
  }
}

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
  } catch (error) {
    closeSync(fd);
    try {
      unlinkSync(temp);
    } catch {}
    throw error;
  }
  closeSync(fd);
  hooks.beforeRename?.(temp);
  try {
    replaceFile(temp, path);
  } catch (error) {
    // Leave no temporary file behind when the destination stays locked.
    try {
      unlinkSync(temp);
    } catch {}
    throw error;
  }
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return JSON.parse(text) as T;
}

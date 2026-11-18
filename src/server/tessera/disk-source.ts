// Reads a folder as it is on disk, for the check command only. Nothing it reads is a published snapshot.
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { UnitFile } from '../../shared/tessera/compile-unit';
import { SNAPSHOT_LIMITS, type SnapshotLimits } from '../projects/snapshot-index';
import { TesseraRefusal } from './refusal';

/** A folder read from disk: unpublished by definition. */
export type DiskSource = { kind: 'files-on-disk'; folder: string; files: UnitFile[] };

type Listed = { path: string; absolute: string; size: number };

/** Lists regular files below a folder, skipping Git metadata and every symbolic link. */
function listFiles(folder: string, prefix: string, found: Listed[]) {
  for (const name of readdirSync(folder).sort()) {
    if (name === '.git') continue;
    const absolute = join(folder, name);
    const status = lstatSync(absolute);
    const path = prefix ? `${prefix}/${name}` : name;
    if (status.isSymbolicLink()) continue;
    if (status.isDirectory()) listFiles(absolute, path, found);
    else if (status.isFile()) found.push({ path, absolute, size: status.size });
  }
}

/** Reads a folder with the same limits as a snapshot, checking sizes before any content is read. */
export function readFolder(folder: string, limits: SnapshotLimits = SNAPSHOT_LIMITS): DiskSource {
  const root = resolve(folder);
  const listed: Listed[] = [];
  try {
    listFiles(root, '', listed);
  } catch (error) {
    throw new TesseraRefusal(`${folder} cannot be read: ${(error as Error).message}`);
  }
  if (listed.length > limits.projectFiles) throw new TesseraRefusal(`The folder holds ${listed.length} files, and the limit is ${limits.projectFiles}.`);
  const tooLarge = listed.find(file => file.size > limits.documentBytes);
  if (tooLarge) throw new TesseraRefusal(`${tooLarge.path} holds ${tooLarge.size} bytes, and the limit is ${limits.documentBytes}.`);
  const total = listed.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.totalBytes) throw new TesseraRefusal(`The folder holds ${total} bytes, and the limit is ${limits.totalBytes}.`);
  return { kind: 'files-on-disk', folder: root, files: listed.map(file => ({ path: file.path, bytes: new Uint8Array(readFileSync(file.absolute)) })) };
}

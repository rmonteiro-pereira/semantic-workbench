// Writes a bundle to a new folder outside every source tree: into a temporary sibling first, then renamed, so no half-written bundle is ever visible under the output name.
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { UnitFile } from '../../shared/tessera/compile-unit';
import { TesseraRefusal } from './refusal';

/** Where a bundle may go, and the folders it must stay out of. */
export type BundleTarget = { folder: string; repository: string; dataRoot?: string };

/** Writes one file to a path, making it durable. A test replaces this to interrupt a write. */
export type FileWriter = (path: string, bytes: Uint8Array) => void;

/** Writes a file and flushes it to disk before returning. */
export const writeFileDurably: FileWriter = (path, bytes) => {
  const descriptor = openSync(path, 'w', 0o644);
  try {
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

/** Resolves a path through symbolic links as far as it exists, so a link cannot hide where a folder really is. */
function realPathOf(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  return join(realPathOf(dirname(absolute)), basename(absolute));
}

function isInside(child: string, parent: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

/** Refuses an output folder that is not empty, that is a file, or that sits inside a source tree. */
export function checkTarget(target: BundleTarget) {
  const output = realPathOf(target.folder);
  const forbidden = [{ folder: target.repository, label: 'the repository' }];
  if (target.dataRoot)
    forbidden.push(
      { folder: join(target.dataRoot, 'projects'), label: "the data root's projects folder" },
      { folder: join(target.dataRoot, 'worktrees'), label: "the data root's working copies folder" },
    );
  for (const { folder, label } of forbidden) {
    if (isInside(output, realPathOf(folder))) throw new TesseraRefusal(`The output folder ${target.folder} is inside ${label}. Choose a folder outside every source tree.`);
  }
  if (!existsSync(output)) return;
  if (!statSync(output).isDirectory()) throw new TesseraRefusal(`The output ${target.folder} exists and is not a folder.`);
  if (readdirSync(output).length) throw new TesseraRefusal(`The output folder ${target.folder} is not empty. Nothing is merged into an existing folder.`);
}

function safeRelativePath(path: string): string {
  const parts = path.split('/');
  if (isAbsolute(path) || path.includes('\\') || parts.some(part => part === '' || part === '.' || part === '..')) throw new TesseraRefusal(`${path} is not a safe path inside a bundle.`);
  return path;
}

/** Writes the files into a temporary sibling folder and renames it to the output name, or leaves nothing behind. */
export function writeBundle(target: BundleTarget, files: UnitFile[], write: FileWriter = writeFileDurably) {
  checkTarget(target);
  const output = resolve(target.folder);
  mkdirSync(dirname(output), { recursive: true });
  const temporary = mkdtempSync(join(dirname(output), `.${basename(output)}.tessera-`));
  try {
    for (const file of files) {
      const path = join(temporary, safeRelativePath(file.path));
      mkdirSync(dirname(path), { recursive: true });
      write(path, file.bytes);
    }
    chmodSync(temporary, 0o755);
    renameSync(temporary, output);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

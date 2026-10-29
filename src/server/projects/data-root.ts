// Fails early when a mounted data root cannot be written by the server user.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** Creates and removes a probe, reporting the data path and effective user on failure. */
export function probeDataRoot(
  root: string,
  _pid: number,
  uid: number | undefined,
  files = {
    prepare: (path: string) => {
      mkdirSync(path, { recursive: true });
    },
    write: (path: string) => {
      writeFileSync(path, '', { flag: 'wx' });
    },
    remove: (path: string) => {
      unlinkSync(path);
    },
  },
) {
  const path = join(root, `.write-probe-${randomUUID()}`);
  try {
    files.prepare(root);
    files.write(path);
    files.remove(path);
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException;
    const reason = ['EACCES', 'EROFS', 'EPERM'].includes(error.code ?? '')
      ? 'is not writable'
      : `probe failed: ${error.message}`;
    throw new Error(`Data root ${root} ${reason} by uid ${uid ?? 'unknown'} (${path}).`, { cause });
  }
}

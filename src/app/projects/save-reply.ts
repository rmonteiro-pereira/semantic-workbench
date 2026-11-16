/** Validates save acknowledgements before they become the next editor base version. */
import type { Demotion } from '../../shared/governance/guards';

/** A validated single-file save acknowledgement. */
export type FileSaveReply = { path: string; hash: string; source?: string; demoted?: Demotion[] };
/** A validated batch acknowledgement in request order. */
export type BatchSaveReply = { written: (FileSaveReply & { created: boolean })[]; demoted?: Demotion[] };

function demotions(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(entry => entry && ['file', 'pointer', 'metric'].every(key => typeof entry[key] === 'string' && entry[key].length > 0)));
}

/** Accepts only a completed save with the requested path and a usable content hash. */
export function fileSaveReply(input: unknown, expectedPath: string, status: number): FileSaveReply {
  const value = input as FileSaveReply | null;
  if (status !== 200 || !value || value.path !== expectedPath || !value.path || typeof value.hash !== 'string' || !/^[0-9a-f]{64}$/.test(value.hash) || !demotions(value.demoted)) {
    throw new Error('The server returned an invalid save acknowledgement.');
  }
  if (value.source !== undefined && typeof value.source !== 'string') throw new Error('The server returned invalid saved source text.');
  return value;
}

/** Requires one completed acknowledgement per requested file, retaining their request order. */
export function batchSaveReply(input: unknown, paths: readonly string[], status: number): BatchSaveReply {
  const value = input as BatchSaveReply | null;
  if (status !== 200 || !value || !Array.isArray(value.written) || !value.written.length || value.written.length !== paths.length || !demotions(value.demoted)) {
    throw new Error('The server returned an invalid batch-save acknowledgement.');
  }
  value.written.forEach((file, index) => {
    fileSaveReply(file, paths[index], status);
    if (typeof file.created !== 'boolean') throw new Error('The server returned an invalid file-creation status.');
  });
  return value;
}

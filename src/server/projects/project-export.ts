// Plans the zip export of one project: which files go in, which the reader may not read, the
// size check, and the optional Git bundle. Nothing is sent from here; the route streams the plan.
import { lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TEMP_SUFFIX } from './atomic';
import { BadRequestError, TooLargeError } from './errors';
import type { Git } from './git';
import { PathError, projectDir, projectFile, projectPath, projectPrefix, repoDir, type DataLayout } from './paths';
import type { Reader } from './reader';
import { ZIP_MAX_ENTRIES, zipSize, type ZipEntry } from './zip';

/** The name of the Git bundle inside the archive. */
export const HISTORY_BUNDLE_NAME = 'git-history.bundle';

/** What a person chose in the export dialog. */
export type ExportOptions = {
  includeHistory: boolean;
  /** Whether the access boundary lets this person read the project's Git history. */
  historyAllowed: boolean;
};

/** Everything the route needs to answer: the entries to stream and what was left out. */
export type ExportPlan = {
  entries: ZipEntry[];
  /** Files in the archive, including the Git bundle. */
  fileCount: number;
  /** Files the reader may not read, counted but never named. */
  omittedCount: number;
  /** Bytes of the finished archive, announced before the first byte is sent. */
  zipBytes: number;
  includesHistory: boolean;
};

/** The services and limits a plan needs, passed in so the plan stays free of global state. */
export type ExportDeps = {
  layout: DataLayout;
  git: Git;
  gitAvailable: boolean;
  /** A folder inside the data root where the bundle is written before it is read. */
  scratchDir: string;
  maxBytes: number;
  listPaths: (dir: string) => Promise<string[]> | string[];
};

/**
 * The files of a listing that belong in the archive, and how many the reader cannot read. A path
 * that is not a valid project path, such as anything under `.git`, is dropped.
 */
export function selectExportPaths(paths: string[], canRead: (path: string) => boolean) {
  const included: string[] = [];
  let restricted = 0;
  for (const raw of paths) {
    let path: string;
    try {
      path = projectPath(raw);
    } catch {
      continue;
    }
    if (path.endsWith(TEMP_SUFFIX)) continue;
    if (canRead(path)) included.push(path);
    else restricted += 1;
  }
  return { included, restricted };
}

// A file that cannot be reached safely (a link, a case variant, one that vanished) is skipped
// rather than named in an error, because the listing may hold paths the reader may not read.
function sizedEntry(layout: DataLayout, slug: string, path: string) {
  try {
    const file = projectFile(layout, slug, path);
    const stat = lstatSync(file);
    if (!stat.isFile()) return null;
    return { file, size: stat.size };
  } catch (error) {
    if (error instanceof PathError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function tooLarge(limit: number) {
  const megabytes = Math.round(limit / 1_000_000);
  return new TooLargeError(`This project is too large to export: the limit is ${megabytes} MB. Nothing was downloaded.`, limit);
}

// A server reader may export history only when no commit ever touched a file they cannot read
// and the repository holds nothing but this project.
async function assertHistoryReadable(deps: ExportDeps, slug: string, reader: Reader, facts: { restricted: number; historyAllowed: boolean }) {
  const { view } = reader;
  if (!view) return;
  const refusal = 'Git history is exported only when you may read every file the project ever held.';
  if (!facts.historyAllowed || facts.restricted > 0 || projectPrefix(deps.layout, slug) !== '') throw new BadRequestError(refusal);
  const repo = repoDir(deps.layout, slug);
  const ref = (await deps.git.currentRef(repo)) ?? 'HEAD';
  const touched = await deps.git.historyPaths(repo, ref);
  if (touched.some(path => !view.canRead(slug, path))) throw new BadRequestError(refusal);
}

// The bundle holds every branch for a local person and only the checked-out branch for a server
// reader, because other people's working branches are not theirs to receive.
async function bundleBytes(deps: ExportDeps, slug: string, reader: Reader, remaining: number) {
  const repo = repoDir(deps.layout, slug);
  if (!deps.gitAvailable || !(await deps.git.head(repo))) throw new BadRequestError('This project has no Git history to include yet.');
  const ref = reader.view ? ((await deps.git.currentRef(repo)) ?? 'HEAD') : '--all';
  mkdirSync(deps.scratchDir, { recursive: true });
  const file = join(deps.scratchDir, `${randomUUID()}.bundle`);
  try {
    await deps.git.bundle(repo, file, [ref]);
    const bytes = readFileSync(file);
    if (bytes.length > remaining) throw tooLarge(deps.maxBytes);
    return bytes;
  } finally {
    rmSync(file, { force: true });
  }
}

/** Decides what the export holds and refuses an oversized one before any byte is sent. */
export async function planProjectExport(deps: ExportDeps, slug: string, reader: Reader, options: ExportOptions): Promise<ExportPlan> {
  const listed = await deps.listPaths(projectDir(deps.layout, slug));
  const canRead = (path: string) => !reader.view || reader.view.canRead(slug, path);
  const { included, restricted } = selectExportPaths(listed, canRead);
  const sized = included.flatMap(path => {
    const found = sizedEntry(deps.layout, slug, path);
    return found ? [{ path, ...found }] : [];
  });
  const totalBytes = sized.reduce((sum, item) => sum + item.size, 0);
  if (totalBytes > deps.maxBytes || sized.length >= ZIP_MAX_ENTRIES) throw tooLarge(deps.maxBytes);
  const entries: ZipEntry[] = sized.map(item => ({
    name: item.path,
    size: item.size,
    read: () => readFileSync(item.file),
  }));
  if (options.includeHistory) {
    await assertHistoryReadable(deps, slug, reader, {
      restricted,
      historyAllowed: options.historyAllowed,
    });
    const bundle = await bundleBytes(deps, slug, reader, deps.maxBytes - totalBytes);
    entries.push({ name: HISTORY_BUNDLE_NAME, size: bundle.length, read: () => bundle });
  }
  return {
    entries,
    fileCount: entries.length,
    omittedCount: restricted,
    zipBytes: zipSize(entries),
    includesHistory: options.includeHistory,
  };
}

/** The archive's download name: the project's identifier, marked when it holds the history. */
export function exportFileName(slug: string, includesHistory: boolean) {
  return `${slug}${includesHistory ? '-with-history' : ''}.zip`;
}

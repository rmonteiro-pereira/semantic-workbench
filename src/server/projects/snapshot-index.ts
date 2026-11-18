// Builds bounded, immutable project indexes from Git objects without consulting a checkout.
import { isAddressHistoryPath } from '../../shared/core/address-migration';
import { posix } from 'node:path';
import { decode, sha256 } from './atomic';
import type { Git, GitTreeEntry } from './git';
import type { CachedFile, CopyIndex } from './cache';
import { indexBytes } from './scanner';
import { locationOf } from './paths';
import type { ProjectEntry } from './state';
import { SnapshotUnavailableError } from './errors';

/** A definition in the same shape returned by the editing document list. */
export type PublishedDocument = {
  id: string;
  filename: string;
  source: string;
  revision: number;
  hash: string;
  project: string;
  path: string;
  updated: string;
};
/** Immutable file metadata and exact committed contents. */
export type SnapshotFile = Readonly<{ metadata: Readonly<CachedFile>; document: Readonly<PublishedDocument>; bytes: Uint8Array }>;
/** One repository commit indexed for a particular registry layout. */
export type SnapshotIndex = Readonly<{
  repository: string;
  commit: string;
  folderDigest: string;
  projects: ReadonlyMap<string, readonly SnapshotFile[]>;
}>;
/** Limits applied before any blob contents are loaded. */
export type SnapshotLimits = { documentBytes: number; totalBytes: number; projectFiles: number };
/** Default document, snapshot and project file limits. */
export const SNAPSHOT_LIMITS: SnapshotLimits = { documentBytes: 2_000_000, totalBytes: 64_000_000, projectFiles: 10_000 };
/** External object access and optional shared parsing cache. */
export type SnapshotIndexDeps = { git: Git; directory: (repository: string) => string; cache?: CopyIndex; limits?: SnapshotLimits };

/** Identifies the sorted project-to-folder layout independently of registration order. */
export function folderDigest(projects: ProjectEntry[]): string {
  return sha256(JSON.stringify(projects.map(project => [project.slug, locationOf(project).folder]).sort((left, right) => left[0].localeCompare(right[0]))));
}

function projectEntries(tree: GitTreeEntry[], project: ProjectEntry, limits: SnapshotLimits) {
  const { folder, repo } = locationOf(project);
  const prefix = folder === repo ? '' : folder.slice(repo.length + 1) + '/';
  const entries = tree.filter(entry => !entry.link && entry.path.startsWith(prefix) && !isAddressHistoryPath(entry.path)).map(entry => ({ ...entry, path: entry.path.slice(prefix.length) }));
  if (entries.length > limits.projectFiles) throw new SnapshotUnavailableError('unavailable');
  const spellings = new Map<string, string>();
  for (const entry of entries) {
    if (entry.size > limits.documentBytes) throw new SnapshotUnavailableError('unavailable');
    const segments = entry.path.split('/');
    for (let depth = 1; depth <= segments.length; depth++) {
      const path = segments.slice(0, depth).join('/');
      const canonical = path.toLowerCase();
      if (spellings.has(canonical) && spellings.get(canonical) !== path) throw new SnapshotUnavailableError('unavailable');
      spellings.set(canonical, path);
    }
  }
  return entries;
}

function indexedFile(deps: SnapshotIndexDeps, project: string, path: string, bytes: Uint8Array): SnapshotFile {
  const hash = sha256(bytes);
  const own = deps.cache?.file(project, path);
  const cached = own?.hash === hash ? own : deps.cache?.parsedElsewhere(project, path, hash)?.file;
  const metadata = Object.freeze({ ...(cached ?? indexBytes(project, path, bytes, 'clean', 'scan').file), gitState: 'clean' });
  const document = Object.freeze({
    id: `${project}/${path}`,
    filename: posix.basename(path),
    source: metadata.visible ? decode(bytes) : '',
    revision: parseInt(hash.slice(0, 12), 16) + 1,
    hash,
    project,
    path,
    updated: metadata.indexedAt,
  });
  return Object.freeze({ metadata, document, bytes });
}

async function buildIndex(deps: SnapshotIndexDeps, repository: string, commit: string, projects: ProjectEntry[]): Promise<SnapshotIndex> {
  const limits = deps.limits ?? SNAPSHOT_LIMITS;
  const directory = deps.directory(repository);
  const tree = await deps.git.lsTree(directory, commit);
  const entries = projects.map(project => ({ project, files: projectEntries(tree, project, limits) }));
  const files = entries.flatMap(entry => entry.files);
  if (files.reduce((total, file) => total + file.size, 0) > limits.totalBytes) throw new SnapshotUnavailableError('unavailable');
  const blobs = await deps.git.catFileBatch(
    directory,
    files.map(file => file.id),
    limits,
  );
  const indexed = new Map<string, readonly SnapshotFile[]>();
  for (const { project, files } of entries) {
    indexed.set(
      project.slug,
      Object.freeze(
        files.map(file => {
          const bytes = blobs.get(file.id);
          if (!bytes || bytes.length !== file.size) throw new SnapshotUnavailableError('unavailable');
          return indexedFile(deps, project.slug, file.path, bytes);
        }),
      ),
    );
  }
  return Object.freeze({ repository, commit, folderDigest: folderDigest(projects), projects: indexed });
}

/** Shares each concurrent build; completed index retention belongs to the snapshot resolver. */
export function createSnapshotIndexes(deps: SnapshotIndexDeps) {
  const building = new Map<string, Promise<SnapshotIndex>>();
  return {
    build(repository: string, commit: string, projects: ProjectEntry[]) {
      const key = JSON.stringify([repository, commit, folderDigest(projects)]);
      const existing = building.get(key);
      if (existing) return existing;
      const pending = buildIndex(deps, repository, commit, projects)
        .catch(cause => {
          throw new SnapshotUnavailableError('unavailable', { cause });
        })
        .finally(() => building.delete(key));
      building.set(key, pending);
      return pending;
    },
  };
}

// Captures saved and immutable project definitions with their own address history.
import { lstatSync, readFileSync } from 'node:fs';
import type { MigrationRecord } from '../../shared/core/address-migration';
import type { SideVersion } from '../../shared/item-diff/item-change';
import { readAddressMigrations, readCommittedAddressMigrations } from './address-migrations';
import { decode, sha256 } from './atomic';
import { SnapshotUnavailableError } from './errors';
import { commitOf, type Git } from './git';
import { projectDir, projectFile, projectPrefix, repoDir, type DataLayout } from './paths';
import type { PublishedSnapshots } from './published-snapshot';
import type { Reader } from './reader';
import { serializationOf, walk } from './scanner';
import { branchShownTo } from './worktrees';
import { SNAPSHOT_LIMITS, type SnapshotLimits } from './snapshot-index';

/** Definition bytes and migrations captured from one readable comparison side. */
export type LoadedDiffSide = {
  version: SideVersion;
  documents: readonly { path: string; source: string }[];
  unreadable: readonly string[];
  records: readonly MigrationRecord[];
};

type SideDependencies = {
  git: Git;
  gitAvailable: () => boolean;
  layout: DataLayout;
  workingLayout: (project: string, reader: Reader) => DataLayout;
  snapshots: PublishedSnapshots;
  ownBranch: (reader: Reader) => string | null;
  limits?: SnapshotLimits;
};

function isDefinition(path: string) {
  const format = serializationOf(path);
  return format !== 'unsupported' && format !== 'gitignore';
}

function locateSavedFile(layout: DataLayout, project: string, path: string) {
  const file = projectFile(layout, project, path);
  try {
    const metadata = lstatSync(file);
    return metadata.isFile() ? { file, path, size: metadata.size } : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function checkSideLimits(files: readonly { size: number }[], limits: SnapshotLimits) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (files.length > limits.projectFiles || files.some(file => file.size > limits.documentBytes) || totalBytes > limits.totalBytes) {
    throw new SnapshotUnavailableError('unavailable');
  }
}

function savedDefinitions(layout: DataLayout, project: string, paths: string[], limits: SnapshotLimits) {
  const files = paths.flatMap(path => locateSavedFile(layout, project, path) ?? []);
  checkSideLimits(files, limits);
  const documents: { path: string; source: string }[] = [];
  const unreadable: string[] = [];
  for (const { file, path } of files) {
    try {
      documents.push({ path, source: decode(readFileSync(file)) });
    } catch {
      unreadable.push(path);
    }
  }
  return { documents, unreadable };
}

async function visibleRefs(git: Git, directory: string, reader: Reader, own: string | null) {
  const branches = await git.branches(directory);
  return [
    ...branches.local.filter(name => !reader.view || branchShownTo(name, own)).map(name => ({ name, ref: 'refs/heads/' + name })),
    ...branches.remote.filter(name => !reader.view || branchShownTo(name, own, true)).map(name => ({ name, ref: 'refs/remotes/' + name })),
  ];
}

async function readableRevision(git: Git, directory: string, name: 'branch' | 'commit', reference: string, reader: Reader, own: string | null) {
  const refs = await visibleRefs(git, directory, reader, own);
  if (name === 'branch') {
    const branch = refs.find(candidate => candidate.name === reference);
    return branch ? commitOf(git, directory, branch.ref) : null;
  }
  const revision = await commitOf(git, directory, reference);
  if (revision !== reference) return null;
  for (const ref of refs) {
    const tip = await commitOf(git, directory, ref.ref);
    if (tip && (tip === revision || (await git.isAncestor(directory, revision, tip)))) return revision;
  }
  return null;
}

async function committedDefinitions(deps: SideDependencies, project: string, commit: string, reader: Reader) {
  const { git, layout, limits = SNAPSHOT_LIMITS } = deps;
  const directory = repoDir(layout, project);
  const prefix = projectPrefix(layout, project);
  const entries = (await git.lsTree(directory, commit, prefix))
    .map(entry => ({ ...entry, path: entry.path.slice(prefix.length) }))
    .filter(entry => isDefinition(entry.path) && (!reader.view || reader.view.canRead(project, entry.path)));
  checkSideLimits(entries, limits);
  const blobs = await git.catFileBatch(
    directory,
    entries.map(entry => entry.id),
    limits,
  );
  const documents: { path: string; source: string }[] = [];
  const unreadable: string[] = [];
  for (const { path, id } of entries) {
    const bytes = blobs.get(id);
    if (!bytes) throw new SnapshotUnavailableError('unavailable');
    try {
      documents.push({ path, source: decode(bytes) });
    } catch {
      unreadable.push(path);
    }
  }
  return { documents, unreadable };
}

/** Captures published and saved working project states without reading editor drafts. */
export function createItemDiffSides(deps: SideDependencies) {
  const { git, snapshots, layout, limits = SNAPSHOT_LIMITS } = deps;
  return {
    async revision(project: string, name: 'branch' | 'commit', reference: string, reader: Reader): Promise<LoadedDiffSide> {
      if (!deps.gitAvailable()) throw new SnapshotUnavailableError('unavailable');
      const directory = repoDir(layout, project);
      const commit = await readableRevision(git, directory, name, reference, reader, deps.ownBranch(reader));
      if (!commit) throw new SnapshotUnavailableError('unavailable');
      const { documents, unreadable } = await committedDefinitions(deps, project, commit, reader);
      const records = await readCommittedAddressMigrations(git, layout, project, commit, reader);
      return { version: { side: `${name}:${reference}`, version: commit }, documents, unreadable, records };
    },
    async published(project: string, reader: Reader): Promise<LoadedDiffSide> {
      return snapshots.withPin(async pin => {
        const { commit, documents } = await snapshots.readableDocuments(pin, project, reader);
        const records = await readCommittedAddressMigrations(git, layout, project, commit, reader);
        return { version: { side: 'published', version: commit }, documents: documents.filter(document => isDefinition(document.path)), unreadable: [], records };
      });
    },
    async working(project: string, reader: Reader): Promise<LoadedDiffSide> {
      const working = deps.workingLayout(project, reader);
      const directory = projectDir(working, project);
      const listed = deps.gitAvailable() ? await git.lsFiles(directory) : walk(directory);
      const paths = listed.filter(path => isDefinition(path) && (!reader.view || reader.view.canRead(project, path))).sort();
      const { documents, unreadable } = savedDefinitions(working, project, paths, limits);
      const records = readAddressMigrations(working, project, reader);
      const digest = sha256(JSON.stringify([documents, unreadable, records]));
      return { version: { side: 'working', version: digest }, documents, unreadable, records };
    },
  };
}

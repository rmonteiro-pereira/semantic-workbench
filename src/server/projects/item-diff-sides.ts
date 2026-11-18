// Captures saved and immutable project definitions with their own address history.
import { lstatSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import type { MigrationRecord } from '../../shared/core/address-migration';
import type { SideVersion } from '../../shared/item-diff/item-change';
import { readAddressMigrations, readCommittedAddressMigrations } from './address-migrations';
import { decode, sha256 } from './atomic';
import { SnapshotUnavailableError } from './errors';
import type { Git } from './git';
import { projectDir, projectFile, type DataLayout } from './paths';
import type { PublishedSnapshots } from './published-snapshot';
import type { Reader } from './reader';
import { serializationOf, walk } from './scanner';
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
  limits?: SnapshotLimits;
};

function isDefinition(path: string) {
  return serializationOf(path) !== 'unsupported' && posix.basename(path) !== '.gitignore';
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

function checkSavedLimits(files: readonly { size: number }[], limits: SnapshotLimits) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (files.length > limits.projectFiles || files.some(file => file.size > limits.documentBytes) || totalBytes > limits.totalBytes) {
    throw new SnapshotUnavailableError('unavailable');
  }
}

function savedDefinitions(layout: DataLayout, project: string, paths: string[], limits: SnapshotLimits) {
  const files = paths.flatMap(path => locateSavedFile(layout, project, path) ?? []);
  checkSavedLimits(files, limits);
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

/** Captures published and saved working project states without reading editor drafts. */
export function createItemDiffSides(deps: SideDependencies) {
  const { git, snapshots, layout, limits = SNAPSHOT_LIMITS } = deps;
  return {
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

// Connects the unit source to a workspace: the pinned published snapshot and the saved files of the caller's own working copy.
import { lstatSync, readFileSync } from 'node:fs';
import { readMeshUnits } from './mesh-unit-source';
import { NotFoundError, SnapshotUnavailableError } from '../projects/errors';
import { PathError, projectDir, projectFile, projectPrefix, type DataLayout } from '../projects/paths';
import type { Reader } from '../projects/reader';
import { walk } from '../projects/scanner';
import type { Workspace } from '../projects/workspace';
import { createUnitSource, type FolderView, type ListedFile, type UnitSource } from './unit-source';

/** The part of a workspace the unit source needs. */
export type UnitWorkspace = Pick<Workspace, 'published' | 'repoOf' | 'layoutFor' | 'git' | 'gitAvailable'>;

function isMissing(error: unknown): boolean {
  return error instanceof PathError || (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** The size of a regular file, or null for a link, a folder or a file that is gone. Links are never followed out of the project. */
function regularFileSize(layout: DataLayout, slug: string, path: string): number | null {
  try {
    const file = projectFile(layout, slug, path);
    const status = lstatSync(file);
    return status.isFile() ? status.size : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function readRegularFile(layout: DataLayout, slug: string, path: string): Uint8Array | null {
  if (regularFileSize(layout, slug, path) === null) return null;
  try {
    return new Uint8Array(readFileSync(projectFile(layout, slug, path)));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function workingView(workspace: UnitWorkspace, slug: string, reader: Reader): FolderView {
  const layout = workspace.layoutFor(slug, reader);
  async function list(): Promise<ListedFile[]> {
    const directory = projectDir(layout, slug);
    const paths = workspace.gitAvailable ? await workspace.git.lsFiles(directory) : walk(directory);
    const listed: ListedFile[] = [];
    for (const path of paths) {
      const size = regularFileSize(layout, slug, path);
      if (size !== null) listed.push({ path, size });
    }
    return listed;
  }
  return { list, read: async path => readRegularFile(layout, slug, path) };
}

/** The unit source for one project and one caller. Published reads are pinned for the whole read, so a publish during it changes nothing. */
export function workspaceUnitSource(workspace: UnitWorkspace, slug: string, reader: Reader): UnitSource {
  const snapshots = workspace.published;
  const repository = workspace.repoOf(slug);
  function repositoryOf(project: string) {
    try {
      return workspace.repoOf(project);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
  function meshOf(pin: Parameters<typeof snapshots.documents>[0], files: Parameters<typeof readMeshUnits>[4]) {
    return readMeshUnits({ snapshots, repositoryOf, candidateDocuments: project => snapshots.documents(pin, project) }, pin, reader, repository, files);
  }
  return createUnitSource({
    canRead: path => !reader.view || reader.view.canRead(slug, path),
    openPublished: use =>
      snapshots.withPin(async pin => {
        const sizes = await snapshots.fileSizes(pin, slug);
        const pinned = pin.commits.get(workspace.repoOf(slug));
        if (!pinned) throw new SnapshotUnavailableError('no-commit');
        const prefix = projectPrefix(workspace.layoutFor(slug, reader), slug);
        return use({
          place: { commit: pinned.commit, branch: pinned.branch, projectFolder: prefix ? prefix.slice(0, -1) : '.' },
          list: async () => sizes,
          read: path => snapshots.fileBytes(pin, slug, path),
          mesh: files => meshOf(pin, files),
        });
      }),
    openWorking: async () => ({ ...workingView(workspace, slug, reader), mesh: files => snapshots.withPin(pin => meshOf(pin, files)) }),
  });
}

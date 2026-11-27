// Connects the conversion to a workspace: the caller's saved file, what Git holds for their branch, and the ordinary save.
import { lstatSync, readFileSync } from 'node:fs';
import { sha256Hex } from '../../shared/tessera/digest';
import { StoredTextChangedError } from '../projects/errors';
import { PathError, projectFile, projectPrefix, repoDir } from '../projects/paths';
import type { Reader } from '../projects/reader';
import type { Workspace } from '../projects/workspace';
import { ConvertRefusal, type ConvertDeps } from './convert-service';
import { workspaceUnitSource, type UnitWorkspace } from './workspace-unit-source';

/** The part of a workspace the conversion needs, on top of what reading a unit needs. */
export type ConversionWorkspace = UnitWorkspace & Pick<Workspace, 'saveFile'>;

/** The conversion dependencies for one project and one caller. */
export function workspaceConversion(workspace: ConversionWorkspace, slug: string, reader: Reader): ConvertDeps {
  const layout = workspace.layoutFor(slug, reader);
  const directory = repoDir(layout, slug);
  const prefix = projectPrefix(layout, slug);
  function currentFile(path: string) {
    try {
      const file = projectFile(layout, slug, path);
      if (!lstatSync(file).isFile()) return null;
      const bytes = new Uint8Array(readFileSync(file));
      return { hash: sha256Hex(bytes), bytes };
    } catch (error) {
      if (error instanceof PathError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async function committedState(path: string) {
    if (!workspace.gitAvailable || !(await workspace.git.head(directory))) return 'no-history' as const;
    const committed = await workspace.git.blob(directory, 'HEAD', prefix + path);
    const working = currentFile(path);
    if (!committed || !working) return 'changed' as const;
    return sha256Hex(committed) === working.hash ? ('clean' as const) : ('changed' as const);
  }
  return {
    units: workspaceUnitSource(workspace, slug, reader),
    currentFile,
    committedState,
    save,
  };
  async function save(path: string, baseHash: string, source: string, expectedSha256?: string) {
    try {
      return await workspace.saveFile(slug, path, { baseHash, source, expectedSha256 }, reader);
    } catch (error) {
      if (error instanceof StoredTextChangedError) throw new ConvertRefusal('digest-mismatch', 'Saving would store a different text than the preview showed. Review the conversion again.');
      throw error;
    }
  }
}

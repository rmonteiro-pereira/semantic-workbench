// Where a compile reads its unit from: the published snapshot, or the caller's saved working copy. The compile never learns which, except through the label.
import type { MeshUnitRead } from './mesh-unit-source';
import type { UnitFile } from '../../shared/tessera/compile-unit';
import { HiddenResourceError } from '../projects/errors';
import { selectExportPaths } from '../projects/project-export';
import { SNAPSHOT_LIMITS, type SnapshotLimits } from '../projects/snapshot-index';

/** The two places a unit can be read from. */
export type UnitSourceKind = 'published' | 'working';

/** Says where the files came from. Only a published snapshot has a commit, and only a working copy is unpublished. */
export type SourceLabel = { kind: 'published-snapshot'; commit: string; unpublished: false } | { kind: 'working-copy'; unpublished: true };

/** Where a published unit sits: the branch and commit the workbench published, and the project's folder inside the repository ('.' for its root). */
export type PublishedPlace = { commit: string; branch: string; projectFolder: string };

/** The files of one unit, with the label that every answer built from them must carry. A published read also says where it sits. */
export type UnitRead = { files: UnitFile[]; label: SourceLabel; commit?: string; place?: PublishedPlace; project?: string; mesh?: MeshUnitRead };

/** Reads one unit. The compile service holds this and nothing that knows about Git or folders. */
export type UnitSource = { read(kind: UnitSourceKind): Promise<UnitRead> };

/** A file of a project folder as listed, before its content is read. */
export type ListedFile = { path: string; size: number };

/** One consistent view of a folder: a list, then the content of each listed file. A file that vanished reads as null. */
export type FolderView = { place?: PublishedPlace; list(): Promise<ListedFile[]>; read(path: string): Promise<Uint8Array | null>; mesh?(files: UnitFile[]): Promise<MeshUnitRead | undefined> };

/** What a unit source needs from the workspace, passed in so the decisions here stay free of Git and disk. */
export type UnitSourceDeps = {
  /** Whether the caller may read the file. A false answer for any file of the unit refuses the whole unit. */
  canRead(path: string): boolean;
  project?: string;
  /** Runs `use` on the pinned published snapshot of the project. Throws when nothing is published. */
  openPublished<T>(use: (view: FolderView) => Promise<T>): Promise<T>;
  /** Opens the caller's saved working copy of the project. */
  openWorking(): Promise<FolderView>;
  limits?: SnapshotLimits;
};

/** Names a limit the unit is over, so the person sees which one to reduce. The unit is refused before any content is read. */
export class UnitLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitLimitError';
  }
}

function checkLimits(listed: ListedFile[], limits: SnapshotLimits) {
  if (listed.length > limits.projectFiles) throw new UnitLimitError(`The project holds ${listed.length} files, and the limit is ${limits.projectFiles}.`);
  const oversized = listed.find(file => file.size > limits.documentBytes);
  if (oversized) throw new UnitLimitError(`${oversized.path} holds ${oversized.size} bytes, and the limit is ${limits.documentBytes}.`);
  const total = listed.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.totalBytes) throw new UnitLimitError(`The project holds ${total} bytes, and the limit is ${limits.totalBytes}.`);
}

/** Reads every file of the view. A hidden or vanished file refuses the whole unit with the answer for a missing file, naming nothing. */
async function readUnit(view: FolderView, deps: UnitSourceDeps): Promise<UnitFile[]> {
  const listed = await view.list();
  const sizes = new Map(listed.map(file => [file.path, file.size]));
  const { included, restricted } = selectExportPaths([...sizes.keys()], deps.canRead);
  if (restricted > 0) throw new HiddenResourceError();
  checkLimits(
    included.map(path => ({ path, size: sizes.get(path) ?? 0 })),
    deps.limits ?? SNAPSHOT_LIMITS,
  );
  const files: UnitFile[] = [];
  for (const path of included) {
    const bytes = await view.read(path);
    if (bytes === null) throw new HiddenResourceError();
    files.push({ path, bytes });
  }
  return files;
}

function publishedPlace(place: PublishedPlace | undefined): PublishedPlace {
  if (!place) throw new Error('A published view must say where it sits.');
  return place;
}

/** Builds the seam over the two sources. */
export function createUnitSource(deps: UnitSourceDeps): UnitSource {
  async function readPublished(): Promise<UnitRead> {
    return deps.openPublished(async view => {
      const place = publishedPlace(view.place);
      const files = await readUnit(view, deps);
      const mesh = await view.mesh?.(files);
      return {
        files: mesh?.files ?? files,
        ...(mesh ? { mesh, project: deps.project } : {}),
        label: { kind: 'published-snapshot', commit: place.commit, unpublished: false },
        commit: place.commit,
        place,
      };
    });
  }
  async function readWorking(): Promise<UnitRead> {
    const view = await deps.openWorking();
    const files = await readUnit(view, deps);
    const mesh = await view.mesh?.(files);
    return { files: mesh?.files ?? files, ...(mesh ? { mesh, project: deps.project } : {}), label: { kind: 'working-copy', unpublished: true } };
  }
  return { read: kind => (kind === 'published' ? readPublished() : readWorking()) };
}

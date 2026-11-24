/** Resolves providers for a CLI compile from the candidate repository and trusted publication state. */
import { readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { DEPENDENCY_MANIFEST_PATH, dependencyRoots, parseDependencyManifest } from '../../shared/tessera/dependency-manifest';
import { InputError } from '../../shared/validation/diagnostics';
import { decode, sha256 } from '../projects/atomic';
import { locationOf, projectPath, dataLayout } from '../projects/paths';
import { parsePublishedState } from '../projects/published-pointer';
import type { PublishedPin } from '../projects/published-snapshot';
import { LOCAL_READER } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';
import type { Registry } from '../projects/state';
import { readMeshUnits } from './mesh-unit-source';
import { TesseraRefusal } from './refusal';
import { gitFor, readCommitFolder, type SnapshotSource } from './snapshot-source';

function stateAt(root: string) {
  try {
    const layout = dataLayout(root);
    const registry: Registry = JSON.parse(readFileSync(layout.registry, 'utf8'));
    const published = parsePublishedState(JSON.parse(readFileSync(join(layout.state, 'published.json'), 'utf8')));
    return { layout, registry: registry.projects, published: published.repositories };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new TesseraRefusal('The data root has no readable project registry or publication state.');
  }
}

async function documents(directory: string, commit: string, folder: string, project: string): Promise<PublishedDocument[]> {
  const files = await readCommitFolder(directory, commit, folder);
  return files.map(file => ({
    id: `${project}/${file.path}`,
    project,
    path: file.path,
    filename: basename(file.path),
    source: decode(file.bytes),
    hash: sha256(file.bytes),
    revision: 1,
    updated: '',
  }));
}

/** Loads the interfaces locked by a CLI snapshot, leaving ordinary Ossie input unchanged. */
export async function readSnapshotMesh(snapshot: SnapshotSource, directory: string, dataRoot?: string) {
  const file = snapshot.files.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
  const manifest = file ? parseDependencyManifest(decode(file.bytes)) : undefined;
  const locked = manifest ? dependencyRoots(manifest).flatMap(root => root.providers) : [];
  if (!dataRoot && locked.some(provider => !provider.sameRepository)) throw new TesseraRefusal('Imports from another repository need --data-root to locate published provider history.');
  const state = dataRoot && locked.length ? stateAt(resolve(dataRoot)) : undefined;
  let repository = locked.find(provider => provider.sameRepository)?.repository ?? basename(directory);
  if (state && relative(state.layout.projects, resolve(directory)).split('/')[0] !== '..') repository = relative(state.layout.projects, resolve(directory));
  const project =
    state?.registry.find(entry => {
      const location = locationOf(entry);
      return location.repo === repository && relative(location.repo, location.folder) === (snapshot.projectFolder === '.' ? '' : snapshot.projectFolder);
    })?.slug ?? (snapshot.projectFolder === '.' ? basename(directory) : basename(snapshot.projectFolder));
  const repos = Object.entries(state?.published ?? {}).flatMap(([name, value]) => (value.commit ? [[name, { branch: value.branch, commit: value.commit }] as const] : []));
  const commits = new Map(repos);
  commits.set(repository, { branch: snapshot.branch, commit: snapshot.commit });
  const pin: PublishedPin = { commits };
  function locate(name: string) {
    const registered = state?.registry.find(entry => entry.slug === name);
    if (registered) return locationOf(registered);
    if (state) return null;
    return { repo: repository, folder: join(repository, projectPath(name)) };
  }
  const providerDocuments = async (name: string, location: NonNullable<ReturnType<typeof locate>>, commit: string) => {
    const target = location.repo === repository ? directory : join(state!.layout.projects, location.repo);
    return documents(target, commit, relative(location.repo, location.folder) || '.', name);
  };
  const sources = {
    repositoryOf: (name: string) => locate(name)?.repo ?? null,
    async candidateDocuments(name: string) {
      const location = locate(name);
      if (!location || location.repo !== repository) return [];
      return providerDocuments(name, location, snapshot.commit);
    },
    snapshots: {
      async pinnedDocumentsAt(_pin: PublishedPin, name: string, revision: string) {
        const location = locate(name);
        const published = location && commits.get(location.repo);
        if (!location || !published || !state) return null;
        const target = join(state.layout.projects, location.repo);
        const git = gitFor(target);
        if ((await git.revParse(target, `${revision}^{commit}`)) !== revision || !(await git.isAncestor(target, revision, published.commit))) return null;
        return { commit: revision, documents: await providerDocuments(name, location, revision) };
      },
    },
  };
  try {
    return { project, mesh: await readMeshUnits(sources, pin, LOCAL_READER, repository, snapshot.files) };
  } catch (error) {
    if (error instanceof InputError) throw new TesseraRefusal(error.message);
    throw error;
  }
}

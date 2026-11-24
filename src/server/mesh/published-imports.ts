/** Reads the canonical owners named by a project's published imports. */
import { DEPENDENCY_MANIFEST_PATH, dependencyRoots, manifestIsCurrent, parseDependencyManifest } from '../../shared/tessera/dependency-manifest';
import { declaredImports } from '../../shared/tessera/imports';
import type { PublicConceptOrigin } from '../../shared/tessera/public-concepts';
import { InputError } from '../../shared/validation/diagnostics';
import { SnapshotUnavailableError } from '../projects/errors';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';
import { resolveLockedProvider } from './dependency-check';
import { unitDocument } from './unit-reader';

/** Keeps the consumer root alongside its resolved item, or an opaque unavailable endpoint. */
export type PublishedImport = { root: string; owner: PublicConceptOrigin | null };

/** Resolves visible imports once against the same pin used to read the consumer. */
export async function publishedImports(
  snapshots: PublishedSnapshots,
  pin: PublishedPin,
  repositoryOf: (project: string) => string | null,
  reader: Reader,
  project: string,
  documents: readonly PublishedDocument[],
): Promise<PublishedImport[]> {
  const file = documents.find(document => document.path === DEPENDENCY_MANIFEST_PATH);
  const repository = repositoryOf(project);
  const commit = repository && pin.commits.get(repository)?.commit;
  if (!file || !repository || !commit) return [];
  const manifest = parseDependencyManifest(file.source);
  const frozen = { snapshots, repositoryOf, candidateDocuments: (provider: string) => snapshots.documents(pin, provider) };
  const imports: PublishedImport[] = [];
  for (const lock of dependencyRoots(manifest)) {
    const root = unitDocument(lock.root, documents.find(document => document.path === lock.root)?.source ?? null);
    if (!root || !manifestIsCurrent(lock, declaredImports(root.data))) continue;
    for (const entry of lock.providers) {
      try {
        const provider = await resolveLockedProvider(frozen, pin, { repo: repository, next: commit }, reader, entry);
        for (const name of entry.concepts) {
          const key = provider.publicConcepts.names.get(name);
          const owner = key && provider.publicConcepts.definitions.get(key);
          if (owner) imports.push({ root: lock.root, owner: owner.origin });
        }
      } catch (error) {
        if (!(error instanceof InputError || error instanceof SnapshotUnavailableError)) throw error;
        imports.push({ root: lock.root, owner: null });
      }
    }
  }
  return imports;
}

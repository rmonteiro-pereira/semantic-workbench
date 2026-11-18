/** Plans a dependency lock from the editing unit and immutable provider objects. */
import { compareText, canonicalJson } from '../../shared/tessera/canonical-json';
import { digestOf, type EntryDigest } from './interface-changes';
import { DEPENDENCY_MANIFEST_PATH, dependencyRoot, parseDependencyManifest, type DependencyManifest, type LockedProvider, type TransitiveDependency } from '../../shared/tessera/dependency-manifest';
import type { UnitImport } from '../../shared/tessera/imports';
import { InputError } from '../../shared/validation/diagnostics';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';
import { exportedOntologies, type PublicProvider } from './provider-resolution';

/** Resolves a dependency using an explicit copy for atomic providers and published history for the rest. */
export type DependencyResolution = {
  snapshots: Pick<PublishedSnapshots, 'documents' | 'pinnedDocumentsAt'>;
  repositoryOf: (project: string) => string | null;
  workingDocuments: (project: string) => readonly PublishedDocument[];
};

/** Holds the public interface and its exact lock entry. */
export type ResolvedDependency = {
  provider: PublicProvider;
  locked: LockedProvider;
  hashes: ReadonlyMap<string, EntryDigest>;
};

function refuse(code: string, message: string): never {
  throw new InputError([{ code, path: '/dependencies', message, severity: 'error' }]);
}

function publishedDependencies(documents: readonly PublishedDocument[], root: string): TransitiveDependency[] {
  const document = documents.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
  if (!document) return [];
  const lock = dependencyRoot(parseDependencyManifest(document.source), root);
  if (!lock) return [];
  return lock.providers.flatMap(provider => {
    const own = provider.sameRepository
      ? []
      : [
          {
            project: provider.project,
            commit: provider.commit,
            interfaceHash: provider.interfaceHash,
          },
        ];
    return [...own, ...provider.dependsOn];
  });
}

/** Refuses two different versions of one provider anywhere in the resolved imports. */
export function requireOneProviderVersion(providers: readonly LockedProvider[]): void {
  const versions = new Map<string, string>();
  for (const provider of providers) {
    const entries = provider.sameRepository ? provider.dependsOn : [{ project: provider.project, commit: provider.commit }, ...provider.dependsOn];
    for (const entry of entries) {
      const known = versions.get(entry.project);
      if (known && known !== entry.commit) refuse('tessera-import-version-conflict', `Provider "${entry.project}" resolves to both ${known} and ${entry.commit}.`);
      versions.set(entry.project, entry.commit);
    }
  }
}

async function providerDocuments(source: DependencyResolution, pin: PublishedPin, entry: UnitImport, repository: string, sameRepository: boolean) {
  if (sameRepository) {
    if (entry.version !== 'latest') refuse('tessera-import-pin', `The same-repository import "${entry.alias}" must follow the candidate snapshot.`);
    return {
      commit: pin.commits.get(repository)?.commit ?? '',
      documents: source.workingDocuments(entry.project),
      tag: null,
    };
  }
  if (entry.version !== 'latest') {
    const snapshot = await source.snapshots.pinnedDocumentsAt(pin, entry.project, entry.version.pin);
    if (!snapshot) refuse('tessera-import-pin', `The pin for "${entry.alias}" is outside the provider's published history.`);
    return {
      ...snapshot,
      tag: /^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(entry.version.pin) ? null : entry.version.pin,
    };
  }
  const commit = pin.commits.get(repository)?.commit;
  if (!commit) refuse('tessera-import-provider', `The provider for "${entry.alias}" is unavailable.`);
  return { commit, documents: await source.snapshots.documents(pin, entry.project), tag: null };
}

/** Locks one declaration after checking visibility, version provenance and the allow-list. */
export async function resolveDependency(source: DependencyResolution, pin: PublishedPin, reader: Reader, consumerRepo: string, entry: UnitImport): Promise<ResolvedDependency> {
  const unavailable = () => refuse('tessera-import-provider', `The provider for "${entry.alias}" is unavailable.`);
  if (reader.view && !reader.view.readableProjects.has(entry.project)) unavailable();
  const repository = source.repositoryOf(entry.project);
  if (!repository) return unavailable();
  const sameRepository = repository === consumerRepo;
  const chosen = await providerDocuments(source, pin, entry, repository, sameRepository);
  const candidates = exportedOntologies(entry.project, repository, chosen.commit, chosen.documents).filter(provider => entry.ontology === undefined || entry.ontology === provider.ontology);
  if (candidates.length !== 1) return unavailable();
  const provider = candidates[0];
  for (const concept of entry.concepts) {
    if (!provider.closure.concepts.has(concept)) refuse('tessera-import-unexported', `"${entry.alias}.${concept}" is not exported by the provider.`);
  }
  const common = {
    project: provider.project,
    ontology: provider.ontology,
    repository,
    tag: chosen.tag,
    interfaceHash: provider.closure.interfaceHash,
    concepts: [...entry.concepts].sort(compareText),
    dependsOn: publishedDependencies(chosen.documents, provider.ontology),
  };
  const locked: LockedProvider = sameRepository
    ? { ...common, sameRepository: true, choice: 'latest', tag: null }
    : {
        ...common,
        sameRepository: false,
        choice: entry.version === 'latest' ? 'latest' : 'pin',
        commit: chosen.commit,
      };
  return { provider, locked, hashes: digestOf(provider.closure.concepts) };
}

/** Resolves all imports for one root and computes the exact bytes to be confirmed by the author. */
export async function planDependencyUpdate(
  source: DependencyResolution,
  pin: PublishedPin,
  reader: Reader,
  consumerRepo: string,
  root: string,
  imports: readonly UnitImport[],
): Promise<{ manifest: DependencyManifest; resolved: ResolvedDependency[] }> {
  const resolved: ResolvedDependency[] = [];
  for (const entry of imports) resolved.push(await resolveDependency(source, pin, reader, consumerRepo, entry));
  const providers = resolved.map(result => result.locked);
  requireOneProviderVersion(providers);
  const unique = new Set(providers.map(provider => canonicalJson([provider.project, provider.ontology])));
  if (unique.size !== providers.length) refuse('tessera-import-alias', 'A provider ontology can be imported only once per unit.');
  return { manifest: { manifestVersion: 1, root, providers }, resolved };
}

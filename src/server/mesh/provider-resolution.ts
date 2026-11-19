/** Resolves public ontology interfaces from workbench publication snapshots. */
import { bindPublicConcepts, selectPublicConcepts, type PublicConcept, type PublicConcepts } from '../../shared/tessera/public-concepts';
import { declaredImports, type UnitImport } from '../../shared/tessera/imports';
import { canonicalJson, compareText } from '../../shared/tessera/canonical-json';
import { sha256Hex } from '../../shared/tessera/digest';
import { InputError } from '../../shared/validation/diagnostics';
import { isObject } from '../../shared/edit/source-text';
import { EXPORTS_PROPERTY } from '../../shared/tessera/additions/exports';
import { exportClosure, type ExportClosure } from '../../shared/tessera/export-closure';
import { combineUnit } from '../../shared/tessera/unit-model';
import { readUnitStructure } from '../../shared/tessera/unit-structure';
import { validateInput } from '../../shared/validation/input';
import { NotFoundError, SnapshotUnavailableError } from '../projects/errors';
import { providerDependencies, resolveLockedProvider } from './dependency-check';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';

/** Contains a published provider interface without its private document contents. */
export type PublicProvider = {
  project: string;
  ontology: string;
  repository: string;
  commit: string;
  base: string;
  closure: ExportClosure;
  ontologyName: string;
  sourceItems: ReadonlyMap<string, string>;
  publicConcepts: PublicConcepts;
};

/** Supplies the pinned snapshot reader and the workbench registry's stable repository identity. */
export type ProviderResolution = {
  snapshots: Pick<PublishedSnapshots, 'documents' | 'pinnedDocumentsAt'>;
  repositoryOf: (project: string) => string | null;
};

function unavailable() {
  return new NotFoundError('Ontology provider unavailable.');
}

type ProviderSnapshot = Pick<PublicProvider, 'project' | 'repository' | 'commit'> & { documents: readonly PublishedDocument[] };
type ImportLoader = (entry: UnitImport, root: string) => Promise<PublicProvider>;

/** Calculates public interfaces from a repository object and its exact dependency interfaces. */
export async function exportedOntologies(snapshot: ProviderSnapshot, load?: ImportLoader, ontology?: string): Promise<PublicProvider[]> {
  const { project, repository, commit, documents } = snapshot;
  const files = documents.flatMap(document => {
    const model = validateInput(document.source, document.filename).model;
    return model && 'document' in model ? [{ path: document.path, data: model.document }] : [];
  });
  const structure = readUnitStructure(files);
  const providers: PublicProvider[] = [];
  for (const unit of structure.units) {
    const path = unit.root.path;
    const data = unit.root.data;
    if (ontology !== undefined && ontology !== path) continue;
    if (!isObject(data) || !Array.isArray(data[EXPORTS_PROPERTY]) || !data[EXPORTS_PROPERTY].length || typeof data.version !== 'string') continue;
    const files = new Set([unit.root, ...unit.parts].map(file => file.path));
    if (structure.findings.some(finding => finding.severity === 'error' && finding.files.some(file => files.has(file)))) continue;
    const combined = combineUnit(unit);
    const imported = await reexports(data[EXPORTS_PROPERTY], declaredImports(data), path, load);
    const closure = exportClosure(combined, path, imported.visible);
    if (closure.findings.length) {
      if (load) throw new InputError(closure.findings);
      continue;
    }
    const ontologyName = String(data.name);
    const publicConcepts = bindPublicConcepts(closure.concepts, concept => ({ project, ontology: path, concept, version: commit, ontologyName, sourceItems: combined.itemFiles }), imported.canonical);
    if (imported.visible.size) {
      const identities = [...publicConcepts.names];
      const definitions = [...publicConcepts.definitions].sort(([first], [next]) => compareText(first, next)).map(([name, item]) => [name, item.definition]);
      closure.interfaceHash = `sha256:${sha256Hex(canonicalJson([closure.interfaceHash, identities, definitions]))}`;
    }
    providers.push({ project, ontology: path, repository, commit, base: data.version, closure, ontologyName, sourceItems: combined.itemFiles, publicConcepts });
  }
  return providers;
}

async function reexports(exports: unknown[], imports: UnitImport[], root: string, load?: ImportLoader) {
  const visible = new Map<string, Record<string, unknown>>();
  const names = new Map<string, string>();
  const definitions = new Map<string, PublicConcept>();
  for (const entry of imports) {
    const prefix = entry.alias + '.';
    const selected = entry.concepts.filter(name => exports.includes(prefix + name));
    if (!load || !selected.length) continue;
    const provider = await load(entry, root);
    for (const name of selected) {
      const definition = provider.closure.concepts.get(name);
      const canonical = provider.publicConcepts.names.get(name);
      if (!definition || !canonical) continue;
      visible.set(prefix + name, definition);
      names.set(prefix + name, canonical);
      for (const [key, item] of selectPublicConcepts(provider.publicConcepts, [name])) definitions.set(key, item);
    }
  }
  return { visible, canonical: { names, definitions } };
}

function publishedLoader(resolution: ProviderResolution, pin: PublishedPin, reader: Reader, snapshot: ProviderSnapshot): ImportLoader {
  const source = {
    ...resolution,
    candidateDocuments: async (project: string) => {
      if (pin.commits.get(snapshot.repository)?.commit === snapshot.commit) return resolution.snapshots.documents(pin, project);
      const exact = await resolution.snapshots.pinnedDocumentsAt(pin, project, snapshot.commit);
      if (!exact) throw unavailable();
      return exact.documents;
    },
  };
  return (entry, root) => {
    const provider = providerDependencies(snapshot.documents, root).find(lock => lock.project === entry.project && (entry.ontology === undefined || lock.ontology === entry.ontology));
    if (!provider) throw unavailable();
    return resolveLockedProvider(source, pin, { repo: snapshot.repository, next: snapshot.commit }, reader, provider);
  };
}

/** Reads interfaces from the supplied published commit and its frozen dependencies. */
export function interfacesAt(resolution: ProviderResolution, pin: PublishedPin, reader: Reader, snapshot: ProviderSnapshot, ontology?: string) {
  return exportedOntologies(snapshot, publishedLoader(resolution, pin, reader, snapshot), ontology);
}

/** Resolves the requested published export after checking project visibility. */
export async function resolveProvider(resolution: ProviderResolution, pin: PublishedPin, reader: Reader, project: string, ontology?: string): Promise<PublicProvider> {
  const repository = resolution.repositoryOf(project);
  if (repository && (!reader.view || reader.view.readableProjects.has(project)) && !pin.commits.has(repository)) throw new SnapshotUnavailableError('no-commit');
  const choices = await publishedProviders(resolution, pin, reader, project, ontology);
  if (choices.length !== 1) throw unavailable();
  return choices[0];
}

/** Lists the public interfaces of one readable project at the caller's publication pin. */
export async function publishedProviders(resolution: ProviderResolution, pin: PublishedPin, reader: Reader, project: string, ontology?: string): Promise<PublicProvider[]> {
  if (reader.view && !reader.view.readableProjects.has(project)) return [];
  const repository = resolution.repositoryOf(project);
  const publication = repository ? pin.commits.get(repository) : undefined;
  if (!repository || !publication) return [];
  const documents = await resolution.snapshots.documents(pin, project);
  const snapshot = { project, repository, commit: publication.commit, documents };
  return interfacesAt(resolution, pin, reader, snapshot, ontology);
}

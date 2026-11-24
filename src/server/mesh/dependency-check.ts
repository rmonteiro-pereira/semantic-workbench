/** Checks ontology units and frozen imports in an immutable publication candidate. */
import { IMPORTS_PROPERTY } from '../../shared/tessera/additions/imports';
import { DEPENDENCY_MANIFEST_PATH, dependencyRoot, dependencyRoots, manifestIsCurrent, parseDependencyManifest, type LockedProvider } from '../../shared/tessera/dependency-manifest';
import { declaredImports, providerOf, type UnitImport } from '../../shared/tessera/imports';
import { setFindings, requiredUnitFiles } from '../../shared/tessera/set-validation';
import { readUnitStructure, type OntologyUnit } from '../../shared/tessera/unit-structure';
import { InputError } from '../../shared/validation/diagnostics';
import { validateInput } from '../../shared/validation/input';
import { MissingOntologySetError, SnapshotUnavailableError } from '../projects/errors';
import type { PublicationCandidate } from '../projects/publication-checks';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';
import { requireOneProviderVersion } from './dependency-update';
import { exportedOntologies, type PublicProvider } from './provider-resolution';

type Candidate = Pick<PublicationCandidate, 'repo' | 'next'>;

/** Supplies immutable provider snapshots and the workbench's registered repository identity. */
export type FrozenDependencySource = {
  snapshots: Pick<PublishedSnapshots, 'pinnedDocumentsAt'>;
  candidateDocuments: (project: string) => Promise<PublishedDocument[]>;
  repositoryOf: (project: string) => string | null;
};

function refuse(message: string): never {
  throw new InputError([{ code: 'tessera-dependencies', path: '/' + IMPORTS_PROPERTY, severity: 'error', message: message + ' Use Update dependencies to review the lock.' }]);
}

function parseUnits(documents: readonly PublishedDocument[]) {
  return readUnitStructure(
    documents.flatMap(file => {
      const model = validateInput(file.source, file.filename).model;
      return model && 'document' in model ? [{ path: file.path, data: model.document }] : [];
    }),
  );
}

async function readProvider(source: FrozenDependencySource, pin: PublishedPin, candidate: Candidate, reader: Reader, provider: LockedProvider) {
  const { project, repository } = provider;
  if ((reader.view && !reader.view.readableProjects.has(project)) || source.repositoryOf(project) !== repository) refuse('A locked provider is unavailable.');
  const sameRepository = repository === candidate.repo;
  if (provider.sameRepository !== sameRepository) refuse('A dependency uses the wrong repository resolution.');
  const selected = await (
    provider.sameRepository ? source.candidateDocuments(project).then(documents => ({ commit: candidate.next, documents })) : source.snapshots.pinnedDocumentsAt(pin, project, provider.commit)
  ).catch(error => {
    if (error instanceof SnapshotUnavailableError) return null;
    throw error;
  });
  if (!selected) refuse('A locked provider version is unavailable.');
  return selected;
}

const MAX_PROVIDER_DEPTH = 8;

type ProviderTraversal = {
  source: FrozenDependencySource;
  pin: PublishedPin;
  reader: Reader;
  root: Candidate;
  commits: Map<string, string>;
};

function providerSource(traversal: ProviderTraversal, candidate: Candidate): FrozenDependencySource {
  if (candidate.repo === traversal.root.repo && candidate.next === traversal.root.next) return traversal.source;
  return {
    ...traversal.source,
    candidateDocuments: async project => {
      const snapshot = await traversal.source.snapshots.pinnedDocumentsAt(traversal.pin, project, candidate.next);
      if (!snapshot) refuse('A locked provider version is unavailable.');
      return snapshot.documents;
    },
  };
}

/** Reads the exact lock belonging to the provider root. */
export function providerDependencies(documents: readonly PublishedDocument[], root: string) {
  const unit = documents.find(file => file.path === root);
  if (!unit) return [];
  const model = validateInput(unit.source, unit.filename).model;
  if (!model || !('document' in model)) return [];
  const imports = declaredImports(model.document);
  if (!imports.length) return [];
  const lock = documents.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
  if (!lock) refuse('A locked provider has no dependency manifest.');
  try {
    const entry = dependencyRoot(parseDependencyManifest(lock.source), root);
    if (entry && manifestIsCurrent(entry, imports)) return entry.providers;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }
  refuse('A locked provider has a stale or invalid dependency manifest.');
}

function lockedImport(entry: UnitImport, providers: LockedProvider[]): LockedProvider {
  const provider = providers.find(provider => provider.project === entry.project && (entry.ontology === undefined || provider.ontology === entry.ontology));
  if (!provider) refuse('A re-export has no locked provider.');
  return provider;
}

async function traverseProvider(traversal: ProviderTraversal, candidate: Candidate, provider: LockedProvider, visited: ReadonlySet<string>, reexports: string[] = []): Promise<PublicProvider> {
  const { pin, reader, commits } = traversal;
  const commit = provider.sameRepository ? candidate.next : provider.commit;
  const key = JSON.stringify([provider.project, provider.ontology, commit]);
  const label = provider.project + '/' + provider.ontology;
  const previous = commits.get(provider.project);
  if (previous !== undefined && previous !== commit) refuse(`Provider "${provider.project}" resolves to both "${previous}" and "${commit}".`);
  commits.set(provider.project, commit);
  if (reexports.includes(label)) refuse(`Re-export cycle: ${[...reexports, label].join(' → ')}.`);
  if (reexports.length >= MAX_PROVIDER_DEPTH || (!visited.has(key) && visited.size >= MAX_PROVIDER_DEPTH)) refuse(`An import chain exceeds ${MAX_PROVIDER_DEPTH} providers.`);
  const selected = await readProvider(providerSource(traversal, candidate), pin, candidate, reader, provider);
  const next = new Set([...visited, key]);
  const home = { repo: provider.repository, next: commit };
  const dependencies = () => providerDependencies(selected.documents, provider.ontology);
  const used = new Set<LockedProvider>();
  const [match] = await exportedOntologies(
    { ...selected, project: provider.project, repository: provider.repository },
    entry => {
      const nested = lockedImport(entry, dependencies());
      used.add(nested);
      return traverseProvider(traversal, home, nested, next, [...reexports, label]);
    },
    provider.ontology,
  );
  if (!match || match.closure.interfaceHash !== provider.interfaceHash) refuse('A locked provider interface differs from the candidate or pinned version.');
  if (provider.concepts.some(name => !match.closure.concepts.has(name))) refuse('A locked concept is not exported by its provider.');
  if (!visited.has(key)) {
    for (const dependency of dependencies()) {
      if (!used.has(dependency)) await traverseProvider(traversal, home, dependency, next);
    }
  }
  return match;
}

/** Resolves an existing lock entry from a chosen provider snapshot. */
export function resolveLockedProvider(source: FrozenDependencySource, pin: PublishedPin, candidate: Candidate, reader: Reader, provider: LockedProvider) {
  const traversal = { source, pin, reader, root: candidate, commits: new Map<string, string>() };
  return traverseProvider(traversal, candidate, provider, new Set());
}

function projectInterface(provider: PublicProvider, reader: Reader, sameRepository: boolean) {
  const readableItems = (project: string, items?: ReadonlyMap<string, string>) => new Map([...(items ?? [])].filter(([, path]) => !reader.view || reader.view.canRead(project, path)));
  const definitions = new Map(
    [...provider.publicConcepts.definitions].map(([key, item]) => [key, { ...item, origin: { ...item.origin, sourceItems: readableItems(item.origin.project, item.origin.sourceItems) } }]),
  );
  return {
    project: provider.project,
    ontology: provider.ontology,
    exports: new Set(provider.closure.concepts.keys()),
    sameRepository,
    concepts: provider.closure.concepts,
    publicConcepts: { names: provider.publicConcepts.names, definitions },
    version: provider.commit,
    scope: provider.base,
    interfaceHash: provider.closure.interfaceHash,
    sourceItems: readableItems(provider.project, provider.sourceItems),
    ontologyName: provider.ontologyName,
  };
}

/** Resolves exactly the public interface entries selected by the lock, using only the given snapshots. */
export async function resolveFrozenUnit(source: FrozenDependencySource, pin: PublishedPin, candidate: Candidate, reader: Reader, unit: OntologyUnit, lockFile?: { source: string }) {
  const imports = declaredImports(unit.root.data);
  if (!imports.length) return { imports, providers: [] };
  if (!lockFile) refuse('The importing unit has no dependency manifest.');
  let lock;
  try {
    lock = parseDependencyManifest(lockFile.source);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refuse('The importing unit has an invalid dependency manifest.');
  }
  const entry = dependencyRoot(lock, unit.root.path);
  if (!entry || !manifestIsCurrent(entry, imports)) refuse('The dependency manifest is stale.');
  requireOneProviderVersion(entry.providers);
  const traversal = { source, pin, reader, root: candidate, commits: new Map<string, string>() };
  const providers = [];
  for (const provider of entry.providers) {
    providers.push(projectInterface(await traverseProvider(traversal, candidate, provider, new Set()), reader, provider.sameRepository));
  }
  return { imports, providers };
}

/** Checks a complete unit using the public definitions frozen by its lock. */
export async function checkImports(source: FrozenDependencySource, pin: PublishedPin, candidate: Candidate, reader: Reader, unit: OntologyUnit, lockFile?: { source: string }) {
  const { imports, providers } = await resolveFrozenUnit(source, pin, candidate, reader, unit, lockFile);
  const imported = new Map<string, Record<string, unknown>>();
  for (const entry of imports) {
    const provider = providerOf(entry, providers);
    for (const name of entry.concepts) {
      const concept = provider?.concepts.get(name);
      if (concept) imported.set(`${entry.alias}.${name}`, concept);
    }
  }
  return setFindings(unit, providers, imported);
}

function checkLockCoverage(units: OntologyUnit[], lockFile?: PublishedDocument) {
  if (!lockFile) return;
  let manifest;
  try {
    manifest = parseDependencyManifest(lockFile.source);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refuse('The project has an invalid dependency manifest.');
  }
  const roots = dependencyRoots(manifest);
  for (const entry of roots) {
    if (!entry.providers.length) continue;
    const unit = units.find(unit => unit.root.path === entry.root);
    if (!unit || !manifestIsCurrent(entry, declaredImports(unit.root.data))) refuse('The dependency manifest is stale.');
  }
  requireOneProviderVersion(roots.flatMap(root => root.providers));
}

function requireCompleteSets(units: OntologyUnit[], documents: readonly PublishedDocument[]) {
  const paths = new Set(documents.map(file => file.path));
  const available = units.flatMap(unit => requiredUnitFiles(unit).map(path => paths.has(path)));
  if (available.includes(false)) throw new MissingOntologySetError();
}

/** Refuses an incomplete reader projection before full candidate indexing or the governance diff. */
export async function requireVisibleCandidateSets(snapshots: PublishedSnapshots, candidate: PublicationCandidate, reader: Reader): Promise<void> {
  const view = reader.view;
  if (!view) return;
  const projects = await snapshots.visibleCandidateDocuments(candidate, (project, path) => view.canRead(project, path));
  for (const documents of projects) requireCompleteSets(parseUnits(documents).units, documents);
}

/** Blocks the ref transition unless every candidate unit and dependency agrees with the lock. */
export async function checkPublicationDependencies(
  source: Omit<FrozenDependencySource, 'candidateDocuments' | 'snapshots'> & { snapshots: PublishedSnapshots; projectsIn: (repository: string) => string[] },
  candidate: Candidate,
  reader: Reader,
): Promise<void> {
  return source.snapshots.withPin(async pin => {
    const frozen = { ...source, candidateDocuments: (project: string) => source.snapshots.candidateDocuments(candidate, project) };
    for (const project of source.projectsIn(candidate.repo)) {
      const documents = await frozen.candidateDocuments(project);
      const visible = (path: string) => !reader.view || reader.view.canRead(project, path);
      const readable = documents.filter(file => visible(file.path));
      const { units, findings } = parseUnits(readable);
      requireCompleteSets(units, readable);
      const lock = readable.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
      const errors = findings.filter(finding => finding.severity === 'error');
      if (documents.length !== readable.length) {
        const fullSet = parseUnits(documents);
        if (fullSet.units.some(unit => !visible(unit.root.path)) || fullSet.findings.some(finding => finding.severity === 'error' && !finding.files.every(visible))) {
          throw new MissingOntologySetError();
        }
      }
      checkLockCoverage(units, lock);
      for (const unit of units) errors.push(...(await checkImports(frozen, pin, candidate, reader, unit, lock)).filter(finding => finding.severity === 'error'));
      if (errors.length) throw new InputError(errors.map(({ code, path, severity, message }) => ({ code, path, severity, message })));
    }
  });
}

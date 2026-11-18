/** Checks ontology units and frozen imports in an immutable publication candidate. */
import { DEPENDENCY_MANIFEST_PATH, manifestIsCurrent, parseDependencyManifest, type LockedProvider } from '../../shared/tessera/dependency-manifest';
import { declaredImports, providerOf } from '../../shared/tessera/imports';
import { setFindings, requiredUnitFiles } from '../../shared/tessera/set-validation';
import { readUnitStructure, type OntologyUnit } from '../../shared/tessera/unit-structure';
import { InputError } from '../../shared/validation/diagnostics';
import { validateInput } from '../../shared/validation/input';
import { SnapshotUnavailableError } from '../projects/errors';
import type { PublicationCandidate } from '../projects/publication-checks';
import type { PublishedPin, PublishedSnapshots } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';
import { requireOneProviderVersion } from './dependency-update';
import { exportedOntologies } from './provider-resolution';

type Candidate = Pick<PublicationCandidate, 'repo' | 'next'>;

type CheckSource = {
  snapshots: PublishedSnapshots;
  projectsIn: (repository: string) => string[];
  repositoryOf: (project: string) => string | null;
};

function refuse(message: string): never {
  throw new InputError([{ code: 'tessera-dependencies', path: '/tessera_imports', severity: 'error', message: message + ' Use Update dependencies to review the lock.' }]);
}

function parseUnits(documents: readonly PublishedDocument[]) {
  return readUnitStructure(
    documents.flatMap(file => {
      const model = validateInput(file.source, file.filename).model;
      return model && 'document' in model ? [{ path: file.path, data: model.document }] : [];
    }),
  );
}

async function checkProvider(source: CheckSource, pin: PublishedPin, candidate: Candidate, reader: Reader, provider: LockedProvider) {
  const { project, ontology, repository } = provider;
  if ((reader.view && !reader.view.readableProjects.has(project)) || source.repositoryOf(project) !== repository) refuse('A locked provider is unavailable.');
  const sameRepository = repository === candidate.repo;
  if (provider.sameRepository !== sameRepository) refuse('A dependency uses the wrong repository resolution.');
  const selected = await (
    provider.sameRepository
      ? source.snapshots.candidateDocuments(candidate, project).then(documents => ({ commit: candidate.next, documents }))
      : source.snapshots.pinnedDocumentsAt(pin, project, provider.commit)
  ).catch(error => {
    if (error instanceof SnapshotUnavailableError) return null;
    throw error;
  });
  if (!selected) refuse('A locked provider version is unavailable.');
  const match = exportedOntologies(project, repository, selected.commit, selected.documents).find(entry => entry.ontology === ontology);
  if (!match || match.closure.interfaceHash !== provider.interfaceHash) refuse('A locked provider interface differs from the candidate or pinned version.');
  return { project, ontology, exports: new Set(match.closure.concepts.keys()), sameRepository, concepts: match.closure.concepts };
}

async function checkImports(source: CheckSource, pin: PublishedPin, candidate: Candidate, reader: Reader, unit: OntologyUnit, lockFile?: PublishedDocument) {
  const imports = declaredImports(unit.root.data);
  if (!imports.length) return setFindings(unit, []);
  if (!lockFile) refuse('The importing unit has no dependency manifest.');
  let lock;
  try {
    lock = parseDependencyManifest(lockFile.source);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refuse('The importing unit has an invalid dependency manifest.');
  }
  if (lock.root !== unit.root.path || !manifestIsCurrent(lock, imports)) refuse('The dependency manifest is stale.');
  requireOneProviderVersion(lock.providers);
  const providers = [];
  for (const provider of lock.providers) providers.push(await checkProvider(source, pin, candidate, reader, provider));
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

/** Blocks the ref transition unless every candidate unit and dependency agrees with the lock. */
export async function checkPublicationDependencies(source: CheckSource, candidate: Candidate, reader: Reader): Promise<void> {
  return source.snapshots.withPin(async pin => {
    for (const project of source.projectsIn(candidate.repo)) {
      const documents = await source.snapshots.candidateDocuments(candidate, project);
      const { units, findings } = parseUnits(documents);
      const lock = documents.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
      const visible = (path: string) => !reader.view || reader.view.canRead(project, path);
      const paths = new Set(documents.filter(file => visible(file.path)).map(file => file.path));
      const hasUnavailableFile = units.some(unit => !requiredUnitFiles(unit).every(path => paths.has(path)));
      const errors = findings.filter(finding => finding.severity === 'error');
      if (hasUnavailableFile || errors.some(finding => !finding.files.every(visible))) refuse('The ontology set could not be checked.');
      for (const unit of units) errors.push(...(await checkImports(source, pin, candidate, reader, unit, lock)).filter(finding => finding.severity === 'error'));
      if (errors.length) throw new InputError(errors.map(({ code, path, severity, message }) => ({ code, path, severity, message })));
    }
  });
}

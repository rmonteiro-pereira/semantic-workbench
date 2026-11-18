/** Resolves public ontology interfaces from workbench publication snapshots. */
import { isObject } from '../../shared/edit/source-text';
import { EXPORTS_PROPERTY } from '../../shared/tessera/additions/exports';
import { exportClosure, type ExportClosure } from '../../shared/tessera/export-closure';
import { combineUnit } from '../../shared/tessera/unit-model';
import { readUnitStructure } from '../../shared/tessera/unit-structure';
import { validateInput } from '../../shared/validation/input';
import { NotFoundError, SnapshotUnavailableError } from '../projects/errors';
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
};

/** Supplies the pinned snapshot reader and the workbench registry's stable repository identity. */
export type ProviderResolution = {
  snapshots: Pick<PublishedSnapshots, 'documents'>;
  repositoryOf: (project: string) => string | null;
};

function unavailable() {
  return new NotFoundError('Ontology provider unavailable.');
}

/** Calculates only public interfaces from a published or candidate repository object. */
export function exportedOntologies(project: string, repository: string, commit: string, documents: readonly PublishedDocument[]): PublicProvider[] {
  const files = documents.flatMap(document => {
    const model = validateInput(document.source, document.filename).model;
    return model && 'document' in model ? [{ path: document.path, data: model.document }] : [];
  });
  const structure = readUnitStructure(files);
  return structure.units.flatMap(unit => {
    const data = unit.root.data;
    if (!isObject(data) || !Array.isArray(data[EXPORTS_PROPERTY]) || !data[EXPORTS_PROPERTY].length || typeof data.version !== 'string') return [];
    const files = new Set([unit.root, ...unit.parts].map(file => file.path));
    if (structure.findings.some(finding => finding.severity === 'error' && finding.files.some(file => files.has(file)))) return [];
    const combined = combineUnit(unit);
    const closure = exportClosure(combined, unit.root.path);
    if (closure.findings.some(finding => finding.severity === 'error')) return [];
    return [
      {
        project,
        ontology: unit.root.path,
        repository,
        commit,
        base: data.version,
        closure,
        ontologyName: String(data.name),
        sourceItems: combined.itemFiles,
      },
    ];
  });
}

/** Resolves the requested published export after checking project visibility. */
export async function resolveProvider(resolution: ProviderResolution, pin: PublishedPin, reader: Reader, project: string, ontology?: string): Promise<PublicProvider> {
  if (reader.view && !reader.view.readableProjects.has(project)) throw unavailable();
  const repository = resolution.repositoryOf(project);
  if (!repository) throw unavailable();
  const publication = pin.commits.get(repository);
  if (!publication) throw new SnapshotUnavailableError('no-commit');
  const documents = await resolution.snapshots.documents(pin, project);
  const choices = exportedOntologies(project, repository, publication.commit, documents).filter(provider => ontology === undefined || provider.ontology === ontology);
  if (choices.length !== 1) throw unavailable();
  return choices[0];
}

/** Lists the public interfaces of one readable project at the caller's publication pin. */
export async function publishedProviders(resolution: ProviderResolution, pin: PublishedPin, reader: Reader, project: string): Promise<PublicProvider[]> {
  if (reader.view && !reader.view.readableProjects.has(project)) return [];
  const repository = resolution.repositoryOf(project);
  const publication = repository ? pin.commits.get(repository) : undefined;
  if (!repository || !publication) return [];
  const documents = await resolution.snapshots.documents(pin, project);
  return exportedOntologies(project, repository, publication.commit, documents);
}

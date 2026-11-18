/** Resolves only the public interfaces named by complete published consumer units. */
import { DEPENDENCY_MANIFEST_PATH } from '../../shared/tessera/dependency-manifest';
import { declaredImports, type ResolvedImportInterface } from '../../shared/tessera/imports';
import { requiredUnitFiles } from '../../shared/tessera/set-validation';
import { readUnitStructure } from '../../shared/tessera/unit-structure';
import { InputError } from '../../shared/validation/diagnostics';
import { SnapshotUnavailableError } from '../projects/errors';
import type { PublishedPin } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';
import type { PublishedDocument } from '../projects/snapshot-index';
import type { Workspace } from '../projects/workspace';
import { resolveFrozenUnit } from './dependency-check';
import { unitDocument } from './unit-reader';

/** Returns absent entries when the reader's complete published unit is unavailable. */
export async function publishedUnitInterfaces(ws: Workspace, pin: PublishedPin, reader: Reader, project: string, documents: readonly PublishedDocument[]) {
  const result = new Map<string, ResolvedImportInterface[]>();
  const lock = documents.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
  if (!lock) return result;
  const repository = ws.repoOf(project);
  const commit = pin.commits.get(repository)?.commit;
  if (!commit) return result;
  const structure = readUnitStructure(documents.flatMap(file => unitDocument(file.path, file.source) ?? []));
  const visible = new Set(documents.map(file => file.path));
  const registry = new Set(ws.state.registry().projects.map(entry => entry.slug));
  const source = {
    snapshots: ws.published,
    candidateDocuments: (provider: string) => ws.published.documents(pin, provider),
    repositoryOf: (provider: string) => (registry.has(provider) ? ws.repoOf(provider) : null),
  };
  for (const unit of structure.units) {
    if (!declaredImports(unit.root.data).length || !requiredUnitFiles(unit).every(path => visible.has(path))) continue;
    const paths = new Set(requiredUnitFiles(unit));
    if (structure.findings.some(finding => finding.severity === 'error' && finding.files.some(path => paths.has(path)))) continue;
    try {
      const { imports, providers } = await resolveFrozenUnit(source, pin, { repo: repository, next: commit }, reader, unit, lock);
      result.set(
        unit.root.path,
        providers.map(provider => {
          const allowed = new Set(imports.filter(entry => entry.project === provider.project && (!entry.ontology || entry.ontology === provider.ontology)).flatMap(entry => entry.concepts));
          return { ...provider, concepts: new Map([...provider.concepts].filter(([name]) => allowed.has(name))), exports: allowed };
        }),
      );
    } catch (error) {
      if (!(error instanceof InputError || error instanceof SnapshotUnavailableError)) throw error;
    }
  }
  return result;
}

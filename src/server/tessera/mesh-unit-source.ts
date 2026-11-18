/** Reads Tessera mesh inputs without treating neighbouring metadata as ontology source. */
import { DEPENDENCY_MANIFEST_PATH, parseDependencyManifest, type DependencyManifest } from '../../shared/tessera/dependency-manifest';
import { classifyFile, type UnitFile } from '../../shared/tessera/document-kind';
import { declaredImports, type ResolvedImportInterface } from '../../shared/tessera/imports';
import { requiredUnitFiles } from '../../shared/tessera/set-validation';
import { readUnitStructure, type OntologyUnit } from '../../shared/tessera/unit-structure';
import { resolveFrozenUnit, type FrozenDependencySource } from '../mesh/dependency-check';
import { HiddenResourceError } from '../projects/errors';
import type { PublishedPin } from '../projects/published-snapshot';
import type { Reader } from '../projects/reader';

/** Supplies declared source files and locked public interfaces to the pure compiler. */
export type MeshUnitRead = { files: UnitFile[]; units: OntologyUnit[]; manifest?: DependencyManifest; providers: ReadonlyMap<string, ResolvedImportInterface[]> };

const decoder = new TextDecoder();

/** Resolves the revision-three units and their dependencies from the caller's pinned view. */
export async function readMeshUnits(source: FrozenDependencySource, pin: PublishedPin, reader: Reader, repository: string, files: UnitFile[]): Promise<MeshUnitRead | undefined> {
  const classified = files.filter(file => /\.(?:ya?ml|json)$/i.test(file.path)).map(classifyFile);
  const meshFiles = classified.flatMap(entry => {
    if (entry.kind === 'tessera-ontology' && entry.revision === 3) return [{ path: entry.file.path, data: entry.reading.data }];
    if (entry.kind === 'tessera-part') return [{ path: entry.file.path, data: entry.data }];
    return [];
  });
  if (!meshFiles.length) return undefined;
  const { units } = readUnitStructure(meshFiles);
  const paths = new Set(files.map(file => file.path));
  if (units.some(unit => requiredUnitFiles(unit).some(path => !paths.has(path)))) throw new HiddenResourceError();
  const lock = files.find(file => file.path === DEPENDENCY_MANIFEST_PATH);
  const lockFile = lock ? { source: decoder.decode(lock.bytes) } : undefined;
  const providers = new Map<string, ResolvedImportInterface[]>();
  const candidate = { repo: repository, next: pin.commits.get(repository)?.commit ?? '' };
  for (const unit of units) {
    if (!declaredImports(unit.root.data).length) continue;
    const resolved = await resolveFrozenUnit(source, pin, candidate, reader, unit, lockFile);
    providers.set(unit.root.path, resolved.providers);
  }
  const includedParts = new Set(units.flatMap(unit => unit.parts.map(part => part.path)));
  const excluded = new Set(classified.filter(entry => entry.kind === 'tessera-part' && !includedParts.has(entry.file.path)).map(entry => entry.file.path));
  const compileFiles = files.filter(file => file.path !== DEPENDENCY_MANIFEST_PATH && !excluded.has(file.path) && !file.path.endsWith('.jsonl'));
  return { files: compileFiles, units, providers, manifest: lockFile ? parseDependencyManifest(lockFile.source) : undefined };
}

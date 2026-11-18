/** Reads the parts named by a root through the same file visibility boundary as the root. */
import { posix } from 'node:path';
import { INCLUDES_PROPERTY } from '../../shared/tessera/additions/includes';
import { PART_PROPERTY } from '../../shared/tessera/additions/part';
import { isObject } from '../../shared/edit/source-text';
import { declaredImports } from '../../shared/tessera/imports';
import { readMarker } from '../../shared/tessera/marker';
import { requiredUnitFiles, setFindings, type ReaderValidation } from '../../shared/tessera/set-validation';
import { readUnitStructure, type OntologyUnit, type UnitDocument, type UnitFinding } from '../../shared/tessera/unit-structure';
import { validateInput } from '../../shared/validation/input';
import { MissingOntologySetError } from '../projects/errors';

type UnitText = { path: string; source: string };
type ReadSource = { read: (path: string) => string | null; rootPaths: () => string[] };

/** Parses a revision-three root or part from an already readable source file. */
export function unitDocument(path: string, source: string | null): UnitDocument | undefined {
  if (source === null) return undefined;
  const parsed = validateInput(source, posix.basename(path)).model;
  if (!parsed || !('document' in parsed)) return undefined;
  const data = parsed.document;
  const marker = readMarker(data);
  if (marker.family === 'tessera' && marker.revision === 3 && Array.isArray(data.ontology)) return { path, data };
}

function owns(root: UnitDocument, path: string): boolean {
  if (!isObject(root.data) || Object.hasOwn(root.data, PART_PROPERTY)) return false;
  const includes = root.data[INCLUDES_PROPERTY];
  return Array.isArray(includes) && includes.includes(path);
}

function rootOf(file: UnitDocument, source: ReadSource): UnitDocument | undefined {
  if (!isObject(file.data) || !Object.hasOwn(file.data, PART_PROPERTY)) return file;
  const owners = source.rootPaths().flatMap(path => {
    if (path === file.path) return [];
    const root = unitDocument(path, source.read(path));
    return root && owns(root, file.path) ? [root] : [];
  });
  return owners.length === 1 ? owners[0] : undefined;
}

/** Recomputes each set for the caller's current access and returns only caller-readable findings. */
export async function readOntologySet(active: UnitText, source: ReadSource, checkDependencies: (unit: OntologyUnit) => Promise<UnitFinding[] | undefined>): Promise<ReaderValidation | undefined> {
  const file = unitDocument(active.path, active.source);
  if (!file) return undefined;
  const individual = { [file.path]: validateInput(active.source, posix.basename(file.path)).issues };
  const partial: ReaderValidation = { singleFile: individual, set: [], setNotChecked: true };
  const root = rootOf(file, source);
  if (!root) return partial;
  const required = requiredUnitFiles({ root, parts: [] });
  const files = required.map(path => (path === root.path ? root : unitDocument(path, source.read(path))));
  if (files.some(file => !file)) return partial;
  const { units, findings } = readUnitStructure(files.filter(file => file !== undefined));
  const unit = units.find(unit => unit.root.path === root.path);
  if (!unit) return partial;
  const complete = declaredImports(root.data).length ? await checkDependencies(unit) : setFindings(unit, []);
  if (!complete) return partial;
  return { singleFile: individual, set: [...findings, ...complete], setNotChecked: false };
}

/** Requires the same complete set to be available before the caller may edit its source. */
export function requireWritableOntologySet(active: UnitText, source: ReadSource): void {
  const file = unitDocument(active.path, active.source);
  if (!file) return;
  const root = rootOf(file, source);
  if (!root) {
    throw new MissingOntologySetError();
  }
  const required = requiredUnitFiles({ root, parts: [] });
  const available = required.map(path => path === root.path || source.read(path) !== null);
  if (available.some(present => !present)) throw new MissingOntologySetError();
}

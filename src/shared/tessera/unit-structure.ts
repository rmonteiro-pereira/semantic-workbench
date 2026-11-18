/** Resolves a flat list of declared ontology parts without reading the filesystem. */
import { INCLUDES_PROPERTY, MAX_UNIT_PARTS } from './additions/includes';
import { IMPORTS_PROPERTY, MAX_UNIT_IMPORTS } from './additions/imports';
import { PART_PROPERTY } from './additions/part';
import { compareText } from './canonical-json';
import { TesseraNames } from './format';
import { readMarker } from './marker';

/** One project file and its parsed content, or a link that must never be followed. */
export type UnitDocument = { path: string; data: unknown; link?: boolean };

/** A finding about a complete set of files. */
export type UnitFinding = { code: string; files: string[]; path: string; message: string; severity: 'error' | 'warning' };

/** A root and its exclusively owned parts in declaration order. */
export type OntologyUnit = { root: UnitDocument; parts: UnitDocument[] };

function record(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return {};
}

function isPart(file: UnitDocument): boolean {
  const marker = readMarker(file.data);
  return !file.link && marker.family === 'tessera' && marker.revision === 3 && record(file.data)[PART_PROPERTY] === true;
}

function isRoot(file: UnitDocument): boolean {
  const marker = readMarker(file.data);
  return !file.link && marker.family === 'tessera' && marker.revision === 3 && !Object.hasOwn(record(file.data), PART_PROPERTY) && Array.isArray(record(file.data).ontology);
}

function confined(path: unknown): path is string {
  return typeof path === 'string' && !/^[A-Za-z]:/.test(path) && !/[\\\u0000-\u001f\u007f]/u.test(path) && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function issue(code: string, files: string[], property: string, detail: string, severity: UnitFinding['severity'] = 'error'): UnitFinding {
  return { code, files, path: `/${property}`, severity, message: `${files.join(', ')}: ${detail}` };
}

function partProblem(part: UnitDocument): UnitFinding | undefined {
  const data = record(part.data);
  if (Object.hasOwn(data, 'version')) return issue('tessera-mixed-version', [part.path], 'version', 'A part inherits its Ossie version from its root.');
  const extra = Object.keys(data).find(key => ![PART_PROPERTY, 'ontology', TesseraNames.markerKey].includes(key));
  if (extra || !Array.isArray(data.ontology)) return issue('tessera-part-shape', [part.path], extra ?? 'ontology', 'A part holds an ontology list and its markers only.');
}

function collectParts(root: UnitDocument, files: ReadonlyMap<string, UnitDocument>, findings: UnitFinding[]): UnitDocument[] {
  const data = record(root.data);
  const names = data[INCLUDES_PROPERTY];
  const imports = data[IMPORTS_PROPERTY];
  if (Array.isArray(imports) && imports.length > MAX_UNIT_IMPORTS) findings.push(issue('tessera-import-bound', [root.path], IMPORTS_PROPERTY, `At most ${MAX_UNIT_IMPORTS} imports are allowed.`));
  if (!Array.isArray(names)) return [];
  if (names.length > MAX_UNIT_PARTS) {
    findings.push(issue('tessera-import-bound', [root.path], INCLUDES_PROPERTY, `At most ${MAX_UNIT_PARTS} parts are allowed.`));
    return [];
  }
  const parts: UnitDocument[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const path = String(name);
    const part = files.get(path);
    const involved = [root.path, path];
    if (!confined(name) || part?.link) findings.push(issue('tessera-include-escape', involved, INCLUDES_PROPERTY, 'The include must be a plain project-relative path without links.'));
    else if (path === root.path || seen.has(path) || (part && isRoot(part)))
      findings.push(issue('tessera-include-cycle', involved, INCLUDES_PROPERTY, 'A root can list each part only once and cannot list a root.'));
    else if (!part) findings.push(issue('tessera-include-missing', involved, INCLUDES_PROPERTY, 'The listed part is missing.'));
    else if (!isPart(part)) findings.push(issue('tessera-include-not-part', involved, INCLUDES_PROPERTY, 'The listed file is not a Tessera part.'));
    else parts.push(part);
    seen.add(path);
  }
  return parts;
}

function checkConcepts(unit: OntologyUnit, findings: UnitFinding[]) {
  const owners = new Map<string, string>();
  for (const file of [unit.root, ...unit.parts]) {
    const concepts = record(file.data).ontology;
    if (!Array.isArray(concepts)) continue;
    for (const concept of concepts) {
      const name = record(concept).concept;
      if (typeof name !== 'string') continue;
      const owner = owners.get(name);
      if (owner !== undefined) findings.push(issue('tessera-duplicate-concept', [owner, file.path], 'ontology', `The concept "${name}" is declared twice.`));
      else owners.set(name, file.path);
    }
  }
}

/** Builds project units and reports structural problems without traversing part declarations. */
export function readUnitStructure(documents: readonly UnitDocument[]): { units: OntologyUnit[]; findings: UnitFinding[] } {
  const files = [...documents].sort((left, right) => compareText(left.path, right.path));
  const byPath = new Map(files.map(file => [file.path, file]));
  const findings: UnitFinding[] = [];
  const units = files.filter(isRoot).map(root => ({ root, parts: collectParts(root, byPath, findings) }));
  const owners = new Map<string, string[]>();
  for (const unit of units) {
    for (const part of unit.parts) {
      const roots = owners.get(part.path) ?? [];
      roots.push(unit.root.path);
      owners.set(part.path, roots);
    }
  }
  for (const part of files.filter(isPart)) {
    const roots = owners.get(part.path) ?? [];
    const problem = partProblem(part);
    if (roots.length > 1) findings.push(issue('tessera-duplicate-owner', [...roots, part.path], INCLUDES_PROPERTY, 'The part belongs to more than one root.'));
    else if (problem) findings.push(problem);
    else if (!roots.length) findings.push(issue('tessera-orphan-part', [part.path], PART_PROPERTY, 'No root lists this part.', 'warning'));
  }
  for (const unit of units) {
    unit.parts = unit.parts.filter(part => owners.get(part.path)?.length === 1 && !partProblem(part));
    checkConcepts(unit, findings);
  }
  return { units, findings };
}

/** Finds the active unit in an authorized set only when all of its declared parts are available. */
export function completeOntologyUnit(documents: readonly UnitDocument[], activePath: string): OntologyUnit | undefined {
  const structure = readUnitStructure(documents);
  const unit = structure.units.find(candidate => candidate.root.path === activePath || candidate.parts.some(part => part.path === activePath));
  if (!unit || !unit.parts.length) return undefined;
  const paths = new Set([unit.root.path, ...unit.parts.map(part => part.path)]);
  if (structure.findings.some(finding => finding.severity === 'error' && finding.files.some(path => paths.has(path)))) return undefined;
  return unit;
}

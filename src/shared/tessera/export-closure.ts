/** Checks that a public ontology interface contains all concepts it depends on. */
import { isObject } from '../edit/source-text';
import { OSSIE_BUILTINS } from '../mappings/ossie-builtins';
import { EXPORTS_PROPERTY } from './additions/exports';
import { canonicalJson, compareText } from './canonical-json';
import { conceptReferences } from './concept-references';
import { sha256Hex } from './digest';
import type { CombinedUnit } from './unit-model';
import type { UnitFinding } from './unit-structure';

/** Gives only the exported definitions, their canonical digest and closure findings. */
export type ExportClosure = {
  concepts: ReadonlyMap<string, Record<string, unknown>>;
  interfaceHash: string;
  findings: UnitFinding[];
};

/** Selects an explicitly closed interface from local and resolved imported concepts. */
export function exportClosure(unit: CombinedUnit, rootPath: string, imported: ReadonlyMap<string, Record<string, unknown>> = new Map()): ExportClosure {
  const local = new Map<string, Record<string, unknown>>();
  for (const concept of unit.ontology.ontology) {
    if (isObject(concept) && typeof concept.concept === 'string') local.set(concept.concept, concept);
  }
  const exports = unit.ontology[EXPORTS_PROPERTY];
  const names = Array.isArray(exports) ? exports.filter((name): name is string => typeof name === 'string') : [];
  const concepts = new Map<string, Record<string, unknown>>();
  const findings: UnitFinding[] = [];
  function report(code: string, message: string) {
    findings.push({ code, files: [rootPath], path: `/${EXPORTS_PROPERTY}`, message: `${rootPath}: ${message}`, severity: 'error' });
  }
  for (const name of new Set(names.sort(compareText))) {
    const concept = local.get(name) ?? imported.get(name);
    if (concept) concepts.set(name, concept);
    else report('tessera-export-unknown', `No concept named "${name}" is available to export.`);
  }
  for (const [name, concept] of concepts) {
    // Imported concepts already passed their provider's closure check in the provider namespace.
    if (!local.has(name)) continue;
    const references = conceptReferences(concept, candidate => local.has(candidate) || imported.has(candidate));
    for (const dependency of new Set(references.map(reference => reference.name))) {
      if (!concepts.has(dependency) && !OSSIE_BUILTINS.has(dependency)) report('tessera-export-open', `Export "${name}" requires exported concept "${dependency}".`);
    }
  }
  const interfaceHash = `sha256:${sha256Hex(canonicalJson({ version: unit.ontology.version, prefixes: unit.ontology.prefixes, concepts: [...concepts] }))}`;
  return { concepts, interfaceHash, findings };
}

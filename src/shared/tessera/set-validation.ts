/** Keeps complete-unit findings separate from the findings a partial reader can see. */
import { isObject } from '../edit/source-text';
import type { Issue } from '../validation/diagnostics';
import { INCLUDES_PROPERTY } from './additions/includes';
import { exportClosure } from './export-closure';
import { checkImports, type ProviderInterface } from './imports';
import { combineUnit } from './unit-model';
import type { OntologyUnit, UnitFinding } from './unit-structure';

/** Holds validation results and the requirements whose absence prevents disclosure. */
export type UnitValidation = {
  requiredFiles: readonly string[];
  providerInterfacesReadable: boolean;
  singleFile: ReadonlyMap<string, readonly Issue[]>;
  set: readonly UnitFinding[];
};

/** Returns a reader's visible single-file findings and, when available, the complete set findings. */
export type ReaderValidation = { singleFile: Record<string, readonly Issue[]>; set: readonly UnitFinding[]; setNotChecked: boolean };

/** Lists the root and declared local files, including declarations that could not be resolved. */
export function requiredUnitFiles(unit: OntologyUnit): string[] {
  const data = unit.root.data;
  const includes = isObject(data) ? data[INCLUDES_PROPERTY] : undefined;
  const paths = Array.isArray(includes) ? includes.filter((path): path is string => typeof path === 'string') : [];
  return [...new Set([unit.root.path, ...paths])];
}

/** Checks aliases, allowed public names and export closure using the resolved interfaces. */
export function setFindings(unit: OntologyUnit, providers: readonly ProviderInterface[], imported: ReadonlyMap<string, Record<string, unknown>> = new Map()): UnitFinding[] {
  const imports = checkImports(unit, providers);
  const exports = exportClosure(combineUnit(unit), unit.root.path, imported);
  return [...imports.findings, ...exports.findings];
}

/** Projects validation into the caller's access without describing inaccessible inputs. */
export function readerView(findings: UnitValidation, visibleFiles: ReadonlySet<string>): ReaderValidation {
  const visibleFindings: [string, readonly Issue[]][] = [];
  for (const path of visibleFiles) {
    const issues = findings.singleFile.get(path);
    if (issues) visibleFindings.push([path, issues]);
  }
  const singleFile = Object.fromEntries(visibleFindings);
  // Evaluate every requirement so the first inaccessible file does not change the traversal length.
  let setNotChecked = !findings.providerInterfacesReadable;
  for (const file of findings.requiredFiles) {
    if (!visibleFiles.has(file)) setNotChecked = true;
  }
  return { singleFile, set: setNotChecked ? [] : findings.set, setNotChecked };
}

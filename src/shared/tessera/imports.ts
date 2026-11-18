/** Checks declarations and use of the aliases of a Tessera ontology. */
import { isObject } from '../edit/source-text';
import { IMPORTS_PROPERTY } from './additions/imports';
import { conceptReferences } from './concept-references';
import type { OntologyUnit, UnitFinding } from './unit-structure';

/** Names an import and the concepts the consumer elected to use. */
export type UnitImport = { project: string; ontology?: string; alias: string; concepts: string[]; version: 'latest' | { pin: string } };

/** Describes the public part of a provider resolved for one consumer unit. */
export type ProviderInterface = { project: string; ontology: string; exports: ReadonlySet<string> };

/** Reads structurally valid import entries, defaulting their version choice to latest. */
export function declaredImports(data: unknown): UnitImport[] {
  if (!isObject(data) || !Array.isArray(data[IMPORTS_PROPERTY])) return [];
  const declarations: UnitImport[] = [];
  for (const value of data[IMPORTS_PROPERTY]) {
    if (!isObject(value) || typeof value.project !== 'string' || typeof value.alias !== 'string' || !Array.isArray(value.concepts)) continue;
    if (value.ontology !== undefined && typeof value.ontology !== 'string') continue;
    if (!value.concepts.every(name => typeof name === 'string')) continue;
    const version = value.version ?? 'latest';
    if (version !== 'latest' && (!isObject(version) || typeof version.pin !== 'string')) continue;
    declarations.push({ project: value.project, ontology: value.ontology, alias: value.alias, concepts: value.concepts, version });
  }
  return declarations;
}

function finding(code: string, file: string, path: string, detail: string): UnitFinding {
  return { code, files: [file], path, message: `${file}: ${detail}`, severity: 'error' };
}

/** Maps unique aliases to declarations and checks their allow-lists against public interfaces. */
export function checkImports(unit: OntologyUnit, providers: readonly ProviderInterface[] = []): { aliases: Map<string, UnitImport>; findings: UnitFinding[] } {
  const aliases = new Map<string, UnitImport>();
  const identities = new Map<string, Set<string | undefined>>();
  const findings: UnitFinding[] = [];
  const root = unit.root.path;
  for (const entry of declaredImports(unit.root.data)) {
    const provider = providers.find(candidate => candidate.project === entry.project && (entry.ontology === undefined || entry.ontology === candidate.ontology));
    const ontology = provider?.ontology ?? entry.ontology;
    const seen = identities.get(entry.project) ?? new Set<string | undefined>();
    const path = `/${IMPORTS_PROPERTY}`;
    if (aliases.has(entry.alias) || seen.has(ontology)) {
      findings.push(finding('tessera-import-alias', root, path, `Alias "${entry.alias}" or its provider is declared twice.`));
      continue;
    }
    aliases.set(entry.alias, entry);
    seen.add(ontology);
    identities.set(entry.project, seen);
    if (!entry.concepts.length || new Set(entry.concepts).size !== entry.concepts.length) {
      findings.push(finding('tessera-import-allow', root, path, `Alias "${entry.alias}" needs a nonempty list with each concept named once.`));
    } else if (provider) {
      for (const name of entry.concepts) {
        if (!provider.exports.has(name)) findings.push(finding('tessera-import-unexported', root, path, `"${entry.alias}.${name}" is not exported by the provider.`));
      }
    }
  }
  findings.push(...checkUses(unit, aliases));
  return { aliases, findings };
}

function checkUses(unit: OntologyUnit, aliases: ReadonlyMap<string, UnitImport>): UnitFinding[] {
  const concepts = new Set<string>();
  const findings: UnitFinding[] = [];
  const files = [unit.root, ...unit.parts];
  for (const file of files) {
    if (!isObject(file.data) || !Array.isArray(file.data.ontology)) continue;
    for (const definition of file.data.ontology) {
      if (isObject(definition) && typeof definition.concept === 'string') concepts.add(definition.concept);
    }
  }
  for (const file of files) {
    if (!isObject(file.data) || !Array.isArray(file.data.ontology)) continue;
    file.data.ontology.forEach((definition, index) => {
      if (!isObject(definition)) return;
      const references = conceptReferences(definition, name => {
        const dot = name.indexOf('.');
        return dot > 0 && aliases.has(name.slice(0, dot));
      });
      for (const { name, path } of references) {
        const dot = name.indexOf('.');
        if (dot < 0 || concepts.has(name)) continue;
        const declaration = aliases.get(name.slice(0, dot));
        if (declaration?.concepts.includes(name.slice(dot + 1))) continue;
        findings.push(finding('tessera-import-use', file.path, `/ontology/${index}${path}`, `"${name}" is outside the unit's import allow-lists.`));
      }
    });
  }
  return findings;
}

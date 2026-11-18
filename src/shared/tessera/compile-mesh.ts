/** Merges declared files and closes the exact public imports selected by the source. */
import { Document } from 'yaml';
import { deepEqual, isObject } from '../edit/source-text';
import { OSSIE_BUILTINS } from '../mappings/ossie-builtins';
import { INCLUDES_PROPERTY } from './additions/includes';
import { IMPORTS_PROPERTY } from './additions/imports';
import { PART_PROPERTY } from './additions/part';
import { compareText } from './canonical-json';
import { additionDispositions, additionSites, compileDocument, parseSourceDocument, syntaxOf, withoutAdditions, type CompileFailure } from './compile-document';
import { conceptReferences } from './concept-references';
import type { ClassifiedFile } from './document-kind';
import { declaredImports, providerOf, type ResolvedImportInterface } from './imports';
import type { GovernanceStatusKey, LossEntry } from './loss-report';
import { qualifyReferences, qualifiedConcept, rewriteConceptReferences, type ConceptOwner } from './qualify';
import { REGISTRY } from './registry';
import { printJson, printYaml } from './serialize';
import { setFindings } from './set-validation';
import type { OntologyUnit } from './unit-structure';

type DefinitionFile = Extract<ClassifiedFile, { kind: 'tessera-ontology' | 'tessera-part' }>;
type Concept = Record<string, unknown>;
type ImportedOrigin = ConceptOwner & { provider: ResolvedImportInterface };
type CompiledMesh =
  | {
      expected: Record<string, unknown>;
      text: string;
      losses: LossEntry[];
      governanceStatuses: GovernanceStatusKey[];
      origins: ReadonlyMap<string, ImportedOrigin>;
    }
  | { failures: CompileFailure[] };

function selectedConcepts(entry: ResolvedImportInterface, names: readonly string[]) {
  const selected = new Map<string, Concept>();
  const pending = [...names];
  for (let index = 0; index < pending.length; index += 1) {
    const name = pending[index];
    if (selected.has(name) || OSSIE_BUILTINS.has(name)) continue;
    const concept = entry.concepts.get(name);
    if (!concept) throw new Error(`Public interface of "${entry.project}" lacks required concept "${name}".`);
    selected.set(name, concept);
    pending.push(...conceptReferences(concept, candidate => entry.concepts.has(candidate)).map(reference => reference.name));
  }
  return selected;
}

function importedDefinition(provider: ResolvedImportInterface, definition: Concept) {
  const data = { name: provider.ontologyName ?? provider.ontology, ontology: [definition] };
  const sites = additionSites(data);
  const document = `${provider.project}/${provider.ontology}`;
  const result = additionDispositions(document, data, sites, REGISTRY, new Set());
  if (result.failures.length) throw new Error(result.failures.map(failure => failure.message).join(' '));
  return { ...result, definition: (withoutAdditions(data, sites) as { ontology: Concept[] }).ontology[0] };
}

function importedConcepts(unit: OntologyUnit, providers: readonly ResolvedImportInterface[], localNames: ReadonlySet<string>) {
  const aliases = new Map<string, ConceptOwner>();
  const imported = new Map<string, Concept>();
  const origins = new Map<string, ImportedOrigin>();
  const losses: LossEntry[] = [];
  const governanceStatuses: GovernanceStatusKey[] = [];
  for (const entry of declaredImports(unit.root.data)) {
    const provider = providerOf(entry, providers);
    if (!provider) throw new Error(`The locked public interface for "${entry.alias}" is unavailable.`);
    if (!isObject(unit.root.data) || provider.scope !== unit.root.data.version) throw new Error(`Provider "${entry.project}" uses a different Ossie base.`);
    const owner = (concept: string) => ({ project: provider.project, ontology: provider.ontology, concept });
    for (const name of entry.concepts) aliases.set(`${entry.alias}.${name}`, owner(name));
    for (const [name, definition] of selectedConcepts(provider, entry.concepts)) {
      const qualified = qualifiedConcept(owner(name));
      if (localNames.has(qualified) || imported.has(qualified)) throw new Error(`A concept collides with imported name "${qualified}".`);
      const standard = importedDefinition(provider, definition);
      losses.push(...standard.losses);
      governanceStatuses.push(...standard.governanceStatuses);
      const rewritten = rewriteConceptReferences(standard.definition, ref => (provider.concepts.has(ref) ? qualifiedConcept(owner(ref)) : ref));
      imported.set(qualified, { ...rewritten, concept: qualified });
      origins.set(qualified, { ...owner(name), provider });
    }
  }
  return {
    origins,
    losses,
    governanceStatuses,
    rewrite: qualifyReferences(aliases, localNames),
    concepts: [...imported].sort(([first], [second]) => compareText(first, second)).map(([, definition]) => definition),
  };
}

const translated = new Set([INCLUDES_PROPERTY, IMPORTS_PROPERTY, PART_PROPERTY]);

/** Compiles root and part losses at their original locations and emits one self-contained root. */
export function compileMeshRoot(unit: OntologyUnit, files: readonly DefinitionFile[], providers: readonly ResolvedImportInterface[], compile: typeof compileDocument): CompiledMesh {
  const losses: LossEntry[] = [];
  const governanceStatuses: GovernanceStatusKey[] = [];
  const standard: Record<string, unknown>[] = [];
  for (const file of files) {
    const output = compile({ path: file.file.path, source: file.text }, REGISTRY, translated);
    if (!output.ok) return output;
    losses.push(...output.losses);
    governanceStatuses.push(...(output.governanceStatuses ?? []));
    const parsed = parseSourceDocument({ path: file.file.path, source: output.text }, syntaxOf(file.file.path));
    if ('code' in parsed) return { failures: [parsed] };
    const input = file.kind === 'tessera-part' ? file.data : file.reading.data;
    if (!deepEqual(withoutAdditions(input, additionSites(input)), parsed.data)) {
      return { failures: [{ code: 'meaning', document: file.file.path, message: 'A translated file differs from its source without additions.' }] };
    }
    standard.push(parsed.data);
  }
  try {
    const [root] = standard;
    const local = standard.flatMap(data => data.ontology as Concept[]);
    const names = new Set(local.map(concept => String(concept.concept)));
    const imported = importedConcepts(unit, providers, names);
    const publicDefinitions = new Map<string, Concept>();
    for (const entry of declaredImports(unit.root.data)) {
      const provider = providerOf(entry, providers);
      for (const name of entry.concepts) {
        const concept = provider?.concepts.get(name);
        if (concept) publicDefinitions.set(`${entry.alias}.${name}`, concept);
      }
    }
    const issues = setFindings(unit, providers, publicDefinitions).filter(issue => issue.severity === 'error');
    if (issues.length) return { failures: issues.map(issue => ({ code: 'translation', document: unit.root.path, message: issue.message })) };
    const ontology = [...local.map(concept => rewriteConceptReferences(concept, imported.rewrite)), ...imported.concepts];
    const expected = { ...root, ontology };
    const text = syntaxOf(unit.root.path) === 'json' ? printJson(expected) : printYaml(new Document(expected));
    return { text, expected, losses: [...losses, ...imported.losses], governanceStatuses: [...governanceStatuses, ...imported.governanceStatuses], origins: imported.origins };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { failures: [{ code: 'translation', document: unit.root.path, message: error.message }] };
  }
}

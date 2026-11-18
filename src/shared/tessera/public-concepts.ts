/** Canonical identities and definitions behind the public names of one provider. */
import { conceptReferences } from './concept-references';
import { qualifiedConcept, rewriteConceptReferences, type ConceptOwner } from './qualify';

/** The source of a public definition and the version it was read from. */
export type PublicConceptOrigin = ConceptOwner & {
  version: string;
  ontologyName?: string;
  sourceItems?: ReadonlyMap<string, string>;
};

/** A public definition with references in its canonical namespace. */
export type PublicConcept = { origin: PublicConceptOrigin; definition: Record<string, unknown> };

/** Associates exported names with canonical definitions, including their prerequisites. */
export type PublicConcepts = { names: ReadonlyMap<string, string>; definitions: ReadonlyMap<string, PublicConcept> };

/** Adds a provider's own definitions, preserving the origin of imported definitions. */
export function bindPublicConcepts(exported: ReadonlyMap<string, Record<string, unknown>>, local: (name: string) => PublicConceptOrigin, imported: PublicConcepts): PublicConcepts {
  const names = new Map<string, string>();
  const definitions = new Map(imported.definitions);
  for (const name of exported.keys()) names.set(name, imported.names.get(name) ?? qualifiedConcept(local(name)));
  for (const [name, definition] of exported) {
    if (imported.names.has(name)) continue;
    const origin = local(name);
    const rewritten = rewriteConceptReferences(definition, reference => names.get(reference) ?? reference);
    definitions.set(qualifiedConcept(origin), { origin, definition: rewritten });
  }
  return { names, definitions };
}

/** Selects each canonical concept exactly once, following the frozen public references. */
export function selectPublicConcepts(publicConcepts: PublicConcepts, names: readonly string[]): Map<string, PublicConcept> {
  const selected = new Map<string, PublicConcept>();
  const pending = names.map(name => publicConcepts.names.get(name) ?? name);
  for (const key of pending) {
    if (selected.has(key)) continue;
    const concept = publicConcepts.definitions.get(key);
    if (!concept) throw new Error(`Public interface lacks required concept "${key}".`);
    selected.set(key, concept);
    for (const { name } of conceptReferences(concept.definition, name => publicConcepts.definitions.has(name))) {
      if (publicConcepts.definitions.has(name)) pending.push(name);
    }
  }
  return selected;
}

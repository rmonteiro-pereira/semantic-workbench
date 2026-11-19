/** Qualifies imported concept names in the compiled ontology. */
import { isObject } from '../edit/source-text';
import { rewriteExpressionRefs } from '../metrics/deps';

/** Identifies a concept by its provider's stable project and ontology. */
export type ConceptOwner = { project: string; ontology: string; concept: string };

/** Spells a canonical owner-qualified concept without literal dots or ambiguous separators. */
export function qualifiedConcept(owner: ConceptOwner): string {
  return [owner.project, owner.ontology, owner.concept].map(part => part.replaceAll('%', '%25').replaceAll('.', '%2E').replaceAll('~', '%7E')).join('~');
}

function rewriteExpressions(record: Record<string, unknown>, rewrite: (name: string) => string, quote?: (name: string) => string) {
  for (const field of ['requires', 'derived_by']) {
    const expressions = record[field];
    if (Array.isArray(expressions)) record[field] = expressions.map(value => (typeof value === 'string' ? rewriteExpressionRefs(value, rewrite, quote) : value));
  }
}

/** Rewrites a concept's parent, identifier, role and expression references without changing its declaration. */
export function rewriteConceptReferences(definition: Record<string, unknown>, rewrite: (name: string) => string, quote?: (name: string) => string): Record<string, unknown> {
  const result = { ...definition };
  if (Array.isArray(result.extends)) result.extends = result.extends.map(value => (typeof value === 'string' ? rewrite(value) : value));
  if (Array.isArray(result.identify_by)) {
    result.identify_by = result.identify_by.map(value => {
      if (typeof value !== 'string') return value;
      const dot = value.lastIndexOf('.');
      if (dot < 0) return value;
      return rewrite(value.slice(0, dot)) + value.slice(dot);
    });
  }
  rewriteExpressions(result, rewrite, quote);
  if (!Array.isArray(result.relationships)) return result;
  result.relationships = result.relationships.map(relationship => {
    if (!isObject(relationship)) return relationship;
    const copy = { ...relationship };
    rewriteExpressions(copy, rewrite, quote);
    if (Array.isArray(copy.roles)) {
      copy.roles = copy.roles.map(role => (isObject(role) && typeof role.concept === 'string' ? { ...role, concept: rewrite(role.concept) } : role));
    }
    return copy;
  });
  return result;
}

/** Creates a rewrite for one unit and refuses a collision with an existing local concept. */
export function qualifyReferences(owners: ReadonlyMap<string, ConceptOwner>, localNames: ReadonlySet<string>): (name: string) => string {
  const qualified = new Map<string, string>();
  for (const [reference, owner] of owners) {
    const name = qualifiedConcept(owner);
    if (localNames.has(name)) throw new Error(`Imported concept "${reference}" collides with local concept "${name}".`);
    qualified.set(reference, name);
  }
  return name => qualified.get(name) ?? name;
}

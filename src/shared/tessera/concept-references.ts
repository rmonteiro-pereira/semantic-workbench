/** Reads concept references from Ossie ontology components. */
import { isObject } from '../edit/source-text';
import { expressionRefs } from '../metrics/deps';

/** Locates a reference within a concept definition. */
export type ConceptReference = { name: string; path: string };

/** Reads structured references plus concept qualifiers in identifier and expression fields. */
export function conceptReferences(definition: Record<string, unknown>, isConcept: (name: string) => boolean): ConceptReference[] {
  const references: ConceptReference[] = [];
  function readList(value: unknown, path: string, names: (text: string) => string[]) {
    if (!Array.isArray(value)) return;
    value.forEach((entry, index) => {
      if (typeof entry !== 'string') return;
      for (const name of names(entry)) references.push({ name, path: `${path}/${index}` });
    });
  }
  function readExpressions(value: Record<string, unknown>, path: string) {
    for (const field of ['requires', 'derived_by']) {
      readList(value[field], `${path}/${field}`, expression =>
        expressionRefs(expression).flatMap(ref => {
          if (ref.table && isConcept(ref.table)) return [ref.table];
          const name = ref.table ? `${ref.table}.${ref.column}` : ref.column;
          return isConcept(name) ? [name] : [];
        }),
      );
    }
  }
  readList(definition.extends, '/extends', name => [name]);
  readList(definition.identify_by, '/identify_by', identifier => {
    const dot = identifier.lastIndexOf('.');
    return dot < 0 ? [] : [identifier.slice(0, dot)];
  });
  readExpressions(definition, '');
  if (!Array.isArray(definition.relationships)) return references;
  definition.relationships.forEach((relationship, index) => {
    if (!isObject(relationship)) return;
    const path = `/relationships/${index}`;
    readExpressions(relationship, path);
    if (!Array.isArray(relationship.roles)) return;
    relationship.roles.forEach((role, roleIndex) => {
      if (isObject(role) && typeof role.concept === 'string') references.push({ name: role.concept, path: `${path}/roles/${roleIndex}/concept` });
    });
  });
  return references;
}

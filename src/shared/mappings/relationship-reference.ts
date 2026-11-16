/** Resolves relationship names through declared concept inheritance. */

/** Retains the defining concept alongside a matching relationship. */
export type RelationshipMatch = { owner: string; definition: any };

/** Finds every inherited match, respecting local overrides and refusing to choose an ambiguous parent. */
export function relationshipMatches(concepts: Map<string, any>, concept: string, name: string): { concept: string; name: string; matches: RelationshipMatch[] } {
  const qualified = name.split('.');
  if (qualified.length === 2) [concept, name] = qualified;
  const queue = [concept];
  const seen = new Set<string>();
  const matches: RelationshipMatch[] = [];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (seen.has(current)) continue;
    seen.add(current);
    const definition = concepts.get(current);
    if (!definition) continue;
    const own = (definition.relationships ?? []).filter((relationship: any) => relationship.name === name);
    if (own.length) matches.push(...own.map((relationship: any) => ({ owner: current, definition: relationship })));
    else queue.push(...(definition.extends ?? []));
  }
  return { concept, name, matches };
}

/** Suggests model groups from relationships between business entities. */
import type { Entity, Relationship } from './model';
// The main definitions of each document kind: ontology concepts and classes, contract objects,
// semantic datasets and metrics, and concept mappings. Value types and primitives stay out, so
// they cannot turn into hubs that pull every community together.
const BUSINESS_KINDS = new Set([
  'EntityType',
  'OWL class',
  'Object',
  'Dataset',
  'Metric',
  'Concept mapping',
]);

/** Checks whether an entity belongs in the business graph used for grouping. */
export const isBusinessEntity = (entity: Entity) => BUSINESS_KINDS.has(entity.kind);
/** Checks whether a relationship expresses inheritance. */
export const isInheritance = (edge: Relationship) =>
  /inheritance|subclass/i.test(edge.data.kind) ||
  /^(extends|subClassOf|rdfs:subClassOf)$/i.test(edge.label);
/** Suggests deterministic communities from an undirected business graph. Direction, duplicate
 * edges, inheritance and primitive hubs do not affect weights. These groups are suggestions, not
 * domain classifications. */
export function suggestCommunities(entities: Entity[], edges: Relationship[]) {
  const business = entities.filter(isBusinessEntity).sort((a, b) => a.id.localeCompare(b.id));
  const adjacent = new Map(business.map(e => [e.id, new Set<string>()]));
  for (const edge of edges)
    if (
      !isInheritance(edge) &&
      edge.source !== edge.target &&
      adjacent.has(edge.source) &&
      adjacent.has(edge.target)
    ) {
      adjacent.get(edge.source)!.add(edge.target);
      adjacent.get(edge.target)!.add(edge.source);
    }
  const membership = new Map(business.map(e => [e.id, e.id]));
  const degree = new Map([...adjacent].map(([id, next]) => [id, next.size]));
  const totals = new Map(degree);
  const twiceEdges = [...degree.values()].reduce((a, b) => a + b, 0);
  let passes = 0;
  if (twiceEdges)
    for (; passes < 20; passes++) {
      let changed = false;
      for (const entity of business) {
        const id = entity.id;
        const old = membership.get(id)!;
        const k = degree.get(id)!;
        if (!k) continue;
        const weights = new Map<string, number>();
        for (const neighbor of [...adjacent.get(id)!].sort()) {
          const group = membership.get(neighbor)!;
          weights.set(group, (weights.get(group) ?? 0) + 1);
        }
        totals.set(old, totals.get(old)! - k);
        const score = (group: string) =>
          (weights.get(group) ?? 0) - (k * (totals.get(group) ?? 0)) / twiceEdges;
        let best = old;
        let bestScore = score(old);
        for (const candidate of [...weights.keys()].sort()) {
          const value = score(candidate);
          if (value > bestScore + 1e-10) {
            best = candidate;
            bestScore = value;
          }
        }
        membership.set(id, best);
        totals.set(best, (totals.get(best) ?? 0) + k);
        if (best !== old) changed = true;
      }
      if (!changed) break;
    }
  const clusters = new Map<string, string[]>();
  for (const [id, group] of membership) {
    const ids = clusters.get(group) ?? [];
    ids.push(id);
    clusters.set(group, ids);
  }
  const anchors = new Map<string, string>();
  for (const ids of clusters.values()) {
    const anchor = ids
      .slice()
      .sort((a, b) => degree.get(b)! - degree.get(a)! || a.localeCompare(b))[0];
    for (const id of ids) anchors.set(id, anchor);
  }
  return { membership: anchors, degree, passes, backboneEdges: twiceEdges / 2 };
}

// Concepts named anywhere inside a mapping (link targets, nested object mappings), except the
// mapping's own concept.
function mappedConcepts(value: unknown, found: Set<string>, root = true) {
  if (Array.isArray(value)) {
    for (const item of value) mappedConcepts(item, found, false);
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'concept' && !root && typeof item === 'string') found.add(item);
    else mappedConcepts(item, found, false);
  }
  return found;
}

/** Links concept mappings whose mapped links point at another mapped concept. A mapping
 * document has no relationships of its own, so these links are its community backbone. */
export function conceptMappingLinks(entities: Entity[]): Relationship[] {
  const mappings = entities.filter(e => e.kind === 'Concept mapping');
  const byConcept = new Map(mappings.map(e => [e.name, e.id]));
  const links: Relationship[] = [];
  for (const mapping of mappings)
    for (const concept of mappedConcepts(mapping.definition, new Set())) {
      const target = byConcept.get(concept);
      if (!target || target === mapping.id) continue;
      links.push({
        id: `concept-link:${mapping.id}>${target}`,
        source: mapping.id,
        target,
        label: concept,
        data: { path: mapping.path, definition: {}, kind: 'Concept relationship' },
      });
    }
  return links;
}

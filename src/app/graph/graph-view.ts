/** Builds searchable, paged neighborhoods from a model's visible entities and relationships. */
import type { Entity, Relationship } from '../../shared/core/model';
// Technical RDF resources are hidden unless requested for the model. Neighbors are paged in
// relationship-kind and name order; hidden ones remain counted. Relationships among visible
// neighbors remain unless the user hides them.
/** Controls neighborhood paging, relationship filters and resource visibility. */
export type NeighborhoodOptions = {
  center?: string;
  limit?: number;
  lateral?: boolean;
  technical?: boolean;
  relationship?: string;
  keep?: string[];
};
/** Contains the visible center, neighbors, relationships and hidden counts. */
export type Neighborhood = {
  center: string | undefined;
  entities: Entity[];
  edges: Relationship[];
  incoming: string[];
  outgoing: string[];
  both: string[];
  total: number;
  shown: number;
  hidden: number;
  lateral: number;
  relationships: { label: string; count: number }[];
  technicalHidden: number;
};
export const NEIGHBOR_PAGE = 12;
const byName = (a: Entity, b: Entity) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
// Entities and edges of the default projection; `technical` includes everything.
/** Filters technical resources unless the caller explicitly includes them. */
export function projectModel(entities: Entity[], edges: Relationship[], technical = false) {
  if (technical || !entities.some(e => e.kind === 'OWL class')) return { entities, edges, technicalHidden: 0 };
  const classes = entities.filter(e => e.kind === 'OWL class');
  const ids = new Set(classes.map(e => e.id));
  return {
    entities: classes,
    edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)),
    technicalHidden: entities.length - classes.length,
  };
}
// Search ranking: exact name, name prefix, word prefix, name substring, then IRI/id substring.
/** Ranks entity matches by exact name, prefixes, substrings and identifiers. */
export function searchEntities(entities: Entity[], query: string, limit = 50): Entity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const score = (entity: Entity) => {
    const name = entity.name.toLowerCase();
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (
      entity.name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .some(w => w.startsWith(needle))
    )
      return 2;
    if (name.includes(needle)) return 3;
    if (entity.id.toLowerCase().includes(needle)) return 4;
    return 9;
  };
  return entities
    .map(e => ({ e, s: score(e) }))
    .filter(x => x.s < 9)
    .sort((a, b) => a.s - b.s || a.e.name.length - b.e.name.length || byName(a.e, b.e))
    .slice(0, limit)
    .map(x => x.e);
}
// Start at the most connected entity, breaking ties by name. Prefer business entities over
// value-type and built-in attribute hubs when possible.
const VALUE_KINDS = new Set(['ValueType', 'Built-in concept']);
/** Chooses the most connected business entity, breaking ties by name. */
export function defaultCenter(entities: Entity[], edges: Relationship[]) {
  const candidates = entities.some(e => !VALUE_KINDS.has(e.kind)) ? entities.filter(e => !VALUE_KINDS.has(e.kind)) : entities;
  const ids = new Set(candidates.map(e => e.id));
  const degree = new Map<string, number>();
  for (const edge of edges)
    if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
  return [...candidates].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byName(a, b))[0]?.id;
}
/** Builds a paged neighborhood with directional relationships and hidden counts. */
export function neighborhood(allEntities: Entity[], allEdges: Relationship[], options: NeighborhoodOptions = {}): Neighborhood {
  const { entities, edges, technicalHidden } = projectModel(allEntities, allEdges, options.technical);
  const byId = new Map(entities.map(e => [e.id, e]));
  const center = options.center && byId.has(options.center) ? options.center : defaultCenter(entities, edges);
  const empty = {
    center,
    entities: center ? [byId.get(center)!] : [],
    edges: [],
    incoming: [],
    outgoing: [],
    both: [],
    total: 0,
    shown: 0,
    hidden: 0,
    lateral: 0,
    relationships: [],
    technicalHidden,
  };
  if (!center) return empty;
  // Every neighbor with its direction(s) and the kinds and labels of the relationships that reach
  // it.
  const touching = edges.filter(e => e.source === center || e.target === center);
  const relationships = new Map<string, number>();
  for (const relationship of touching) relationships.set(relationship.label, (relationships.get(relationship.label) ?? 0) + 1);
  const filtered = options.relationship ? touching.filter(e => e.label === options.relationship) : touching;
  const info = new Map<string, { incoming: boolean; outgoing: boolean; kind: string }>();
  for (const relationship of filtered) {
    const other = relationship.source === center ? relationship.target : relationship.source;
    if (other === center) continue;
    const i = info.get(other) ?? { incoming: false, outgoing: false, kind: relationship.data.kind };
    if (relationship.source === center) i.outgoing = true;
    if (relationship.target === center) i.incoming = true;
    if (relationship.data.kind < i.kind) i.kind = relationship.data.kind;
    info.set(other, i);
  }
  const ranked = [...info.keys()].filter(id => byId.has(id)).sort((a, b) => info.get(a)!.kind.localeCompare(info.get(b)!.kind) || byName(byId.get(a)!, byId.get(b)!));
  const limit = Math.max(1, options.limit ?? NEIGHBOR_PAGE);
  const keep = new Set((options.keep ?? []).filter(id => info.has(id)));
  const shownIds = [...new Set([...ranked.filter(id => keep.has(id)), ...ranked.slice(0, limit)])].sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
  const included = new Set([center, ...shownIds]);
  const visibleEdges = edges.filter(
    edge =>
      included.has(edge.source) &&
      included.has(edge.target) &&
      (edge.source === center || edge.target === center ? !options.relationship || edge.label === options.relationship || edge.source === edge.target : options.lateral !== false),
  );
  const dir = (id: string) => info.get(id)!;
  const lateral = edges.filter(edge => edge.source !== center && edge.target !== center && included.has(edge.source) && included.has(edge.target)).length;
  return {
    center,
    entities: [byId.get(center)!, ...shownIds.map(id => byId.get(id)!)],
    edges: visibleEdges,
    incoming: shownIds.filter(id => dir(id).incoming && !dir(id).outgoing),
    outgoing: shownIds.filter(id => dir(id).outgoing && !dir(id).incoming),
    both: shownIds.filter(id => dir(id).incoming && dir(id).outgoing),
    total: ranked.length,
    shown: shownIds.length,
    hidden: ranked.length - shownIds.length,
    lateral,
    relationships: [...relationships.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    technicalHidden,
  };
}
// Compatibility wrapper used by tests and imports: a bounded neighborhood, a search result as
// center, or every projected entity with `all`.
/** Returns a bounded neighborhood or the full projected graph when requested. */
export function graphView(entities: Entity[], edges: Relationship[], query: string, all = false, limit = 8, focusId = '') {
  if (all && !query) {
    const model = projectModel(entities, edges, true);
    return {
      entities: model.entities,
      edges: model.edges,
      focus: focusId || model.entities[0]?.id,
    };
  }
  const projected = projectModel(entities, edges);
  const center = query ? searchEntities(projected.entities, query, 1)[0]?.id : focusId || undefined;
  if (query && !center) return { entities: [], edges: [], focus: undefined };
  const view = neighborhood(entities, edges, { center, limit: Math.max(1, limit - 1) });
  return { entities: view.entities, edges: view.edges, focus: view.center };
}
/** Groups relationships by their endpoints. */
export function groupRelationships(edges: Relationship[]) {
  const groups = new Map<string, Relationship[]>();
  for (const edge of edges) {
    const key = JSON.stringify([edge.source, edge.target]);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  return [...groups.values()].map(relationships => ({
    ...relationships[0],
    data: { ...relationships[0].data, relationships },
  }));
}

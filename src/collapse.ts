import type { Entity, Relationship } from './model';
import type { modelOverview } from './overview';
export function collapseAreas(overview: ReturnType<typeof modelOverview>, collapsed: Set<string>) {
  if (!collapsed.size)
    return {
      entities: overview.entities,
      edges: overview.links,
      internal: new Map<string, Relationship[]>(),
    };
  const entities: Entity[] = [];
  const internal = new Map<string, Relationship[]>();
  for (const group of overview.groups) {
    if (collapsed.has(group.id)) {
      entities.push({
        id: 'collapsed:' + group.id,
        name: `${group.entities.length} entities`,
        kind: group.id,
        path: [],
        fields: [],
        description: group.description,
        definition: { collapsedArea: group.id, memberIds: group.entities.map(e => e.id) },
      });
      internal.set(group.id, []);
    } else entities.push(...group.entities);
  }
  const edges: Relationship[] = [];
  for (const edge of overview.links) {
    const a = overview.groupOf.get(edge.source)!;
    const b = overview.groupOf.get(edge.target)!;
    if (a === b && collapsed.has(a)) {
      internal.get(a)!.push(edge);
      continue;
    }
    edges.push({
      ...edge,
      source: collapsed.has(a) ? 'collapsed:' + a : edge.source,
      target: collapsed.has(b) ? 'collapsed:' + b : edge.target,
    });
  }
  return { entities, edges, internal };
}

/** Projects collapsed model areas into group nodes and their connecting edges. */
import type { Entity, Relationship } from '../../shared/core/model';
import type { modelOverview } from './overview';
/** Replaces collapsed areas with group nodes and their aggregate relationships. */
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
    const sourceGroup = overview.groupOf.get(edge.source)!;
    const targetGroup = overview.groupOf.get(edge.target)!;
    if (sourceGroup === targetGroup && collapsed.has(sourceGroup)) {
      internal.get(sourceGroup)!.push(edge);
      continue;
    }
    edges.push({
      ...edge,
      source: collapsed.has(sourceGroup) ? 'collapsed:' + sourceGroup : edge.source,
      target: collapsed.has(targetGroup) ? 'collapsed:' + targetGroup : edge.target,
    });
  }
  return { entities, edges, internal };
}

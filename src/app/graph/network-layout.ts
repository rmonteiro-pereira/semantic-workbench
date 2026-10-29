/** Requests network layouts from a worker so graph computation does not block the interface. */
import type { GroupingOptions } from './overview';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { modelOverview } from './overview';
import { groupRelationships } from './graph-view';
import type { Entity, Relationship } from '../../shared/core/model';
import { modelCardHeight } from './overview-capacity';
cytoscape.use(fcose);
/** Requests a worker-computed layout for a model network. */
export function layoutNetwork(entities: Entity[], edges: Relationship[], name: string, options: Record<string, unknown> = {}, grouping?: GroupingOptions) {
  const overview = modelOverview(entities, edges, name, false, grouping);
  const connections = groupRelationships(overview.links);
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      ...overview.groups.map(g => ({ data: { id: 'area:' + g.id } })),
      ...overview.entities.map(entity => ({
        data: {
          id: entity.id,
          parent: 'area:' + overview.groupOf.get(entity.id),
          cardHeight: modelCardHeight(Boolean(entity.definition?.collapsedArea)),
        },
      })),
      ...connections.map(e => ({
        data: { id: 'edge:' + e.id, source: e.source, target: e.target },
      })),
    ],
    style: [
      {
        selector: 'node[cardHeight]',
        style: { width: 184, height: 'data(cardHeight)', 'border-width': 0, padding: '0px' },
      },
      {
        selector: ':parent',
        style: { padding: '38px', 'compound-sizing-wrt-labels': 'exclude', 'border-width': 0 },
      },
    ],
  });
  cy.layout({
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    animate: false,
    fit: false,
    nodeRepulsion: () => 4500,
    idealEdgeLength: () => 65,
    edgeElasticity: () => 0.25,
    numIter: entities.length > 200 ? 1000 : 2500,
    gravity: 0.15,
    gravityCompound: 1.5,
    nodeSeparation: 30,
    packComponents: true,
    ...options,
  } as any).run();
  const groupBounds = new Map(overview.groups.map(group => [group.id, cy.getElementById('area:' + group.id).boundingBox({ includeLabels: false, includeOverlays: false })]));
  const minX = Math.min(0, ...[...groupBounds.values()].map(b => b.x1)) - 40;
  const minY = Math.min(0, ...[...groupBounds.values()].map(b => b.y1)) - 40;
  const nodes = [
    ...overview.groups.map(group => {
      const bounds = groupBounds.get(group.id)!;
      return {
        id: 'area:' + group.id,
        x: bounds.x1 - minX,
        y: bounds.y1 - minY,
        width: bounds.w,
        height: bounds.h,
        group: group.id,
        parentId: undefined as string | undefined,
      };
    }),
    ...overview.entities.map(entity => {
      const groupId = overview.groupOf.get(entity.id)!;
      const parent = groupBounds.get(groupId)!;
      const boundingBox = cy.getElementById(entity.id).boundingBox({ includeLabels: false, includeOverlays: false });
      return {
        id: entity.id,
        x: boundingBox.x1 - parent.x1,
        y: boundingBox.y1 - parent.y1,
        width: 184,
        height: modelCardHeight(Boolean(entity.definition?.collapsedArea)),
        group: undefined as string | undefined,
        parentId: 'area:' + groupId,
      };
    }),
  ];
  const width = Math.max(...[...groupBounds.values()].map(b => b.x2)) - minX + 40;
  const height = Math.max(...[...groupBounds.values()].map(b => b.y2)) - minY + 40;
  cy.destroy();
  return {
    nodes,
    width,
    height,
    entityCount: overview.entities.length,
    relationshipCount: overview.links.length,
    routes: {} as Record<string, { x: number; y: number }[][]>,
  };
}

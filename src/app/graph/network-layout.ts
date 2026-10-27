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
export function layoutNetwork(
  entities: Entity[],
  edges: Relationship[],
  name: string,
  options: Record<string, unknown> = {},
  grouping?: GroupingOptions,
) {
  const o = modelOverview(entities, edges, name, false, grouping);
  const connections = groupRelationships(o.links);
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      ...o.groups.map(g => ({ data: { id: 'area:' + g.id } })),
      ...o.entities.map(e => ({
        data: {
          id: e.id,
          parent: 'area:' + o.groupOf.get(e.id),
          cardHeight: modelCardHeight(Boolean(e.definition?.collapsedArea)),
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
  const groupBounds = new Map(
    o.groups.map(g => [
      g.id,
      cy
        .getElementById('area:' + g.id)
        .boundingBox({ includeLabels: false, includeOverlays: false }),
    ]),
  );
  const minX = Math.min(0, ...[...groupBounds.values()].map(b => b.x1)) - 40;
  const minY = Math.min(0, ...[...groupBounds.values()].map(b => b.y1)) - 40;
  const nodes = [
    ...o.groups.map(g => {
      const b = groupBounds.get(g.id)!;
      return {
        id: 'area:' + g.id,
        x: b.x1 - minX,
        y: b.y1 - minY,
        width: b.w,
        height: b.h,
        group: g.id,
        parentId: undefined as string | undefined,
      };
    }),
    ...o.entities.map(e => {
      const g = o.groupOf.get(e.id)!;
      const parent = groupBounds.get(g)!;
      const b = cy
        .getElementById(e.id)
        .boundingBox({ includeLabels: false, includeOverlays: false });
      return {
        id: e.id,
        x: b.x1 - parent.x1,
        y: b.y1 - parent.y1,
        width: 184,
        height: modelCardHeight(Boolean(e.definition?.collapsedArea)),
        group: undefined as string | undefined,
        parentId: 'area:' + g,
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
    entityCount: o.entities.length,
    relationshipCount: o.links.length,
    routes: {} as Record<string, { x: number; y: number }[][]>,
  };
}

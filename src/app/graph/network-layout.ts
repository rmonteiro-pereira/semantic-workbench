/** Computes the compound fCoSE layout used by the network canvas. */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Entity, Relationship } from '../../shared/core/model';
import type { FullLayoutResult } from './full-layout';
import { groupRelationships } from './graph-view';
import { MODEL_CARD_WIDTH, modelCardHeight } from './overview-capacity';
import { modelOverview, type GroupingOptions } from './overview';

cytoscape.use(fcose);

/** The model and grouping sent to the layout worker. */
export type NetworkLayoutRequest = {
  entities: Entity[];
  edges: Relationship[];
  name: string;
  grouping?: GroupingOptions;
};

/** A completed worker layout or an explicit computation failure. */
export type NetworkLayoutResponse = { result: FullLayoutResult } | { error: string };

/** Arranges entities by their relationships within compound area nodes. */
export function layoutNetwork(entities: Entity[], edges: Relationship[], name: string, grouping?: GroupingOptions): FullLayoutResult {
  const overview = modelOverview(entities, edges, name, false, grouping);
  const connections = groupRelationships(overview.links);
  if (!overview.entities.length) return { nodes: [], routes: {}, width: 0, height: 0, entityCount: 0, relationshipCount: 0 };
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      ...overview.groups.map(group => ({ data: { id: 'area:' + group.id } })),
      ...overview.entities.map(entity => ({
        data: { id: entity.id, parent: 'area:' + overview.groupOf.get(entity.id), collapsed: Boolean(entity.definition?.collapsedArea) },
      })),
      ...connections.map(connection => ({
        data: { id: 'edge:' + connection.id, source: connection.source, target: connection.target },
      })),
    ],
    style: [
      { selector: 'node', style: { width: MODEL_CARD_WIDTH, height: modelCardHeight(false), 'border-width': 0, padding: '0px' } },
      { selector: ':parent', style: { padding: '38px', 'compound-sizing-wrt-labels': 'exclude', 'border-width': 0 } },
      { selector: 'node[?collapsed]', style: { height: modelCardHeight(true) } },
    ],
  });
  try {
    const options = {
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
    };
    cy.layout(options).run();
    const groupBounds = new Map(overview.groups.map(group => [group.id, cy.getElementById('area:' + group.id).boundingBox({ includeLabels: false, includeOverlays: false })]));
    const minX = Math.min(0, ...[...groupBounds.values()].map(bounds => bounds.x1)) - 40;
    const minY = Math.min(0, ...[...groupBounds.values()].map(bounds => bounds.y1)) - 40;
    const nodes: FullLayoutResult['nodes'] = [
      ...overview.groups.map(group => {
        const bounds = groupBounds.get(group.id)!;
        return { id: 'area:' + group.id, x: bounds.x1 - minX, y: bounds.y1 - minY, width: bounds.w, height: bounds.h, group: group.id };
      }),
      ...overview.entities.map(entity => {
        const group = overview.groupOf.get(entity.id)!;
        const parent = groupBounds.get(group)!;
        const bounds = cy.getElementById(entity.id).boundingBox({ includeLabels: false, includeOverlays: false });
        return {
          id: entity.id,
          x: bounds.x1 - parent.x1,
          y: bounds.y1 - parent.y1,
          width: MODEL_CARD_WIDTH,
          height: modelCardHeight(Boolean(entity.definition?.collapsedArea)),
          parentId: 'area:' + group,
        };
      }),
    ];
    return {
      nodes,
      width: Math.max(...[...groupBounds.values()].map(bounds => bounds.x2)) - minX + 40,
      height: Math.max(...[...groupBounds.values()].map(bounds => bounds.y2)) - minY + 40,
      entityCount: overview.entities.length,
      relationshipCount: overview.links.length,
      routes: {},
    };
  } finally {
    cy.destroy();
  }
}

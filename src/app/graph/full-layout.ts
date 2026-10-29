/** Arranges grouped graphs and packs group rectangles without stretching their nodes. */
import type { GroupingOptions } from './overview';
import { modelOverview } from './overview';
import { groupRelationships } from './graph-view';
import type { Entity, Relationship } from '../../shared/core/model';
import { GROUP_HEADER_HEIGHT, modelCardHeight } from './overview-capacity';

/** The model name, the ELK engine that runs the layout, and the optional grouping of areas. */
export type FullLayoutOptions = { name: string; elk: { layout: (elkGraph: any) => Promise<any> }; grouping?: GroupingOptions };

/** Lays out nodes and edges within their model groups. */
export async function layoutFullGraph(entities: Entity[], edges: Relationship[], options: FullLayoutOptions) {
  const { name, elk, grouping } = options;
  const overview = modelOverview(entities, edges, name, false, grouping);
  const connections = groupRelationships(overview.links);
  const allAreasCollapsed = entities.length > 0 && entities.every(entity => entity.definition?.collapsedArea);
  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': allAreasCollapsed ? 'box' : 'layered',
      'elk.aspectRatio': '1.5',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.mergeEdges': 'true',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: overview.groups.map(group => ({
      id: 'area:' + group.id,
      layoutOptions: {
        'elk.padding': `[top=${GROUP_HEADER_HEIGHT},left=24,bottom=24,right=24]`,
        'elk.spacing.nodeNode': '24',
        'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      },
      children: group.entities.map(entity => ({
        id: entity.id,
        width: 184,
        height: modelCardHeight(Boolean(entity.definition?.collapsedArea)),
        layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
        ports: [
          {
            id: entity.id + '::out',
            width: 0,
            height: 0,
            layoutOptions: { 'elk.port.side': 'EAST' },
          },
          {
            id: entity.id + '::in',
            width: 0,
            height: 0,
            layoutOptions: { 'elk.port.side': 'WEST' },
          },
        ],
      })),
    })),
    edges: connections.map(connection => ({
      id: connection.id,
      sources: [connection.source + '::out'],
      targets: [connection.target + '::in'],
    })),
  };
  const result = await elk.layout(graph);
  const nodes: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    parentId?: string;
    group?: string;
  }[] = [];
  const routes: Record<string, { x: number; y: number }[][]> = {};
  const origins = new Map<string, { x: number; y: number }>();
  const routedEdges: { edge: any; container: string }[] = [];
  function visit(node: any, ox = 0, oy = 0, parentId?: string) {
    const x = ox + (node.x ?? 0);
    const y = oy + (node.y ?? 0);
    origins.set(node.id, { x, y });
    if (node.id !== 'root')
      nodes.push({
        id: node.id,
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width,
        height: node.height,
        parentId,
        group: node.id.startsWith('area:') ? node.id.slice(5) : undefined,
      });
    for (const edge of node.edges ?? []) {
      routedEdges.push({ edge, container: edge.container ?? node.id });
    }
    for (const child of node.children ?? []) visit(child, x, y, node.id === 'root' ? undefined : node.id);
  }
  visit(result);
  // ELK can store an edge on the root while expressing its points in a compound container.
  for (const { edge, container } of routedEdges) {
    const origin = origins.get(container) ?? { x: 0, y: 0 };
    routes[edge.id] = (edge.sections ?? []).map((section: any) =>
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point: any) => ({
        x: point.x + origin.x,
        y: point.y + origin.y,
      })),
    );
  }
  return {
    nodes,
    routes,
    width: result.width ?? 0,
    height: result.height ?? 0,
    entityCount: overview.entities.length,
    relationshipCount: overview.links.length,
  };
}

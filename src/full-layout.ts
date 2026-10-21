/** Arranges grouped graphs and packs group rectangles without stretching their nodes. */
import type { GroupingOptions } from './overview';
import { modelOverview } from './overview';
import { groupRelationships } from './graph-view';
import type { Entity, Relationship } from './model';
/** Lays out nodes and edges within their model groups. */
export async function layoutFullGraph(
  entities: Entity[],
  edges: Relationship[],
  name: string,
  elk: { layout: (g: any) => Promise<any> },
  grouping?: GroupingOptions,
) {
  const overview = modelOverview(entities, edges, name, false, grouping);
  const connections = groupRelationships(overview.links);
  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
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
        'elk.padding': '[top=62,left=24,bottom=24,right=24]',
        'elk.spacing.nodeNode': '24',
        'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      },
      children: group.entities.map(e => ({
        id: e.id,
        width: 184,
        height: 60,
        layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
        ports: [
          { id: e.id + '::out', width: 0, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } },
          { id: e.id + '::in', width: 0, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } },
        ],
      })),
    })),
    edges: connections.map(e => ({
      id: e.id,
      sources: [e.source + '::out'],
      targets: [e.target + '::in'],
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
  function visit(node: any, ox = 0, oy = 0, parentId?: string) {
    const x = ox + (node.x ?? 0);
    const y = oy + (node.y ?? 0);
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
    for (const edge of node.edges ?? [])
      routes[edge.id] = (edge.sections ?? []).map((section: any) =>
        [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p: any) => ({
          x: p.x + x,
          y: p.y + y,
        })),
      );
    for (const child of node.children ?? [])
      visit(child, x, y, node.id === 'root' ? undefined : node.id);
  }
  visit(result);
  return {
    nodes,
    routes,
    width: result.width ?? 0,
    height: result.height ?? 0,
    entityCount: overview.entities.length,
    relationshipCount: overview.links.length,
  };
}
// Keep fCoSE's internal compound layout, then pack the area rectangles with ELK's box packer to
// remove empty space without stretching individual nodes.
/** Packs group rectangles while preserving their internal network layouts. */
export async function packNetwork(
  result: any,
  elk: { layout: (g: any) => Promise<any> },
  _grouping?: GroupingOptions,
) {
  const groups = result.nodes.filter((n: any) => n.group);
  const interiors = await Promise.all(
    groups.map((g: any) =>
      elk.layout({
        id: g.id,
        layoutOptions: {
          'elk.algorithm': 'sporeOverlap',
          'elk.spacing.nodeNode': '24',
          'elk.padding': '[top=62,left=28,bottom=28,right=28]',
        },
        children: result.nodes
          .filter((n: any) => n.parentId === g.id)
          .map((n: any) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })),
      }),
    ),
  );
  const dimensions = new Map(interiors.map((g: any) => [g.id, g]));
  const children = new Map(interiors.flatMap((g: any) => g.children.map((n: any) => [n.id, n])));
  const packed = await elk.layout({
    id: 'packing',
    layoutOptions: {
      'elk.algorithm': 'box',
      'elk.aspectRatio': '2.0',
      'elk.spacing.nodeNode': '70',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: groups.map((g: any) => ({
      id: g.id,
      width: (dimensions.get(g.id) as any).width,
      height: (dimensions.get(g.id) as any).height,
    })),
  });
  const positions = new Map(packed.children.map((g: any) => [g.id, g]));
  return {
    ...result,
    width: packed.width,
    height: packed.height,
    nodes: result.nodes.map((n: any) =>
      n.group
        ? { ...n, ...(positions.get(n.id) as any) }
        : { ...n, x: (children.get(n.id) as any).x, y: (children.get(n.id) as any).y },
    ),
  };
}

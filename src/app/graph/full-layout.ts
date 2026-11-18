/** Arranges grouped graphs and packs group rectangles without stretching their nodes. */
import type { GroupingOptions } from './overview';
import { modelOverview } from './overview';
import { groupRelationships } from './graph-view';
import type { Entity, Relationship } from '../../shared/core/model';
import { FULL_GRAPH_FIT_PADDING, GROUP_HEADER_HEIGHT, MODEL_CARD_WIDTH, NAME_MIN_PX, PORTRAIT_NETWORK_NAME_PX, modelCardHeight } from './overview-capacity';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { getViewportForBounds } from '@xyflow/react';

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
        width: MODEL_CARD_WIDTH,
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
    compensateName?: boolean;
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

/** The grouped nodes, routes and dimensions shared by both layouts. */
export type FullLayoutResult = Awaited<ReturnType<typeof layoutFullGraph>>;
/** The network canvas keeps the header spacing of the original compound layout. */
export const NETWORK_HEADER_HEIGHT = 62;
/** Reserves two 48 px title lines in counted Network areas. */
export const COUNTED_NETWORK_HEADER_HEIGHT = 128;
const NETWORK_FRAME_PADDING = 40;
const PORTRAIT_NETWORK_HEADER_HEIGHT = 72;

/** The usable viewport and the dimensions that hold the model's names at Fit. */
export type NetworkPane = { width: number; height: number; nameSize: number; portraitCardHeights?: ReadonlyMap<string, number> };

/** Separates overlapping cards, then packs area frames without replacing their network layout. */
export async function packNetwork(result: FullLayoutResult, elk: FullLayoutOptions['elk'], pane?: NetworkPane): Promise<FullLayoutResult> {
  const aspect = pane ? pane.width / pane.height : undefined;
  const regular = await packNetworkAreas(result, elk, aspect);
  if (!pane || !result.nodes.length || fittedNetworkName(regular, pane) >= NAME_MIN_PX) return regular;
  const portrait = pane.portraitCardHeights !== undefined;
  const nameSize = portrait ? PORTRAIT_NETWORK_NAME_PX : pane.nameSize;
  const compactNodes = withPortraitNames(result.nodes, pane.portraitCardHeights);
  const readableZoom = NAME_MIN_PX / nameSize;
  const cardArea = compactNodes.reduce((area, node) => area + (node.parentId ? node.width * node.height : 0), 0);
  if (cardArea * readableZoom ** 2 >= pane.width * pane.height) return regular;
  // ELK's target includes its outer padding. Give the compact group rows room to form two columns.
  const compactAspect = Math.max(pane.width / pane.height, portrait ? 0.75 : 2);
  const areaAspect = portrait ? 1 : 3;
  const compact = await packNetworkAreas({ ...result, nodes: compactNodes }, elk, compactAspect, areaAspect);
  return fittedNetworkName(compact, { ...pane, nameSize }) >= NAME_MIN_PX ? compact : regular;
}

function withPortraitNames(nodes: FullLayoutResult['nodes'], heights: NetworkPane['portraitCardHeights']): FullLayoutResult['nodes'] {
  if (!heights) return nodes;
  return nodes.map(node => {
    const height = heights.get(node.id);
    return height === undefined ? node : { ...node, height, compensateName: true };
  });
}

function fittedNetworkName(layout: FullLayoutResult, pane: NetworkPane): number {
  const width = layout.width - NETWORK_FRAME_PADDING * 2;
  const height = layout.height - NETWORK_FRAME_PADDING * 2;
  return getViewportForBounds({ x: 0, y: 0, width, height }, pane.width, pane.height, 0.001, 1, FULL_GRAPH_FIT_PADDING).zoom * pane.nameSize;
}

function arrangeArea(result: FullLayoutResult, group: FullLayoutResult['nodes'][number], elk: FullLayoutOptions['elk'], areaAspect?: number) {
  const cards = result.nodes.filter(node => node.parentId === group.id);
  // Counted areas need the taller reserve because their headings compensate for zoom.
  let headerHeight = NETWORK_HEADER_HEIGHT;
  if (cards.some(card => card.id === 'collapsed:' + group.group)) headerHeight = COUNTED_NETWORK_HEADER_HEIGHT;
  else if (cards.some(card => card.compensateName)) headerHeight = PORTRAIT_NETWORK_HEADER_HEIGHT;
  const compact = areaAspect !== undefined;
  const sidePadding = compact ? 12 : 28;
  // The compact rows preserve the order suggested by the force layout.
  if (compact) cards.sort((left, right) => left.y - right.y || left.x - right.x);
  return elk.layout({
    id: group.id,
    layoutOptions: {
      'elk.algorithm': compact ? 'box' : 'sporeOverlap',
      ...(compact ? { 'elk.aspectRatio': String(areaAspect) } : {}),
      'elk.spacing.nodeNode': compact ? '12' : '24',
      'elk.padding': `[top=${headerHeight},left=${sidePadding},bottom=${sidePadding},right=${sidePadding}]`,
    },
    children: cards.map(node => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })),
  });
}

async function packNetworkAreas(result: FullLayoutResult, elk: FullLayoutOptions['elk'], aspect?: number, areaAspect?: number): Promise<FullLayoutResult> {
  const groups = result.nodes.filter(node => node.group);
  if (!groups.length) return result;
  const interiors: ElkNode[] = await Promise.all(groups.map(group => arrangeArea(result, group, elk, areaAspect)));
  const dimensions = new Map(
    interiors.map(group => {
      if (group.width === undefined || group.height === undefined) throw new Error(`Network area ${group.id} has no computed dimensions.`);
      return [group.id, { width: group.width, height: group.height }] as const;
    }),
  );
  const children = new Map(interiors.flatMap(group => (group.children ?? []).map(node => [node.id, node] as const)));
  // The taller counted tiles can pack an extra column. Keep enough width for their fitted names.
  const counted = groups.every(group => children.has('collapsed:' + group.group));
  const regularSpacing = counted ? 60 : 70;
  const packed: ElkNode = await elk.layout({
    id: 'packing',
    layoutOptions: {
      'elk.algorithm': 'box',
      'elk.aspectRatio': String(aspect ?? 2),
      'elk.spacing.nodeNode': String(areaAspect === undefined ? regularSpacing : 36),
      'elk.padding': `[top=${NETWORK_FRAME_PADDING},left=${NETWORK_FRAME_PADDING},bottom=${NETWORK_FRAME_PADDING},right=${NETWORK_FRAME_PADDING}]`,
    },
    children: groups.map(group => ({ id: group.id, ...dimensions.get(group.id)! })),
  });
  if (packed.width === undefined || packed.height === undefined) throw new Error('The packed network has no computed dimensions.');
  const positions = new Map((packed.children ?? []).map(group => [group.id, group]));
  return {
    ...result,
    width: packed.width,
    height: packed.height,
    nodes: result.nodes.map(node => {
      const placed = (node.group ? positions : children).get(node.id);
      if (placed?.x === undefined || placed.y === undefined) throw new Error(`Network node ${node.id} has no computed position.`);
      return { ...node, ...(node.group ? dimensions.get(node.id) : {}), x: placed.x, y: placed.y };
    }),
  };
}

/** Builds full-model relationship paths and labels from the current layout and focus. */
import { useMemo } from 'react';
import { MarkerType } from '@xyflow/react';
import type { groupRelationships } from './graph-view';
import type { FullLayoutResult } from './full-layout';
import { unpublishedEdge } from './edge-styles';
import { placeLabels, type Box } from './routes';
import type { ChangeState } from '../../shared/item-diff/item-change';

type Inputs = {
  connections: ReturnType<typeof groupRelationships>;
  positions: Map<string, { x: number; y: number; width: number; height: number }>;
  labelObstacles: Box[];
  labelViewportSize: { width: number; height: number };
  selectedEdge: string;
  focus: string;
  labels: boolean;
  hoverEdge: string;
  algorithm: 'network' | 'layered';
  layoutRoutes: FullLayoutResult['routes'];
  viewport: { x: number; y: number; zoom: number };
  size: { width: number; height: number };
  dragging: boolean;
};

function relationshipOpacity(emphasized: boolean, hasFocus: boolean) {
  if (emphasized) return 0.95;
  if (hasFocus) return 0.07;
  return 0.48;
}

/** Keeps graph connections stable until their layout, viewport or emphasis changes. */
export function useFullGraphEdges({ connections, positions, labelObstacles, labelViewportSize, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging }: Inputs) {
  const edges = useMemo(
    () =>
      connections.map(connection => {
        const fromPosition = positions.get(connection.source);
        const toPosition = positions.get(connection.target);
        let source = 'e';
        let target = 'w';
        if (fromPosition && toPosition) {
          const dx = toPosition.x - fromPosition.x;
          const dy = toPosition.y - fromPosition.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            source = dx >= 0 ? 'e' : 'w';
            target = dx >= 0 ? 'w' : 'e';
          } else {
            source = dy >= 0 ? 's' : 'n';
            target = dy >= 0 ? 'n' : 's';
          }
        }
        if (connection.source === connection.target) {
          source = 'e';
          target = 's';
        }
        if (algorithm === 'layered') {
          source = 'e';
          target = 'w';
        }
        const active = connection.data.relationships.some(r => r.id === selectedEdge);
        const adjacent = connection.source === focus || connection.target === focus;
        const visible = (position: any) =>
          position &&
          position.x * viewport.zoom + viewport.x > -220 * viewport.zoom &&
          position.x * viewport.zoom + viewport.x < size.width + 30 &&
          position.y * viewport.zoom + viewport.y > -90 * viewport.zoom &&
          position.y * viewport.zoom + viewport.y < size.height + 30;
        const routeDetailed = !dragging && connection.source !== connection.target && (active || adjacent || (viewport.zoom >= 0.35 && visible(fromPosition) && visible(toPosition)));
        let label: string | undefined;
        if ((labels && (viewport.zoom >= 0.75 || adjacent)) || active || hoverEdge === connection.id) {
          if (connection.data.relationships.length > 1) {
            label = `${connection.data.relationships.length} relationships`;
          } else {
            label = connection.label;
          }
        } else {
          label = undefined;
        }
        const style = {
          stroke: active || adjacent ? 'var(--color-edge-active)' : 'var(--color-edge-idle)',
          strokeWidth: active ? 2 : 1.2,
          strokeOpacity: relationshipOpacity(active || adjacent, Boolean(focus)),
        };
        // A relationship with unsaved or unpublished changes is drawn with its change mark.
        const change = (connection.data as { change?: ChangeState }).change;
        const appearance = unpublishedEdge(label, connection.label, style, change);
        return {
          ...connection,
          data: {
            ...connection.data,
            algorithm,
            routeDetailed,
            layoutRoute: algorithm === 'layered' ? layoutRoutes[connection.id]?.flat() : undefined,
          },
          type: 'routed',
          sourceHandle: 'source-' + source,
          targetHandle: 'target-' + target,
          selected: active,
          ...appearance,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active || adjacent ? 'var(--color-edge-active)' : 'var(--color-edge-idle)',
            width: 13,
            height: 13,
          },
          zIndex: -2,
          interactionWidth: 24,
        };
      }),
    [connections, positions, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging],
  );
  return useMemo(() => {
    const items = edges.flatMap(edge => {
      if (algorithm !== 'network' || !edge.label || !edge.source.startsWith('collapsed:') || !edge.target.startsWith('collapsed:')) return [];
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) return [];
      const points: [number, number][] = [
        [source.x + source.width / 2, source.y + source.height / 2],
        [target.x + target.width / 2, target.y + target.height / 2],
      ];
      return [{ id: edge.id, text: String(edge.label), points }];
    });
    // Area headers draw above edge paths. Reserve them and the cards, then share one label plane.
    const visibleCanvas = {
      x: (2 - viewport.x) / viewport.zoom,
      y: (2 - viewport.y) / viewport.zoom,
      width: (labelViewportSize.width - 4) / viewport.zoom,
      height: (labelViewportSize.height - 4) / viewport.zoom,
    };
    const labelPositions = placeLabels(items, labelObstacles, 1, visibleCanvas);
    return edges.map(edge => ({ ...edge, data: { ...edge.data, labelAt: labelPositions.get(edge.id) } }));
  }, [edges, positions, labelObstacles, algorithm, viewport, labelViewportSize]);
}

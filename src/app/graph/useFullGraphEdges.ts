/** Builds full-model relationship paths and labels from the current layout and focus. */
import { useMemo } from 'react';
import { MarkerType } from '@xyflow/react';
import type { groupRelationships } from './graph-view';
import type { FullLayoutResult } from './full-layout';

type Inputs = {
  connections: ReturnType<typeof groupRelationships>;
  positions: Map<string, { x: number; y: number; width: number; height: number }>;
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
export function useFullGraphEdges({ connections, positions, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging }: Inputs) {
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
          label,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active || adjacent ? 'var(--color-edge-active)' : 'var(--color-edge-idle)',
            width: 13,
            height: 13,
          },
          zIndex: -2,
          interactionWidth: 24,
          style: {
            stroke: active || adjacent ? 'var(--color-edge-active)' : 'var(--color-edge-idle)',
            strokeWidth: active ? 2 : 1.2,
            strokeOpacity: relationshipOpacity(active || adjacent, Boolean(focus)),
          },
        };
      }),
    [connections, positions, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging],
  );
  return edges;
}

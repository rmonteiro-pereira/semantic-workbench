/** Builds full-model relationship paths and labels from the current layout and focus. */
import { useCallback, useMemo, useState } from 'react';
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
  miniMapBounds?: Box;
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
export function useFullGraphEdges({
  connections,
  positions,
  labelObstacles,
  labelViewportSize,
  miniMapBounds,
  selectedEdge,
  focus,
  labels,
  hoverEdge,
  algorithm,
  layoutRoutes,
  viewport,
  size,
  dragging,
}: Inputs) {
  const [renderedRoutes, setRenderedRoutes] = useState(new Map<string, { path: string; points: [number, number][]; candidates: [number, number][] }>());
  const reportLabelRoute = useCallback((id: string, element: SVGPathElement) => {
    const path = element.getAttribute('d') ?? '';
    setRenderedRoutes(previous => {
      if (previous.get(id)?.path === path) return previous;
      const length = element.getTotalLength();
      const steps = Math.max(1, Math.ceil(length / 4));
      const points: [number, number][] = Array.from({ length: steps + 1 }, (_, index) => {
        const point = element.getPointAtLength((length * index) / steps);
        return [point.x, point.y];
      });
      const candidates: [number, number][] = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map(fraction => {
        const point = element.getPointAtLength(length * fraction);
        return [point.x, point.y];
      });
      return new Map(previous).set(id, { path, points, candidates });
    });
  }, []);
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
      const points = renderedRoutes.get(edge.id)?.points;
      if (!points) return [];
      return [{ id: edge.id, text: String(edge.label), points, candidates: renderedRoutes.get(edge.id)?.candidates }];
    });
    // Area headers draw above edge paths. Reserve them and the cards, then share one label plane.
    const visibleCanvas = {
      x: (2 - viewport.x) / viewport.zoom,
      y: (2 - viewport.y) / viewport.zoom,
      width: (labelViewportSize.width - 4) / viewport.zoom,
      height: (labelViewportSize.height - 4) / viewport.zoom,
    };
    const obstacles = [...labelObstacles];
    if (miniMapBounds) {
      obstacles.push({
        x: (miniMapBounds.x - viewport.x) / viewport.zoom,
        y: (miniMapBounds.y - viewport.y) / viewport.zoom,
        width: miniMapBounds.width / viewport.zoom,
        height: miniMapBounds.height / viewport.zoom,
      });
    }
    const labelPositions = placeLabels(items, obstacles, 1, visibleCanvas);
    return edges.map(edge => {
      const eligible = algorithm === 'network' && edge.label && edge.source.startsWith('collapsed:') && edge.target.startsWith('collapsed:');
      return { ...edge, data: { ...edge.data, labelAt: labelPositions.get(edge.id), labelPoints: renderedRoutes.get(edge.id)?.points, reportLabelRoute: eligible ? reportLabelRoute : undefined } };
    });
  }, [edges, labelObstacles, algorithm, viewport, labelViewportSize, miniMapBounds, renderedRoutes, reportLabelRoute]);
}

/** Builds full-model relationship paths and labels from the current layout and focus. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarkerType } from '@xyflow/react';
import type { groupRelationships } from './graph-view';
import type { FullLayoutResult } from './full-layout';
import { unpublishedEdge } from './edge-styles';
import { placeLabels, type Box } from './routes';
import { measureLabelRoute, visibleLabelRoute, labelRouteAnchor, type LabelRoute } from './label-route';
import type { ChangeState } from '../../shared/item-diff/item-change';

type Inputs = {
  connections: ReturnType<typeof groupRelationships>;
  positions: Map<string, { x: number; y: number; width: number; height: number }>;
  labelObstacles: () => Box[];
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

function useRenderedLabelRoutes(eligibleIds: Set<string>) {
  const [revision, setRevision] = useState(0);
  const routes = useRef(new Map<string, LabelRoute>());
  const pending = useRef(new Map<string, SVGPathElement>());
  const frame = useRef<number | undefined>(undefined);
  const reportLabelRoute = useCallback((id: string, element: SVGPathElement) => {
    pending.current.set(id, element);
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      let changed = false;
      for (const [edgeId, path] of pending.current) {
        const previous = routes.current.get(edgeId);
        if (previous?.path === path.getAttribute('d')) {
          previous.element = path;
          continue;
        }
        routes.current.set(edgeId, measureLabelRoute(path));
        changed = true;
      }
      pending.current.clear();
      if (changed) setRevision(value => value + 1);
    });
  }, []);
  useEffect(() => {
    for (const id of routes.current.keys()) if (!eligibleIds.has(id)) routes.current.delete(id);
    for (const id of pending.current.keys()) if (!eligibleIds.has(id)) pending.current.delete(id);
  }, [eligibleIds]);
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return { routes: routes.current, revision, reportLabelRoute };
}

function placeFullGraphLabels(edges: ReturnType<typeof useFullGraphEdgesBase>, routes: Map<string, LabelRoute>, obstacles: Box[], viewport: Box) {
  const items = edges.flatMap(edge => {
    if (!edge.data.labelEligible) return [];
    const route = routes.get(edge.id);
    const geometry = route && visibleLabelRoute(route, viewport);
    return geometry ? [{ id: edge.id, text: String(edge.label), ...geometry }] : [];
  });
  return placeLabels(items, obstacles, 1, viewport);
}

function useFullGraphEdgesBase({ connections, positions, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging }: Inputs) {
  return useMemo(
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
            labelEligible: algorithm === 'network' && Boolean(appearance.label) && connection.source.startsWith('collapsed:') && connection.target.startsWith('collapsed:'),
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
  const edges = useFullGraphEdgesBase({
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
  });
  const eligibleIds = useMemo(() => new Set(edges.filter(edge => edge.data.labelEligible).map(edge => edge.id)), [edges]);
  const { routes, revision, reportLabelRoute } = useRenderedLabelRoutes(eligibleIds);
  const hasEligibleLabels = eligibleIds.size > 0;
  const obstacles = useMemo(() => (hasEligibleLabels ? labelObstacles() : []), [hasEligibleLabels, labelObstacles]);
  return useMemo(() => {
    const visibleCanvas = {
      x: (2 - viewport.x) / viewport.zoom,
      y: (2 - viewport.y) / viewport.zoom,
      width: (labelViewportSize.width - 4) / viewport.zoom,
      height: (labelViewportSize.height - 4) / viewport.zoom,
    };
    const exclusions = [...obstacles];
    if (miniMapBounds) {
      exclusions.push({
        x: (miniMapBounds.x - viewport.x) / viewport.zoom,
        y: (miniMapBounds.y - viewport.y) / viewport.zoom,
        width: miniMapBounds.width / viewport.zoom,
        height: miniMapBounds.height / viewport.zoom,
      });
    }
    const labelPositions = placeFullGraphLabels(edges, routes, exclusions, visibleCanvas);
    return edges.map(edge => {
      const route = routes.get(edge.id);
      const labelAt = labelPositions.get(edge.id);
      return {
        ...edge,
        data: {
          ...edge.data,
          labelAt,
          labelAnchor: labelAt && route ? labelRouteAnchor(route, labelAt) : undefined,
          labelPoints: route?.points,
          reportLabelRoute: edge.data.labelEligible ? reportLabelRoute : undefined,
        },
      };
    });
  }, [edges, obstacles, viewport, labelViewportSize, miniMapBounds, routes, revision, reportLabelRoute]);
}

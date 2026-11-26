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

function measurePendingRoutes(pending: Map<string, SVGPathElement>, routes: Map<string, LabelRoute>) {
  let changed = false;
  for (const [edgeId, path] of pending) {
    const previous = routes.get(edgeId);
    if (previous?.path === path.getAttribute('d')) {
      previous.element = path;
      continue;
    }
    routes.set(edgeId, measureLabelRoute(path));
    changed = true;
  }
  pending.clear();
  return changed;
}

function useRenderedLabelRoutes(eligibleIds: Set<string>) {
  const [revision, setRevision] = useState(0);
  const routes = useRef(new Map<string, LabelRoute>());
  const pending = useRef(new Map<string, SVGPathElement>());
  const frame = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const scheduleMeasurement = useCallback(() => {
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      const changed = measurePendingRoutes(pending.current, routes.current);
      if (changed) setRevision(value => value + 1);
    });
  }, []);
  const reportLabelRoute = useCallback(
    (id: string, element: SVGPathElement) => {
      if (!mounted.current) return;
      pending.current.set(id, element);
      scheduleMeasurement();
    },
    [scheduleMeasurement],
  );
  useEffect(() => {
    for (const id of routes.current.keys()) if (!eligibleIds.has(id)) routes.current.delete(id);
    for (const id of pending.current.keys()) if (!eligibleIds.has(id)) pending.current.delete(id);
  }, [eligibleIds]);
  useEffect(() => {
    mounted.current = true;
    // A remounted effect must measure the routes reported before the remount.
    if (pending.current.size > 0) scheduleMeasurement();
    return () => {
      mounted.current = false;
      if (frame.current === undefined) return;
      cancelAnimationFrame(frame.current);
      // Clearing the id lets the next mount schedule a new measurement.
      frame.current = undefined;
    };
  }, [scheduleMeasurement]);
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

type Connection = Inputs['connections'][number];

function connectionHandles(connection: Connection, inputs: Inputs) {
  const { positions, algorithm } = inputs;
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
  return { source, target };
}

function connectionRouteDetailed(connection: Connection, inputs: Inputs, active: boolean, adjacent: boolean) {
  const { positions, viewport, size, dragging } = inputs;
  const fromPosition = positions.get(connection.source);
  const toPosition = positions.get(connection.target);
  const visible = (position: any) =>
    position &&
    position.x * viewport.zoom + viewport.x > -220 * viewport.zoom &&
    position.x * viewport.zoom + viewport.x < size.width + 30 &&
    position.y * viewport.zoom + viewport.y > -90 * viewport.zoom &&
    position.y * viewport.zoom + viewport.y < size.height + 30;
  return !dragging && connection.source !== connection.target && (active || adjacent || (viewport.zoom >= 0.35 && visible(fromPosition) && visible(toPosition)));
}

function connectionAppearance(connection: Connection, inputs: Inputs) {
  const { selectedEdge, focus, labels, hoverEdge, viewport } = inputs;
  const active = connection.data.relationships.some(r => r.id === selectedEdge);
  const adjacent = connection.source === focus || connection.target === focus;
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
  return { active, adjacent, appearance };
}

function buildFullGraphEdge(connection: Connection, inputs: Inputs) {
  const { algorithm, layoutRoutes } = inputs;
  const handles = connectionHandles(connection, inputs);
  const { active, adjacent, appearance } = connectionAppearance(connection, inputs);
  const routeDetailed = connectionRouteDetailed(connection, inputs, active, adjacent);
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
    sourceHandle: 'source-' + handles.source,
    targetHandle: 'target-' + handles.target,
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
}

function useFullGraphEdgesBase(inputs: Inputs) {
  const { connections, positions, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging } = inputs;
  return useMemo(
    () => connections.map(connection => buildFullGraphEdge(connection, inputs)),
    [connections, positions, selectedEdge, focus, labels, hoverEdge, algorithm, layoutRoutes, viewport, size, dragging],
  );
}

function fullGraphLabelPlane(inputs: Inputs, obstacles: Box[]) {
  const { viewport, labelViewportSize, miniMapBounds } = inputs;
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
  return { visibleCanvas, exclusions };
}

function attachFullGraphLabels(
  edges: ReturnType<typeof useFullGraphEdgesBase>,
  routes: Map<string, LabelRoute>,
  exclusions: Box[],
  visibleCanvas: Box,
  reportLabelRoute: (id: string, element: SVGPathElement) => void,
) {
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
}

/** Keeps graph connections stable until their layout, viewport or emphasis changes. */
export function useFullGraphEdges(inputs: Inputs) {
  const { labelObstacles, labelViewportSize, miniMapBounds, viewport } = inputs;
  const edges = useFullGraphEdgesBase(inputs);
  const eligibleIds = useMemo(() => new Set(edges.filter(edge => edge.data.labelEligible).map(edge => edge.id)), [edges]);
  const { routes, revision, reportLabelRoute } = useRenderedLabelRoutes(eligibleIds);
  const hasEligibleLabels = eligibleIds.size > 0;
  const obstacles = useMemo(() => (hasEligibleLabels ? labelObstacles() : []), [hasEligibleLabels, labelObstacles]);
  return useMemo(() => {
    const { visibleCanvas, exclusions } = fullGraphLabelPlane(inputs, obstacles);
    return attachFullGraphLabels(edges, routes, exclusions, visibleCanvas, reportLabelRoute);
  }, [edges, obstacles, viewport, labelViewportSize, miniMapBounds, routes, revision, reportLabelRoute]);
}

/** Renders neighborhood relationships using the routes assigned by the graph layout. */
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps } from '@xyflow/react';
import {
  labelBox,
  labelInViewport,
  nearestRoutePoint,
  orthogonalPath,
  routePoints,
  type EdgeRoute,
} from './graph/routes';
/** Exports the shared relationship routing geometry and types. */
export {
  assignRoutes,
  placeLabels,
  routePoints,
  orthogonalPath,
  type EdgeRoute,
  type Box,
} from './graph/routes';

/** Renders an assigned relationship route and its label. */
export function RelationshipEdge(props: EdgeProps) {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, data } = props;
  const route = (data?.route as EdgeRoute | undefined) ?? { route: 'short', bendX: (sx + tx) / 2 };
  const { points, label: own } = routePoints(sx, sy, tx, ty, route);
  const label = (data?.labelAt as [number, number] | undefined) ?? own;
  const labelScale = (data?.labelScale as number | undefined) ?? 1;
  const bounds = labelBox(String(props.label ?? ''), label, labelScale);
  const visible = useStore(state =>
    labelInViewport(bounds, state.transform, state.width, state.height),
  );
  const anchor = nearestRoutePoint(points, label);
  const displaced = Math.hypot(anchor[0] - label[0], anchor[1] - label[1]) > 1;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={orthogonalPath(points)}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={props.interactionWidth}
      />
      {visible && props.label && (
        <>
          {displaced && (
            <line
              className="relationship-label-leader"
              x1={anchor[0]}
              y1={anchor[1]}
              x2={label[0]}
              y2={label[1]}
            />
          )}
          <EdgeLabelRenderer>
            <div
              className="relationship-label"
              data-edge-id={props.id}
              style={{
                transform: `translate(${label[0]}px, ${label[1]}px) scale(${labelScale}) translate(-50%, -50%)`,
              }}
            >
              {props.label}
            </div>
          </EdgeLabelRenderer>
        </>
      )}
    </>
  );
}
export const relationshipEdgeTypes = { relationship: RelationshipEdge };

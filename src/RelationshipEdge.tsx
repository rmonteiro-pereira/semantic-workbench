/** Renders neighborhood relationships using the routes assigned by the graph layout. */
import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { orthogonalPath, routePoints, type EdgeRoute } from './graph/routes';
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
  return (
    <BaseEdge
      id={props.id}
      path={orthogonalPath(points)}
      label={props.label}
      labelX={label[0]}
      labelY={label[1]}
      markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={props.interactionWidth}
    />
  );
}
export const relationshipEdgeTypes = { relationship: RelationshipEdge };

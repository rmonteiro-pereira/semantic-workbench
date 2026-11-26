/** Renders neighborhood relationships using the routes assigned by the graph layout. */
import type { ReactNode } from 'react';
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps } from '@xyflow/react';
import type { ItemTraffic } from '../usage/use-usage';
import { countWords } from '../usage/usage-wording';
import { trafficStrokeWidth } from '../usage/usage-intensity';
import { unpublishedEdge } from './edge-styles';
import type { ChangeState } from '../../shared/item-diff/item-change';
import { labelBox, labelInViewport, nearestRoutePoint, orthogonalPath, routePoints, type EdgeRoute } from './routes';
/** Exports the shared relationship routing geometry and types. */
export { assignRoutes, heightForEdgeEnds, placeLabels, routePoints, orthogonalPath, type EdgeRoute, type Box } from './routes';

/** Renders an assigned relationship route and its label. */
export function RelationshipEdge(props: EdgeProps) {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, data } = props;
  const traffic = data?.traffic as ItemTraffic | null | undefined;
  // A relationship imported from another project is dashed, so it reads as not defined here.
  const own = data?.imported ? { ...props.style, strokeDasharray: '5 3' } : props.style;
  const style = traffic?.level ? { ...own, strokeWidth: trafficStrokeWidth(Number(own?.strokeWidth ?? 1.5), traffic.level) } : own;
  const route = (data?.route as EdgeRoute | undefined) ?? { route: 'short', bendX: (sx + tx) / 2 };
  const { points, label: routeLabel } = routePoints({ x: sx, y: sy }, { x: tx, y: ty }, route);
  return (
    <>
      <BaseEdge id={props.id} path={orthogonalPath(points)} markerEnd={props.markerEnd} style={style} interactionWidth={props.interactionWidth} />
      {props.label && <RelationshipLabel edge={props} text={props.label} points={points} fallback={routeLabel} traffic={traffic} />}
    </>
  );
}

type LabelProps = {
  edge: EdgeProps;
  text: ReactNode;
  points: [number, number][];
  fallback: [number, number];
  traffic?: ItemTraffic | null;
};

/** Draws a relationship label above paths, with a leader when its position is displaced. */
export function RelationshipLabel({ edge, text, points, fallback, traffic }: LabelProps) {
  const label = (edge.data?.labelAt as [number, number] | undefined) ?? fallback;
  const scale = (edge.data?.labelScale as number | undefined) ?? 1;
  const bounds = labelBox(String(text), label, scale);
  const visible = useStore(state => labelInViewport(bounds, state.transform, state.width, state.height));
  if (!visible) return null;
  const anchor = nearestRoutePoint(points, label);
  const displaced = Math.hypot(anchor[0] - label[0], anchor[1] - label[1]) > 1;
  return (
    <>
      {displaced && <line className="relationship-label-leader" x1={anchor[0]} y1={anchor[1]} x2={label[0]} y2={label[1]} />}
      <EdgeLabelRenderer>
        <div className="relationship-label" data-edge-id={edge.id} style={{ transform: `translate(${label[0]}px, ${label[1]}px) scale(${scale}) translate(-50%, -50%)` }}>
          {text}
          {traffic?.level ? <span className="traffic-sr">{countWords(traffic.total, traffic.days)}</span> : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function OverlayRelationshipEdge(props: EdgeProps) {
  const change = props.data?.change as ChangeState | undefined;
  if (!change) return <RelationshipEdge {...props} />;
  const relationships = props.data?.relationships as { label: string }[] | undefined;
  const appearance = unpublishedEdge(props.label, relationships?.[0]?.label ?? 'Relationship', props.style, change);
  return <RelationshipEdge {...props} {...appearance} />;
}

export const relationshipEdgeTypes = { relationship: OverlayRelationshipEdge };

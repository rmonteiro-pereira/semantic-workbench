import {BaseEdge,type EdgeProps} from '@xyflow/react';
import {orthogonalPath,routePoints,type EdgeRoute} from './graph/routes';
export {assignRoutes,placeLabels,routePoints,orthogonalPath,type EdgeRoute,type Box} from './graph/routes';
// Neighborhood edge: draws the route assigned in src/graph/routes.ts.
export function RelationshipEdge(props:EdgeProps){
 const {sourceX:sx,sourceY:sy,targetX:tx,targetY:ty,data}=props;
 const route=(data?.route as EdgeRoute|undefined)??{route:'short',bendX:(sx+tx)/2};
 const {points,label:own}=routePoints(sx,sy,tx,ty,route);const label=(data?.labelAt as [number,number]|undefined)??own;
 return <BaseEdge id={props.id} path={orthogonalPath(points)} label={props.label} labelX={label[0]} labelY={label[1]} markerEnd={props.markerEnd} style={props.style} interactionWidth={props.interactionWidth}/>;
}
export const relationshipEdgeTypes={relationship:RelationshipEdge};

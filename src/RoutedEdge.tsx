import {BaseEdge,BezierEdge,type EdgeProps} from '@xyflow/react';
import {useSmartEdgePath} from '@tisoap/react-flow-smart-edge';
import {pathMatchesEndpoints} from './edge-path';

/** Background routing may finish after a drag or a complete layout change.
 * Keep using live React Flow handles until the matching route arrives. */
export function RoutedEdge(props:EdgeProps){
 const {route,isDragging}=useSmartEdgePath({id:props.id,source:props.source,target:props.target,sourceX:props.sourceX,sourceY:props.sourceY,targetX:props.targetX,targetY:props.targetY,sourcePosition:props.sourcePosition,targetPosition:props.targetPosition,preset:props.data?.algorithm==='network'?'bezier':'smoothstep',options:{nodePadding:10,gridRatio:10,borderRadius:5}});
 if(isDragging||!route||route.kind!=='routed'||!pathMatchesEndpoints(route.svgPathString,props.sourceX,props.sourceY,props.targetX,props.targetY))return <BezierEdge {...props} interactionWidth={24}/>;
 return <BaseEdge id={props.id} path={route.svgPathString} label={props.label} labelX={route.edgeCenterX} labelY={route.edgeCenterY} markerEnd={props.markerEnd} markerStart={props.markerStart} style={props.style} interactionWidth={24} labelStyle={props.labelStyle} labelShowBg={props.labelShowBg} labelBgStyle={props.labelBgStyle} labelBgPadding={props.labelBgPadding} labelBgBorderRadius={props.labelBgBorderRadius}/>;
}

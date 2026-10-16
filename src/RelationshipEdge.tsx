import {BaseEdge,getSmoothStepPath,type EdgeProps} from '@xyflow/react';
// Route long connections above intermediate columns rather than through cards.
export function RelationshipEdge(props:EdgeProps){
 const {sourceX:sx,sourceY:sy,targetX:tx,targetY:ty,sourcePosition,targetPosition,data}=props;
 let [path,labelX,labelY]=getSmoothStepPath({sourceX:sx,sourceY:sy,targetX:tx,targetY:ty,sourcePosition,targetPosition,borderRadius:10});
 if(tx-sx>350||tx<sx){
  const top=Number(data?.routeTop??Math.min(sy,ty)-140);
  const a=sx+24,b=tx-24;
  path=`M ${sx},${sy} L ${a-8},${sy} Q ${a},${sy} ${a},${sy-8} L ${a},${top+8} Q ${a},${top} ${a+8},${top} L ${b-8},${top} Q ${b},${top} ${b},${top+8} L ${b},${ty-8} Q ${b},${ty} ${b+8},${ty} L ${tx},${ty}`;
  labelX=(a+b)/2;labelY=top;
 }
 return <BaseEdge id={props.id} path={path} label={props.label} labelX={labelX} labelY={labelY} markerEnd={props.markerEnd} style={props.style} interactionWidth={props.interactionWidth}/>;
}
export const relationshipEdgeTypes={relationship:RelationshipEdge};

import {useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Controls,Position,MarkerType,useNodesState,useNodesInitialized,useReactFlow,type Node} from '@xyflow/react';
import {AlignHorizontalJustifyStart,Gauge} from 'lucide-react';
import type {Entity,Relationship} from './model';
import {graphView,groupRelationships} from './graph-view';
import {layoutGraph} from './layout';
import {relationshipEdgeTypes} from './RelationshipEdge';

export type NeighborhoodGraphProps={entities:Entity[];edges:Relationship[];search:string;focusId:string;selected:string;selectedEdge:string;onFocus:(id:string)=>void;onSelectEntity:(id:string)=>void;onSelectEdge:(id:string)=>void;onOverview:()=>void;onFullGraph:()=>void;kpiBadges?:Map<string,string[]>};
export function NeighborhoodGraph(props:NeighborhoodGraphProps){return <ReactFlowProvider><NeighborhoodCanvas {...props}/></ReactFlowProvider>}
function NeighborhoodCanvas({entities:all,edges:allEdges,search,focusId,selected,selectedEdge,onFocus,onSelectEntity,onSelectEdge,onOverview,onFullGraph,kpiBadges}:NeighborhoodGraphProps){
 // KPI nodes (governed metrics) can be hidden with their relationships.
 const [hideKpis,setHideKpis]=useState(false);
 const kpiCount=useMemo(()=>all.filter(e=>e.kind==='Metric').length,[all]);
 const entities=useMemo(()=>hideKpis?all.filter(e=>e.kind!=='Metric'):all,[all,hideKpis]);
 const edges=useMemo(()=>{if(!hideKpis)return allEdges;const ids=new Set(entities.map(e=>e.id));return allEdges.filter(e=>ids.has(e.source)&&ids.has(e.target));},[allEdges,entities,hideKpis]);
 const view=useMemo(()=>graphView(entities,edges,search,false,8,focusId),[entities,edges,search,focusId]);
 const groups=useMemo(()=>groupRelationships(view.edges),[view]);
 const [nodes,setNodes,onNodesChange]=useNodesState<Node>([]);
 const [labels,setLabels]=useState(false),[hovered,setHovered]=useState(''),[aligning,setAligning]=useState(false);
 const canvas=useRef<HTMLDivElement>(null),worker=useRef<Worker|null>(null),previous=useRef('');
 const initialized=useNodesInitialized(),{fitView}=useReactFlow();
 // Positions belong to a particular neighborhood, never to a previous center.
 const membership=JSON.stringify([view.focus,view.entities.map(e=>e.id)]);
 useEffect(()=>{
  worker.current?.terminate();worker.current=null;setAligning(false);
  const positions=new Map(layoutGraph(view.entities.map(e=>e.id),view.edges).map(n=>[n.id,n.position]));
  setNodes(old=>{const retained=previous.current===membership?new Map(old.map(n=>[n.id,n.position])):new Map();previous.current=membership;
   return view.entities.map(e=>({id:e.id,position:retained.get(e.id)??positions.get(e.id)!,sourcePosition:Position.Right,targetPosition:Position.Left,
    data:{name:e.name,label:<div className={`node${e.kind==='Metric'?' kpi-node':''}`}><small>{e.kind==='Metric'?<><Gauge size={10}/> KPI · Metric</>:e.kind}{(kpiBadges?.get(e.name)?.length??0)>0&&<span className="kpi-badge" title={`KPIs: ${kpiBadges!.get(e.name)!.join(', ')}`}><Gauge size={10}/>{kpiBadges!.get(e.name)!.length===1?'KPI':`${kpiBadges!.get(e.name)!.length} KPIs`}</span>}</small><strong>{e.name}</strong><span>{e.fields.length?`${e.fields.length} ${e.fields.length===1?'field':'fields'}`:e.description||'Select to inspect'}</span></div>},
    style:{borderColor:e.id===selected?'#50cbb0':'#dbe3e4'}}));});
 },[view,membership,selected,setNodes,kpiBadges]);
 // Wait for measured node dimensions, and fit to the real remaining canvas size.
 useEffect(()=>{
  if(!initialized||!canvas.current)return;
  let frame=0;
  const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=canvas.current?.getBoundingClientRect();if(rect&&rect.width>0&&rect.height>0)void fitView({padding:0.18,maxZoom:1,duration:0});});};
  fit();const observer=new ResizeObserver(fit);observer.observe(canvas.current);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();};
 },[initialized,membership,fitView]);
 useEffect(()=>()=>worker.current?.terminate(),[]);
 const routeTop=nodes.reduce((top,n)=>Math.min(top,n.position.y),0)-35;
 const visibleEdges=groups.map(e=>{const active=e.data.relationships.some(r=>r.id===selectedEdge),related=selected&&(e.source===selected||e.target===selected);
  return {...e,type:'relationship',data:{...e.data,routeTop},label:labels||active||hovered===e.id?(e.data.relationships.length>1?`${e.data.relationships.length} relationships`:e.label):undefined,selected:active,interactionWidth:28,style:{stroke:active||related?'#237c68':'#8bafa5',strokeOpacity:selected&&!related?0.14:0.6,strokeWidth:active?2.5:1.4}};});
 function align(){
  worker.current?.terminate();const active=new Worker(new URL('./layout.worker.ts',import.meta.url),{type:'module'});worker.current=active;setAligning(true);
  active.onmessage=event=>{if(worker.current!==active)return;const positions=new Map<string,{x:number;y:number}>(event.data.map((n:{id:string;position:{x:number;y:number}})=>[n.id,n.position]));setNodes(old=>old.map(n=>({...n,position:positions.get(n.id)??n.position})));setAligning(false);active.terminate();worker.current=null;requestAnimationFrame(()=>void fitView({padding:0.18,maxZoom:1,duration:150}));};
  active.onerror=()=>{setAligning(false);active.terminate();worker.current=null;};
  active.postMessage({ids:view.entities.map(e=>e.id),edges:view.edges});
 }
 return <div className="neighborhood-graph">
  <div className="neighborhood-tools">
   <label>Center <select aria-label="Neighborhood center" value={view.focus??''} onChange={event=>{onFocus(event.target.value);onSelectEntity(event.target.value);}}>{!view.focus&&<option value="">No matching entity</option>}{entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
   <button onClick={align} disabled={!nodes.length||aligning}><AlignHorizontalJustifyStart size={16}/>{aligning?'Aligning…':'Auto align'}</button>
   <button onClick={()=>setLabels(v=>!v)} aria-pressed={labels}>Labels {labels?'on':'off'}</button>{kpiCount>0&&<button onClick={()=>setHideKpis(v=>!v)} aria-pressed={hideKpis} title={`${kpiCount} KPI nodes`}><Gauge size={14}/>KPIs {hideKpis?'hidden':'shown'}</button>}<button onClick={onOverview}>Model overview</button><button onClick={onFullGraph}>Full graph</button>
   <span className="neighborhood-summary">Showing {view.entities.length} of {entities.length} entities · {groups.length} connections</span>
  </div>
  <div className="neighborhood-canvas" ref={canvas}>
   {!nodes.length?<div className="graph-empty" role="status">{search?`No entities match “${search}”. Clear the search to return to the neighborhood.`:'This model has no entities to display.'}</div>:<ReactFlow nodes={nodes} edges={visibleEdges} edgeTypes={relationshipEdgeTypes} defaultEdgeOptions={{markerEnd:{type:MarkerType.ArrowClosed,color:'#7c9d90'}}} minZoom={0.01} maxZoom={2} nodesConnectable={false} onNodesChange={onNodesChange} onNodeClick={(_,node)=>{onFocus(node.id);onSelectEntity(node.id)}} onEdgeClick={(_,edge)=>onSelectEdge(edge.id)} onEdgeMouseEnter={(_,edge)=>setHovered(edge.id)} onEdgeMouseLeave={()=>setHovered('')} fitView>
    <Background gap={22} size={1}/><Controls/>
   </ReactFlow>}
  </div>
 </div>;
}

import {useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Controls,Position,MarkerType,useNodesState,useReactFlow,type Node} from '@xyflow/react';
import {ArrowLeft,ArrowRight,Crosshair,FileSymlink,Gauge,LocateFixed} from 'lucide-react';
import type {Entity,Relationship} from './model';
import {groupRelationships,neighborhood,searchEntities,projectModel,NEIGHBOR_PAGE} from './graph-view';
import {neighborhoodLayout} from './layout';
import {assignRoutes,placeLabels,routePoints,relationshipEdgeTypes,type Box} from './RelationshipEdge';
import type {Walk,WalkStep} from './graph/walk';
import {useViewRestore,type Fullscreen} from './graph/fullscreen';
import {FullscreenButton} from './FullGraph';
// Neighborhood of one center (FR-034–FR-041): the center in the middle, incoming neighbors on the
// left and outgoing on the right, counts of shown and hidden neighbors, relationships among
// neighbors on request, and a walk: activating a neighbor or relationship moves the center across
// it and records the step in a trail with Back and Forward, also into another file of the project.
export type CrossFileTarget={doc:string;file:string;entity:string;name:string;reason:string};
export type NeighborhoodGraphProps={docId:string;docLabel:(doc:string)=>string;entities:Entity[];edges:Relationship[];search:string;walk:Walk;selected:string;selectedEdge:string;
 onWalk:(steps:WalkStep[])=>void;onWalkTo:(index:number)=>void;onClearSearch:()=>void;onSelectEntity:(id:string)=>void;onSelectEdge:(id:string)=>void;onOverview:()=>void;onFullGraph:()=>void;
 kpiBadges?:Map<string,string[]>;fullscreen?:Fullscreen;onOpenKpis?:(concept:string)=>void;crossFile?:(entity:Entity)=>CrossFileTarget[];onCrossFile?:(target:CrossFileTarget)=>void};
export function NeighborhoodGraph(props:NeighborhoodGraphProps){return <ReactFlowProvider><NeighborhoodCanvas {...props}/></ReactFlowProvider>}
const NODE={width:250,height:96},LATERAL_DEFAULT_MAX=10;
const COLORS={out:'#237c68',in:'#5b4fa8',lateral:'#93a8a0'};
function NeighborhoodCanvas(props:NeighborhoodGraphProps){
 const {docId,entities:all,edges:allEdges,search,walk,selected,selectedEdge,kpiBadges}=props;
 const [hideKpis,setHideKpis]=useState(false),[lateralChoice,setLateral]=useState<boolean|null>(null),[technical,setTechnical]=useState(false),[labels,setLabels]=useState(false),[hovered,setHovered]=useState('');
 const [limit,setLimit]=useState(NEIGHBOR_PAGE),[relationship,setRelationship]=useState('');
 const kpiCount=useMemo(()=>all.filter(e=>e.kind==='Metric').length,[all]);
 const entities=useMemo(()=>hideKpis?all.filter(e=>e.kind!=='Metric'):all,[all,hideKpis]);
 const edges=useMemo(()=>{if(!hideKpis)return allEdges;const ids=new Set(entities.map(e=>e.id));return allEdges.filter(e=>ids.has(e.source)&&ids.has(e.target));},[allEdges,entities,hideKpis]);
 const step=walk.steps[walk.index],requested=step?.doc===docId?step.center:undefined;
 const previous=walk.index>0&&walk.steps[walk.index-1].doc===docId?walk.steps[walk.index-1].center:undefined;
 // Links among neighbors are shown by default unless there are so many that they bury the center's own
 // relationships; the toggle states how many there are either way.
 const base=useMemo(()=>neighborhood(entities,edges,{center:requested,limit,lateral:false,technical,relationship:relationship||undefined,keep:previous?[previous]:[]}),[entities,edges,requested,limit,technical,relationship,previous]);
 const lateralCount=base.lateral;
 const lateral=lateralChoice??lateralCount<=LATERAL_DEFAULT_MAX;
 const view=useMemo(()=>lateral?neighborhood(entities,edges,{center:requested,limit,lateral,technical,relationship:relationship||undefined,keep:previous?[previous]:[]}):base,[base,lateral]);
 const center=view.center,byId=useMemo(()=>new Map(all.map(e=>[e.id,e])),[all]);
 // Paging and the relationship filter belong to one center.
 useEffect(()=>{setLimit(NEIGHBOR_PAGE);setRelationship('');},[center]);
 const groups=useMemo(()=>groupRelationships(view.edges),[view]);
 const membership=JSON.stringify([center,view.entities.map(e=>e.id)]);
 const positions=useMemo(()=>center?neighborhoodLayout(center,view.incoming,view.outgoing,view.both):new Map(),[membership]);
 // Nodes are derived from the view synchronously; selection and center styling never rebuild them.
 const build=()=>view.entities.map((e):Node=>({id:e.id,position:positions.get(e.id)??{x:0,y:0},sourcePosition:Position.Right,targetPosition:Position.Left,style:{width:NODE.width},data:{entity:e}}));
 const [nodes,setNodes,onNodesChange]=useNodesState<Node>(build());
 const built=useRef(membership);
 useEffect(()=>{if(built.current===membership)return;built.current=membership;setNodes(build());},[membership]);
 const boxes=useMemo(()=>new Map<string,Box>(nodes.map(n=>[n.id,{x:n.position.x,y:n.position.y,width:n.measured?.width??NODE.width,height:n.measured?.height??NODE.height}])),[nodes]);
 const routes=useMemo(()=>assignRoutes(groups.map(g=>({id:g.id,source:g.source,target:g.target})),boxes),[groups,boxes]);
 const walkTo=(target:string,via?:{id:string;label:string},select=true)=>{
  if(!center||target===center)return;const e=byId.get(target);if(!e)return;
  const steps:WalkStep[]=[];if(!step||step.doc!==docId||step.center!==center)steps.push({doc:docId,center,name:byId.get(center)?.name??center});
  steps.push({doc:docId,center:target,name:e.name,...(via?{via}:{})});props.onWalk(steps);if(select)props.onSelectEntity(target);
 };
 const viaFor=(target:string)=>{const g=view.edges.find(x=>(x.source===center&&x.target===target)||(x.target===center&&x.source===target));return g?{id:g.id,label:g.label}:undefined;};
 const rendered=useMemo(()=>nodes.map(n=>{const e=n.data.entity as Entity,kpis=kpiBadges?.get(e.name)??[],isCenter=n.id===center;
  return {...n,className:`neighborhood-node${isCenter?' center':''}${n.id===previous?' origin':''}${n.id===selected?' selected-entity':''}`,
   data:{...n.data,label:<div className={`node${e.kind==='Metric'?' kpi-node':''}`}>
    <small>{isCenter?<span className="center-tag"><Crosshair size={10}/>Center</span>:n.id===previous?<span className="origin-tag">Previous center</span>:null}{e.kind==='Metric'?<><Gauge size={10}/> KPI · Metric</>:e.kind}</small>
    <strong>{e.name}</strong>
    <span>{e.fields.length?`${e.fields.length} ${e.fields.length===1?'field':'fields'}`:e.description||'Select to inspect'}</span>
    <div className="node-actions">
     {!isCenter&&<button className="walk-button nodrag" aria-label={`Walk to ${e.name}`} onClick={ev=>{ev.stopPropagation();walkTo(e.id,viaFor(e.id));}}><ArrowRight size={12}/>Walk here</button>}
     {kpis.length>0&&<button className="kpi-badge nodrag" title={`KPIs: ${kpis.join(', ')}`} aria-label={`Open ${kpis.length} KPI${kpis.length===1?'':'s'} for ${e.name}`} onClick={ev=>{ev.stopPropagation();props.onOpenKpis?.(e.name);}}><Gauge size={10}/>{kpis.length===1?'KPI':`${kpis.length} KPIs`}</button>}
    </div>
   </div>}};}),[nodes,center,previous,selected,kpiBadges,view]);
 const labelText=(g:typeof groups[number])=>g.data.relationships.length>1?`${g.data.relationships.length} relationships`:g.label;
 const shownLabels=groups.filter(g=>labels||hovered===g.id||g.data.relationships.some(r=>r.id===selectedEdge));
 const labelAt=useMemo(()=>placeLabels(shownLabels.flatMap(g=>{const s=boxes.get(g.source),t=boxes.get(g.target),r=routes.get(g.id);if(!s||!t||!r)return [];return [{id:g.id,text:String(labelText(g)),points:routePoints(s.x+s.width,s.y+s.height/2,t.x,t.y+t.height/2,r).points}];}),[...boxes.values()]),[shownLabels.map(g=>g.id).join('|'),routes,boxes]);
 const visibleEdges=groups.map(g=>{
  const active=g.data.relationships.some(r=>r.id===selectedEdge),kind=g.source===center&&g.target!==center?'out':g.target===center&&g.source!==center?'in':g.source===center?'out':'lateral';
  const color=COLORS[kind as keyof typeof COLORS];
  return {...g,type:'relationship',data:{...g.data,route:routes.get(g.id),direction:kind,labelAt:labelAt.get(g.id)},label:labels||active||hovered===g.id?labelText(g):undefined,selected:active,interactionWidth:24,
   markerEnd:{type:MarkerType.ArrowClosed,color,width:14,height:14},className:`edge-${kind}`,
   style:{stroke:color,strokeOpacity:kind==='lateral'?0.55:0.85,strokeWidth:active?2.6:kind==='lateral'?1.1:1.5,strokeDasharray:kind==='lateral'?'5 4':undefined}};});
 // Fit once the nodes of a new membership are measured; refit when the canvas is resized.
 const canvas=useRef<HTMLDivElement>(null),{fitBounds,getViewport,setViewport}=useReactFlow(),[fitted,setFitted]=useState('');
 const held=useViewRestore(!!props.fullscreen?.active,()=>getViewport(),v=>{void setViewport(v);});
 const measured=nodes.length>0&&nodes.every(n=>n.measured?.width)&&JSON.stringify([center,nodes.map(n=>n.id)])===membership;
 // The fitted area is symmetric around the center node, so the center sits in the middle of the
 // canvas even when one side has more columns; it leaves room for the lanes above and below.
 const fitRef=useRef(()=>{});
 fitRef.current=()=>{const c=boxes.get(center??'');if(!c||!boxes.size)return;const all=[...boxes.values()],cx=c.x+c.width/2,cy=c.y+c.height/2;
  const halfW=Math.max(...all.map(b=>Math.max(cx-b.x,b.x+b.width-cx))),lanes=[...routes.values()].filter(r=>r.route==='lane'||r.route==='loop').length,halfH=Math.max(...all.map(b=>Math.max(cy-b.y,b.y+b.height-cy)))+Math.min(160,30+lanes*16);
  void fitBounds({x:cx-halfW,y:cy-halfH,width:2*halfW,height:2*halfH},{padding:0.06,duration:0});};
 useEffect(()=>{if(!measured||fitted===membership)return;const frame=requestAnimationFrame(()=>{fitRef.current();setFitted(membership);});return()=>cancelAnimationFrame(frame);},[measured,membership,fitted]);
 useEffect(()=>{if(!canvas.current)return;let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!held())fitRef.current();});});observer.observe(canvas.current);return()=>{cancelAnimationFrame(frame);observer.disconnect();};},[]);
 // Center picker (searchable; exact matches first) and toolbar search results.
 const projected=useMemo(()=>projectModel(entities,edges,technical).entities,[entities,edges,technical]);
 const [pick,setPick]=useState(''),[pickOpen,setPickOpen]=useState(false),[active,setActive]=useState(0);
 const pickResults=useMemo(()=>pick.trim()?searchEntities(projected,pick,30):[],[projected,pick]);
 const searchResults=useMemo(()=>search.trim()?searchEntities(projected,search,30):[],[projected,search]);
 const choose=(id:string)=>{const e=byId.get(id);if(!e)return;props.onWalk([{doc:docId,center:id,name:e.name}]);props.onSelectEntity(id);setPick('');setPickOpen(false);props.onClearSearch();};
 const centerEntity=center?byId.get(center):undefined;
 // The current center is on the trail unless it was reached without a step (default center, new file).
 const offTrail=!step||step.doc!==docId||step.center!==center;
 const cross=centerEntity&&props.crossFile?props.crossFile(centerEntity):[];
 const kpiFor=centerEntity?kpiBadges?.get(centerEntity.name)??[]:[];
 return <div className="neighborhood-graph">
  <div className="neighborhood-tools">
   <div className="center-picker" role="combobox" aria-expanded={pickOpen&&pickResults.length>0} aria-haspopup="listbox" aria-owns="center-picker-results">
    <LocateFixed size={14}/>
    <input aria-label="Find a center" aria-controls="center-picker-results" aria-autocomplete="list" placeholder={centerEntity?`Center: ${centerEntity.name}`:'Find a center'} value={pick}
     onChange={e=>{setPick(e.target.value);setPickOpen(true);setActive(0);}} onFocus={()=>setPickOpen(true)} onBlur={()=>setTimeout(()=>setPickOpen(false),150)}
     onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setActive(i=>Math.min(i+1,pickResults.length-1));}else if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(i-1,0));}else if(e.key==='Enter'&&pickResults[active]){e.preventDefault();choose(pickResults[active].id);}else if(e.key==='Escape'){setPick('');setPickOpen(false);}}}/>
    {pickOpen&&pickResults.length>0&&<ul id="center-picker-results" role="listbox" aria-label="Center candidates">{pickResults.map((e,i)=><li key={e.id} role="option" aria-selected={i===active} onMouseDown={ev=>{ev.preventDefault();choose(e.id);}}><strong>{e.name}</strong><small>{e.kind}</small></li>)}</ul>}
   </div>
   <span className="neighborhood-counts" role="status" aria-label="Neighbor counts">{centerEntity?<>{view.shown} of {view.total} neighbors{view.hidden>0&&<> · <strong>{view.hidden} hidden</strong></>}</>:'No center'}</span>
   {view.hidden>0&&<button onClick={()=>setLimit(l=>l+NEIGHBOR_PAGE)}>{Math.min(NEIGHBOR_PAGE,view.hidden)} more {Math.min(NEIGHBOR_PAGE,view.hidden)===1?'neighbor':'neighbors'}</button>}
   {limit>NEIGHBOR_PAGE&&<button onClick={()=>setLimit(NEIGHBOR_PAGE)}>Fewer</button>}
   {view.relationships.length>1&&<label>Relationship<select aria-label="Filter neighbors by relationship" value={relationship} onChange={e=>setRelationship(e.target.value)}><option value="">All ({view.relationships.reduce((n,r)=>n+r.count,0)})</option>{view.relationships.map(r=><option key={r.label} value={r.label}>{r.label} ({r.count})</option>)}</select></label>}
   <button onClick={()=>setLateral(!lateral)} aria-pressed={lateral} title="Relationships among the visible neighbors">Links between neighbors ({lateralCount}) {lateral?'on':'off'}</button>
   {view.technicalHidden>0||technical?<button onClick={()=>setTechnical(v=>!v)} aria-pressed={technical} title="OWL properties, restrictions and other RDF resources">Technical resources {technical?'shown':`hidden (${view.technicalHidden})`}</button>:null}
   <button onClick={()=>setLabels(v=>!v)} aria-pressed={labels}>Labels {labels?'on':'off'}</button>
   {kpiCount>0&&<button onClick={()=>setHideKpis(v=>!v)} aria-pressed={hideKpis} title={`${kpiCount} KPI nodes`}><Gauge size={14}/>KPIs {hideKpis?'hidden':'shown'}</button>}
   <button onClick={()=>{setNodes(build());setFitted('');}} title="Put every node back in its column">Re-center</button>
   <button onClick={props.onOverview}>Model overview</button><button onClick={props.onFullGraph}>Full graph</button>{props.fullscreen&&<FullscreenButton fullscreen={props.fullscreen}/>}
   <span className="neighborhood-legend" aria-hidden="true"><span className="in">Incoming</span><span className="out">Outgoing</span>{lateral&&<span className="lateral">Between neighbors</span>}</span>
  </div>
  <div className="neighborhood-links">
   <nav className="walk-trail" aria-label="Walk">
    <button aria-label="Back" title="Back" disabled={walk.index<=0} onClick={()=>props.onWalkTo(walk.index-1)}><ArrowLeft size={14}/></button>
    <button aria-label="Forward" title="Forward" disabled={walk.index>=walk.steps.length-1} onClick={()=>props.onWalkTo(walk.index+1)}><ArrowRight size={14}/></button>
    <ol>{walk.steps.map((s,i)=><li key={i}>{s.via&&<span className="via" title={`through ${s.via.label}`}>{s.via.label} →</span>}<button aria-current={i===walk.index&&!offTrail?'step':undefined} onClick={()=>props.onWalkTo(i)} title={s.doc===docId?s.name:`${s.name} in ${props.docLabel(s.doc)}`}>{s.name}{s.doc!==docId&&<small> · {props.docLabel(s.doc)}</small>}</button></li>)}{offTrail&&centerEntity&&<li><button aria-current="step" title="Current center">{centerEntity.name}</button></li>}</ol>
   </nav>
   {cross.map(t=><button key={t.doc+t.entity} onClick={()=>props.onCrossFile?.(t)} title={t.reason}><FileSymlink size={13}/>Continue in <strong>{t.file}</strong> · {t.name}</button>)}
   {kpiFor.length>0&&centerEntity&&<button onClick={()=>props.onOpenKpis?.(centerEntity.name)}><Gauge size={13}/>{kpiFor.length} KPI{kpiFor.length===1?'':'s'} for {centerEntity.name}</button>}
  </div>
  <div className="neighborhood-canvas" ref={canvas}>
   {search.trim()&&<div className="neighborhood-search" role="region" aria-label="Search results">{searchResults.length?<><small>Choose a center</small><ul role="listbox" aria-label="Matching entities">{searchResults.map(e=><li key={e.id} role="option" aria-selected={false}><button onClick={()=>choose(e.id)}><strong>{e.name}</strong><small>{e.kind}</small></button></li>)}</ul></>:<p>No entity matches “{search}”.</p>}</div>}
   {!view.entities.length?<div className="graph-empty" role="status">This model has no entities to display.</div>:<ReactFlow nodes={rendered} edges={visibleEdges} edgeTypes={relationshipEdgeTypes} minZoom={0.05} maxZoom={2} nodesConnectable={false} onNodesChange={onNodesChange}
    onNodeClick={(_,node)=>{if(node.id===center)props.onSelectEntity(node.id);else walkTo(node.id,viaFor(node.id));}}
    onEdgeClick={(_,edge)=>{const other=edge.source===center?edge.target:edge.target===center?edge.source:edge.target;walkTo(other,{id:edge.id,label:String((edge as any).data?.relationships?.[0]?.label??edge.label??'')},false);props.onSelectEdge(edge.id);}}
    onEdgeMouseEnter={(_,edge)=>setHovered(edge.id)} onEdgeMouseLeave={()=>setHovered('')}>
    <Background gap={22} size={1}/><Controls showInteractive={false}/>
   </ReactFlow>}
  </div>
 </div>;
}

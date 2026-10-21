import {ScrollStrip} from './ScrollStrip';
import type{GroupingOptions}from'./overview';
import{RoutedEdge}from'./RoutedEdge';
import{memo,useCallback,useEffect,useMemo,useRef,useState}from'react';
import{ReactFlow,getViewportForBounds,Background,Controls,MiniMap,Handle,Position,NodeToolbar,BaseEdge,BezierEdge,useNodesState,MarkerType,type NodeProps,type EdgeProps,type ReactFlowInstance}from'@xyflow/react';
import{SmartEdgeProvider,type SmartEdgeMetrics}from'@tisoap/react-flow-smart-edge';
import ELK from'elkjs/lib/elk-api.js';import elkWorkerUrl from'elkjs/lib/elk-worker.min.js?url';
import{Layers,Maximize,Maximize2,Minimize2,RefreshCw,Focus,Gauge}from'lucide-react';import{useViewRestore,type Fullscreen}from'./graph/fullscreen';import{modelOverview}from'./overview';import{groupRelationships}from'./graph-view';import{collapseAreas}from'./collapse';
import{layoutFullGraph,packNetwork}from'./full-layout';import type{Entity,Relationship}from'./model';
const sides=[['n',Position.Top],['e',Position.Right],['s',Position.Bottom],['w',Position.Left]]as const;
const EntityNode=memo(({data}:NodeProps)=><div className={`full-entity ${data.focused?'focused':''} ${data.collapsedArea?'collapsed':''} ${data.kind==='Metric'?'kpi-node':''}`} style={{'--entity-color':data.color}as any}>
 <NodeToolbar isVisible={!!data.tooltip} position={Position.Top}><div className="entity-tooltip">{String(data.name)}</div></NodeToolbar>
 {sides.flatMap(([id,position])=>[<Handle key={'s'+id} id={'source-'+id} type="source" position={position}/>,<Handle key={'t'+id} id={'target-'+id} type="target" position={position}/>])}
 <span className="entity-color"/>{data.kind==='Metric'&&<small className="kpi-kind"><Gauge size={11}/>KPI</small>}<strong>{String(data.name).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')}</strong>{!!data.collapsedArea&&<small>{String(data.internalCount??0)} internal relationships · click to expand</small>}
 {Array.isArray(data.kpis)&&data.kpis.length>0&&<span className="kpi-badge node-kpi-badge" title={`KPIs: ${data.kpis.join(', ')}`}><Gauge size={10}/>{data.kpis.length===1?'KPI':`${data.kpis.length} KPIs`}</span>}
</div>);
const AreaNode=memo(({data}:NodeProps)=><div className="full-area-title" title={String(data.name)}><span style={{background:String(data.color)}}/><strong>{String(data.name)}</strong><small>{String(data.count)} entities</small></div>);
const GraphEdge=memo((props:EdgeProps)=>{
 if(props.source===props.target){const{sourceX:x,sourceY:y,targetX:tx,targetY:ty}=props;return <BaseEdge id={props.id} path={`M ${x},${y} C ${x+70},${y-75} ${tx+70},${ty+75} ${tx},${ty}`} markerEnd={props.markerEnd} style={props.style} interactionWidth={24} label={props.label} labelX={x+55} labelY={y-35}/>;}
 if(!props.data?.routeDetailed)return <BezierEdge {...props}/>;
 return <RoutedEdge {...props}/>;
});
const nodeTypes={entity:EntityNode,businessArea:AreaNode};const edgeTypes={routed:GraphEdge};
const routingOptions={nodePadding:10,gridRatio:10};
type LayoutResult=Awaited<ReturnType<typeof layoutFullGraph>>;
const cache=new Map<string,LayoutResult>();
type Props={toolbarExtra?:React.ReactNode;grouping?:GroupingOptions;onGroupingChange?:(value:GroupingOptions)=>void;groupingError?:string;name:string;entities:Entity[];edges:Relationship[];selected:string;selectedEdge:string;search:string;onSelectEntity:(id:string)=>void;onSelectEdge:(id:string)=>void;onOverview:()=>void;onNeighborhood:()=>void;kpiBadges?:Map<string,string[]>;fullscreen?:Fullscreen};
const VALUE_KINDS=new Set(['ValueType','Built-in concept']);
const valuesKey=(name:string)=>'workbench:hide-value-types:'+name;
const kpisKey=(name:string)=>'workbench:hide-kpis:'+name;
function readHide(key:string){try{return localStorage.getItem(key)==='1';}catch{return false;}}
function writeHide(key:string,hide:boolean){try{if(hide)localStorage.setItem(key,'1');else localStorage.removeItem(key);}catch{}}
const readHideValues=(name:string)=>readHide(valuesKey(name)),writeHideValues=(name:string,hide:boolean)=>writeHide(valuesKey(name),hide);
export function FullGraph(props:Props){
 const container=useRef<HTMLDivElement|null>(null);
 const[viewport,setViewport]=useState({x:0,y:0,zoom:1});const[size,setSize]=useState({width:1200,height:650});
 const flow=useRef<ReactFlowInstance<any,any>|null>(null);const[nodes,setNodes,onNodesChange]=useNodesState<any>([]);
 const[algorithm,setAlgorithm]=useState<'network'|'layered'>('network');const[busy,setBusy]=useState(true);const[error,setError]=useState('');const[hover,setHover]=useState('');const[hoverEdge,setHoverEdge]=useState('');const[labels,setLabels]=useState(false);const[version,setVersion]=useState(0);const[routeMetrics,setRouteMetrics]=useState<SmartEdgeMetrics|null>(null);
 // Value types (including built-ins) can be hidden with their edges; the choice is remembered per model in this browser.
 const valueIds=useMemo(()=>new Set(props.entities.filter(e=>VALUE_KINDS.has(e.kind)).map(e=>e.id)),[props.entities]);
 const[hideValues,setHideValues]=useState(()=>readHideValues(props.name));
 const toggleValues=()=>setHideValues(v=>{writeHideValues(props.name,!v);return !v;});
 // KPI nodes (governed metrics) can be hidden the same way.
 const kpiIds=useMemo(()=>new Set(props.entities.filter(e=>e.kind==='Metric').map(e=>e.id)),[props.entities]);
 const[hideKpis,setHideKpis]=useState(()=>readHide(kpisKey(props.name)));
 const toggleKpis=()=>setHideKpis(v=>{writeHide(kpisKey(props.name),!v);return !v;});
 const hidden=useMemo(()=>new Set([...(hideValues?valueIds:[]),...(hideKpis?kpiIds:[])]),[hideValues,hideKpis,valueIds,kpiIds]);
 const graphEntities=useMemo(()=>hidden.size?props.entities.filter(e=>!hidden.has(e.id)):props.entities,[hidden,props.entities]);
 const graphEdges=useMemo(()=>hidden.size?props.edges.filter(e=>!hidden.has(e.source)&&!hidden.has(e.target)):props.edges,[hidden,props.edges]);
 const overview=useMemo(()=>modelOverview(graphEntities,graphEdges,props.name,false,props.grouping),[graphEntities,graphEdges,props.name,props.grouping]);
 const[collapsed,setCollapsed]=useState<Set<string>>(()=>overview.entities.length>250?new Set(overview.groups.map(g=>g.id)):new Set());
 const display=useMemo(()=>collapseAreas(overview,collapsed),[overview,collapsed]);
 const layoutGrouping=useMemo<GroupingOptions>(()=>({mode:'types',assignments:Object.fromEntries(display.entities.map(e=>[e.id,e.definition?.collapsedArea??overview.groupOf.get(e.id)!])),names:Object.fromEntries(overview.groups.map(g=>[g.id,g.name]))}),[display,overview]);
 const connections=useMemo(()=>groupRelationships(display.edges),[display]);const entityById=useMemo(()=>new Map(display.entities.map(e=>[e.id,e])),[display]);const groupById=useMemo(()=>new Map(overview.groups.map(g=>[g.id,g])),[overview]);
 useEffect(()=>{const el=container.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(el);return()=>observer.disconnect()},[]);
 const fit=useCallback(()=>{
  const instance=flow.current,canvas=container.current?.querySelector('.react-flow');if(!instance||!canvas)return;
  const current=instance.getNodes(),byId=new Map(current.map(n=>[n.id,n]));if(!current.length)return;
  const boxes=current.map(n=>{let x=n.position.x,y=n.position.y,parent=n.parentId;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);const p=byId.get(parent);if(!p)break;x+=p.position.x;y+=p.position.y;parent=p.parentId;}return{x,y,width:Number(n.style?.width??n.measured?.width??184),height:Number(n.style?.height??n.measured?.height??60)}});
  const x=Math.min(...boxes.map(n=>n.x)),y=Math.min(...boxes.map(n=>n.y)),width=Math.max(...boxes.map(n=>n.x+n.width))-x,height=Math.max(...boxes.map(n=>n.y+n.height))-y;
  const rect=canvas.getBoundingClientRect();if(rect.width&&rect.height)void instance.setViewport(getViewportForBounds({x,y,width,height},rect.width,rect.height,.001,1,.12),{duration:250});
 },[]);
 useEffect(()=>{
  let cancelled=false;let worker:Worker|undefined;let elk:{layout:(g:any)=>Promise<any>;terminateWorker:()=>void}|undefined;
  const key=JSON.stringify([algorithm,layoutGrouping,props.name,display.entities.map(e=>[e.id,e.name,e.kind]),display.edges.map(e=>[e.source,e.target])]);
  setBusy(true);setError('');setRouteMetrics(null);
  function apply(result:LayoutResult){if(cancelled)return;cache.set(key,result);if(cache.size>6)cache.delete(cache.keys().next().value!);
   setNodes(result.nodes.map(n=>{const group=n.group?groupById.get(n.group):groupById.get(overview.groupOf.get(n.id)!);return{id:n.id,type:n.group?'businessArea':'entity',position:{x:n.x,y:n.y},parentId:n.parentId,extent:n.parentId?'parent':undefined,draggable:true,selectable:!n.group,style:{width:n.width,height:n.height,...(n.group?{background:group!.color+'06',border:'1px solid '+group!.color+'45',borderRadius:16,zIndex:-1}:{zIndex:2})},data:n.group?{name:group!.name,color:group!.color,count:group!.entities.length}:{name:entityById.get(n.id)?.name,collapsedArea:entityById.get(n.id)?.definition?.collapsedArea,internalCount:display.internal.get(entityById.get(n.id)?.definition?.collapsedArea)?.length??0,color:group?.color??'#638c7b'}}}));setBusy(false);setTimeout(fit,150);
  }
  if(cache.has(key)&&!version){apply(cache.get(key)!);}else if(algorithm==='network'){
   worker=new Worker(new URL('./network-layout.worker.ts',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(data.error){if(!cancelled){setError(data.error);setBusy(false)}}else{elk=new ELK({algorithms:['layered','sporeOverlap'],workerFactory:()=>new Worker(elkWorkerUrl)});packNetwork(data.result,elk).then(apply).catch(e=>{if(!cancelled){setError(e.message);setBusy(false)}}).finally(()=>elk?.terminateWorker());}worker?.terminate()};worker.onerror=()=>{if(!cancelled){setError('Network layout failed');setBusy(false)}};worker.postMessage({entities:display.entities,edges:display.edges,name:props.name,grouping:layoutGrouping});
  }else{elk=new ELK({algorithms:['layered','sporeOverlap'],workerFactory:()=>new Worker(elkWorkerUrl)});layoutFullGraph(display.entities,display.edges,props.name,elk,layoutGrouping).then(apply).catch(e=>{if(!cancelled){setError(e.message);setBusy(false)}}).finally(()=>elk?.terminateWorker());}
  return()=>{cancelled=true;worker?.terminate();elk?.terminateWorker()};
 },[overview,display,algorithm,version,layoutGrouping]);
 // Full screen keeps the view it started from and puts it back on exit (FR-066).
 const held=useViewRestore(!!props.fullscreen?.active,()=>flow.current?.getViewport(),v=>{void flow.current?.setViewport(v);setViewport(v);});
 // Refit after the remaining canvas changes size (panels, monitor, wrapped controls).
 useEffect(()=>{
  const el=container.current?.querySelector('.react-flow');if(busy||!el)return;
  let timer:ReturnType<typeof setTimeout>;
  const observer=new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!held())fit();},100)});
  observer.observe(el);return()=>{observer.disconnect();clearTimeout(timer)};
 },[busy,fit]);
 useEffect(()=>{setCollapsed(overview.entities.length>250?new Set(overview.groups.map(g=>g.id)):new Set());},[props.grouping,hideValues,hideKpis]);
 const selectedGroup=overview.groupOf.get(props.selected);
 const focus=hover||(selectedGroup&&collapsed.has(selectedGroup)?'collapsed:'+selectedGroup:props.selected);
 const connected=useMemo(()=>{const ids=new Set<string>();if(focus){ids.add(focus);for(const e of display.edges)if(e.source===focus||e.target===focus){ids.add(e.source);ids.add(e.target)}}return ids;},[display,focus]);
 const renderedNodes=useMemo(()=>nodes.map(n=>n.type==='entity'?{...n,selected:n.id===props.selected,data:{...n.data,kind:entityById.get(n.id)?.kind,kpis:props.kpiBadges?.get(String(n.data.name)),focused:connected.has(n.id),tooltip:n.id===hover||n.id===props.selected},style:{...n.style,opacity:focus&&!connected.has(n.id) ? .32 : 1}}:n),[nodes,connected,focus,props.selected,hover,entityById,props.kpiBadges]);
 const positions=useMemo(()=>{const byId=new Map(nodes.map(n=>[n.id,n]));return new Map(nodes.filter(n=>n.type==='entity').map(n=>{const p=byId.get(n.parentId);return[n.id,{x:n.position.x+(p?.position.x??0),y:n.position.y+(p?.position.y??0),width:184,height:60}]}));},[nodes]);
 const dragging=nodes.some(n=>n.dragging);
 const edges=useMemo(()=>connections.map(e=>{const a=positions.get(e.source),b=positions.get(e.target);let source='e',target='w';if(a&&b){const dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)>Math.abs(dy)){source=dx>=0?'e':'w';target=dx>=0?'w':'e';}else{source=dy>=0?'s':'n';target=dy>=0?'n':'s';}}if(e.source===e.target){source='e';target='s';}
 const active=e.data.relationships.some(r=>r.id===props.selectedEdge);const adjacent=e.source===focus||e.target===focus;
 const visible=(p:any)=>p&&p.x*viewport.zoom+viewport.x>-220*viewport.zoom&&p.x*viewport.zoom+viewport.x<size.width+30&&p.y*viewport.zoom+viewport.y>-90*viewport.zoom&&p.y*viewport.zoom+viewport.y<size.height+30;
 const routeDetailed=!dragging&&e.source!==e.target&&(active||adjacent||(viewport.zoom>=.35&&visible(a)&&visible(b)));
 return{...e,data:{...e.data,algorithm,routeDetailed},type:'routed',sourceHandle:'source-'+source,targetHandle:'target-'+target,selected:active,label:labels||active||hoverEdge===e.id?(e.data.relationships.length>1?`${e.data.relationships.length} relationships`:e.label):undefined,markerEnd:{type:MarkerType.ArrowClosed,color:active||adjacent?'#247d65':'#8ca49b',width:13,height:13},zIndex:active?4:1,interactionWidth:24,style:{stroke:active||adjacent?'#247d65':'#98aaa3',strokeWidth:active?2:1.2,strokeOpacity:active||adjacent ? .95 : focus ? .07 : .48}};
 }),[connections,positions,props.selectedEdge,focus,labels,hoverEdge,algorithm,viewport,size,dragging]);
 useEffect(()=>{if(!props.search||busy)return;const match=overview.entities.find(e=>e.name.toLowerCase().includes(props.search.toLowerCase())||e.id.toLowerCase().includes(props.search.toLowerCase()));if(!match)return;const timer=setTimeout(()=>{void flow.current?.fitView({nodes:[{id:match.id}],padding:.8,maxZoom:1,duration:300})},250);return()=>clearTimeout(timer);},[props.search,busy,overview]);
 const selectedConnection=collapsed.size?connections.find(e=>e.data.relationships.some(r=>r.id===props.selectedEdge)):undefined;
 const originalById=useMemo(()=>new Map(props.edges.map(e=>[e.id,e])),[props.edges]);
 const originalEntities=useMemo(()=>new Map(props.entities.map(e=>[e.id,e])),[props.entities]);
 const metrics=useCallback((m:SmartEdgeMetrics)=>setRouteMetrics(m),[]);
 return <div className="full-graph" ref={container}>
  <ScrollStrip className="full-graph-tools">{props.toolbarExtra}<div className="layout-choice"><span>Layout</span><select aria-label="Graph layout" value={algorithm} onChange={e=>setAlgorithm(e.target.value as any)}><option value="network">Network · fCoSE</option><option value="layered">Layered · ELK</option></select></div><select aria-label="Zoom to group" title={overview.groupingLabel} defaultValue="" onChange={e=>{if(!e.target.value)fit();else void flow.current?.fitView({nodes:[{id:'area:'+e.target.value}],padding:.2,maxZoom:1.1,duration:350})}}><option value="">Whole model</option>{overview.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button onClick={fit}><Maximize size={13}/>Fit model</button><button onClick={()=>setVersion(v=>v+1)} disabled={busy}><RefreshCw size={13}/>Re-layout</button><button onClick={()=>setCollapsed(new Set(overview.groups.map(g=>g.id)))} disabled={collapsed.size===overview.groups.length}>Collapse areas</button><button onClick={()=>setCollapsed(new Set())} disabled={!collapsed.size}>Expand all</button><button onClick={()=>setLabels(v=>!v)} aria-pressed={labels}>Labels {labels?'on':'off'}</button>{valueIds.size>0&&<button onClick={toggleValues} aria-pressed={hideValues} title={`${valueIds.size} value types and their relationships`}>Value types {hideValues?'hidden':'shown'}</button>}{kpiIds.size>0&&<button onClick={toggleKpis} aria-pressed={hideKpis} title={`${kpiIds.size} KPI nodes and their relationships`}><Gauge size={14}/>KPIs {hideKpis?'hidden':'shown'}</button>}<button onClick={props.onOverview}><Layers size={13}/>Overview</button><button onClick={props.onNeighborhood}><Focus size={13}/>Neighborhood</button>{props.fullscreen&&<FullscreenButton fullscreen={props.fullscreen}/>}</ScrollStrip>
  {error?<div role="alert" className="full-graph-loading">{error}<button onClick={()=>setVersion(v=>v+1)}>Retry layout</button></div>:<SmartEdgeProvider nodes={renderedNodes} options={routingOptions} onMetrics={metrics}><ReactFlow nodes={renderedNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onMoveEnd={(_,v)=>setViewport(v)} onInit={instance=>{flow.current=instance;if(nodes.length)setTimeout(fit,80)}} onNodeClick={(_,n)=>{if(n.data.collapsedArea)setCollapsed(old=>{const next=new Set(old);next.delete(String(n.data.collapsedArea));return next});else if(n.type==='entity')props.onSelectEntity(n.id)}} onNodeDoubleClick={(_,n)=>{void flow.current?.fitView({nodes:[{id:n.parentId??n.id}],padding:.2,maxZoom:1,duration:300})}} onNodeMouseEnter={(_,n)=>{if(n.type==='entity')setHover(n.id)}} onNodeMouseLeave={()=>setHover('')} onEdgeMouseEnter={(_,e)=>setHoverEdge(e.id)} onEdgeMouseLeave={()=>setHoverEdge('')} onEdgeClick={(_,e)=>props.onSelectEdge(e.id)} nodesConnectable={false} edgesReconnectable={false} minZoom={.001} maxZoom={2} onlyRenderVisibleElements><Background gap={24} color="#dce6e0"/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={n=>String(n.data.color??'#a4c6b4')}/></ReactFlow></SmartEdgeProvider>}
  {selectedConnection&&selectedConnection.data.relationships.length>1&&<label className="graph-bundle-choice">{selectedConnection.data.relationships.length} relationships in this bundle<select aria-label="Graph bundle relationship" value={props.selectedEdge} onChange={e=>props.onSelectEdge(e.target.value)}>{selectedConnection.data.relationships.map(r=>{const original=originalById.get(r.id)!;return <option key={r.id} value={r.id}>{originalEntities.get(original.source)?.name} · {r.label} → {originalEntities.get(original.target)?.name}</option>})}</select></label>}
  {busy&&<div className="full-graph-loading" role="status">Arranging {display.entities.length} graph nodes…</div>}
  <div className="full-graph-status" data-entity-count={overview.entities.length} data-relationship-count={overview.links.length}>{overview.entities.length} entities · {overview.links.length} relationships · {connections.length} bundled connections{hideValues&&<> · {valueIds.size} value types hidden</>}{hideKpis&&<> · {kpiIds.size} KPIs hidden</>}{collapsed.size>0&&<strong>{collapsed.size} areas collapsed · click a count to expand</strong>}<span>Double-click an area to zoom · Drag to adjust</span>{edges.some(e=>e.data.routeDetailed)?<small>Routing: {routeMetrics?.executedOn==='worker'?'background worker':'pending'}{routeMetrics?.deferred?' · routes pending':''}</small>:<small>Overview paths · zoom in for obstacle routing</small>}</div>
 </div>;
}
export const FullscreenButton=({fullscreen:f}:{fullscreen:Fullscreen})=><button className="fullscreen-toggle" onClick={f.toggle} aria-pressed={f.active} aria-label={f.active?'Exit full screen':'Enter full screen'} title={f.active?'Exit full screen (Esc)':'Full screen (F)'}>{f.active?<Minimize2 size={13}/>:<Maximize2 size={13}/>}{f.active&&'Exit full screen'}</button>;

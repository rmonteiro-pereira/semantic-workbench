import React,{memo,useCallback,useEffect,useMemo,useReducer,useRef,useState} from 'react';
import {ReactFlow,Background,Controls,BaseEdge,getBezierPath,type EdgeProps,type ReactFlowInstance} from '@xyflow/react';
import {ArrowLeft,ArrowRight,Maximize2,Minimize2,Scan,Search,SlidersHorizontal,X} from 'lucide-react';
import {LineageLegend,type LegendKind} from '../graph/LineageLegend';
import {edgeSvgStyle,type EdgeKind} from '../graph/edge-styles';
import {walkReducer,emptyWalk,currentStep,canBack,canForward} from '../graph/walk';
import type {Fullscreen} from '../graph/fullscreen';
import {Modal} from '../projects/Modal';
import {around,closure,findAssets,pageColumns,selectionNodes,cardOfNode,moreRowId,type LineageGraph,type LineageCard} from './lineage';
import {LineageCardNode,type CardData} from './LineageCard';
import {elkGraph,positionsOf,type LayoutCard,type LayoutEdge,type LayoutResult} from './lineage-layout';
import ELK from 'elkjs/lib/elk-api.js';import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import './odcs.css';
// The lineage canvas (FR-001–FR-010, ui-contracts "Lineage canvas"): cards for the assets around a
// centre, column-to-column lines in the shared legend's styles, a selected column's whole path
// emphasised and everything else dimmed, Find assets, a Steps control, paging, walking with a
// trail, fit and full screen. Layout runs in a worker (ELK, ports per row).
const nodeTypes={card:LineageCardNode};
const LineageEdge=memo((p:EdgeProps)=>{
 const d=p.data as {kind:EdgeKind;onPath:boolean;dim:boolean;count?:number;ambiguous?:boolean;from:string;to:string};
 const [path,lx,ly]=getBezierPath(p);
 return <g className={`lineage-edge${d.onPath?' on-path':''}${d.dim?' dim':''}`} data-edge-kind={d.kind} data-on-path={d.onPath?'true':'false'} data-from={d.from} data-to={d.to} data-count={d.count??1}>
  <BaseEdge id={p.id} path={path} style={{...edgeSvgStyle(d.kind,d.onPath),opacity:d.dim?0.14:1,...(d.onPath?{stroke:undefined}:{})}} interactionWidth={12}/>
  {d.count&&d.count>1&&<text x={lx} y={ly-4} className="lineage-bundle" textAnchor="middle">{d.count} lines</text>}
 </g>;
});
const edgeTypes={lineage:LineageEdge};
const BUNDLE_AT=8;
const KIND_SHORT:Record<string,string>={object:'Contract object',dataset:'Field',metric:'Metric',external:'External'};
type Props={graph:LineageGraph;center:string;ariaLabel?:string;fullscreen?:Fullscreen;compact?:boolean;storageKey?:string;
 onCenterChange?:(id:string)=>void;onOpenAsset?:(card:LineageCard)=>void;onNeighborhood?:(card:LineageCard)=>void;groupOf?:(card:LineageCard)=>{name:string;color:string}|undefined};
const readSteps=(key?:string)=>{try{const v=key?Number(localStorage.getItem(key)):NaN;return v>=1&&v<=5?v:1;}catch{return 1;}};
// Lays out in ELK's worker (elk-api + elk-worker, as the Graph view does); returns the latest
// positions (the previous ones stay while a new layout runs).
function useLayout(cards:LayoutCard[],edges:LayoutEdge[],key:string){
 const elk=useRef<{layout:(g:any)=>Promise<any>;terminateWorker:()=>void}|null>(null),seq=useRef(0);const [result,setResult]=useState<{key:string;layout:LayoutResult}|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{elk.current=new ELK({workerFactory:()=>new Worker(elkWorkerUrl)}) as any;return()=>elk.current?.terminateWorker();},[]);
 useEffect(()=>{const e=elk.current;if(!e)return;const id=++seq.current;setBusy(true);
  e.layout(elkGraph(cards,edges)).then(r=>{if(id!==seq.current)return;setBusy(false);setResult({key,layout:positionsOf(r)});}).catch(()=>{if(id===seq.current)setBusy(false);});},[key]);
 return {result,busy};
}
export function LineageCanvas({graph,center:initial,ariaLabel='Lineage graph',fullscreen,compact=false,storageKey,onCenterChange,onOpenAsset,onNeighborhood,groupOf}:Props){
 const [walk,dispatch]=useReducer(walkReducer,emptyWalk);
 useEffect(()=>{dispatch({type:'reset',step:{doc:graph.contract,center:initial,name:graph.cards.get(initial)?.label??initial}});},[initial,graph.contract]);
 // A centre that is gone from the graph (the file changed under the walk) falls back to the initial one.
 const walked=currentStep(walk)?.center,center=walked&&graph.cards.has(walked)?walked:graph.cards.has(initial)?initial:graph.cards.keys().next().value??'';
 useEffect(()=>{if(center)onCenterChange?.(center);},[center]);
 const [steps,setStepsState]=useState(()=>readSteps(storageKey));
 const setSteps=(n:number)=>{setStepsState(n);try{if(storageKey)localStorage.setItem(storageKey,String(n));}catch{}};
 const [selected,setSelected]=useState(''),[pages,setPages]=useState<Record<string,number>>({}),[expanded,setExpanded]=useState<Set<string>>(new Set());
 const [query,setQuery]=useState(''),[showResults,setShowResults]=useState(false),[options,setOptions]=useState(false);
 const [showMetrics,setShowMetrics]=useState(true),[showExternal,setShowExternal]=useState(true);
 useEffect(()=>{setSelected('');setExpanded(new Set());setPages({});},[center]);
 // Which cards: the centre's reach, plus the neighbours of expanded cards.
 const reach=useMemo(()=>{
  const base=around(graph,center,steps),cards=new Set(base.cards);
  for(const id of expanded){const r=around(graph,id,1);for(const c of r.cards)if(graph.cards.get(c)?.kind==='object'||graph.cards.get(c)?.kind==='external')cards.add(c);}
  const hidden=new Map<string,number>();for(const [id,n] of base.hidden)if(!expanded.has(id))hidden.set(id,n);
  for(const c of [...cards]){const k=graph.cards.get(c)?.kind;if((!showMetrics&&k==='metric'&&c!==center)||(!showExternal&&k==='external'))cards.delete(c);}
  return {cards,hidden};
 },[graph,center,steps,expanded,showMetrics,showExternal]);
 const path=useMemo(()=>selected?closure(graph,selectionNodes(graph,selected)):null,[graph,selected]);
 // Rows per card: the current page plus pinned path rows.
 const paged=useMemo(()=>{
  const out=new Map<string,ReturnType<typeof pageColumns>>();
  for(const id of reach.cards){const c=graph.cards.get(id)!;const pinned=new Set(path?c.columns.filter(x=>path.nodes.has(x.id)).map(x=>x.id):[]);out.set(id,pageColumns(c,pages[id]??0,pinned));}
  return out;
 },[graph,reach,pages,path]);
 // Lines between shown cards, attached to visible rows; many lines between two cards bundle.
 const lines=useMemo(()=>{
  const out=new Map<string,{id:string;from:string;to:string;fromCard:string;toCard:string;kind:EdgeKind;onPath:boolean;count:number;edges:number[]}>();
  graph.edges.forEach((e,i)=>{
   const fc=cardOfNode(graph,e.from),tc=cardOfNode(graph,e.to);if(!reach.cards.has(fc)||!reach.cards.has(tc)||fc===tc&&e.from===e.to)return;
   const from=paged.get(fc)!.port(e.from),to=paged.get(tc)!.port(e.to),key=`${from}>${to}>${e.kind}`,on=!!path?.edges.has(i);
   const x=out.get(key);if(x){x.count++;x.edges.push(i);x.onPath||=on;}else out.set(key,{id:key,from,to,fromCard:fc,toCard:tc,kind:e.kind,onPath:on,count:1,edges:[i]});
  });
  // Bundle per card pair when nothing on it is selected (edge case "a column read by many fields").
  const pairs=new Map<string,typeof out extends Map<any,infer V>?V[]:never>();for(const l of out.values()){const k=`${l.fromCard}>${l.toCard}>${l.kind}`;(pairs.get(k)??pairs.set(k,[]).get(k)!).push(l);}
  const result:typeof out extends Map<any,infer V>?V[]:never=[];
  for(const [k,ls] of pairs){if(ls.length>=BUNDLE_AT&&!ls.some(l=>l.onPath)){const f=ls[0];result.push({id:'bundle:'+k,from:f.fromCard,to:f.toCard,fromCard:f.fromCard,toCard:f.toCard,kind:f.kind,onPath:false,count:ls.reduce((a,l)=>a+l.count,0),edges:ls.flatMap(l=>l.edges)});}else result.push(...ls);}
  return result;
 },[graph,reach,paged,path]);
 const layoutCards=useMemo<LayoutCard[]>(()=>[...reach.cards].map(id=>{const p=paged.get(id)!;return {id,rows:p.rows.map(r=>r.id),pager:p.pages>1,more:p.hidden>0};}),[reach,paged]);
 const layoutEdges=useMemo<LayoutEdge[]>(()=>lines.map(l=>({id:l.id,from:l.from,to:l.to,fromCard:l.fromCard,toCard:l.toCard})),[lines]);
 const layoutKey=useMemo(()=>JSON.stringify([layoutCards,layoutEdges.map(e=>e.id)]),[layoutCards,layoutEdges]);
 const {result,busy}=useLayout(layoutCards,layoutEdges,layoutKey);
 const select=useCallback((id:string)=>setSelected(s=>s===id?'':id),[]);
 const walkTo=useCallback((id:string,via?:string)=>{const c=graph.cards.get(id);if(!c)return;dispatch({type:'push',step:{doc:graph.contract,center:id,name:c.label,...(via?{via:{id:via,label:via.slice(via.lastIndexOf('/')+1)}}:{})}});},[graph]);
 const nodes=useMemo(()=>{
  if(!result)return [];
  return [...reach.cards].filter(id=>result.layout.positions[id]).map(id=>{
   const c=graph.cards.get(id)!,p=paged.get(id)!,g=groupOf?.(c);
   const data:CardData={card:c,rows:p.rows,pinned:p.pinned,page:p.page,pages:p.pages,more:p.hidden,hiddenNeighbours:reach.hidden.get(id)??0,selected,onPath:path?.nodes??null,center:id===center,tint:g?.color,expanded:expanded.has(id),
    onSelect:select,onPage:(cid,n)=>setPages(x=>({...x,[cid]:n})),onWalk:cid=>walkTo(cid,selected||undefined),onExpand:cid=>setExpanded(s=>new Set([...s,cid])),onCollapse:cid=>setExpanded(s=>{const n=new Set(s);n.delete(cid);return n;}),onOpenAsset};
   return {id,type:'card',position:result.layout.positions[id],data:data as unknown as Record<string,unknown>,draggable:false,selectable:false,style:{pointerEvents:'all' as const}};
  });
 },[result,reach,paged,selected,path,center,expanded,select,walkTo,onOpenAsset,groupOf]);
 const edges=useMemo(()=>lines.filter(l=>result?.layout.positions[l.fromCard]&&result.layout.positions[l.toCard]).map(l=>({id:l.id,source:l.fromCard,target:l.toCard,sourceHandle:l.from+':out',targetHandle:l.to+':in',type:'lineage',data:{kind:l.kind,onPath:l.onPath,dim:!!path&&!l.onPath,count:l.count,from:l.from,to:l.to}})),[lines,result,path]);
 const flow=useRef<ReactFlowInstance<any,any>|null>(null),fitted=useRef('');
 // First view of a centre: the whole reach when it stays readable, otherwise the centre card at a
 // readable zoom (pan and Fit show the rest).
 const firstView=useCallback(async()=>{const f=flow.current;if(!f)return;await f.fitView({padding:0.12,maxZoom:1,duration:0});
  if(f.getZoom()<0.55){const n=f.getNode(center);if(n){const w=n.measured?.width??272,h=n.measured?.height??200;f.setCenter(n.position.x+w/2+180,n.position.y+h/2,{zoom:0.7,duration:0});}}},[center]);
 useEffect(()=>{if(!result||!nodes.length)return;const k=center+'|'+steps;if(fitted.current===k)return;fitted.current=k;requestAnimationFrame(()=>void firstView());},[result,center,steps,nodes.length]);
 // The path panel takes room beside the canvas: fit again when it opens or closes.
 // React Flow learns the new width from a ResizeObserver, so the fit waits for it.
 const panelOpen=!!path;useEffect(()=>{if(!result)return;const t=setTimeout(()=>flow.current?.fitView({padding:0.12,maxZoom:1,duration:150}),120);return()=>clearTimeout(t);},[panelOpen]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&selected&&!(e.target as HTMLElement).closest('dialog,input'))setSelected('');};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[selected]);
 const results=useMemo(()=>findAssets(graph,query),[graph,query]);
 const choose=(h:{id:string;card:string})=>{setQuery('');setShowResults(false);if(h.card!==center)walkTo(h.card);if(h.id!==h.card)setTimeout(()=>setSelected(h.id),0);};
 // The selected path in lineage order: upstream cards first (by layout x), then rows in order.
 const summary=useMemo(()=>{
  if(!path)return [];
  const items:{id:string;label:string;x:number;y:number;kind:string}[]=[];
  for(const n of path.nodes){const cid=cardOfNode(graph,n),c=graph.cards.get(cid);if(!c||!reach.cards.has(cid))continue;const col=c.columns.find(x=>x.id===n);if(!col&&n!==cid)continue;if(!col&&c.columns.length&&path.nodes.size>1&&n===cid&&selected!==cid)continue;const pos=result?.layout.positions[cid]??{x:0,y:0};items.push({id:n,label:col?`${c.label}.${col.path}`:c.label,x:pos.x,y:pos.y+(col?c.columns.indexOf(col):0),kind:c.kind});}
  return items.sort((a,b)=>a.x-b.x||a.y-b.y);
 },[path,graph,reach,result,selected]);
 const legendKinds=useMemo(()=>{const k=new Set<LegendKind>();for(const id of reach.cards){const c=graph.cards.get(id)!;k.add(c.kind==='external'?'external':c.kind as LegendKind);if(c.kind==='dataset')k.add('field');}return (['object','dataset','field','metric','external'] as LegendKind[]).filter(x=>k.has(x));},[reach,graph]);
 const centerCard=graph.cards.get(center),selectedCard=selected?graph.cards.get(cardOfNode(graph,selected)):undefined;
 return <section className={`lineage-view${compact?' compact':''}`} role="region" aria-label={ariaLabel}>
  <div className="lineage-toolbar">
   <div className="lineage-search" role="combobox" aria-expanded={showResults&&results.length>0} aria-haspopup="listbox" aria-owns="lineage-asset-results">
    <Search size={14}/><input aria-label="Find assets" placeholder="Find assets…" value={query} aria-autocomplete="list" aria-controls="lineage-asset-results" onFocus={()=>setShowResults(true)} onBlur={()=>setTimeout(()=>setShowResults(false),150)} onChange={e=>{setQuery(e.target.value);setShowResults(true);}} onKeyDown={e=>{if(e.key==='Enter'&&results[0]){e.preventDefault();choose(results[0]);}if(e.key==='Escape'){setQuery('');setShowResults(false);}}}/>
    {showResults&&query&&<ul id="lineage-asset-results" role="listbox" aria-label="Asset results">{results.length?results.map(h=><li key={h.id} role="option" aria-selected={false} onMouseDown={e=>{e.preventDefault();choose(h);}}><span className={`asset-kind k-${h.kind}`}>{h.kind==='field'?'Field':h.kind==='object'?'Object':h.kind==='dataset'?'Dataset':h.kind==='metric'?'Metric':'External'}</span><span className="asset-name">{h.label}</span></li>):<li role="option" aria-disabled="true" aria-selected={false} className="none">No asset matches “{query}”</li>}</ul>}
   </div>
   <label className="lineage-steps"><span>Steps</span><select aria-label="Steps" value={steps} onChange={e=>setSteps(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <span className="lineage-toolbar-spacer"/>
   <button onClick={()=>setOptions(true)} title="Lineage options"><SlidersHorizontal size={14}/><span className="tool-label">Lineage options…</span></button>
   <button onClick={()=>flow.current?.fitView({padding:0.12,maxZoom:1,duration:200})} aria-label="Fit" title="Fit the graph"><Scan size={14}/></button>
   {fullscreen&&<button onClick={fullscreen.toggle} aria-label={fullscreen.active?'Exit full screen':'Full screen'} title="Full screen (F)">{fullscreen.active?<Minimize2 size={14}/>:<Maximize2 size={14}/>}</button>}
  </div>
  <div className="lineage-trail" aria-label="Walk">
   <button aria-label="Back" disabled={!canBack(walk)} onClick={()=>dispatch({type:'back'})}><ArrowLeft size={13}/></button>
   <button aria-label="Forward" disabled={!canForward(walk)} onClick={()=>dispatch({type:'forward'})}><ArrowRight size={13}/></button>
   <ol>{walk.steps.map((s,i)=><li key={i}><button aria-current={i===walk.index?'step':undefined} onClick={()=>dispatch({type:'jump',index:i})} title={s.via?`via ${s.via.label}`:undefined}>{s.via&&<small>via {s.via.label} →</small>}{s.name}</button></li>)}</ol>
  </div>
  <div className="lineage-stage">
   <div className="lineage-flow">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={i=>{flow.current=i;}} onPaneClick={()=>setSelected('')} minZoom={0.08} maxZoom={1.6} nodesConnectable={false} proOptions={{hideAttribution:false}} onlyRenderVisibleElements>
     <Background gap={22} size={1}/><Controls showInteractive={false} showFitView={false}/>
    </ReactFlow>
    {busy&&!nodes.length&&<p className="lineage-busy" role="status">Laying out the lineage…</p>}
   </div>
   {path&&summary.length>0&&<aside className="lineage-path" role="region" aria-label="Selected path">
    <header><strong>Selected path</strong><button aria-label="Clear the selected path" onClick={()=>setSelected('')}><X size={13}/></button></header>
    <ol>{summary.map(s=><li key={s.id} className={`k-${s.kind}${s.id===selected?' current':''}`}><button onClick={()=>setSelected(s.id)}><small>{KIND_SHORT[s.kind]??s.kind}</small><span>{s.label}</span></button></li>)}</ol>
    {selectedCard&&(selectedCard.kind==='dataset'||selectedCard.kind==='metric')&&onNeighborhood&&<button className="lineage-path-action" onClick={()=>onNeighborhood(selectedCard)}>Continue in Neighborhood</button>}
   </aside>}
  </div>
  <div className="lineage-foot">
   <LineageLegend kinds={legendKinds}/>
   <small className="lineage-reading" title="Lines are matched by declared names: foreign keys as declared (drawn from the referenced column to the referencing one), semantic datasets whose source is an object's physical name or name, fields whose expressions read a column, and metrics over those fields. This is the workbench's reading, not part of ODCS or Ossie.">Workbench reading of declared names · {reach.cards.size} of {graph.cards.size} assets{graph.unmatchedDatasets>0?` · ${graph.unmatchedDatasets} ${graph.unmatchedDatasets===1?'dataset reads':'datasets read'} none of this contract's objects`:''}</small>
  </div>
  {options&&<Modal title="Lineage options" size="small" onCancel={()=>setOptions(false)} footer={<button className="primary" onClick={()=>setOptions(false)}>Done</button>}>
   <p>The view shows {centerCard?.label??'the centre'} with every field and metric that reads it, and contract objects up to the chosen number of foreign-key steps away.</p>
   <label><span>Foreign-key steps</span><select aria-label="Foreign-key steps" value={steps} onChange={e=>setSteps(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <label className="option-check"><input type="checkbox" checked={showMetrics} onChange={e=>setShowMetrics(e.target.checked)}/>Show metrics</label>
   <label className="option-check"><input type="checkbox" checked={showExternal} onChange={e=>setShowExternal(e.target.checked)}/>Show references to other contracts</label>
  </Modal>}
 </section>;
}

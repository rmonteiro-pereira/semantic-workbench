import {odcsForeignKeys} from '../odcs';
import {ansiExpression,expressionRefs,metricDependencies} from '../metrics/deps';
import {readMetricExtension} from '../metrics/extension';
// Shared readers for the column-level lineage below: semantic models in a project file, physical
// names of objects and columns. Matching is by declared names and parsed expressions only.
export type ProjectFile={path:string;data:any};
const list=(v:unknown):any[]=>Array.isArray(v)?v:v===undefined||v===null?[]:[v];
const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const objectId=(file:string,name:string)=>`object:${file}#${name}`;
// Semantic models in a file: flat, legacy `semantic_model` lists, and models embedded in a
// consolidated ontology's `ontology_mappings`.
function models(f:ProjectFile):{file:string;key:string;model:any}[]{
 const d=f.data;if(!isObject(d)||d.kind==='DataContract')return [];
 if(Array.isArray(d.ontology))return list(d.ontology_mappings).flatMap((om:any,i:number)=>isObject(om?.semantic_model)?[{file:f.path,key:`ontology_mappings/${i}`,model:om.semantic_model}]:[]);
 if(Array.isArray(d.datasets))return [{file:f.path,key:'',model:d}];
 return list(d.semantic_model).flatMap((m:any,i:number)=>isObject(m)&&Array.isArray(m.datasets)?[{file:f.path,key:`semantic_model/${i}`,model:m}]:[]);
}
const physical=(o:any)=>typeof o?.physicalName==='string'?o.physicalName:String(o?.name);
const columnOf=(p:any)=>typeof p?.physicalName==='string'?p.physicalName:String(p?.name);

// ---------------------------------------------------------------------------------------------
// v0.3.0 column-level lineage (FR-001–FR-004, research R1, data-model LineageGraph). Cards are
// contract objects, semantic datasets that read them, the metrics over their fields (and metrics
// on those metrics) and external stubs; lines go column to column, left to right: referenced key →
// foreign key → semantic field reading the column → metric → metric. All matching is the
// workbench's reading of declared names and parsed expressions; nothing is run or fetched.
import {odcsExternalForeignKeys} from '../odcs';
import {flattenProperties} from './odcs-diff';
import {propertyBadges,badge,type BadgeInfo} from '../PropertyBadges';
import type {LineageEdgeKind,MappingEdgeKind} from '../graph/edge-styles';
export type CardKind='object'|'dataset'|'metric'|'external'|'concept';
export type LineageColumn={id:string;path:string;type?:string;badges:BadgeInfo[];fk?:string[]};
// Mapping cards (src/mappings/mapping-graph.ts) also carry card badges (Unmapped) and resolver findings.
export type LineageCard={id:string;kind:CardKind;label:string;file:string;detail?:string;columns:LineageColumn[];group?:string;governed?:boolean;badges?:BadgeInfo[];findings?:string[];missing?:boolean};
// `via`: rows a mapping link passes through (highlighted with it); `bindings`: resolver binding ids.
export type ColumnEdge={from:string;to:string;kind:LineageEdgeKind|MappingEdgeKind;source:{file:string;path:(string|number)[]};ambiguous?:boolean;label?:string;via?:string[];bindings?:string[]};
export type LineageGraph={contract:string;cards:Map<string,LineageCard>;edges:ColumnEdge[];revision:string;unmatchedDatasets:number};
const datasetCardId=(file:string,key:string,name:string)=>`dataset:${file}#${key}/${name}`;
const metricCardId=(file:string,key:string,name:string)=>`metric:${file}#${key}/${name}`;
export const columnId=(card:string,path:string)=>`${card}/${path}`;
// The card a node (column or card) belongs to. Ids contain file paths, so this is a lookup, not a parse.
export function cardOfNode(graph:LineageGraph,node:string){if(graph.cards.has(node))return node;let owners=columnOwner.get(graph);if(!owners){owners=new Map();for(const c of graph.cards.values())for(const x of c.columns)owners.set(x.id,c.id);columnOwner.set(graph,owners);}return owners.get(node)??node;}
const columnOwner=new WeakMap<LineageGraph,Map<string,string>>();
export function buildLineage(files:ProjectFile[],contractPath:string,revision=''):LineageGraph{
 const contract=files.find(f=>f.path===contractPath)?.data,schema=list(contract?.schema);
 const cards=new Map<string,LineageCard>(),edges:ColumnEdge[]=[],seen=new Set<string>();
 const edge=(e:ColumnEdge)=>{const k=`${e.from}>${e.to}>${e.kind}`;if(seen.has(k))return;seen.add(k);edges.push(e);};
 const keys=odcsForeignKeys(contract);
 // Foreign-key targets per object column, for FK badges.
 const fkTargets=new Map<string,string[]>();
 for(const k of keys)k.fromColumns.forEach((c,i)=>{const id=columnId(objectId(contractPath,String(schema[k.from]?.name)),c),t=`${schema[k.to]?.name}.${k.toColumns[i]}`;fkTargets.set(id,[...(fkTargets.get(id)??[]),t]);});
 schema.forEach((o:any)=>{
  if(!isObject(o))return;const id=objectId(contractPath,String(o.name));
  const columns=flattenProperties(o.properties).map(p=>{const cid=columnId(id,p.path),fk=fkTargets.get(cid);return {id:cid,path:p.path,type:typeof p.property.logicalType==='string'?p.property.logicalType:typeof p.property.physicalType==='string'?p.property.physicalType:undefined,badges:propertyBadges(p.property,fk),...(fk?{fk}:{})};});
  cards.set(id,{id,kind:'object',label:String(o.name),file:contractPath,detail:physical(o),columns});
});
 // Referenced (parent) column → referencing (child) column (C2), pairwise by position.
 for(const k of keys){const parent=objectId(contractPath,String(schema[k.to]?.name)),child=objectId(contractPath,String(schema[k.from]?.name));k.fromColumns.forEach((c,i)=>edge({from:columnId(parent,k.toColumns[i]),to:columnId(child,c),kind:'foreign-key',source:{file:contractPath,path:k.path},label:k.label}));}
 for(const x of odcsExternalForeignKeys(contract)){
  const id=`external:${x.reference}`;if(!cards.has(id))cards.set(id,{id,kind:'external',label:x.reference,file:x.reference.split('#')[0],detail:'Reference to another contract; not resolved',columns:[]});
  const child=objectId(contractPath,String(schema[x.from]?.name));for(const c of x.fromColumns)edge({from:id,to:columnId(child,c),kind:'foreign-key',source:{file:contractPath,path:x.path}});
 }
 // Declared transforms: source objects → the property (card to column).
 schema.forEach((o:any,i:number)=>{if(!isObject(o))return;const id=objectId(contractPath,String(o.name));
  const walk=(props:unknown,prefix:string,path:(string|number)[])=>list(props).forEach((p:any,j:number)=>{if(!isObject(p))return;const at=prefix+String(p.name),pp=[...path,'properties',j];
   for(const src of list(p.transformSourceObjects).filter((s:unknown):s is string=>typeof s==='string')){
    const match=schema.find((x:any)=>isObject(x)&&(x.name===src||physical(x)===src));
    let from:string;if(match)from=objectId(contractPath,String(match.name));else{from=`external:${src}`;if(!cards.has(from))cards.set(from,{id:from,kind:'external',label:src,file:'',detail:'Declared transform source; not in this contract',columns:[]});}
    edge({from,to:columnId(id,at),kind:'transform',source:{file:contractPath,path:[...pp,'transformSourceObjects']},label:'declared transform'});
   }
   walk(p.properties,at+'.',pp);});
  walk(o.properties,'',['schema',i]);});
 // Semantic models: datasets whose `source` is an object's physical name or name.
 let unmatched=0;
 const metricEdges:{from:string;to:string;source:{file:string;path:(string|number)[]}}[]=[];
 for(const f of files)for(const {file,key,model} of models(f)){
  const datasets=list(model.datasets).filter(isObject),metrics=list(model.metrics).filter(isObject);
  const names=new Set<string>(metrics.map((m:any)=>m.name).filter((n:unknown)=>typeof n==='string'));
  const base=key?key.split('/').map(s=>/^\d+$/.test(s)?Number(s):s):[];
  const metricCard=(m:any)=>{const id=metricCardId(file,key,String(m.name));if(!cards.has(id)){const ext=readMetricExtension(m).value;cards.set(id,{id,kind:'metric',label:String(ext?.label??m.name),file,detail:ansiExpression(m),columns:[],governed:!!ext});}return id;};
  const fieldColumns=new Map<string,string>();
  datasets.forEach((d:any,di:number)=>{
   const source=list(d.source)[0],readers=schema.filter((o:any)=>isObject(o)&&(physical(o)===source||o.name===source));
   if(!readers.length){unmatched++;return;}
   const id=datasetCardId(file,key,String(d.name)),pk=new Set(list(d.primary_key).map(String));
   const fields=list(d.fields).filter(isObject);
   cards.set(id,{id,kind:'dataset',label:String(d.name),file,detail:String(source),columns:fields.map((fd:any)=>({id:columnId(id,String(fd.name)),path:String(fd.name),type:typeof fd.datatype==='string'?fd.datatype:undefined,badges:pk.has(String(fd.name))?[badge('pk')]:[]}))});
   const ambiguous=readers.length>1;
   for(const o of readers){
    const objId=objectId(contractPath,String(o.name)),props=new Map(list(o.properties).filter(isObject).map((p:any)=>[columnOf(p),String(p.name)]));
    fields.forEach((fd:any,fi:number)=>{
     const sql=ansiExpression(fd),cols=sql?[...new Set(expressionRefs(sql).map(r=>r.column))]:[String(fd.name)];
     for(const c of cols){const p=props.get(c);if(p)edge({from:columnId(objId,p),to:columnId(id,String(fd.name)),kind:'reads',source:{file,path:[...base,'datasets',di,'fields',fi]},...(ambiguous?{ambiguous:true}:{})});}
    });
   }
   fields.forEach((fd:any)=>fieldColumns.set(`${d.name}.${fd.name}`,columnId(id,String(fd.name))));
  });
  // Field → metric (aggregates); metric → metric (uses).
  metrics.forEach((m:any,mi:number)=>{
   const sql=ansiExpression(m)??'',refs=expressionRefs(sql);
   for(const r of refs){
    const col=r.table!==null?fieldColumns.get(`${r.table}.${r.column}`):datasets.length===1&&!names.has(r.column)?fieldColumns.get(`${datasets[0].name}.${r.column}`):undefined;
    if(col)edge({from:col,to:metricCard(m),kind:'aggregates',source:{file,path:[...base,'metrics',mi]}});
   }
   for(const dep of metricDependencies(sql,names))metricEdges.push({from:metricCardId(file,key,dep),to:metricCardId(file,key,String(m.name)),source:{file,path:[...base,'metrics',mi]}});
  });
  // Metrics on metrics: only those whose dependency is already part of the lineage, to any depth.
  let added=true;while(added){added=false;for(const e of metricEdges)if(cards.has(e.from)&&!seen.has(`${e.from}>${e.to}>uses`)){const m=metrics.find((x:any)=>metricCardId(file,key,String(x.name))===e.to);if(!m)continue;metricCard(m);edge({...e,kind:'uses'});added=true;}}
 }
 const g:LineageGraph={contract:contractPath,cards,edges,revision,unmatchedDatasets:unmatched};
 const owners=new Map<string,string>();for(const c of cards.values())for(const col of c.columns)owners.set(col.id,c.id);columnOwner.set(g,owners);
 return g;
}
// Adjacency over node ids (columns and column-less cards).
const adjacency=new WeakMap<LineageGraph,{out:Map<string,number[]>;in:Map<string,number[]>}>();
function adj(g:LineageGraph){let a=adjacency.get(g);if(!a){a={out:new Map(),in:new Map()};g.edges.forEach((e,i)=>{(a!.out.get(e.from)??a!.out.set(e.from,[]).get(e.from)!).push(i);(a!.in.get(e.to)??a!.in.set(e.to,[]).get(e.to)!).push(i);});adjacency.set(g,a);}return a;}
// The nodes a selection stands for: a column, or every column of a card plus the card itself.
export function selectionNodes(g:LineageGraph,id:string){const c=g.cards.get(id);return c?[id,...c.columns.map(x=>x.id)]:[id];}
// Path highlight (FR-005): every node and edge upstream ('up'), downstream ('down') or both of the
// given nodes. 'both' is ancestors plus descendants, never siblings. Cycles terminate.
export function closure(g:LineageGraph,ids:string[],direction:'up'|'down'|'both'='both'){
 const a=adj(g),nodes=new Set<string>(ids),edgeSet=new Set<number>();
 const walk=(dir:'up'|'down')=>{const seenHere=new Set<string>(ids),queue=[...ids];while(queue.length){const n=queue.shift()!;for(const i of (dir==='down'?a.out:a.in).get(n)??[]){edgeSet.add(i);const e=g.edges[i],next=dir==='down'?e.to:e.from;if(!seenHere.has(next)){seenHere.add(next);nodes.add(next);queue.push(next);}}}};
 if(direction!=='up')walk('down');if(direction!=='down')walk('up');
 return {nodes,edges:edgeSet};
}
// Which cards a view centred on `center` shows (FR-008, research R4): the centre; the contract
// objects within `steps` foreign-key hops of the centre's objects, either way; and everything
// upstream and downstream of the centre along the other line kinds (fields, metrics, metrics on
// metrics, declared transforms). Cards one more foreign-key hop away are counted as hidden on the
// visible card they connect to ("+N more").
export function around(g:LineageGraph,center:string,steps=1){
 const card=(n:string)=>cardOfNode(g,n),shown=new Set<string>([center]);
 const nodes=selectionNodes(g,center);
 // Upstream and downstream along every line kind except foreign keys.
 const flowOnly=(start:string[])=>{const a=adj(g),seenN=new Set(start),q=[...start];const cardsOut=new Set<string>();while(q.length){const n=q.shift()!;for(const [map,dir] of [[a.out,'down'],[a.in,'up']] as const)for(const i of map.get(n)??[]){const e=g.edges[i];if(e.kind==='foreign-key')continue;const next=dir==='down'?e.to:e.from;cardsOut.add(card(next));if(!seenN.has(next)){seenN.add(next);q.push(next);}}}return cardsOut;};
 for(const c of flowOnly(nodes))shown.add(c);
 // Foreign-key reach from the objects among the shown cards that the centre itself reads from.
 const objects=[...shown].filter(c=>g.cards.get(c)?.kind==='object'||g.cards.get(c)?.kind==='external');
 const fkNeighbours=(c:string)=>{const out=new Set<string>();for(const col of selectionNodes(g,c)){for(const i of adj(g).out.get(col)??[]){const e=g.edges[i];if(e.kind==='foreign-key')out.add(card(e.to));}for(const i of adj(g).in.get(col)??[]){const e=g.edges[i];if(e.kind==='foreign-key')out.add(card(e.from));}}out.delete(c);return out;};
 let frontier=objects;
 for(let s=0;s<steps;s++){const next:string[]=[];for(const c of frontier)for(const n of fkNeighbours(c))if(!shown.has(n)){shown.add(n);next.push(n);}frontier=next;}
 const hidden=new Map<string,number>();
 for(const c of shown){let n=0;if(g.cards.get(c)?.kind==='object'||g.cards.get(c)?.kind==='external')for(const x of fkNeighbours(c))if(!shown.has(x))n++;if(n)hidden.set(c,n);}
 return {cards:shown,hidden};
}
// The mapping canvas' reach (research R19): cards within `steps` lines of the centre in any
// direction, plus the cards holding rows a shown link passes through; neighbours one line further
// are counted as hidden on the card they connect to.
export function aroundHops(g:LineageGraph,center:string,steps=1){
 const card=(n:string)=>cardOfNode(g,n),links=new Map<string,Set<string>>();
 const link=(a:string,b:string)=>{if(a===b)return;(links.get(a)??links.set(a,new Set()).get(a)!).add(b);(links.get(b)??links.set(b,new Set()).get(b)!).add(a);};
 for(const e of g.edges)link(card(e.from),card(e.to));
 const shown=new Set([center]);let frontier=[center];
 for(let s=0;s<steps;s++){const next:string[]=[];for(const c of frontier)for(const n of links.get(c)??[])if(!shown.has(n)){shown.add(n);next.push(n);}frontier=next;}
 for(const e of g.edges)if(e.via&&shown.has(card(e.from))&&shown.has(card(e.to)))for(const v of e.via)shown.add(card(v));
 const hidden=new Map<string,number>();for(const c of shown){let n=0;for(const x of links.get(c)??[])if(!shown.has(x))n++;if(n)hidden.set(c,n);}
 return {cards:shown,hidden};
}
// Paging (FR-006, research R3): ten columns per page; columns on the highlighted path are pinned
// above the page; an edge to a column that is not shown attaches to the card's "more" row.
export const PAGE_SIZE=10;
export const moreRowId=(card:string)=>`${card}/#more`;
export function pageColumns(card:LineageCard,page:number,pinned:Set<string>,size=PAGE_SIZE){
 const pages=Math.max(1,Math.ceil(card.columns.length/size)),p=Math.min(Math.max(0,page),pages-1);
 const onPage=card.columns.slice(p*size,p*size+size),pinnedRows=card.columns.filter(c=>pinned.has(c.id)&&!onPage.includes(c));
 const rows=[...pinnedRows,...onPage],visible=new Set(rows.map(r=>r.id));
 const hidden=card.columns.length-rows.length;
 return {page:p,pages,rows,pinned:pinnedRows.map(r=>r.id),hidden,port:(id:string)=>visible.has(id)||!card.columns.some(c=>c.id===id)?id:moreRowId(card.id)};
}
// The asset search (FR-007): objects (name, physical name), datasets, fields and metrics; exact
// names first, then prefixes, then substrings; separators are ignored ("invoice line").
export function findAssets(g:LineageGraph,query:string,limit=20){
 const norm=(s:string)=>s.toLowerCase().replace(/[\s_.-]+/g,'');const q=norm(query);if(!q)return [];
 const hits:{id:string;card:string;label:string;kind:string;rank:number}[]=[];
 const rank=(s:string)=>{const n=norm(s);return n===q?0:n.startsWith(q)?1:n.includes(q)?2:-1;};
 for(const c of g.cards.values()){
  const best=[c.label,c.detail??''].map(rank).filter(x=>x>=0);if(best.length)hits.push({id:c.id,card:c.id,label:c.label,kind:c.kind,rank:Math.min(...best)});
  if(c.kind==='dataset'||c.kind==='concept')for(const col of c.columns){const x=rank(col.path);if(x>=0)hits.push({id:col.id,card:c.id,label:`${c.label}.${col.path}`,kind:'field',rank:x+0.5});}
 }
 return hits.sort((a,b)=>a.rank-b.rank||a.label.length-b.label.length||a.label.localeCompare(b.label)).slice(0,limit);
}
// The card a contract opens on: the object with the most lineage lines touching it.
export function defaultCenter(g:LineageGraph){
 const count=new Map<string,number>();for(const e of g.edges)for(const n of [e.from,e.to]){const c=cardOfNode(g,n);if(g.cards.get(c)?.kind==='object')count.set(c,(count.get(c)??0)+1);}
 const objects=[...g.cards.values()].filter(c=>c.kind==='object');
 return objects.reduce((best,c)=>(count.get(c.id)??0)>(count.get(best?.id??'')??-1)?c:best,objects[0] as LineageCard|undefined)?.id??'';
}

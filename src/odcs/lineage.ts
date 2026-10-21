import {odcsForeignKeys} from '../odcs';
import {ansiExpression,expressionRefs,metricDependencies} from '../metrics/deps';
import {readMetricExtension} from '../metrics/extension';
// Lineage of one ODCS schema object (FR-057 Lineage tab), read from the project's files: foreign-key
// neighbors in the same contract, and downstream the semantic datasets whose `source` is the
// object's physical name, their fields that read its properties, the metrics over those fields and
// the metrics built on them. Metrics with a workbench KPI extension are KPIs. Matching is by
// declared names and parsed expressions, never by running anything.
export type LineageKind='object'|'dataset'|'field'|'metric'|'kpi';
export type LineageNode={id:string;kind:LineageKind;label:string;file:string;depth:number;detail?:string;external?:boolean};
export type LineageEdge={from:string;to:string;kind:'foreign-key'|'source'|'reads'|'aggregates'|'uses';label?:string;properties?:string[]};
export type PropertyLineage={fields:string[];metrics:string[]};
export type Lineage={center:string;nodes:LineageNode[];edges:LineageEdge[];properties:Record<string,PropertyLineage>;maxDepth:number};
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
export function odcsLineage(files:ProjectFile[],contractPath:string,objectName:string,depth=2):Lineage{
 const contract=files.find(f=>f.path===contractPath)?.data,schema=list(contract?.schema).filter(isObject);
 const nodes=new Map<string,Omit<LineageNode,'depth'>>(),edges:LineageEdge[]=[],properties:Record<string,PropertyLineage>={};
 const node=(n:Omit<LineageNode,'depth'>)=>{if(!nodes.has(n.id))nodes.set(n.id,n);return n.id;};
 const edge=(e:LineageEdge)=>{if(!edges.some(x=>x.from===e.from&&x.to===e.to&&x.kind===e.kind&&x.label===e.label))edges.push(e);};
 const center=objectId(contractPath,objectName);
 // Contract objects and their foreign keys (both directions).
 for(const o of schema)node({id:objectId(contractPath,o.name),kind:'object',label:String(o.name),file:contractPath,detail:physical(o)});
 if(!nodes.has(center))throw Error(`${objectName} is not an object of ${contractPath}.`);
 for(const k of odcsForeignKeys(contract))edge({from:objectId(contractPath,schema[k.from]?.name),to:objectId(contractPath,schema[k.to]?.name),kind:'foreign-key',label:k.label});
 // Downstream: every semantic model of the project, for every contract object it reads.
 const metricsOf=new Map<string,string[]>();
 for(const f of files)for(const {file,key,model} of models(f)){
  const datasets=list(model.datasets).filter(isObject),metrics=list(model.metrics).filter(isObject);
  const names=new Set<string>(metrics.map((m:any)=>m.name).filter((n:unknown)=>typeof n==='string'));
  const base=`${file}#${key}`,metricId=(n:string)=>`metric:${base}/${n}`;
  for(const m of metrics){const ext=readMetricExtension(m).value;node({id:metricId(m.name),kind:ext?'kpi':'metric',label:ext?.label??String(m.name),file,detail:ansiExpression(m)});}
  for(const m of metrics)for(const dep of metricDependencies(ansiExpression(m)??'',names))edge({from:metricId(dep),to:metricId(m.name),kind:'uses'});
  for(const d of datasets){
   const source=list(d.source)[0],readers=schema.filter(o=>physical(o)===source||o.name===source);
   if(!readers.length)continue;
   const datasetId=node({id:`dataset:${base}/${d.name}`,kind:'dataset',label:String(d.name),file,detail:String(source)});
   for(const o of readers){
    edge({from:objectId(contractPath,o.name),to:datasetId,kind:'source'});
    const columns=new Map(list(o.properties).filter(isObject).map((p:any)=>[columnOf(p),String(p.name)]));
    for(const fd of list(d.fields).filter(isObject)){
     const sql=ansiExpression(fd),cols=sql?[...new Set(expressionRefs(sql).map(r=>r.column))]:[String(fd.name)];
     const props=cols.map(c=>columns.get(c)).filter((p):p is string=>!!p);if(!props.length)continue;
     const fieldId=node({id:`field:${base}/${d.name}.${fd.name}`,kind:'field',label:`${d.name}.${fd.name}`,file,detail:sql});
     edge({from:datasetId,to:fieldId,kind:'reads',properties:props});
     if(o.name===objectName)for(const p of props){(properties[p]??={fields:[],metrics:[]}).fields.push(`${d.name}.${fd.name}`);}
     // Metrics that aggregate this field: `dataset.field`, or a bare field name when the model has one dataset.
     for(const m of metrics){
      const refs=expressionRefs(ansiExpression(m)??'');
      if(!refs.some(r=>r.column===fd.name&&(r.table===d.name||(r.table===null&&datasets.length===1&&!names.has(r.column)))))continue;
      edge({from:fieldId,to:metricId(m.name),kind:'aggregates'});
      const targets=metricsOf.get(fieldId)??[];targets.push(metricId(m.name));metricsOf.set(fieldId,targets);
     }
    }
   }
  }
 }
 // Breadth-first distance from the center: foreign keys either way, everything else downstream.
 const dist=new Map<string,number>([[center,0]]),queue=[center];
 while(queue.length){
  const id=queue.shift()!,dd=dist.get(id)!;
  for(const e of edges){
   const next=e.from===id?e.to:e.kind==='foreign-key'&&e.to===id?e.from:null;
   if(next&&!dist.has(next)){dist.set(next,dd+1);queue.push(next);}
  }
 }
 // Property-level lineage: the metrics reachable from each property's fields, at any depth.
 const downstream=(from:string,seen=new Set<string>()):string[]=>{for(const e of edges)if(e.from===from&&(e.kind==='aggregates'||e.kind==='uses')&&!seen.has(e.to)){seen.add(e.to);downstream(e.to,seen);}return [...seen];};
 for(const [p,l] of Object.entries(properties)){
  const ids=new Set<string>();for(const f of l.fields)for(const [fid] of metricsOf)if(fid.endsWith('/'+f))for(const m of downstream(fid))ids.add(m);
  l.metrics=[...ids].map(id=>nodes.get(id)!.label).sort();l.fields=[...new Set(l.fields)].sort();
 }
 // `maxDepth` is how far the lineage reaches, so the depth control knows its range.
 const kept=[...nodes.values()].filter(n=>dist.has(n.id)&&dist.get(n.id)!<=depth).map(n=>({...n,depth:dist.get(n.id)!}));
 const ids=new Set(kept.map(n=>n.id));
 return {center,nodes:kept,edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),properties,maxDepth:Math.max(...dist.values())};
}

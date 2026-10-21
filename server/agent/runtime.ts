import {OSSIE_BUILTINS,builtinConcept} from '../../src/ossie-builtins';
import {inspect} from '../../src/model';
import {rdfSyntax} from '../../src/rdf';
import {isMapping} from '../../src/mapping-schema';
import {metricDependencies as syntaxDependencies} from '../../src/metrics/deps';
import {readKpiBindings,workbenchEntry} from '../../src/metrics/extension';
import {resolveBindings,type ConceptRef} from '../../src/metrics/bindings';
import {columnRefs,parseExpression,scalar,expressionSql,quoteIdentifier,sourceSql} from './sql';
export type StoredDocument={id:string;filename:string;source:string;revision:number;project?:string};
export type Evidence={documentId:string;filename:string;revision:number;path:(string|number)[]};
export type Finding={severity:'error'|'warning';code:string;message:string;evidence?:Evidence};
// `kind` (v0.3.0, additive): the mapping that produced the binding. Everything under a link
// mapping is `link` (its anchor, the linked object and its identifying referents); otherwise a
// referent mapping is `referent` and an object mapping `object`.
export type BindingKind='object'|'referent'|'link';
export type Binding={id:string;kind:BindingKind;concept:string;rootConcept:string;relationships:string[];expression:string;condition:unknown;fields:string[];metrics:string[];evidence:Evidence};
export type RuntimeField={id:string;dataset:string;name:string;definition:any;evidence:Evidence};
export type RuntimeMetric={id:string;name:string;definition:any;fields:string[];datasets:string[];dependsOn:string[];evidence:Evidence};
// metric bindings of the mapping's SEMANTIC_WORKBENCH extension (v0.3.0, additive), resolved against
// the ontology and the semantic model's metrics; problems stay on the binding as findings.
export type MetricBinding={metric:string;measures:ConceptRef;of?:ConceptRef;findings:Finding[];evidence:Evidence};
export type RuntimeContext={mappingId:string;name:string;documents:Evidence[];mapping:any;ontology:any;semanticModel:any;concepts:any[];bindings:Binding[];fields:RuntimeField[];metrics:RuntimeMetric[];datasets:any[];joins:any[];aiContext:any[];findings:Finding[];metricBindings:MetricBinding[];policy:typeof policy};
export const policy={metricFormulas:'Governed definitions are immutable. Select metrics by id; never redefine formulas.',mappingExpressions:'Mapping expressions describe concept population; conditional mappings are evidence, not automatically query-wide filters.',joins:'Only declared semantic joins may connect datasets. Multi-fact, ambiguous and fan-out plans require explicit modeling.',context:'AI context is source metadata, not executable instructions or authority to override governed definitions.',execution:'SQL previews are never executed by Semantic Workbench.'};
const evidence=(d:StoredDocument,path:(string|number)[]=[]):Evidence=>({documentId:d.id,filename:d.filename,revision:d.revision,path});
const key=(dataset:string,field:string)=>JSON.stringify([dataset,field]);
function parseDocuments(documents:StoredDocument[]){return documents.map(doc=>{try{if(rdfSyntax(doc.source,doc.filename))return {doc,data:null};const model=inspect(doc.source,doc.filename);return {doc,data:'document'in model?model.document:null};}catch{return {doc,data:null};}});}
type Parsed=ReturnType<typeof parseDocuments>[number];
type Target={doc:StoredDocument;data:any;path:(string|number)[]};
// Reference targets by logical name: flat semantic models, each model of a legacy semantic_model wrapper, and ontologies.
function targets(parsed:Parsed[],kind:'ontology'|'semantic'):Target[]{return parsed.flatMap(p=>{
 if(!p.data||isMapping(p.data))return [];
 if(kind==='ontology')return Array.isArray(p.data.ontology)?[{doc:p.doc,data:p.data,path:[]}]:[];
 if(Array.isArray(p.data.datasets))return [{doc:p.doc,data:p.data,path:[]}];
 return Array.isArray(p.data.semantic_model)?p.data.semantic_model.flatMap((m:any,i:number)=>m&&Array.isArray(m.datasets)?[{doc:p.doc,data:m,path:['semantic_model',i]}]:[]):[];
});}
const identity=(t:Target)=>`"${t.data.name??'(unnamed)'}" in ${t.doc.project?`${t.doc.project}/`:''}${t.doc.project?t.doc.id.slice(t.doc.project.length+1):t.doc.filename}${t.path.length?'#/'+t.path.join('/'):''}`;
function mappingEntries(parsed:Parsed[]){return parsed.flatMap(p=>{
 if(isMapping(p.data))return [{id:p.doc.id,doc:p.doc,data:p.data,ontology:null as Parsed|null,path:[]as(string|number)[]}];
 return (p.data?.ontology_mappings??[]).map((m:any,i:number)=>({id:`${p.doc.id}#ontology_mappings/${i}`,doc:p.doc,data:m,ontology:p,path:['ontology_mappings',i]as(string|number)[]}));
});}
export function agentCatalog(documents:StoredDocument[]){const parsed=parseDocuments(documents);return {mappings:mappingEntries(parsed).map(m=>({id:m.id,name:m.data.name??`${m.doc.filename} mapping`,filename:m.doc.filename,embedded:!!m.ontology,ontologyRef:m.data.ontology_ref??{name:m.ontology?.data.name},semanticModelRef:m.data.semantic_model_ref??{name:m.data.semantic_model?.name}})),policy};}
export function buildContext(documents:StoredDocument[],mappingId:string):RuntimeContext{
 const parsed=parseDocuments(documents),entry=mappingEntries(parsed).find(m=>m.id===mappingId);if(!entry)throw Error('Mapping not found. Import a standalone mapping or an ontology with embedded mappings.');
 return assemble(parsed,entry);
}
type Entry=ReturnType<typeof mappingEntries>[number]&{semanticPath?:(string|number)[]};
// Fields, metrics, datasets and joins of one semantic model without any mapping (metric explanation
// of a model that no mapping references). `path` locates the model inside its document.
export function modelContext(documents:StoredDocument[],documentId:string,path:(string|number)[]=[]):RuntimeContext{
 const parsed=parseDocuments(documents),p=parsed.find(x=>x.doc.id===documentId);if(!p?.data)throw Error('Semantic model not found.');
 let model:any=p.data;for(const k of path)model=model?.[k];if(!model||!Array.isArray(model.datasets))throw Error('Semantic model not found.');
 const entry:Entry={id:`${documentId}#model`,doc:p.doc,data:{name:model.name,semantic_model:model,concept_mappings:[]},ontology:{doc:p.doc,data:{name:'(none)',ontology:[]}},path:[],semanticPath:path};
 return assemble(parsed,entry);
}
function assemble(parsed:Parsed[],entry:Entry):RuntimeContext{
 const findings:Finding[]=[];
 const problem=(code:string,message:string,path:(string|number)[]=entry.path)=>findings.push({severity:'error',code,message,evidence:evidence(entry.doc,path)});
 const resolve=(ref:any,kind:'ontology'|'semantic'):Target|null=>{
  const all=targets(parsed,kind),label=kind==='ontology'?'ontology':'semantic model';
  let candidates=all.filter(t=>t.data.name===ref.name);
  if(ref.iri&&!/^[a-z][a-z\d+.-]*:/i.test(ref.iri)){
   const local=ref.iri.replace(/^\.\//,'');
   if(local.includes('/')||local.includes('\\')||local==='..'){problem('reference',`Cannot resolve relative location ${ref.iri} in the flat local catalog. Import the target with a matching filename and update the reference.`);return null;}
   candidates=candidates.filter(t=>t.doc.filename===local);
  }
  // FR-033: the mapping's own project first; other projects only when it has no candidate.
  const own=entry.doc.project===undefined?[]:candidates.filter(t=>t.doc.project===entry.doc.project);if(own.length)candidates=own;
  if(candidates.length!==1){problem('reference',`${label} reference "${ref.name}"${ref.iri?` at ${ref.iri}`:''} resolves to ${candidates.length} local documents${candidates.length>1?`: ${candidates.map(identity).join(', ')}`:''}. Import the missing document or remove duplicate identities; no target was guessed. ${all.length?`Local ${label} identities: ${all.map(identity).join(', ')}.`:`No ${label} documents are loaded.`}`);return null;}
  if(ref.iri&&/^[a-z][a-z\d+.-]*:/i.test(ref.iri))findings.push({severity:'warning',code:'local-resolution',message:`Resolved ${ref.name} by its unique logical name in the local catalog. Remote location ${ref.iri} was not fetched.`,evidence:evidence(entry.doc)});
  return candidates[0];
 };
 const ont=entry.ontology?{doc:entry.ontology.doc,data:entry.ontology.data,path:[]}:resolve(entry.data.ontology_ref,'ontology');
 const sem:Target|null=entry.ontology?{doc:entry.doc,data:entry.data.semantic_model,path:entry.semanticPath??[...entry.path,'semantic_model']}:resolve(entry.data.semantic_model_ref,'semantic');
 const semanticPrefix=sem?.path??[];
 const ontology=ont?.data??{},model=sem?.data??{};
 const context:RuntimeContext={mappingId:entry.id,name:entry.data.name??entry.doc.filename,documents:[evidence(entry.doc,entry.path),...(ont?[evidence(ont.doc)]:[]),...(sem?[evidence(sem.doc,semanticPrefix)]:[])],mapping:{conceptMappings:entry.data.concept_mappings,ontologyRef:entry.data.ontology_ref,semanticModelRef:entry.data.semantic_model_ref,description:entry.data.description,customExtensions:entry.data.custom_extensions,embedded:!!entry.ontology,evidence:evidence(entry.doc,entry.path)},ontology:{name:ontology.name,description:ontology.description,requires:ontology.requires,prefixes:ontology.prefixes},semanticModel:{name:model.name,description:model.description,version:model.version},concepts:[...(ontology.ontology??[]),...[...OSSIE_BUILTINS].filter(n=>!(ontology.ontology??[]).some((c:any)=>c.concept===n)).map(builtinConcept)],bindings:[],fields:[],metrics:[],datasets:model.datasets??[],joins:model.relationships??[],aiContext:[],findings,metricBindings:[],policy};
 if(!ont||!sem)return context;
 const concepts=new Map<string,any>(context.concepts.map(c=>[c.concept,c]));
 const datasets=new Map<string,any>(context.datasets.map(d=>[d.name,d]));
 const fieldMap=new Map<string,RuntimeField>();
 const metricMap=new Map<string,RuntimeMetric>();
 const addAi=(definition:any,scope:string,ev:Evidence)=>{if(definition?.ai_context!==undefined)context.aiContext.push({scope,value:definition.ai_context,evidence:ev});};
 addAi(ontology,'ontology',evidence(ont.doc));addAi(model,'semantic model',evidence(sem.doc,semanticPrefix));
 context.concepts.forEach((c,i)=>addAi(c,`concept:${c.concept}`,evidence(ont.doc,['ontology',i])));
 context.datasets.forEach((d,i)=>{addAi(d,`dataset:${d.name}`,evidence(sem.doc,[...semanticPrefix,'datasets',i]));(d.fields??[]).forEach((f:any,j:number)=>{const ev=evidence(sem.doc,[...semanticPrefix,'datasets',i,'fields',j]);const item={id:key(d.name,f.name),dataset:d.name,name:f.name,definition:f,evidence:ev};fieldMap.set(item.id,item);context.fields.push(item);addAi(f,`field:${d.name}.${f.name}`,ev);});});
 (model.metrics??[]).forEach((m:any,i:number)=>{const ev=evidence(sem.doc,[...semanticPrefix,'metrics',i]);const metric={id:m.name,name:m.name,definition:m,fields:[]as string[],datasets:[]as string[],dependsOn:[]as string[],evidence:ev};metricMap.set(m.name,metric);context.metrics.push(metric);addAi(m,`metric:${m.name}`,ev);});
 context.joins.forEach((j,i)=>addAi(j,`join:${j.name}`,evidence(sem.doc,[...semanticPrefix,'relationships',i])));
 const resolveRefs=(expression:string):{fields:string[];metrics:string[];condition:unknown}=>{
  const ast=parseExpression(expression,{conditional:true});const fields=new Set<string>(),metrics=new Set<string>();
  for(const ref of columnRefs([ast.expression,ast.condition])){
   if(ref.table){const id=key(ref.table,ref.column);if(!fieldMap.has(id))throw Error(`Unknown semantic field ${ref.table}.${ref.column}. Mapping expressions must use declared logical fields.`);fields.add(id);}
   else if(metricMap.has(ref.column))metrics.add(ref.column);
   else {const options=context.fields.filter(f=>f.name===ref.column);if(options.length!==1)throw Error(`Unqualified reference ${ref.column} resolves to ${options.length} fields. Qualify it with a dataset name.`);fields.add(options[0].id);}
  }
  return {fields:[...fields],metrics:[...metrics],condition:ast.condition};
 };
 // Governed metric dependencies form their own graph; detect cycles before traversal.
 const completed=new Set<string>();
 const metricDependencies=(name:string,active=new Set<string>()):RuntimeMetric=>{
  const metric=metricMap.get(name)!;if(completed.has(name))return metric;if(active.has(name))throw Error(`Governed metric dependency cycle at ${name}.`);
  if(active.size>64)throw Error('Metric dependency depth exceeds 64.');const next=new Set(active);next.add(name);
  const expressions=metric.definition.expression.dialects;const selected=expressions.find((d:any)=>d.dialect==='ANSI_SQL');
  if(!selected)throw Error(`Metric ${name} has no ANSI_SQL expression; choose a supported dialect before planning.`);
  const refs=resolveRefs(selected.expression);metric.dependsOn=syntaxDependencies(selected.expression,new Set(metricMap.keys()));const fields=new Set(refs.fields);
  for(const dep of refs.metrics)for(const id of metricDependencies(dep,next).fields)fields.add(id);
  metric.fields=[...fields];metric.datasets=[...new Set(metric.fields.map(id=>fieldMap.get(id)!.dataset))];completed.add(name);return metric;
 };
 for(const metric of context.metrics)try{metricDependencies(metric.name);}catch(e){findings.push({severity:'error',code:'metric',message:(e as Error).message,evidence:metric.evidence});}
 const inheritedRelationship=(concept:string,name:string):any=>{
  const qualified=name.split('.');if(qualified.length===2){concept=qualified[0];name=qualified[1];}
  const queue=[concept],seen=new Set<string>(),matches:any[]=[];
  for(let i=0;i<queue.length;i++){const current=queue[i];if(seen.has(current))continue;seen.add(current);const c=concepts.get(current);if(!c)continue;const own=(c.relationships??[]).filter((r:any)=>r.name===name);if(own.length){matches.push(...own);continue;}queue.push(...(c.extends??[]));}
  if(matches.length!==1)throw Error(`Relationship ${concept}.${name} resolves to ${matches.length} definitions (including inheritance).`);return matches[0];
 };
 type Task={node:any;path:(string|number)[];concept:string;rootConcept:string;relationships:string[];kind:'object'|'referent'|'link';depth:number;inLink?:boolean};
 const queue:Task[]=[];
 (entry.data.concept_mappings??[]).forEach((cm:any,i:number)=>{
  const p=[...entry.path,'concept_mappings',i];if(!concepts.has(cm.concept))problem('concept',`Unknown ontology concept ${cm.concept}.`,p);
  for(const [kind,k]of [['object','object_mappings'],['link','link_mappings']]as const)(cm[k]??[]).forEach((node:any,j:number)=>queue.push({node,path:[...p,k,j],concept:cm.concept,rootConcept:cm.concept,relationships:[],kind,depth:0,inLink:kind==='link'}));
 });
 for(let i=0;i<queue.length;i++){
  const task=queue[i],{node,path,rootConcept}=task;let {concept,relationships}=task;
  if(task.depth>128){problem('mapping-depth','Mapping nesting exceeds 128.',path);continue;}
  try{
   if(task.kind==='link'){
    if(node.relationship){inheritedRelationship(rootConcept,node.relationship);relationships=[...relationships,node.relationship];}
    queue.push({...task,node:node.object_mapping,path:[...path,'object_mapping'],relationships,kind:'object',depth:task.depth+1});
    for(const [j,child]of(node.children??[]).entries())queue.push({...task,node:child,path:[...path,'children',j],relationships,kind:'link',depth:task.depth+1});continue;
   }
   if(task.kind==='referent'){
    const relation=inheritedRelationship(concept,node.relationship);if((relation.roles??[]).length!==1)throw Error(`Referent ${concept}.${node.relationship} needs exactly one target role for nested resolution.`);
    concept=relation.roles[0].concept;relationships=[...relationships,node.relationship];
   }
   concept=node.concept??concept;if(!concepts.has(concept))throw Error(`Unknown ontology concept ${concept}.`);
   if(node.expression!==undefined){const refs=resolveRefs(node.expression);context.bindings.push({id:JSON.stringify(path),kind:task.inLink?'link':task.kind==='referent'?'referent':'object',concept,rootConcept,relationships,expression:node.expression,...refs,evidence:evidence(entry.doc,[...path,'expression'])});}
   for(const [j,child]of(node.referent_mappings??[]).entries())queue.push({...task,node:child,path:[...path,'referent_mappings',j],concept,relationships,kind:'referent',depth:task.depth+1});
  }catch(e){problem('mapping-reference',(e as Error).message,path);}
 }
 // metric bindings: a mapping document's root extension, or an embedded semantic model's (FR-028).
 const kpiOwner=entry.ontology?entry.data.semantic_model:entry.data,kpiPath=entry.ontology?[...entry.path,'semantic_model']:entry.path;
 const kpi=readKpiBindings(kpiOwner,'',!entry.ontology);
 const extIndex=workbenchEntry(kpiOwner)?.index??0;
 context.metricBindings=resolveBindings(kpi.value,ontology,new Set(metricMap.keys())).map((b,i)=>({metric:b.metric,measures:b.measures,...(b.of?{of:b.of}:{}),
  findings:b.problems.map(message=>({severity:'warning' as const,code:'metric-binding',message,evidence:evidence(entry.doc,[...kpiPath,'custom_extensions',extIndex,'data','kpi_bindings',i])})),
  evidence:evidence(entry.doc,[...kpiPath,'custom_extensions',extIndex,'data','kpi_bindings',i])}));
 return context;
}
export function selectContext(context:RuntimeContext,conceptNames:string[]){
 const names=new Set(conceptNames);for(const n of names)if(!context.concepts.some(c=>c.concept===n))throw Error(`Unknown concept ${n}.`);
 const bindings=context.bindings.filter(b=>names.size===0||names.has(b.rootConcept)||names.has(b.concept));
 const metricNames=new Set(bindings.flatMap(b=>b.metrics));
 const pending=[...metricNames];for(let i=0;i<pending.length;i++)for(const dep of context.metrics.find(m=>m.id===pending[i])?.dependsOn??[])if(!metricNames.has(dep)){metricNames.add(dep);pending.push(dep);}
 const metrics=context.metrics.filter(m=>metricNames.has(m.id));
 const fieldIds=new Set([...bindings.flatMap(b=>b.fields),...metrics.flatMap(m=>m.fields)]);
 const fields=context.fields.filter(f=>fieldIds.has(f.id));
 return {...context,concepts:context.concepts.filter(c=>names.size===0||names.has(c.concept)||bindings.some(b=>b.concept===c.concept||b.rootConcept===c.concept)),bindings,metrics,fields,datasets:context.datasets,joins:context.joins};
}
export type PlanRequest={mappingId:string;concepts?:string[];metrics:string[];dimensions:string[];
 // Workbench-internal options (not accepted by /api/agent/plan): plan over the whole model rather than
 // mapped concepts, and group by a time field truncated to a grain.
 scope?:'model';timeGrain?:{field:string;grain:'day'|'week'|'month'|'quarter'|'year'}};
export function planQuery(context:RuntimeContext,request:PlanRequest){
 if(context.findings.some(f=>f.severity==='error'))throw Error('Resolve mapping context errors before planning.');
 const selected=request.scope==='model'?{...context,bindings:[] as Binding[]}:selectContext(context,request.concepts??[]);
 const metricMap=new Map(context.metrics.map(m=>[m.id,m]));
 const fieldMap=new Map(context.fields.map(f=>[f.id,f]));
 const metrics=request.metrics.map(id=>{const m=selected.metrics.find(m=>m.id===id);if(!m)throw Error(`Metric ${id} is not reachable through the selected ontology mappings.`);return m;});
 const dimensions=request.dimensions.map(id=>{const f=selected.fields.find(f=>f.id===id);if(!f)throw Error(`Field ${id} is not reachable through the selected ontology mappings.`);return f;});
 const timeField=request.timeGrain?selected.fields.find(f=>f.id===request.timeGrain!.field):undefined;
 if(request.timeGrain&&(!timeField||!['day','week','month','quarter','year'].includes(request.timeGrain.grain)))throw Error('The time field or grain is not available in this model.');
 if(!metrics.length&&!dimensions.length)throw Error('Select at least one mapped field or governed metric.');
 if(new Set(request.metrics).size!==metrics.length||new Set(request.dimensions).size!==dimensions.length)throw Error('Duplicate query selections.');
 const conditional=selected.bindings.filter(b=>b.condition&&(b.metrics.some(m=>request.metrics.includes(m))||b.fields.some(f=>request.dimensions.includes(f))));
 if(conditional.length)throw Error('Selected bindings have population conditions. Review their meaning before query generation; the planner will not silently turn them into query filters.');
 const required=new Set([...metrics.flatMap(m=>m.datasets),...dimensions.map(f=>f.dataset),...(timeField?[timeField.dataset]:[])]);
 const metricDatasets=new Set(metrics.flatMap(m=>m.datasets));if(metricDatasets.size>1)throw Error('Multi-fact metric composition needs an explicit grain/aggregation model. No unsafe join was generated.');
 const root=[...metricDatasets][0]??dimensions[0]?.dataset;if(!root)throw Error('No physical dataset was resolved.');
 // Find a directed path, then test each chosen edge for necessity. If the
 // target remains reachable without any one edge, another simple path exists
 // (including a longer one). Visited sets terminate cycles; reverse edges are
 // never introduced. This avoids choosing a business role by graph distance.
 const outgoing=new Map<string,any[]>();for(const join of context.joins){const list=outgoing.get(join.from)??[];list.push(join);outgoing.set(join.from,list);}
 const distances=new Map([[root,0]]),previous=new Map<string,any>(),queue=[root];
 for(let i=0;i<queue.length;i++)for(const join of outgoing.get(queue[i])??[]){
  if(!distances.has(join.to)){distances.set(join.to,distances.get(join.from)!+1);previous.set(join.to,join);queue.push(join.to);}
 }
 const reachableWithout=(removed:string,target:string)=>{const seen=new Set([root]),pending=[root];for(let i=0;i<pending.length;i++)for(const edge of outgoing.get(pending[i])??[]){if(edge.name===removed||seen.has(edge.to))continue;if(edge.to===target)return true;seen.add(edge.to);pending.push(edge.to);}return false;};
 const joins=new Map<string,any>();for(const target of required){
  if(!distances.has(target))throw Error(`No fan-out-safe declared join from ${root} to ${target}.`);
  let current=target;while(current!==root){const join=previous.get(current);if(reachableWithout(join.name,target))throw Error(`Ambiguous join paths from ${root} to ${target}. Model an explicit relationship before planning.`);joins.set(join.name,join);current=join.from;}
 }
 const aliases=new Set([root,...[...joins.values()].flatMap(j=>[j.from,j.to])]);
 const modelDatasets=new Map(context.datasets.map(d=>[d.name,d]));
 const compile=(expression:string,currentDataset?:string,active=new Set<string>()):any=>{
  const ast=parseExpression(expression).expression;
  for(const ref of columnRefs(ast)){
   if(!ref.table&&!currentDataset&&metricMap.has(ref.column)){
    if(active.has(ref.column))throw Error('Metric cycle.');const next=new Set(active);next.add(ref.column);const dep=metricMap.get(ref.column)!;
    const replacement=compile(dep.definition.expression.dialects.find((d:any)=>d.dialect==='ANSI_SQL').expression,undefined,next);if(['binary_expr','unary_expr','case'].includes(replacement.type))replacement.parentheses=true;for(const key of Object.keys(ref.node))delete ref.node[key];Object.assign(ref.node,replacement);continue;
   }
   const dataset=ref.table??currentDataset;const f=dataset?fieldMap.get(key(dataset,ref.column)):null;
   if(!f)throw Error(`Unresolved query field ${dataset??''}.${ref.column}.`);
   if(!aliases.has(f.dataset))throw Error(`Dataset ${f.dataset} is not in the declared join plan.`);
   const fieldExpr=f.definition.expression?.dialects?.find((d:any)=>d.dialect==='ANSI_SQL')?.expression;if(!fieldExpr)throw Error(`Field ${f.dataset}.${f.name} has no ANSI_SQL expression.`);
   const physical=parseExpression(fieldExpr).expression;if(!scalar(physical))throw Error(`Field ${f.dataset}.${f.name} is not scalar.`);
   for(const column of columnRefs(physical)){if(column.table&&column.table!==f.dataset)throw Error('Cross-dataset field expressions need an explicit physical binding.');column.node.table=f.dataset;}
   if(['binary_expr','unary_expr','case'].includes(physical.type))physical.parentheses=true;
   for(const k of Object.keys(ref.node))delete ref.node[k];Object.assign(ref.node,physical);
  }return ast;
 };
 const select=[...(timeField?[{alias:'period',sql:`DATE_TRUNC('${request.timeGrain!.grain}', ${expressionSql(compile(`${quoteIdentifier(timeField.dataset)}.${quoteIdentifier(timeField.name)}`))})`,fieldId:timeField.id,evidence:timeField.evidence}]:[]),
  ...dimensions.map((f,i)=>({alias:`dimension_${i+1}`,sql:expressionSql(compile(`${quoteIdentifier(f.dataset)}.${quoteIdentifier(f.name)}`)),fieldId:f.id,evidence:f.evidence}))];
 const measures=metrics.map((m,i)=>({alias:`metric_${i+1}`,sql:expressionSql(compile(m.definition.expression.dialects.find((d:any)=>d.dialect==='ANSI_SQL').expression)),metricId:m.id,governedExpression:m.definition.expression,evidence:m.evidence}));
 const orderedJoins=[...joins.values()].sort((a,b)=>distances.get(a.to)!-distances.get(b.to)!||a.name.localeCompare(b.name));
 const from=`${sourceSql(modelDatasets.get(root).source)} AS ${quoteIdentifier(root)}`;
 const joinSql=orderedJoins.map(j=>{
  const target=modelDatasets.get(j.to);const uniqueKeys=[...(target.primary_key?.length?[target.primary_key]:[]),...(target.unique_keys??[])];
  if(!uniqueKeys.some((keys:string[])=>keys.length===j.to_columns.length&&keys.every(k=>j.to_columns.includes(k))))throw Error(`Join ${j.name} has no declared unique target key. Add primary_key or unique_keys to ${j.to} before aggregating through it.`);
  const conditions=j.from_columns.map((column:string,i:number)=>`${expressionSql(compile(`${quoteIdentifier(j.from)}.${quoteIdentifier(column)}`))} = ${expressionSql(compile(`${quoteIdentifier(j.to)}.${quoteIdentifier(j.to_columns[i])}`))}`);
  // LEFT JOIN retains facts with missing dimensions. Inner-join filtering must be explicit.
  return `LEFT JOIN ${sourceSql(modelDatasets.get(j.to).source)} AS ${quoteIdentifier(j.to)} ON ${conditions.join(' AND ')}`;
 });
 const sql=`SELECT\n  ${[...select,...measures].map(s=>`${s.sql} AS ${quoteIdentifier(s.alias)}`).join(',\n  ')}\nFROM ${from}${joinSql.length?'\n'+joinSql.join('\n'):''}${metrics.length&&select.length?'\nGROUP BY '+select.map(s=>s.sql).join(', '):''};`;
 return {mappingId:context.mappingId,dialect:'ANSI_SQL',sql,dimensions:select,metrics:measures,joins:orderedJoins,sources:[...aliases].map(name=>({dataset:name,source:modelDatasets.get(name).source})),bindings:selected.bindings,documents:context.documents,policy,warnings:['Generated SQL is a preview. Verify physical uniqueness and dialect compatibility in your query engine. No query was executed.']};
}

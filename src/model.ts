import {OSSIE_BUILTINS,builtinConcept} from './ossie-builtins';
import {isMapping} from './mapping-schema';
import {expandIri,namespaceOf,prefixMap,type Namespace} from './iri';
import { parseDocument } from "yaml";
import {inspectRdf,rdfSyntax} from "./rdf";
import {validateStructured} from "./validation";
import {InputError,validateEnvelope,type Issue} from "./diagnostics";
export type Entity = {
  id: string;
  name: string;
  kind: string;
  path: (string | number)[];
  description: string;
  fields: string[];
  definition?: any;
  readOnlyForm?: boolean;
  declaredDomains?: string[];
  namespace?: Namespace;
};
export type Relationship={id:string;source:string;target:string;label:string;data:{path:(string|number)[];definition:any;kind:string;readOnlyForm?:boolean}};
export function inspect(source: string, filename='definition.yaml') {
  validateEnvelope(source,filename);
  if(/\.(trig|nq|jsonld|ofn|omn)$/i.test(filename))throw new InputError([{severity:'error',code:'unsupported',path:'/',message:'Unsupported serialization. Use YAML/JSON, Turtle, N-Triples, N3, or RDF/XML.'}]);
  if(filename.toLowerCase().endsWith('.json'))try{JSON.parse(source)}catch(e){throw new InputError([{severity:'error',code:'json',path:'/',message:(e as Error).message}]);}
  const syntax=rdfSyntax(source,filename);
  if(syntax)return inspectRdf(source,filename,syntax);
  const doc = parseDocument(source, {uniqueKeys:true});
  if (doc.errors.length) throw new InputError(doc.errors.map(e=>({severity:'error',code:'syntax',path:'/',message:e.message,line:e.linePos?.[0].line,column:e.linePos?.[0].col})));
  if(doc.warnings.length)throw new InputError(doc.warnings.map(e=>({severity:'error',code:'yaml-tag',path:'/',message:e.message,line:e.linePos?.[0].line,column:e.linePos?.[0].col})));
  let data:any;
  try{data=doc.toJS({maxAliasCount:100});}catch(e){throw new InputError([{severity:'error',code:'aliases',path:'/',message:(e as Error).message}]);}
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new InputError([{severity:"error",code:"structure",path:"/",message:"Expected a YAML or JSON object."}]);
  const locate=(items:Issue[])=>items.map(issue=>{
    const path=issue.path.split('/').slice(1).map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));
    let node:any;while(path.length){node=doc.getIn(path,true);if(node?.range)break;path.pop();}
    const offset=node?.range?.[0]??0,before=source.slice(0,offset);
    return {...issue,line:before.split('\n').length,column:offset-(before.lastIndexOf('\n')+1)+1};
  });
  let issues:Issue[];
  try{issues=locate(validateStructured(data));}catch(e){if(e instanceof InputError)throw new InputError(locate(e.issues));throw e;}
  const entities: Entity[] = [],
    edges: Relationship[] = [];
  const add = (item: any, path: (string | number)[], kind: string) => {
    if (!item || typeof item !== "object") throw Error(`${path.join(".")} must be an object`);
    const name = item.concept ?? item.name;
    if (typeof name !== "string" || !name) throw Error(`${path.join(".")}: name is required`);
    const id = path.join("/");
    entities.push({
      id,
      definition:item,
      ...(data.kind==='DataContract'&&typeof data.domain==='string'?{declaredDomains:[data.domain]}:{}),
      name,
      kind,
      path,
      description: item.description ?? "",
      fields: (item.properties ?? item.fields ?? []).map((f: any) => f.name),
    });
    return id;
  };
  let kind: string;
  if(isMapping(data)){
    kind='Ossie mappings';
    data.concept_mappings.forEach((m:any,i:number)=>add(m,['concept_mappings',i],'Concept mapping'));
  } else if (data.kind === "DataContract") {
    kind = "ODCS";
    if (!data.apiVersion || !data.id || !data.version)
      throw Error("ODCS requires apiVersion, id and version");
    if (!Array.isArray(data.schema)) throw Error("ODCS requires a schema array");
    data.schema.forEach((x: any, i: number) => add(x, ["schema", i], "Object"));
  } else if (Array.isArray(data.ontology)) {
    kind = "Ossie ontology";
    data.ontology.forEach((x: any, i: number) => add(x, ["ontology", i], x.type ?? "Concept"));
    const prefixes=prefixMap(data.prefixes);
    for(const e of entities){const iri=typeof e.definition?.iri==='string'?expandIri(e.definition.iri,prefixes):null;if(iri&&'iri'in iri)e.namespace=namespaceOf(iri.iri,prefixes);}
    const referenced=new Set<string>(data.ontology.flatMap((c:any)=>[...(c.extends??[]),...(c.relationships??[]).flatMap((r:any)=>(r.roles??[]).map((role:any)=>role.concept))]));
    for(const name of referenced)if(OSSIE_BUILTINS.has(name)&&!entities.some(e=>e.name===name))entities.push({id:`builtin/${name}`,name,kind:'Built-in concept',path:[],description:builtinConcept(name).description,fields:[],definition:builtinConcept(name),readOnlyForm:true});
    const byName = new Map(entities.map(e => [e.name, e]));
    data.ontology.forEach((x: any, i: number) => {
      for (const [ri, r] of (x.relationships ?? []).entries())
        for (const role of r.roles ?? []) {
          const target = byName.get(role.concept);
          if (target)
            edges.push({
              id: `r-${i}-${edges.length}`,
              source: `ontology/${i}`,
              target: target.id,
              label: r.name,
              data: {path:["ontology",i,"relationships",ri],definition:r,kind:"Ontology relationship"},
            });
        }
      for (const parent of x.extends ?? []) {
        const target = byName.get(parent);
        if (target)
          edges.push({
            id: `extends-${i}-${edges.length}`,
            source: `ontology/${i}`,
            target: target.id,
            label: "extends",
            data: {path:["ontology",i],definition:{name:"extends",from:x.concept,to:parent},kind:"Inheritance"},
          });
      }
    });
  } else {
    kind = "Ossie semantic";
    const models = Array.isArray(data.semantic_model) ? data.semantic_model : [data];
    models.forEach((m: any, mi: number) => {
      const prefix: (string | number)[] = data.semantic_model ? ["semantic_model", mi] : [];
      if (!m.name || !Array.isArray(m.datasets) || !m.datasets.length)
        throw Error("Ossie model requires a name and non-empty datasets");
      m.datasets.forEach((x: any, i: number) => {
        if (!x.source) throw Error(`Dataset ${x.name}: source required`);
        add(x, [...prefix, "datasets", i], "Dataset");
      });
      const byName = new Map(entities.filter(e => e.path.slice(0,prefix.length).join('/') === prefix.join('/')).map(e => [e.name,e]));
      for (const [ri, r] of (m.relationships ?? []).entries()) {
        const find = (name: string) => byName.get(name);
        const a = find(r.from),
          b = find(r.to);
        if (!a || !b) throw Error(`Relationship ${r.name}: unknown dataset`);
        if (!r.from_columns?.length || r.from_columns.length !== r.to_columns?.length)
          throw Error(`Relationship ${r.name}: join keys must have equal lengths`);
        edges.push({ id: `join-${mi}-${edges.length}`, source: a.id, target: b.id, label: r.name, data: {path:[...prefix,"relationships",ri],definition:r,kind:"Dataset relationship"} });
      }
      for (const [i, mx] of (m.metrics ?? []).entries()) {
        const metricId=add(mx, [...prefix, "metrics", i], "Metric");
        const expressions=(mx.expression?.dialects??[]).map((d:any)=>d.expression).join(' ');
        for(const dataset of byName.values())if(expressions.includes(dataset.name+'.'))edges.push({id:`metric-${mi}-${i}-${dataset.id}`,source:dataset.id,target:metricId,label:'used by metric',data:{path:[...prefix,'metrics',i],definition:mx,kind:'Metric expression reference'}});
      }
    });
  }
  return { kind, name: data.name ?? data.semantic_model?.[0]?.name ?? "Untitled", entities, edges, issues, document:data };
}
export function editEntity(source: string, path: (string | number)[], description: string) {
  const doc = parseDocument(source);
  doc.setIn([...path, "description"], description);
  if(/^\s*\{/.test(source)) {try{JSON.parse(source);return JSON.stringify(doc.toJS(),null,2)}catch{}}
  return doc.toString();
}

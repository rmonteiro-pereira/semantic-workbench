import assert from'node:assert/strict';
const m=await import(process.argv[2]);const category=process.argv[3];
if(category==='layout'){const nodes=m.layoutGraph(['a','b','c'],[{source:'a',target:'b'},{source:'b',target:'c'}]);assert(nodes[0].position.x<nodes[1].position.x&&nodes[1].position.x<nodes[2].position.x);const ids=Array.from({length:30},(_,i)=>String(i));const p=m.layoutGraph(ids,ids.slice(1).map(id=>({source:'0',target:id})));assert.equal(new Set(p.map((n:any)=>JSON.stringify(n.position))).size,30);assert(Math.max(...p.map((n:any)=>n.position.y))<=450);}
if(category==='graph'){const nodes=Array.from({length:30},(_,i)=>({id:String(i),name:`Entity ${i}`,kind:'Entity',description:'',path:[],fields:[]}));const edge=(s:string,t:string,id=s+'-'+t)=>({id,source:s,target:t,label:id,data:{path:[],definition:{},kind:'relationship'}});const edges=[...nodes.slice(1).map(n=>edge('0',n.id)),edge('1','2')];const v=m.graphView(nodes,edges,'');assert.equal(v.entities.length,8);assert(v.edges.every((e:any)=>e.source==='0'||e.target==='0'));assert.equal(m.graphView(nodes,edges,'',true).entities.length,30);assert.equal(m.graphView(nodes,edges,'absent').entities.length,0);assert.equal(m.graphView(nodes,edges,'',false,8,'29').focus,'29');const g=m.groupRelationships([edge('a','b','one'),edge('a','b','two'),edge('a','c','three')]);assert.equal(g.length,2);assert.equal(g[0].data.relationships.length,2);}
if(category==='export'){const r=m.exportDocument('original source\n','file.ttl');assert.equal(r.filename,'file.ttl');assert.equal(await r.blob.text(),'original source\n');assert(r.blob.type.includes('text/turtle'));}
if(category==='model'){const source='name: Sample\nunknown: preserved\nontology: [{concept: Customer, type: EntityType}]\n';const edited=m.editEntity(source,['ontology',0],'Updated');assert.equal(m.inspect(edited).entities[0].description,'Updated');assert(edited.includes('unknown: preserved'));}
if(category==='store'){const s=m.createStore(':memory:');const source='name: Sample\nontology: [{concept: Customer, type: EntityType}]';const d=s.save('test.yaml',source);assert.throws(()=>s.save('test.yaml',source,d.id,0));assert.throws(()=>s.save('invalid.yaml','name: invalid'));assert.equal(s.list().length,1);assert.equal(s.db.query('SELECT * FROM entities').all().length,1);s.db.close();}

if(category==='overview'){
 const {inspect}=await import('../src/model');
 const input=inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());const o=m.modelOverview(input.entities,input.edges,input.name);
 assert.equal(o.groups.length,8);assert.equal(o.groups.flatMap((g:any)=>g.entities).length,45);
 assert.equal([...o.matrix.values()].flat().length,277);
 for(const [key,links]of o.matrix){const[from,to]=JSON.parse(key);assert(links.every((e:any)=>o.groupOf.get(e.source)===from&&o.groupOf.get(e.target)===to));}
 const owl=inspect(await Bun.file('public/examples/ubl/ubl.owl.ttl').text(),'ubl.owl.ttl');
 assert.equal(m.modelOverview(owl.entities,owl.edges,owl.name).entities.length,45);
 assert.equal(m.modelOverview(owl.entities,owl.edges,owl.name,true).entities.length,owl.entities.length);
}

if(category==='full-layout'){
 const {default:ELK}=await import('elkjs/lib/elk-api.js');const elk=new ELK({algorithms:['layered','sporeOverlap'],workerFactory:()=>new Worker(import.meta.resolve('elkjs/lib/elk-worker.min.js'))});
 try{const result=await m.packNetwork({nodes:[{id:'area:g',group:'g',x:0,y:0,width:250,height:200},{id:'a',parentId:'area:g',x:28,y:62,width:184,height:60},{id:'b',parentId:'area:g',x:30,y:65,width:184,height:60}],entityCount:2,relationshipCount:1,routes:{}},elk);const children=result.nodes.filter((n:any)=>!n.group);assert.equal(children.length,2);const[a,b]=children;assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y));}finally{elk.terminateWorker();}
}

if(category==='validation'){
 const ontology={ontology:[{concept:'A',relationships:[{name:'b',roles:[{concept:'B'}]}]},{concept:'B'}]};
 assert.doesNotThrow(()=>m.validateStructured(ontology));
 const invalids:any[]=[];
 let d=structuredClone(ontology);invalids.push({ontology:[{concept:'A'},{concept:'A'}]});
 d=structuredClone(ontology);(d.ontology[0]as any).extends=['B'];(d.ontology[1]as any).extends=['A'];invalids.push(d);
 d=structuredClone(ontology);d.ontology[0].relationships![0].roles[0].concept='Missing';invalids.push(d);
 const join={name:'S',datasets:[{name:'a',source:'db.a',fields:[{name:'id',expression:{dialects:[{dialect:'ANSI_SQL',expression:'id'}]}}]}],relationships:[{name:'self',from:'a',to:'a',from_columns:['id'],to_columns:['id']}]};
 assert.doesNotThrow(()=>m.validateStructured(join));
 const unknown=structuredClone(join);unknown.relationships[0].from_columns=['missing'];invalids.push(unknown);
 const lengths=structuredClone(join);lengths.relationships[0].from_columns=['id','id'];invalids.push(lengths);
 invalids.push({kind:'DataContract',apiVersion:'v3.1.0',id:'x',version:'1',schema:[{name:'x'}]});
 for(const input of invalids)assert.throws(()=>m.validateStructured(input));
}
if(category==='diagnostics'){
 assert.doesNotThrow(()=>m.validateEnvelope('ontology: [{concept: A}]','x.yaml'));
 assert.throws(()=>m.validateEnvelope('source',''));
 assert.throws(()=>m.validateEnvelope('é'.repeat(1000001),'x.yaml'));
 assert.throws(()=>m.rejectIssues([{severity:'error',code:'test',path:'/',message:'test'}]));
}
if(category==='rdf-validation'){
 const {graph,parse}=await import('rdflib');
 const prefix='@prefix ex: <https://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . ';
 const check=(source:string)=>{const store=graph();parse(prefix+source,store,'https://example.org/','text/turtle');return m.validateRdf(store)};
 assert.doesNotThrow(()=>check('ex:S sh:path ex:p; sh:minCount 0; sh:maxCount 2 .'));
 assert.throws(()=>check('ex:S sh:path ex:p; sh:minCount 3; sh:maxCount 1 .'));
 assert.throws(()=>check('ex:S a sh:PropertyShape .'));
 assert.throws(()=>check('ex:R a owl:Restriction; owl:someValuesFrom ex:C .'));
}

if(category==='agent'){
 const {parse,stringify}=await import('yaml');
 const docs=await Promise.all(['commerce.mapping.yaml','commerce.mapped-ontology.yaml','commerce.mapped-semantic.yaml'].map(async(filename,i)=>({id:String(i),filename,revision:1,source:await Bun.file('public/examples/commerce/'+filename).text()})));
 const change=(index:number,edit:(data:any)=>void)=>{const clone=structuredClone(docs);const data=parse(clone[index].source);edit(data);clone[index].source=stringify(data);return clone;};
 const context=m.buildContext(docs,'0');assert.equal(context.findings.length,0);
 const request={mappingId:'0',metrics:['gross_revenue'],dimensions:['["customers","region"]']};
 const plan=(source=docs,overrides={})=>m.planQuery(m.buildContext(source,'0'),{...request,...overrides});
 const arithmetic=change(2,d=>{d.datasets[0].fields[2].expression.dialects[0].expression='amount + fee';d.metrics[0].expression.dialects[0].expression='SUM(orders.amount * 2)';});
 assert(plan(arithmetic).sql.includes('(\"orders\".amount + \"orders\".fee) * 2'));
 assert(plan().sql.includes('SUM('));assert(plan().sql.includes('GROUP BY'));
 assert(m.selectContext(context,['Revenue']).bindings.every((b:any)=>b.rootConcept==='Revenue'||b.concept==='Revenue'));
 assert(m.buildContext(change(0,d=>d.concept_mappings[0].object_mappings[0].referent_mappings[0].expression='customers.missing'),'0').findings.some((f:any)=>f.severity==='error'));
 assert.throws(()=>plan(change(2,d=>d.metrics[1].expression.dialects[0].expression='SUM(customers.customer_id)'),{metrics:['gross_revenue','order_count']}));
 assert.throws(()=>plan(change(2,d=>d.relationships.push({...d.relationships[0],name:'parallel'}))));
 assert.throws(()=>plan(change(2,d=>delete d.datasets[1].primary_key)));
}

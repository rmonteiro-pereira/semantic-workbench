import assert from'node:assert/strict';
const m=await import(process.argv[2]);const category=process.argv[3];
if(category==='edge-path'){const path='M 10 20 C 30 40 50 60 70 80';assert(m.pathMatchesEndpoints(path,10,20,70,80));assert(!m.pathMatchesEndpoints(path,11,20,70,80));assert(!m.pathMatchesEndpoints(path,10,20,71,80));}
if(category==='layout'){const nodes=m.layoutGraph(['a','b','c'],[{source:'a',target:'b'},{source:'b',target:'c'}]);assert(nodes[0].position.x<nodes[1].position.x&&nodes[1].position.x<nodes[2].position.x);const ids=Array.from({length:30},(_,i)=>String(i));const p=m.layoutGraph(ids,ids.slice(1).map(id=>({source:'0',target:id})));assert.equal(new Set(p.map((n:any)=>JSON.stringify(n.position))).size,30);assert(Math.max(...p.map((n:any)=>n.position.y))<=450);}
if(category==='layout'){const p=m.neighborhoodLayout('c',['i'],['o']);assert(p.get('i').x<0&&p.get('o').x>0&&p.get('c').x===0);}
if(category==='graph'){const nodes=Array.from({length:30},(_,i)=>({id:String(i),name:`Entity ${i}`,kind:'Entity',description:'',path:[],fields:[]}));const edge=(s:string,t:string,id=s+'-'+t)=>({id,source:s,target:t,label:id,data:{path:[],definition:{},kind:'relationship'}});const edges=[...nodes.slice(1).map(n=>edge('0',n.id)),edge('1','2')];
 const v=m.graphView(nodes,edges,'');assert.equal(v.entities.length,8);assert.equal(m.graphView(nodes,edges,'',true).entities.length,30);assert.equal(m.graphView(nodes,edges,'absent').entities.length,0);
 const n=m.neighborhood(nodes,edges,{center:'0',limit:5});assert.equal(n.center,'0');assert.equal(n.hidden,24);assert(m.neighborhood(nodes,edges,{center:'1'}).edges.some((e:any)=>e.id==='0-2'));assert.equal(m.neighborhood(nodes,edges,{center:'5'}).center,'5');
 assert.equal(m.searchEntities([{...nodes[0],name:'OrderLine'},{...nodes[1],name:'Order'}],'order')[0].name,'Order');assert.deepEqual(m.searchEntities([{...nodes[0],name:'Reorder'},{...nodes[1],name:'PurchaseOrder'}],'order').map((e:any)=>e.name),['PurchaseOrder','Reorder']);
 const rdf=[{...nodes[0],kind:'OWL class'},{...nodes[1],kind:'OWL property'}];assert.deepEqual(m.neighborhood(rdf,[edge('1','0')],{center:'0'}).entities.map((e:any)=>e.id),['0']);
 const g=m.groupRelationships([edge('a','b','one'),edge('a','b','two'),edge('a','c','three')]);assert.equal(g.length,2);assert.equal(g[0].data.relationships.length,2);}
if(category==='routes'){const box=(x:number,y:number)=>({x,y,width:250,height:96});const boxes=new Map([['c',box(0,200)],['a',box(-360,0)],['b',box(-360,400)],['r',box(360,0)],['s',box(360,400)],['f',box(-720,200)]]);
 const routes=m.assignRoutes([{id:'a>c',source:'a',target:'c'},{id:'b>c',source:'b',target:'c'},{id:'f>r',source:'f',target:'r'},{id:'f>s',source:'f',target:'s'}],boxes);
 assert.notEqual(routes.get('a>c').bendX,routes.get('b>c').bendX);assert.notEqual(routes.get('f>r').laneY,routes.get('f>s').laneY);
 assert.equal(m.orthogonalPath([[300,100],[320,100],[320,400],[0,400]]),'M 300,100 L 310,100 Q 320,100 320,110 L 320,390 Q 320,400 310,400 L 0,400');}
if(category==='walk'){let w=m.emptyWalk;for(const c of ['a','b','c'])w=m.walkReducer(w,{type:'push',step:{doc:'d',center:c,name:c}});w=m.walkReducer(m.walkReducer(w,{type:'back'}),{type:'back'});w=m.walkReducer(w,{type:'push',step:{doc:'d',center:'x',name:'x'}});assert.deepEqual(w.steps.map((s:any)=>s.center),['a','x']);}
if(category==='export'){const r=m.exportDocument('original source\n','file.ttl');assert.equal(r.filename,'file.ttl');assert.equal(await r.blob.text(),'original source\n');assert(r.blob.type.includes('text/turtle'));}
if(category==='model'){const source='name: Sample\nunknown: preserved\nontology: [{concept: Customer, type: EntityType}]\n';const edited=m.editEntity(source,['ontology',0],'Updated');assert.equal(m.inspect(edited).entities[0].description,'Updated');assert(edited.includes('unknown: preserved'));}
// Folder store cases run on isolated temporary data roots with a test Git identity.
if(['files','atomic','migration','paths','events-origin','journal','trash','confirm'].includes(category)){
 const {tempDataDir}=await import('../tests/helpers/temp-data-dir');
 const fs=await import('node:fs');const {join}=await import('node:path');const {createHash}=await import('node:crypto');
 const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
 const source='name: Sample\nontology: [{concept: Customer, type: EntityType}]\n';
 const d=tempDataDir();
 try{
  if(category==='files'){
   const ws=await m.openWorkspace({root:d.root});
   try{
    await ws.importBatch({files:[{path:'a.yaml',source}]});
    await ws.saveFile('sample','a.yaml',{baseHash:hash(source),source:source.replace('Customer','Buyer')});
    await assert.rejects(()=>ws.saveFile('sample','a.yaml',{baseHash:hash(source),source:source.replace('Customer','Other')}),/changed/);
    await assert.rejects(()=>ws.saveFile('sample','a.yaml',{baseHash:hash(source.replace('Customer','Buyer')),source:'ontology: []'}));
    assert.equal(fs.readFileSync(join(d.root,'projects/sample/a.yaml'),'utf8'),source.replace('Customer','Buyer'));
   }finally{ws.close();}
  }
  if(category==='atomic'){
   const file=join(d.root,'x.yaml');fs.writeFileSync(file,'original');
   assert.throws(()=>m.atomicWrite(file,'new bytes',{beforeRename:()=>{throw Error('crash');}}));
   assert.equal(fs.readFileSync(file,'utf8'),'original');
  }
  if(category==='paths'){
   for(const bad of ['../x','a/../../x','.git/config','a/.git/x'])assert.throws(()=>m.projectPath(bad));
   assert.equal(m.projectPath('a/b.yaml'),'a/b.yaml');
  }
  if(category==='journal'){
   const layout={root:d.root,journal:join(d.root,'state/journal')} as any;fs.mkdirSync(layout.journal,{recursive:true});fs.mkdirSync(join(d.root,'x'));fs.mkdirSync(join(d.root,'s'));
   fs.writeFileSync(join(d.root,'x/a'),'A');fs.writeFileSync(join(d.root,'s/b'),'B');fs.writeFileSync(join(d.root,'x/b'),'other');
   fs.writeFileSync(join(layout.journal,'op.json'),JSON.stringify({formatVersion:1,opId:'op',kind:'move',steps:[{action:'rename',from:'s/a',to:'x/a',done:true},{action:'rename',from:'s/b',to:'x/b',done:false}],cleanup:[],startedAt:'t'}));
   const [outcome]=m.createJournal(layout).recover();
   assert.equal(outcome.outcome,'rolled-back');assert.equal(fs.readFileSync(join(d.root,'x/b'),'utf8'),'other');assert.equal(fs.readFileSync(join(d.root,'s/a'),'utf8'),'A');
  }
  if(category==='events-origin'){
   const {openWorkspace}=await import('../server/projects/workspace');const ws=await openWorkspace({root:d.root});
   try{const h=m.createHandler(ws);assert.equal((await h(new Request('http://127.0.0.1:4310/api/events',{headers:{origin:'https://evil.example'}}))).status,403);assert.equal((await h(new Request('http://127.0.0.1:4310/api/projects',{headers:{origin:'https://evil.example'}}))).status,403);}finally{ws.close();}
  }
  if(category==='trash'){
   let clock=Date.parse('2026-10-21T10:00:00Z');
   const {openWorkspace}=await import('../server/projects/workspace');const ws=await openWorkspace({root:d.root,now:()=>clock});
   try{
    await ws.importBatch({files:[{path:'a.yaml',source}]});
    const trash=m.createTrash({layout:ws.layout,state:ws.state,journal:ws.journal,lock:ws.lock,projects:()=>ws.state.registry().projects,registrySteps:ws.registrySteps,afterFiles:(s:string)=>ws.rescan(s),forgetProject:()=>{},adoptProject:async()=>{},createProject:async()=>{throw Error('unused');},emit:()=>{},now:()=>clock});
    const first=await trash.deleteFile('sample','a.yaml');clock+=10_001;
    await assert.rejects(()=>trash.undo(first.entryId),(e:any)=>e.name==='GoneError');
    fs.writeFileSync(join(d.root,'projects/sample/a.yaml'),'name: Newer\nontology: [{concept: N}]\n');
    await assert.rejects(()=>trash.restore(first.entryId),(e:any)=>e.name==='OccupiedError'&&e.suggestion.toPath==='a (2).yaml');
    assert.equal(fs.readFileSync(join(d.root,'projects/sample/a.yaml'),'utf8'),'name: Newer\nontology: [{concept: N}]\n');
   }finally{ws.close();}
  }
  if(category==='confirm'){
   assert.throws(()=>m.requireConfirm({}));assert.throws(()=>m.requireConfirm({confirm:'yes'}));m.requireConfirm({confirm:true});
   const {openWorkspace}=await import('../server/projects/workspace');const ws=await openWorkspace({root:d.root});
   try{
    await ws.importBatch({files:[{path:'a.yaml',source}]});
    await assert.rejects(async()=>m.trashRoutes(ws,new Request('http://x/api/projects/sample/files/a.yaml',{method:'DELETE',body:'{}'}),new URL('http://x/api/projects/sample/files/a.yaml')));
    await assert.rejects(async()=>m.trashRoutes(ws,new Request('http://x/api/clear',{method:'POST',body:'{}'}),new URL('http://x/api/clear')));
    assert(fs.existsSync(join(d.root,'projects/sample/a.yaml')));
   }finally{ws.close();}
  }
  if(category==='migration'){
   const {Database}=await import('bun:sqlite');const {dataLayout}=await import('../server/projects/paths');const {createState}=await import('../server/projects/state');const {createJournal}=await import('../server/projects/journal');const {createGit}=await import('../server/projects/git');
   const layout=dataLayout(d.root);for(const dir of [layout.projects,layout.state,layout.backup])fs.mkdirSync(dir,{recursive:true});
   const db=new Database(layout.legacyDb,{create:true});db.exec("CREATE TABLE documents(id TEXT PRIMARY KEY,filename TEXT NOT NULL,source TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL)");db.query('INSERT INTO documents VALUES(?,?,?,1,?)').run('one','a.yaml',source,'t');db.close();
   const ctx={layout,state:createState(layout),journal:createJournal(layout),git:createGit({projectsRoot:layout.projects}),gitAvailable:true,identityConfigured:true};
   const report=await m.migrateLegacy(ctx,{afterWrite:(file:string)=>fs.writeFileSync(file,'tampered')});
   assert.equal(report.status,'failed');assert.equal(fs.readdirSync(layout.projects).length,0);assert.equal(ctx.state.hasRegistry(),false);
  }
 }finally{d.cleanup();}
}

if(category==='overview'){
 const {inspect}=await import('../src/model');
 const input=inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());const o=m.modelOverview(input.entities,input.edges,input.name);
 const flights=inspect(await Bun.file('public/examples/ossie/flights.ontology.yaml').text());assert.equal(m.modelOverview(flights.entities,flights.edges,flights.name).mode,'suggested');const corrected=m.modelOverview(flights.entities,flights.edges,flights.name,false,{mode:'types',assignments:{[flights.entities[0].id]:'custom:Review'},names:{'custom:Review':'Review'}});assert.equal(corrected.groupOf.get(flights.entities[0].id),'custom:Review');
 const ns=inspect('name: N\nprefixes: {a: "https://a.example/", b: "https://b.example/"}\nontology: [{concept: X, type: EntityType, iri: "a:X"}, {concept: Y, type: EntityType, iri: "b:Y"}, {concept: Z, type: EntityType}]\n');const nso=m.modelOverview(ns.entities,ns.edges,ns.name);assert.equal(nso.mode,'namespaces');assert.deepEqual(nso.groups.map((g:any)=>g.name),['a:','b:','No IRI']);
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
 const iri={version:'0.2.0.dev0',name:'I',prefixes:{ex:'https://example.org/'},ontology:[{concept:'A',type:'EntityType',iri:'ex:A'},{concept:'B',type:'EntityType',iri:'https://example.org/B'}]};
 assert.doesNotThrow(()=>m.validateStructured(iri));
 d=structuredClone(iri);(d as any).ontology[0].iri='zz:A';invalids.push(d);
 d=structuredClone(iri);(d as any).ontology[1].iri='https://example.org/A';invalids.push(d);
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
 const legacy=[{id:'0',filename:'m.yaml',revision:1,source:'version: 0.2.0.dev0\nname: m\nontology_ref: {name: O}\nsemantic_model_ref: {name: s}\nconcept_mappings:\n  - concept: A\n    object_mappings: [{referent_mappings: [{relationship: id, expression: t.id}]}]\n'},{id:'1',filename:'o.yaml',revision:1,source:'version: 0.2.0.dev0\nname: O\nontology:\n  - {concept: Id, type: ValueType, extends: [String]}\n  - concept: A\n    type: EntityType\n    identify_by: [id]\n    relationships: [{name: id, roles: [{concept: Id}], multiplicity: OneToOne, verbalizes: ["{A} has {Id}"]}]\n'},{id:'2',filename:'s.yaml',revision:1,source:'version: 0.2.0.dev0\nsemantic_model:\n  - name: s\n    datasets: [{name: t, source: t, fields: [{name: id, expression: {dialects: [{dialect: ANSI_SQL, expression: id}]}}]}]\n'}];
 const resolved=m.buildContext(legacy,'0');assert.equal(resolved.findings.length,0);assert.deepEqual(resolved.fields[0].evidence.path,['semantic_model',0,'datasets',0,'fields',0]);
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
if(category==='iri'){assert.deepEqual(m.expandIri('ex:A',{ex:'https://example.org/'}),{iri:'https://example.org/A',prefix:'ex'});assert('error'in m.expandIri('zz:A',{ex:'https://example.org/'}));assert.deepEqual(m.expandIri('https://x.example/A'),{iri:'https://x.example/A'});}
if(category==='odcs'){const data={schema:[{name:'a',properties:[{name:'id'}]},{name:'b',properties:[{name:'a_id',relationships:[{to:'a.id'}]},{name:'x_id',relationships:[{to:'x.id'}]}]}]};assert.equal(m.odcsForeignKeys(data).length,1);assert.equal(m.odcsReferenceIssues(data).length,1);}
if(category==='suggestions'){
 const f=(project:string,path:string,facts:any)=>({project,path,hash:path,facts:{names:[],refs:[],iris:[],physical:[],sources:[],...facts}});
 const own=f('p','o.yaml',{names:['Flights']});
 for(const ref of ['Flight','flights','Flig','FLIGHTS semantic'])assert.equal(m.evidenceBetween(f('q','m.yaml',{refs:[ref]}),own).length,0);
 assert.equal(m.evidenceBetween(f('q','m.yaml',{refs:['Flights']}),own).length,1);
 assert.equal(m.inferSuggestions([own,f('q','m.yaml',{refs:['Flightz']})],new Set()).length,0);
}
if(category==='references'){const entity={id:'ontology/0',name:'P',kind:'EntityType',path:[],description:'',fields:[],definition:{iri:'core:P'}};assert(m.entityKeys(entity,{entities:[entity],document:{prefixes:{core:'https://example.org/core#'}}}).includes('https://example.org/core#P'));}
// Metrics read side (Phase 3): rollup refusal, lineage by exact physical names, both Ossie layouts.
if(category==='explain'){
 const docs=await Promise.all(['mall.mapping.yaml','mall.ontology.yaml','mall.semantic.yaml','mall.odcs.yaml'].map(async f=>({id:'mall/'+f,project:'mall',path:f,filename:f,revision:1,source:await Bun.file('public/examples/mall/'+f).text()})));
 assert.match(m.explainMetric(docs,'mall','mall.semantic.yaml','occupancy_rate',{rollup:'sum'}).sqlPreview.refused??'',/Summing ratios/);
 assert.deepEqual(m.explainMetric(docs,'mall','mall.semantic.yaml','billed_amount').inputs[0].fields[0].odcs.map((o:any)=>o.property),['amount']);
 const flights=[{id:'f/flights.yaml',project:'f',path:'flights.yaml',filename:'flights.yaml',revision:1,source:(await Bun.file('public/examples/ossie/flights.yaml').text()).replace(/^(    datasets:)/m,'    metrics:\n      - name: n\n        expression: {dialects: [{dialect: ANSI_SQL, expression: "COUNT(FLIGHT.id)"}]}\n$1')}];
 assert.deepEqual(m.projectMetrics(flights,'f').map((k:any)=>k.name),['n']);
}
if(category==='metric-extension'){
 const metric=(data:any)=>({custom_extensions:[{vendor_name:'SEMANTIC_WORKBENCH',data:JSON.stringify(data)}]});
 assert.equal(m.readMetricExtension(metric({schema:'semantic-workbench/metric/v1',type:'simple'})).issues.length,0);
 assert(m.readMetricExtension(metric({schema:'semantic-workbench/metric/v1',type:'simple',additivity:'sometimes'})).issues.length>0);
}
if(category==='model-layout'){
 const model=m.inspect(await Bun.file('public/examples/ossie/flights.yaml').text(),'flights.yaml');
 assert.equal(model.layout,'embedded (deprecated)');assert(model.entities.filter((e:any)=>e.kind==='Dataset').length>=6);
}

import{mkdtemp,rm,symlink}from'node:fs/promises';import{resolve,dirname}from'node:path';
const root=process.cwd(),temp=await mkdtemp('/tmp/workbench-mutations-');
// Candidate modules live outside the project; give their bare package imports
// the same dependency tree as the real sources, without relying on Bun caches.
await symlink(resolve(root,'node_modules'),resolve(temp,'node_modules'),'dir');
const mutants:[string,string,string,string][]=[
 ['agent','server/agent/runtime.ts','physical.parentheses=true','physical.parentheses=false'],
 ['agent','server/agent/runtime.ts','if(!fieldMap.has(id))throw','if(false)throw'],
 ['agent','server/agent/runtime.ts','context.bindings.filter(b=>names.size===0||names.has(b.rootConcept)||names.has(b.concept))','context.bindings.filter(()=>true)'],
 ['agent','server/agent/runtime.ts','if(metricDatasets.size>1)throw','if(false)throw'],
 ['agent','server/agent/runtime.ts','if(reachableWithout(join.name,target))throw','if(false)throw'],
 ['agent','server/agent/runtime.ts','if(!uniqueKeys.some','if(false&&!uniqueKeys.some'],
 ['agent','server/agent/runtime.ts','const sql=`SELECT',"const sql='SELECT 1;'||`SELECT"],
 ['validation','src/validation.ts',"if(names.has(x[key]))fail", "if(false)fail"],
 ['validation','src/validation.ts','if(cycle.length)fail','if(false)fail'],
 ['validation','src/validation.ts',"!names.has(role.concept)","false"],
 ['validation','src/validation.ts',"!fieldNames.get(r[side])!.has(k)","false"],
 ['validation','src/validation.ts','if(from.length!==to.length)fail','if(false)fail'],
 ['validation','src/validation.ts','if(validator&&!validator(data))','if(false)'],
 ['validation','src/validation.ts',"if('error'in r){fail(q,r.error);return;}",''],
 ['validation','src/validation.ts','if(iris.has(iri))fail','if(false)fail'],
 ['odcs','src/odcs.ts','if(target===undefined){issues.push','if(false){issues.push'],
 ['odcs','src/odcs.ts','keys.push({from,to:target','if(false)keys.push({from,to:target'],
 ['references','src/references.ts',"if('iri'in r)keys.push(r.iri);",''],
 ['iri','src/iri.ts','if(Object.hasOwn(prefixes,prefix))return','if(false)return'],
 ['agent','server/agent/runtime.ts',"return Array.isArray(p.data.semantic_model)?","return false?"],
 ['overview','src/overview.ts',"namespaces.size>=2?'namespaces':",''],
 ['overview','src/overview.ts',"if(ns){const id='namespace:'+ns.iri;","if(false){const id='namespace:'+ns.iri;"],
 ['diagnostics','src/diagnostics.ts','> MAX_INPUT_BYTES','> MAX_INPUT_BYTES * 10'],
 ['diagnostics','src/diagnostics.ts',"!filename.trim()","false"],
 ['diagnostics','src/diagnostics.ts',"if (issues.some(i => i.severity === 'error'))",'if (false)'],
 ['rdf-validation','src/rdf-validation.ts','BigInt(l.value)>BigInt(h.value)','false'],
 ['rdf-validation','src/rdf-validation.ts',"paths.length!==1||!path(paths[0])",'false'],
 ['rdf-validation','src/rdf-validation.ts',"on.length!==1||!resource(on[0])",'false'],
 ['full-layout','src/full-layout.ts',"'elk.algorithm':'sporeOverlap'","'elk.algorithm':'fixed'"],
 ['full-layout','src/full-layout.ts','result.nodes.map((n:any)=>n.group?','result.nodes.filter((n:any)=>n.group).map((n:any)=>n.group?'],
 ['overview','src/overview.ts','group.push(edge);','if(groupOf.get(edge.source)!==groupOf.get(edge.target))group.push(edge);'],
 ['overview','src/overview.ts','hasClasses&&!technical','false'],
 ['overview','src/overview.ts','if(correction){','if(false){'],
 ['overview','src/overview.ts',"suggested.membership.size>=2&&suggested.backboneEdges>0",'false'],
 ['overview','src/overview.ts','groups.get(group.id)!.entities.push(entity);','groups.get(group.id)!.entities.push(entity,entity);'],
 ['overview','src/overview.ts','JSON.stringify([groupOf.get(edge.source),groupOf.get(edge.target)])','JSON.stringify([groupOf.get(edge.target),groupOf.get(edge.source)])'],
 ['layout','src/layout.ts','*330','*0'],
 ['layout','src/layout.ts','row%maxRows','row'],
 ['edge-path','src/edge-path.ts','Math.abs(coordinates[0]-sourceX)<=tolerance','true'],
 ['edge-path','src/edge-path.ts','Math.abs(coordinates[last]-targetX)<=tolerance','true'],
 ['graph','src/graph-view.ts','limit=8','limit=800'],
 ['graph','src/graph-view.ts','JSON.stringify([edge.source,edge.target])','edge.source'],
 ['graph','src/graph-view.ts',"options.center&&byId.has(options.center)?options.center:",""],
 ['graph','src/graph-view.ts',"options.lateral!==false","false"],
 ['graph','src/graph-view.ts',"hidden:ranked.length-shownIds.length","hidden:0"],
 ['graph','src/graph-view.ts',".some(w=>w.startsWith(q)))return 2;",".some(w=>w.startsWith(q)))return 3;"],
 ['graph','src/graph-view.ts',"if(technical||!entities.some(e=>e.kind==='OWL class'))","if(true)"],
 ['routes','src/graph/routes.ts',"top-22-(above++)*16","top-22"],
 ['routes','src/graph/routes.ts',"start+i*step","start"],
 ['routes','src/graph/routes.ts',"const ax=x-Math.sign(x-px)*r","const ax=x+Math.abs(x-px)/(x-px||1)*0-r"],
 ['walk','src/graph/walk.ts',"walk.steps.slice(0,walk.index+1)","walk.steps"],
 ['layout','src/layout.ts',"x:side*(c+1)*NEIGHBOR_COLUMN","x:(c+1)*NEIGHBOR_COLUMN"],
 ['patch','src/editor/patch.ts',"insert:inserted.toString().replace(/\\n/g,eol)","insert:inserted.toString()"],
 ['lint','src/editor/lint.ts',"if(!range){documentLevel.push(issue);continue;}","{documentLevel.push(issue);continue;}"],
 ['json-patch','src/edit/json-patch.ts',"if(isMap(node)&&isObject(oldV)&&isObject(newV)&&node.items.length)return mapPatches(","if(false)return mapPatches("],
 ['yaml-patch','src/edit/yaml-patch.ts',"if(isMap(node)&&isObject(oldV)&&isObject(newV)&&node.items.length)return mapDiff(","if(false)return mapDiff("],
 ['dependents','src/edit/references.ts',"add(path,within(src,node,new RegExp(escape(name),'g')).slice(0,1),dep(upTo(path,'relationships')));","add(path,within(src,node,new RegExp(escape(name),'g')).slice(0,1),null);"],
 ['kpi-draft','src/metrics/kpi-draft.ts',"const e:Record<string,any>={label:d.label.trim()||undefined,type:d.type};","const e:Record<string,any>={label:d.label.trim()||undefined,type:d.type,expression:expressionFor(d)};"],
 ['kpi-save','src/metrics/kpi-save.ts',"const extension={...req.extension,schema:METRIC_SCHEMA};","const extension={...req.extension,schema:METRIC_SCHEMA,expression:req.metric.expression};"],
 ['kpi-save','src/metrics/kpi-save.ts',"export const sortedBindings=(list:KpiBinding[],next:KpiBinding)=>[...list,next].sort(","export const sortedBindings=(list:KpiBinding[],next:KpiBinding)=>[...list,next];[].sort("],
 ['status-rules','src/edit/item-model.ts',"return {item:writeExtension(after,{...now,status:'proposed'}),reopened:true};","return {item:after,reopened:true};"],
 ['save-client','src/projects/api.ts',"patches&&baseHash!==null?{baseHash,patches}:{baseHash,source}","{baseHash,source}"],
 ['export','src/export.ts','return {filename,blob:',"return {filename:'wrong.yaml',blob:"],
 ['export','src/export.ts','new Blob([source]','new Blob([\'\']'],
 ['model','src/model.ts',"valuePatches(source, [...path, \"description\"], description, filename)","valuePatches(source, ['unrelated'], description, filename)"],
 ['files','server/projects/workspace.ts','if(body.baseHash!==currentHash)throw new StaleError','if(false)throw new StaleError'],
 ['files','server/projects/workspace.ts','if(!indexed.file.valid)throw new InputError(indexed.findings);',''],
 ['atomic','server/projects/atomic.ts','const temp=tempPath(path);','const temp=path;'],
 ['migration','server/projects/migration.ts','if(sha256(readFileSync(file))!==expected)throw','if(false)throw'],
 ['paths','server/projects/paths.ts',"if(parts.some(p=>p===''||p==='.'||p==='..'))throw","if(false)throw"],
 ['paths','server/projects/paths.ts',"if(parts.some(p=>p.toLowerCase()==='.git'))throw","if(false)throw"],
 ['events-origin','server/handler.ts',"if(origin&&!ALLOWED_ORIGINS.includes(origin))return","if(origin&&!ALLOWED_ORIGINS.includes(origin)&&url.pathname!=='/api/events')return"],
 ['journal','server/projects/journal.ts','const forward=remaining.every(','const forward=true||remaining.every('],
 ['trash','server/projects/trash.ts','if(undo&&now()>Date.parse(e.undoUntil))throw new GoneError','if(false)throw new GoneError'],
 ['trash','server/projects/trash.ts','if(existsSync(dest)){','if(false){'],
 ['suggestions','server/projects/suggestions.ts','export const sameName=(a:string,b:string)=>a===b;','export const sameName=(a:string,b:string)=>a.slice(0,4).toLowerCase()===b.slice(0,4).toLowerCase();'],
 ['confirm','server/routes/trash.ts',"if(!body||body.confirm!==true)throw","if(false)throw"],
 ['explain','server/agent/explain.ts',"if(rollup==='sum'&&kpi.additivity==='non_additive')return refuse(","if(false)return refuse("],
 ['explain','server/agent/explain.ts',"columns.includes(p?.physicalName??p?.name)","columns.some(c=>String(p?.physicalName??p?.name).includes(c))"],
 ['explain','server/agent/explain.ts',"if(Array.isArray(data.ontology))return list(data.ontology_mappings)","if(Array.isArray(data.ontology))return [];if(false)return list(data.ontology_mappings)"],
 ['metric-extension','src/metrics/extension.ts',"if(!validate(value))for(","if(false)for("],
 ['model-layout','src/model.ts',"(Array.isArray(data.ontology_mappings)?data.ontology_mappings:[]).forEach(","([] as any[]).forEach("],
 ['rdf-gate','src/edit/rdf-patch/isomorphism.ts',"if(!isomorphic(restBefore,restAfter))return","if(false)return"],
 ['fullscreen','src/graph/fullscreen.ts','exit():Viewport|null{const v=saved;saved=null;return v;}','exit():Viewport|null{saved=null;return null;}'],
 ['odcs-diff','src/odcs/odcs-diff.ts',".filter(k=>!skip.includes(k)).sort();",".filter(k=>!skip.includes(k)&&!/Type$/.test(k)).sort();"],
 ['scm-block','server/projects/scm.ts',"if(drafts.length)return new BlockedError('drafts',drafts);",''],
 ['git-exec','server/projects/git.ts','Bun.spawn([binary,...args],',"Bun.spawn(['sh','-c',[binary,...args].join(' ')],"],
 ['git-exec','server/projects/git.ts','if(REMOTE_COMMANDS.has(subcommandOf(args))&&!opts.remote)throw','if(false)throw'],
 ['git-exec','server/projects/git.ts',"if(typeof message!=='string'||!message.trim())throw new GitError('A commit message is required.');",''],
 ['rdf-lines','src/edit/rdf-patch/ntriples.ts',"else if(replaced.has(i))patches.push({from:l.start,to:l.start+l.text.length,insert:replaced.get(i)!});","else if(l.triple)patches.push({from:l.start,to:l.start+l.text.length,insert:replaced.get(i)??ntLine(l.triple.s.value,l.triple.p.value,l.triple.o)});"],
];
let killed=0;
async function run(category:string,file:string,source:string,index:string){const rewritten=source.replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g,(_all,q,path)=>`from ${q}${resolve(dirname(resolve(root,file)),path)}${q}`);const target=resolve(temp,index+'.ts');await Bun.write(target,rewritten);const child=Bun.spawn([process.execPath,resolve(root,'scripts/mutation-case.ts'),target,category],{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),10000);const code=await child.exited;clearTimeout(timer);const error=await new Response(child.stderr).text();return{code,error};}
try{
 for(const category of new Set(mutants.map(m=>m[0]))){const file=mutants.find(m=>m[0]===category)![1];const result=await run(category,file,await Bun.file(file).text(),'baseline-'+category);if(result.code!==0)throw Error(`Baseline failed (${category}): ${result.error}`);}
 for(const [i,[category,file,before,after]]of mutants.entries()){const source=await Bun.file(file).text();if(!source.includes(before))throw Error(`Mutation anchor missing: ${before}`);const result=await run(category,file,source.replaceAll(before,after),'mutant-'+i);if(result.code===0)throw Error(`Surviving mutant ${i}: ${before} → ${after}`);if(/Cannot find|SyntaxError|ModuleNotFound/.test(result.error))throw Error(`Invalid mutation ${i}: ${result.error}`);killed++;console.log(`KILLED ${category}: ${before} → ${after}`);}
 const ui=Bun.spawn([process.execPath,resolve(root,'scripts/ui-tests.ts')],{env:{...process.env,UI_MUTATION:'clear-nodes'},stdout:'pipe',stderr:'pipe'});
 const code=await ui.exited;const output=await new Response(ui.stdout).text();const error=await new Response(ui.stderr).text();
 if(code===0)throw Error('Surviving UI mutant: empty neighborhood node projection');
 if(!output.includes('INJECTED_CLEAR_NODES_MUTATION')||!error.includes('react-flow__node'))throw Error('Invalid UI mutant: '+output+error);
 killed++;console.log('KILLED UI: empty neighborhood node projection');
 // Layout mutants (T161): each must fail the responsive checks that guard it.
 for(const [mutation,only,label] of [['overlay','overlaps: Graph','status line drawn over the mini-map and zoom controls'],['status-stays','status messages','status messages never dismiss']] as const){
  const child=Bun.spawn([process.execPath,resolve(root,'scripts/responsive-ui-tests.ts')],{env:{...process.env,RESPONSIVE_MUTATION:mutation,RESPONSIVE_ONLY:only},stdout:'pipe',stderr:'pipe'});
  const code=await child.exited,output=await new Response(child.stdout).text(),error=await new Response(child.stderr).text();
  if(code===0)throw Error('Surviving UI mutant: '+label);
  if(!output.includes(mutation==='overlay'?'INJECTED_OVERLAY_MUTATION':'INJECTED_STATUS_MUTATION')||!/expect|Expected|toHaveCount/.test(error))throw Error('Invalid UI mutant: '+label+'\n'+output+error);
  killed++;console.log('KILLED UI: '+label);
 }
 console.log(`${killed}/${mutants.length+3} targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.`);
}finally{await rm(temp,{recursive:true,force:true});}

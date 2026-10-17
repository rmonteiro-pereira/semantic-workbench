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
 ['overview','src/overview.ts','groups.get(group.id)!.entities.push(entity);','groups.get(group.id)!.entities.push(entity,entity);'],
 ['overview','src/overview.ts','JSON.stringify([groupOf.get(edge.source),groupOf.get(edge.target)])','JSON.stringify([groupOf.get(edge.target),groupOf.get(edge.source)])'],
 ['layout','src/layout.ts','*330','*0'],
 ['layout','src/layout.ts','row%maxRows','row'],
 ['graph','src/graph-view.ts','limit=8','limit=800'],
 ['graph','src/graph-view.ts','&&(e.source===focus||e.target===focus)',''],
 ['graph','src/graph-view.ts','includes(query.toLowerCase())',"includes('')"],
 ['graph','src/graph-view.ts','JSON.stringify([edge.source,edge.target])','edge.source'],
 ['export','src/export.ts','return {filename,blob:',"return {filename:'wrong.yaml',blob:"],
 ['export','src/export.ts','new Blob([source]','new Blob([\'\']'],
 ['model','src/model.ts',"doc.setIn([...path, \"description\"], description)","doc.setIn(['unrelated'], description)"],
 ['store','server/store.ts','if (old && revision !== old.revision)','if (false)'],
 ['store','server/store.ts','const model = inspect(source, filename);','const model = {entities:[]};'],
];
let killed=0;
async function run(category:string,file:string,source:string,index:string){const rewritten=source.replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g,(_all,q,path)=>`from ${q}${resolve(dirname(resolve(root,file)),path)}${q}`);const target=resolve(temp,index+'.ts');await Bun.write(target,rewritten);const child=Bun.spawn([process.execPath,resolve(root,'scripts/mutation-case.ts'),target,category],{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),10000);const code=await child.exited;clearTimeout(timer);const error=await new Response(child.stderr).text();return{code,error};}
try{
 for(const category of new Set(mutants.map(m=>m[0]))){const file=mutants.find(m=>m[0]===category)![1];const result=await run(category,file,await Bun.file(file).text(),'baseline-'+category);if(result.code!==0)throw Error(`Baseline failed (${category}): ${result.error}`);}
 for(const [i,[category,file,before,after]]of mutants.entries()){const source=await Bun.file(file).text();if(!source.includes(before))throw Error(`Mutation anchor missing: ${before}`);const result=await run(category,file,source.replaceAll(before,after),'mutant-'+i);if(result.code===0)throw Error(`Surviving mutant ${i}: ${before} → ${after}`);if(/Cannot find|SyntaxError|ModuleNotFound/.test(result.error))throw Error(`Invalid mutation ${i}: ${result.error}`);killed++;console.log(`KILLED ${category}: ${before} → ${after}`);}
 const ui=Bun.spawn([process.execPath,resolve(root,'scripts/ui-tests.ts')],{env:{...process.env,UI_MUTATION:'clear-nodes'},stdout:'pipe',stderr:'pipe'});
 const code=await ui.exited;const output=await new Response(ui.stdout).text();const error=await new Response(ui.stderr).text();
 if(code===0)throw Error('Surviving UI mutant: clear nodes when reopening an existing example');
 if(!output.includes('INJECTED_CLEAR_NODES_MUTATION')||!error.includes('react-flow__node'))throw Error('Invalid UI mutant: '+output+error);
 killed++;console.log('KILLED UI: clear nodes when reopening an existing example');
 console.log(`${killed}/${mutants.length+1} targeted mutants killed; all unmodified module baselines passed. Run test:ui for the full browser baseline.`);
}finally{await rm(temp,{recursive:true,force:true});}

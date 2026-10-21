import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,posix} from 'node:path';
import {validateInput} from '../../src/input';
import {InputError,MAX_INPUT_BYTES,type Issue} from '../../src/diagnostics';
import {exampleSet} from '../../src/projects/examples';
import {atomicWrite,atomicWriteJson,decode,encode,sha256} from './atomic';
import {createCache,type Cache} from './cache';
import {createEvents} from './events';
import {createGit} from './git';
import {createJournal,type RecoveryOutcome} from './journal';
import {dataLayout,disambiguate,projectDir,projectFile,projectName,projectPath,slugify,uniqueName,assertSlug,PathError,type DataLayout} from './paths';
import {createScanner,indexBytes} from './scanner';
import {createState,type ProjectEntry,type Patch} from './state';
import {createWatcher} from './watcher';
import {migrateLegacy,type MigrationReport} from './migration';
import {createTrash} from './trash';
import {factsOf,inferSuggestions,evidenceBetween,type FileFacts,type IndexedFile} from './suggestions';
import {ConflictError,OccupiedError} from './errors';
// The folder store: project folders under data/projects/ are the source of truth, state files hold
// what must survive, the SQLite cache is rebuilt from the folders whenever it is missing.
import {StaleError,NotFoundError} from './errors';
export {StaleError,NotFoundError,GoneError,OccupiedError,ConflictError} from './errors';
export type ImportFile={path:string;source:string};
export type WorkspaceOptions={root?:string;gitBinary?:string;watch?:boolean;examplesDir?:string;rescanMs?:number;debounceMs?:number;now?:()=>number;migrationHooks?:Parameters<typeof migrateLegacy>[1]};
// Apply source-range patches (UTF-16 offsets into the base text) from the end so offsets stay valid.
export function applyPatches(base:string,patches:Patch[]){
 if(!Array.isArray(patches)||patches.length>10_000)throw Error('Patches must be an array.');
 let end=0;
 for(const p of patches){
  if(!p||!Number.isSafeInteger(p.from)||!Number.isSafeInteger(p.to)||typeof p.insert!=='string'||p.from<end||p.to<p.from||p.to>base.length)throw Error('Patches must be ordered, non-overlapping ranges inside the base text.');
  end=p.to;
 }
 let out=base;for(const p of [...patches].reverse())out=out.slice(0,p.from)+p.insert+out.slice(p.to);
 return out;
}
// Integer stand-in for the v0.1.0 `revision`, derived from the content hash (legacy facade only).
export const revisionOf=(hash:string)=>parseInt(hash.slice(0,12),16)+1;
export async function openWorkspace(options:WorkspaceOptions={}){
 const layout:DataLayout=dataLayout(options.root);
 for(const dir of [layout.projects,layout.state,layout.trash,layout.backup])mkdirSync(dir,{recursive:true});
 const state=createState(layout),journal=createJournal(layout),events=createEvents();
 const git=createGit({projectsRoot:layout.projects,binary:options.gitBinary});
 const gitAvailable=await git.available(),identityConfigured=gitAvailable&&await git.identity();
 const recovery:RecoveryOutcome[]=journal.recover();
 const migration:MigrationReport|null=await migrateLegacy({layout,state,journal,git,gitAvailable,identityConfigured},options.migrationHooks);
 const cache:Cache=createCache(layout.cache);
 const scanner=createScanner(layout,cache,git,()=>gitAvailable);
 const examplesDir=options.examplesDir??'public/examples';
 // One queue for registry changes and one per project for file mutations.
 const locks=new Map<string,Promise<unknown>>();
 function lock<T>(key:string,fn:()=>Promise<T>|T):Promise<T>{
  const next=(locks.get(key)??Promise.resolve()).catch(()=>{}).then(fn);
  locks.set(key,next);next.catch(()=>{}).finally(()=>{if(locks.get(key)===next)locks.delete(key);});
  return next;
 }
 const projects=()=>state.registry().projects;
 const entry=(slug:string)=>{const p=projects().find(p=>p.slug===assertSlug(slug));if(!p)throw new NotFoundError('Project not found.');return p;};
 async function rescan(slug:string){const r=await scanner.scan(slug);if(r.changed.length||r.removed.length){events.emit('files',r);notifySuggestions();}return r;}
 // Replace the registry with two renames inside a journal: current → staging, staged → current.
 function registrySteps(stateStaging:string,next:ProjectEntry[]){
  atomicWriteJson(join(stateStaging,'projects.json'),{formatVersion:1,projects:next});
  return [...(existsSync(layout.registry)?[{from:layout.registry,to:join(stateStaging,'projects.previous.json')}]:[]),{from:join(stateStaging,'projects.json'),to:layout.registry}];
 }
 // Grouping suggestions are derived from file facts, memoized by content hash.
 const facts=new Map<string,FileFacts>();
 function indexedFiles():IndexedFile[]{
  return projects().flatMap(p=>cache.files(p.slug).filter(f=>f.visible&&f.docType!=='gitignore').flatMap(f=>{
   let fx=facts.get(f.hash);
   if(!fx){try{fx=factsOf(decode(readFileSync(projectFile(layout,p.slug,f.path))),f.path);}catch{return [];}facts.set(f.hash,fx);}
   return [{project:p.slug,path:f.path,hash:f.hash,facts:fx}];
  }));
 }
 function suggestions(){
  const rejected=new Set(state.suggestions().rejected.map(r=>`${r.hash}:${r.target}`));
  return inferSuggestions(indexedFiles(),rejected,projects().map(p=>p.slug));
 }
 let openSuggestions=-1,suggestionTimer:ReturnType<typeof setTimeout>|undefined;
 function notifySuggestions(){clearTimeout(suggestionTimer);suggestionTimer=setTimeout(()=>{if(closed)return;try{const n=suggestions().length;if(n!==openSuggestions){openSuggestions=n;events.emit('suggestions',{open:n});}}catch{}},50);}
 // Stage a new project folder, then move it and the new registry into place in one journaled operation.
 async function createProjectFolder(name:string,origin:string,files:ImportFile[],preferredSlug?:string){
  return lock('registry',async()=>{
   const current=projects(),finalName=uniqueName(name,current.map(p=>p.name));
   const taken=new Set(current.map(p=>p.slug));for(const s of safeDirs(layout.projects))taken.add(s);
   const slug=preferredSlug&&!taken.has(preferredSlug)?preferredSlug:slugify(finalName,taken);
   const opId=journal.newId(),staging=join(layout.projects,`.staging-${opId}`),stagedProject=join(staging,slug),stateStaging=join(layout.state,`.staging-${opId}`);
   try{
    mkdirSync(stagedProject,{recursive:true});
    for(const f of files){const bytes=encode(f.source),file=join(stagedProject,f.path);atomicWrite(file,bytes);if(sha256(readFileSync(file))!==sha256(bytes))throw Error(`Could not verify ${f.path} after writing.`);}
    if(gitAvailable){await git.init(stagedProject);if(identityConfigured){await git.addAll(stagedProject);await git.commit(stagedProject,files.length?`Import ${files.length} file${files.length===1?'':'s'}`:'Create project',!files.length);}}
    const project:ProjectEntry={slug,name:finalName,createdAt:new Date().toISOString(),origin};
    const steps=[{from:stagedProject,to:projectDir(layout,slug)},...registrySteps(stateStaging,[...current,project])];
    journal.run(origin==='import'?'import':'create',steps,[staging,stateStaging],opId);
    await scanner.scan(slug);watcher?.add(slug);notifySuggestions();
    events.emit('projects',{added:[slug],removed:[],renamed:[]});
    return project;
   }catch(e){rmSync(staging,{recursive:true,force:true});rmSync(stateStaging,{recursive:true,force:true});throw e;}
  });
 }
 function preflight(files:ImportFile[]){
  if(!Array.isArray(files)||!files.length||files.length>500)throw Error('Expected 1–500 files.');
  const paths=new Set<string>(),issues:Issue[]=[];
  for(const f of files){
   if(!f||typeof f.path!=='string'||typeof f.source!=='string')throw Error('Each file needs a path and source text.');
   const path=projectPath(f.path);if(paths.has(path))throw Error(`Duplicate path in batch: ${path}`);paths.add(path);
   const indexed=indexBytes('preflight',path,encode(f.source));
   if(!indexed.file.visible)issues.push({severity:'error',code:'unsupported',path:'/',message:`${path}: unsupported file type.`});
   else if(!indexed.file.valid)issues.push(...indexed.findings.filter(i=>i.severity==='error').map(i=>({...i,message:`${path}: ${i.message}`})));
  }
  if(issues.length)throw new InputError(issues);
  return files.map(f=>({path:projectPath(f.path),source:f.source}));
 }
 // FR-018: a batch is named after the ontology or semantic model it contains.
 function batchName(files:ImportFile[]){
  const models=files.map(f=>validateInput(f.source,posix.basename(f.path)).model);
  for(const kind of ['Ossie ontology','Ossie semantic'])for(const m of models)if(m?.kind===kind&&typeof m.name==='string'&&m.name.trim())return m.name.trim().slice(0,200);
  return posix.basename(files[0].path).replace(/\.[^.]+$/,'')||'Imported files';
 }
 function readFile(slug:string,path:string){
  entry(slug);const file=projectFile(layout,slug,path);
  let bytes:Uint8Array;try{bytes=readFileSync(file);}catch{throw new NotFoundError('File not found.');}
  const p=projectPath(path),hash=sha256(bytes),cached=cache.file(slug,p);
  return {path:p,source:decode(bytes),hash,docType:cached?.docType??'unknown',valid:cached?.valid??false,findings:cached&&cached.hash===hash?cache.findings(slug,p):indexBytes(slug,p,bytes).findings};
 }
 async function saveFile(slug:string,path:string,body:{baseHash:string|null;source?:string;patches?:Patch[]}){
  entry(slug);const p=projectPath(path),file=projectFile(layout,slug,p);
  return lock('project:'+slug,async()=>{
   let current:Uint8Array|null=null;try{current=readFileSync(file);}catch{}
   const currentHash=current?sha256(current):null;
   if(body.baseHash!==currentHash)throw new StaleError(currentHash,current?decode(current):null);
   const base=current?decode(current):'';
   const next=body.source!==undefined?body.source:applyPatches(base,body.patches??[]);
   const bytes=encode(next);
   if(bytes.length>MAX_INPUT_BYTES)throw new InputError([{severity:'error',code:'size',path:'/',message:'The definition exceeds the 2 MB UTF-8 limit. Split it into smaller documents.'}]);
   const indexed=indexBytes(slug,p,bytes);
   if(!indexed.file.visible)throw new InputError([{severity:'error',code:'unsupported',path:'/',message:'Unsupported file type.'}]);
   if(!indexed.file.valid)throw new InputError(indexed.findings);
   const hash=atomicWrite(file,bytes);
   state.deleteDraft(slug,p);
   await rescan(slug);
   return {path:p,hash,findings:indexed.findings};
  });
 }
 // Several files of one project in one journaled operation (FR-083: KPI saves, deletes with
 // dependents, confirmed rename rewrites). Every base hash is checked first; the new contents are
 // staged and validated, then each current file is moved aside and the staged one moved in.
 async function saveFiles(slug:string,writes:{path:string;baseHash:string|null;source?:string;patches?:Patch[]}[],kind='save-files'){
  entry(slug);
  if(!Array.isArray(writes)||!writes.length||writes.length>50)throw Error('Expected 1–50 files.');
  const files=writes.map(w=>({...w,path:projectPath(w.path)}));
  if(new Set(files.map(f=>f.path)).size!==files.length)throw Error('Each file may appear once.');
  return lock('project:'+slug,async()=>{
   const prepared=files.map(f=>{
    const file=projectFile(layout,slug,f.path);let current:Uint8Array|null=null;try{current=readFileSync(file);}catch{}
    const currentHash=current?sha256(current):null;
    if(f.baseHash!==currentHash)throw new StaleError(currentHash,current?decode(current):null);
    const next=f.source!==undefined?f.source:applyPatches(current?decode(current):'',f.patches??[]),bytes=encode(next);
    if(bytes.length>MAX_INPUT_BYTES)throw new InputError([{severity:'error',code:'size',path:'/',message:`${f.path}: the definition exceeds the 2 MB UTF-8 limit.`}]);
    const indexed=indexBytes(slug,f.path,bytes);
    if(!indexed.file.visible)throw new InputError([{severity:'error',code:'unsupported',path:'/',message:`${f.path}: unsupported file type.`}]);
    if(!indexed.file.valid)throw new InputError(indexed.findings.map(i=>({...i,message:`${f.path}: ${i.message}`})));
    return {...f,file,exists:!!current,bytes,findings:indexed.findings};
   });
   const opId=journal.newId(),staging=join(layout.projects,`.staging-${opId}`);
   try{
    const steps:{from:string;to:string}[]=[];
    prepared.forEach((f,i)=>{const staged=join(staging,'new',String(i));atomicWrite(staged,f.bytes);if(f.exists)steps.push({from:f.file,to:join(staging,'previous',String(i))});steps.push({from:staged,to:f.file});});
    journal.run(kind,steps,[staging],opId);
   }catch(e){rmSync(staging,{recursive:true,force:true});throw e;}
   for(const f of prepared)state.deleteDraft(slug,f.path);
   await rescan(slug);
   return {written:prepared.map(f=>({path:f.path,hash:sha256(f.bytes),created:!f.exists,findings:f.findings}))};
  });
 }
 // Legacy facade (research R9): flat documents with ids `<project>/<path>` or v0.1.0 ids.
 function resolveId(id:string){
  const legacy=state.legacyIds().ids[id];if(legacy)return legacy;
  const slash=id.indexOf('/');if(slash<1)throw new NotFoundError('Document not found.');
  return {project:id.slice(0,slash),path:id.slice(slash+1)};
 }
 function documents(){
  return projects().flatMap(p=>cache.files(p.slug).filter(f=>f.visible).flatMap(f=>{
   let source:string;try{source=decode(readFileSync(projectFile(layout,p.slug,f.path)));}catch{return [];}
   return [{id:`${p.slug}/${f.path}`,filename:posix.basename(f.path),source,revision:revisionOf(f.hash),hash:f.hash,project:p.slug,path:f.path,updated:f.indexedAt}];
  }));
 }
 const watcher=options.watch?createWatcher(layout,{debounceMs:options.debounceMs,rescanMs:options.rescanMs,onChange:async(slug,gitChanged)=>{
  if(!projects().some(p=>p.slug===slug)||!existsSync(projectDir(layout,slug)))return;
  await rescan(slug);
  if(gitChanged&&gitAvailable)try{const s=await git.status(projectDir(layout,slug));events.emit('git',{project:slug,branch:s.branch,ahead:s.ahead,behind:s.behind,changes:s.changes,altered:[]});}catch{}
 },all:()=>projects().map(p=>p.slug)}):null;
 for(const p of projects())if(existsSync(projectDir(layout,p.slug))){await scanner.scan(p.slug);watcher?.add(p.slug);}
 for(const r of recovery)events.emit('recovery',r);
 let closed=false;
 const trash=createTrash({layout,state,journal,lock,projects,registrySteps,now:options.now,emit:(e,d)=>events.emit(e,d),
  afterFiles:slug=>rescan(slug),
  forgetProject:slug=>{watcher?.remove(slug);cache.removeProject(slug);notifySuggestions();},
  adoptProject:async slug=>{await scanner.scan(slug);watcher?.add(slug);notifySuggestions();},
  createProject:(name,origin,files)=>createProjectFolder(name,origin,files)});
 // Move a file between projects (FR-020), journaled with its draft and view settings.
 async function moveFile(slug:string,path:string,toProject:string,toPath?:string,keepBoth=false){
  entry(slug);entry(toProject);const from=projectPath(path);let to=projectPath(toPath??posix.basename(from));
  const [a,b]=[slug,toProject].sort();
  return lock('project:'+a,()=>lock(a===b?'none':'project:'+b,async()=>{
   const src=projectFile(layout,slug,from);if(!existsSync(src))throw new NotFoundError('File not found.');
   if(slug===toProject&&from===to)return {project:toProject,path:to};
   if(existsSync(projectFile(layout,toProject,to))){
    const free=disambiguate(to,new Set(cache.files(toProject).map(f=>f.path)));
    if(!keepBoth)throw new OccupiedError(`${to} already exists in the target project; nothing was overwritten.`,{toProject,toPath:free});
    to=free;
   }
   const steps=[{from:src,to:projectFile(layout,toProject,to)}];
   if(existsSync(state.draftFile(slug,from))&&!existsSync(state.draftFile(toProject,to)))steps.push({from:state.draftFile(slug,from),to:state.draftFile(toProject,to)});
   journal.run('move',steps);
   const view=state.view(slug).files[from];
   if(view!==undefined){const files={...state.view(slug).files};delete files[from];state.writeView(slug,files);state.writeView(toProject,{...state.view(toProject).files,[to]:view});}
   const draft=state.draft(toProject,to);if(draft&&draft.project!==toProject||draft&&draft.path!==to)state.writeDraft(toProject,to,{baseHash:draft.baseHash,text:draft.text,patches:draft.patches});
   await rescan(slug);if(toProject!==slug)await rescan(toProject);
   return {project:toProject,path:to};
  }));
 }
 // Import into an existing project (FR-029): name clashes are a 409 unless the caller chose.
 async function importInto(slug:string,files:ImportFile[],onConflict?:'replace'|'keep-both'){
  entry(slug);const batch=preflight(files);
  if(onConflict!==undefined&&onConflict!=='replace'&&onConflict!=='keep-both')throw Error('onConflict must be replace or keep-both.');
  return lock('project:'+slug,async()=>{
   const dir=projectDir(layout,slug),existing=new Set(cache.files(slug).map(f=>f.path));
   for(const f of batch)if(existsSync(join(dir,f.path)))existing.add(f.path);
   const conflicts=batch.filter(f=>existing.has(f.path)).map(f=>f.path);
   if(conflicts.length&&!onConflict)throw new ConflictError(conflicts);
   const opId=journal.newId(),staging=join(layout.projects,`.staging-${opId}`),steps:{from:string;to:string}[]=[],written:{path:string;hash:string}[]=[];
   const taken=new Set([...existing,...batch.map(f=>f.path)]);
   try{
    for(const f of batch){
     let path=f.path;
     if(existing.has(path)&&onConflict==='keep-both'){path=disambiguate(path,taken);taken.add(path);}
     const staged=join(staging,'new',path);atomicWrite(staged,encode(f.source));
     if(existing.has(path))steps.push({from:join(dir,path),to:join(staging,'replaced',path)});
     steps.push({from:staged,to:join(dir,path)});written.push({path,hash:sha256(encode(f.source))});
    }
    journal.run('import',steps,[staging],opId);
   }catch(e){rmSync(staging,{recursive:true,force:true});throw e;}
   await rescan(slug);
   return {written};
  });
 }
 // What a delete would remove and break (FR-022): unsaved drafts and Ossie references that would
 // no longer resolve to any remaining file.
 function deleteImpact(slug:string,path?:string){
  entry(slug);const p=path===undefined?undefined:projectPath(path);
  if(p!==undefined&&!cache.file(slug,p))throw new NotFoundError('File not found.');
  const removed=(f:{project:string;path:string})=>f.project===slug&&(p===undefined||f.path===p);
  const all=indexedFiles(),gone=all.filter(removed),kept=all.filter(f=>!removed(f));
  const brokenReferences:{from:{project:string;path:string};to:{project:string;path:string};kind:string;name:string}[]=[];
  for(const k of kept)for(const ref of k.facts.refs){
   const targets=gone.filter(g=>g.facts.names.includes(ref));
   if(targets.length&&!kept.some(o=>o!==k&&o.facts.names.includes(ref)))for(const g of targets)brokenReferences.push({from:{project:k.project,path:k.path},to:{project:g.project,path:g.path},kind:'ossie-ref-name',name:ref});
  }
  return {removes:p===undefined?{project:slug,name:entry(slug).name,files:cache.files(slug).map(f=>f.path)}:{project:slug,files:[p]},
   unsavedDrafts:state.drafts().filter(removed).map(d=>({project:d.project,path:d.path})),brokenReferences};
 }
 async function acceptSuggestion(id:string){
  const s=suggestions().find(x=>x.id===id);if(!s)throw new NotFoundError('Suggestion not found or no longer valid.');
  const moved=await moveFile(s.file.project,s.file.path,s.targetProject,undefined,true);
  notifySuggestions();return moved;
 }
 function rejectSuggestion(id:string){
  const s=suggestions().find(x=>x.id===id);if(!s)throw new NotFoundError('Suggestion not found or no longer valid.');
  const current=state.suggestions().rejected;
  state.writeSuggestions([...current,{hash:s.file.hash,target:s.targetProject,project:s.file.project,path:s.file.path,rejectedAt:new Date().toISOString()}]);
  notifySuggestions();events.emit('suggestions',{open:suggestions().length});
 }
 return {
  layout,state,cache,events,git,journal,gitAvailable,identityConfigured,recovery,migration,
  lock,rescan,project:entry,registrySteps,readFile,saveFile,saveFiles,documents,resolveId,preflight,trash,moveFile,importInto,deleteImpact,suggestions,acceptSuggestion,rejectSuggestion,
  async listProjects(){
   return Promise.all(projects().map(async p=>{
    let gitInfo={branch:'',ahead:0,behind:0,changes:0};
    if(gitAvailable&&existsSync(projectDir(layout,p.slug)))try{const s=await git.status(projectDir(layout,p.slug));gitInfo={branch:s.branch,ahead:s.ahead,behind:s.behind,changes:s.changes};}catch{}
    return {slug:p.slug,name:p.name,origin:p.origin,createdAt:p.createdAt,...gitInfo,files:cache.files(p.slug).filter(f=>f.visible).map(f=>({path:f.path,docType:f.docType,layout:f.layout,valid:f.valid,visible:f.visible,gitState:f.gitState,hash:f.hash}))};
   }));
  },
  createProject:(name:unknown)=>createProjectFolder(projectName(name,projects().map(p=>p.name)),'import',[]),
  async importBatch(body:{name?:unknown;files:ImportFile[]}){
   const files=preflight(body.files);
   const name=body.name===undefined?batchName(files):projectName(body.name);
   const project=await createProjectFolder(name,'import',files);
   return {slug:project.slug,name:project.name,written:files.map(f=>({path:f.path,hash:sha256(encode(f.source))}))};
  },
  async loadExample(id:string){
   const set=exampleSet(id);if(!set)throw new NotFoundError('Unknown example.');
   const existing=projects().find(p=>p.origin===`example:${id}`);
   if(existing&&existsSync(projectDir(layout,existing.slug)))return {slug:existing.slug,name:existing.name,created:false};
   const files=set.files.map(name=>({path:name,source:readFileSync(join(examplesDir,set.folder,name),'utf8')}));
   // A project that already holds every example file with identical bytes is opened, not duplicated.
   const hashes=new Map(files.map(f=>[f.path,sha256(encode(f.source))]));
   const same=projects().find(p=>files.every(f=>cache.file(p.slug,f.path)?.hash===hashes.get(f.path)));
   if(same)return {slug:same.slug,name:same.name,created:false};
   const project=await createProjectFolder(set.name,`example:${id}`,files,set.id);
   return {slug:project.slug,name:project.name,created:true};
  },
  renameProject:(slug:string,name:unknown)=>lock('registry',()=>{
   const current=projects(),p=entry(slug),value=projectName(name,current.map(x=>x.name),p.name);
   state.writeRegistry(current.map(x=>x.slug===slug?{...x,name:value}:x));
   events.emit('projects',{added:[],removed:[],renamed:[{slug,name:value}]});
   return {slug,name:value};
  }),
  // Facade save: new documents go to the "Ungrouped" project; existing ones need their base version.
  async saveDocument(filename:string,source:string,id?:string,version?:{revision?:number;baseHash?:string}){
   if(id===undefined){
    let target=projects().find(p=>p.slug==='ungrouped');
    const path=projectPath(filename);preflight([{path,source}]);
    if(!target)target=await createProjectFolder('Ungrouped','import',[],'ungrouped');
    const taken=new Set(cache.files(target.slug).map(f=>f.path)),free=disambiguate(path,taken);
    await saveFile(target.slug,free,{baseHash:null,source});
    return documents().find(d=>d.project===target!.slug&&d.path===free)!;
   }
   const ref=resolveId(id);if(posix.basename(ref.path)!==filename)throw Error('Renaming through the documents API is not supported.');
   let current:string|null=null;try{current=sha256(readFileSync(projectFile(layout,ref.project,ref.path)));}catch{throw new NotFoundError('Document not found.');}
   const base=version?.baseHash??(version?.revision!==undefined&&version.revision===revisionOf(current)?current:undefined);
   if(base===undefined)throw new StaleError(current,null);
   await saveFile(ref.project,ref.path,{baseHash:base,source});
   return documents().find(d=>d.project===ref.project&&d.path===ref.path)!;
  },
  grouping(id:string){const ref=resolveId(id);return (state.view(ref.project).files[ref.path]??{}) as object;},
  saveGrouping(id:string,value:unknown){
   const ref=resolveId(id);if(!cache.file(ref.project,ref.path))throw new NotFoundError('Document not found.');
   return lock('project:'+ref.project,()=>{const view=state.view(ref.project);state.writeView(ref.project,{...view.files,[ref.path]:value});return value;});
  },
  close(){if(closed)return;closed=true;clearTimeout(suggestionTimer);watcher?.close();cache.close();},
 };
}
function safeDirs(dir:string){try{return readdirSync(dir);}catch{return [];}}
export type Workspace=Awaited<ReturnType<typeof openWorkspace>>;
export {PathError};

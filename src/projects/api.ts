import type {KpiSummary,KpiExplanation} from '../../server/agent/explain';
// Browser client for the project API (contracts/http-api.md).
export type ProjectFile={path:string;docType:string;layout?:string|null;valid:boolean;visible:boolean;gitState:string;hash:string};
export type ProjectInfo={slug:string;name:string;origin:string;branch:string;ahead:number;behind:number;changes:number;files:ProjectFile[]};
export type TrashItem={entryId:string;kind:'file'|'project';project:string;projectName:string;path?:string;deletedAt:string;undoUntil:string;batchId:string|null};
export type Impact={removes:{project:string;name?:string;files:string[]};unsavedDrafts:{project:string;path:string}[];brokenReferences:{from:{project:string;path:string};to:{project:string;path:string};kind:string;name:string}[]};
export type Suggestion={id:string;file:{project:string;path:string;hash:string};targetProject:string;evidence:{kind:string;detail:string;otherFile:{project:string;path:string}}[]};
export type ImportCommit={committed:true;commit:string;message:string}|{committed:false;reason:'no-git'|'no-identity'|'merging'|'nothing'};
export type Deleted={entryIds:string[];undoUntil:string;label:string};
export type Doc={id:string;project:string;path:string;filename:string;source:string;hash:string};
export type WorkspaceStatus={gitAvailable:boolean;identityConfigured:boolean;migration:null|{status:'completed'|'postponed'|'failed';reason?:string;backup?:string;projects:{slug:string;name:string;files:number}[];files:number;verified:number};recovery:{opId:string;kind:string;outcome:string;paths:string[]}[]};
export type GitChange={path:string;orig?:string;index:string;worktree:string;conflicted:boolean;untracked:boolean;hidden:boolean;label?:string};
export type GitStatus={branch:string;upstream:string;ahead:number;behind:number;gitAvailable:boolean;identityConfigured:boolean;merging:boolean;remotes:Record<string,string>;changes:GitChange[]};
export type RemoteResult={ok:boolean;cancelled?:boolean;ahead:number;behind:number;conflicted:string[];altered:string[];stderr:string};
export type GitDiff={path:string;from:string;to:string;before:string;after:string;binary:boolean;beforeExists:boolean;afterExists:boolean};
export type GitCommit={commit:string;author:string;date:string;message:string};
// 409 from pull, sync or switch: unsaved drafts or a dirty tree (FR-065).
export class Blocked extends Error{constructor(public reason:'drafts'|'dirty',public paths:string[],message:string){super(message);}}
export class StaleSave extends Error{constructor(public currentHash:string|null,public currentSource:string|null){super('This file changed since you opened it.');}}
export const docId=(project:string,path:string)=>`${project}/${path}`;
export const fileUrl=(project:string,path:string)=>`/api/projects/${encodeURIComponent(project)}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
async function json<T>(response:Response):Promise<T>{
 const body=await response.json().catch(()=>({error:`Request failed (${response.status}).`}));
 if(!response.ok){const error=Object.assign(Error(body.error??`Request failed (${response.status}).`),{status:response.status,body});throw error;}
 return body as T;
}
const send=(method:string,body?:unknown)=>({method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
export type KpiSaveRequest={semanticPath:string;modelPath?:(string|number)[];existing?:boolean;metric:{name:string;expression:string;description?:string;datatype?:string};extension:Record<string,any>;binding?:{measures:string;of?:string}};
export type ExplainQuery={grain?:string;dimensions?:string[];rollup?:string};
const explainQuery=(q:ExplainQuery)=>{const p=new URLSearchParams();if(q.grain)p.set('grain',q.grain);for(const d of q.dimensions??[])p.append('dimension',d);if(q.rollup)p.set('rollup',q.rollup);const s=p.toString();return s?'?'+s:'';};
export const api={
 metrics:(project:string)=>fetch(`/api/projects/${encodeURIComponent(project)}/metrics`).then(r=>json<KpiSummary[]>(r)),
 explain:(project:string,path:string,metric:string,q:ExplainQuery={},signal?:AbortSignal)=>fetch(`${fileUrl(project,path)}/explain/${encodeURIComponent(metric)}${explainQuery(q)}`,{signal}).then(r=>json<KpiExplanation>(r)),
 status:()=>fetch('/api/status').then(r=>json<WorkspaceStatus>(r)),
 projects:()=>fetch('/api/projects').then(r=>json<ProjectInfo[]>(r)),
 file:(project:string,path:string)=>fetch(fileUrl(project,path)).then(r=>json<{path:string;source:string;hash:string;docType:string}>(r)),
 // A save sends patches against the version it started from when it has them (FR-046), else the text.
 async save(project:string,path:string,baseHash:string|null,source:string,patches?:{from:number;to:number;insert:string}[]){
  const response=await fetch(fileUrl(project,path),send('PUT',patches&&baseHash!==null?{baseHash,patches}:{baseHash,source}));
  if(response.status===409){const body=await response.json();throw new StaleSave(body.currentHash,body.currentSource);}
  return json<{path:string;hash:string}>(response);
 },
 // Several files of one project in one journaled save; a stale base hash rejects the whole batch.
 async saveBatch(project:string,files:{path:string;baseHash:string|null;source?:string;patches?:{from:number;to:number;insert:string}[]}[]){
  const response=await fetch(`/api/projects/${encodeURIComponent(project)}/save-batch`,send('POST',{files}));
  if(response.status===409){const body=await response.json();throw new StaleSave(body.currentHash,body.currentSource);}
  return json<{written:{path:string;hash:string;created:boolean}[]}>(response);
 },
 previewKpi:(project:string,body:KpiSaveRequest)=>fetch(`/api/projects/${encodeURIComponent(project)}/metrics/preview`,send('POST',body)).then(r=>json<{changes:{path:string;created:boolean;added:string[];removed:string[]}[];explanation:KpiExplanation}>(r)),
 async saveKpi(project:string,body:KpiSaveRequest&{baseHashes:Record<string,string>}){
  const response=await fetch(`/api/projects/${encodeURIComponent(project)}/metrics`,send('POST',body));
  if(response.status===409){const b=await response.json();throw new StaleSave(b.currentHash,b.currentSource);}
  return json<{written:{path:string;hash:string;created:boolean}[]}>(response);
 },
 importBatch:(files:{path:string;source:string}[],name?:string)=>fetch('/api/import',send('POST',{files,...(name?{name}:{})})).then(r=>json<{slug:string;name:string;written:{path:string;hash:string}[];commit?:ImportCommit}>(r)),
 deleteImpact:(project:string,path?:string)=>fetch(`/api/projects/${encodeURIComponent(project)}/delete-impact${path!==undefined?'?path='+encodeURIComponent(path):''}`).then(r=>json<Impact>(r)),
 deleteFile:(project:string,path:string)=>fetch(fileUrl(project,path),send('DELETE',{confirm:true})).then(r=>json<{entryId:string;undoUntil:string}>(r)),
 deleteProject:(project:string)=>fetch(`/api/projects/${encodeURIComponent(project)}`,send('DELETE',{confirm:true})).then(r=>json<{entryId:string;undoUntil:string}>(r)),
 clear:()=>fetch('/api/clear',send('POST',{confirm:true})).then(r=>json<{batchId:string|null;entries:string[];undoUntil:string|null}>(r)),
 trash:()=>fetch('/api/trash').then(r=>json<TrashItem[]>(r)),
 undo:(id:string)=>fetch(`/api/trash/${id}/undo`,send('POST')).then(r=>json<any>(r)),
 restore:(id:string,target:{toProject?:string;toPath?:string}={})=>fetch(`/api/trash/${id}/restore`,send('POST',target)).then(r=>json<any>(r)),
 purge:(id:string)=>fetch(`/api/trash/${id}`,send('DELETE',{confirm:true})).then(r=>{if(!r.ok)return json(r);}),
 emptyTrash:()=>fetch('/api/trash',send('DELETE',{confirm:true})).then(r=>{if(!r.ok)return json(r);}),
 drafts:()=>fetch('/api/drafts').then(r=>json<{project:string;path:string}[]>(r)),
 rename:(project:string,name:string)=>fetch(`/api/projects/${encodeURIComponent(project)}`,send('PATCH',{name})).then(r=>json<{slug:string;name:string}>(r)),
 move:(project:string,path:string,toProject:string,toPath?:string)=>fetch(`/api/projects/${encodeURIComponent(project)}/move`,send('POST',{path,toProject,...(toPath?{toPath}:{})})).then(r=>json<{project:string;path:string}>(r)),
 importInto:(project:string,files:{path:string;source:string}[],onConflict?:'replace'|'keep-both')=>fetch(`/api/projects/${encodeURIComponent(project)}/import`,send('POST',{files,...(onConflict?{onConflict}:{})})).then(r=>json<{written:{path:string;hash:string}[];commit?:ImportCommit}>(r)),
 suggestions:()=>fetch('/api/suggestions').then(r=>json<Suggestion[]>(r)),
 acceptSuggestion:(id:string)=>fetch(`/api/suggestions/${id}/accept`,send('POST')).then(r=>json<{project:string;path:string}>(r)),
 rejectSuggestion:(id:string)=>fetch(`/api/suggestions/${id}/reject`,send('POST')).then(r=>json<unknown>(r)),
 example:(id:string)=>fetch(`/api/examples/${encodeURIComponent(id)}`,send('POST')).then(r=>json<{slug:string;name:string;created:boolean;commit?:ImportCommit}>(r)),
};
const gitUrl=(project:string,action:string)=>`/api/projects/${encodeURIComponent(project)}/${action}`;
async function gitPost<T>(project:string,action:string,body?:unknown):Promise<T>{
 const response=await fetch(gitUrl(project,action),send('POST',body));
 if(response.status===409){const b=await response.json();throw new Blocked(b.error,b.paths??[],b.message??b.error);}
 return json<T>(response);
}
export const scm={
 status:(p:string)=>fetch(gitUrl(p,'git/status')).then(r=>json<GitStatus>(r)),
 diff:(p:string,path:string,from='HEAD',to='worktree')=>fetch(gitUrl(p,'git/diff')+`?path=${encodeURIComponent(path)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(r=>json<GitDiff>(r)),
 stage:(p:string,paths:string[]|'all')=>gitPost<GitStatus>(p,'git/stage',paths==='all'?{all:true}:{paths}),
 unstage:(p:string,paths:string[]|'all')=>gitPost<GitStatus>(p,'git/unstage',paths==='all'?{all:true}:{paths}),
 // `paths`: commit exactly these files (git commit --only); `push`: then push and report the outcome.
 async commit(p:string,message:string,options:{paths?:string[];push?:boolean}={}){
  const response=await fetch(gitUrl(p,'git/commit'),send('POST',{message,...options}));
  if(response.status===409){const b=await response.json();throw Object.assign(Error(b.message??b.error),{status:409,body:b});}
  return json<{commit:string;altered:string[];pushed?:{ok:boolean;message:string}}>(response);
 },
 // Revert to last commit (FR-046): `baseHash` is the hash of the file now on disk (null if absent).
 async revert(p:string,path:string,baseHash:string|null){
  const response=await fetch(gitUrl(p,'git/revert'),send('POST',{path,baseHash}));
  if(response.status===409){const b=await response.json();throw new StaleSave(b.currentHash,b.currentSource);}
  return json<{hash:string|null;trashEntry:string|null}>(response);
 },
 branches:(p:string)=>fetch(gitUrl(p,'git/branches')).then(r=>json<{current:string;local:string[];remote:string[]}>(r)),
 switch:(p:string,branch:string,create=false)=>gitPost<{branch:string;altered:string[]}>(p,'git/switch',{branch,create}),
 setRemote:(p:string,name:string,url:string)=>fetch(gitUrl(p,'git/remote'),send('PUT',{name,url})).then(r=>json<{name:string;url:string}>(r)),
 remote:(p:string,action:'fetch'|'pull'|'push'|'sync')=>gitPost<RemoteResult>(p,'git/'+action),
 cancel:(p:string)=>gitPost<{cancelled:boolean}>(p,'git/cancel'),
 log:(p:string,path?:string,limit=50)=>fetch(gitUrl(p,'git/log')+`?limit=${limit}${path?'&path='+encodeURIComponent(path):''}`).then(r=>json<GitCommit[]>(r)),
 versions:(p:string,path:string,limit=20)=>fetch(gitUrl(p,'git/versions')+`?path=${encodeURIComponent(path)}&limit=${limit}`).then(r=>json<(GitCommit&{source:string})[]>(r)),
 ignore:(p:string,pattern:string)=>gitPost<{hash:string;added:boolean;tracked:string[]}>(p,'gitignore',{pattern}),
 saveDraft:(p:string,path:string,baseHash:string|null,text:string)=>fetch(`/api/drafts/${encodeURIComponent(p)}/${path.split('/').map(encodeURIComponent).join('/')}`,send('PUT',{baseHash,text,patches:[]})),
 deleteDraft:(p:string,path:string)=>fetch(`/api/drafts/${encodeURIComponent(p)}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE'}),
};
// Load every visible file of every project, reusing already loaded sources whose hash is unchanged.
export async function loadWorkspace(previous:Map<string,Doc>){
 const projects=await api.projects();
 const docs=await Promise.all(projects.flatMap(p=>p.files.filter(f=>f.visible).map(async f=>{
  const id=docId(p.slug,f.path),old=previous.get(id);
  if(old&&old.hash===f.hash)return old;
  try{const file=await api.file(p.slug,f.path);return {id,project:p.slug,path:f.path,filename:f.path.split('/').pop()!,source:file.source,hash:file.hash} as Doc;}
  catch{return null;}
 })));
 return {projects,docs:docs.filter((d):d is Doc=>!!d)};
}

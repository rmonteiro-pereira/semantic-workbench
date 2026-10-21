// Browser client for the project API (contracts/http-api.md).
export type ProjectFile={path:string;docType:string;valid:boolean;visible:boolean;gitState:string;hash:string};
export type ProjectInfo={slug:string;name:string;origin:string;branch:string;ahead:number;behind:number;changes:number;files:ProjectFile[]};
export type TrashItem={entryId:string;kind:'file'|'project';project:string;projectName:string;path?:string;deletedAt:string;undoUntil:string;batchId:string|null};
export type Impact={removes:{project:string;name?:string;files:string[]};unsavedDrafts:{project:string;path:string}[];brokenReferences:{from:{project:string;path:string};to:{project:string;path:string};kind:string;name:string}[]};
export type Suggestion={id:string;file:{project:string;path:string;hash:string};targetProject:string;evidence:{kind:string;detail:string;otherFile:{project:string;path:string}}[]};
export type Deleted={entryIds:string[];undoUntil:string;label:string};
export type Doc={id:string;project:string;path:string;filename:string;source:string;hash:string};
export type WorkspaceStatus={gitAvailable:boolean;identityConfigured:boolean;migration:null|{status:'completed'|'postponed'|'failed';reason?:string;backup?:string;projects:{slug:string;name:string;files:number}[];files:number;verified:number};recovery:{opId:string;kind:string;outcome:string;paths:string[]}[]};
export class StaleSave extends Error{constructor(public currentHash:string|null,public currentSource:string|null){super('This file changed since you opened it.');}}
export const docId=(project:string,path:string)=>`${project}/${path}`;
export const fileUrl=(project:string,path:string)=>`/api/projects/${encodeURIComponent(project)}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
async function json<T>(response:Response):Promise<T>{
 const body=await response.json().catch(()=>({error:`Request failed (${response.status}).`}));
 if(!response.ok){const error=Object.assign(Error(body.error??`Request failed (${response.status}).`),{status:response.status,body});throw error;}
 return body as T;
}
const send=(method:string,body?:unknown)=>({method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
export const api={
 status:()=>fetch('/api/status').then(r=>json<WorkspaceStatus>(r)),
 projects:()=>fetch('/api/projects').then(r=>json<ProjectInfo[]>(r)),
 file:(project:string,path:string)=>fetch(fileUrl(project,path)).then(r=>json<{path:string;source:string;hash:string;docType:string}>(r)),
 async save(project:string,path:string,baseHash:string|null,source:string){
  const response=await fetch(fileUrl(project,path),send('PUT',{baseHash,source}));
  if(response.status===409){const body=await response.json();throw new StaleSave(body.currentHash,body.currentSource);}
  return json<{path:string;hash:string}>(response);
 },
 importBatch:(files:{path:string;source:string}[],name?:string)=>fetch('/api/import',send('POST',{files,...(name?{name}:{})})).then(r=>json<{slug:string;name:string;written:{path:string;hash:string}[]}>(r)),
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
 importInto:(project:string,files:{path:string;source:string}[],onConflict?:'replace'|'keep-both')=>fetch(`/api/projects/${encodeURIComponent(project)}/import`,send('POST',{files,...(onConflict?{onConflict}:{})})).then(r=>json<{written:{path:string;hash:string}[]}>(r)),
 suggestions:()=>fetch('/api/suggestions').then(r=>json<Suggestion[]>(r)),
 acceptSuggestion:(id:string)=>fetch(`/api/suggestions/${id}/accept`,send('POST')).then(r=>json<{project:string;path:string}>(r)),
 rejectSuggestion:(id:string)=>fetch(`/api/suggestions/${id}/reject`,send('POST')).then(r=>json<unknown>(r)),
 example:(id:string)=>fetch(`/api/examples/${encodeURIComponent(id)}`,send('POST')).then(r=>json<{slug:string;name:string;created:boolean}>(r)),
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

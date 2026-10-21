// Browser client for the project API (contracts/http-api.md).
export type ProjectFile={path:string;docType:string;valid:boolean;visible:boolean;gitState:string;hash:string};
export type ProjectInfo={slug:string;name:string;origin:string;branch:string;ahead:number;behind:number;changes:number;files:ProjectFile[]};
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

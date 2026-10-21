import {lstatSync} from 'node:fs';
import {resolve,sep,join,posix} from 'node:path';
// Data root layout (data-model.md). DATA_DIR overrides `data/` so tests and browser checks never
// touch the owner's workspace.
export type DataLayout={root:string;projects:string;state:string;views:string;drafts:string;journal:string;trash:string;backup:string;cache:string;legacyDb:string;registry:string;legacyIds:string};
export function dataLayout(root=process.env.DATA_DIR||'data'):DataLayout{
 const r=resolve(root),state=join(r,'state');
 return {root:r,projects:join(r,'projects'),state,views:join(state,'views'),drafts:join(state,'drafts'),journal:join(state,'journal'),trash:join(r,'trash'),backup:join(r,'backup'),cache:join(r,'cache.sqlite'),legacyDb:join(r,'workbench.sqlite'),registry:join(state,'projects.json'),legacyIds:join(state,'legacy-ids.json')};
}
export class PathError extends Error{constructor(message:string){super(message);this.name='PathError';}}
export const SLUG=/^[a-z0-9][a-z0-9-]{0,62}$/;
export function assertSlug(slug:unknown):string{if(typeof slug!=='string'||!SLUG.test(slug))throw new PathError('Invalid project id.');return slug;}
// Project-relative POSIX paths only: no absolute paths, no `..` or `.` segments, nothing under `.git/`.
export function projectPath(path:unknown):string{
 if(typeof path!=='string'||!path||path.length>1024||/[\x00-\x1f\\]/.test(path))throw new PathError('Invalid file path.');
 if(path.startsWith('/')||/^[a-zA-Z]:/.test(path))throw new PathError('Absolute paths are not allowed.');
 const parts=path.split('/');
 if(parts.some(p=>p===''||p==='.'||p==='..'))throw new PathError('Paths may not contain empty, "." or ".." segments.');
 if(parts.some(p=>p.toLowerCase()==='.git'))throw new PathError('Paths under .git are not allowed.');
 return posix.normalize(path);
}
export function projectDir(layout:DataLayout,slug:string){return join(layout.projects,assertSlug(slug));}
// Absolute location of a project file, re-checked to stay inside the project folder. A symbolic
// link anywhere on the way (for example one checked out from a pulled repository) could lead
// outside it, so no existing segment may be a link; reads and writes both go through here.
export function projectFile(layout:DataLayout,slug:string,path:string){
 const dir=projectDir(layout,slug),rel=projectPath(path),file=resolve(dir,rel);
 if(!file.startsWith(dir+sep))throw new PathError('Path escapes the project folder.');
 assertNoLinks(dir,rel);
 return file;
}
export function assertNoLinks(dir:string,rel:string){
 let at=dir;
 for(const part of rel.split('/')){
  at=join(at,part);
  let link=false;try{link=lstatSync(at).isSymbolicLink();}catch{return;}
  if(link)throw new PathError('Symbolic links are not followed.');
 }
}
export function projectName(name:unknown,existing:string[]=[],except?:string):string{
 if(typeof name!=='string')throw new PathError('Project name must be text.');
 const value=name.trim();
 if(!value||value.length>200||/[\x00-\x1f]/.test(value))throw new PathError('Use a project name of 1–200 characters.');
 if(existing.some(n=>n!==except&&n.toLocaleLowerCase()===value.toLocaleLowerCase()))throw new PathError(`A project named "${value}" already exists.`);
 return value;
}
export function slugify(name:string,taken:Set<string>){
 const base=(name.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,56)||'project').replace(/-+$/,'');
 let slug=base,i=2;while(taken.has(slug))slug=`${base}-${i++}`;
 return assertSlug(slug);
}
export function uniqueName(name:string,existing:string[]){
 const lower=new Set(existing.map(n=>n.toLocaleLowerCase()));let value=name,i=2;
 while(lower.has(value.toLocaleLowerCase()))value=`${name} (${i++})`;return value;
}
// `name.ext` → `name (2).ext` until free (migration and keep-both imports).
export function disambiguate(path:string,taken:Set<string>){
 if(!taken.has(path))return path;
 const slash=path.lastIndexOf('/')+1,base=path.slice(slash),dot=base.lastIndexOf('.');
 const stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):'';
 for(let i=2;;i++){const candidate=path.slice(0,slash)+`${stem} (${i})${ext}`;if(!taken.has(candidate))return candidate;}
}

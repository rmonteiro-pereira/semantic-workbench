import {readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {atomicWriteJson,readJsonFile,sha256} from './atomic';
import {assertSlug,projectPath,type DataLayout} from './paths';
// Durable application state (research R6): one human-readable JSON file per concern, each with a
// formatVersion, always replaced atomically. The SQLite cache never holds anything listed here.
export const STATE_FORMAT=1;
export type ProjectEntry={slug:string;name:string;createdAt:string;origin:string};
export type Registry={formatVersion:1;projects:ProjectEntry[]};
export type ViewState={formatVersion:1;files:Record<string,unknown>};
export type Patch={from:number;to:number;insert:string};
export type Draft={formatVersion:1;project:string;path:string;baseHash:string|null;text:string;patches:Patch[];updatedAt:string};
export type LegacyIds={formatVersion:1;ids:Record<string,{project:string;path:string}>};
function load<T extends {formatVersion:number}>(path:string,empty:()=>T):T{
 const value=readJsonFile<T>(path);if(value===null)return empty();
 if(!value||typeof value!=='object'||value.formatVersion!==STATE_FORMAT)throw Error(`Unsupported state file format in ${path}.`);
 return value;
}
export function createState(layout:DataLayout){
 const viewFile=(slug:string)=>join(layout.views,assertSlug(slug)+'.json');
 const draftFile=(slug:string,path:string)=>join(layout.drafts,assertSlug(slug),sha256(projectPath(path))+'.json');
 return {
  registry:()=>load<Registry>(layout.registry,()=>({formatVersion:STATE_FORMAT,projects:[]})),
  hasRegistry:()=>readJsonFile(layout.registry)!==null,
  writeRegistry:(projects:ProjectEntry[])=>atomicWriteJson(layout.registry,{formatVersion:STATE_FORMAT,projects}),
  view:(slug:string)=>load<ViewState>(viewFile(slug),()=>({formatVersion:STATE_FORMAT,files:{}})),
  writeView:(slug:string,files:Record<string,unknown>)=>atomicWriteJson(viewFile(slug),{formatVersion:STATE_FORMAT,files}),
  draft:(slug:string,path:string)=>{const d=readJsonFile<Draft>(draftFile(slug,path));if(d&&d.formatVersion!==STATE_FORMAT)throw Error('Unsupported draft format.');return d;},
  writeDraft:(slug:string,path:string,draft:{baseHash:string|null;text:string;patches:Patch[]})=>{const value:Draft={formatVersion:STATE_FORMAT,project:slug,path:projectPath(path),...draft,updatedAt:new Date().toISOString()};atomicWriteJson(draftFile(slug,path),value);return value;},
  deleteDraft:(slug:string,path:string)=>rmSync(draftFile(slug,path),{force:true}),
  drafts:():Draft[]=>{let slugs:string[]=[];try{slugs=readdirSync(layout.drafts);}catch{return [];}
   return slugs.flatMap(slug=>readdirSync(join(layout.drafts,slug)).filter(f=>f.endsWith('.json')).map(f=>readJsonFile<Draft>(join(layout.drafts,slug,f))!).filter(d=>d?.formatVersion===STATE_FORMAT));},
  legacyIds:()=>load<LegacyIds>(layout.legacyIds,()=>({formatVersion:STATE_FORMAT,ids:{}})),
  writeLegacyIds:(ids:LegacyIds['ids'])=>atomicWriteJson(layout.legacyIds,{formatVersion:STATE_FORMAT,ids}),
 };
}
export type State=ReturnType<typeof createState>;

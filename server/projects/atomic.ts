import {openSync,writeSync,fsyncSync,closeSync,renameSync,unlinkSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,basename,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
export const sha256=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
// Keep a leading BOM: it is part of the file's bytes.
const decoder=new TextDecoder('utf-8',{ignoreBOM:true,fatal:true});
export const encode=(text:string)=>new TextEncoder().encode(text);
export function decode(bytes:Uint8Array){try{return decoder.decode(bytes);}catch{throw Error('The file is not valid UTF-8 text.');}}
function fsyncDir(dir:string){let fd:number|undefined;try{fd=openSync(dir,'r');fsyncSync(fd);}catch{/* some file systems refuse directory fsync */}finally{if(fd!==undefined)closeSync(fd);}}
export const TEMP_SUFFIX='.workbench-tmp';
export const tempPath=(path:string)=>join(dirname(path),`.${basename(path)}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`);
// Test seam: lets crash tests stop between writing the temporary file and the rename.
export type AtomicHooks={beforeRename?:(temp:string)=>void};
// Write a temporary file beside the target, fsync it, rename it over the target and fsync the
// folder. A crash at any point leaves either the old or the new bytes, never a mix.
export function atomicWrite(path:string,data:Uint8Array|string,hooks:AtomicHooks={}){
 const dir=dirname(path);mkdirSync(dir,{recursive:true});
 const bytes=typeof data==='string'?encode(data):data;
 const temp=tempPath(path);
 const fd=openSync(temp,'w',0o644);
 try{let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset);fsyncSync(fd);}
 catch(e){closeSync(fd);try{unlinkSync(temp);}catch{}throw e;}
 closeSync(fd);
 hooks.beforeRename?.(temp);
 renameSync(temp,path);
 fsyncDir(dir);
 return sha256(bytes);
}
export function atomicWriteJson(path:string,value:unknown){return atomicWrite(path,JSON.stringify(value,null,2)+'\n');}
export function readJsonFile<T>(path:string):T|null{
 let text:string;try{text=readFileSync(path,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
 return JSON.parse(text) as T;
}

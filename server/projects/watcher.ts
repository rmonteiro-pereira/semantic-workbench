import {watch,type FSWatcher} from 'node:fs';
import {projectDir,type DataLayout} from './paths';
// Recursive watcher per project folder (research R3): bursts are debounced per project, changes to
// .git/HEAD, .git/index and refs mark a Git change, and a periodic rescan covers missed events.
export const DEBOUNCE_MS=150,RESCAN_MS=60_000;
export function createWatcher(layout:DataLayout,options:{onChange:(slug:string,gitChanged:boolean)=>Promise<void>;all:()=>string[];debounceMs?:number;rescanMs?:number}){
 const debounceMs=options.debounceMs??DEBOUNCE_MS,rescanMs=options.rescanMs??RESCAN_MS;
 const watchers=new Map<string,FSWatcher>(),timers=new Map<string,ReturnType<typeof setTimeout>>(),gitFlags=new Map<string,boolean>();
 const running=new Map<string,Promise<void>>();
 function schedule(slug:string,gitChanged:boolean){
  if(gitChanged)gitFlags.set(slug,true);
  clearTimeout(timers.get(slug));
  timers.set(slug,setTimeout(()=>{
   timers.delete(slug);const g=gitFlags.get(slug)??false;gitFlags.delete(slug);
   const next=(running.get(slug)??Promise.resolve()).then(()=>options.onChange(slug,g)).catch(e=>console.error(`[watcher] ${slug}: ${(e as Error).message}`));
   running.set(slug,next);
  },debounceMs));
 }
 const interval=setInterval(()=>{for(const slug of options.all())schedule(slug,true);},rescanMs);
 return {
  add(slug:string){
   if(watchers.has(slug))return;
   try{
    const w=watch(projectDir(layout,slug),{recursive:true},(_event,name)=>{
     const file=String(name??'').split('\\').join('/');
     if(file==='.git'||file.startsWith('.git/')){if(/^\.git\/(HEAD|index|refs\/)/.test(file))schedule(slug,true);return;}
     schedule(slug,false);
    });
    w.on('error',()=>{w.close();watchers.delete(slug);});
    watchers.set(slug,w);
   }catch(e){console.error(`[watcher] cannot watch ${slug}: ${(e as Error).message}`);}
  },
  remove(slug:string){watchers.get(slug)?.close();watchers.delete(slug);clearTimeout(timers.get(slug));timers.delete(slug);},
  close(){clearInterval(interval);for(const w of watchers.values())w.close();watchers.clear();for(const t of timers.values())clearTimeout(t);timers.clear();},
 };
}

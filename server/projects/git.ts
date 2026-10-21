import {resolve,sep} from 'node:path';
// The machine's Git, invoked with argument arrays (never a shell string), an explicit working
// directory inside data/projects/, no terminal prompts, timeouts and one queue per repository
// (research R5). Credentials come from Git's own configuration; nothing here stores or asks for them.
export const LOCAL_TIMEOUT_MS=30_000;
export type GitResult={code:number;stdout:string;stderr:string};
export class GitError extends Error{constructor(message:string,public result?:GitResult){super(message);this.name='GitError';}}
export type GitOptions={projectsRoot:string;binary?:string;timeoutMs?:number;env?:Record<string,string|undefined>};
export function gitEnv(base:Record<string,string|undefined>=process.env){
 const env:Record<string,string>={};
 for(const [k,v]of Object.entries(base))if(v!==undefined&&!['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_PREFIX'].includes(k))env[k]=v;
 return {...env,GIT_TERMINAL_PROMPT:'0',LC_ALL:'C'};
}
export function createGit(options:GitOptions){
 const root=resolve(options.projectsRoot),binary=options.binary??'git',timeoutMs=options.timeoutMs??LOCAL_TIMEOUT_MS;
 const queues=new Map<string,Promise<unknown>>();
 function insideProjects(cwd:string){const dir=resolve(cwd);if(!dir.startsWith(root+sep))throw new GitError('Git may only run inside data/projects/.');return dir;}
 async function spawnGit(cwd:string,args:string[],stdin?:string,timeout=timeoutMs):Promise<GitResult>{
  if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))throw new GitError('Git arguments must be an array of strings.');
  let proc;
  try{proc=Bun.spawn([binary,...args],{cwd,env:gitEnv(options.env),stdin:stdin===undefined?'ignore':new TextEncoder().encode(stdin),stdout:'pipe',stderr:'pipe'});}
  catch(e){throw new GitError(`Git is not available: ${(e as Error).message}`);}
  // On timeout, kill Git and stop waiting: a child process (hook, helper) may keep the pipes open.
  let timer:ReturnType<typeof setTimeout>|undefined;
  const expired=new Promise<null>(res=>{timer=setTimeout(()=>{proc.kill('SIGKILL');res(null);},timeout);});
  const done=Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
  const result=await Promise.race([done,expired]);clearTimeout(timer);
  if(!result)throw new GitError(`git ${args[0]} timed out after ${Math.round(timeout/1000)} s.`);
  const [stdout,stderr,code]=result;
  return {code,stdout,stderr};
 }
 // Serialize per repository so two operations never interleave on one index.
 async function run(cwd:string,args:string[],opts:{stdin?:string;timeout?:number;allowFailure?:boolean}={}):Promise<GitResult>{
  const dir=insideProjects(cwd);
  if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))throw new GitError('Git arguments must be an array of strings.');
  const previous=queues.get(dir)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{const r=await spawnGit(dir,args,opts.stdin,opts.timeout);if(r.code!==0&&!opts.allowFailure)throw new GitError(r.stderr.trim()||`git ${args[0]} failed with exit code ${r.code}.`,r);return r;});
  queues.set(dir,next);
  next.catch(()=>{}).finally(()=>{if(queues.get(dir)===next)queues.delete(dir);});
  return next;
 }
 return {
  run,
  // Global facts, checked without a repository.
  async available(){try{const r=await spawnGit(root,['--version']);const m=r.stdout.match(/(\d+)\.(\d+)/);return r.code===0&&!!m&&(+m[1]>2||(+m[1]===2&&+m[2]>=40));}catch{return false;}},
  async identity(cwd=root){try{const [name,email]=await Promise.all(['user.name','user.email'].map(k=>spawnGit(cwd,['config','--get',k])));return name.code===0&&!!name.stdout.trim()&&email.code===0&&!!email.stdout.trim();}catch{return false;}},
  async init(cwd:string){
   await run(cwd,['init','-q','-b','main']);
   // Managed repositories keep committed bytes equal to saved bytes.
   await run(cwd,['config','core.autocrlf','false']);
   await run(cwd,['config','core.safecrlf','false']);
  },
  addAll:(cwd:string)=>run(cwd,['add','-A','--','.']),
  commit:async(cwd:string,message:string,allowEmpty=false)=>{if(!message.trim())throw new GitError('A commit message is required.');return run(cwd,['commit','-q',...(allowEmpty?['--allow-empty']:[]),'-F','-'],{stdin:message});},
  // Tracked and untracked files, with .gitignore applied by Git itself.
  async lsFiles(cwd:string){const r=await run(cwd,['--no-optional-locks','-c','core.quotepath=off','ls-files','-co','--exclude-standard','-z']);return [...new Set(r.stdout.split('\0').filter(Boolean))];},
  async status(cwd:string){
   const r=await run(cwd,['--no-optional-locks','-c','core.quotepath=off','status','--porcelain=v2','-z','--branch','--untracked-files=all']);
   return parseStatus(r.stdout);
  },
 };
}
export type Git=ReturnType<typeof createGit>;
export type FileGitState='clean'|'modified'|'added'|'deleted'|'renamed'|'untracked'|'conflicted';
// Minimal porcelain v2 (-z) reader: branch facts and one state per path. Rename entries are
// followed by their original path as a separate NUL-terminated element.
export function parseStatus(output:string){
 const parts=output.split('\0');let branch='',ahead=0,behind=0;const files=new Map<string,FileGitState>();
 for(let i=0;i<parts.length;i++){
  const entry=parts[i];if(!entry)continue;
  if(entry.startsWith('# branch.head '))branch=entry.slice(14);
  else if(entry.startsWith('# branch.ab ')){const m=entry.match(/\+(\d+) -(\d+)/);if(m){ahead=+m[1];behind=+m[2];}}
  else if(entry.startsWith('? '))files.set(entry.slice(2),'untracked');
  else if(entry.startsWith('1 ')){const f=entry.split(' '),xy=f[1];files.set(f.slice(8).join(' '),xy[0]==='A'?'added':xy.includes('D')?'deleted':'modified');}
  else if(entry.startsWith('2 ')){files.set(entry.split(' ').slice(9).join(' '),'renamed');i++;}
  else if(entry.startsWith('u '))files.set(entry.split(' ').slice(10).join(' '),'conflicted');
 }
 return {branch,ahead,behind,changes:files.size,files};
}

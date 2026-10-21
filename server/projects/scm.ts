import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {GitError,type Git,type StatusEntry} from './git';
import {decode,sha256} from './atomic';
import {projectDir,projectPath,type DataLayout} from './paths';
import {serializationOf} from './scanner';
// Source Control for one project folder (Story 9, FR-059–FR-065, FR-091–FR-096): status with
// hidden-file labels, diff texts, stage/unstage, commit, branches, remote actions, history and the
// post-operation check for bytes altered by hooks or filters. Every operation rescans the project.
export class BlockedError extends Error{constructor(public reason:'drafts'|'dirty',public paths:string[]){super(reason==='drafts'?'Save or discard the unsaved edits first.':'Commit or discard the changes first; nothing is stashed automatically.');this.name='BlockedError';}}
export const HIDDEN_LABEL='not shown in workspace';
// Pull and switch need no unsaved drafts and a clean index and working tree (FR-065). Untracked
// files do not block: Git itself refuses to overwrite them.
export function blockers(drafts:string[],entries:StatusEntry[]):BlockedError|null{
 if(drafts.length)return new BlockedError('drafts',drafts);
 const dirty=entries.filter(e=>!e.untracked).map(e=>e.path);
 return dirty.length?new BlockedError('dirty',dirty):null;
}
const REV=/^(HEAD|[0-9a-f]{7,64})$/;
export type ScmDeps={layout:DataLayout;git:Git;gitAvailable:boolean;identityConfigured:boolean;drafts:(slug:string)=>string[];rescan:(slug:string)=>Promise<unknown>;emit:(event:string,data:unknown)=>void;project:(slug:string)=>unknown};
export function createScm(deps:ScmDeps){
 const {layout,git}=deps;
 function dir(slug:string){deps.project(slug);if(!deps.gitAvailable)throw new GitError('Git is not available on this machine. Install Git 2.40 or newer and restart the workbench.');return projectDir(layout,slug);}
 const paths=(list:unknown)=>{if(!Array.isArray(list)||!list.length||list.length>5000)throw Error('Expected 1–5000 paths.');return list.map(p=>projectPath(String(p)));};
 async function status(slug:string){
  if(!deps.gitAvailable)return {branch:'',upstream:'',ahead:0,behind:0,gitAvailable:false,identityConfigured:false,merging:false,remotes:{},changes:[]};
  const d=dir(slug),s=await git.status(d),merging=await git.merging(d);
  const changes=s.entries.map(e=>({...e,hidden:serializationOf(e.path)==='unsupported',...(serializationOf(e.path)==='unsupported'?{label:HIDDEN_LABEL}:{})}));
  return {branch:s.branch,upstream:s.upstream,ahead:s.ahead,behind:s.behind,gitAvailable:true,identityConfigured:deps.identityConfigured,merging,remotes:Object.fromEntries(await git.remotes(d)),changes};
 }
 async function after(slug:string,altered:string[]=[]){
  await deps.rescan(slug);const s=await git.status(projectDir(layout,slug));
  deps.emit('git',{project:slug,branch:s.branch,ahead:s.ahead,behind:s.behind,changes:s.changes,altered});
  return s;
 }
 // FR-096: files whose bytes on disk differ from the bytes Git recorded for them, among `changed`
 // (a smudge filter, an end-of-line attribute or a hook rewrote them). Git's own view of clean is
 // used to skip files the user is still editing.
 async function alteredAfter(d:string,changed:string[]){
  if(!changed.length)return [];
  const s=await git.status(d),busy=new Set(s.entries.filter(e=>e.worktree!=='.'||e.conflicted).map(e=>e.path));
  const candidates=changed.filter(p=>!busy.has(p)&&existsSync(join(d,p)));
  const [disk,tree]=await Promise.all([git.worktreeIds(d,candidates),git.treeIds(d,'HEAD',candidates)]);
  return candidates.filter(p=>tree.has(p)&&disk.get(p)!==tree.get(p));
 }
 const remoteOf=async(d:string,upstream:string)=>{
  const remotes=await git.remotes(d),name=upstream?upstream.slice(0,upstream.indexOf('/')):remotes.has('origin')?'origin':[...remotes.keys()][0];
  if(!name)throw new GitError('This project has no remote. Add one under Remote first.');
  return name;
 };
 async function pullIn(slug:string,d:string){
  const s=await git.status(d),blocked=blockers(deps.drafts(slug),s.entries);if(blocked)throw blocked;
  const remote=await remoteOf(d,s.upstream),before=await git.head(d);
  const r=await git.run(d,['pull','--no-rebase','--no-edit',...(s.upstream?[]:[remote,s.branch])],{remote:true,allowFailure:true});
  const now=await git.status(d),conflicted=now.entries.filter(e=>e.conflicted).map(e=>e.path),head=await git.head(d);
  const altered=head&&head!==before?await alteredAfter(d,await git.changedBetween(d,before,head)):[];
  return {ok:r.code===0,conflicted,altered,stderr:r.stderr.trim()};
 }
 // Remote actions report Git's result instead of throwing, so the panel can show stderr; Cancel
 // (or the 10-minute limit) ends them.
 async function remoteAction(slug:string,kind:'fetch'|'pull'|'push'|'sync'){
  const d=dir(slug);
  try{
   let result={ok:true,conflicted:[] as string[],altered:[] as string[],stderr:''};
   if(kind==='fetch'){const s=await git.status(d);const r=await git.run(d,['fetch','--prune',await remoteOf(d,s.upstream)],{remote:true,allowFailure:true});result={...result,ok:r.code===0,stderr:r.stderr.trim()};}
   if(kind==='pull'||kind==='sync'){const s=await git.status(d);if(kind==='pull'||s.upstream)result=await pullIn(slug,d);}
   if((kind==='push'||kind==='sync')&&result.ok){const s=await git.status(d);const r=await git.run(d,['push','-u',await remoteOf(d,s.upstream),s.branch],{remote:true,allowFailure:true});result={...result,ok:r.code===0,stderr:[result.stderr,r.stderr.trim()].filter(Boolean).join('\n')};}
   const s=await after(slug,result.altered);
   return {...result,ahead:s.ahead,behind:s.behind};
  }catch(e){
   if(e instanceof GitError&&e.cancelled){const s=await after(slug);return {ok:false,cancelled:true,conflicted:[],altered:[],stderr:e.message,ahead:s.ahead,behind:s.behind};}
   throw e;
  }
 }
 // The bytes of a path at `HEAD`, a commit, `index` or `worktree`, for the diff view.
 async function content(d:string,rev:string,path:string){
  if(rev==='worktree'){const f=join(d,path);return existsSync(f)?new Uint8Array(readFileSync(f)):null;}
  if(rev!=='index'&&!REV.test(rev))throw Error('Revision must be HEAD, index, worktree or a commit id.');
  return git.blob(d,rev==='index'?'':rev,path);
 }
 const asText=(bytes:Uint8Array|null)=>{if(!bytes)return {text:'',binary:false};if(bytes.subarray(0,8000).includes(0))return {text:'',binary:true};try{return {text:decode(bytes),binary:false};}catch{return {text:'',binary:true};}};
 return {
  status,
  async diff(slug:string,path:string,from='HEAD',to='worktree'){
   const d=dir(slug),p=projectPath(path),[a,b]=await Promise.all([content(d,from,p),content(d,to,p)]),before=asText(a),after=asText(b);
   return {path:p,from,to,before:before.text,after:after.text,binary:before.binary||after.binary,beforeExists:!!a,afterExists:!!b};
  },
  async stage(slug:string,list:unknown){const d=dir(slug);await git.stage(d,paths(list));await after(slug);return status(slug);},
  async unstage(slug:string,list:unknown){const d=dir(slug);await git.unstage(d,paths(list));await after(slug);return status(slug);},
  async stageAll(slug:string,stage:boolean){const d=dir(slug),s=await git.status(d),list=s.entries.filter(e=>stage?e.worktree!=='.':e.index!=='.'&&!e.untracked).map(e=>e.path);if(list.length)await (stage?git.stage(d,list):git.unstage(d,list));await after(slug);return status(slug);},
  async commit(slug:string,message:unknown){
   if(typeof message!=='string'||!message.trim())throw new GitError('A commit message is required.');
   const d=dir(slug),s=await git.status(d);
   if(s.entries.some(e=>e.conflicted))throw new GitError('Resolve the conflicted files and stage them before committing.');
   const staged=s.entries.filter(e=>e.index!=='.'&&!e.untracked);
   if(!staged.length&&!await git.merging(d))throw new GitError('Nothing is staged. Stage the changes to include, then commit.');
   const clean=staged.filter(e=>e.worktree==='.').map(e=>e.path),before=await git.worktreeIds(d,clean.filter(p=>existsSync(join(d,p))));
   const parent=await git.head(d);
   await git.commit(d,message);
   const head=(await git.head(d))!,committed=await git.changedBetween(d,parent,head);
   // A hook that rewrote a file, or a clean filter whose committed bytes differ from the saved file.
   const checked=committed.filter(p=>before.has(p)),[disk,tree]=await Promise.all([git.worktreeIds(d,checked.filter(p=>existsSync(join(d,p)))),git.treeIds(d,'HEAD',checked)]);
   const altered=checked.filter(p=>disk.get(p)!==before.get(p)||(tree.has(p)&&disk.get(p)!==tree.get(p)));
   await after(slug,altered);
   return {commit:head,altered};
  },
  async branches(slug:string){const d=dir(slug),b=await git.branches(d),s=await git.status(d);return {current:s.branch,...b};},
  async switchBranch(slug:string,branch:unknown,create=false){
   if(typeof branch!=='string'||!branch.trim()||branch.startsWith('-')||branch.length>200)throw Error('Give a branch name.');
   const d=dir(slug),name=branch.trim();
   if(create&&(await git.run(d,['check-ref-format','--branch',name],{allowFailure:true,readOnly:true})).code!==0)throw Error(`"${name}" is not a valid branch name.`);
   const s=await git.status(d),blocked=blockers(deps.drafts(slug),s.entries);if(blocked)throw blocked;
   // A remote branch (`origin/x`) is checked out as the local tracking branch `x`.
   const b=await git.branches(d),local=!create&&!b.local.includes(name)&&b.remote.includes(name)?name.slice(name.indexOf('/')+1):name;
   const before=await git.head(d);
   await git.run(d,create?['switch','-c',local]:['switch',local]);
   const head=await git.head(d),altered=head&&head!==before?await alteredAfter(d,await git.changedBetween(d,before,head)):[];
   await after(slug,altered);
   return {branch:local,altered};
  },
  async setRemote(slug:string,name:unknown,url:unknown){
   if(typeof name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name))throw Error('A remote name uses letters, digits, dot, dash or underscore.');
   if(typeof url!=='string'||!url.trim()||url.trim().startsWith('-')||/[\r\n]/.test(url)||url.length>2000)throw Error('Give the remote URL or path.');
   const d=dir(slug),remotes=await git.remotes(d);
   await git.run(d,remotes.has(name)?['remote','set-url',name,url.trim()]:['remote','add',name,url.trim()]);
   await after(slug);return {name,url:url.trim()};
  },
  fetch:(slug:string)=>remoteAction(slug,'fetch'),
  pull:(slug:string)=>remoteAction(slug,'pull'),
  push:(slug:string)=>remoteAction(slug,'push'),
  sync:(slug:string)=>remoteAction(slug,'sync'),
  cancel:(slug:string)=>({cancelled:git.cancel(dir(slug))}),
  log:(slug:string,path?:string,limit?:number)=>git.log(dir(slug),path===undefined?undefined:projectPath(path),limit),
  async show(slug:string,commit:string,path:string){
   if(!REV.test(commit))throw Error('commit must be a commit id.');
   const bytes=await git.blob(dir(slug),commit,projectPath(path));if(!bytes)return {source:'',exists:false};
   return {source:decode(bytes),exists:true,hash:sha256(bytes)};
  },
  // A file's committed versions, newest first, with their text (ODCS History, FR-057). Binary or
  // missing versions are skipped.
  async versions(slug:string,path:string,limit=20){
   const d=dir(slug),p=projectPath(path),log=await git.log(d,p,Math.max(1,Math.min(50,limit)));
   const out:{commit:string;author:string;date:string;message:string;source:string}[]=[];
   for(const c of log){const bytes=await git.blob(d,c.commit,p);if(!bytes)continue;try{out.push({...c,source:decode(bytes)});}catch{}}
   return out;
  },
  // Tracked files that a .gitignore pattern now matches: Git keeps tracking them.
  async ignoredButTracked(slug:string){const r=await git.run(dir(slug),['--no-optional-locks','-c','core.quotepath=off','ls-files','-ci','--exclude-standard','-z'],{readOnly:true,allowFailure:true});return r.stdout.split('\0').filter(Boolean);},
 };
}
export type Scm=ReturnType<typeof createScm>;

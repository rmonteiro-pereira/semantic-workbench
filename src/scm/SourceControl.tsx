import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowDown,ArrowUp,Check,EyeOff,FileCode,GitCommit,History,Minus,Plus,RefreshCw,X} from 'lucide-react';
import {scm,Blocked,type GitChange,type GitCommit as Commit,type GitDiff,type GitStatus,type ProjectInfo,type RemoteResult} from '../projects/api';
import {DiffView} from './DiffView';
import {BranchPicker} from './BranchPicker';
import {ignoreChoices} from './gitignore';
import './scm.css';
// VS Code-like Source Control for one project (Story 9): changes with per-file diffs, stage and
// unstage, commit, branches, explicit remote actions with a visible wait and Cancel, conflicts for
// repair, Add to .gitignore and file history. Hidden-type files are listed read-only.
type Group='conflicts'|'staged'|'changes';
type Selection={path:string;group:Group}|null;
const STATE:Record<string,string>={M:'Modified',A:'Added',D:'Deleted',R:'Renamed',C:'Copied',T:'Type changed',U:'Conflicted','?':'Untracked'};
const letter=(c:GitChange,g:Group)=>g==='conflicts'?'!':g==='staged'?c.index:c.untracked?'U':c.worktree;
function groupsOf(changes:GitChange[]){
 return {conflicts:changes.filter(c=>c.conflicted),staged:changes.filter(c=>!c.conflicted&&!c.untracked&&c.index!=='.'),changes:changes.filter(c=>!c.conflicted&&(c.untracked||c.worktree!=='.'))};
}
// Which two versions a change compares, as VS Code does: staged = last commit → index; changes =
// index → working tree; conflicts = last commit → working tree (with the markers).
const rangeOf=(g:Group,c:GitChange)=>g==='staged'?['HEAD','index']:g==='conflicts'?['HEAD','worktree']:c.untracked?['index','worktree']:['index','worktree'];
// `onBusy` tells the editor that a pull, sync or branch switch runs (automatic saving waits);
// `onCommit` opens the Commit dialog, offered when a pull, sync or switch is refused (FR-048).
type Props={projects:ProjectInfo[];project:string;version:number;unsaved:string[];historyPath?:string;onProject:(slug:string)=>void;onOpen:(project:string,path:string)=>void;onChanged:()=>void;onBusy?:(busy:boolean)=>void;onCommit?:()=>void};
export function SourceControl({projects,project,version,unsaved,historyPath,onProject,onOpen,onChanged,onBusy,onCommit}:Props){
 const [status,setStatus]=useState<GitStatus|null>(null),[error,setError]=useState(''),[note,setNote]=useState<{tone:'info'|'warning';text:string;paths?:string[];commit?:boolean}|null>(null);
 const [selected,setSelected]=useState<Selection>(null),[diff,setDiff]=useState<GitDiff|null>(null),[message,setMessage]=useState('');
 const [waiting,setWaiting]=useState<string|null>(null),[busy,setBusy]=useState(false),[ignoring,setIgnoring]=useState<string|null>(null),[remoteUrl,setRemoteUrl]=useState(''),[editRemote,setEditRemote]=useState(false);
 const [historyFile,setHistoryFile]=useState<string|undefined>(historyPath),[log,setLog]=useState<Commit[]>([]),[range,setRange]=useState<{from:string;to:string}|null>(null);
 const local=useRef(0);const [tick,setTick]=useState(0);const reload=()=>setTick(t=>t+1);
 useEffect(()=>{setSelected(null);setDiff(null);setNote(null);setError('');setHistoryFile(historyPath);},[project]);
 useEffect(()=>{if(historyPath){setHistoryFile(historyPath);setSelected(null);}},[historyPath]);
 useEffect(()=>{let live=true;scm.status(project).then(s=>{if(live){setStatus(s);setError('');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[project,version,tick]);
 const groups=useMemo(()=>groupsOf(status?.changes??[]),[status]);
 const change=selected&&status?.changes.find(c=>c.path===selected.path);
 // The diff of the selected change; it follows the file as it changes.
 useEffect(()=>{
  if(!selected||!change){setDiff(null);return;}
  const [from,to]=rangeOf(selected.group,change);let live=true;
  scm.diff(project,selected.path,from,to).then(d=>{if(live)setDiff(d);}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[selected?.path,selected?.group,status]);
 useEffect(()=>{let live=true;scm.log(project,historyFile,50).then(l=>{if(live){setLog(l);setRange(historyFile&&l.length?{from:l[Math.min(1,l.length-1)].commit,to:l.length>1?l[0].commit:'worktree'}:null);}}).catch(()=>{if(live)setLog([]);});return()=>{live=false;};},[project,historyFile,version,tick]);
 const [versions,setVersions]=useState<GitDiff|null>(null);
 useEffect(()=>{if(!historyFile||!range||selected){setVersions(null);return;}let live=true;scm.diff(project,historyFile,range.from,range.to).then(d=>{if(live)setVersions(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[historyFile,range?.from,range?.to,selected,version,tick]);
 async function act<T>(run:()=>Promise<T>,done?:(r:T)=>void){
  setBusy(true);setError('');setNote(null);
  try{const r=await run();done?.(r);}
  catch(e){if(e instanceof Blocked)setNote({tone:'warning',text:e.reason==='drafts'?'These files have edits that are not saved to file yet (repair them in Source, or discard them), then commit:':'Commit or discard these changes first (nothing is stashed automatically):',paths:e.paths,commit:true});else setError((e as Error).message);}
  finally{setBusy(false);reload();onChanged();}
 }
 const altered=(paths:string[],what:string)=>paths.length?setNote({tone:'warning',text:`A Git hook or filter changed these files during the ${what}; their bytes on disk differ from what was saved or committed:`,paths}):undefined;
 function guard(kind:string){if(unsaved.length){setNote({tone:'warning',text:`These edits are not saved to file yet; let them save (or repair them) and commit before you ${kind}:`,paths:unsaved,commit:true});return false;}return true;}
 async function remote(action:'fetch'|'pull'|'push'|'sync'){
  if((action==='pull'||action==='sync')&&!guard(action))return;
  const id=++local.current;setWaiting(action);onBusy?.(action!=='fetch'&&action!=='push');
  try{await act(()=>scm.remote(project,action),(r:RemoteResult)=>{
   if(r.cancelled)setNote({tone:'info',text:`${title(action)} cancelled.`});
   else if(r.conflicted.length)setNote({tone:'warning',text:'The pull stopped on conflicts. Open each file, repair it, stage it, then commit the merge:',paths:r.conflicted});
   else if(!r.ok)setError(r.stderr||`${title(action)} failed.`);
   else if(r.altered.length)altered(r.altered,action);
   else setNote({tone:'info',text:`${title(action)} finished${r.ahead||r.behind?` · ${r.ahead} to push, ${r.behind} to pull`:''}.`});
  });
  }finally{onBusy?.(false);}
  if(local.current===id)setWaiting(null);
 }
 const switchTo=(branch:string,create:boolean)=>{if(!guard('switch branches'))return;onBusy?.(true);void act(()=>scm.switch(project,branch,create),r=>{setSelected(null);if(r.altered.length)altered(r.altered,'switch');else setNote({tone:'info',text:`${create?'Created and switched to':'Switched to'} ${r.branch}.`});}).finally(()=>onBusy?.(false));};
 const commit=()=>act(()=>scm.commit(project,message),r=>{setMessage('');setSelected(null);if(r.altered.length)altered(r.altered,'commit');else setNote({tone:'info',text:`Committed ${r.commit.slice(0,7)}.`});});
 if(error&&!status)return <section className="scm scm-message" aria-label="Source Control"><p role="alert" className="scm-error">{error}</p></section>;
 if(!status)return <section className="scm scm-message" aria-label="Source Control"><p className="scm-empty">Loading Source Control…</p></section>;
 if(!status.gitAvailable)return <section className="scm scm-message" aria-label="Source Control"><div role="alert" className="scm-note warning"><AlertTriangle size={14}/><span>Git was not found on this machine, so this project has no version control here. Editing, validation and export keep working. Install Git 2.40 or newer and restart the workbench.</span></div></section>;
 const remoteNames=Object.keys(status.remotes),canCommit=!!message.trim()&&(groups.staged.length>0||status.merging)&&!groups.conflicts.length&&status.identityConfigured&&!busy;
 const row=(c:GitChange,g:Group)=>{
  const isSel=selected?.path===c.path&&selected.group===g,l=letter(c,g),name=c.path.split('/').pop()!,folder=c.path.slice(0,-name.length).replace(/\/$/,'');
  return <li key={g+c.path} className={`scm-row${isSel?' selected':''}${c.hidden?' hidden-file':''}`}>
   <button className="scm-file" aria-label={`${c.path}, ${g==='conflicts'?'conflicted':STATE[l]??l}${c.hidden?', not shown in workspace':''}`} aria-pressed={isSel} onClick={()=>{setSelected({path:c.path,group:g});setHistoryFile(c.path);}}>
    <span className="scm-name">{name}</span>{folder&&<small>{folder}</small>}{c.orig&&<small>← {c.orig}</small>}
    {c.hidden&&<em className="scm-label" title="This file type is not shown in the workspace; it can be diffed, staged and committed here, not edited."><EyeOff size={11}/>{c.label}</em>}
   </button>
   <span className="scm-actions">
    {!c.hidden&&!(g==='staged'&&c.index==='D')&&c.worktree!=='D'&&<button aria-label={`Open ${c.path}`} title="Open in the editor" onClick={()=>onOpen(project,c.path)}><FileCode size={13}/></button>}
    {g==='changes'&&<button aria-label={`Add ${c.path} to .gitignore`} title="Add to .gitignore" onClick={()=>setIgnoring(ignoring===c.path?null:c.path)}><EyeOff size={13}/></button>}
    {g==='staged'?<button aria-label={`Unstage ${c.path}`} title="Unstage" onClick={()=>act(()=>scm.unstage(project,[c.path]))} disabled={busy}><Minus size={13}/></button>
     :<button aria-label={`Stage ${c.path}`} title={g==='conflicts'?'Mark as resolved (stage)':'Stage'} onClick={()=>act(()=>scm.stage(project,[c.path]))} disabled={busy}><Plus size={13}/></button>}
   </span>
   <span className={`scm-state s-${l==='?'?'u':l.toLowerCase()}`} title={STATE[l]??l}>{l}</span>
   {ignoring===c.path&&<IgnoreChooser path={c.path} onCancel={()=>setIgnoring(null)} onAdd={pattern=>act(()=>scm.ignore(project,pattern),r=>{setIgnoring(null);setSelected(null);setNote(r.tracked.length?{tone:'warning',text:`Added ${pattern} to .gitignore. These files are already committed, so Git keeps tracking them until they are removed from the repository (git rm --cached):`,paths:r.tracked}:{tone:'info',text:r.added?`Added ${pattern} to .gitignore.`:`${pattern} was already in .gitignore.`});})}/>}
  </li>;
 };
 const section=(g:Group,title:string,items:GitChange[],all?:{label:string;run:()=>void})=>items.length>0&&<section className="scm-group" aria-label={title}>
  <h3><span>{title}</span><small>{items.length}</small>{all&&<button className="link" onClick={all.run} disabled={busy}>{all.label}</button>}</h3>
  <ul>{items.map(c=>row(c,g))}</ul>
 </section>;
 return <section className="scm" aria-label="Source Control">
  <div className="scm-side">
   <div className="scm-head">
    {projects.length>1&&<select aria-label="Project" value={project} onChange={e=>onProject(e.target.value)}>{projects.map(p=><option key={p.slug} value={p.slug}>{p.name}</option>)}</select>}
    <BranchPicker project={project} current={status.branch} version={version+tick} disabled={busy} onSwitch={switchTo}/>
    <span className="scm-sync" aria-label={`${status.ahead} commits to push, ${status.behind} to pull`} title={status.upstream?`Tracking ${status.upstream}`:'No upstream branch yet'}><ArrowUp size={12}/>{status.ahead}<ArrowDown size={12}/>{status.behind}</span>
   </div>
   <div className="scm-remote">
    {remoteNames.length&&!editRemote?<>
     <span className="scm-remote-url" title={status.remotes[remoteNames[0]]}>{remoteNames[0]}: {status.remotes[remoteNames[0]]}</span><button className="link" onClick={()=>{setRemoteUrl(status.remotes[remoteNames[0]]);setEditRemote(true);}}>Change</button>
     <div className="scm-remote-actions" role="group" aria-label="Remote">
      {(['fetch','pull','push','sync'] as const).map(a=><button key={a} onClick={()=>void remote(a)} disabled={busy}>{a==='sync'?<RefreshCw size={13}/>:a==='push'?<ArrowUp size={13}/>:<ArrowDown size={13}/>}{title(a)}</button>)}
     </div>
    </>:<form className="scm-remote-form" onSubmit={e=>{e.preventDefault();void act(()=>scm.setRemote(project,remoteNames[0]??'origin',remoteUrl),()=>{setEditRemote(false);setNote({tone:'info',text:'Remote saved. Push to publish this branch.'});});}}>
     <label><span>Remote URL or path</span><input aria-label="Remote URL" value={remoteUrl} onChange={e=>setRemoteUrl(e.target.value)} placeholder="https://… or git@… or /path/to/repo.git"/></label>
     <button type="submit" className="primary" disabled={!remoteUrl.trim()||busy}>Save remote</button>{editRemote&&<button type="button" onClick={()=>setEditRemote(false)}>Cancel</button>}
    </form>}
   </div>
   {waiting&&<div role="status" className="scm-note waiting"><span className="spinner" aria-hidden/><span>Waiting for Git (credentials may be requested in a separate window)…</span><button onClick={()=>void scm.cancel(project)}>Cancel</button></div>}
   {note&&<div role={note.tone==='warning'?'alert':'status'} className={`scm-note ${note.tone}`}>{note.tone==='warning'?<AlertTriangle size={14}/>:<Check size={14}/>}<div><span>{note.text}</span>{note.paths&&<ul>{note.paths.map(p=><li key={p}><code>{p}</code></li>)}</ul>}{note.commit&&onCommit&&<button className="scm-note-action" onClick={onCommit}>Commit…</button>}</div><button aria-label="Dismiss" onClick={()=>setNote(null)}><X size={13}/></button></div>}
   {error&&<pre role="alert" className="scm-error">{error}</pre>}
   {status.merging&&!note&&<p className="scm-note warning"><AlertTriangle size={14}/><span>A merge is in progress. Repair each conflicted file in Source, stage it, then commit.</span></p>}
   <div className="scm-commit">
    <textarea aria-label="Commit message" placeholder={`Message (commit on ${status.branch})`} rows={2} value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&canCommit){e.preventDefault();void commit();}}}/>
    <button className="primary" onClick={()=>void commit()} disabled={!canCommit} title={!status.identityConfigured?'Set git user.name and user.email first':groups.conflicts.length?'Resolve conflicts first':!groups.staged.length&&!status.merging?'Stage changes to commit':!message.trim()?'Write a commit message':'Commit (Ctrl+Enter)'}><GitCommit size={14}/>Commit</button>
    {!status.identityConfigured&&<small>Git has no user.name or user.email, so commits are not possible yet.</small>}
   </div>
   {!status.changes.length&&<p className="scm-empty">No changes. The working tree matches the last commit.</p>}
   {section('conflicts','Merge conflicts',groups.conflicts)}
   {section('staged','Staged changes',groups.staged,{label:'Unstage all',run:()=>void act(()=>scm.unstage(project,'all'))})}
   {section('changes','Changes',groups.changes,{label:'Stage all',run:()=>void act(()=>scm.stage(project,'all'))})}
   <section className="scm-group scm-history" aria-label="History">
    <h3><History size={13}/><span>{historyFile?`History of ${historyFile}`:'History'}</span>{historyFile&&<button className="link" onClick={()=>{setHistoryFile(undefined);setSelected(null);}}>All files</button>}</h3>
    <ol>{log.map(c=><li key={c.commit}><button className="scm-commit-row" onClick={()=>{if(historyFile){setSelected(null);const i=log.findIndex(x=>x.commit===c.commit);setRange({from:log[i+1]?.commit??c.commit,to:c.commit});}}} disabled={!historyFile} title={historyFile?'Compare with the version before it':'Select a file to compare its versions'}><span>{c.message}</span><small>{c.commit.slice(0,7)} · {c.author} · {new Date(c.date).toLocaleString()}</small></button></li>)}</ol>
   </section>
  </div>
  <div className="scm-main">
   {selected&&diff?(diff.binary?<p className="scm-empty">{diff.path} is a binary file; it can be staged and committed, but not shown.</p>
    :<DiffView label={`Changes in ${diff.path}`} filename={diff.path} before={diff.before} after={diff.after} beforeLabel={`${diff.path} · ${diff.beforeExists?versionName(diff.from):'new file'}`} afterLabel={diff.afterExists?versionName(diff.to):'Deleted'}/>)
   :historyFile&&range&&versions?<>
    <div className="scm-versions" role="group" aria-label="Compare versions">
     <label><span>From</span><select aria-label="From version" value={range.from} onChange={e=>setRange({...range,from:e.target.value})}>{log.map(c=><option key={c.commit} value={c.commit}>{c.commit.slice(0,7)} {c.message}</option>)}</select></label>
     <label><span>To</span><select aria-label="To version" value={range.to} onChange={e=>setRange({...range,to:e.target.value})}><option value="worktree">Working tree</option>{log.map(c=><option key={c.commit} value={c.commit}>{c.commit.slice(0,7)} {c.message}</option>)}</select></label>
    </div>
    {versions.binary?<p className="scm-empty">Binary file.</p>:<DiffView label={`Versions of ${historyFile}`} filename={historyFile} before={versions.before} after={versions.after} beforeLabel={`${historyFile} · ${versionName(range.from,log)}`} afterLabel={versionName(range.to,log)}/>}
   </>:<p className="scm-empty">Select a changed file to see its diff, or a file's history to compare two of its versions.</p>}
  </div>
 </section>;
}
const title=(a:string)=>a[0].toUpperCase()+a.slice(1);
function versionName(rev:string,log:Commit[]=[]){if(rev==='worktree')return 'Working tree';if(rev==='index')return 'Last commit and staged changes';if(rev==='HEAD')return 'Last commit';const c=log.find(x=>x.commit===rev);return c?`${rev.slice(0,7)} ${c.message}`:rev.slice(0,7);}
function IgnoreChooser({path,onAdd,onCancel}:{path:string;onAdd:(pattern:string)=>void;onCancel:()=>void}){
 const choices=ignoreChoices(path),[pattern,setPattern]=useState(choices[0].pattern);
 return <div className="scm-ignore" role="group" aria-label={`Add ${path} to .gitignore`}>
  {choices.map(c=><label key={c.pattern}><input type="radio" name={'ignore-'+path} checked={pattern===c.pattern} onChange={()=>setPattern(c.pattern)}/><span>{c.label}</span><code>{c.pattern}</code></label>)}
  <div><button onClick={onCancel}>Cancel</button><button className="primary" onClick={()=>onAdd(pattern)}>Add to .gitignore</button></div>
 </div>;
}

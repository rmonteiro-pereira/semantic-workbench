import React,{useState} from 'react';
import {Modal} from './Modal';
import {api,type ProjectInfo} from './api';
// Rename a project (FR-020): only the display name changes; the folder keeps its id.
export function RenameDialog({project,onClose,onDone}:{project:ProjectInfo;onClose:()=>void;onDone:(name:string)=>void}){
 const [name,setName]=useState(project.name),[error,setError]=useState('');
 return <Modal title={`Rename ${project.name}`} onCancel={onClose}>
  <form onSubmit={async e=>{e.preventDefault();setError('');try{const r=await api.rename(project.slug,name);onDone(r.name);}catch(err){setError((err as Error).message);}}}>
   <label>Project name<input autoFocus value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
   {error&&<p role="alert" className="dialog-error">{error}</p>}
   <div className="repair-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!name.trim()}>Rename</button></div>
  </form>
 </Modal>;
}
// Move a file to another project (FR-020); a taken name offers the free alternative.
export function MoveDialog({project,path,projects,onClose,onDone}:{project:string;path:string;projects:ProjectInfo[];onClose:()=>void;onDone:(to:{project:string;path:string})=>void}){
 const others=projects.filter(p=>p.slug!==project);
 const [target,setTarget]=useState(others[0]?.slug??''),[toPath,setToPath]=useState(path.split('/').pop()!),[error,setError]=useState('');
 async function move(){setError('');try{onDone(await api.move(project,path,target,toPath));}catch(e:any){if(e.status===409&&e.body?.suggestion?.toPath){setToPath(e.body.suggestion.toPath);setError(`${e.body.message} The name below is free.`);}else setError(e.message);}}
 return <Modal title={`Move ${path}`} onCancel={onClose}>
  {others.length?<form onSubmit={e=>{e.preventDefault();void move();}}>
   <label>Target project<select autoFocus value={target} onChange={e=>setTarget(e.target.value)}>{others.map(p=><option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
   <label>Path in that project<input value={toPath} onChange={e=>setToPath(e.target.value)}/></label>
   {error&&<p role="alert" className="dialog-error">{error}</p>}
   <div className="repair-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!target||!toPath.trim()}>Move</button></div>
  </form>:<><p>There is no other project to move this file to.</p><div className="repair-actions"><button onClick={onClose}>Close</button></div></>}
 </Modal>;
}
// FR-029: importing a name that already exists asks whether to replace it or keep both.
export function ImportConflictDialog({project,conflicts,onChoose,onClose}:{project:ProjectInfo;conflicts:string[];onChoose:(choice:'replace'|'keep-both')=>void;onClose:()=>void}){
 return <Modal title={`Files already exist in ${project.name}`} onCancel={onClose}>
  <ul className="delete-list">{conflicts.map(c=><li key={c}>{c}</li>)}</ul>
  <p>Replace overwrites these files with the imported ones (committed versions remain in the project's Git history). Keep both imports them as "name (2)".</p>
  <div className="repair-actions"><button onClick={onClose}>Cancel</button><button onClick={()=>onChoose('keep-both')}>Keep both</button><button className="danger" onClick={()=>onChoose('replace')}>Replace</button></div>
 </Modal>;
}

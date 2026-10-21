import React,{useEffect,useState} from 'react';
import {Modal} from './Modal';
import {api,type TrashItem} from './api';
// FR-024: restore or permanently delete trash entries; emptying the trash asks for confirmation.
// A restore never overwrites; when the location is taken, the free alternative is offered.
export function TrashDialog({onClose,version}:{onClose:()=>void;version:number}){
 const [items,setItems]=useState<TrashItem[]|null>(null),[error,setError]=useState(''),[confirming,setConfirming]=useState<string|null>(null);
 const [occupied,setOccupied]=useState<{id:string;message:string;suggestion:{toProject?:string;toPath?:string}}|null>(null);
 const load=()=>api.trash().then(setItems).catch(e=>setError(e.message));
 useEffect(()=>{load();},[version]);
 async function act(run:()=>Promise<unknown>){setError('');try{await run();await load();}catch(e){setError((e as Error).message);}}
 async function restore(id:string,target={}){
  setError('');setOccupied(null);
  try{await api.restore(id,target);await load();}
  catch(e:any){if(e.status===409&&e.body?.suggestion)setOccupied({id,message:e.body.message,suggestion:e.body.suggestion});else setError(e.message);}
 }
 const label=(t:TrashItem)=>t.kind==='project'?`Project ${t.projectName}`:`${t.path} (${t.projectName})`;
 return <Modal title="Trash" onCancel={onClose} className="trash-dialog">
  {items===null?<p>Loading…</p>:items.length===0?<p>The trash is empty.</p>:<ul className="trash-list">{items.map(t=><li key={t.entryId}>
   <div><strong>{label(t)}</strong><small>Deleted {new Date(t.deletedAt).toLocaleString()}{t.batchId?' · by Clear':''}</small></div>
   {confirming===t.entryId?<span className="trash-confirm">Delete permanently? <button className="danger" onClick={()=>act(()=>api.purge(t.entryId))}>Yes, delete</button><button onClick={()=>setConfirming(null)}>No</button></span>
    :<span><button onClick={()=>restore(t.entryId)}>Restore</button><button onClick={()=>setConfirming(t.entryId)}>Delete permanently</button></span>}
  </li>)}</ul>}
  {occupied&&<div role="alert" className="delete-warning"><p>{occupied.message}</p><button onClick={()=>restore(occupied.id,occupied.suggestion)}>Restore as {occupied.suggestion.toPath??occupied.suggestion.toProject}</button></div>}
  {error&&<p role="alert" className="dialog-error">{error}</p>}
  <div className="repair-actions">
   {confirming==='*'?<><span>Permanently delete all {items?.length} item{items?.length===1?'':'s'}? This cannot be undone.</span><button onClick={()=>setConfirming(null)}>Cancel</button><button className="danger" onClick={()=>{setConfirming(null);act(()=>api.emptyTrash());}}>Empty trash</button></>
    :<><button onClick={()=>setConfirming('*')} disabled={!items?.length}>Empty trash</button><button className="primary" onClick={onClose}>Close</button></>}
  </div>
 </Modal>;
}

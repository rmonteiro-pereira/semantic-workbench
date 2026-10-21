import React,{useEffect,useRef} from 'react';
// FR-064 / FR-081: a save based on an older version is rejected; show both versions side by side
// (changed lines marked) and let the user decide. A full diff view replaces this in Phase 8.
export function StaleSaveDialog({filename,mine,current,onLoadCurrent,onKeepMine,onCancel}:{filename:string;mine:string;current:string|null;onLoadCurrent:()=>void;onKeepMine:()=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const a=mine.split('\n'),b=(current??'').split('\n');
 const pane=(lines:string[],other:string[],label:string)=><figure><figcaption>{label}</figcaption><pre aria-label={label}>{lines.map((line,i)=><span key={i} className={line!==other[i]?'changed':undefined}>{line}{'\n'}</span>)}</pre></figure>;
 return <dialog ref={dialog} className="validation-backdrop" aria-labelledby="stale-title" onCancel={e=>{e.preventDefault();onCancel();}}><section className="stale-save">
  <h2 id="stale-title">{filename} changed since you opened it</h2>
  <p>Another tab, an external editor or Git wrote a newer version. Your edits were not saved. Compare the versions and choose how to continue.</p>
  <div className="stale-columns">{pane(a,b,'Your version (not saved)')}{current===null?<p>The file no longer exists on disk.</p>:pane(b,a,'Current file on disk')}</div>
  <div className="repair-actions"><button onClick={onCancel}>Keep editing</button><button onClick={onLoadCurrent} disabled={current===null}>Discard my edits and load the current file</button><button className="primary" onClick={onKeepMine}>Keep my version and save over it</button></div>
 </section></dialog>;
}

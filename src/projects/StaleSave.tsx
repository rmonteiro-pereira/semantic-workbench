import React,{useEffect,useRef} from 'react';
import {DiffView} from '../scm/DiffView';
// FR-064 / FR-081: a save based on an older version is rejected; show both versions side by side
// in the diff view (changed lines marked) and let the user decide.
export function StaleSaveDialog({filename,mine,current,onLoadCurrent,onKeepMine,onCancel}:{filename:string;mine:string;current:string|null;onLoadCurrent:()=>void;onKeepMine:()=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="validation-backdrop" aria-labelledby="stale-title" onCancel={e=>{e.preventDefault();onCancel();}}><section className="stale-save">
  <h2 id="stale-title">{filename} changed since you opened it</h2>
  <p>Another tab, an external editor or Git wrote a newer version. Your edits were not saved. Compare the versions and choose how to continue.</p>
  {current===null?<p>The file no longer exists on disk.</p>:<DiffView label="Your version and the current file" filename={filename} before={current} after={mine} beforeLabel="Current file on disk" afterLabel="Your version (not saved)"/>}
  <div className="repair-actions"><button onClick={onCancel}>Keep editing</button><button onClick={onLoadCurrent} disabled={current===null}>Discard my edits and load the current file</button><button className="primary" onClick={onKeepMine}>Keep my version and save over it</button></div>
 </section></dialog>;
}

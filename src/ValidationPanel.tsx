import React, {useMemo, useState, useRef, useEffect} from 'react';
import type {Issue} from './diagnostics';
import {validateInput} from './input';
export function ValidationPanel({issues,onLocate}:{issues:Issue[];onLocate?:(issue:Issue)=>void}) {
 return <div className="validation-report" aria-label="Validation report">
  <p>{issues.filter(i=>i.severity==='error').length} errors · {issues.filter(i=>i.severity==='warning').length} warnings</p>
  <ul>{issues.slice(0,100).map((issue,i)=><li key={i} className={issue.severity}><strong>{issue.severity==='error'?'Error':'Warning'} · {issue.path}{issue.line?` · line ${issue.line}:${issue.column??1}`:''}</strong><span>{issue.message}</span>{onLocate&&issue.line&&<button onClick={()=>onLocate(issue)}>Go to line {issue.line}</button>}</li>)}</ul>
  {issues.length>100&&<p>Showing the first 100 of {issues.length} findings. Fix these and validate again.</p>}
 </div>;
}
export type ImportDraft = {filename:string;source:string};
export function ImportRepair({initial,onCancel,onImport}:{initial:ImportDraft[];onCancel:()=>void;onImport:(drafts:ImportDraft[])=>Promise<void>}) {
 const [drafts,setDrafts]=useState(initial),[active,setActive]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
 const reports=useMemo(()=>drafts.map(d=>validateInput(d.source,d.filename)),[drafts]);
 const invalid=reports.filter(r=>!r.valid).length;
 const current=drafts[active];
 return <dialog ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)onCancel();}} aria-labelledby="repair-title" className="validation-backdrop"><section className="import-repair">
  <h2 id="repair-title">Review import</h2><p>{invalid} of {drafts.length} files need repair. Your open document is preserved. Nothing is saved until you import.</p>
  <label>File to review<select autoFocus aria-label="File to review" disabled={busy} value={active} onChange={e=>setActive(Number(e.target.value))}>{drafts.map((d,i)=><option key={i} value={i}>{d.filename} · {reports[i].valid?'Ready':'Needs repair'}</option>)}</select></label>
  <label>Import filename<input aria-label="Import filename" value={current.filename} disabled={busy} onChange={e=>setDrafts(old=>old.map((d,i)=>i===active?{...d,filename:e.target.value}:d))}/></label>
  <div className="repair-columns"><label>Repair definition<textarea aria-label="Repair definition" spellCheck={false} disabled={busy} value={current.source} onChange={e=>setDrafts(old=>old.map((d,i)=>i===active?{...d,source:e.target.value}:d))}/></label><ValidationPanel issues={reports[active].issues}/></div>
  {error&&<p role="alert">{error}</p>}
  <div className="repair-actions"><button disabled={busy} onClick={onCancel}>Cancel import</button><button className="primary" disabled={!!invalid||busy} onClick={async()=>{setBusy(true);setError('');try{await onImport(drafts);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Importing…':'Import repaired files'}</button></div>
 </section></dialog>;
}

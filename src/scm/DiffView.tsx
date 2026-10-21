import React,{useEffect,useRef} from 'react';
import {MergeView} from '@codemirror/merge';
import {EditorState} from '@codemirror/state';
import {EditorView,lineNumbers} from '@codemirror/view';
import {languageFor,syntaxFor,highlighting} from '../editor/languages';
import './scm.css';
// Side-by-side diff (research R2: @codemirror/merge) with the file's syntax colors: changed lines
// are marked on both sides, unchanged stretches fold away. Read-only; used by Source Control, file
// history and stale saves.
export function DiffView({before,after,filename,beforeLabel,afterLabel,label}:{before:string;after:string;filename:string;beforeLabel:string;afterLabel:string;label:string}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const syntax=syntaxFor(filename,after||before);
  const side=(doc:string)=>({doc,extensions:[lineNumbers(),highlighting,languageFor(syntax),EditorState.readOnly.of(true),EditorView.editable.of(false)]});
  const view=new MergeView({a:side(before),b:side(after),parent:host.current!,highlightChanges:true,gutter:true,collapseUnchanged:{margin:3,minSize:8}});
  return()=>view.destroy();
 },[before,after,filename]);
 return <figure className="diff-view" role="group" aria-label={label}>
  <div className="diff-labels"><span>{beforeLabel}</span><span>{afterLabel}</span></div>
  <div ref={host} className="diff-host"/>
  {before===after&&<p className="diff-same">The two versions are identical.</p>}
 </figure>;
}

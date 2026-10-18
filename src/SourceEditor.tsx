import React,{forwardRef,useId,useMemo,useState} from 'react';
import type {Issue} from './diagnostics';
import {parseDocument,isMap,isScalar,isSeq} from 'yaml';
import './validation-editor.css';
export function issueFeature(path:string,source?:string){return featureLabeler(source)(path);}
export function featureLabeler(source?:string){
 let root:any;
 if(source)try{const document=parseDocument(source,{uniqueKeys:true});if(!document.errors.length)root=document.contents;}catch{}
 return (path:string)=>{
 if(path==='/'||!path)return 'Document';
 let node:any=root;
 return path.replace(/^\//,'').split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~')).map(segment=>{
  const index=/^\d+$/.test(segment)?Number(segment):null;
  const child=isSeq(node)&&index!==null?node.items[index]:isMap(node)?node.get(segment,true):undefined;
  node=child;
  if(index===null)return segment;
  let name:string|undefined;
  if(isMap(child))for(const key of ['name','id','label','concept','role']){const value=child.get(key,true);if(isScalar(value)&&typeof value.value==='string'&&value.value.trim()){name=value.value;break;}}
  else if(isScalar(child)&&typeof child.value==='string')name=child.value;
  return name?`${name} (item ${index+1})`:`item ${index+1}`;
 }).join(' → ');
 };
}

export function sourceLineRange(source:string,line:number){const lines=source.split('\n'),index=Math.max(0,Math.min(lines.length-1,line-1));const start=lines.slice(0,index).reduce((n,s)=>n+s.length+1,0);return {start,end:start+lines[index].length,line:index+1};}
export function locateSourceIssue(editor:HTMLTextAreaElement,issue:Issue){if(!issue.line)return;const range=sourceLineRange(editor.value,issue.line);editor.focus();editor.setSelectionRange(range.start,range.end);const lineHeight=parseFloat(getComputedStyle(editor).lineHeight)||22;editor.scrollTop=Math.max(0,(range.line-1)*lineHeight-editor.clientHeight/3);editor.dispatchEvent(new Event('scroll',{bubbles:true}));}
type Props=React.TextareaHTMLAttributes<HTMLTextAreaElement>&{issues:Issue[]};
export const SourceEditor=forwardRef<HTMLTextAreaElement,Props>(function SourceEditor({issues,className='',onScroll,...props},ref){
 const id=useId(),[scroll,setScroll]=useState({top:0,left:0});
 const source=String(props.value??'');
 const byLine=useMemo(()=>{const result=new Map<number,Issue[]>();for(const issue of issues){if(issue.line&&issue.line>0)result.set(issue.line,[...(result.get(issue.line)??[]),issue]);}return result;},[issues]);
 const errors=issues.filter(i=>i.severity==='error').length;
 return <div className={`source-editor ${className}`}>
  <div className="source-editor-highlights" aria-hidden="true"><div style={{transform:`translate(${-scroll.left}px,${-scroll.top}px)`}}>{source.split('\n').map((line,index)=>{const findings=byLine.get(index+1)??[];return <div key={index} className={`source-editor-line ${findings.some(i=>i.severity==='error')?'line-error':findings.length?'line-warning':''}`}><span className="source-editor-number">{findings.length?'● ':''}{index+1}</span><span>{line||' '}</span></div>;})}</div></div>
  <textarea {...props} ref={ref} className="source-editor-input" wrap="off" aria-invalid={errors>0} aria-describedby={[props['aria-describedby'],id].filter(Boolean).join(' ')} onScroll={event=>{setScroll({top:event.currentTarget.scrollTop,left:event.currentTarget.scrollLeft});onScroll?.(event);}}/>
  <span className="source-editor-description" id={id}>{errors?`${errors} validation errors. Highlighted lines contain errors; review Validation report for affected features and fixes.`:'Source definition with line numbers.'}</span>
 </div>;
});

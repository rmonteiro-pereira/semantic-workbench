import React,{useEffect,useRef} from 'react';
// Native modal dialog: focus is trapped by the browser, Escape cancels, focus returns afterwards.
// v0.3.0 dialog conventions (T012): `size` sets the width (small 420, medium 560 — the default —,
// large 880, full: the whole window less a margin); `footer` holds the dialog's actions, after the
// scrolling body, so they stay visible on long content.
export type ModalSize='small'|'medium'|'large'|'full';
export function Modal({title,onCancel,children,className='',size='medium',footer,describedBy}:{title:string;onCancel:()=>void;children:React.ReactNode;className?:string;size?:ModalSize;footer?:React.ReactNode;describedBy?:string}){
 const dialog=useRef<HTMLDialogElement>(null),id=useRef('dialog-'+Math.random().toString(36).slice(2)).current;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
 return <dialog ref={dialog} className="validation-backdrop" aria-labelledby={id} aria-describedby={describedBy} aria-modal="true" onCancel={e=>{e.preventDefault();onCancel();}}>
  <section className={`workbench-dialog size-${size}${footer?' has-footer':''} ${className}`.trim()}>
   <h2 id={id}>{title}</h2>
   {footer?<div className="dialog-body">{children}</div>:children}
   {footer&&<footer className="dialog-footer">{footer}</footer>}
  </section>
 </dialog>;
}

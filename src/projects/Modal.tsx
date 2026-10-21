import React,{useEffect,useRef} from 'react';
// Native modal dialog: focus is trapped by the browser, Escape cancels, focus returns afterwards.
export function Modal({title,onCancel,children,className=''}:{title:string;onCancel:()=>void;children:React.ReactNode;className?:string}){
 const dialog=useRef<HTMLDialogElement>(null),id=useRef('dialog-'+Math.random().toString(36).slice(2)).current;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
 return <dialog ref={dialog} className="validation-backdrop" aria-labelledby={id} onCancel={e=>{e.preventDefault();onCancel();}}><section className={`workbench-dialog ${className}`}><h2 id={id}>{title}</h2>{children}</section></dialog>;
}

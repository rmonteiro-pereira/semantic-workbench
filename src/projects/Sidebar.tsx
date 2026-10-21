import React,{useState} from 'react';
import {ChevronDown,ChevronRight,FileCode,FolderGit2} from 'lucide-react';
import type {ProjectInfo} from './api';
// Project → files tree (FR-017, ui-contracts "Sidebar"). Each file shows its document type and
// whether it passed validation; invalid files stay listed so they can be repaired in Source.
const typeLabel=(docType:string)=>docType==='unknown'?'Unrecognized':docType==='gitignore'?'.gitignore':docType;
export function ProjectTree({projects,currentId,onOpen}:{projects:ProjectInfo[];currentId?:string;onOpen:(project:string,path:string)=>void}){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const toggle=(slug:string)=>setCollapsed(old=>{const next=new Set(old);if(next.has(slug))next.delete(slug);else next.add(slug);return next;});
 if(!projects.length)return <p className="projects-empty">No projects yet. Import definitions or load an example.</p>;
 return <ul className="project-tree" role="tree" aria-label="Projects">
  {projects.map(p=>{const open=!collapsed.has(p.slug);return <li key={p.slug} role="treeitem" aria-expanded={open} aria-label={p.name} className="project">
   <button className="project-toggle" aria-label={`${p.name}, ${p.files.length} file${p.files.length===1?'':'s'}`} onClick={()=>toggle(p.slug)} onKeyDown={e=>{if(e.key==='ArrowLeft'&&open){e.preventDefault();toggle(p.slug);}if(e.key==='ArrowRight'&&!open){e.preventDefault();toggle(p.slug);}}}>
    {open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<FolderGit2 size={15}/><span>{p.name}</span><small>{p.files.length}</small>
   </button>
   {open&&<ul role="group">{p.files.map(f=>{const id=`${p.slug}/${f.path}`;return <li key={f.path} role="treeitem" aria-selected={currentId===id} aria-label={f.path} className={`project-file ${f.valid?'':'invalid'}`}>
    <button className={`document ${currentId===id?'chosen':''}`} onClick={()=>onOpen(p.slug,f.path)}><FileCode size={15}/><span>{f.path}</span></button>
    <small className="file-meta">{typeLabel(f.docType)}{!f.valid&&<em className="file-invalid"> · invalid</em>}{f.gitState!=='clean'&&f.gitState!=='unknown'&&<> · {f.gitState}</>}</small>
   </li>;})}</ul>}
  </li>;})}
 </ul>;
}

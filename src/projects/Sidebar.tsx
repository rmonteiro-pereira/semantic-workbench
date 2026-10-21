import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,FileCode,FolderGit2,MoreHorizontal,Trash2} from 'lucide-react';
import type {ProjectInfo} from './api';
// Project → files tree (FR-017, ui-contracts "Sidebar"). Each file shows its document type and
// whether it passed validation; invalid files stay listed so they can be repaired in Source.
export type TreeAction={action:'rename'|'import'|'delete-project'|'gitignore';project:string}|{action:'move'|'delete-file'|'history';project:string;path:string};
// Per-item menu (ui-contracts "Sidebar"): a button that opens a list of menu items.
function ItemMenu({label,items}:{label:string;items:{label:string;run:()=>void}[]}){
 const [open,setOpen]=useState(false),root=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('mousedown',close);root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();return()=>document.removeEventListener('mousedown',close);},[open]);
 return <span className="item-menu" ref={root} onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false);root.current?.querySelector<HTMLElement>('button')?.focus();}}}>
  <button className="item-menu-toggle" aria-label={`Actions for ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(o=>!o)}><MoreHorizontal size={14}/></button>
  {open&&<div role="menu" aria-label={`Actions for ${label}`} className="item-menu-list">{items.map(i=><button key={i.label} role="menuitem" onClick={()=>{setOpen(false);i.run();}}>{i.label}</button>)}</div>}
 </span>;
}
// Direct delete on every row: same confirmation → undo → trash flow as the menu's Delete.
function DeleteButton({label,onClick}:{label:string;onClick:()=>void}){
 return <button className="row-action row-delete" aria-label={label} title={label} onClick={onClick}><Trash2 size={15} aria-hidden="true"/></button>;
}
const typeLabel=(docType:string)=>docType==='unknown'?'Unrecognized':docType==='gitignore'?'.gitignore':docType;
export function ProjectTree({projects,currentId,onOpen,onAction}:{projects:ProjectInfo[];currentId?:string;onOpen:(project:string,path:string)=>void;onAction:(a:TreeAction)=>void}){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const toggle=(slug:string)=>setCollapsed(old=>{const next=new Set(old);if(next.has(slug))next.delete(slug);else next.add(slug);return next;});
 if(!projects.length)return <p className="projects-empty">No projects yet. Import definitions or load an example.</p>;
 return <ul className="project-tree" role="tree" aria-label="Projects">
  {projects.map(p=>{const open=!collapsed.has(p.slug);return <li key={p.slug} role="treeitem" aria-expanded={open} aria-label={p.name} className="project">
   <div className="tree-row"><button className="project-toggle" title={p.name} aria-label={`${p.name}, ${p.files.length} file${p.files.length===1?'':'s'}`} onClick={()=>toggle(p.slug)} onKeyDown={e=>{if(e.key==='ArrowLeft'&&open){e.preventDefault();toggle(p.slug);}if(e.key==='ArrowRight'&&!open){e.preventDefault();toggle(p.slug);}}}>
    {open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<FolderGit2 size={15}/><span>{p.name}</span><small>{p.files.length}</small>
   </button>
   <DeleteButton label={`Delete project ${p.name}`} onClick={()=>onAction({action:'delete-project',project:p.slug})}/>
   <ItemMenu label={p.name} items={[{label:'Rename',run:()=>onAction({action:'rename',project:p.slug})},{label:'Import files into this project',run:()=>onAction({action:'import',project:p.slug})},{label:'Edit .gitignore',run:()=>onAction({action:'gitignore',project:p.slug})},{label:'Delete',run:()=>onAction({action:'delete-project',project:p.slug})}]}/></div>
   {open&&<ul role="group">{p.files.map(f=>{const id=`${p.slug}/${f.path}`;return <li key={f.path} role="treeitem" aria-selected={currentId===id} aria-label={f.path} className={`project-file ${f.valid?'':'invalid'}`}>
    <div className="tree-row file-row"><button className={`document ${currentId===id?'chosen':''}`} onClick={()=>onOpen(p.slug,f.path)}><FileCode size={15}/><span>{f.path}</span></button>
    <DeleteButton label={`Delete ${f.path}`} onClick={()=>onAction({action:'delete-file',project:p.slug,path:f.path})}/>
    <ItemMenu label={`${f.path} in ${p.name}`} items={[{label:'History',run:()=>onAction({action:'history',project:p.slug,path:f.path})},{label:'Move',run:()=>onAction({action:'move',project:p.slug,path:f.path})},{label:'Delete',run:()=>onAction({action:'delete-file',project:p.slug,path:f.path})}]}/></div>
    <small className="file-meta">{typeLabel(f.docType)}{f.layout==='embedded (deprecated)'&&<span title="Consolidated Ossie file: the ontology embeds its semantic model in ontology_mappings. Apache Ossie deprecates this layout in favour of split files."> · consolidated (deprecated upstream)</span>}{!f.valid&&<em className="file-invalid"> · invalid</em>}{f.gitState!=='clean'&&f.gitState!=='unknown'&&<> · {f.gitState}</>}</small>
   </li>;})}</ul>}
  </li>;})}
 </ul>;
}

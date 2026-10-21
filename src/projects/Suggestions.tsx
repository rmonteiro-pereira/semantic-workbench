import React from 'react';
import type {ProjectInfo,Suggestion} from './api';
// FR-019: suggestions show their evidence; nothing moves until "Add to project".
export function Suggestions({items,projects,onAccept,onReject}:{items:Suggestion[];projects:ProjectInfo[];onAccept:(id:string)=>void;onReject:(id:string)=>void}){
 if(!items.length)return null;
 const name=(slug:string)=>projects.find(p=>p.slug===slug)?.name??slug;
 return <details role="region" aria-label="Grouping suggestions" className="suggestions" open>
  <summary className="section-label">Grouping suggestions <span>{items.length}</span></summary>
  {items.map(s=><div key={s.id} className="suggestion">
   <p><strong>{s.file.path}</strong> ({name(s.file.project)}) may belong in <strong>{name(s.targetProject)}</strong>.</p>
   <ul>{s.evidence.slice(0,3).map((e,i)=><li key={i} title={e.detail}>{e.detail}</li>)}{s.evidence.length>3&&<li>and {s.evidence.length-3} more</li>}</ul>
   <span><button onClick={()=>onAccept(s.id)}>Add to project</button><button onClick={()=>onReject(s.id)}>Dismiss</button></span>
  </div>)}
 </details>;
}

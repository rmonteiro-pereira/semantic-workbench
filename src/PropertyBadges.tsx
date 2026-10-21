import React from 'react';
import './property-badges.css';
// Column badges shared by the Properties table, the contract overview counts and lineage card rows
// (FR-027): one label and colour per key or constraint, read from the same property fields.
export type BadgeKind='pk'|'fk'|'required'|'unique'|'classification'|'identifying'|'unmapped';
export type BadgeInfo={kind:BadgeKind;label:string;title:string};
const LABEL:Record<Exclude<BadgeKind,'classification'>,string>={pk:'PK',fk:'FK',required:'Required',unique:'Unique',identifying:'Identifying',unmapped:'Unmapped'};
const TITLE:Record<Exclude<BadgeKind,'classification'|'fk'>,string>={pk:'Primary key',required:'Required',unique:'Unique',identifying:'Identifying field of the object mapping',unmapped:'No mapping refers to this item'};
const text=(v:unknown)=>typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):'';
// Badges of one ODCS property; `fkTargets` are the referenced `object.column` names.
export function propertyBadges(property:Record<string,any>|undefined,fkTargets:string[]=[]):BadgeInfo[]{
 const out:BadgeInfo[]=[];if(!property)return out;
 if(property.primaryKey===true)out.push({kind:'pk',label:LABEL.pk,title:TITLE.pk});
 if(fkTargets.length)out.push({kind:'fk',label:LABEL.fk,title:`Foreign key to ${fkTargets.join(', ')}`});
 if(property.required===true)out.push({kind:'required',label:LABEL.required,title:TITLE.required});
 if(property.unique===true)out.push({kind:'unique',label:LABEL.unique,title:TITLE.unique});
 const c=text(property.classification);if(c)out.push({kind:'classification',label:c,title:`Classification: ${c}`});
 return out;
}
export const badge=(kind:Exclude<BadgeKind,'classification'|'fk'>):BadgeInfo=>({kind,label:LABEL[kind],title:TITLE[kind]});
export function Badge({kind,title,children}:{kind:BadgeKind;title?:string;children?:React.ReactNode}){
 return <span className={`prop-badge b-${kind}`} title={title}>{children??(kind==='classification'?'':LABEL[kind])}</span>;
}
export function PropertyBadges({badges,className=''}:{badges:BadgeInfo[];className?:string}){
 if(!badges.length)return null;
 return <span className={`prop-badges ${className}`.trim()}>{badges.map(b=><Badge key={b.kind+b.label} kind={b.kind} title={b.title}>{b.label}</Badge>)}</span>;
}

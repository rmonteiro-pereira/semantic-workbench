import React,{useEffect,useMemo,useState} from 'react';
import {parse} from 'yaml';
import {ArrowLeft,ArrowDown,ArrowUp,ArrowUpDown,Search,Table2} from 'lucide-react';
import {odcsForeignKeys} from '../odcs';
import {scm,type Doc,type GitCommit as Commit} from '../projects/api';
import {diffObject,flattenProperties,lastChange,type ObjectDiff} from './odcs-diff';
import {buildLineage,closure,objectId,cardOfNode,type LineageCard} from './lineage';
import {LineageCanvas} from './LineageCanvas';
import {projectFiles,projectRevision} from './project-files';
import {rulesOf} from './ContractOverview';
import {Badge,badge,type BadgeInfo} from '../PropertyBadges';
import './odcs.css';
// Marquez-style dataset page for one ODCS schema object (FR-057): a header with key facts, then
// Schema (property table), Lineage (graph with depth control and property-level lineage), History
// (versions from Git with property-level changes) and Quality (rules as declared, never run).
const list=(v:unknown):any[]=>Array.isArray(v)?v:[];
const text=(v:unknown)=>v===undefined||v===null?'':typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):JSON.stringify(v);
type Version=Commit&{source:string;data:any};
// v0.3.0 asset page (FR-011): Lineage, Relationships, Data Quality, Properties, History.
type Tab='Lineage'|'Relationships'|'Data Quality'|'Properties'|'History';
const TABS:Tab[]=['Lineage','Relationships','Data Quality','Properties','History'];
export type PropertyCellProps={objectIndex:number;path:string;property:Record<string,any>;column:Column};
type Column={key:string;label:string;value:(p:Record<string,any>)=>string|number|boolean|undefined};
export const COLUMNS:Column[]=[
 {key:'name',label:'Name',value:()=>undefined},
 {key:'logicalType',label:'Logical type',value:p=>p.logicalType},
 {key:'physicalType',label:'Physical type',value:p=>p.physicalType},
 {key:'required',label:'Required',value:p=>p.required===true},
 {key:'unique',label:'Unique',value:p=>p.unique===true},
 {key:'primaryKey',label:'Primary key',value:p=>p.primaryKey===true},
 {key:'classification',label:'Classification',value:p=>p.classification},
 {key:'description',label:'Description',value:p=>p.description},
 {key:'tags',label:'Tags',value:p=>list(p.tags).join(', ')},
 {key:'foreignKeys',label:'Foreign keys',value:()=>undefined},
];
type Props={doc:Doc;data:any;objectName:string;projectDocs:Doc[];onBack:()=>void;onOpenObject:(name:string)=>void;onOpenInLineage?:(name:string)=>void;onNeighborhood?:(card:LineageCard)=>void;
 // Changes when Git reports a commit, switch or pull, so History follows commits made elsewhere.
 gitVersion?:number;
 // T143: cells that can be edited in place; null renders the value read-only.
 editor?:(cell:PropertyCellProps)=>React.ReactNode|null};
export function DatasetPage({doc,data,objectName,projectDocs,onBack,onOpenObject,onOpenInLineage,onNeighborhood,editor,gitVersion=0}:Props){
 const schema=list(data?.schema),index=schema.findIndex((o:any)=>o?.name===objectName),object=schema[index];
 const [tab,setTab]=useState<Tab>('Properties');
 const [versions,setVersions]=useState<Version[]|null>(null),[historyError,setHistoryError]=useState('');
 useEffect(()=>{setTab('Properties');},[objectName]);
 // The file's committed versions: last change in the header and the History tab.
 useEffect(()=>{let live=true;setHistoryError('');scm.versions(doc.project,doc.path,20).then(vs=>{if(!live)return;setVersions(vs.map(v=>{let parsed:any=null;try{parsed=parse(v.source);}catch{}return {...v,data:parsed};}));}).catch(e=>{if(live){setVersions([]);setHistoryError(e.message);}});return()=>{live=false;};},[doc.project,doc.path,doc.hash,gitVersion]);
 if(!object)return <section className="odcs-page" aria-label={`Dataset ${objectName}`}><button className="odcs-back" onClick={onBack}><ArrowLeft size={14}/>All objects</button><p className="odcs-note">{objectName} is no longer in this contract.</p></section>;
 const properties=flattenProperties(object.properties),rules=rulesOf(object),changed=versions?lastChange(versions,objectName):null,tags=list(object.tags);
 return <section className="odcs-page odcs-dataset" aria-label={`Dataset ${objectName}`}>
  <button className="odcs-back" onClick={onBack}><ArrowLeft size={14}/>All objects</button>
  <header className="odcs-head">
   <div className="odcs-title"><Table2 size={20}/><div><h2>{objectName}</h2>{object.physicalName&&<small><code>{text(object.physicalName)}</code></small>}</div></div>
   <div className="odcs-facts dataset-facts" role="group" aria-label="Dataset facts">
    <span><b>Type</b><span>{[object.physicalType,object.logicalType].filter(Boolean).map(text).join(' · ')||'—'}</span></span>
    <span><b>Properties</b><span>{properties.length} {properties.length===1?'property':'properties'}</span></span>
    <span><b>Quality</b><span>{rules.length} quality {rules.length===1?'rule':'rules'}</span></span>
    <span><b>Last change</b><span>{versions===null?'…':changed?<>{changed.message} · <code>{changed.commit.slice(0,7)}</code> · {new Date(changed.date).toLocaleDateString()} · {changed.author}</>:'Not committed yet'}</span></span>
    {tags.length>0&&<span><b>Tags</b><span>{tags.map(t=><em key={text(t)} className="odcs-tag">{text(t)}</em>)}</span></span>}
   </div>
   {object.description&&<p className="odcs-description">{text(object.description)}</p>}
  </header>
  <div className="odcs-tabs" role="tablist" aria-label="Asset views">
   {TABS.map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'selected':''} onClick={()=>setTab(t)}>{t}{t==='Data Quality'&&rules.length>0&&<small>{rules.length}</small>}</button>)}
   {onOpenInLineage&&<button className="odcs-tab-action" onClick={()=>onOpenInLineage(objectName)}>Open {objectName} in lineage</button>}
  </div>
  <div className="odcs-panel" role="tabpanel" aria-label={tab}>
   {tab==='Properties'&&<SchemaTab data={data} objectIndex={index} onOpenObject={onOpenObject} editor={editor}/>}
   {tab==='Lineage'&&<LineageTab doc={doc} projectDocs={projectDocs} objectName={objectName} onOpenObject={onOpenObject} onNeighborhood={onNeighborhood}/>}
   {tab==='Relationships'&&<RelationshipsTab data={data} objectIndex={index} onOpenObject={onOpenObject}/>}
   {tab==='History'&&<HistoryTab versions={versions} error={historyError} objectName={objectName}/>}
   {tab==='Data Quality'&&<QualityTab object={object}/>}
  </div>
 </section>;
}
// Foreign-key targets per property path: property-level relationships and schema-level ones.
function foreignKeys(data:any,objectIndex:number){
 const schema=list(data?.schema),out=new Map<string,string[]>();
 for(const k of odcsForeignKeys(data))if(k.from===objectIndex)for(const name of k.label.split(', ')){const t=String(schema[k.to]?.name);const xs=out.get(name)??[];if(!xs.includes(t))xs.push(t);out.set(name,xs);}
 return out;
}
function SchemaTab({data,objectIndex,onOpenObject,editor}:{data:any;objectIndex:number;onOpenObject:(n:string)=>void;editor?:Props['editor']}){
 const object=list(data?.schema)[objectIndex],rows=useMemo(()=>flattenProperties(object?.properties),[object]),fks=useMemo(()=>foreignKeys(data,objectIndex),[data,objectIndex]);
 const [filter,setFilter]=useState(''),[sort,setSort]=useState<{key:string;dir:1|-1}|null>(null);
 const valueOf=(r:{path:string;property:any},key:string)=>key==='name'?r.path:key==='foreignKeys'?(fks.get(r.path)??[]).join(', '):text(COLUMNS.find(c=>c.key===key)!.value(r.property));
 const shown=useMemo(()=>{
  const q=filter.trim().toLowerCase();let out=q?rows.filter(r=>COLUMNS.some(c=>valueOf(r,c.key).toLowerCase().includes(q))):rows;
  if(sort)out=[...out].sort((a,b)=>sort.dir*valueOf(a,sort.key).localeCompare(valueOf(b,sort.key),undefined,{numeric:true}));
  return out;
 },[rows,filter,sort,fks]);
 const toggle=(key:string)=>setSort(s=>s?.key===key?{key,dir:s.dir===1?-1:1}:{key,dir:1});
 return <>
  <div className="odcs-toolbar"><label className="odcs-search"><Search size={14}/><input type="search" aria-label="Filter properties" placeholder="Filter properties…" value={filter} onChange={e=>setFilter(e.target.value)}/></label><small>{shown.length===rows.length?`${rows.length} properties`:`${shown.length} of ${rows.length} properties`}</small></div>
  <div className="odcs-table-wrap"><table className="odcs-table" aria-label="Properties">
   <thead><tr>{COLUMNS.map(c=><th key={c.key} aria-sort={sort?.key===c.key?(sort.dir===1?'ascending':'descending'):undefined}><button className="odcs-sort" aria-label={`Sort by ${c.label}`} onClick={()=>toggle(c.key)}>{c.label}{sort?.key===c.key?(sort.dir===1?<ArrowUp size={11}/>:<ArrowDown size={11}/>):<ArrowUpDown size={11} className="idle"/>}</button></th>)}</tr></thead>
   <tbody>{shown.map(r=><PropertyRow key={r.path} objectIndex={objectIndex} path={r.path} property={r.property} targets={fks.get(r.path)??[]} onOpenObject={onOpenObject} editor={editor}/>)}</tbody>
  </table></div>
  {!shown.length&&<p className="odcs-note">No property matches “{filter}”.</p>}
 </>;
}
// The boolean columns render the shared badges (FR-027), so the table and lineage cards match.
const BOOLEAN_BADGE:Record<string,BadgeInfo>={primaryKey:badge('pk'),required:badge('required'),unique:badge('unique')};
function PropertyRow({objectIndex,path,property,targets,onOpenObject,editor}:{objectIndex:number;path:string;property:Record<string,any>;targets:string[];onOpenObject:(n:string)=>void;editor?:Props['editor']}){
 const depth=path.split('.').length-1+(path.match(/\[\]/g)?.length??0);
 return <tr>{COLUMNS.map(c=>{
  const custom=editor?.({objectIndex,path,property,column:c});
  if(custom!==undefined&&custom!==null)return <td key={c.key} className={`col-${c.key}`}>{custom}</td>;
  if(c.key==='name')return <td key={c.key} className="col-name" style={depth?{paddingLeft:10+depth*14}:undefined}><code>{path}</code></td>;
  if(c.key==='foreignKeys')return <td key={c.key}>{targets.map(t=><button key={t} className="odcs-link fk" aria-label={`Open ${t}`} title={`Foreign key to ${t}`} onClick={()=>onOpenObject(t)}><Badge kind="fk"/>{t}</button>)}</td>;
  const v=c.value(property),flag=BOOLEAN_BADGE[c.key];
  if(flag)return <td key={c.key} className={`col-${c.key}`}>{v===true?<Badge kind={flag.kind} title={flag.title}>{flag.label}</Badge>:''}</td>;
  if(c.key==='classification')return <td key={c.key} className={`col-${c.key}`}>{text(v)?<Badge kind="classification" title={`Classification: ${text(v)}`}>{text(v)}</Badge>:''}</td>;
  return <td key={c.key} className={`col-${c.key}`}>{c.key==='tags'&&v?String(v).split(', ').map(t=><em key={t} className="odcs-tag">{t}</em>):text(v)}</td>;
 })}</tr>;
}
// The asset's Lineage tab (FR-011): the lineage canvas centred on this object, and per property
// the fields that read it and the metrics downstream of it, read from the same lineage graph.
function LineageTab({doc,projectDocs,objectName,onOpenObject,onNeighborhood}:{doc:Doc;projectDocs:Doc[];objectName:string;onOpenObject:(n:string)=>void;onNeighborhood?:(card:LineageCard)=>void}){
 const rev=projectRevision(projectDocs);
 const graph=useMemo(()=>buildLineage(projectFiles(projectDocs),doc.path,rev),[rev,doc.path]);
 const id=objectId(doc.path,objectName),card=graph.cards.get(id);
 const rows=useMemo(()=>(card?.columns??[]).map(col=>{
  const down=closure(graph,[col.id],'down'),fields:string[]=[],metrics:string[]=[];
  for(const n of down.nodes){if(n===col.id)continue;const c=graph.cards.get(cardOfNode(graph,n));if(!c)continue;if(c.kind==='dataset'&&n!==c.id)fields.push(`${c.label}.${n.slice(c.id.length+1)}`);if(c.kind==='metric')metrics.push(c.label);}
  return {path:col.path,fields:[...new Set(fields)].sort(),metrics:[...new Set(metrics)].sort()};
 }),[graph,card]);
 if(!card)return <p className="odcs-note">No lineage for this object.</p>;
 return <>
  <div className="odcs-lineage-host"><LineageCanvas graph={graph} center={id} compact ariaLabel="Lineage graph" storageKey={`workbench:lineage-steps:${doc.id}`} onOpenAsset={c=>onOpenObject(c.label)} onNeighborhood={onNeighborhood}/></div>
  <h3 className="odcs-subhead">Property lineage</h3>
  <div className="odcs-table-wrap"><table className="odcs-table compact" aria-label="Property lineage">
   <thead><tr><th>Property</th><th>Read by fields</th><th>Metrics downstream</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.path}><td><code>{r.path}</code></td><td>{r.fields.length?r.fields.map(f=><code key={f} className="odcs-chip">{f}</code>):<span className="muted">—</span>}</td><td>{r.metrics.length?r.metrics.map(m=><span key={m} className="odcs-chip metric">{m}</span>):<span className="muted">—</span>}</td></tr>)}</tbody>
  </table></div>
 </>;
}
// Relationships (FR-011): foreign keys out of and into each column, both directions, with links.
function RelationshipsTab({data,objectIndex,onOpenObject}:{data:any;objectIndex:number;onOpenObject:(n:string)=>void}){
 const schema=list(data?.schema),name=String(schema[objectIndex]?.name);
 const rows=useMemo(()=>{
  const out:{column:string;direction:'out'|'in';other:string;otherColumn:string;label:string}[]=[];
  for(const k of odcsForeignKeys(data))k.fromColumns.forEach((c,i)=>{
   if(k.from===objectIndex)out.push({column:c,direction:'out',other:String(schema[k.to]?.name),otherColumn:k.toColumns[i],label:k.label});
   if(k.to===objectIndex)out.push({column:k.toColumns[i],direction:'in',other:String(schema[k.from]?.name),otherColumn:c,label:k.label});
  });
  return out.sort((a,b)=>a.column.localeCompare(b.column)||a.direction.localeCompare(b.direction)||a.other.localeCompare(b.other));
 },[data,objectIndex]);
 if(!rows.length)return <p className="odcs-note">{name} has no foreign keys and no other object references it.</p>;
 return <>
  <p className="odcs-note">Foreign keys as declared in the contract. In lineage they are drawn from the referenced column to the referencing one (the workbench's reading).</p>
  <div className="odcs-table-wrap"><table className="odcs-table compact" aria-label="Relationships">
   <thead><tr><th>Column</th><th>Direction</th><th>Other object</th><th>Other column</th></tr></thead>
   <tbody>{rows.map((r,i)=><tr key={i}><td><code>{r.column}</code></td><td>{r.direction==='out'?<span className="odcs-dir out">references</span>:<span className="odcs-dir in">referenced by</span>}</td><td><button className="odcs-link fk" aria-label={`Open ${r.other}`} onClick={()=>onOpenObject(r.other)}>{r.other}</button></td><td><code>{r.otherColumn}</code></td></tr>)}</tbody>
  </table></div>
 </>;
}
function HistoryTab({versions,error,objectName}:{versions:Version[]|null;error:string;objectName:string}){
 const [from,setFrom]=useState(''),[to,setTo]=useState('');
 useEffect(()=>{if(versions&&versions.length>1){setFrom(versions[1].commit);setTo(versions[0].commit);}},[versions]);
 if(error)return <p role="alert" className="odcs-note">History is not available: {error}</p>;
 if(!versions)return <p className="odcs-note">Loading versions…</p>;
 const count=(v:Version)=>{const o=list(v.data?.schema).find((x:any)=>x?.name===objectName);return o?flattenProperties(o.properties).length:null;};
 const a=versions.find(v=>v.commit===from),b=versions.find(v=>v.commit===to),diff:ObjectDiff|null=a&&b?diffObject(a.data,b.data,objectName):null;
 const option=(v:Version)=><option key={v.commit} value={v.commit}>{v.commit.slice(0,7)} · {text(v.data?.version)} · {v.message}</option>;
 return <>
  <div className="odcs-table-wrap"><table className="odcs-table compact" aria-label="Versions">
   <thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Message</th><th className="num">Properties</th></tr></thead>
   <tbody>{versions.map(v=><tr key={v.commit} className={v.commit===from||v.commit===to?'selected':''}><td>{text(v.data?.version)||'—'} <code>{v.commit.slice(0,7)}</code></td><td>{new Date(v.date).toLocaleString()}</td><td>{v.author}</td><td>{v.message}</td><td className="num">{count(v)??<span className="muted">absent</span>}</td></tr>)}</tbody>
  </table></div>
  {versions.length<2?<p className="odcs-note">{versions.length?'Only one committed version so far; commit a change to compare versions.':'This file has no commits yet.'}</p>:<>
   <div className="odcs-compare"><label><span>From version</span><select aria-label="From version" value={from} onChange={e=>setFrom(e.target.value)}>{versions.map(option)}</select></label><label><span>To version</span><select aria-label="To version" value={to} onChange={e=>setTo(e.target.value)}>{versions.map(option)}</select></label></div>
   <section className="odcs-changes" aria-label="Changes between versions">
    {!diff?<p className="odcs-note">No changes to {objectName} between these versions.</p>:<>
     {diff.kind!=='changed'&&<p><span className={`odcs-change ${diff.kind}`}>{diff.kind}</span> {objectName} {diff.kind==='added'?'appears':'disappears'} in this version.</p>}
     {diff.attributes.length>0&&<ul className="odcs-change-list">{diff.attributes.map(c=><li key={c.attribute}><span className="odcs-change changed">changed</span><b>{c.attribute}</b> <Values before={c.before} after={c.after}/></li>)}</ul>}
     <ul className="odcs-change-list">{diff.properties.map(p=><li key={p.kind+p.path}><span className={`odcs-change ${p.kind}`}>{p.kind}</span><code>{p.path}</code>{p.changes.length>0&&<ul>{p.changes.map(c=><li key={c.attribute}><b>{c.attribute}</b> <Values before={c.before} after={c.after}/></li>)}</ul>}</li>)}</ul>
    </>}
   </section>
  </>}
 </>;
}
const shown=(v:unknown)=>v===undefined?'(none)':typeof v==='string'?v:JSON.stringify(v);
const Values=({before,after}:{before:unknown;after:unknown})=><span className="odcs-values"><del>{shown(before)}</del> → <ins>{shown(after)}</ins></span>;
const OPERATORS:[string,string][]=[['mustBe','='],['mustNotBe','≠'],['mustBeGreaterThan','>'],['mustBeGreaterOrEqualTo','≥'],['mustBeLessThan','<'],['mustBeLessOrEqualTo','≤']];
export function threshold(r:any){
 for(const [k,op] of OPERATORS)if(r?.[k]!==undefined)return `${op} ${text(r[k])}`;
 if(Array.isArray(r?.mustBeBetween))return `between ${text(r.mustBeBetween[0])} and ${text(r.mustBeBetween[1])}`;
 if(Array.isArray(r?.mustNotBeBetween))return `not between ${text(r.mustNotBeBetween[0])} and ${text(r.mustNotBeBetween[1])}`;
 return '';
}
function QualityTab({object}:{object:any}){
 const rules=[...list(object.quality).map(r=>({scope:'Object',rule:r})),...flattenProperties(object.properties).flatMap(p=>list(p.property.quality).map(r=>({scope:p.path,rule:r})))];
 return <>
  <p className="odcs-note">Rules are shown as declared in the contract; the workbench does not run them.</p>
  {!rules.length?<p className="odcs-note">This object declares no quality rules.</p>:<div className="odcs-table-wrap"><table className="odcs-table" aria-label="Quality rules">
   <thead><tr><th>Applies to</th><th>Rule</th><th>Dimension</th><th>Severity</th><th>Type</th><th>Check</th><th>Threshold</th><th>Unit</th><th>Description</th></tr></thead>
   <tbody>{rules.map(({scope,rule:r},i)=><tr key={i}><td>{scope==='Object'?<span className="muted">Object</span>:<code>{scope}</code>}</td><td>{text(r.name)}</td><td>{text(r.dimension)}</td><td>{r.severity?<span className={`odcs-severity s-${text(r.severity)}`}>{text(r.severity)}</span>:''}</td><td>{text(r.type)}</td><td>{text(r.metric??r.rule)}{r.query&&<code className="odcs-query">{text(r.query)}</code>}</td><td>{threshold(r)}</td><td>{text(r.unit)}</td><td>{text(r.description)}</td></tr>)}</tbody>
  </table></div>}
 </>;
}

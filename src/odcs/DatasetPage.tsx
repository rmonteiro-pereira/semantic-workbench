import React,{useEffect,useMemo,useState} from 'react';
import {parse} from 'yaml';
import {ArrowLeft,ArrowDown,ArrowUp,ArrowUpDown,Database,Gauge,Search,Table2,Columns3,Target} from 'lucide-react';
import {odcsForeignKeys} from '../odcs';
import {rdfSyntax} from '../rdf';
import {scm,type Doc,type GitCommit as Commit} from '../projects/api';
import {diffObject,flattenProperties,lastChange,type ObjectDiff} from './odcs-diff';
import {odcsLineage,type Lineage,type LineageNode} from './lineage';
import {rulesOf} from './ContractOverview';
import {LineageLegend} from '../graph/LineageLegend';
import {Badge,badge,type BadgeInfo} from '../PropertyBadges';
import './odcs.css';
// Marquez-style dataset page for one ODCS schema object (FR-057): a header with key facts, then
// Schema (property table), Lineage (graph with depth control and property-level lineage), History
// (versions from Git with property-level changes) and Quality (rules as declared, never run).
const list=(v:unknown):any[]=>Array.isArray(v)?v:[];
const text=(v:unknown)=>v===undefined||v===null?'':typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):JSON.stringify(v);
type Version=Commit&{source:string;data:any};
type Tab='Schema'|'Lineage'|'History'|'Quality';
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
type Props={doc:Doc;data:any;objectName:string;projectDocs:Doc[];onBack:()=>void;onOpenObject:(name:string)=>void;
 // Changes when Git reports a commit, switch or pull, so History follows commits made elsewhere.
 gitVersion?:number;
 // T143: cells that can be edited in place; null renders the value read-only.
 editor?:(cell:PropertyCellProps)=>React.ReactNode|null};
export function DatasetPage({doc,data,objectName,projectDocs,onBack,onOpenObject,editor,gitVersion=0}:Props){
 const schema=list(data?.schema),index=schema.findIndex((o:any)=>o?.name===objectName),object=schema[index];
 const [tab,setTab]=useState<Tab>('Schema');
 const [versions,setVersions]=useState<Version[]|null>(null),[historyError,setHistoryError]=useState('');
 useEffect(()=>{setTab('Schema');},[objectName]);
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
  <div className="odcs-tabs" role="tablist" aria-label="Dataset views">
   {(['Schema','Lineage','History','Quality'] as Tab[]).map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'selected':''} onClick={()=>setTab(t)}>{t}{t==='Quality'&&rules.length>0&&<small>{rules.length}</small>}</button>)}
  </div>
  <div className="odcs-panel" role="tabpanel" aria-label={tab}>
   {tab==='Schema'&&<SchemaTab data={data} objectIndex={index} onOpenObject={onOpenObject} editor={editor}/>}
   {tab==='Lineage'&&<LineageTab doc={doc} projectDocs={projectDocs} objectName={objectName}/>}
   {tab==='History'&&<HistoryTab versions={versions} error={historyError} objectName={objectName}/>}
   {tab==='Quality'&&<QualityTab object={object}/>}
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
// Project files parsed once per content hash (RDF files are not YAML/JSON and are skipped).
const parsedCache=new Map<string,any>();
function projectFiles(docs:Doc[]){
 return docs.flatMap(d=>{
  if(rdfSyntax(d.source,d.filename))return [];
  const key=d.id+'#'+d.hash;if(!parsedCache.has(key)){let v:any=null;try{v=parse(d.source);}catch{}parsedCache.set(key,v);}
  const data=parsedCache.get(key);return data&&typeof data==='object'?[{path:d.path,data}]:[];
 });
}
const KIND_LABEL:Record<LineageNode['kind'],string>={object:'Contract object',dataset:'Semantic dataset',field:'Field',metric:'Metric',kpi:'KPI'};
const KIND_ICON:Record<LineageNode['kind'],React.ReactNode>={object:<Table2 size={12}/>,dataset:<Database size={12}/>,field:<Columns3 size={12}/>,metric:<Gauge size={12}/>,kpi:<Gauge size={12}/>};
const NODE_W=196,NODE_H=40,COL_GAP=64,ROW_GAP=10;
function LineageTab({doc,projectDocs,objectName}:{doc:Doc;projectDocs:Doc[];objectName:string}){
 const files=useMemo(()=>projectFiles(projectDocs),[projectDocs.map(d=>d.id+d.hash).join('|')]);
 const full=useMemo(()=>{try{return odcsLineage(files,doc.path,objectName,99);}catch{return null;}},[files,objectName,doc.path]);
 const [depth,setDepth]=useState(2);
 const max=Math.max(1,full?.maxDepth??1),shownDepth=Math.min(depth,max);
 const lineage=useMemo(()=>{try{return odcsLineage(files,doc.path,objectName,shownDepth);}catch{return null;}},[files,objectName,doc.path,shownDepth]);
 if(!lineage||!full)return <p className="odcs-note">No lineage for this object.</p>;
 return <>
  <div className="odcs-toolbar">
   <label className="odcs-depth"><span>Depth</span><select aria-label="Lineage depth" value={String(shownDepth)} onChange={e=>setDepth(Number(e.target.value))}>{Array.from({length:max},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>
   <LineageLegend/>
  </div>
  <p className="odcs-note">Downstream links are matched by declared names: a semantic dataset whose <code>source</code> is this object's physical name, fields whose expressions read its columns, and the metrics over those fields.</p>
  <LineageGraph lineage={lineage}/>
  <h3 className="odcs-subhead">Property lineage</h3>
  <div className="odcs-table-wrap"><table className="odcs-table compact" aria-label="Property lineage">
   <thead><tr><th>Property</th><th>Read by fields</th><th>Used by metrics</th></tr></thead>
   <tbody>{flattenProperties(projectFiles([doc]).find(f=>f.path===doc.path)?.data?.schema?.find((o:any)=>o?.name===objectName)?.properties).map(({path})=>{const l=full.properties[path];return <tr key={path}><td><code>{path}</code></td><td>{l?.fields.map(f=><code key={f} className="odcs-chip">{f}</code>)??<span className="muted">—</span>}</td><td>{l?.metrics.length?l.metrics.map(m=><span key={m} className="odcs-chip metric">{m}</span>):<span className="muted">—</span>}</td></tr>;})}</tbody>
  </table></div>
 </>;
}
// Columns by distance from the object; edges drawn as curves (foreign keys dashed). The region
// scrolls on its own so large lineages never widen the page.
function LineageGraph({lineage}:{lineage:Lineage}){
 const layout=useMemo(()=>{
  const order:Record<string,number>={object:0,dataset:1,field:2,kpi:3,metric:4};
  const columns=new Map<number,LineageNode[]>();for(const n of lineage.nodes){const c=columns.get(n.depth)??[];c.push(n);columns.set(n.depth,c);}
  const pos=new Map<string,{x:number;y:number}>();let height=0;
  for(const [d,nodes] of [...columns].sort((a,b)=>a[0]-b[0])){nodes.sort((a,b)=>order[a.kind]-order[b.kind]||a.label.localeCompare(b.label));nodes.forEach((n,i)=>pos.set(n.id,{x:d*(NODE_W+COL_GAP),y:i*(NODE_H+ROW_GAP)}));height=Math.max(height,nodes.length*(NODE_H+ROW_GAP));}
  return {pos,width:(Math.max(0,...columns.keys())+1)*(NODE_W+COL_GAP)-COL_GAP,height:Math.max(height-ROW_GAP,NODE_H)};
 },[lineage]);
 const path=(a:{x:number;y:number},b:{x:number;y:number})=>{
  if(a.x===b.x){const x=a.x+NODE_W,y1=a.y+NODE_H/2,y2=b.y+NODE_H/2;return `M${x} ${y1} C${x+36} ${y1},${x+36} ${y2},${x} ${y2}`;}
  const [l,r]=a.x<b.x?[a,b]:[b,a],x1=l.x+NODE_W,y1=l.y+NODE_H/2,x2=r.x,y2=r.y+NODE_H/2,mid=(x1+x2)/2;return `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`;
 };
 return <div className="odcs-lineage" role="region" aria-label="Lineage graph" tabIndex={0}>
  <div className="lineage-canvas" style={{width:layout.width,height:layout.height}}>
   <svg width={layout.width} height={layout.height} aria-hidden="true">{lineage.edges.map((e,i)=>{const a=layout.pos.get(e.from),b=layout.pos.get(e.to);return a&&b?<path key={i} d={path(a,b)} className={e.kind==='foreign-key'?'edge fk':'edge'}/>:null;})}</svg>
   {lineage.nodes.map(n=>{const p=layout.pos.get(n.id)!;return <div key={n.id} className={`lineage-node k-${n.kind}${n.id===lineage.center?' center':''}`} data-lineage-kind={n.kind} title={`${KIND_LABEL[n.kind]}: ${n.label}${n.detail?`\n${n.detail}`:''}\n${n.file}`} style={{left:p.x,top:p.y,width:NODE_W,height:NODE_H}}>{KIND_ICON[n.kind]}<span>{n.label}</span></div>;})}
  </div>
 </div>;
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

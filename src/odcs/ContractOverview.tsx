import React,{useDeferredValue,useMemo,useState} from 'react';
import {FileCheck2,Search,Table2} from 'lucide-react';
import {odcsForeignKeys} from '../odcs';
import {flattenProperties} from './odcs-diff';
import {Badge} from '../PropertyBadges';
import './odcs.css';
// ODCS contract overview (FR-056): identity and status, the contract-level sections that are present
// (servers, team and roles, service levels, quality, support, pricing, custom properties) and a
// searchable list of schema objects with property, key and quality-rule counts.
const list=(v:unknown):any[]=>Array.isArray(v)?v:[];
const text=(v:unknown)=>v===undefined||v===null?'':typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):JSON.stringify(v);
export const rulesOf=(o:any)=>[...list(o?.quality),...flattenProperties(o?.properties).flatMap(p=>list(p.property.quality))];
export function objectFacts(data:any){
 const schema=list(data?.schema),fks=odcsForeignKeys(data);
 return schema.map((o:any,i:number)=>({index:i,name:String(o?.name??`object ${i+1}`),physicalName:text(o?.physicalName),type:[o?.physicalType,o?.logicalType].filter(Boolean).join(' · '),properties:flattenProperties(o?.properties).length,
  pk:flattenProperties(o?.properties).filter(p=>p.property.primaryKey===true).length,fk:fks.filter(k=>k.from===i).length,rules:rulesOf(o).length,description:text(o?.description)}));
}
// A small key/value table for an object-like section (servers, support channels, roles, …).
function Records({items,columns}:{items:any[];columns:[string,string][]}){
 return <div className="odcs-table-wrap"><table className="odcs-table compact"><thead><tr>{columns.map(([,label])=><th key={label}>{label}</th>)}</tr></thead>
  <tbody>{items.map((x,i)=><tr key={i}>{columns.map(([key])=><td key={key}>{text(x?.[key])}</td>)}</tr>)}</tbody></table></div>;
}
const Section=({label,children}:{label:string;children:React.ReactNode})=><section className="odcs-section" aria-label={label}><h3>{label}</h3>{children}</section>;
export function ContractOverview({data,onOpen}:{data:any;onOpen:(name:string)=>void}){
 const [query,setQuery]=useState(''),deferred=useDeferredValue(query);
 const facts=useMemo(()=>objectFacts(data),[data]);
 const shown=useMemo(()=>{const q=deferred.trim().toLowerCase();return q?facts.filter(f=>`${f.name} ${f.physicalName} ${f.description}`.toLowerCase().includes(q)):facts;},[facts,deferred]);
 const description=data?.description,team=list(data?.team),roles=list(data?.roles),sla=list(data?.slaProperties),quality=list(data?.quality),support=list(data?.support),custom=list(data?.customProperties),servers=list(data?.servers);
 const objectRules=facts.reduce((n,f)=>n+f.rules,0);
 const identity:[string,unknown][]=[['Version',data?.version],['Status',data?.status],['Domain',data?.domain],['Data product',data?.dataProduct],['Tenant',data?.tenant],['ODCS',data?.apiVersion],['Id',data?.id]];
 return <section className="odcs-page odcs-overview" aria-label="Contract overview">
  <header className="odcs-head">
   <div className="odcs-title"><FileCheck2 size={20}/><div><h2>{text(data?.name)||'Unnamed contract'}</h2><small>ODCS data contract</small></div></div>
   <dl className="odcs-facts">{identity.filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=><div key={k}><dt>{k}</dt><dd>{k==='Status'?<span className={`odcs-status s-${text(v)}`}>{text(v)}</span>:text(v)}</dd></div>)}</dl>
   {typeof description==='string'?<p className="odcs-description">{description}</p>:description&&typeof description==='object'?<dl className="odcs-purpose">{(['purpose','limitations','usage'] as const).filter(k=>description[k]).map(k=><div key={k}><dt>{k[0].toUpperCase()+k.slice(1)}</dt><dd>{text(description[k])}</dd></div>)}</dl>:null}
  </header>
  <div className="odcs-sections">
   {servers.length>0&&<Section label="Servers"><Records items={servers} columns={[['server','Server'],['type','Type'],['environment','Environment'],['host','Host'],['database','Database'],['schema','Schema'],['description','Description']]}/></Section>}
   {(team.length>0||roles.length>0)&&<Section label="Team and roles">
    {team.length>0&&<Records items={team} columns={[['username','Member'],['name','Name'],['role','Role'],['dateIn','Since'],['dateOut','Until']]}/>}
    {roles.length>0&&<Records items={roles} columns={[['role','Access role'],['access','Access'],['firstLevelApprovers','Approvers'],['secondLevelApprovers','Second-level approvers'],['description','Description']]}/>}
   </Section>}
   {sla.length>0&&<Section label="Service levels"><Records items={sla} columns={[['property','Property'],['value','Value'],['unit','Unit'],['element','Applies to'],['driver','Driver'],['description','Description']]}/></Section>}
   {(quality.length>0||objectRules>0)&&<Section label="Quality"><p className="odcs-note">{quality.length} contract-level rule{quality.length===1?'':'s'} and {objectRules} on objects and properties, as declared; the workbench does not run them.</p>{quality.length>0&&<Records items={quality} columns={[['name','Rule'],['dimension','Dimension'],['severity','Severity'],['type','Type'],['description','Description']]}/>}</Section>}
   {support.length>0&&<Section label="Support"><Records items={support} columns={[['channel','Channel'],['tool','Tool'],['scope','Scope'],['url','URL'],['description','Description']]}/></Section>}
   {data?.price&&<Section label="Pricing"><Records items={[data.price]} columns={[['priceAmount','Amount'],['priceCurrency','Currency'],['priceUnit','Unit']]}/></Section>}
   {custom.length>0&&<Section label="Custom properties"><Records items={custom} columns={[['property','Property'],['value','Value'],['description','Description']]}/></Section>}
  </div>
  <section className="odcs-objects" aria-label="Objects">
   <div className="odcs-objects-head"><h3><Table2 size={15}/>Schema objects <small>{shown.length===facts.length?facts.length:`${shown.length} of ${facts.length}`}</small></h3>
    <label className="odcs-search"><Search size={14}/><input type="search" aria-label="Find an object" placeholder="Find an object…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
   <div className="odcs-table-wrap"><table className="odcs-table" aria-label="Schema objects">
    <thead><tr><th>Object</th><th>Physical name</th><th>Type</th><th className="num">Properties</th><th>Keys</th><th className="num">Quality rules</th><th>Description</th></tr></thead>
    <tbody>{shown.map(f=><tr key={f.index}>
     <td><button className="odcs-link" aria-label={`Open ${f.name}`} onClick={()=>onOpen(f.name)}>{f.name}</button></td>
     <td className="nowrap"><code>{f.physicalName}</code></td><td className="nowrap">{f.type}</td><td className="num">{f.properties}</td>
     <td className="nowrap">{f.pk||f.fk?<span className="prop-badges">{f.pk>0&&<Badge kind="pk" title={`${f.pk} primary key ${f.pk===1?'property':'properties'}`}>{f.pk} PK</Badge>}{f.fk>0&&<Badge kind="fk" title={`${f.fk} foreign ${f.fk===1?'key':'keys'}`}>{f.fk} FK</Badge>}</span>:<span className="muted">—</span>}</td>
     <td className="num">{f.rules||<span className="muted">0</span>}</td><td className="odcs-desc">{f.description}</td>
    </tr>)}</tbody>
   </table></div>
   {!shown.length&&<p className="odcs-note">No object matches “{query}”.</p>}
  </section>
 </section>;
}

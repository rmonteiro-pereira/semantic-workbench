import React,{useEffect,useState} from 'react';
import {Target,UserRound,FileCode,AlertTriangle,Pencil} from 'lucide-react';
import type {KpiExplanation,KpiSummary} from '../../server/agent/explain';
import {api,type ExplainQuery} from '../projects/api';
import {Explanation} from './Explanation';
import {Lineage} from './Lineage';
import {additivityLabel,targetText,typeLabel} from './format';
// One KPI: what it is (label, type, unit, status, owner, concepts), then how it is calculated and
// where its data comes from. The explanation is fetched from the server, never computed by running SQL.
export function KpiDetail({project,kpi,all,onEdit}:{project:string;kpi:KpiSummary;all:KpiSummary[];onEdit?:()=>void}){
 const [query,setQuery]=useState<ExplainQuery>({}),[explanation,setExplanation]=useState<KpiExplanation|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');
  api.explain(project,kpi.file,kpi.name,query,abort.signal).then(e=>{setExplanation(e);setLoading(false);}).catch(e=>{if(e.name!=='AbortError'){setError(e.message);setLoading(false);}});
  return()=>abort.abort();},[project,kpi.file,kpi.name,kpi.expression,JSON.stringify(kpi.extension),JSON.stringify(query)]);
 const measures=kpi.concepts.filter(c=>c.role==='measures'),of=kpi.concepts.filter(c=>c.role==='of');
 const problems=[...new Set(kpi.concepts.flatMap(c=>c.problems))];
 return <article className="kpi-detail">
  <header className="kpi-header">
   <small>KPI · {kpi.model}</small>
   <div className="metrics-title"><h2>{kpi.label}</h2>{onEdit&&<button className="kpi-edit" onClick={onEdit} aria-label={`Edit ${kpi.label}`}><Pencil size={13}/>Edit KPI</button>}</div>
   <code className="kpi-name">{kpi.name}</code>
   {kpi.description&&<p className="kpi-description">{kpi.description}</p>}
   <div className="kpi-badges">
    <span className={`kpi-pill type-${kpi.type}`} title={kpi.typeDeclared?'Declared type':'Read from the expression'}>{typeLabel[kpi.type]}{!kpi.typeDeclared&&' · inferred'}</span>
    {kpi.additivity&&<span className={`kpi-pill additivity-${kpi.additivity}`} title={kpi.additivityDeclared?'Declared additivity':'Read from the expression'}>{additivityLabel[kpi.additivity]}{!kpi.additivityDeclared&&' · inferred'}</span>}
    {kpi.status&&<span className={`kpi-status status-${kpi.status}`}>{kpi.status}</span>}
    {kpi.unit&&<span className="kpi-pill unit">{kpi.unit}</span>}
   </div>
   <dl className="kpi-facts">
    <div><dt>Measures</dt><dd>{measures.length?measures.map((c,i)=><span key={i} className="concept-chip" title={c.source==='mapping-expression'?`From a concept mapping in ${c.file} whose expression is this metric’s name`:`KPI binding in ${c.file}`}>{c.concept??c.input}{c.source==='mapping-expression'&&<small>mapping</small>}</span>):<span className="muted">No concept bound</span>}</dd></div>
    <div><dt>About</dt><dd>{of.length?of.map((c,i)=><span key={i} className="concept-chip of">{c.concept??c.input}</span>):<span className="muted">—</span>}</dd></div>
    <div><dt><UserRound size={13}/>Owner</dt><dd>{kpi.owner??<span className="muted">—</span>}{kpi.steward&&<small> · steward {kpi.steward}</small>}</dd></div>
    <div><dt><FileCode size={13}/>Defined in</dt><dd><code>{kpi.file}</code>{kpi.layout==='embedded (deprecated)'&&<small className="layout-note" title="The consolidated Ossie layout embeds the semantic model in the ontology file; deprecated upstream">consolidated layout</small>}</dd></div>
   </dl>
   {(explanation?.targets.length??0)>0&&<p className="kpi-targets"><Target size={14}/>Target: {explanation!.targets.map((t,i)=><span key={i}>{targetText(t,kpi.unit)}{t.direction!=='in_range'&&<small>{t.direction==='higher_is_better'?' · higher is better':' · lower is better'}</small>}</span>)}</p>}
   {(kpi.findings.length>0||problems.length>0)&&<ul className="kpi-findings">{kpi.findings.map((f,i)=><li key={i} className={f.severity}><AlertTriangle size={13}/>{f.message}</li>)}{problems.map(p=><li key={p} className="warning"><AlertTriangle size={13}/>{p}</li>)}</ul>}
  </header>
  {error?<p role="alert" className="mapping-error">{error}</p>:!explanation?<p role="status" className="metrics-empty">Explaining {kpi.label}…</p>:<>
   <Explanation explanation={explanation} all={all} query={query} onQuery={setQuery} loading={loading}/>
   <Lineage explanation={explanation}/>
  </>}
 </article>;
}

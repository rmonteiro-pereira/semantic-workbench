import{useState}from'react';
import type{modelOverview,GroupingOptions,GroupingMode}from'./overview';
type Props={overview:ReturnType<typeof modelOverview>;value:GroupingOptions;onChange:(next:GroupingOptions)=>void;example:boolean;error?:string};
export function GroupingControls({overview,value,onChange,example,error}:Props){
 const[entity,setEntity]=useState(''),[group,setGroup]=useState(''),[name,setName]=useState('');
 const selected=overview.entities.some(e=>e.id===entity)?entity:overview.entities[0]?.id??'';
 const destination=overview.groups.some(g=>g.id===group)?group:overview.groups[0]?.id??'';
 return <div className="grouping-controls">
  <label>Group by <select aria-label="Group model by" title={overview.explanation} value={value.mode??'auto'} onChange={e=>onChange({...value,mode:e.target.value as GroupingMode})}><option value="auto">Auto: {overview.mode==='suggested'?'communities':overview.mode==='declared'?'domains':overview.mode==='namespaces'?'namespaces':overview.mode==='example'?'example areas':'types'}</option><option value="declared">Declared domains</option><option value="namespaces">IRI namespaces</option><option value="suggested">Suggested communities</option><option value="types">Definition types</option>{example&&<option value="example">UBL example areas</option>}</select></label>
  <details className="grouping-details"><summary aria-label="Grouping details" title="Grouping details">ⓘ</summary><p className="grouping-explanation"><strong>{overview.groupingLabel}.</strong> {overview.explanation}</p><details><summary>Adjust grouping</summary><p>Corrections are saved with this document’s view in SQLite. Export keeps the original definition.</p>
   <label>Entity <select aria-label="Entity to regroup" value={selected} onChange={e=>setEntity(e.target.value)}>{overview.entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
   <label>Move to <select aria-label="Move to group" value={destination} onChange={e=>setGroup(e.target.value)}>{overview.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   <label>Or create <input aria-label="New group name" placeholder="New group name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
   <button disabled={!selected||(!destination&&!name.trim())} onClick={()=>{const title=name.trim(),id=title?'custom:'+title:destination;onChange({...value,assignments:{...value.assignments,[selected]:id},names:{...Object.fromEntries(overview.groups.map(g=>[g.id,g.name])),...value.names,...(title?{[id]:title}:{})}});setName('')}}>Apply grouping correction</button>
   <button disabled={!Object.keys(value.assignments??{}).length} onClick={()=>onChange({mode:value.mode})}>Reset grouping corrections</button>
  </details></details>{error&&<span role="alert">{error}</span>}
 </div>;
}

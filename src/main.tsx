import {NeighborhoodGraph} from './NeighborhoodGraph';
import {MappingExplorer} from './MappingExplorer';
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Layers,
  Upload,
  Download,
  Save,
  Search,
  Network,
  FileCode,
  Box,
  CheckCircle2,
  Menu, X, Focus,
} from "lucide-react";
import {validateInput} from "./input";
import {ValidationPanel, ImportRepair, type ImportDraft} from "./ValidationPanel";
import { editEntity } from "./model";
import {groupRelationships} from "./graph-view";
import {exportDocument} from "./export";
import {ModelOverview} from "./ModelOverview";
import {FullGraph} from "./FullGraph";
import "@xyflow/react/dist/style.css";
import "./style.css";
type Doc = { id: string; filename: string; source: string; revision: number };
const sample = `name: Commerce\nontology:\n  - concept: Customer\n    type: EntityType\n    description: A person who purchases products.\n    relationships:\n      - name: places\n        roles:\n          - concept: Order\n        verbalizes: ['{Customer} places {Order}']\n  - concept: Order\n    type: EntityType\n    description: A purchase made by a customer.\n    relationships:\n      - name: contains\n        roles:\n          - concept: Product\n        verbalizes: ['{Order} contains {Product}']\n  - concept: Product\n    type: EntityType\n    description: An item available for purchase.\n`;
function App() {
  const [docs, setDocs] = useState<Doc[]>([]),
    [current, setCurrent] = useState<Doc | null>(null),
    [source, setSource] = useState(""),
    [selected, setSelected] = useState(""),
    [selectedEdge, setSelectedEdge] = useState(""),
    [tab, setTab] = useState("fullgraph"),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [pendingImport,setPendingImport]=useState<ImportDraft[]|null>(null);
  const [showValidation,setShowValidation]=useState(false);
  const sourceEditor=useRef<HTMLTextAreaElement|null>(null);
  const [neighborhoodFocus,setNeighborhoodFocus]=useState('');
  const [compact,setCompact]=useState(()=>window.innerWidth<1100);
  const [sidebarOpen,setSidebarOpen]=useState(()=>window.innerWidth>=1100);
  const sidebarRef=useRef<HTMLElement|null>(null),workspaceToggle=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{const media=window.matchMedia('(max-width: 1099px)');const change=()=>{setCompact(media.matches);setSidebarOpen(!media.matches);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);
  function closeWorkspace(){setSidebarOpen(false);requestAnimationFrame(()=>workspaceToggle.current?.focus());}
  useEffect(()=>{
    if(!compact||!sidebarOpen)return;
    const el=sidebarRef.current;if(!el)return;
    const focusable=()=>Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(node=>node.getClientRects().length>0);
    focusable()[0]?.focus();
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closeWorkspace();}else if(event.key==='Tab'){const nodes=focusable(),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    el.addEventListener('keydown',keyboard);return()=>el.removeEventListener('keydown',keyboard);
  },[compact,sidebarOpen]);
  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => {
        setDocs(d);
        if (d[0]) open(d[0]);
      })
      .catch(() => setMessage("Cannot reach local API"));
  }, []);
  function open(d: Doc) {
    if(current?.id===d.id){if(compact)closeWorkspace();return;}
    if (current && source !== current.source && !confirm("Discard unsaved changes?")) return;
    setCurrent(d);
    setSource(d.source);
    setNeighborhoodFocus('');if(compact)closeWorkspace();
    setSelected("");
    setSelectedEdge("");
    setSearch("");setShowAll(false);
    if(validateInput(d.source,d.filename).model?.kind==='Ossie mappings')setTab('mappings');
  }
  const validation = useMemo(()=>validateInput(source,current?.filename??'definition.yaml'),[source,current?.filename]);
  const result = {model:validation.model,error:(source||current)&&!validation.valid?validation.issues.filter(i=>i.severity==='error').map(i=>i.message).join('\n'):''};
  const model = result.model;
  const [showAll,setShowAll]=useState(false);
  const entity = model?.entities.find((e) => e.id === selected);
  const relatedDocuments=useMemo(()=>{
    if(!entity?.definition)return [];
    const definition=entity.definition;
    const keys=[definition.iri,definition.source,definition.physicalName,...(definition.authoritativeDefinitions??[]).map((d:any)=>d.url)].filter((key:any)=>typeof key==='string'&&key.length>5);
    if(entity.id.startsWith('http'))keys.push(entity.id);
    return docs.filter(d=>d.id!==current?.id&&keys.some((key:string)=>d.source.includes(key)));
  },[entity,docs,current?.id]);
  const relationship = model?.edges.find(e => e.id === selectedEdge);
  const globalGroups=useMemo(()=>groupRelationships(model?.edges??[]),[model]);
  const activeGroup=globalGroups.find(e=>e.data.relationships.some(r=>r.id===selectedEdge));
  function showNeighborhood(id=selected||relationship?.source||neighborhoodFocus){setNeighborhoodFocus(id);setSearch('');setTab('graph');setShowAll(false);}
  function selectEntity(id:string){setSelected(id);setSelectedEdge('');if(tab==='graph'&&!showAll){setNeighborhoodFocus(id);setSearch('');}}
  async function loadExamples(scale:boolean|'ubl'|'mapped'|'billing'|'flights'=false) {
    if(current && source !== current.source && !confirm('Discard unsaved changes and open examples?'))return;
    setBusy(true);setMessage('Loading example documents…');
    try {
      const flights=scale==='flights';
      const billing=scale==='billing';
      const mapped=scale==='mapped';
      const ubl=scale==='ubl';
      const files=flights?['flights.ontology.yaml','flights.semantic_model.yaml','flights.mapping.yaml','flights.yaml']:billing?['billing.mapping.yaml','billing.ontology.yaml','billing.semantic.yaml']:mapped?['commerce.mapping.yaml','commerce.mapped-ontology.yaml','commerce.mapped-semantic.yaml']:ubl?['ubl.ontology.yaml','ubl.owl.ttl','ubl.odcs.yaml','ubl.semantic.yaml','ubl.shacl.ttl']:scale?['commerce-scale.ttl']:['commerce.odcs.yaml','sales.ossie.yaml','commerce-business.ossie.yaml','commerce.owl.ttl','commerce.owl','commerce.shacl.ttl','commerce-data.ttl'];
      const loaded:Doc[]=[];
      for(const filename of files){
        const existing=docs.find(d=>d.filename===filename);if(existing){loaded.push(existing);continue;}
        const response=await fetch(`/examples/${flights?'ossie':billing?'billing':ubl?'ubl':'commerce'}/${filename}`);if(!response.ok)throw Error(`Cannot load ${filename}`);
        const source=await response.text();
        const saved=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,source})});
        const doc=await saved.json();if(!saved.ok)throw Error(doc.error);loaded.push(doc);setDocs(old=>[doc,...old]);
      }
      setCurrent(loaded[0]);setSource(loaded[0].source);setNeighborhoodFocus('');if(compact)closeWorkspace();setSelected('');setSelectedEdge('');setSearch('');setShowAll(false);setTab(flights?'fullgraph':mapped||billing?'mappings':'graph');
      setMessage(flights?'Loaded official Apache Ossie Flights: ontology, semantic model, standalone and embedded mappings.':billing?'Loaded subscription billing: 36 business entities, 46 joins, 119 bindings, and 4 governed metrics.':mapped?'Loaded mapped commerce: ontology, semantic model, governed metrics, and explicit mappings.':ubl?'Loaded UBL: 45 business entities, 277 roles; OWL, SHACL, ODCS, and semantic datasets.':scale?'Loaded 1,000 business resources and 5,000 links. Showing a neighborhood; search to explore.':'Loaded commerce contracts, semantic model, ontology, OWL, SHACL, and RDF data. Select a document in the sidebar.');
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
  }
  async function save(
    text = source,
    filename = current?.filename ?? "ontology.ossie.yaml",
    fresh = false,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: text,
          filename,
          ...(!fresh && current ? { id: current.id, revision: current.revision } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDocs((old) => [d, ...old.filter((x) => x.id !== d.id)]);
      setCurrent(d);
      setSource(d.source);
      setMessage("Saved to SQLite");
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function commitImports(drafts:ImportDraft[]) {
    for(const draft of drafts)if(!await save(draft.source,draft.filename,true))throw Error(`Could not save ${draft.filename}. Previously imported files remain in Documents; retry only the failed files.`);
    setPendingImport(null);setNeighborhoodFocus('');if(compact)closeWorkspace();setSelected('');setSelectedEdge('');setSearch('');setShowAll(false);setTab('graph');
  }
  async function importFiles(files: File[]) {
    if (!files.length) return;
    if(compact)closeWorkspace();
    if (current && source !== current.source && !confirm("Discard unsaved changes and import?"))return;
    try{
      const drafts=await Promise.all(files.map(async file=>({filename:file.name,source:await file.text()})));
      if(drafts.some(d=>!validateInput(d.source,d.filename).valid)){setPendingImport(drafts);return;}
      await commitImports(drafts);
    }catch(e){setMessage((e as Error).message);}
  }
  function download() {
    const exported=exportDocument(source,current?.filename??'ontology.ossie.yaml');
    const url = URL.createObjectURL(exported.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exported.filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return (
    <div className={`shell ${sidebarOpen?'workspace-open':'workspace-closed'}`}>
      {pendingImport&&<ImportRepair initial={pendingImport} onCancel={()=>setPendingImport(null)} onImport={commitImports}/>}
      {compact&&sidebarOpen&&<button className="workspace-scrim" aria-label="Dismiss workspace drawer" tabIndex={-1} onClick={closeWorkspace}/>}
      <aside id="workspace-sidebar" className="sidebar workspace-sidebar" ref={sidebarRef} inert={!sidebarOpen} role={compact&&sidebarOpen?'dialog':undefined} aria-modal={compact&&sidebarOpen?true:undefined} aria-label="Workspace documents">
        <button className="workspace-close" aria-label="Close workspace drawer" onClick={closeWorkspace}><X size={18}/></button>
        <div className="brand">
          <Layers size={26} />
          <span>
            semantic<span className="brand-sub">WORKBENCH</span>
          </span>
        </div>
        <div className="workspace-label">
          LOCAL WORKSPACE <span className="dot" />
        </div>
        <button className="nav active" onClick={() => {showNeighborhood();if(compact)closeWorkspace();}}>
          <Network size={18} /> Model explorer
        </button>
        <button className="nav" onClick={() => {setTab("source");if(compact)closeWorkspace();}}>
          <FileCode size={18} /> Source editor
        </button>
        <div className="section-label">
          DOCUMENTS <span>{docs.length}</span>
        </div>
        <div className="documents">
          {docs.map((d) => (
            <button
              className={`document ${current?.id === d.id ? "chosen" : ""}`}
              key={d.id}
              onClick={() => open(d)}
            >
              <FileCode size={16} />
              <span>{d.filename}</span>
            </button>
          ))}
        </div>
        <button className="scale-example" onClick={()=>loadExamples('ubl')} disabled={busy}><Layers size={16}/><span>Load UBL business model<small>45 entities · 277 relationships</small></span></button>
        <button className="scale-example" onClick={()=>loadExamples()} disabled={busy}><Layers size={16}/><span>Load commerce workspace<small>ODCS · Ossie · OWL · SHACL · RDF</small></span></button>
        <button className="scale-example" onClick={()=>loadExamples(true)} disabled={busy}><Network size={16}/><span>Load commerce scale data<small>1,000 entities · 5,000 relationships</small></span></button>
        <button className="scale-example" onClick={()=>loadExamples('mapped')} disabled={busy}><Layers size={16}/><span>Load mapped commerce<small>Ontology → mappings → governed queries</small></span></button>
        <button className="scale-example" onClick={()=>loadExamples('flights')} disabled={busy}><Network size={16}/><span>Load Ossie Flights<small>Official ontology · semantic model · mappings</small></span></button>
        <button className="scale-example" onClick={()=>loadExamples('billing')} disabled={busy}><Layers size={16}/><span>Load subscription billing<small>36 business entities · 4 governed metrics</small></span></button>
        <label className="import" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.currentTarget.querySelector('input')?.click();}}}>
          <Upload size={16} /> Import definitions
          <input
            type="file"
            multiple
            accept=".yaml,.yml,.json,.odcs,.ossie,.ttl,.nt,.rdf,.owl,.xml,.shacl,.n3"
            onChange={(e) => {
              void importFiles(Array.from(e.target.files??[]));
              e.target.value = "";
            }}
          />
        </label>
        <div className="local">
          <span className="dot" /> SQLite · on your machine
          <small>Your definitions stay local.</small>
        </div>
      </aside>
      <main inert={compact&&sidebarOpen}>
        <header className="workspace-header">
          <button ref={workspaceToggle} className="workspace-toggle" aria-label={sidebarOpen?'Close workspace':'Open workspace'} aria-expanded={sidebarOpen} aria-controls="workspace-sidebar" onClick={()=>setSidebarOpen(v=>!v)}>{sidebarOpen?<X size={18}/>:<Menu size={18}/>}</button>
          <div className="workspace-title"><h1 title={model?.name??current?.filename??'Semantic Workbench'}>{model?.name??current?.filename??'Semantic Workbench'}</h1><span className="badge"><span className="dot"/>{model?.kind??'ODCS + Apache Ossie'}</span></div>
          <div className="header-actions">
            <button aria-label="Export" onClick={download} disabled={!source}>
              <Download size={15} /> <span className="action-label">Export</span>
            </button>
            <button
              className="primary"
              aria-label={busy?"Saving…":"Save changes"}
              onClick={() => save()}
              disabled={!source || !!result.error || busy}
            >
              <Save size={15} />
              <span className="action-label">{busy ? "Saving…" : "Save changes"}</span>
            </button>
          </div>
        </header>
        <div className="toolbar">
          <div className="tabs">
            <button className={showAll && tab==='graph'?'selected':''} onClick={()=>{setTab('graph');setShowAll(true);setSearch('')}}><Layers size={16}/> Overview</button>
            <button className={tab==='fullgraph' ? "selected" : ""} onClick={() => {setTab("fullgraph");setShowAll(false);setSearch('')}}>
              <Network size={16} /> Graph
            </button>
            <button className={tab==='graph'&&!showAll?'selected':''} onClick={()=>showNeighborhood()}><Focus size={16}/> Neighborhood</button>
            <button
              className={tab === "catalog" ? "selected" : ""}
              onClick={() => setTab("catalog")}
            >
              <Box size={16} /> Catalog
            </button>
            <button className={tab === "source" ? "selected" : ""} onClick={() => {setTab("source");if(compact)closeWorkspace();}}>
              <FileCode size={16} /> Source
            </button>
            <button className={tab==='mappings'?'selected':''} onClick={()=>setTab('mappings')}><Layers size={16}/> Mappings</button>
          </div>
          <label className="search">
            <Search size={16} />
            <input
              placeholder="Find an entity…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {(source||current)&&(showValidation||!!result.error)&&<details className="validation-details" open><summary onClick={e=>{e.preventDefault();setShowValidation(false);}}>Validation findings</summary><ValidationPanel issues={validation.issues} onLocate={issue=>{setTab('source');setTimeout(()=>{const editor=sourceEditor.current;if(!editor)return;const offset=source.split('\n').slice(0,(issue.line??1)-1).reduce((n,s)=>n+s.length+1,0);editor.focus();editor.setSelectionRange(offset,offset);},0);}}/></details>}
        <div className="canvas-row">
          <section className="canvas">
            {tab==='mappings' ? <MappingExplorer currentId={current?.id} revisionKey={docs.map(d=>d.id+':'+d.revision).join('|')} dirty={!!current&&source!==current.source}/> : !source && !current ? (
              <div className="empty">
                <div className="empty-icon">
                  <Network size={36} />
                </div>
                <h2>Give your data a shared language.</h2>
                <p>
                  Import a contract, semantic model, or ontology.
                  <br />
                  Explore its relationships and edit its definitions.
                </p>
                <button
                  className="primary"
                  onClick={() => save(sample, "commerce-business.ossie.yaml", true)}
                >
                  Open example ontology
                </button>
              </div>
            ) : tab === "source" ? (
              <textarea
                ref={sourceEditor}
                aria-label="Definition source"
                className="code"
                spellCheck={false}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            ) : result.error ? <div className="invalid-definition"><h2>This definition needs repair</h2><p>Your saved document is unchanged. Open Source to fix the validation findings.</p><button onClick={()=>setTab("source")}>Repair in Source</button></div> : tab === "catalog" ? (
              <div className="catalog">
                {model?.entities
                  .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
                  .map((e) => (
                    <button key={e.id} onClick={() => selectEntity(e.id)}>
                      <small>{e.kind}</small>
                      <strong>{e.name}</strong>
                      <p>{e.description || "No description yet"}</p>
                    </button>
                  ))}
              </div>
            ) : tab==='fullgraph' && model ? <FullGraph key={current?.id} name={model.name} entities={model.entities} edges={model.edges} selected={selected} selectedEdge={selectedEdge} search={search} onSelectEntity={selectEntity} onSelectEdge={id=>{setSelectedEdge(id);setSelected('')}} onOverview={()=>{setTab('graph');setShowAll(true);setSearch('')}} onNeighborhood={()=>showNeighborhood()}/> : (
              showAll && model ? <ModelOverview key={current?.id} name={model.name} entities={model.entities} edges={model.edges} search={search} selected={selected} onSelectEntity={selectEntity} onSelectRelationship={id=>{setSelectedEdge(id);setSelected('')}} onClose={()=>showNeighborhood()} onOpenGraph={()=>{setShowAll(false);setTab('fullgraph')}}/> : <NeighborhoodGraph key={current?.id} entities={model?.entities??[]} edges={model?.edges??[]} search={search} focusId={neighborhoodFocus} selected={selected} selectedEdge={selectedEdge} onFocus={id=>{setNeighborhoodFocus(id);setSearch('')}} onSelectEntity={selectEntity} onSelectEdge={id=>{setSelectedEdge(id);setSelected('')}} onOverview={()=>{setSearch('');setTab('graph');setShowAll(true)}} onFullGraph={()=>{setSearch('');setShowAll(false);setTab('fullgraph')}}/>
            )}
          </section>
          {tab!=='mappings'&&(entity || relationship) && <aside className="inspector" aria-label="Definition details">
            <div className="section-label">DEFINITION DETAILS{(entity||relationship)&&<button className="inspector-close" aria-label="Close details" onClick={()=>{setSelected('');setSelectedEdge('')}}>×</button>}</div>
            {relationship ? (
              <>
                <div className="entity-icon"><Network /></div>
                {activeGroup && activeGroup.data.relationships.length>1 && <label>Relationships on this connection<select aria-label="Connection relationship" value={selectedEdge} onChange={e=>setSelectedEdge(e.target.value)}>{activeGroup.data.relationships.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>}
                <h2>{relationship.label}</h2>
                <div className="badge">{relationship.data.kind}</div>
                <dl className="relationship-details">
                  <dt>From</dt><dd>{model?.entities.find(e=>e.id===relationship.source)?.name}</dd>
                  <dt>To</dt><dd>{model?.entities.find(e=>e.id===relationship.target)?.name}</dd>
                  {relationship.data.definition.multiplicity && <><dt>Multiplicity</dt><dd>{relationship.data.definition.multiplicity}</dd></>}
                  {relationship.data.definition.from_columns && <><dt>Join keys</dt><dd>{relationship.data.definition.from_columns.map((key:string,i:number)=><div key={i}>{key} → {relationship.data.definition.to_columns[i]}</div>)}</dd></>}
                  {relationship.data.definition.roles && <><dt>Roles</dt><dd>{relationship.data.definition.roles.map((role:any,i:number)=><div key={i}>{role.concept}{role.name ? ` (${role.name})` : ''}</div>)}</dd></>}
                  {relationship.data.definition.verbalizes && <><dt>Verbalizations</dt><dd>{relationship.data.definition.verbalizes.join(' · ')}</dd></>}
                </dl>
                {relationship.data.kind !== 'Inheritance' && !relationship.data.readOnlyForm && <label>Description<textarea aria-label="Relationship description" value={relationship.data.definition.description ?? ''} onChange={e=>setSource(editEntity(source,relationship.data.path,e.target.value))}/></label>}
                <details className="raw-definition"><summary>Full relationship definition</summary><pre>{JSON.stringify(relationship.data.definition,null,2)}</pre></details>
                <p className="hint">Edit the description here or the full definition in Source. Save to persist changes.</p>
              </>
            ) : entity ? (
              <>
                <div className="entity-icon">
                  <Box />
                </div>
                <h2>{entity.name}</h2>
                <button className="inspect-neighborhood" onClick={()=>showNeighborhood(entity.id)}><Focus size={14}/>Explore neighborhood</button>
                <div className="badge">{entity.kind}</div>
                {entity.readOnlyForm ? <p className="hint">{entity.description || 'Edit this RDF resource in Source. Original serialization is preserved.'}</p> : <label>
                  Description
                  <textarea
                    value={entity.description}
                    onChange={(e) => setSource(editEntity(source, entity.path, e.target.value))}
                  />
                </label>}
                {relatedDocuments.length>0 && <><div className="section-label">SHARED REFERENCES</div>{relatedDocuments.map(d=><button className="document" key={d.id} onClick={()=>open(d)}><FileCode size={14}/>{d.filename}</button>)}</>}
                <div className="section-label">RELATIONSHIPS</div>
                <div className="related-edges">{model?.edges.filter(e=>e.source===entity.id||e.target===entity.id).map(e=><button key={e.id} onClick={()=>{setSelectedEdge(e.id);setSelected('')}}><span>{e.label}</span><small>{model.entities.find(n=>n.id===(e.source===entity.id?e.target:e.source))?.name}</small></button>)}</div>
                {entity.definition && <details className="raw-definition"><summary>Full definition</summary><pre>{JSON.stringify(entity.definition,null,2)}</pre></details>}
                {entity.fields.length > 0 && (
                  <>
                    <div className="section-label">FIELDS</div>
                    {entity.fields.map((f, i) => (
                      <div className="field" key={i}>
                        {f}
                      </div>
                    ))}
                  </>
                )}
                <p className="hint">
                  Edit all properties and relationships in the Source tab. Save to persist changes.
                </p>
              </>
            ) : (
              <div className="inspect-empty">
                <Box size={30} />
                <p>
                  Select an entity or relationship to explore
                  <br />
                  its definition and fields.
                </p>
              </div>
            )}
          </aside>}
        </div>
        <footer>
          <span>
            <CheckCircle2 size={14} />
            {result.error ? "Validation failed" : source ? "Structure checked" : "Ready to import"}
            {(source||current)&&<button className="validation-toggle" onClick={()=>setShowValidation(v=>!v)}>Validation details{validation.issues.length?` (${validation.issues.length})`:""}</button>}
            {current && source !== current.source ? " · Unsaved changes" : ""}
          </span>
          <span>
            {model?.entities.length ?? 0} entities · {model?.edges.length ?? 0} relationships
          </span>
        </footer>
        {(message || result.error) && (
          <div role="status" className={`status ${result.error ? "error" : ""}`}>
            {result.error ? "Validation failed. Review the findings and repair in Source." : message}
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

import React, { useEffect, useMemo, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, Position, MarkerType, type ReactFlowInstance } from "@xyflow/react";
import {
  AlignHorizontalJustifyStart,
  Layers,
  Upload,
  Download,
  Save,
  Search,
  Network,
  FileCode,
  Box,
  CheckCircle2,
} from "lucide-react";
import { inspect, editEntity } from "./model";
import {graphView,groupRelationships} from "./graph-view";
import {layoutGraph} from "./layout";
import {exportDocument} from "./export";
import {relationshipEdgeTypes} from "./RelationshipEdge";
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
  const nodeDocument=useRef<string|null>(null);
  const [hoveredEdge,setHoveredEdge]=useState("");
  const [showLabels,setShowLabels]=useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as any[]);
  const flow = useRef<Pick<ReactFlowInstance, "fitView"> | null>(null);
  const layoutWorker = useRef<Worker | null>(null);
  const [aligning, setAligning] = useState(false);
  function align() {
    if (!model) return;
    layoutWorker.current?.terminate();
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), {type: 'module'});
    layoutWorker.current = worker;
    setAligning(true);
    worker.onmessage = ({data}) => {
      const positions = new Map<string, {x:number;y:number}>(data.map((n:any) => [n.id, n.position]));
      setNodes(old => old.map(n => ({...n, position:positions.get(n.id) ?? n.position})));
      setAligning(false);
      worker.terminate();
      requestAnimationFrame(() => requestAnimationFrame(() => { void flow.current?.fitView({duration:300, maxZoom:1}); }));
    };
    worker.onerror = () => { setMessage('Unable to align this graph'); setAligning(false); worker.terminate(); };
    worker.postMessage({ids:view.entities.map(e=>e.id),edges:view.edges});
  }
  useEffect(() => () => layoutWorker.current?.terminate(), []);
  useEffect(() => {
    layoutWorker.current?.terminate(); setAligning(false);
  }, [current?.id]);
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
    if(current?.id===d.id)return;
    if (current && source !== current.source && !confirm("Discard unsaved changes?")) return;
    setCurrent(d);
    setSource(d.source);
    setSelected("");
    setSelectedEdge("");
    setSearch("");setShowAll(false);
  }
  const result = useMemo(() => {
    try {
      return { model: inspect(source,current?.filename), error: "" };
    } catch (e) {
      return { model: null, error: source ? (e as Error).message : "" };
    }
  }, [source,current?.filename]);
  const model = result.model;
  const [showAll,setShowAll]=useState(false);
  const view=useMemo(()=>graphView(model?.entities??[],model?.edges??[],search,false),[model,search]);
  const entity = model?.entities.find((e) => e.id === selected);
  const relatedDocuments=useMemo(()=>{
    if(!entity?.definition)return [];
    const definition=entity.definition;
    const keys=[definition.iri,definition.source,definition.physicalName,...(definition.authoritativeDefinitions??[]).map((d:any)=>d.url)].filter((key:any)=>typeof key==='string'&&key.length>5);
    if(entity.id.startsWith('http'))keys.push(entity.id);
    return docs.filter(d=>d.id!==current?.id&&keys.some((key:string)=>d.source.includes(key)));
  },[entity,docs,current?.id]);
  const relationship = model?.edges.find(e => e.id === selectedEdge);
  const groupedEdges=useMemo(()=>groupRelationships(view.edges),[view]);
  const globalGroups=useMemo(()=>groupRelationships(model?.edges??[]),[model]);
  const activeGroup=globalGroups.find(e=>e.data.relationships.some(r=>r.id===selectedEdge));
  const routeTop=useMemo(()=>nodes.reduce((top,n)=>Math.min(top,n.position.y),0)-35,[nodes]);
  const graphEdges = useMemo(() => groupedEdges.map(e => {
    const active=e.data.relationships.some(r=>r.id===selectedEdge);
    const related=selected && (e.source===selected||e.target===selected);
    return {...e,type:"relationship",data:{...e.data,routeTop},label:showLabels||active||e.id===hoveredEdge?(e.data.relationships.length>1?`${e.data.relationships.length} relationships`:e.label):undefined,selected:active,interactionWidth:28,style:{stroke:active||related?'#237c68':'#8bafa5',strokeOpacity:selected&&!related?0.14:0.6,strokeWidth:active?2.5:1.4}};
  }), [groupedEdges,selectedEdge,selected,hoveredEdge,showLabels,routeTop]);
  async function loadExamples(scale:boolean|'ubl'=false) {
    if(current && source !== current.source && !confirm('Discard unsaved changes and open examples?'))return;
    setBusy(true);setMessage('Loading example documents…');
    try {
      const ubl=scale==='ubl';
      const files=ubl?['ubl.ontology.yaml','ubl.owl.ttl','ubl.odcs.yaml','ubl.semantic.yaml','ubl.shacl.ttl']:scale?['commerce-scale.ttl']:['commerce.odcs.yaml','sales.ossie.yaml','commerce-business.ossie.yaml','commerce.owl.ttl','commerce.owl','commerce.shacl.ttl','commerce-data.ttl'];
      const loaded:Doc[]=[];
      for(const filename of files){
        const existing=docs.find(d=>d.filename===filename);if(existing){loaded.push(existing);continue;}
        const response=await fetch(`/examples/${ubl?'ubl':'commerce'}/${filename}`);if(!response.ok)throw Error(`Cannot load ${filename}`);
        const source=await response.text();
        const saved=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,source})});
        const doc=await saved.json();if(!saved.ok)throw Error(doc.error);loaded.push(doc);setDocs(old=>[doc,...old]);
      }
      setCurrent(loaded[0]);setSource(loaded[0].source);setSelected('');setSelectedEdge('');setSearch('');setShowAll(false);setTab('graph');
      setMessage(ubl?'Loaded UBL: 45 business entities, 277 roles; OWL, SHACL, ODCS, and semantic datasets.':scale?'Loaded 1,000 business resources and 5,000 links. Showing a neighborhood; search to explore.':'Loaded commerce contracts, semantic model, ontology, OWL, SHACL, and RDF data. Select a document in the sidebar.');
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
  }
  useEffect(() => {
    setNodes((old) => {
      const sameDocument=nodeDocument.current===current?.id;
      const positions = new Map((sameDocument?old:[]).map(n => [n.id, n.position]));
      nodeDocument.current=current?.id??null;
      const arranged=new Map(layoutGraph(view.entities.map(e=>e.id),view.edges).map(n=>[n.id,n.position]));
      return view.entities.map((e, i) => ({
          id: e.id,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          position: positions.get(e.id) ?? arranged.get(e.id) ?? {
            x: (i % 3) * 290,
            y: Math.floor(i / 3) * 180,
          },
          data: {
            name: e.name,
            label: (
              <div className="node">
                <small>{e.kind}</small>
                <strong>{e.name}</strong>
                <span>
                  {e.fields.length
                    ? `${e.fields.length} ${e.fields.length===1 ? "field" : "fields"}`
                    : e.description || "Select to inspect"}
                </span>
              </div>
            ),
          },
          style: { borderColor: e.id === selected ? "#50cbb0" : "#dbe3e4" },
        })) ?? [];
    });
  }, [view, selected,current?.id]);
  useEffect(() => { layoutWorker.current?.terminate(); setAligning(false); }, [model]);
  useEffect(()=>{const timer=setTimeout(()=>{void flow.current?.fitView({duration:200,maxZoom:1,padding:0.2})},100);return ()=>clearTimeout(timer)},[view,current?.id,tab]);
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
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFiles(files: File[]) {
    if (!files.length) return;
    if (current && source !== current.source && !confirm("Discard unsaved changes and import?"))return;
    for(const file of files)await save(await file.text(),file.name,true);
    setSelected('');setSelectedEdge('');setSearch('');setShowAll(false);setTab('graph');
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Layers size={26} />
          <span>
            semantic<span className="brand-sub">WORKBENCH</span>
          </span>
        </div>
        <div className="workspace-label">
          LOCAL WORKSPACE <span className="dot" />
        </div>
        <button className="nav active" onClick={() => setTab("graph")}>
          <Network size={18} /> Model explorer
        </button>
        <button className="nav" onClick={() => setTab("source")}>
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
        <label className="import">
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
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> Model explorer
          </div>
          <div className="header-actions">
            <button onClick={download} disabled={!source}>
              <Download size={15} /> Export
            </button>
            <button
              className="primary"
              onClick={() => save()}
              disabled={!source || !!result.error || busy}
            >
              <Save size={15} />
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </header>
        <div className="heading">
          <div>
            <div className="eyebrow">CONNECTED DEFINITIONS</div>
            <h1>{model?.name ?? "Your semantic workspace"}</h1>
            <p>Explore the structure. Connect the meaning.</p>
          </div>
          <div className="badge">
            <span className="dot" />
            {model?.kind ?? "ODCS + Apache Ossie"}
          </div>
        </div>
        <div className="toolbar">
          <div className="tabs">
            <button className={showAll && tab==='graph'?'selected':''} onClick={()=>{setTab('graph');setShowAll(true);setSearch('')}}><Layers size={16}/> Overview</button>
            <button className={!showAll && (tab === "graph" || tab==='fullgraph') ? "selected" : ""} onClick={() => {setTab("fullgraph");setShowAll(false);setSearch('')}}>
              <Network size={16} /> Graph
            </button>
            <button
              className={tab === "catalog" ? "selected" : ""}
              onClick={() => setTab("catalog")}
            >
              <Box size={16} /> Catalog
            </button>
            <button className={tab === "source" ? "selected" : ""} onClick={() => setTab("source")}>
              <FileCode size={16} /> Source
            </button>
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
        <div className="canvas-row">
          <section className="canvas">
            {!source ? (
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
                aria-label="Definition source"
                className="code"
                spellCheck={false}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            ) : tab === "catalog" ? (
              <div className="catalog">
                {model?.entities
                  .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
                  .map((e) => (
                    <button key={e.id} onClick={() => {setSelected(e.id);setSelectedEdge("");}}>
                      <small>{e.kind}</small>
                      <strong>{e.name}</strong>
                      <p>{e.description || "No description yet"}</p>
                    </button>
                  ))}
              </div>
            ) : tab==='fullgraph' && model ? <FullGraph key={current?.id} name={model.name} entities={model.entities} edges={model.edges} selected={selected} selectedEdge={selectedEdge} search={search} onSelectEntity={id=>{setSelected(id);setSelectedEdge('')}} onSelectEdge={id=>{setSelectedEdge(id);setSelected('')}} onOverview={()=>{setTab('graph');setShowAll(true);setSearch('')}} onNeighborhood={()=>{setTab('graph');setShowAll(false)}}/> : (
              showAll && model ? <ModelOverview key={current?.id} name={model.name} entities={model.entities} edges={model.edges} search={search} selected={selected} onSelectEntity={id=>{setSelected(id);setSelectedEdge('')}} onSelectRelationship={id=>{setSelectedEdge(id);setSelected('')}} onClose={()=>setShowAll(false)} onOpenGraph={()=>{setShowAll(false);setTab('fullgraph')}}/> : <><div className="graph-actions">          <button onClick={align} disabled={!model || aligning} title="Arrange entities from left to right by their relationships">
            <AlignHorizontalJustifyStart size={16}/>{aligning ? 'Aligning…' : 'Auto align'}
          </button>
<button onClick={()=>setShowLabels(v=>!v)} aria-pressed={showLabels}>Labels {showLabels?'on':'off'}</button><button onClick={()=>{setSearch('');setShowAll(true)}}>Model overview</button><button onClick={()=>{setSearch('');setShowAll(false);setTab('fullgraph')}}>Full graph</button>
</div><div className="graph-summary">Showing {view.entities.length} of {model?.entities.length} entities · {groupedEdges.length} connections{!showAll && (model?.entities.length??0)>8 ? ' · Search to explore neighborhoods' : ''}</div><ReactFlow
                nodes={nodes}
                edges={graphEdges}
                edgeTypes={relationshipEdgeTypes}
                defaultEdgeOptions={{type:'default', markerEnd:{type:MarkerType.ArrowClosed, color:'#7c9d90'}, style:{stroke:'#7c9d90'}}}
                onInit={instance => {flow.current = instance}}
                onlyRenderVisibleElements
                minZoom={0.01}
                nodesConnectable={false}
                onNodesChange={onNodesChange}
                onNodeClick={(_, n) => {setSelected(n.id);setSelectedEdge("");}}
                onEdgeMouseEnter={(_,e)=>setHoveredEdge(e.id)}
                onEdgeMouseLeave={()=>setHoveredEdge('')}
                onPaneClick={()=>{setSelected('');setSelectedEdge('')}}
                onEdgeClick={(_, e) => {setSelectedEdge(e.id);setSelected("");}}
                fitView
              >
                <Background gap={22} size={1} />
                <Controls />
                <MiniMap nodeColor="#b8e6db" />
              </ReactFlow></>
            )}
          </section>
          {(!(showAll || tab==='fullgraph') || entity || relationship) && <aside className="inspector">
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
            {current && source !== current.source ? " · Unsaved changes" : ""}
          </span>
          <span>
            {model?.entities.length ?? 0} entities · {model?.edges.length ?? 0} relationships
          </span>
        </footer>
        {(message || result.error) && (
          <div role="status" className={`status ${result.error ? "error" : ""}`}>
            {result.error || message}
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

import{GroupingControls}from'./GroupingControls';
import{modelOverview}from'./overview';
import{useGrouping}from'./useGrouping';
import{SourceEditor,locateSourceIssue}from'./SourceEditor';
import{api,loadWorkspace,StaleSave,type Doc,type ProjectInfo,type WorkspaceStatus,type Deleted,type Suggestion}from'./projects/api';
import{useEvents}from'./projects/useEvents';
import{ProjectTree,type TreeAction}from'./projects/Sidebar';
import{DeleteDialog,type DeleteTarget}from'./projects/DeleteDialog';
import{UndoToast}from'./projects/UndoToast';
import{TrashDialog}from'./projects/Trash';
import{Suggestions}from'./projects/Suggestions';
import{RenameDialog,MoveDialog,ImportConflictDialog}from'./projects/ProjectDialogs';
import{GitBanner}from'./projects/GitBanner';
import{StaleSaveDialog}from'./projects/StaleSave';
import{exampleSet}from'./projects/examples';
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
import {documentKeys,entityKeys} from './references';
import {ValidationPanel, ImportRepair, type ImportDraft} from "./ValidationPanel";
import { editEntity } from "./model";
import {groupRelationships} from "./graph-view";
import {exportDocument} from "./export";
import {ModelOverview} from "./ModelOverview";
import {FullGraph} from "./FullGraph";
import "@xyflow/react/dist/style.css";
import "./style.css";
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
  const [projects,setProjects]=useState<ProjectInfo[]>([]),[status,setStatus]=useState<WorkspaceStatus|null>(null);
  const [stale,setStale]=useState<{current:string|null;currentHash:string|null}|null>(null);
  const [deleteTarget,setDeleteTarget]=useState<DeleteTarget|null>(null),[deleted,setDeleted]=useState<Deleted|null>(null),[trashOpen,setTrashOpen]=useState(false),[trashVersion,setTrashVersion]=useState(0);
  const [renaming,setRenaming]=useState<ProjectInfo|null>(null),[moving,setMoving]=useState<{project:string;path:string}|null>(null),[suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [importConflict,setImportConflict]=useState<{project:ProjectInfo;files:{path:string;source:string}[];conflicts:string[]}|null>(null);
  const importInto=useRef<string>('');
  const docsRef=useRef(new Map<string,Doc>()),currentRef=useRef<Doc|null>(null),sourceRef=useRef('');
  currentRef.current=current;sourceRef.current=source;
  const [showValidation,setShowValidation]=useState(false);
  const grouping=useGrouping(current?.id);
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
  // The folder store is the source of truth: refetch on start and whenever the server reports a change.
  const refreshing=useRef<Promise<Doc[]>|null>(null),again=useRef(false);
  async function refresh():Promise<Doc[]>{
    if(refreshing.current){again.current=true;return refreshing.current;}
    const run=(async()=>{
      try{
        const loaded=await loadWorkspace(docsRef.current);
        docsRef.current=new Map(loaded.docs.map(d=>[d.id,d]));
        setProjects(loaded.projects);setDocs(loaded.docs);
        // An open file that changed on disk follows the disk unless it has unsaved edits.
        const open=currentRef.current,fresh=open&&docsRef.current.get(open.id);
        if(open&&fresh&&fresh.hash!==open.hash&&sourceRef.current===open.source){setCurrent(fresh);setSource(fresh.source);}
        // The open file was deleted, moved or cleared: open another one unless it has unsaved edits.
        if(open&&!fresh&&sourceRef.current===open.source){const next=loaded.docs[0]??null;setCurrent(next);setSource(next?.source??'');setSelected('');setSelectedEdge('');setNeighborhoodFocus('');}
        api.suggestions().then(setSuggestions).catch(()=>{});
        return loaded.docs;
      }finally{refreshing.current=null;if(again.current){again.current=false;void refresh();}}
    })();
    refreshing.current=run;return run;
  }
  const refreshTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEvents(event=>{if(event==='trash')setTrashVersion(v=>v+1);clearTimeout(refreshTimer.current);refreshTimer.current=setTimeout(()=>{void refresh().catch(()=>{});},80);});
  useEffect(() => {
    api.status().then(setStatus).catch(()=>{});
    refresh()
      .then((d) => { if (d[0]) open(d[0]); })
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
  const groupingOverview=useMemo(()=>model?modelOverview(model.entities,model.edges,model.name,false,grouping.value):null,[model,grouping.value]);
  const entity = model?.entities.find((e) => e.id === selected);
  const documentIdentities=useMemo(()=>new Map(docs.map(d=>{let keys=new Set<string>();try{keys=documentKeys(validateInput(d.source,d.filename).model);}catch{}return [d.id,keys];})),[docs]);
  const relatedDocuments=useMemo(()=>{
    if(!entity?.definition)return [];
    const keys=entityKeys(entity,model);
    return docs.filter(d=>d.id!==current?.id&&keys.some((key:string)=>documentIdentities.get(d.id)?.has(key)||d.source.includes(key)));
  },[entity,model,docs,documentIdentities,current?.id]);
  const relationship = model?.edges.find(e => e.id === selectedEdge);
  const globalGroups=useMemo(()=>groupRelationships(model?.edges??[]),[model]);
  const activeGroup=globalGroups.find(e=>e.data.relationships.some(r=>r.id===selectedEdge));
  function showNeighborhood(id=selected||relationship?.source||neighborhoodFocus){setNeighborhoodFocus(id);setSearch('');setTab('graph');setShowAll(false);}
  function selectEntity(id:string){setSelected(id);setSelectedEdge('');if(tab==='graph'&&!showAll){setNeighborhoodFocus(id);setSearch('');}}
  async function loadExample(id:string) {
    const set=exampleSet(id)!;
    if(current && source !== current.source && !confirm('Discard unsaved changes and open examples?'))return;
    setBusy(true);setMessage('Loading example documents…');
    try {
      const {slug}=await api.example(id);
      const loaded=await refresh();
      const first=loaded.find(d=>d.project===slug&&d.path===set.files[0])??loaded.find(d=>d.project===slug);
      if(first){setCurrent(first);setSource(first.source);}
      setNeighborhoodFocus('');if(compact)closeWorkspace();setSelected('');setSelectedEdge('');setSearch('');setShowAll(false);setTab(set.tab);
      setMessage(set.message);
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
  }
  async function save(baseHash=current?.hash??null) {
    if(!current)return false;
    setBusy(true);
    setMessage("");
    try {
      const saved=await api.save(current.project,current.path,baseHash,source);
      const doc:Doc={...current,source,hash:saved.hash};
      docsRef.current.set(doc.id,doc);
      setDocs((old) => old.map((x) => x.id === doc.id ? doc : x));
      setCurrent(doc);setStale(null);
      setMessage("Saved to the project folder");
      void refresh().catch(()=>{});
      return true;
    } catch (e) {
      if(e instanceof StaleSave){setStale({current:e.currentSource,currentHash:e.currentHash});setMessage('Not saved: the file changed since you opened it.');return false;}
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  // One import batch becomes one project (FR-018).
  async function commitImports(drafts:ImportDraft[]) {
    let created;
    try{created=await api.importBatch(drafts.map(d=>({path:d.filename,source:d.source})));}
    catch(e){throw Error(`Could not save ${drafts.map(d=>d.filename).join(', ')}: ${(e as Error).message} Nothing from this batch was imported; retry when ready.`);}
    setPendingImport(null);
    // Open the batch's last file, as the one-by-one import of earlier versions did.
    const loaded=await refresh(),last=drafts[drafts.length-1].filename;
    const opened=loaded.find(d=>d.project===created.slug&&d.path===last)??loaded.find(d=>d.project===created.slug);
    if(opened){setCurrent(opened);setSource(opened.source);}
    setMessage(`Imported ${created.written.length} file${created.written.length===1?'':'s'} into project ${created.name}.`);
    setNeighborhoodFocus('');if(compact)closeWorkspace();setSelected('');setSelectedEdge('');setSearch('');setShowAll(false);setTab('graph');
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
  function treeAction(a:TreeAction){
    const project=projects.find(p=>p.slug===a.project);if(!project)return;
    if(a.action==='rename')setRenaming(project);
    else if(a.action==='move')setMoving({project:a.project,path:a.path});
    else if(a.action==='delete-file')setDeleteTarget({kind:'file',project:a.project,path:a.path});
    else if(a.action==='delete-project')setDeleteTarget({kind:'project',project:a.project});
    else{
      // A detached file input, so the page keeps a single "Import definitions" file field.
      importInto.current=a.project;const input=document.createElement('input');input.type='file';input.multiple=true;
      input.onchange=async()=>{const files=await Promise.all(Array.from(input.files??[]).map(async f=>({path:f.name,source:await f.text()})));if(files.length)void importIntoProject(files);};input.click();
    }
  }
  async function importIntoProject(files:{path:string;source:string}[],onConflict?:'replace'|'keep-both'){
    const project=projects.find(p=>p.slug===importInto.current);if(!project)return;
    try{const r=await api.importInto(project.slug,files,onConflict);setImportConflict(null);await refresh();setMessage(`Imported ${r.written.length} file${r.written.length===1?'':'s'} into ${project.name}.`);}
    catch(e:any){if(e.status===409&&e.body?.conflicts)setImportConflict({project,files,conflicts:e.body.conflicts});else{setImportConflict(null);setMessage(e.message);}}
  }
  async function undoDelete(){
    const d=deleted;setDeleted(null);if(!d)return;
    try{for(const id of d.entryIds)await api.undo(id);await refresh();setMessage(`Restored ${d.label}.`);}
    catch(e){await refresh().catch(()=>{});setMessage(`${(e as Error).message} Open Trash to restore it.`);}
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
      {stale&&current&&<StaleSaveDialog filename={current.path} mine={source} current={stale.current} onCancel={()=>setStale(null)} onLoadCurrent={()=>{if(stale.current===null||stale.currentHash===null)return;const doc={...current,source:stale.current,hash:stale.currentHash};docsRef.current.set(doc.id,doc);setCurrent(doc);setSource(doc.source);setStale(null);setMessage('Loaded the current file from disk.');}} onKeepMine={()=>{const base=stale.currentHash;setStale(null);void save(base);}}/>}
      {deleteTarget&&<DeleteDialog target={deleteTarget} projects={projects} dirty={current&&source!==current.source?{project:current.project,path:current.path}:null} onCancel={()=>setDeleteTarget(null)} onDeleted={(entryIds,undoUntil,label)=>{
        // The user confirmed losing unsaved edits of a removed file: drop them before refreshing.
        const target=deleteTarget;if(current&&source!==current.source&&(target.kind==='clear'||current.project===target.project&&(target.kind==='project'||current.path===target.path)))setSource(current.source);
        sourceRef.current=current?.source??'';setDeleteTarget(null);setDeleted({entryIds,undoUntil,label});void refresh();}}/>}
      {trashOpen&&<TrashDialog version={trashVersion} onClose={()=>{setTrashOpen(false);void refresh();}}/>}
      {renaming&&<RenameDialog project={renaming} onClose={()=>setRenaming(null)} onDone={name=>{setRenaming(null);setMessage(`Renamed the project to ${name}.`);void refresh();}}/>}
      {moving&&<MoveDialog project={moving.project} path={moving.path} projects={projects} onClose={()=>setMoving(null)} onDone={to=>{setMoving(null);setMessage(`Moved ${moving.path} to ${projects.find(p=>p.slug===to.project)?.name}.`);void refresh().then(d=>{const doc=d.find(x=>x.project===to.project&&x.path===to.path);if(doc&&currentRef.current?.project===moving.project&&currentRef.current.path===moving.path){setCurrent(doc);setSource(doc.source);}});}}/>}
      {importConflict&&<ImportConflictDialog project={importConflict.project} conflicts={importConflict.conflicts} onClose={()=>setImportConflict(null)} onChoose={choice=>void importIntoProject(importConflict.files,choice)}/>}
      {deleted&&<UndoToast deleted={deleted} onUndo={()=>void undoDelete()} onExpire={()=>setDeleted(null)}/>}
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
          PROJECTS <span>{projects.length}</span>
        </div>
        <div className="documents">
          <ProjectTree projects={projects} currentId={current?.id} onAction={treeAction} onOpen={(project,path)=>{const d=docs.find(x=>x.project===project&&x.path===path);if(d)open(d);}}/>
        </div>
        <div className="workspace-actions"><button onClick={()=>setDeleteTarget({kind:'clear'})} disabled={!projects.length}>Clear workspace</button><button onClick={()=>setTrashOpen(true)}>Trash</button></div>
        <Suggestions items={suggestions} projects={projects} onAccept={id=>void api.acceptSuggestion(id).then(r=>{setMessage(`Moved ${r.path} into ${projects.find(p=>p.slug===r.project)?.name}.`);return refresh();}).catch(e=>setMessage(e.message))} onReject={id=>void api.rejectSuggestion(id).then(()=>refresh()).catch(e=>setMessage(e.message))}/>
        <button className="scale-example" onClick={()=>loadExample('ubl')} disabled={busy}><Layers size={16}/><span>Load UBL business model<small>45 entities · 277 relationships</small></span></button>
        <button className="scale-example" onClick={()=>loadExample('commerce')} disabled={busy}><Layers size={16}/><span>Load commerce workspace<small>ODCS · Ossie · OWL · SHACL · RDF</small></span></button>
        <button className="scale-example" onClick={()=>loadExample('commerce-scale')} disabled={busy}><Network size={16}/><span>Load commerce scale data<small>1,000 entities · 5,000 relationships</small></span></button>
        <button className="scale-example" onClick={()=>loadExample('mapped-commerce')} disabled={busy}><Layers size={16}/><span>Load mapped commerce<small>Ontology → mappings → governed queries</small></span></button>
        <button className="scale-example" onClick={()=>loadExample('flights')} disabled={busy}><Network size={16}/><span>Load Ossie Flights<small>Official ontology · semantic model · mappings</small></span></button>
        <button className="scale-example" onClick={()=>loadExample('billing')} disabled={busy}><Layers size={16}/><span>Load subscription billing<small>36 business entities · 4 governed metrics</small></span></button>
        <button className="scale-example" onClick={()=>loadExample('mall')} disabled={busy}><Layers size={16}/><span>Load shopping center administration<small>145 entity types · 11 namespaces · 25 KPIs</small></span></button>
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
          <span className="dot" /> Project folders · on your machine
          <small>Your definitions stay local.</small>
        </div>
      </aside>
      <main inert={compact&&sidebarOpen}>
        <GitBanner status={status}/>
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
          {groupingOverview&&(tab==='fullgraph'||(tab==='graph'&&showAll))&&<GroupingControls overview={groupingOverview} value={grouping.value} onChange={grouping.change} example={model!.name.includes('UBL')} error={grouping.error}/>}
          <label className="search">
            <Search size={16} />
            <input
              placeholder="Find an entity…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {(source||current)&&(showValidation||!!result.error)&&<details className="validation-details" open><summary onClick={e=>{e.preventDefault();setShowValidation(false);}}>Validation findings</summary><ValidationPanel source={source} issues={validation.issues} onLocate={issue=>{setTab('source');setTimeout(()=>{const editor=sourceEditor.current;if(!editor)return;locateSourceIssue(editor,issue);},0);}}/></details>}
        <div className="canvas-row">
          <section className="canvas">
            {tab==='mappings' ? <MappingExplorer currentId={current?.id} revisionKey={docs.map(d=>d.id+':'+d.hash).join('|')} dirty={!!current&&source!==current.source}/> : !source && !current ? (
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
                  onClick={() => void commitImports([{filename:"commerce-business.ossie.yaml",source:sample}]).catch(e=>setMessage((e as Error).message))}
                >
                  Open example ontology
                </button>
              </div>
            ) : tab === "source" ? (
              <SourceEditor
                issues={validation.issues}
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
            ) : tab==='fullgraph' && model ? <FullGraph grouping={grouping.value} onGroupingChange={grouping.change} groupingError={grouping.error} key={current?.id} name={model.name} entities={model.entities} edges={model.edges} selected={selected} selectedEdge={selectedEdge} search={search} onSelectEntity={selectEntity} onSelectEdge={id=>{setSelectedEdge(id);setSelected('')}} onOverview={()=>{setTab('graph');setShowAll(true);setSearch('')}} onNeighborhood={()=>showNeighborhood()}/> : (
              showAll && model ? <ModelOverview grouping={grouping.value} onGroupingChange={grouping.change} groupingError={grouping.error} key={current?.id} name={model.name} entities={model.entities} edges={model.edges} search={search} selected={selected} onSelectEntity={selectEntity} onSelectRelationship={id=>{setSelectedEdge(id);setSelected('')}} onClose={()=>showNeighborhood()} onOpenGraph={()=>{setShowAll(false);setTab('fullgraph')}}/> : <NeighborhoodGraph key={current?.id} entities={model?.entities??[]} edges={model?.edges??[]} search={search} focusId={neighborhoodFocus} selected={selected} selectedEdge={selectedEdge} onFocus={id=>{setNeighborhoodFocus(id);setSearch('')}} onSelectEntity={selectEntity} onSelectEdge={id=>{setSelectedEdge(id);setSelected('')}} onOverview={()=>{setSearch('');setTab('graph');setShowAll(true)}} onFullGraph={()=>{setSearch('');setShowAll(false);setTab('fullgraph')}}/>
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

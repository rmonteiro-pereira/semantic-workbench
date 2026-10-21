import {ScrollStrip} from './ScrollStrip';
import{GroupingControls}from'./GroupingControls';
import{modelOverview}from'./overview';
import{useGrouping}from'./useGrouping';
import{CodeEditor,type CodeEditorHandle}from'./editor/CodeEditor';
import{diffPatches}from'./editor/patch';
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
import {MetricsView} from './metrics/MetricsView';
import {KpiWizard} from './metrics/KpiWizard';
import {ItemEditor,type Saved} from './edit/ItemEditor';
import {AddItem} from './edit/AddItem';
import {DeleteItem} from './edit/DeleteItem';
import {RdfItemEditor} from './edit/RdfItemEditor';
import {RdfAddItem,RdfDeleteItem} from './edit/RdfAddItem';
import {isIri} from './edit/rdf-patch/index';
import {rdfSyntax} from './rdf';
import {itemKindAt,itemName,addableKinds,type ItemKind,type Path,type Choices} from './edit/item-model';
import {itemValue} from './edit/yaml-patch';
import {openFragment} from './edit/fragment';
import type {KpiSummary} from '../server/agent/explain';
import React, { useEffect, useMemo, useState, useRef, useReducer } from "react";
import {walkReducer,emptyWalk,type WalkStep} from './graph/walk';
import type {CrossFileTarget} from './NeighborhoodGraph';
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
  Menu, X, Focus, Gauge, Pencil, Plus, Trash2, GitBranch, FileCheck2,
} from "lucide-react";
import {validateInput} from "./input";
import {documentKeys,entityKeys} from './references';
import type {Entity,Relationship} from './model';
import type {Issue} from './diagnostics';
import {SourceControl} from './scm/SourceControl';
import {useFullscreen} from './graph/fullscreen';
import {ContractOverview} from './odcs/ContractOverview';
import {DatasetPage} from './odcs/DatasetPage';
import {propertyEditor} from './odcs/PropertyEditors';
import {isGitignore} from './scm/gitignore';
import {scm as scmApi} from './projects/api';
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
    [current, setCurrentState] = useState<Doc | null>(null),
    [source, setSource] = useState(""),
    [selected, setSelected] = useState(""),
    [selectedEdge, setSelectedEdge] = useState(""),
    [tab, setTabState] = useState("fullgraph"),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  function setCurrent(next:Doc|null){if(next?.id!==current?.id)setMessage('');setCurrentState(next);}
  function setTab(next:string){setMessage('');setTabState(next==='graph'?'neighborhood':next);}
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),5000);return()=>clearTimeout(timer);},[message]);
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
  // KPIs of the open file's project, for the Metrics tab and the KPI badges on concepts.
  const [kpis,setKpis]=useState<KpiSummary[]>([]),[kpiError,setKpiError]=useState(''),[kpiLoading,setKpiLoading]=useState(false),[selectedKpi,setSelectedKpi]=useState(''),[kpiFilter,setKpiFilter]=useState('');
  const kpiProject=current?.project??null,kpiRevision=docs.filter(d=>d.project===kpiProject).map(d=>d.path+':'+d.hash).join('|');
  useEffect(()=>{if(!kpiProject){setKpis([]);return;}let live=true;setKpiLoading(true);api.metrics(kpiProject).then(k=>{if(live){setKpis(k);setKpiError('');}}).catch(e=>{if(live){setKpis([]);setKpiError(e.message);}}).finally(()=>{if(live)setKpiLoading(false);});return()=>{live=false;};},[kpiProject,kpiRevision]);
  useEffect(()=>setSelectedKpi(''),[kpiProject]);
  const kpiBadges=useMemo(()=>{const map=new Map<string,string[]>();for(const k of kpis)for(const c of k.concepts){const name=c.concept??c.input;const list=map.get(name)??[];if(!list.includes(k.label))list.push(k.label);map.set(name,list);}return map;},[kpis]);
  const sourceEditor=useRef<CodeEditorHandle|null>(null);
  // Neighborhood walk across centers and files (FR-037).
  const [walk,dispatchWalk]=useReducer(walkReducer,emptyWalk);
  const walkStep=walk.steps[walk.index],neighborhoodFocus=walkStep&&walkStep.doc===current?.id?walkStep.center:'';
  const setNeighborhoodFocus=(id:string)=>{if(id&&current)dispatchWalk({type:'push',step:{doc:current.id,center:id,name:model?.entities.find(e=>e.id===id)?.name??id}});};
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
  const [gitVersion,setGitVersion]=useState(0);
  useEvents(event=>{if(event==='trash')setTrashVersion(v=>v+1);if(event==='git'||event==='files'||event==='resync')setGitVersion(v=>v+1);clearTimeout(refreshTimer.current);refreshTimer.current=setTimeout(()=>{void refresh().catch(()=>{});},80);});
  useEffect(() => {
    api.status().then(setStatus).catch(()=>{});
    refresh()
      .then((d) => { if (d[0]) open(d[0]); })
      .catch(() => setMessage("Cannot reach local API"));
  }, []);
  function open(d: Doc):boolean {
    setMessage('');
    if(current?.id===d.id){if(compact)closeWorkspace();return true;}
    if (current && source !== current.source && !confirm("Discard unsaved changes?")) return false;
    setCurrent(d);
    setSource(d.source);
    setNeighborhoodFocus('');if(compact)closeWorkspace();
    setSelected("");
    setSelectedEdge("");
    setSearch("");
    if(tab!=='neighborhood'&&validateInput(d.source,d.filename).model?.kind==='Ossie mappings')setTab('mappings');
    return true;
  }
  // While typing in Source, findings come from the editor's validation worker (after a 300 ms pause)
  // and the whole model is rebuilt only when another view needs it, so keystrokes never wait for a
  // parse on the main thread (FR-045). A newly opened file is checked at once.
  const [settled,setSettled]=useState({id:current?.id,text:source});
  const [editorIssues,setEditorIssues]=useState<{id?:string;issues:Issue[]}|null>(null);
  useEffect(()=>{if(tab!=='source'||settled.id!==current?.id)setSettled({id:current?.id,text:source});},[source,tab,current?.id]);
  const checkedSource=tab==='source'&&settled.id===current?.id?settled.text:source;
  const plainText=!!current&&isGitignore(current.filename);
  const checked = useMemo(()=>plainText?{valid:true as const,model:null,issues:[] as Issue[]}:validateInput(checkedSource,current?.filename??'definition.yaml'),[checkedSource,current?.filename,plainText]);
  const live=tab==='source'&&checkedSource!==source&&editorIssues?.id===current?.id?editorIssues!.issues:null;
  const validation=live?{...checked,issues:live,valid:!live.some(i=>i.severity==='error')}:checked;
  const result = {model:validation.model,error:(source||current)&&!validation.valid?validation.issues.filter(i=>i.severity==='error').map(i=>i.message).join('\n'):''};
  const model = result.model;

  // ODCS contract overview and dataset pages (Phase 9): the object whose page is open, per document.
  const isContract=model?.kind==='ODCS';
  const [contractObject,setContractObject]=useState<string|null>(null);
  useEffect(()=>setContractObject(null),[current?.id]);
  useEffect(()=>{if(tab==='contract'&&model&&!isContract)setTab('fullgraph');},[tab,isContract,!!model]);
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
  // Other files of the project that define the same thing: a shared IRI, physical name or business
  // definition, or an Ossie concept mapping and the ontology concept it maps (FR-037).
  const projectModels=useMemo(()=>new Map(docs.filter(d=>d.project===current?.project&&d.id!==current?.id).flatMap(d=>{try{const m=validateInput(d.source,d.filename).model;return m?[[d.id,m] as const]:[];}catch{return [];}})),[docs,current?.project,current?.id]);
  const conceptKinds=new Set(['EntityType','ValueType','Built-in concept','OWL class']);
  function crossFile(e:Entity):CrossFileTarget[]{
    const keys=new Set(entityKeys(e,model)),out:CrossFileTarget[]=[];
    for(const [id,m] of projectModels){const d=docsRef.current.get(id);if(!d)continue;
      const hit=m.entities.find(x=>entityKeys(x,m).some(k=>keys.has(k)));
      const mapped=!hit&&(e.kind==='Concept mapping'?m.entities.find(x=>x.name===e.name&&conceptKinds.has(x.kind)):conceptKinds.has(e.kind)?m.entities.find(x=>x.name===e.name&&x.kind==='Concept mapping'):undefined);
      const target=hit??mapped;if(target)out.push({doc:id,file:d.path,entity:target.id,name:target.name,reason:hit?'Same identity (IRI, physical name or business definition)':'Ossie mapping reference'});}
    return out;
  }
  function walkTo(index:number){const step=walk.steps[index];if(!step)return;if(step.doc!==current?.id){const d=docsRef.current.get(step.doc);if(!d||!open(d))return;setTab('neighborhood');}setSelected(step.center);setSelectedEdge('');dispatchWalk({type:'jump',index});}
  function crossTo(t:CrossFileTarget){const d=docsRef.current.get(t.doc);if(!d||!current)return;const from=walk.steps[walk.index];if(!open(d))return;
    if(!from||from.doc!==current.id||from.center!==neighborhoodFocus){const c=model?.entities.find(e=>e.id===(neighborhoodFocus||selected));if(c)dispatchWalk({type:'push',step:{doc:current.id,center:c.id,name:c.name}});}
    dispatchWalk({type:'push',step:{doc:t.doc,center:t.entity,name:t.name,via:{id:'file',label:'same definition'}}});setTab('neighborhood');setSelected(t.entity);setSelectedEdge('');}
  function showNeighborhood(id=selected||relationship?.source||neighborhoodFocus){setNeighborhoodFocus(id);setSearch('');setTab('neighborhood');}
  // Item editing (FR-048–FR-052): the editor, add and delete dialogs work on one file of a project.
  type ItemTarget={docId:string;path:Path;kind:ItemKind};
  const [editing,setEditing]=useState<ItemTarget|null>(null),[adding,setAdding]=useState<{docId:string;kind?:ItemKind;owner?:Path;preset?:Record<string,any>}|null>(null),[deleting,setDeleting]=useState<ItemTarget|null>(null),[wizard,setWizard]=useState(false);
  // Source Control (Phase 8): the project shown, a file whose history is open, and the open file's
  // unsaved text kept as a server draft so pull and switch are refused while it exists (FR-065).
  const [scmProject,setScmProject]=useState<string|null>(null),[historyPath,setHistoryPath]=useState<string|undefined>(undefined);
  const scmSlug=scmProject&&projects.some(p=>p.slug===scmProject)?scmProject:current?.project??projects[0]?.slug??null;
  const draftOf=useRef<{project:string;path:string}|null>(null);
  useEffect(()=>{
    const dirty=!!current&&source!==current.source;
    if(!dirty){const d=draftOf.current;if(d){draftOf.current=null;void scmApi.deleteDraft(d.project,d.path).catch(()=>{});}return;}
    const t=setTimeout(()=>{const prev=draftOf.current;if(prev&&(prev.project!==current!.project||prev.path!==current!.path))void scmApi.deleteDraft(prev.project,prev.path).catch(()=>{});draftOf.current={project:current!.project,path:current!.path};void scmApi.saveDraft(current!.project,current!.path,current!.hash,source).catch(()=>{});},1500);
    return()=>clearTimeout(t);
  },[source,current?.id,current?.hash]);
  // RDF, OWL and SHACL resources are edited by IRI (Phase 7); blank nodes go with their parent.
  type RdfTarget={docId:string;subject:string;label:string;kind:string};
  const [rdfEditing,setRdfEditing]=useState<RdfTarget|null>(null),[rdfAdding,setRdfAdding]=useState<string|null>(null),[rdfDeleting,setRdfDeleting]=useState<RdfTarget|null>(null);
  const currentIsRdf=!!current&&!!rdfSyntax(source,current.filename);
  function rdfTarget(e:Entity):RdfTarget|null{return current&&currentIsRdf&&e.readOnlyForm&&isIri(e.id)&&e.kind!=='Built-in concept'?{docId:current.id,subject:e.id,label:e.name,kind:e.kind}:null;}
  function rdfEdgeTarget(r:Relationship):RdfTarget|null{if(!current||!currentIsRdf)return null;const d=r.data.definition,subject=r.data.kind==='OWL object property'?d?.iri:d?.subject;const e=model?.entities.find(x=>x.id===subject);return subject&&isIri(subject)?{docId:current.id,subject,label:e?.name??subject,kind:e?.kind??'RDF resource'}:null;}
  const docText=(id:string)=>id===current?.id?source:docsRef.current.get(id)?.source??'';
  const modelOf=(id:string)=>id===current?.id?model:projectModels.get(id)??(()=>{const d=docsRef.current.get(id);try{return d?validateInput(d.source,d.filename).model:null;}catch{return null;}})();
  const documentOf=(id:string)=>(modelOf(id) as any)?.document;
  function entityTarget(e:Entity):ItemTarget|null{if(!current||e.readOnlyForm||!e.path.length)return null;const kind=itemKindAt(documentOf(current.id),e.path);return kind?{docId:current.id,path:e.path,kind}:null;}
  function relationshipTarget(r:Relationship):ItemTarget|null{if(!current||r.data.readOnlyForm||!r.data.path.length)return null;const kind=itemKindAt(documentOf(current.id),r.data.path);return kind?{docId:current.id,path:r.data.path,kind}:null;}
  function choicesFor(id:string):Choices{
    const own=modelOf(id),project=docsRef.current.get(id)?.project;
    const models=[...docs.filter(d=>d.project===project).map(d=>modelOf(d.id))].filter(Boolean) as NonNullable<typeof model>[];
    const names=(m:typeof model,kinds:string[])=>(m?.entities??[]).filter(e=>kinds.includes(e.kind)).map(e=>e.name);
    return {concepts:[...new Set(models.flatMap(m=>names(m,['EntityType','ValueType','Concept'])))].sort(),datasets:names(own,['Dataset']),metrics:names(own,['Metric'])};
  }
  const projectDocsOf=(id:string)=>docs.filter(d=>d.project===docsRef.current.get(id)?.project);
  // Saved item changes: every view follows the new bytes at once, then the folder scan confirms.
  function applySaved(saved:Saved[],label:string){
    for(const x of saved){const d=docsRef.current.get(x.docId);if(!d)continue;const next={...d,source:x.source,hash:x.hash};docsRef.current.set(d.id,next);if(currentRef.current?.id===d.id){setCurrent(next);setSource(x.source);}}
    setDocs(old=>old.map(d=>docsRef.current.get(d.id)??d));setMessage(label);void refresh().catch(()=>{});
  }
  function openSourceAt(id:string,line:number){const d=docsRef.current.get(id);if(d&&d.id!==current?.id&&!open(d))return;setTab('source');setTimeout(()=>sourceEditor.current?.goToLine(line),60);}
  function editMappingItem(docId:string,path:Path){
    const d=docsRef.current.get(docId);if(!d)return;
    const document=documentOf(docId),text=docText(docId);
    for(let length=path.length;length>0;length--){
      const prefix=path.slice(0,length),kind=itemKindAt(document,prefix);
      if(kind&&prefix.reduce((value,key)=>value?.[key],document)!=null){
        if(d.id!==current?.id&&!open(d))return;
        setEditing({docId,path:prefix,kind});return;
      }
    }
    // A non-editable finding still leads to the nearest source location available.
    for(let length=path.length;length>0;length--){
      try{const fragment=openFragment(text,path.slice(0,length));openSourceAt(docId,fragment.line);return;}catch{}
    }
    openSourceAt(docId,1);
  }
  function editKpi(k:KpiSummary){
    const id=`${kpiProject}/${k.file}`,d=docsRef.current.get(id);if(!d)return;
    const metrics=itemValue(docText(id),[...k.modelPath,'metrics']);const i=Array.isArray(metrics)?metrics.findIndex((m:any)=>m?.name===k.name):-1;
    if(i>=0)setEditing({docId:id,path:[...k.modelPath,'metrics',i],kind:'metric'});
  }
  const latest=useRef<()=>void>(()=>{});
  latest.current=()=>{const t=entity?entityTarget(entity):relationship?relationshipTarget(relationship):null;if(t){setEditing(t);return;}const r=entity?rdfTarget(entity):relationship?rdfEdgeTarget(relationship):null;if(r)setRdfEditing(r);};
  // "e" opens the editor of the selected item (outside text fields and dialogs).
  // Full screen for Graph and Neighborhood (FR-066): the canvas row (graph and details) fills the screen.
  const inspectorVisible=tab!=='mappings'&&tab!=='metrics'&&!!(entity||relationship);
  const [phone,setPhone]=useState(()=>window.innerWidth<=650);
  useEffect(()=>{const update=()=>setPhone(window.innerWidth<=650);window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[]);
  const pageDetails=phone&&inspectorVisible&&(tab==='overview'||tab==='catalog');
  const canvasRow=useRef<HTMLDivElement|null>(null),graphView=tab==='fullgraph'||(tab==='neighborhood');
  useEffect(()=>{
    if(!pageDetails)return;
    const previous=document.activeElement as HTMLElement|null;
    const panel=canvasRow.current?.querySelector<HTMLElement>('.inspector');
    panel?.querySelector<HTMLButtonElement>('.inspector-close')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setSelected('');setSelectedEdge('');return;}
      if(event.key!=='Tab'||!panel)return;
      const controls=Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]')).filter(el=>el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  },[pageDetails]);
  const fullscreen=useFullscreen(canvasRow,graphView&&!!model);
  const toggleFull=useRef(()=>{});toggleFull.current=fullscreen.toggle;
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const el=e.target as HTMLElement;if(e.key!=='f'||e.ctrlKey||e.metaKey||e.altKey||el.closest('input,textarea,select,[contenteditable=true],dialog,.cm-editor'))return;e.preventDefault();toggleFull.current();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{const el=e.target as HTMLElement;if(e.key!=='e'||e.ctrlKey||e.metaKey||e.altKey||el.closest('input,textarea,select,[contenteditable=true],dialog'))return;e.preventDefault();latest.current();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  function selectEntity(id:string){setSelected(id);setSelectedEdge('');if(tab==='neighborhood'){setNeighborhoodFocus(id);setSearch('');}}
  async function loadExample(id:string) {
    const set=exampleSet(id)!;
    if(current && source !== current.source && !confirm('Discard unsaved changes and open examples?'))return;
    setBusy(true);setMessage('Loading example documents…');
    try {
      const {slug}=await api.example(id);
      const loaded=await refresh();
      const first=loaded.find(d=>d.project===slug&&d.path===set.files[0])??loaded.find(d=>d.project===slug);
      if(first){setCurrent(first);setSource(first.source);}
      setNeighborhoodFocus('');if(compact)closeWorkspace();setSelected('');setSelectedEdge('');setSearch('');setTab(set.tab);
      setMessage(set.message);
    }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
  }
  async function save(baseHash=current?.hash??null) {
    if(!current)return false;
    setBusy(true);
    setMessage("");
    try {
      // Unchanged base: send only the changed range, so untouched bytes are never re-sent.
      const saved=await api.save(current.project,current.path,baseHash,source,baseHash===current.hash?diffPatches(current.source,source):undefined);
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
    setNeighborhoodFocus('');if(compact)closeWorkspace();setSelected('');setSelectedEdge('');setSearch('');setTab('neighborhood');
    setMessage(`Imported ${created.written.length} file${created.written.length===1?'':'s'} into project ${created.name}.`);
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
    else if(a.action==='history'){setScmProject(a.project);setHistoryPath(a.path);setTab('scm');if(compact)closeWorkspace();}
    else if(a.action==='gitignore')void editGitignore(a.project);
    else{
      // A detached file input, so the page keeps a single "Import definitions" file field.
      importInto.current=a.project;const input=document.createElement('input');input.type='file';input.multiple=true;
      input.onchange=async()=>{const files=await Promise.all(Array.from(input.files??[]).map(async f=>({path:f.name,source:await f.text()})));if(files.length)void importIntoProject(files);};input.click();
    }
  }
  // FR-094: `.gitignore` opens in Source; it is created empty when the project has none.
  async function editGitignore(slug:string){
    let d=docsRef.current.get(`${slug}/.gitignore`);
    if(!d){try{await api.save(slug,'.gitignore',null,'');d=(await refresh()).find(x=>x.id===`${slug}/.gitignore`);}catch(e){setMessage((e as Error).message);return;}}
    if(d&&open(d))setTab('source');
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
      {editing&&docsRef.current.get(editing.docId)&&<ItemEditor key={editing.docId+'#'+editing.path.join('/')} doc={docsRef.current.get(editing.docId)!} base={docText(editing.docId)} path={editing.path} kind={editing.kind} projectDocs={projectDocsOf(editing.docId)} choices={choicesFor(editing.docId)}
        onClose={()=>setEditing(null)} onSaved={saved=>{const file=docsRef.current.get(editing.docId)?.path;setEditing(null);applySaved(saved,`Saved to ${file}${saved.length>1?` and ${saved.length-1} other file${saved.length>2?'s':''}`:''}.`);}}
        onOpenItem={(path,kind)=>setEditing({docId:editing.docId,path,kind})} onAddChild={(kind,owner)=>{setAdding({docId:editing.docId,kind,owner});setEditing(null);}} onDelete={()=>{setDeleting(editing);setEditing(null);}} onOpenSource={line=>{const id=editing.docId;setEditing(null);openSourceAt(id,line);}}/>}
      {adding&&docsRef.current.get(adding.docId)&&<AddItem doc={docsRef.current.get(adding.docId)!} base={docText(adding.docId)} document={documentOf(adding.docId)} kind={adding.kind} owner={adding.owner} preset={adding.preset} choices={choicesFor(adding.docId)} onClose={()=>setAdding(null)}
        onSaved={(saved,path,kind)=>{setAdding(null);applySaved([saved],`Added to ${docsRef.current.get(saved.docId)?.path}.`);if(saved.docId===current?.id&&!['ontology-relationship','join','odcs-foreign-key'].includes(kind)){setSelected(path.join('/'));setSelectedEdge('');}}}/>}
      {deleting&&docsRef.current.get(deleting.docId)&&(()=>{const base=docText(deleting.docId),item=itemValue(base,deleting.path),owner=deleting.kind==='field'||deleting.kind==='odcs-property'?String(itemValue(base,deleting.path.slice(0,-2))?.name??''):undefined;
        return <DeleteItem doc={docsRef.current.get(deleting.docId)!} base={base} path={deleting.path} kind={deleting.kind} name={itemName(deleting.kind,item)||'this item'} owner={owner} projectDocs={projectDocsOf(deleting.docId)} onClose={()=>setDeleting(null)} onDeleted={saved=>{setDeleting(null);setSelected('');setSelectedEdge('');applySaved(saved,`Deleted ${itemName(deleting.kind,item)} and saved ${saved.length} file${saved.length===1?'':'s'}.`);}}/>;})()}
      {rdfEditing&&docsRef.current.get(rdfEditing.docId)&&<RdfItemEditor key={rdfEditing.docId+'#'+rdfEditing.subject} doc={docsRef.current.get(rdfEditing.docId)!} base={docText(rdfEditing.docId)} subject={rdfEditing.subject} label={rdfEditing.label} kind={rdfEditing.kind}
        onClose={()=>setRdfEditing(null)} onSaved={saved=>{const file=docsRef.current.get(rdfEditing.docId)?.path;setRdfEditing(null);applySaved(saved,`Saved to ${file}.`);}} onDelete={()=>{setRdfDeleting(rdfEditing);setRdfEditing(null);}} onOpenSource={line=>{const id=rdfEditing.docId;setRdfEditing(null);openSourceAt(id,line);}}/>}
      {rdfAdding&&docsRef.current.get(rdfAdding)&&<RdfAddItem doc={docsRef.current.get(rdfAdding)!} base={docText(rdfAdding)} onClose={()=>setRdfAdding(null)} onSaved={(saved,subject)=>{setRdfAdding(null);applySaved([saved],`Added to ${docsRef.current.get(saved.docId)?.path}.`);if(saved.docId===current?.id){setSelected(subject);setSelectedEdge('');}}}/>}
      {rdfDeleting&&docsRef.current.get(rdfDeleting.docId)&&<RdfDeleteItem doc={docsRef.current.get(rdfDeleting.docId)!} base={docText(rdfDeleting.docId)} subject={rdfDeleting.subject} label={rdfDeleting.label} projectDocs={projectDocsOf(rdfDeleting.docId)} onClose={()=>setRdfDeleting(null)} onDeleted={saved=>{const label=rdfDeleting.label;setRdfDeleting(null);setSelected('');setSelectedEdge('');applySaved(saved,`Deleted ${label}.`);}}/>}
      {wizard&&kpiProject&&<KpiWizard project={kpiProject} docs={docs.filter(d=>d.project===kpiProject)} kpis={kpis} onClose={()=>setWizard(false)} onSaved={(file,modelPath,name)=>{setWizard(false);setSelectedKpi(`${file}#${modelPath.join('/')}#${name}`);setTab('metrics');setMessage(`Created KPI ${name} in ${file}.`);void refresh().catch(()=>{});}}/>}
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
        <button className={`nav${tab!=='scm'&&tab!=='source'?' active':''}`} aria-current={tab!=='scm'&&tab!=='source'?'page':undefined} onClick={() => {setTab('fullgraph');if(compact)closeWorkspace();}}>
          <Network size={18} /> Model explorer
        </button>
        <button className={`nav${tab==='source'?' active':''}`} aria-current={tab==='source'?'page':undefined} onClick={() => {setTab("source");if(compact)closeWorkspace();}}>
          <FileCode size={18} /> Source editor
        </button>
        <button className={`nav${tab==='scm'?' active':''}`} aria-current={tab==='scm'?'page':undefined} onClick={() => {setHistoryPath(undefined);setTab("scm");if(compact)closeWorkspace();}}>
          <GitBranch size={18} /> Source control{(()=>{const n=projects.find(p=>p.slug===scmSlug)?.changes??0;return n>0&&<span className="nav-count" aria-label={`${n} changed files`}>{n}</span>;})()}
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
            <button aria-label="Add item" onClick={()=>{if(!current)return;if(currentIsRdf)setRdfAdding(current.id);else setAdding({docId:current.id});}} disabled={!current||!model||(!currentIsRdf&&!addableKinds((model as any).document).length)} title="Add an entity or relationship to this file">
              <Plus size={15} /> <span className="action-label">Add</span>
            </button>
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
          <ScrollStrip className="tabs" selection={tab}>
            {isContract&&<button className={tab==='contract'?'selected':''} aria-current={tab==='contract'?'page':undefined} onClick={()=>setTab('contract')}><FileCheck2 size={16}/> Contract</button>}
            <button className={tab==='overview'?'selected':''} aria-current={tab==='overview'?'page':undefined} onClick={()=>{setTab('overview');setSearch('')}}><Layers size={16}/> Overview</button>
            <button className={tab==='fullgraph' ? "selected" : ""} aria-current={tab==='fullgraph' ?'page':undefined} onClick={() => {setTab("fullgraph");setSearch('')}}>
              <Network size={16} /> Graph
            </button>
            <button className={tab==='neighborhood'?'selected':''} aria-current={tab==='neighborhood'?'page':undefined} onClick={()=>showNeighborhood(neighborhoodFocus||selected||relationship?.source||'')}><Focus size={16}/> Neighborhood</button>
            <button
              className={tab === "catalog" ? "selected" : ""} aria-current={tab === "catalog" ?'page':undefined}
              onClick={() => setTab("catalog")}
            >
              <Box size={16} /> Catalog
            </button>
            <button className={tab === "source" ? "selected" : ""} aria-current={tab === "source" ?'page':undefined} onClick={() => {setTab("source");if(compact)closeWorkspace();}}>
              <FileCode size={16} /> Source
            </button>
            <button className={tab==='mappings'?'selected':''} aria-current={tab==='mappings'?'page':undefined} onClick={()=>setTab('mappings')}><Layers size={16}/> Mappings</button>
            <button className={tab==='metrics'?'selected':''} aria-current={tab==='metrics'?'page':undefined} onClick={()=>setTab('metrics')}><Gauge size={16}/> Metrics{kpis.length>0&&<span className="tab-count">{kpis.length}</span>}</button>
          </ScrollStrip>
          {groupingOverview&&(tab==='fullgraph'||(tab==='overview'))&&<GroupingControls overview={groupingOverview} value={grouping.value} onChange={grouping.change} example={model!.name.includes('UBL')} error={grouping.error}/>}
          <label className="search">
            <Search size={16} />
            <input
              placeholder="Find an entity…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {tab!=='scm'&&(source||current)&&(showValidation||!!result.error)&&<details className="validation-details" open><summary onClick={e=>{e.preventDefault();setShowValidation(false);}}>Validation findings</summary><ValidationPanel source={source} issues={validation.issues} onLocate={issue=>{setTab('source');setTimeout(()=>{sourceEditor.current?.locate(issue);},0);}}/></details>}
        <div ref={canvasRow} className={`canvas-row${inspectorVisible?' has-inspector':''}${pageDetails?' page-details':''}${fullscreen.active?' is-fullscreen':''}${fullscreen.fallback?' window-fill':''}`}>
          <section className="canvas" inert={pageDetails}>
            {tab==='contract'&&isContract&&current ? (contractObject?<DatasetPage key={contractObject} doc={current} data={(model as any).document} objectName={contractObject} projectDocs={docs.filter(d=>d.project===current.project)} onBack={()=>setContractObject(null)} onOpenObject={setContractObject} gitVersion={gitVersion} editor={propertyEditor({doc:current,base:docText(current.id),onSaved:applySaved,onError:setMessage})}/>:<ContractOverview data={(model as any).document} onOpen={setContractObject}/>) : tab==='scm' ? (scmSlug?<SourceControl projects={projects} project={scmSlug} version={gitVersion} unsaved={current&&current.project===scmSlug&&source!==current.source?[current.path]:[]} historyPath={historyPath} onProject={slug=>{setMessage('');setScmProject(slug);setHistoryPath(undefined);}} onChanged={()=>void refresh().catch(()=>{})} onOpen={(project,path)=>{const d=docsRef.current.get(`${project}/${path}`);if(d&&open(d))setTab('source');}}/>:<p className="hint">Import definitions or load an example to start a project.</p>) : tab==='metrics' ? <MetricsView project={kpiProject} projectName={projects.find(p=>p.slug===kpiProject)?.name} kpis={kpis} error={kpiError} loading={kpiLoading} selected={selectedKpi} onSelect={setSelectedKpi} filter={kpiFilter} onNew={()=>setWizard(true)} onEdit={editKpi}/> : tab==='mappings' ? <MappingExplorer onEditItem={editMappingItem} currentId={current?.id} revisionKey={docs.map(d=>d.id+':'+d.hash).join('|')} dirty={!!current&&source!==current.source}/> : !source && !current ? (
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
              <CodeEditor
                ref={sourceEditor}
                ariaLabel="Definition source"
                className="code"
                filename={current?.filename??'definition.yaml'}
                value={source}
                onChange={setSource}
                onIssues={issues=>setEditorIssues({id:current?.id,issues})}
              />
            ) : plainText ? <div className="invalid-definition"><h2>Git ignore rules</h2><p>{current?.path} is plain text: one pattern per line, read by Git. Files it matches are not shown in the workspace or in Source Control.</p><button onClick={()=>setTab("source")}>Edit in Source</button></div> : result.error ? <div className="invalid-definition"><h2>This definition needs repair</h2><p>Your saved document is unchanged. Open Source to fix the validation findings.</p><button onClick={()=>setTab("source")}>Repair in Source</button></div> : tab === "catalog" ? (
              <div className="catalog">
                {model?.entities
                  .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
                  .map((e) => (
                    <div className="catalog-card" key={e.id}>
                    <button onClick={() => selectEntity(e.id)}>
                      <small>{e.kind==='Metric'?'KPI · Metric':e.kind}{(kpiBadges.get(e.name)?.length??0)>0&&<span className="kpi-badge" title={`KPIs: ${kpiBadges.get(e.name)!.join(', ')}`}><Gauge size={10}/>{kpiBadges.get(e.name)!.length===1?'KPI':`${kpiBadges.get(e.name)!.length} KPIs`}</span>}</small>
                      <strong>{e.name}</strong>
                      <p>{e.description || "No description yet"}</p>
                    </button>
                    {(entityTarget(e)||rdfTarget(e))&&<button className="catalog-edit" aria-label={`Edit ${e.name}`} onClick={()=>{const t=entityTarget(e);if(t)setEditing(t);else setRdfEditing(rdfTarget(e));}}><Pencil size={11}/>Edit</button>}
                    </div>
                  ))}
              </div>
            ) : tab==='fullgraph' && model ? <FullGraph fullscreen={fullscreen} kpiBadges={kpiBadges} grouping={grouping.value} onGroupingChange={grouping.change} groupingError={grouping.error} key={current?.id} name={model.name} entities={model.entities} edges={model.edges} selected={selected} selectedEdge={selectedEdge} search={search} onSelectEntity={selectEntity} onSelectEdge={id=>{setSelectedEdge(id);setSelected('')}} onOverview={()=>{setTab('overview');setSearch('')}} onNeighborhood={()=>showNeighborhood()}/> : (
              tab==='overview' && model ? <ModelOverview grouping={grouping.value} onGroupingChange={grouping.change} groupingError={grouping.error} key={current?.id} name={model.name} entities={model.entities} edges={model.edges} search={search} selected={selected} onSelectEntity={selectEntity} onSelectRelationship={id=>{setSelectedEdge(id);setSelected('')}} onClose={()=>showNeighborhood()} onOpenGraph={()=>{setTab('fullgraph')}}/> : <NeighborhoodGraph fullscreen={fullscreen} kpiBadges={kpiBadges} key={current?.id} docId={current!.id} docLabel={id=>docsRef.current.get(id)?.path??id} entities={model?.entities??[]} edges={model?.edges??[]} search={search} walk={walk} selected={selected} selectedEdge={selectedEdge} onWalk={(steps:WalkStep[])=>{for(const step of steps)dispatchWalk({type:'push',step});}} onWalkTo={walkTo} onClearSearch={()=>setSearch('')} onSelectEntity={id=>{setSelected(id);setSelectedEdge('');}} onSelectEdge={id=>{setSelectedEdge(id);}} onOverview={()=>{setSearch('');setTab('overview')}} onFullGraph={()=>{setSearch('');setTab('fullgraph')}} onOpenKpis={concept=>{setKpiFilter(concept+'\u0000'+Date.now());setSelectedKpi('');setTab('metrics');}} crossFile={crossFile} onCrossFile={crossTo}/>
            )}
          </section>
          {inspectorVisible && <aside className="inspector" aria-label="Definition details" role={pageDetails?'dialog':undefined} aria-modal={pageDetails||undefined}>
            <div className="section-label">DEFINITION DETAILS{(entity||relationship)&&<button className="inspector-close" aria-label="Close details" onClick={()=>{setSelected('');setSelectedEdge('')}}>×</button>}</div>
            {relationship ? (
              <>
                <div className="entity-icon"><Network /></div>
                {activeGroup && activeGroup.data.relationships.length>1 && <label>Relationships on this connection<select aria-label="Connection relationship" value={selectedEdge} onChange={e=>setSelectedEdge(e.target.value)}>{activeGroup.data.relationships.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>}
                <h2>{relationship.label}</h2>
                <div className="badge">{relationship.data.kind}</div>
                {(()=>{const t=relationshipTarget(relationship);const rt=t?null:rdfEdgeTarget(relationship);if(rt)return <div className="inspector-actions"><button className="primary" onClick={()=>setRdfEditing(rt)} aria-label={`Edit ${rt.label}`}><Pencil size={13}/>Edit {rt.label}</button></div>;if(!t)return <p className="hint">Edit this relationship in Source.</p>;const whole=relationship.data.kind==='Inheritance'||relationship.data.kind==='Metric expression reference';const owner=whole?itemName(t.kind,itemValue(source,t.path)):relationship.label;
                  return <div className="inspector-actions"><button className="primary" onClick={()=>setEditing(t)} aria-label={`Edit ${owner}`}><Pencil size={13}/>{whole?`Edit ${owner}`:'Edit'}</button>{!whole&&<button onClick={()=>setDeleting(t)} aria-label={`Delete ${relationship.label}`}><Trash2 size={13}/>Delete</button>}</div>;})()}
                <dl className="relationship-details">
                  <dt>From</dt><dd>{model?.entities.find(e=>e.id===relationship.source)?.name}</dd>
                  <dt>To</dt><dd>{model?.entities.find(e=>e.id===relationship.target)?.name}</dd>
                  {relationship.data.definition.multiplicity && <><dt>Multiplicity</dt><dd>{relationship.data.definition.multiplicity}</dd></>}
                  {relationship.data.definition.from_columns && <><dt>Join keys</dt><dd>{relationship.data.definition.from_columns.map((key:string,i:number)=><div key={i}>{key} → {relationship.data.definition.to_columns[i]}</div>)}</dd></>}
                  {relationship.data.definition.roles && <><dt>Roles</dt><dd>{relationship.data.definition.roles.map((role:any,i:number)=><div key={i}>{role.concept}{role.name ? ` (${role.name})` : ''}</div>)}</dd></>}
                  {relationship.data.definition.verbalizes && <><dt>Verbalizations</dt><dd>{relationship.data.definition.verbalizes.join(' · ')}</dd></>}
                </dl>
                {relationship.data.kind !== 'Inheritance' && !relationship.data.readOnlyForm && <label>Description<textarea aria-label="Relationship description" value={relationship.data.definition.description ?? ''} onChange={e=>setSource(editEntity(source,relationship.data.path,e.target.value,current?.filename))}/></label>}
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
                {(()=>{const rt=rdfTarget(entity);if(rt)return <div className="inspector-actions"><button className="primary" onClick={()=>setRdfEditing(rt)} aria-label={`Edit ${entity.name}`} title="Edit (E)"><Pencil size={13}/>Edit</button><button onClick={()=>setRdfDeleting(rt)} aria-label={`Delete ${entity.name}`}><Trash2 size={13}/>Delete</button></div>;return null;})()}
                {(()=>{const t=entityTarget(entity);if(!t)return null;const add=t.kind==='concept'?{kind:'ontology-relationship' as ItemKind,owner:t.path,label:'Add relationship'}:t.kind==='dataset'?{kind:'join' as ItemKind,preset:{from:entity.name},label:'Add relationship'}:t.kind==='odcs-object'?{kind:'odcs-property' as ItemKind,owner:t.path,label:'Add property'}:null;
                  return <div className="inspector-actions"><button className="primary" onClick={()=>setEditing(t)} aria-label={`Edit ${entity.name}`} title="Edit (E)"><Pencil size={13}/>Edit</button>{add&&<button onClick={()=>setAdding({docId:t.docId,kind:add.kind,owner:add.owner,preset:add.preset})}><Plus size={13}/>{add.label}</button>}<button onClick={()=>setDeleting(t)} aria-label={`Delete ${entity.name}`}><Trash2 size={13}/>Delete</button></div>;})()}
                {entity.readOnlyForm ? <p className="hint">{entity.description || (rdfTarget(entity)?'Edit its statements with Edit; the file keeps its serialization and layout.':'A blank node is edited with the resource that contains it.')}</p> : <label>
                  Description
                  <textarea
                    value={entity.description}
                    onChange={(e) => setSource(editEntity(source, entity.path, e.target.value, current?.filename))}
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
        {(message || (result.error&&tab!=='scm')) && (
          <div role="status" className={`status ${result.error&&tab!=='scm' ? "error" : ""}`}>
            {result.error&&tab!=='scm' ? "Validation failed. Review the findings and repair in Source." : message}
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

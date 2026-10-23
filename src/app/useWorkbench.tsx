/** Connects document state, navigation, editing, and persistence to the workspace views. */
import React, { useMemo, useReducer, useRef, useState } from 'react';
import { type CodeEditorHandle } from '../editor/CodeEditor';
import { exportDocument } from '../export';
import { emptyWalk, walkReducer } from '../graph/walk';
import { modelOverview } from '../overview';
import {
  type Deleted,
  type Doc,
  type ProjectInfo,
  type Suggestion,
  type WorkspaceStatus,
} from '../projects/api';
import { type DeleteTarget } from '../projects/DeleteDialog';
import { useGrouping } from '../useGrouping';
import { type ImportDraft } from '../ValidationPanel';
import { parsedDoc } from './parsedDocument';
import { sample } from './sample';
import { clampSidebarWidth, readSidebarWidth } from './sidebarWidth';
import { useExamples } from './useExamples';
import { useFileNavigation } from './useFileNavigation';
import { useImport } from './useImport';
import { useInspector } from './useInspector';
import { useItemEditing } from './useItemEditing';
import { useLineage } from './useLineage';
import { useMetrics } from './useMetrics';
import { useNewItems } from './useNewItems';
import { useProjectActions } from './useProjectActions';
import { useReferences } from './useReferences';
import { useSaving } from './useSaving';
import { useSidebar } from './useSidebar';
import { useValidation } from './useValidation';
import { useWalkNavigation } from './useWalkNavigation';
import { useWorkspaceEvents } from './useWorkspaceEvents';

type Options = { setMessage: React.Dispatch<React.SetStateAction<string>> };
/** Manages workbench. */
export function useWorkbench({ setMessage }: Options) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [current, setCurrentState] = useState<Doc | null>(null);
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState('');
  const [selectedEdge, setSelectedEdge] = useState('');
  const [tab, setTabState] = useState('fullgraph');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  function setCurrent(next: Doc | null) {
    if (next?.id !== current?.id) setMessage('');
    setCurrentState(next);
  }
  // Switching views writes a due valid save first.
  function setTab(next: string) {
    setMessage('');
    void autosave.flush();
    setTabState(next === 'graph' ? 'neighborhood' : next);
  }

  const [pendingImport, setPendingImport] = useState<ImportDraft[] | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [stale, setStale] = useState<{ current: string | null; currentHash: string | null } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashVersion, setTrashVersion] = useState(0);
  const [renaming, setRenaming] = useState<ProjectInfo | null>(null);
  const [moving, setMoving] = useState<{ project: string; path: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [importConflict, setImportConflict] = useState<{
    project: ProjectInfo;
    files: { path: string; source: string }[];
    conflicts: string[];
  } | null>(null);
  const importInto = useRef<string>('');
  const importInput = useRef<HTMLInputElement | null>(null);
  const docsRef = useRef(new Map<string, Doc>());
  const currentRef = useRef<Doc | null>(null);
  const sourceRef = useRef('');
  currentRef.current = current;
  sourceRef.current = source;
  const [showValidation, setShowValidation] = useState(false);
  // View definition: the item's full definition as read, in a dialog.
  const [definition, setDefinition] = useState<{ title: string; value: unknown } | null>(null);
  const [importing, setImporting] = useState<{ project?: string } | null>(null);
  const grouping = useGrouping(current?.id);
  const metrics = useMetrics({ current, docs });
  const { kpiProject } = metrics;
  const sourceEditor = useRef<CodeEditorHandle | null>(null);
  // Neighborhood walk across centers and files.
  const [walk, dispatchWalk] = useReducer(walkReducer, emptyWalk);
  const walkStep = walk.steps[walk.index];
  const neighborhoodFocus = walkStep && walkStep.doc === current?.id ? walkStep.center : '';
  const setNeighborhoodFocus = (id: string) => {
    if (id && current)
      dispatchWalk({
        type: 'push',
        step: {
          doc: current.id,
          center: id,
          name: model?.entities.find(e => e.id === id)?.name ?? id,
        },
      });
  };
  const sidebar = useSidebar({ readSidebarWidth });
  const { compact, closeWorkspace } = sidebar;
  const workspaceEvents = useWorkspaceEvents({
    docsRef,
    setProjects,
    setDocs,
    currentRef,
    sourceRef,
    setCurrent,
    setSource,
    setSelected,
    setSelectedEdge,
    setNeighborhoodFocus,
    setSuggestions,
    setTrashVersion,
    setStatus,
    getOpen: () => openDocument,
    setMessage,
  });
  const { refresh } = workspaceEvents;
  const fileNavigation = useFileNavigation({
    setMessage,
    current,
    compact,
    closeWorkspace,
    source,
    getLeaveCurrent: () => leaveCurrent,
    setCurrent,
    setSource,
    setNeighborhoodFocus,
    setSelected,
    setSelectedEdge,
    setSearch,
    tab,
    setTab,
    currentRef,
    sourceRef,
    getDraftOf: () => draftOf,
  });
  const { openDocument } = fileNavigation;
  const validationState = useValidation({
    current,
    source,
    tab,
  });
  const { model, editorIssuesRef } = validationState;
  const lineageState = useLineage({
    model,
    current,
    docs,
    tab,
    setTab,
    openDocument,
    parsedDoc,
    dispatchWalk,
    setSelected,
  });

  const groupingOverview = useMemo(
    () =>
      model ? modelOverview(model.entities, model.edges, model.name, false, grouping.value) : null,
    [model, grouping.value],
  );
  const entity = model?.entities.find(e => e.id === selected);
  const references = useReferences({
    docs,
    current,
    parsedDoc,
    entity,
    model,
    selectedEdge,
    docsRef,
  });
  const { relationship, projectModels } = references;
  const walkNavigation = useWalkNavigation({
    walk,
    current,
    docsRef,
    openDocument,
    setTab,
    setSelected,
    setSelectedEdge,
    dispatchWalk,
    neighborhoodFocus,
    model,
    selected,
    relationship,
    setNeighborhoodFocus,
    setSearch,
  });

  const itemEditing = useItemEditing({
    projects,
    current,
    source,
    model,
    docsRef,
    projectModels,
    parsedDoc,
    docs,
    currentRef,
    setCurrent,
    setSource,
    setDocs,
    setMessage,
    refresh,
    openDocument,
    setTab,
    sourceEditor,
    kpiProject,
    entity,
    relationship,
  });
  const { latest, currentIsRdf, draftOf, setAdding, setRdfAdding, setHistoryPath, setScmProject } =
    itemEditing;
  const inspector = useInspector({
    tab,
    entity,
    relationship,
    setSelected,
    setSelectedEdge,
    model,
    latest,
  });

  function selectEntity(id: string) {
    setSelected(id);
    setSelectedEdge('');
    if (tab === 'neighborhood') {
      setNeighborhoodFocus(id);
      setSearch('');
    }
  }
  const examples = useExamples({
    getLeaveCurrent: () => leaveCurrent,
    setBusy,
    setMessage,
    refresh,
    setCurrent,
    setSource,
    setNeighborhoodFocus,
    compact,
    closeWorkspace,
    setSelected,
    setSelectedEdge,
    setSearch,
    setTab,
  });

  const saving = useSaving({
    current,
    source,
    currentRef,
    editorIssuesRef,
    docsRef,
    setDocs,
    setCurrentState,
    setStale,
    setMessage,
    projects,
    sourceRef,
    setSource,
    draftOf,
  });
  const { autosave, leaveCurrent } = saving;
  const imports = useImport({
    setPendingImport,
    refresh,
    setCurrent,
    setSource,
    setNeighborhoodFocus,
    compact,
    closeWorkspace,
    setSelected,
    setSelectedEdge,
    setSearch,
    setTab,
    setMessage,
    leaveCurrent,
  });

  const projectActions = useProjectActions({
    projects,
    setRenaming,
    setMoving,
    setDeleteTarget,
    setScmProject,
    setHistoryPath,
    setTab,
    compact,
    closeWorkspace,
    setImporting,
    docsRef,
    refresh,
    setMessage,
    openDocument,
    importConflict,
    setImportConflict,
    deleted,
    setDeleted,
  });

  function download() {
    const exported = exportDocument(source, current?.filename ?? 'ontology.ossie.yaml');
    const url = URL.createObjectURL(exported.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exported.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const creationMenu = useNewItems({ model, current, currentIsRdf, setAdding, setRdfAdding });

  return {
    sample,
    clampSidebarWidth,
    sidebar,
    stale,
    current,
    source,
    setStale,
    saving,
    docsRef,
    setCurrent,
    setSource,
    deleteTarget,
    projects,
    setDeleteTarget,
    sourceRef,
    setDeleted,
    workspaceEvents,
    trashOpen,
    trashVersion,
    setTrashOpen,
    renaming,
    setRenaming,
    moving,
    setMoving,
    currentRef,
    importConflict,
    setImportConflict,
    projectActions,
    deleted,
    itemEditing,
    setSelected,
    setSelectedEdge,
    metrics,
    docs,
    setTab,
    setTrashVersion,
    showValidation,
    setShowValidation,
    validationState,
    sourceEditor,
    definition,
    setDefinition,
    importing,
    setImporting,
    importInto,
    importInput,
    pendingImport,
    setPendingImport,
    imports,
    tab,
    fileNavigation,
    suggestions,
    examples,
    busy,
    status,
    creationMenu,
    download,
    lineageState,
    setSearch,
    walkNavigation,
    neighborhoodFocus,
    selected,
    references,
    groupingOverview,
    grouping,
    search,
    inspector,
    selectEntity,
    selectedEdge,
    walk,
    dispatchWalk,
    entity,
  };
}

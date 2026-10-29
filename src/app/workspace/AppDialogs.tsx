/** Presentation and event handling for app dialogs. */
import { useGitSetup } from '../scm/GitSetup';
import React from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import type { ImportDraft } from '../validation/ValidationPanel';
import { ImportRepair, ValidationPanel } from '../validation/ValidationPanel';
import { ShaclCheck } from '../validation/ShaclCheck';
import type { Issue } from '../../shared/validation/diagnostics';
import type { Saved } from '../edit/ItemEditor';
import type { Choices, ItemKind, Path } from '../../shared/edit/item-model';
import type { CodeEditorHandle } from '../editor/CodeEditor';
import type { Entity, Relationship } from '../../shared/core/model';
import type { DeleteTarget } from '../projects/DeleteDialog';
import { ImportDialog } from '../projects/ImportDialog';
import { Modal } from '../projects/Modal';
import type { Deleted, Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import { FileDialogs } from './FileDialogs';
import { RdfItemDialogs } from './RdfItemDialogs';
import { SaveDialogs } from './SaveDialogs';
import { StructuredItemDialogs } from './StructuredItemDialogs';
import type { ItemTarget, RdfTarget } from './types';

type Props = {
  stale: { current: string | null; currentHash: string | null } | null;
  current: Doc | null;
  source: string;
  setStale: React.Dispatch<React.SetStateAction<{ current: string | null; currentHash: string | null } | null>>;
  autosave: {
    state: AutosaveState;
    flush(): Promise<void>;
    resolved: (hash: string | null, text: string) => void;
    cancel: () => void;
  };
  docsRef: React.RefObject<Map<string, Doc>>;
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  deleteTarget: DeleteTarget | null;
  projects: ProjectInfo[];
  setDeleteTarget: React.Dispatch<React.SetStateAction<DeleteTarget | null>>;
  sourceRef: React.RefObject<string>;
  setDeleted: React.Dispatch<React.SetStateAction<Deleted | null>>;
  refresh: () => Promise<Doc[]>;
  trashOpen: boolean;
  trashVersion: number;
  setTrashOpen: React.Dispatch<React.SetStateAction<boolean>>;
  renaming: ProjectInfo | null;
  setRenaming: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  exporting: ProjectInfo | null;
  setExporting: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  moving: { project: string; path: string } | null;
  setMoving: React.Dispatch<React.SetStateAction<{ project: string; path: string } | null>>;
  currentRef: React.RefObject<Doc | null>;
  importConflict: {
    project: ProjectInfo;
    files: { path: string; source: string }[];
    conflicts: string[];
  } | null;
  setImportConflict: React.Dispatch<
    React.SetStateAction<{
      project: ProjectInfo;
      files: { path: string; source: string }[];
      conflicts: string[];
    } | null>
  >;
  importIntoProject: (files: { path: string; source: string }[], onConflict?: 'replace' | 'keep-both' | undefined, slug?: string | undefined) => Promise<void>;
  deleted: Deleted | null;
  undoDelete: () => Promise<void>;
  editing: ItemTarget | null;
  docText: (id: string) => string;
  projectDocsOf: (id: string) => Doc[];
  choicesFor: (id: string) => Choices;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  itemHints: React.RefObject<Record<string, Record<string, string>>>;
  applySaved: (saved: Saved[], label: string) => void;
  setAdding: React.Dispatch<
    React.SetStateAction<{
      docId: string;
      kind?: ItemKind | undefined;
      owner?: Path | undefined;
      preset?: Record<string, any> | undefined;
    } | null>
  >;
  setDeleting: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  openSourceAt: (id: string, line: number) => void;
  adding: {
    docId: string;
    kind?: ItemKind | undefined;
    owner?: Path | undefined;
    preset?: Record<string, any> | undefined;
  } | null;
  documentOf: (id: string) => any;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  deleting: ItemTarget | null;
  rdfEditing: RdfTarget | null;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  setRdfDeleting: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  rdfAdding: string | null;
  setRdfAdding: React.Dispatch<React.SetStateAction<string | null>>;
  rdfDeleting: RdfTarget | null;
  wizard: boolean | KpiSummary;
  kpiProject: string | null;
  selectedProject: string;
  docs: Doc[];
  kpis: KpiSummary[];
  setWizard: React.Dispatch<React.SetStateAction<boolean | KpiSummary>>;
  setSelectedKpi: React.Dispatch<React.SetStateAction<string>>;
  setTab: (next: string) => void;
  committing: boolean;
  setCommitting: React.Dispatch<React.SetStateAction<boolean>>;
  setGitVersion: React.Dispatch<React.SetStateAction<number>>;
  setTrashVersion: React.Dispatch<React.SetStateAction<number>>;
  showValidation: boolean;
  setShowValidation: React.Dispatch<React.SetStateAction<boolean>>;
  validateAsShippedVersion: () => void;
  validation:
    | {
        issues: Issue[];
        valid: boolean;
        model:
          | { kind: string; name: any; entities: Entity[]; edges: Relationship[]; issues: Issue[] }
          | {
              kind: string;
              layout: string | undefined;
              name: any;
              entities: Entity[];
              edges: Relationship[];
              issues: Issue[];
              document: any;
            };
      }
    | { issues: Issue[]; valid: boolean; model: null };
  sourceEditor: React.RefObject<CodeEditorHandle | null>;
  definition: { title: string; value: unknown } | null;
  setDefinition: React.Dispatch<React.SetStateAction<{ title: string; value: unknown } | null>>;
  importing: { project?: string | undefined } | null;
  setImporting: React.Dispatch<React.SetStateAction<{ project?: string | undefined } | null>>;
  importInto: React.RefObject<string>;
  importInput: React.RefObject<HTMLInputElement | null>;
  pendingImport: ImportDraft[] | null;
  setPendingImport: React.Dispatch<React.SetStateAction<ImportDraft[] | null>>;
  commitImports: (drafts: ImportDraft[]) => Promise<void>;
};
/** Renders app dialogs. */
export function AppDialogs({
  stale,
  current,
  source,
  setStale,
  autosave,
  docsRef,
  setCurrent,
  setSource,
  setMessage,
  deleteTarget,
  projects,
  setDeleteTarget,
  sourceRef,
  setDeleted,
  refresh,
  trashOpen,
  trashVersion,
  setTrashOpen,
  renaming,
  setRenaming,
  exporting,
  setExporting,
  moving,
  setMoving,
  currentRef,
  importConflict,
  setImportConflict,
  importIntoProject,
  deleted,
  undoDelete,
  editing,
  docText,
  projectDocsOf,
  choicesFor,
  setEditing,
  itemHints,
  applySaved,
  setAdding,
  setDeleting,
  openSourceAt,
  adding,
  documentOf,
  setSelected,
  setSelectedEdge,
  deleting,
  rdfEditing,
  setRdfEditing,
  setRdfDeleting,
  rdfAdding,
  setRdfAdding,
  rdfDeleting,
  wizard,
  kpiProject,
  selectedProject,
  docs,
  kpis,
  setWizard,
  setSelectedKpi,
  setTab,
  committing,
  setCommitting,
  setGitVersion,
  setTrashVersion,
  showValidation,
  setShowValidation,
  validation,
  validateAsShippedVersion,
  sourceEditor,
  definition,
  setDefinition,
  importing,
  setImporting,
  importInto,
  importInput,
  pendingImport,
  setPendingImport,
  commitImports,
}: Props) {
  const openGitSetup = useGitSetup();
  function handleValidationPanelLocate(issue: import('../../shared/validation/diagnostics').Issue) {
    setShowValidation(false);
    setTab('source');
    setTimeout(() => {
      sourceEditor.current?.locate(issue);
    }, 0);
  }

  function handleImportDialogPick(project: string | null) {
    importInto.current = project ?? '';
    setImporting(null);
    requestAnimationFrame(() => importInput.current?.click());
  }

  return (
    <>
      <FileDialogs
        stale={stale}
        current={current}
        source={source}
        setStale={setStale}
        autosave={autosave}
        docsRef={docsRef}
        setCurrent={setCurrent}
        setSource={setSource}
        setMessage={setMessage}
        deleteTarget={deleteTarget}
        projects={projects}
        setDeleteTarget={setDeleteTarget}
        sourceRef={sourceRef}
        setDeleted={setDeleted}
        refresh={refresh}
        selectedProject={selectedProject}
        trashOpen={trashOpen}
        trashVersion={trashVersion}
        setTrashOpen={setTrashOpen}
        renaming={renaming}
        setRenaming={setRenaming}
        exporting={exporting}
        setExporting={setExporting}
        moving={moving}
        setMoving={setMoving}
        currentRef={currentRef}
        importConflict={importConflict}
        setImportConflict={setImportConflict}
        importIntoProject={importIntoProject}
        deleted={deleted}
        undoDelete={undoDelete}
      />
      <StructuredItemDialogs
        editing={editing}
        docsRef={docsRef}
        docText={docText}
        projectDocsOf={projectDocsOf}
        choicesFor={choicesFor}
        setEditing={setEditing}
        itemHints={itemHints}
        applySaved={applySaved}
        setAdding={setAdding}
        setDeleting={setDeleting}
        openSourceAt={openSourceAt}
        adding={adding}
        documentOf={documentOf}
        current={current}
        setSelected={setSelected}
        setSelectedEdge={setSelectedEdge}
        deleting={deleting}
      />
      <RdfItemDialogs
        rdfEditing={rdfEditing}
        docsRef={docsRef}
        docText={docText}
        setRdfEditing={setRdfEditing}
        applySaved={applySaved}
        setRdfDeleting={setRdfDeleting}
        openSourceAt={openSourceAt}
        rdfAdding={rdfAdding}
        setRdfAdding={setRdfAdding}
        current={current}
        setSelected={setSelected}
        setSelectedEdge={setSelectedEdge}
        rdfDeleting={rdfDeleting}
        projectDocsOf={projectDocsOf}
      />
      <SaveDialogs
        wizard={wizard}
        kpiProject={kpiProject}
        docs={docs}
        kpis={kpis}
        setWizard={setWizard}
        setSelectedKpi={setSelectedKpi}
        setTab={setTab}
        setMessage={setMessage}
        refresh={refresh}
        committing={committing}
        current={current}
        projects={projects}
        itemHints={itemHints}
        source={source}
        setCommitting={setCommitting}
        setGitVersion={setGitVersion}
        setTrashVersion={setTrashVersion}
        currentRef={currentRef}
        autosave={autosave}
        setCurrent={setCurrent}
        setSource={setSource}
      />
      {showValidation && (source || current) && (
        <Modal
          title="Validation details"
          size="wide"
          onCancel={() => setShowValidation(false)}
          className="validation-details"
          footer={
            <button type="button" onClick={() => setShowValidation(false)}>
              Close
            </button>
          }
        >
          <ValidationPanel source={source} issues={validation.issues} onLocate={handleValidationPanelLocate} onValidateAsShippedVersion={validateAsShippedVersion} />
          {validation.model?.kind === 'SHACL' && current && <ShaclCheck shapes={current} shapesSource={source} projectDocs={docs} />}
        </Modal>
      )}
      {definition && (
        <Modal
          title={definition.title}
          size="wide"
          onCancel={() => setDefinition(null)}
          className="definition-dialog"
          footer={
            <button type="button" onClick={() => setDefinition(null)}>
              Close
            </button>
          }
        >
          <pre className="definition-json" aria-label="Definition">
            {JSON.stringify(definition.value, null, 2)}
          </pre>
        </Modal>
      )}
      {importing && (
        <ImportDialog
          projects={projects}
          selectedProject={selectedProject}
          initialProject={importing.project}
          onClose={() => setImporting(null)}
          onPick={handleImportDialogPick}
          onClone={() => {
            setImporting(null);
            openGitSetup({ kind: 'clone' });
          }}
        />
      )}
      {pendingImport && <ImportRepair initial={pendingImport} onCancel={() => setPendingImport(null)} onImport={commitImports} />}
    </>
  );
}

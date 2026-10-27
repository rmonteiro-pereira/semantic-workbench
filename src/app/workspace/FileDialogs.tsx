/** Presentation and event handling for file dialogs. */
import React from 'react';
import type { Deleted, Doc, ProjectInfo } from '../projects/api';
import type { AutosaveState } from '../projects/autosave';
import type { DeleteTarget } from '../projects/DeleteDialog';
import { DeleteDialog } from '../projects/DeleteDialog';
import { ExportDialog } from '../projects/ExportDialog';
import { ImportConflictDialog, MoveDialog, RenameDialog } from '../projects/ProjectDialogs';
import { StaleSaveDialog } from '../projects/StaleSave';
import { TrashDialog } from '../projects/Trash';
import { UndoToast } from '../projects/UndoToast';

type Props = {
  stale: { current: string | null; currentHash: string | null } | null;
  current: Doc | null;
  source: string;
  setStale: React.Dispatch<
    React.SetStateAction<{ current: string | null; currentHash: string | null } | null>
  >;
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
  importIntoProject: (
    files: { path: string; source: string }[],
    onConflict?: 'replace' | 'keep-both' | undefined,
    slug?: string | undefined,
  ) => Promise<void>;
  deleted: Deleted | null;
  undoDelete: () => Promise<void>;
};
/** Renders file dialogs. */
export function FileDialogs({
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
}: Props) {
  function handleStaleSaveDialogLoadCurrent() {
    if (stale == null || current == null) return;

    if (stale.current === null || stale.currentHash === null) return;
    autosave.resolved(stale.currentHash, stale.current);
    const doc = { ...current, source: stale.current, hash: stale.currentHash };
    docsRef.current.set(doc.id, doc);
    setCurrent(doc);
    setSource(doc.source);
    setStale(null);
    setMessage('Loaded the current file from disk.');
  }

  function handleStaleSaveDialogKeepMine() {
    if (stale == null) return;

    autosave.resolved(stale.currentHash, stale.current ?? '');
    setStale(null);
  }

  function handleDeleteDialogDeleted(entryIds: string[], undoUntil: string, label: string) {
    if (deleteTarget == null) return;

    // The user confirmed losing unsaved edits of a removed file: drop them before refreshing.
    const target = deleteTarget;
    if (
      current &&
      (target.kind === 'clear' ||
        (current.project === target.project &&
          (target.kind === 'project' || current.path === target.path)))
    ) {
      autosave.cancel();
      if (source !== current.source) setSource(current.source);
    }
    sourceRef.current = current?.source ?? '';
    setDeleteTarget(null);
    setDeleted({ entryIds, undoUntil, label });
    void refresh();
  }

  // Removing a subfolder project only unregisters it; its files stay on disk, so there is
  // nothing to undo and its unsaved edits stay as drafts.
  function handleProjectRemoved(label: string) {
    if (deleteTarget?.kind === 'project' && current?.project === deleteTarget.project)
      autosave.cancel();
    setDeleteTarget(null);
    setMessage(`Removed ${label} from the workspace. Its folder is unchanged.`);
    void refresh();
  }

  function handleRenameDialogDone(name: string) {
    setRenaming(null);
    setMessage(`Renamed the project to ${name}.`);
    void refresh();
  }

  function handleExportDialogDone(message: string) {
    setExporting(null);
    setMessage(message);
  }

  function handleMoveDialogDone(to: { project: string; path: string }) {
    if (moving == null) return;

    if (currentRef.current?.project === moving.project && currentRef.current.path === moving.path)
      autosave.cancel();
    setMoving(null);
    setMessage(`Moved ${moving.path} to ${projects.find(p => p.slug === to.project)?.name}.`);
    void refresh().then(d => {
      const doc = d.find(x => x.project === to.project && x.path === to.path);
      if (
        doc &&
        currentRef.current?.project === moving.project &&
        currentRef.current.path === moving.path
      ) {
        setCurrent(doc);
        setSource(doc.source);
      }
    });
  }

  return (
    <>
      {stale && current && (
        <StaleSaveDialog
          filename={current.path}
          mine={source}
          current={stale.current}
          onCancel={() => setStale(null)}
          onLoadCurrent={handleStaleSaveDialogLoadCurrent}
          onKeepMine={handleStaleSaveDialogKeepMine}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          target={deleteTarget}
          projects={projects}
          dirty={
            current && source !== current.source
              ? { project: current.project, path: current.path }
              : null
          }
          onCancel={() => setDeleteTarget(null)}
          onDeleted={handleDeleteDialogDeleted}
          onRemoved={handleProjectRemoved}
        />
      )}
      {trashOpen && (
        <TrashDialog
          version={trashVersion}
          onClose={() => {
            setTrashOpen(false);
            void refresh();
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          project={renaming}
          onClose={() => setRenaming(null)}
          onDone={handleRenameDialogDone}
        />
      )}
      {exporting && (
        <ExportDialog
          project={exporting}
          dirty={
            current && source !== current.source
              ? { project: current.project, path: current.path }
              : null
          }
          saveOpenFile={autosave.flush}
          onClose={() => setExporting(null)}
          onDone={handleExportDialogDone}
        />
      )}
      {moving && (
        <MoveDialog
          project={moving.project}
          path={moving.path}
          projects={projects}
          onClose={() => setMoving(null)}
          onDone={handleMoveDialogDone}
        />
      )}
      {importConflict && (
        <ImportConflictDialog
          project={importConflict.project}
          conflicts={importConflict.conflicts}
          onClose={() => setImportConflict(null)}
          onChoose={choice => void importIntoProject(importConflict.files, choice)}
        />
      )}
      {deleted && (
        <UndoToast
          deleted={deleted}
          onUndo={() => void undoDelete()}
          onExpire={() => setDeleted(null)}
        />
      )}
    </>
  );
}

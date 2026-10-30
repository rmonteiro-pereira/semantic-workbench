/** Handles project tree actions, import conflicts, and deletion recovery. */
import React from 'react';
import type { Deleted, Doc, ProjectInfo } from '../../projects/api';
import { api } from '../../projects/api';
import type { DeleteTarget } from '../../projects/DeleteDialog';
import { type TreeAction } from '../../projects/Sidebar';

type Options = {
  projects: ProjectInfo[];
  setRenaming: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  setExporting: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  setMoving: React.Dispatch<React.SetStateAction<{ project: string; path: string } | null>>;
  setDeleteTarget: React.Dispatch<React.SetStateAction<DeleteTarget | null>>;
  selectedProject: string;
  selectProject: (project: string) => boolean;
  setHistoryPath: (path: string | undefined, project?: string) => void;
  setTab: (next: string) => void;
  compact: boolean;
  closeWorkspace: () => void;
  setImporting: React.Dispatch<React.SetStateAction<{ project?: string | undefined } | null>>;
  setCreatingFile: React.Dispatch<React.SetStateAction<string | null>>;
  docsRef: React.RefObject<Map<string, Doc>>;
  refresh: () => Promise<Doc[]>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  openDocument: (doc: Doc) => boolean;
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
  deleted: Deleted | null;
  setDeleted: React.Dispatch<React.SetStateAction<Deleted | null>>;
};
// A new mapping opens in the Mappings view; every other kind opens in the model explorer.
function tabForNewFile(doc: Doc) {
  return doc.filename.endsWith('.mapping.yaml') ? 'mappings' : 'fullgraph';
}
/** Manages project actions. */
export function useProjectActions({
  projects,
  setRenaming,
  setExporting,
  setMoving,
  setDeleteTarget,
  selectedProject,
  selectProject,
  setHistoryPath,
  setTab,
  compact,
  closeWorkspace,
  setImporting,
  setCreatingFile,
  docsRef,
  refresh,
  setMessage,
  openDocument,
  importConflict,
  setImportConflict,
  deleted,
  setDeleted,
}: Options) {
  function treeAction(treeEvent: TreeAction) {
    const project = projects.find(p => p.slug === treeEvent.project);
    if (!project) return;
    if (treeEvent.action === 'rename') setRenaming(project);
    else if (treeEvent.action === 'export') setExporting(project);
    else if (treeEvent.action === 'move') setMoving({ project: treeEvent.project, path: treeEvent.path });
    else if (treeEvent.action === 'delete-file') setDeleteTarget({ kind: 'file', project: treeEvent.project, path: treeEvent.path });
    else if (treeEvent.action === 'delete-project') setDeleteTarget({ kind: 'project', project: treeEvent.project });
    else if (treeEvent.action === 'history') {
      if (treeEvent.project !== selectedProject) selectProject(treeEvent.project);
      setHistoryPath(treeEvent.path, treeEvent.project);
      setTab('scm');
      if (compact) closeWorkspace();
    } else if (treeEvent.action === 'new-file') setCreatingFile(treeEvent.project);
    else if (treeEvent.action === 'gitignore') void editGitignore(treeEvent.project);
    else {
      setImporting({ project: treeEvent.project });
    }
  }
  // `.gitignore` opens in Source; it is created empty when the project has none.
  async function editGitignore(slug: string) {
    let document = docsRef.current.get(`${slug}/.gitignore`);
    if (!document) {
      try {
        await api.save(slug, '.gitignore', null, '');
        document = (await refresh()).find(x => x.id === `${slug}/.gitignore`);
      } catch (error) {
        setMessage((error as Error).message);
        return;
      }
    }
    if (document && openDocument(document)) setTab('source');
  }
  async function importIntoProject(files: { path: string; source: string }[], onConflict?: 'replace' | 'keep-both', slug?: string) {
    const project = projects.find(p => p.slug === (slug ?? importConflict?.project.slug));
    if (!project) return;
    try {
      const response = await api.importInto(project.slug, files, onConflict);
      setImportConflict(null);
      await refresh();
      const fileCount = response.written.length;
      setMessage(`Imported ${fileCount} file${fileCount === 1 ? '' : 's'} into ${project.name}.`);
    } catch (error: any) {
      if (error.status === 409 && error.body?.conflicts) setImportConflict({ project, files, conflicts: error.body.conflicts });
      else {
        setImportConflict(null);
        setMessage(error.message);
      }
    }
  }
  // Saves a new file through the import route, which refuses a name already taken, then opens it.
  async function createFile(slug: string, file: { path: string; source: string }) {
    try {
      await api.importInto(slug, [file]);
    } catch (error: any) {
      if (error.status === 409 && error.body?.conflicts) throw new Error(`${file.path} already exists in this project. Choose another name.`);
      throw error;
    }
    const created = (await refresh()).find(doc => doc.id === `${slug}/${file.path}`);
    setCreatingFile(null);
    if (!created) return;
    openDocument(created);
    setTab(tabForNewFile(created));
    setMessage(`Created ${file.path}.`);
  }
  async function undoDelete() {
    const undone = deleted;
    setDeleted(null);
    if (!undone) return;
    try {
      for (const id of undone.entryIds) await api.undo(id);
      await refresh();
      setMessage(`Restored ${undone.label}.`);
    } catch (error) {
      await refresh().catch(() => {});
      setMessage(`${(error as Error).message} Open Trash to restore it.`);
    }
  }

  return { importIntoProject, createFile, undoDelete, treeAction };
}

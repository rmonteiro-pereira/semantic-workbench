/** Handles project tree actions, import conflicts, and deletion recovery. */
import React from 'react';
import type { Deleted, Doc, ProjectInfo } from '../projects/api';
import { api } from '../projects/api';
import type { DeleteTarget } from '../projects/DeleteDialog';
import { type TreeAction } from '../projects/Sidebar';

type Options = {
  projects: ProjectInfo[];
  setRenaming: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  setExporting: React.Dispatch<React.SetStateAction<ProjectInfo | null>>;
  setMoving: React.Dispatch<React.SetStateAction<{ project: string; path: string } | null>>;
  setDeleteTarget: React.Dispatch<React.SetStateAction<DeleteTarget | null>>;
  setScmProject: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryPath: React.Dispatch<React.SetStateAction<string | undefined>>;
  setTab: (next: string) => void;
  compact: boolean;
  closeWorkspace: () => void;
  setImporting: React.Dispatch<React.SetStateAction<{ project?: string | undefined } | null>>;
  docsRef: React.RefObject<Map<string, Doc>>;
  refresh: () => Promise<Doc[]>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  openDocument: (d: Doc) => boolean;
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
/** Manages project actions. */
export function useProjectActions({
  projects,
  setRenaming,
  setExporting,
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
}: Options) {
  function treeAction(a: TreeAction) {
    const project = projects.find(p => p.slug === a.project);
    if (!project) return;
    if (a.action === 'rename') setRenaming(project);
    else if (a.action === 'export') setExporting(project);
    else if (a.action === 'move') setMoving({ project: a.project, path: a.path });
    else if (a.action === 'delete-file')
      setDeleteTarget({ kind: 'file', project: a.project, path: a.path });
    else if (a.action === 'delete-project')
      setDeleteTarget({ kind: 'project', project: a.project });
    else if (a.action === 'history') {
      setScmProject(a.project);
      setHistoryPath(a.path);
      setTab('scm');
      if (compact) closeWorkspace();
    } else if (a.action === 'gitignore') void editGitignore(a.project);
    else {
      setImporting({ project: a.project });
    }
  }
  // `.gitignore` opens in Source; it is created empty when the project has none.
  async function editGitignore(slug: string) {
    let document = docsRef.current.get(`${slug}/.gitignore`);
    if (!document) {
      try {
        await api.save(slug, '.gitignore', null, '');
        document = (await refresh()).find(x => x.id === `${slug}/.gitignore`);
      } catch (e) {
        setMessage((e as Error).message);
        return;
      }
    }
    if (document && openDocument(document)) setTab('source');
  }
  async function importIntoProject(
    files: { path: string; source: string }[],
    onConflict?: 'replace' | 'keep-both',
    slug?: string,
  ) {
    const project = projects.find(p => p.slug === (slug ?? importConflict?.project.slug));
    if (!project) return;
    try {
      const response = await api.importInto(project.slug, files, onConflict);
      setImportConflict(null);
      await refresh();
      const fileCount = response.written.length;
      setMessage(`Imported ${fileCount} file${fileCount === 1 ? '' : 's'} into ${project.name}.`);
    } catch (e: any) {
      if (e.status === 409 && e.body?.conflicts)
        setImportConflict({ project, files, conflicts: e.body.conflicts });
      else {
        setImportConflict(null);
        setMessage(e.message);
      }
    }
  }
  async function undoDelete() {
    const documentValue = deleted;
    setDeleted(null);
    if (!documentValue) return;
    try {
      for (const id of documentValue.entryIds) await api.undo(id);
      await refresh();
      setMessage(`Restored ${documentValue.label}.`);
    } catch (e) {
      await refresh().catch(() => {});
      setMessage(`${(e as Error).message} Open Trash to restore it.`);
    }
  }

  return { importIntoProject, undoDelete, treeAction };
}

/** Opens documents and restores unsaved drafts without discarding current edits. */
import { apiFetch } from '../projects/api';
import React from 'react';
import { firstDocumentOfProject } from '../core/project-scope';
import { validateInput } from '../validation/input';
import { scm as scmApi, type Doc } from '../projects/api';
import { useActionRecorder } from './ActionHistoryContext';

/**
 * Opening a document leaves the phone drawer open, or the open tab as it is, only when the caller
 * says so.
 */
export type OpenOptions = { keepDrawer?: boolean; keepTab?: boolean };

type Options = {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  compact: boolean;
  closeWorkspace: () => void;
  getLeaveCurrent: () => () => Promise<void>;
  setCurrent: (next: import('../projects/api').Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setNeighborhoodFocus: (id: string) => void;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  tab: string;
  setTab: (next: string) => void;
  currentRef: React.RefObject<import('../projects/api').Doc | null>;
  sourceRef: React.RefObject<string>;
  getDraftOf: () => React.RefObject<{ project: string; path: string } | null>;
  docsRef: React.RefObject<Map<string, Doc>>;
  setChosenProject: (project: string) => void;
};
/** Manages file navigation. */
export function useFileNavigation({
  setMessage,
  compact,
  closeWorkspace,
  getLeaveCurrent,
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
  getDraftOf,
  docsRef,
  setChosenProject,
}: Options) {
  const recorder = useActionRecorder();
  // The project the person opened though it has no definitions; the canvas explains it.
  const [emptyProjectSlug, setEmptyProjectSlug] = React.useState<string | null>(null);
  /**
   * Opens a document. A person's choice closes the phone drawer behind it; the first file the app
   * opens by itself at start-up leaves the drawer as the person has it.
   */
  function openDocument(d: Doc, options: OpenOptions = {}): boolean {
    const closeDrawerUnlessKept = () => {
      if (compact && !options.keepDrawer) closeWorkspace();
    };
    setMessage('');
    setEmptyProjectSlug(null);
    // The refs hold what is open now, also when a delete or a disk change has just replaced it.
    const shown = currentRef.current;
    if (shown?.id === d.id) {
      closeDrawerUnlessKept();
      return true;
    }
    recorder.noteCommand('open file', {
      undo: () => showDocument(shown?.id ?? null),
      redo: () => showDocument(d.id),
    });
    if (shown && sourceRef.current !== shown.source) void getLeaveCurrent()();
    setCurrent(d);
    setSource(d.source);
    void restoreDraft(d);
    setNeighborhoodFocus('');
    closeDrawerUnlessKept();
    setSelected('');
    setSelectedEdge('');
    setSearch('');
    if (
      !options.keepTab &&
      tab !== 'neighborhood' &&
      validateInput(d.source, d.filename).model?.kind === 'Ossie mappings'
    )
      setTab('mappings');
    return true;
  }
  /**
   * Switches the app to another project: it opens the project's first file, or shows the
   * project's empty state when it has none.
   */
  function selectProject(project: string) {
    const first = firstDocumentOfProject([...docsRef.current.values()], project);
    if (first) return openDocument(first);
    const shown = currentRef.current;
    recorder.noteCommand('select project', {
      undo: () => showDocument(shown?.id ?? null),
      redo: () => showDocument(null),
    });
    closeDocument(project);
    return true;
  }
  /**
   * Leaves the open file without opening another, for a project that has no definitions to show.
   * Unsaved edits are written first, as when another file opens. The canvas then explains the
   * empty project named by `emptyProject`, which becomes the selected project.
   */
  function closeDocument(emptyProject: string) {
    setEmptyProjectSlug(emptyProject);
    setChosenProject(emptyProject);
    const shown = currentRef.current;
    if (shown && sourceRef.current !== shown.source) void getLeaveCurrent()();
    setMessage('');
    setCurrent(null);
    setSource('');
    setNeighborhoodFocus('');
    setSelected('');
    setSelectedEdge('');
    setSearch('');
    if (compact) closeWorkspace();
  }
  // Back and Forward bring a file back as it is now, without the resets a person's choice does.
  function showDocument(id: string | null) {
    const target = id ? docsRef.current.get(id) : null;
    if (id && !target) return;
    const shown = currentRef.current;
    if (shown && sourceRef.current !== shown.source) void getLeaveCurrent()();
    setMessage('');
    setEmptyProjectSlug(null);
    setCurrent(target ?? null);
    setSource(target?.source ?? '');
    if (target) void restoreDraft(target);
  }
  // A draft kept for this file (invalid or not yet saved text) comes back when the file opens.
  async function restoreDraft(d: Doc) {
    try {
      const project = encodeURIComponent(d.project);
      const path = d.path.split('/').map(encodeURIComponent).join('/');
      const response = await apiFetch(`/api/drafts/${project}/${path}`);
      if (!response.ok) return;
      const draft = await response.json();
      if (
        currentRef.current?.id === d.id &&
        sourceRef.current === d.source &&
        typeof draft.text === 'string'
      ) {
        getDraftOf().current = { project: d.project, path: d.path };
        if (draft.text === d.source) {
          void scmApi.deleteDraft(d.project, d.path).catch(() => {});
          return;
        }
        setSource(draft.text);
        setMessage(`Restored unsaved edits to ${d.path} from a draft.`);
      }
    } catch {}
  }

  return { openDocument, closeDocument, selectProject, emptyProjectSlug };
}

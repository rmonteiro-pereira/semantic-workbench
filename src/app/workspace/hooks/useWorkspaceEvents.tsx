/** Refreshes the local workspace and responds to server change notifications. */
import React, { useEffect, useRef, useState } from 'react';
import type { ProjectInfo, Suggestion, WorkspaceStatus } from '../../projects/api';
import { api, loadWorkspace, type Doc } from '../../projects/api';
import { firstDocumentOfProject } from '../../../shared/core/project-scope';
import { useEvents } from '../../projects/useEvents';
import type { OpenOptions } from './useFileNavigation';

type Options = {
  docsRef: React.RefObject<Map<string, Doc>>;
  setProjects: (projects: ProjectInfo[]) => void;
  setDocs: React.Dispatch<React.SetStateAction<Doc[]>>;
  currentRef: React.RefObject<Doc | null>;
  sourceRef: React.RefObject<string>;
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  setTrashVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatus: React.Dispatch<React.SetStateAction<WorkspaceStatus | null>>;
  getOpen: () => (d: Doc, options?: OpenOptions) => boolean;
  /** Shows the empty state of a project that has no files. */
  getCloseDocument: () => (project: string) => void;
  /** The selected project, resolved against the projects loaded last. */
  getSelectedProject: () => string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
};
/** Manages workspace events. */
export function useWorkspaceEvents({
  docsRef,
  setProjects,
  setDocs,
  currentRef,
  sourceRef,
  setCurrent,
  setSource,
  setSuggestions,
  setTrashVersion,
  setStatus,
  getOpen,
  getCloseDocument,
  getSelectedProject,
  setMessage,
}: Options) {
  // Refetch the folder store on startup and whenever the server reports a change.
  const refreshing = useRef<Promise<Doc[]> | null>(null);
  // The file a fallback or the start-up opens: the first of the selected project, never another's.
  function showProjectStart(documents: Doc[], options?: OpenOptions) {
    const project = getSelectedProject();
    const first = firstDocumentOfProject(documents, project);
    if (first) getOpen()(first, options);
    else if (project) getCloseDocument()(project);
    else {
      setCurrent(null);
      setSource('');
    }
  }
  const again = useRef(false);
  async function refresh(): Promise<Doc[]> {
    if (refreshing.current) {
      again.current = true;
      return refreshing.current;
    }
    const run = (async () => {
      try {
        const loaded = await loadWorkspace(docsRef.current);
        docsRef.current = new Map(loaded.docs.map(d => [d.id, d]));
        setProjects(loaded.projects);
        setDocs(loaded.docs);
        // An open file that changed on disk follows the disk unless it has unsaved edits.
        const openDocument = currentRef.current;
        const fresh = openDocument && docsRef.current.get(openDocument.id);
        if (openDocument && fresh && fresh.hash !== openDocument.hash && sourceRef.current === openDocument.source) {
          setCurrent(fresh);
          setSource(fresh.source);
        }
        // Keep unsaved edits when the open file disappears from the workspace.
        if (openDocument && !fresh && sourceRef.current === openDocument.source) {
          // The view stays as it is: the file left is replaced, not chosen.
          showProjectStart(loaded.docs, { keepTab: true });
        }
        api
          .suggestions()
          .then(setSuggestions)
          .catch(() => {});
        return loaded.docs;
      } finally {
        refreshing.current = null;
        if (again.current) {
          again.current = false;
          void refresh();
        }
      }
    })();
    refreshing.current = run;
    return run;
  }
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [gitVersion, setGitVersion] = useState(0);
  useEvents(event => {
    if (event === 'trash') setTrashVersion(v => v + 1);
    const gitChanged = ['git', 'files', 'resync', 'identity', 'published'].includes(event);
    if (gitChanged) setGitVersion(v => v + 1);
    // The banner and commit checks read the identity from the status, so reread it.
    if (event === 'identity' || event === 'projects' || event === 'resync')
      api
        .status()
        .then(setStatus)
        .catch(() => {});
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void refresh().catch(() => {});
    }, 80);
  });
  useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => {});
    refresh()
      .then(d => {
        showProjectStart(d, { keepDrawer: true });
      })
      .catch(() => setMessage('Cannot reach local API'));
  }, []);

  return { refresh, setGitVersion, gitVersion };
}

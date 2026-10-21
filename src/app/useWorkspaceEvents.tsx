/** Refreshes the local workspace and responds to server change notifications. */
import React, { useEffect, useRef, useState } from 'react';
import type { ProjectInfo, Suggestion, WorkspaceStatus } from '../projects/api';
import { api, loadWorkspace, type Doc } from '../projects/api';
import { useEvents } from '../projects/useEvents';

type Options = {
  docsRef: React.RefObject<Map<string, Doc>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectInfo[]>>;
  setDocs: React.Dispatch<React.SetStateAction<Doc[]>>;
  currentRef: React.RefObject<Doc | null>;
  sourceRef: React.RefObject<string>;
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  setNeighborhoodFocus: (id: string) => void;
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  setTrashVersion: React.Dispatch<React.SetStateAction<number>>;
  setStatus: React.Dispatch<React.SetStateAction<WorkspaceStatus | null>>;
  getOpen: () => (d: Doc) => boolean;
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
  setSelected,
  setSelectedEdge,
  setNeighborhoodFocus,
  setSuggestions,
  setTrashVersion,
  setStatus,
  getOpen,
  setMessage,
}: Options) {
  // Refetch the folder store on startup and whenever the server reports a change.
  const refreshing = useRef<Promise<Doc[]> | null>(null);
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
        if (
          openDocument &&
          fresh &&
          fresh.hash !== openDocument.hash &&
          sourceRef.current === openDocument.source
        ) {
          setCurrent(fresh);
          setSource(fresh.source);
        }
        // Keep unsaved edits when the open file disappears from the workspace.
        if (openDocument && !fresh && sourceRef.current === openDocument.source) {
          const next = loaded.docs[0] ?? null;
          setCurrent(next);
          setSource(next?.source ?? '');
          setSelected('');
          setSelectedEdge('');
          setNeighborhoodFocus('');
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
    if (event === 'git' || event === 'files' || event === 'resync') setGitVersion(v => v + 1);
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
        if (d[0]) getOpen()(d[0]);
      })
      .catch(() => setMessage('Cannot reach local API'));
  }, []);

  return { refresh, setGitVersion, gitVersion };
}

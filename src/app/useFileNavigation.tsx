/** Opens documents and restores unsaved drafts without discarding current edits. */
import { apiFetch } from '../projects/api';
import React from 'react';
import { validateInput } from '../input';
import { scm as scmApi, type Doc } from '../projects/api';

type Options = {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  current: import('../projects/api').Doc | null;
  compact: boolean;
  closeWorkspace: () => void;
  source: string;
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
};
/** Manages file navigation. */
export function useFileNavigation({
  setMessage,
  current,
  compact,
  closeWorkspace,
  source,
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
}: Options) {
  function openDocument(d: Doc): boolean {
    setMessage('');
    if (current?.id === d.id) {
      if (compact) closeWorkspace();
      return true;
    }
    if (current && source !== current.source) void getLeaveCurrent()();
    setCurrent(d);
    setSource(d.source);
    void restoreDraft(d);
    setNeighborhoodFocus('');
    if (compact) closeWorkspace();
    setSelected('');
    setSelectedEdge('');
    setSearch('');
    if (
      tab !== 'neighborhood' &&
      validateInput(d.source, d.filename).model?.kind === 'Ossie mappings'
    )
      setTab('mappings');
    return true;
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

  return { openDocument };
}

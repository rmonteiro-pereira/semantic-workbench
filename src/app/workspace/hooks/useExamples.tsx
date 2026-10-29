/** Loads example projects while preserving workspace navigation preferences. */
import React from 'react';
import { useProjectDomain } from '../../projects/useProjectDomain';
import { api, type Doc } from '../../projects/api';
import { exampleSet } from '../../../shared/projects/examples';

type Options = {
  getLeaveCurrent: () => () => Promise<void>;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refresh: () => Promise<Doc[]>;
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setNeighborhoodFocus: (id: string) => void;
  compact: boolean;
  closeWorkspace: () => void;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setTab: (next: string) => void;
};
/** Manages examples. */
export function useExamples({
  getLeaveCurrent,
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
}: Options) {
  const domainChoice = useProjectDomain();
  async function loadExample(id: string) {
    const set = exampleSet(id)!;
    await getLeaveCurrent()();
    setBusy(true);
    setMessage('Loading example documents…');
    try {
      const domain = await domainChoice.choose();
      const { slug } = await api.example(id, domain);
      const loaded = await refresh();
      const first = loaded.find(d => d.project === slug && d.path === set.files[0]) ?? loaded.find(d => d.project === slug);
      if (first) {
        setCurrent(first);
        setSource(first.source);
      }
      setNeighborhoodFocus('');
      if (compact) closeWorkspace();
      setSelected('');
      setSelectedEdge('');
      setSearch('');
      setTab(set.tab);
      setMessage(set.message);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { loadExample, domainDialog: domainChoice.dialog };
}

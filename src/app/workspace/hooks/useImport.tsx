/** Imports file batches and routes invalid documents to the repair dialog. */
import React from 'react';
import { useProjectDomain } from '../../projects/useProjectDomain';
import { validateInput } from '../../../shared/validation/input';
import type { Doc } from '../../projects/api';
import { api } from '../../projects/api';
import { type ImportDraft } from '../../validation/ValidationPanel';

type Options = {
  setPendingImport: React.Dispatch<React.SetStateAction<ImportDraft[] | null>>;
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
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  leaveCurrent: () => Promise<void>;
};
/** Manages import. */
export function useImport({
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
}: Options) {
  const domainChoice = useProjectDomain();
  // One import batch becomes one project.
  async function commitImports(drafts: ImportDraft[]) {
    let created;
    try {
      const domain = await domainChoice.choose();
      created = await api.importBatch(
        drafts.map(draft => ({ path: draft.filename, source: draft.source })),
        undefined,
        domain,
      );
    } catch (e) {
      const filenames = drafts.map(draft => draft.filename).join(', ');
      throw Error(`Could not save ${filenames}: ${(e as Error).message} ` + 'Nothing from this batch was imported; retry when ready.');
    }
    setPendingImport(null);
    // Keep the last file active so batch imports preserve the existing navigation behavior.
    const loaded = await refresh();
    const last = drafts[drafts.length - 1].filename;
    const opened = loaded.find(d => d.project === created.slug && d.path === last) ?? loaded.find(d => d.project === created.slug);
    if (opened) {
      setCurrent(opened);
      setSource(opened.source);
    }
    setNeighborhoodFocus('');
    if (compact) closeWorkspace();
    setSelected('');
    setSelectedEdge('');
    setSearch('');
    setTab('neighborhood');
    const fileCount = created.written.length;
    const imported = `Imported ${fileCount} file${fileCount === 1 ? '' : 's'} into project ${created.name}.`;
    // Without an identity the files are saved but not committed; the banner offers to set it.
    const notCommitted =
      created.commit && !created.commit.committed && created.commit.reason === 'no-identity' ? ' Not committed: set your Git identity with Set Git identity… in the banner above.' : '';
    setMessage(imported + notCommitted);
  }
  async function importFiles(files: File[]) {
    if (!files.length) return;
    if (compact) closeWorkspace();
    await leaveCurrent();
    try {
      const drafts = await Promise.all(files.map(async file => ({ filename: file.name, source: await file.text() })));
      if (drafts.some(d => !validateInput(d.source, d.filename).valid)) {
        setPendingImport(drafts);
        return;
      }
      await commitImports(drafts);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return { commitImports, importFiles, domainDialog: domainChoice.dialog };
}

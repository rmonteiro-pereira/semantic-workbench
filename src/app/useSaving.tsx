/** Coordinates automatic saves, conflict recovery, and drafts when leaving a file. */
import React, { useRef, useState } from 'react';
import type { Issue } from '../diagnostics';
import { validateInWorker } from '../editor/lint';
import { diffPatches, normalize } from '../editor/patch';
import type { Doc, ProjectInfo } from '../projects/api';
import { api, scm as scmApi, StaleSave } from '../projects/api';
import { saveStateLabel, useAutosave } from '../projects/autosave';
import { isGitignore } from '../scm/gitignore';

type Options = {
  current: Doc | null;
  source: string;
  currentRef: React.RefObject<Doc | null>;
  editorIssuesRef: React.RefObject<{
    id?: string | undefined;
    issues: Issue[];
    text?: string | undefined;
  } | null>;
  docsRef: React.RefObject<Map<string, Doc>>;
  setDocs: React.Dispatch<React.SetStateAction<Doc[]>>;
  setCurrentState: React.Dispatch<React.SetStateAction<Doc | null>>;
  setStale: React.Dispatch<
    React.SetStateAction<{ current: string | null; currentHash: string | null } | null>
  >;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  projects: ProjectInfo[];
  sourceRef: React.RefObject<string>;
  draftOf: React.RefObject<{ project: string; path: string } | null>;
};
/** Manages saving. */
export function useSaving({
  current,
  source,
  currentRef,
  editorIssuesRef,
  docsRef,
  setDocs,
  setCurrentState,
  setStale,
  setMessage,
  projects,
  sourceRef,
  draftOf,
}: Options) {
  // Automatic saving of valid edits: 1 s after the last edit, through the usual
  // hash-checked save with only the changed range; invalid text stays a server draft.
  const [gitBusy, setGitBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const itemHints = useRef<Record<string, Record<string, string>>>({});
  const autosave = useAutosave({
    file: current?.id ?? null,
    hash: current?.hash ?? null,
    saved: current?.source ?? '',
    text: source,
    gitBusy,
    validate: async text => {
      const document = currentRef.current;
      if (!document || isGitignore(document.filename)) return 0;
      const editorResult = editorIssuesRef.current;
      const errors = (issues: Issue[]) => issues.filter(i => i.severity === 'error').length;
      if (
        editorResult &&
        editorResult.id === document.id &&
        editorResult.text !== undefined &&
        editorResult.text === normalize(text)
      )
        return errors(editorResult.issues);
      return errors(await validateInWorker(text, document.filename));
    },
    save: r => {
      const documentValue = docsRef.current.get(r.file);
      if (!documentValue) return Promise.reject(Error('The file is no longer in the workspace.'));
      return api.save(
        documentValue.project,
        documentValue.path,
        r.baseHash,
        r.to,
        diffPatches(r.from, r.to),
      );
    },
    onSaved: (file, text, hash) => {
      const documentValue = docsRef.current.get(file);
      if (!documentValue) return;
      const next = { ...documentValue, source: text, hash };
      docsRef.current.set(file, next);
      setDocs(old => old.map(x => (x.id === file ? next : x)));
      if (currentRef.current?.id === file)
        setCurrentState(next); /* the server's file event refreshes the tree and counts */
    },
    isStale: e => e instanceof StaleSave,
    onStale: (file, e) => {
      if (currentRef.current?.id === file && e instanceof StaleSave)
        setStale({ current: e.currentSource, currentHash: e.currentHash });
    },
    onFailed: (_file, m) => setMessage(`Not saved: ${m}`),
  });
  const uncommitted = projects.find(p => p.slug === current?.project)?.changes ?? 0;
  const saveState = saveStateLabel(autosave.state, uncommitted);
  // Leaving a file or view: a due valid save is written first; invalid text stays a server draft
  // (no "Discard unsaved changes?" prompt; the draft is announced instead).
  async function leaveCurrent() {
    const documentValue = currentRef.current;
    if (!documentValue || sourceRef.current === documentValue.source) return;
    await autosave.flush();
    const now = currentRef.current;
    if (now && sourceRef.current !== now.source) {
      draftOf.current = { project: now.project, path: now.path };
      await scmApi.saveDraft(now.project, now.path, now.hash, sourceRef.current).catch(() => {});
      setMessage(`Unsaved edits to ${now.path} are kept as a draft.`);
    }
  }
  async function openStale() {
    const documentValue = currentRef.current;
    if (!documentValue) return;
    try {
      const fileValue = await api.file(documentValue.project, documentValue.path);
      setStale({ current: fileValue.source, currentHash: fileValue.hash });
    } catch {
      setStale({ current: null, currentHash: null });
    }
  }

  return {
    autosave,
    leaveCurrent,
    itemHints,
    committing,
    setCommitting,
    saveState,
    openStale,
    setGitBusy,
  };
}

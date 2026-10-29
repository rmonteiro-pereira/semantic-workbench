/** Coordinates automatic saves, conflict recovery, and drafts when leaving a file. */
import React, { useRef, useState } from 'react';
import type { Issue } from '../../../shared/validation/diagnostics';
import { validateInWorker } from '../../editor/lint';
import { diffPatches, normalize } from '../../../shared/editor/patch';
import type { Doc } from '../../projects/api';
import { api, scm as scmApi, StaleSave } from '../../projects/api';
import { failureReason, saveStateLabel, useAutosave } from '../../projects/autosave';
import { isGitignore } from '../../../shared/scm/gitignore';
import { applyDemotions, type Demotion } from '../../../shared/governance/guards';

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
  setStale: React.Dispatch<React.SetStateAction<{ current: string | null; currentHash: string | null } | null>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  sourceRef: React.RefObject<string>;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  draftOf: React.RefObject<{ project: string; path: string } | null>;
};
/** Manages saving. */
export function useSaving({ current, source, currentRef, editorIssuesRef, docsRef, setDocs, setCurrentState, setStale, setMessage, sourceRef, setSource, draftOf }: Options) {
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
      if (editorResult && editorResult.id === document.id && editorResult.text !== undefined && editorResult.text === normalize(text)) return errors(editorResult.issues);
      return errors(await validateInWorker(text, document.filename));
    },
    save: request => {
      const doc = docsRef.current.get(request.file);
      if (!doc) return Promise.reject(Error('The file is no longer in the workspace.'));
      return api.save(doc.project, doc.path, request.baseHash, request.to, diffPatches(request.from, request.to));
    },
    onSaved: (file, text, hash, sent) => {
      const doc = docsRef.current.get(file);
      if (!doc) return;
      const next = { ...doc, source: text, hash };
      docsRef.current.set(file, next);
      setDocs(old => old.map(x => (x.id === file ? next : x)));
      if (currentRef.current?.id === file) setCurrentState(next); /* the server's file event refreshes the tree and counts */
      if (text !== sent.text) followStoredText(file, text, sent);
    },
    isStale: e => e instanceof StaleSave,
    onStale: (file, e) => {
      if (currentRef.current?.id === file && e instanceof StaleSave) setStale({ current: e.currentSource, currentHash: e.currentHash });
    },
    onFailed: (_file, m) => setMessage(`Not saved: ${failureReason(m)}`),
  });
  // The server stored other text than sent: an approved metric the person changed went back to
  // proposed. The editor shows the stored text, or applies the same demotion to what was typed
  // since, so the next save does not set the metric approved again.
  function followStoredText(file: string, text: string, sent: { text: string; demoted?: Demotion[] }) {
    if (currentRef.current?.id === file) {
      const typed = sourceRef.current;
      if (typed === sent.text) setSource(text);
      else if (sent.demoted?.length) setSource(applyDemotions(typed, file, sent.demoted));
    }
    setMessage('Saved. An approved metric you changed is now proposed for review.');
  }
  const saveState = saveStateLabel(autosave.state);
  // Leaving a file or view: a due valid save is written first; invalid text stays a server draft
  // (no "Discard unsaved changes?" prompt; the draft is announced instead).
  async function leaveCurrent() {
    const doc = currentRef.current;
    if (!doc || sourceRef.current === doc.source) return;
    await autosave.flush();
    const now = currentRef.current;
    if (now && sourceRef.current !== now.source) {
      draftOf.current = { project: now.project, path: now.path };
      await scmApi.saveDraft(now.project, now.path, now.hash, sourceRef.current).catch(() => {});
      setMessage(`Unsaved edits to ${now.path} are kept as a draft.`);
    }
  }
  async function openStale() {
    const doc = currentRef.current;
    if (!doc) return;
    try {
      const diskFile = await api.file(doc.project, doc.path);
      setStale({ current: diskFile.source, currentHash: diskFile.hash });
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

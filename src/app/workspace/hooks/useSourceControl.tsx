/** Tracks the open file's history and preserves unsaved text as server drafts. */
import { useEffect, useRef, useState } from 'react';
import { scm as scmApi } from '../../projects/api';

type Options = {
  project: string;
  current: import('../../projects/api').Doc | null;
  source: string;
};
type History = { project: string; path: string | undefined };
/** Manages source control. */
export function useSourceControl({ project, current, source }: Options) {
  // Source Control shows the selected project. A file whose history is open belongs to one project
  // and is not shown after the selection moves to another. The open file's unsaved text is kept
  // as a server draft so pull and switch are refused while it exists.
  const [history, setHistory] = useState<History | null>(null);
  const historyPath = history?.project === project ? history.path : undefined;
  const setHistoryPath = (path: string | undefined, historyProject = project) =>
    setHistory({ project: historyProject, path });
  const draftOf = useRef<{ project: string; path: string } | null>(null);
  useEffect(() => {
    const dirty = !!current && source !== current.source;
    if (!dirty) {
      const document = draftOf.current;
      if (document) {
        draftOf.current = null;
        void scmApi.deleteDraft(document.project, document.path).catch(() => {});
      }
      return;
    }
    const draftTimer = setTimeout(() => {
      const previous = draftOf.current;
      if (previous && (previous.project !== current!.project || previous.path !== current!.path))
        void scmApi.deleteDraft(previous.project, previous.path).catch(() => {});
      draftOf.current = { project: current!.project, path: current!.path };
      void scmApi.saveDraft(current!.project, current!.path, current!.hash, source).catch(() => {});
    }, 1500);
    return () => clearTimeout(draftTimer);
  }, [source, current?.id, current?.hash]);

  return { draftOf, setHistoryPath, historyPath };
}

/** Tracks the active source-control project and preserves unsaved text as server drafts. */
import { useEffect, useRef, useState } from 'react';
import { scm as scmApi } from '../projects/api';

type Options = {
  projects: import('../projects/api').ProjectInfo[];
  current: import('../projects/api').Doc | null;
  source: string;
};
/** Manages source control. */
export function useSourceControl({ projects, current, source }: Options) {
  // Source Control: the project shown, a file whose history is open, and the open file's
  // unsaved text kept as a server draft so pull and switch are refused while it exists.
  const [scmProject, setScmProject] = useState<string | null>(null);
  const [historyPath, setHistoryPath] = useState<string | undefined>(undefined);
  const scmSlug =
    scmProject && projects.some(p => p.slug === scmProject)
      ? scmProject
      : (current?.project ?? projects[0]?.slug ?? null);
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

  return { draftOf, setHistoryPath, scmSlug, historyPath, setScmProject };
}

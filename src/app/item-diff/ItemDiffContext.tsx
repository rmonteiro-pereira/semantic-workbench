import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ItemChange } from '../../shared/item-diff/item-change';
import { scm, type Doc, type GitStatus, type ProjectInfo } from '../projects/api';
import { useItemDiff } from './use-item-diff';

const Context = createContext<(ReturnType<typeof useItemDiff> & { project: ProjectInfo }) | null>(null);
const emptyChanges: ItemChange[] = [];

/** Makes one saved comparison available across the current project workspace. */
export function ItemDiffProvider({ project, docs, revision, children }: { project?: ProjectInfo; docs: Doc[]; revision: number; children: ReactNode }) {
  const slug = project?.slug;
  const published = project?.published?.commit;
  const [loaded, setLoaded] = useState<{ slug: string; revision: number; status: GitStatus }>();
  useEffect(() => {
    if (!slug || !published || (project?.actions && !project.actions.includes('history'))) return;
    let cancelled = false;
    void scm.status(slug).then(
      status => {
        if (!cancelled) setLoaded({ slug, revision, status });
      },
      error => {
        if (!cancelled) console.warn('Could not refresh comparison branch status.', error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug, published, revision, project?.actions]);
  const status = loaded && loaded.slug === slug && loaded.revision === revision ? loaded.status : undefined;
  const value = useItemDiff(project, docs, revision, status);
  return <Context.Provider value={project ? { ...value, project } : null}>{children}</Context.Provider>;
}

/** Reads the current project's overlay choice, branch and result. */
export function useItemDiffContext() {
  return useContext(Context);
}

/** Reads the visible change list, keeping an idle overlay's collection stable. */
export function useVisibleItemChanges() {
  const comparison = useItemDiffContext();
  return comparison && 'diff' in comparison.result ? comparison.result.diff.changes : emptyChanges;
}

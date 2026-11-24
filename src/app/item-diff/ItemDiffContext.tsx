import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ItemChange } from '../../shared/item-diff/item-change';
import { scm, type Doc, type GitStatus, type ProjectInfo } from '../projects/api';
import { RemovedItemReview } from './RemovedItemReview';
import { useItemDiff } from './use-item-diff';

const Context = createContext<(ReturnType<typeof useItemDiff> & { project: ProjectInfo; refreshBranch: () => void; openRemoved: (address: string) => boolean }) | null>(null);
const emptyChanges: ItemChange[] = [];

/** Makes one saved comparison available across the current project workspace. */
/** Whether a reader may compare this project's saved items with its history. A project that lists no actions is the local one, where everything is allowed. */
export function canCompareHistory(project: Pick<ProjectInfo, 'actions'> | undefined): boolean {
  return !project?.actions || project.actions.includes('history');
}

export function ItemDiffProvider({ project, docs, revision, children, refreshBranch }: { project?: ProjectInfo; docs: Doc[]; revision: number; children: ReactNode; refreshBranch: () => void }) {
  const [removedAddress, setRemovedAddress] = useState('');
  const slug = project?.slug;
  const published = project?.published?.commit;
  const [loaded, setLoaded] = useState<{ slug: string; revision: number; status: GitStatus }>();
  useEffect(() => {
    if (!slug || !published || !canCompareHistory(project)) return;
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
  const changes = 'diff' in value.result ? value.result.diff.changes : emptyChanges;
  const removed = changes.find(change => change.state === 'removed' && change.address === removedAddress);
  function openRemoved(id: string) {
    if (!id.startsWith('removed:')) return false;
    setRemovedAddress(id.slice('removed:'.length));
    return true;
  }
  return (
    <Context.Provider value={project ? { ...value, project, refreshBranch, openRemoved } : null}>
      {children}
      {removed && <RemovedItemReview change={removed} onClose={() => setRemovedAddress('')} />}
    </Context.Provider>
  );
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

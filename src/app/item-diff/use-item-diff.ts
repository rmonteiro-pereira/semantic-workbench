import { useEffect, useState } from 'react';
import type { ItemDiff } from '../../shared/item-diff/item-change';
import { fetchItemDiff, type Doc, type GitStatus, type ProjectInfo } from '../projects/api';
import { unpublishedItems } from './unpublished-items';

/** Loading and result states shared by the overlay and publication review. */
export type ComparisonState = { state: 'off' | 'loading' } | { state: 'error'; message: string } | { state: 'empty' | 'ready' | 'partial'; diff: ItemDiff };

/** Derives whether the overlay follows status or an explicit choice for this project. */
export function overlayEnabled(choice: boolean | undefined, project: ProjectInfo, status?: GitStatus): boolean {
  if (choice !== undefined) return choice;
  const published = status?.published;
  if (published?.state === 'none' || !project.published) return false;
  return Boolean(project.changes || project.ahead || published?.ahead);
}

/** Classifies a captured response without hiding an incomplete comparison. */
export function comparisonResult(diff: ItemDiff): ComparisonState {
  if (diff.omitted || diff.notCompared.length) return { state: 'partial', diff };
  return { state: diff.changes.length ? 'ready' : 'empty', diff };
}

/** Loads one saved comparison and leaves disabled overlays idle. */
export async function loadItemComparison(enabled: boolean, project: ProjectInfo, documents: readonly Doc[], signal: AbortSignal, request = fetchItemDiff): Promise<ComparisonState> {
  if (!enabled) return { state: 'off' };
  try {
    const diff = project.published ? await request(project.slug, 'published', 'working', signal) : unpublishedItems(project.slug, documents);
    return comparisonResult(diff);
  } catch (error) {
    return { state: 'error', message: error instanceof Error ? error.message : 'Could not compare the saved items.' };
  }
}

/** Follows saved file, branch and publication changes and cancels superseded comparisons. */
export function useItemDiff(project: ProjectInfo | undefined, documents: readonly Doc[], revision: number, status?: GitStatus) {
  const [choice, setChoice] = useState<{ project: string; enabled: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: ComparisonState }>();
  const enabled = project ? overlayEnabled(choice?.project === project.slug ? choice.enabled : undefined, project, status) : false;
  const checkedOut = status?.branch ?? project?.copy?.branch ?? project?.branch ?? '';
  const branch = checkedOut === '(detached)' ? '' : checkedOut;
  const head = status?.head;
  const commit = project?.published?.commit ?? '';
  const key = JSON.stringify([project?.slug, branch, head, commit, revision, attempt]);
  const unpublishedDocuments = commit ? undefined : documents;

  useEffect(() => {
    if (!enabled || !project) return;
    const controller = new AbortController();
    void loadItemComparison(enabled, project, unpublishedDocuments ?? [], controller.signal).then(result => {
      if (!controller.signal.aborted) setLoaded({ key, result });
    });
    return () => controller.abort();
  }, [enabled, key, unpublishedDocuments]);

  let result: ComparisonState = { state: 'off' };
  if (enabled) result = loaded?.key === key ? loaded.result : { state: 'loading' };
  return {
    result,
    enabled,
    branch,
    head,
    commit,
    setEnabled(next: boolean) {
      if (project) setChoice({ project: project.slug, enabled: next });
      if (next) setAttempt(value => value + 1);
    },
    retry() {
      setAttempt(value => value + 1);
    },
  };
}

import { useEffect, useRef, useState } from 'react';
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
  return Boolean(project.changes || published?.ahead);
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

/** Describes a branch change when the comparison follows the new checkout. */
export function branchChangeNotice(previous: string, next: string, previousHead?: string, nextHead?: string) {
  if (previous !== next) return next ? `The comparison now follows branch ${next}.` : `Branch ${previous} is no longer checked out.`;
  if (next && previousHead && nextHead && previousHead !== nextHead) return `Branch ${next} moved. The comparison used the updated branch.`;
  return '';
}

function useBranchNotice(project: string, branch: string, head?: string) {
  const [notice, setNotice] = useState('');
  const previous = useRef<{ project: string; branch: string; head?: string }>(undefined);
  useEffect(() => {
    const before = previous.current;
    if (before?.project === project) {
      const message = branchChangeNotice(before.branch, branch, before.head, head);
      if (message) setNotice(message);
    } else {
      setNotice('');
    }
    previous.current = { project, branch, head: head ?? (before?.branch === branch ? before.head : undefined) };
  }, [project, branch, head]);
  return notice;
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
  const notice = useBranchNotice(project?.slug ?? '', branch, head ?? undefined);
  const commit = project?.published?.commit ?? '';
  const key = JSON.stringify([project?.slug, branch, commit, revision, attempt]);
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
    notice,
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

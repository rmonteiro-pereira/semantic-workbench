import { useEffect, useState } from 'react';
import { fetchItemDiff } from '../projects/api';
import { ChangeList } from './ChangeList';
import { comparisonResult, type ComparisonState } from './use-item-diff';

const reviewLimit = 30;

/** Shows the bounded review without controlling the publication action. */
export function PublicationChanges({ result, onRetry }: { result: ComparisonState; onRetry: () => void }) {
  const distinctKinds = new Map<string, number>();
  let visible = result;
  if ('diff' in result) {
    const { diff } = result;
    for (const change of diff.changes) distinctKinds.set(change.kind, (distinctKinds.get(change.kind) ?? 0) + 1);
    if (diff.changes.length > reviewLimit) {
      visible = { state: 'partial', diff: { ...diff, changes: diff.changes.slice(0, reviewLimit), omitted: diff.omitted + diff.changes.length - reviewLimit } };
    }
  }
  return (
    <section className="item-change-list" aria-label="Publication changes">
      <h3>Changes to publish</h3>
      {distinctKinds.size > 0 && <p>{[...distinctKinds].map(([kind, count]) => `${kind.replaceAll('-', ' ')}: ${count}`).join(', ')}</p>}
      <ChangeList result={visible} onRetry={onRetry} />
    </section>
  );
}

/** Compares the published commit with the branch tip that confirmation would publish. */
export function PublicationReview({ project, branch }: { project: string; branch: string }) {
  const [result, setResult] = useState<ComparisonState>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  function retry() {
    setResult({ state: 'loading' });
    setAttempt(value => value + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetchItemDiff(project, 'published', 'branch:' + branch, controller.signal).then(
      diff => {
        if (!controller.signal.aborted) setResult(comparisonResult(diff));
      },
      error => {
        if (!controller.signal.aborted) setResult({ state: 'error', message: `Could not review changes. ${error instanceof Error ? error.message : ''}`.trim() });
      },
    );
    return () => controller.abort();
  }, [project, branch, attempt]);
  return <PublicationChanges result={result} onRetry={retry} />;
}

import { Modal } from '../projects/Modal';
import { ChangeMark } from './ChangeMark';
import { ChangeList } from './ChangeList';
import { useEffect, useRef, useState } from 'react';
import { useItemDiffContext } from './ItemDiffContext';
import type { ComparisonState } from './use-item-diff';

/** Describes the current comparison even when the overlay has no marks to show. */
export function overlaySummary(result: ComparisonState, published: boolean) {
  if (!published) return 'This project has no published commit.';
  if (result.state === 'off') return 'Overlay off.';
  if (result.state === 'loading') return 'Comparing saved items.';
  if (result.state === 'error') return result.message;
  if (result.state === 'empty') return 'No unpublished item changes.';
  if (!('diff' in result)) return '';
  const { added, changed, removed } = result.diff.counts;
  const counts = `${added} added, ${changed} changed, ${removed} removed.`;
  return result.state === 'partial' ? counts + ' Some items could not be shown.' : counts;
}

/** Describes a branch change when the comparison follows the new checkout. */
export function branchChangeNotice(previous: string, next: string, previousHead?: string, nextHead?: string) {
  if (previous !== next) return next ? `The comparison now follows branch ${next}.` : `Branch ${previous} is no longer checked out.`;
  if (next && previousHead && nextHead && previousHead !== nextHead) return `Branch ${next} moved. The comparison used the updated branch.`;
  return '';
}

/** Puts the comparison details in the graph controls. The overlay itself is switched from the Show menu. */
export function OverlayControl() {
  const overlay = useItemDiffContext();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const previous = useRef<{ project: string; branch: string; head?: string }>(undefined);
  const project = overlay?.project.slug ?? '';
  const branch = overlay?.branch ?? '';
  const head = overlay?.head ?? undefined;
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
  if (!overlay || (overlay.project.actions && !overlay.project.actions.includes('history'))) return null;
  return (
    <span className="item-overlay-control">
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} aria-label="Unpublished comparison details">
        Comparison
      </button>
      {open && (
        <Modal
          title="Unpublished comparison"
          size="wide"
          onCancel={() => setOpen(false)}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          }
        >
          <div className="item-overlay-status" role="status">
            <span>Branch: {branch || 'no branch'}</span>
            {overlay.commit && <span>Published commit: {overlay.commit}</span>}
            <span>{overlaySummary(overlay.result, Boolean(overlay.commit))}</span>
            {notice && <span>{notice}</span>}
          </div>
          {overlay.enabled && (
            <p className="item-overlay-legend">
              <ChangeMark change="added" />
              <ChangeMark change="changed" />
              <ChangeMark change="removed" />
            </p>
          )}
          <ChangeList result={overlay.result} onRetry={overlay.retry} />
        </Modal>
      )}
    </span>
  );
}

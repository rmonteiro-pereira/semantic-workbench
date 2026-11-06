import { ArrowDown, ArrowUp } from 'lucide-react';
import type { GitStatus } from '../projects/api';
import { isPublished } from './branch-tracking';

/** Counts commits to push and pull, or says the branch was never published. */
export function SyncCounters({ status }: { status: GitStatus }) {
  if (!isPublished(status.upstream)) {
    return (
      <span className="scm-sync" aria-label="Not published" title="This branch has no upstream branch yet. Publish branch creates it.">
        Not published
      </span>
    );
  }
  return (
    <span className="scm-sync" aria-label={`${status.ahead} commits to push, ${status.behind} to pull`} title={`Tracking ${status.upstream}`}>
      <ArrowUp size={12} />
      {status.ahead} to push
      <ArrowDown size={12} />
      {status.behind} to pull
    </span>
  );
}

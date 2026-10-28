/** The Fetch, Pull, Push and Sync buttons under the remote line of the Source control panel. */
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import type { GitStatus } from '../projects/api';
import { isPublished } from './branch-tracking';
import { actionTitle, type RemoteAction } from './RemoteConnectPrompt';

const REMOTE_ACTIONS: RemoteAction[] = ['fetch', 'pull', 'push', 'sync'];

function remoteActionLabel(action: RemoteAction, status: GitStatus): string {
  if (action === 'pull' && status.pullSource) {
    return `Pull ${status.pullSource} into ${status.branch}`;
  }
  // The first push creates the branch on the remote, so it is named for what it does.
  if (action === 'push' && !isPublished(status.upstream)) return 'Publish branch';
  return actionTitle(action);
}

function RemoteActionIcon({ action }: { action: RemoteAction }) {
  if (action === 'sync') return <RefreshCw size={13} />;
  if (action === 'push') return <ArrowUp size={13} />;
  return <ArrowDown size={13} />;
}

// Sync pulls and pushes, so it needs both rights; the other actions need their own.
function mayRun(action: RemoteAction, can: (name: string) => boolean): boolean {
  if (action === 'sync') return can('pull') && can('push');
  return can(action);
}

/** Lists the remote actions this person may run, each disabled while Git is busy. */
export function RemoteActions({
  status,
  busy,
  can,
  onRemoteAction,
}: {
  status: GitStatus;
  busy: boolean;
  can: (action: string) => boolean;
  onRemoteAction: (action: RemoteAction) => void;
}) {
  return (
    <div className="scm-remote-actions" role="group" aria-label="Remote actions">
      {REMOTE_ACTIONS.filter(action => mayRun(action, can)).map(action => (
        <button key={action} disabled={busy} onClick={() => onRemoteAction(action)}>
          <RemoteActionIcon action={action} />
          {remoteActionLabel(action, status)}
        </button>
      ))}
    </div>
  );
}

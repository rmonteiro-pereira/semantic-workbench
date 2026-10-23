/** Dialog that holds the actions meeting a remote or the published branch: Fetch, Pull, Push,
 * Sync, Publish and the remote itself. */
import { useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { Modal } from '../projects/Modal';
import { useCapabilities } from '../auth/Capabilities';
import type { GitStatus, WorkingCopyInfo } from '../projects/api';
import { actionTitle, type RemoteAction } from './RemoteConnectPrompt';
import { DefaultBranchActions } from './DefaultBranchActions';

type Props = {
  project: string;
  status: GitStatus;
  /** Server mode: the person's working copy, which meets the published default branch. */
  copy: WorkingCopyInfo | null;
  busy: boolean;
  onClose: () => void;
  onRemoteAction: (action: RemoteAction) => void;
  onEditRemote: () => void;
  onPullDefault: () => void;
  onPublish: () => void;
  onPushDefault: () => void;
};

const REMOTE_ACTIONS: { action: RemoteAction; explanation: string }[] = [
  { action: 'fetch', explanation: 'Look for new commits without changing your files.' },
  { action: 'pull', explanation: 'Bring the remote commits into this branch.' },
  { action: 'push', explanation: 'Send your commits to the remote.' },
  { action: 'sync', explanation: 'Pull, then push.' },
];

function remoteActionLabel(action: RemoteAction, status: GitStatus): string {
  if (action === 'pull' && status.pullSource) {
    return `Pull ${status.pullSource} into ${status.branch}`;
  }
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

type RemoteSectionProps = Pick<Props, 'status' | 'busy' | 'onEditRemote' | 'onRemoteAction'> & {
  can: (action: string) => boolean;
};

function RemoteSection({ status, busy, can, onEditRemote, onRemoteAction }: RemoteSectionProps) {
  const remoteNames = Object.keys(status.remotes);
  return (
    <section aria-label="Remote">
      <h3>Remote</h3>
      <p className="scm-sync-remote">
        {remoteNames.length ? (
          <span className="scm-remote-url" title={status.remotes[remoteNames[0]]}>
            {remoteNames[0]}: {status.remotes[remoteNames[0]]}
          </span>
        ) : (
          <span>No remote yet. Add one to push and pull.</span>
        )}
        <button hidden={!can('setRemote')} onClick={onEditRemote}>
          Remote…
        </button>
      </p>
      {remoteNames.length > 0 && (
        <ul className="scm-sync-actions" role="group" aria-label="Remote actions">
          {REMOTE_ACTIONS.filter(({ action }) => mayRun(action, can)).map(
            ({ action, explanation }) => (
              <li key={action}>
                <button disabled={busy} onClick={() => onRemoteAction(action)}>
                  <RemoteActionIcon action={action} />
                  {remoteActionLabel(action, status)}
                </button>
                <span>{explanation}</span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** Asks before the person's branch becomes the published branch for everyone. */
function ConfirmPublish({
  target,
  branch,
  onCancel,
  onConfirm,
}: {
  target: string;
  branch: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={`Publish to ${target}?`}
      size="small"
      onCancel={onCancel}
      footer={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onConfirm}>
            Publish to {target}
          </button>
        </>
      }
    >
      <p>
        {branch} becomes the published {target} on this server, so everyone who opens the project
        sees it.
      </p>
      <p className="scm-hint">This does not push to a remote. Push {target} does that.</p>
    </Modal>
  );
}

/** Shows the remote and published-branch actions that used to crowd the changes column. */
export function SyncDialog(props: Props) {
  const { copy, status, busy, onClose, onPullDefault, onPublish, onPushDefault } = props;
  const access = useCapabilities(props.project);
  const [confirming, setConfirming] = useState(false);
  if (confirming && copy) {
    return (
      <ConfirmPublish
        target={copy.defaultBranch}
        branch={status.branch}
        onCancel={() => setConfirming(false)}
        onConfirm={onPublish}
      />
    );
  }
  return (
    <Modal
      title="Sync"
      size="small"
      onCancel={onClose}
      className="scm-sync-dialog"
      footer={<button onClick={onClose}>Close</button>}
    >
      {copy && (
        <DefaultBranchActions
          copy={copy}
          canPull={access.can('pull')}
          canPublish={access.can('publish')}
          publishTitle={access.control('publish').title}
          hasRemote={Object.keys(status.remotes).length > 0}
          disabled={busy}
          onPull={onPullDefault}
          onPublish={() => setConfirming(true)}
          onPushDefault={onPushDefault}
        />
      )}
      <RemoteSection
        status={status}
        busy={busy}
        can={access.can}
        onEditRemote={props.onEditRemote}
        onRemoteAction={props.onRemoteAction}
      />
    </Modal>
  );
}

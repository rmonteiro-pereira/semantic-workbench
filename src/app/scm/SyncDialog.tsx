/** Dialog that holds the actions meeting the published branch of a server working copy: Pull,
 * Publish and Push. The remote actions sit on the Source control panel itself. */
import { useState } from 'react';
import { Modal } from '../projects/Modal';
import { useCapabilities } from '../auth/Capabilities';
import type { GitStatus, WorkingCopyInfo } from '../projects/api';
import { DefaultBranchActions } from './DefaultBranchActions';

type Props = {
  project: string;
  status: GitStatus;
  /** Server mode: the person's working copy, which meets the published default branch. */
  copy: WorkingCopyInfo | null;
  busy: boolean;
  onClose: () => void;
  onPullDefault: () => void;
  onPublish: () => void;
  onPushDefault: () => void;
};

/** Asks before the person's branch becomes the published branch for everyone. */
function ConfirmPublish({ target, branch, onCancel, onConfirm }: { target: string; branch: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal
      title={`Publish to ${target}?`}
      size="narrow"
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
        {branch} becomes the published {target} on this server, so everyone who opens the project sees it.
      </p>
      <p className="scm-hint">This does not push to a remote. Push {target} does that.</p>
    </Modal>
  );
}

/** Shows the published-branch actions of a server working copy. */
export function SyncDialog(props: Props) {
  const { copy, status, busy, onClose, onPullDefault, onPublish, onPushDefault } = props;
  const access = useCapabilities(props.project);
  const [confirming, setConfirming] = useState(false);
  if (confirming && copy) {
    return <ConfirmPublish target={copy.defaultBranch} branch={status.branch} onCancel={() => setConfirming(false)} onConfirm={onPublish} />;
  }
  return (
    <Modal title="Sync" size="narrow" onCancel={onClose} className="scm-sync-dialog" footer={<button onClick={onClose}>Close</button>}>
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
    </Modal>
  );
}

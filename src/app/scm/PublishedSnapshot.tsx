// Keeps publication feedback beside the existing branch controls.
import type { PublishedStatus } from '../../shared/scm/published-status';

type Props = {
  status?: PublishedStatus;
  local: boolean;
  canPublish: boolean;
  busy: boolean;
  onPublish: () => void;
  onAdopt: () => void;
  onAcknowledge: () => void;
};

/** Shows the served commit separately from the person's authoring branch. */
export function PublishedSnapshot({ status, local, canPublish, busy, onPublish, onAdopt, onAcknowledge }: Props) {
  if (!status) return null;
  const pending = status.state === 'pending';
  const unavailable = status.state === 'none';
  const canAdopt = pending && status.pending.move === 'fast-forward';
  const canPublishLocal = local && (unavailable ? status.reason === 'no-commit' : status.ahead > 0);
  return (
    <div className="scm-publication" aria-label="Published snapshot">
      <span>{unavailable ? `Published: none (${status.reason})` : `Published: ${status.branch} @ ${status.commit.slice(0, 7)}`}</span>
      {!unavailable && (
        <span>
          {status.ahead} ahead · {status.behind} behind published
        </span>
      )}
      {!unavailable && status.remote && (
        <span>
          Remote {status.remote.branch}: {status.remote.ahead} {status.remote.ahead === 1 ? 'commit' : 'commits'} ahead of published (last fetch)
        </span>
      )}
      {pending && (
        <span>
          Outside move: {status.pending.move}, {status.pending.commits} {status.pending.commits === 1 ? 'commit' : 'commits'}.{' '}
          {status.pending.move === 'diverged' && 'Restore a descendant of the published commit before adopting.'}
        </span>
      )}
      {canPublish && (local || pending) && (
        <button disabled={busy || (pending ? !canAdopt : !canPublishLocal)} onClick={pending ? onAdopt : onPublish}>
          {pending ? 'Adopt' : 'Publish'}
        </button>
      )}
      {status.notice && (
        <div className="scm-publication-notice" role="status">
          <p>Existing default-branch commits are the first published snapshot. New local commits use work/local. Publish when your committed definitions are ready for agents.</p>
          <button disabled={busy} onClick={onAcknowledge}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}

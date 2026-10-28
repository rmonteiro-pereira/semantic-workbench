/** The error box for any failed Git action. */
import { looksLikeAuthFailure } from './CredentialGuide';
import { PUSH_REJECTED_SUMMARY, isRejectedPush } from './push-rejection';

type Props = {
  message: string;
  /** Whether the person may open the credential guide (local mode only). */
  canOpenGuide: boolean;
  busy: boolean;
  onOpenGuide: () => void;
  onPull: () => void;
};

function RejectedPush({ message, busy, onPull }: Pick<Props, 'message' | 'busy' | 'onPull'>) {
  return (
    <>
      <p>{PUSH_REJECTED_SUMMARY}</p>
      <p>
        Pull their changes first. If both sides edited the same lines, you will resolve a merge.
      </p>
      <button disabled={busy} onClick={onPull}>
        Pull remote changes
      </button>
      <details>
        <summary>Show details</summary>
        <pre>{message}</pre>
      </details>
    </>
  );
}

/** Shows a failed Git action; a rejected push leads with its cause and the way forward. */
export function ScmError(props: Props) {
  const { message, canOpenGuide, busy, onOpenGuide, onPull } = props;
  return (
    <div role="alert" className="scm-error">
      {isRejectedPush(message) ? (
        <RejectedPush message={message} busy={busy} onPull={onPull} />
      ) : (
        <pre>{message}</pre>
      )}
      {looksLikeAuthFailure(message) && (
        <button hidden={!canOpenGuide} onClick={onOpenGuide}>
          Credential setup guide
        </button>
      )}
    </div>
  );
}

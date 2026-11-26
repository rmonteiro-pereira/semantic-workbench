// The person sees the content statement before preparing any agent connection.
import { Modal } from '../projects/Modal';
import { useBrand } from '../brand/BrandContext';
import { connectionStatement, SCOPE_LINES, NOT_OFFERED_NOTE } from '../../shared/agent-panel/statement';

/** Explains what connecting an external agent permits and asks before replacing a live session. */
export function ConnectStep({ busy, replace, error, start, close }: { busy: boolean; replace: boolean; error: string; start(): void; close(): void }) {
  const brand = useBrand();
  function dismiss() {
    if (!busy) close();
  }
  return (
    <Modal
      title="Connect your agent"
      onCancel={dismiss}
      footer={
        <>
          <button disabled={busy} onClick={dismiss}>
            Cancel
          </button>
          <button className="primary" disabled={busy} onClick={start}>
            {replace ? 'Replace session' : 'Start session'}
          </button>
        </>
      }
    >
      <p>{connectionStatement(brand.productName)}</p>
      <ul>
        {SCOPE_LINES.map(scope => (
          <li key={scope}>{scope}</li>
        ))}
      </ul>
      <p>{NOT_OFFERED_NOTE}</p>
      {replace && <p>Starting a new session ends your other agent session. Its conversation will not resume.</p>}
      {busy && (
        <section className="agent-connecting" role="status" aria-label="Connecting">
          <h3>Connecting</h3>
          <p>Preparing the connection to your agent. The command to run appears next.</p>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}

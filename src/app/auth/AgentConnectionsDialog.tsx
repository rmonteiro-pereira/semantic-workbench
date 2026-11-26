import { useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import { loadConnections, revokeConnection, type ConnectionView } from './connection-api';
import './AgentConnectionsDialog.css';
import { SectionStatus } from '../admin/SectionStatus';
import { problemText } from '../admin/api';

/** A wrapping connection list with explicit status text and named revocation actions. */
export function ConnectionListView({ connections, administrator, onRevoke }: { connections: ConnectionView[]; administrator: boolean; onRevoke: (connection: ConnectionView) => void }) {
  if (!connections.length) return <p>No agent connections.</p>;
  return (
    <ul className="agent-connections-list">
      {connections.map(connection => (
        <li key={connection.id}>
          <strong>{connection.programName}</strong>
          <span>{connection.clientId}</span>
          {administrator && <span>{connection.personName}</span>}
          <span>Origin: {connection.origin}</span>
          <span>Scopes: {connection.scopes.join(', ') || 'none'}</span>
          <span>Created: {connection.createdAt}</span>
          <span>Last used: {connection.lastUsedAt}</span>
          <span>
            Status: {connection.state}
            {connection.endReason ? ` (${connection.endReason})` : ''}
          </span>
          {connection.state === 'active' && (
            <button type="button" onClick={() => onRevoke(connection)}>
              Revoke {connection.programName}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Loads and revokes the current person's connections, or all connections for an Admin. */
export function AgentConnections({ administrator = false }: { administrator?: boolean }) {
  const [connections, setConnections] = useState<ConnectionView[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ConnectionView | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    setConnections(null);
    setLoadError('');
    loadConnections(administrator)
      .then(value => {
        if (active) setConnections(value);
      })
      .catch(problem => {
        if (active) setLoadError(problemText(problem));
      });
    return () => {
      active = false;
    };
  }, [administrator, generation]);
  function reload() {
    setGeneration(value => value + 1);
  }
  async function confirmRevocation() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await revokeConnection(selected.id, administrator);
      setSelected(null);
      reload();
    } catch {
      setError('The connection could not be revoked. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="agent-connections">
      <SectionStatus subject="connections" loading={!loadError && connections === null} error={loadError} onRetry={reload} />
      {error && <p role="alert">{error}</p>}
      {connections && <ConnectionListView connections={connections} administrator={administrator} onRevoke={setSelected} />}
      {selected && (
        <section aria-label="Confirm revocation">
          <p>
            Revoke {selected.programName} ({selected.clientId})? Its current work will stop. A new connection needs consent again.
          </p>
          <p>Origin: {selected.origin}</p>
          <button type="button" disabled={busy} onClick={confirmRevocation}>
            Confirm revocation
          </button>
          <button type="button" disabled={busy} onClick={() => setSelected(null)}>
            Cancel
          </button>
        </section>
      )}
      <button type="button" disabled={busy} onClick={reload}>
        Refresh connections
      </button>
    </div>
  );
}

/** The person's connection controls, opened from the server-mode person menu. */
export function AgentConnectionsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Agent connections"
      onCancel={onClose}
      size="narrow"
      footer={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <p>Connections act with your selected scopes and current roles. They end when you sign out or your session expires.</p>
      <a href="/oauth/setup">Create a setup credential</a>
      <AgentConnections />
    </Modal>
  );
}

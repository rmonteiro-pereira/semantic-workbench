import { useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import { loadConnections, revokeConnection, type ConnectionView } from './connection-api';
import './AgentConnectionsDialog.css';
import { SectionStatus } from '../admin/SectionStatus';
import { problemText } from '../admin/api';
import { whenLabel } from '../admin/helpers';

/** Says how a program reached the workbench in words, instead of the protocol code. */
export function originWords(origin: string): string {
  if (origin === 'mcp') return 'the MCP server';
  if (origin === 'acp') return 'the agent panel';
  return origin;
}

/** A wrapping connection list with explicit status text and named revocation actions. */
export function ConnectionListView({ connections, administrator, onRevoke }: { connections: ConnectionView[]; administrator: boolean; onRevoke: (connection: ConnectionView) => void }) {
  if (!connections.length) return <p>No agent connections.</p>;
  return (
    <ul className="agent-connections-list">
      {connections.map(connection => (
        <li key={connection.id}>
          <strong>{connection.programName}</strong>
          <span>Client ID: {connection.clientId}</span>
          {administrator && <span>Person: {connection.personName}</span>}
          <span>Connected through: {originWords(connection.origin)}</span>
          <span>Permissions: {connection.scopes.join(', ') || 'none'}</span>
          <span>Created: {whenLabel(connection.createdAt)}</span>
          <span>Last used: {whenLabel(connection.lastUsedAt)}</span>
          <span>
            Status: {connection.state}
            {connection.endReason ? ` (${connection.endReason})` : ''}
          </span>
          {connection.state === 'active' && (
            <button type="button" className="agent-connection-revoke" onClick={() => onRevoke(connection)}>
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
        <Modal
          title={`Revoke ${selected.programName}?`}
          onCancel={() => setSelected(null)}
          size="narrow"
          footer={
            <>
              <button type="button" disabled={busy} onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button type="button" className="danger" disabled={busy} onClick={confirmRevocation}>
                Revoke
              </button>
            </>
          }
        >
          <p>
            {selected.programName} (client ID {selected.clientId}, connected through {originWords(selected.origin)}) stops working now. Connecting it again needs consent again.
          </p>
        </Modal>
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
      <a className="agent-connections-setup" href="/oauth/setup">
        Create a setup credential
      </a>
      <AgentConnections />
    </Modal>
  );
}

import { AgentConnections } from '../auth/AgentConnectionsDialog';

/** Lists and revokes person connections without exposing their credentials. */
export function AgentConnectionsSection() {
  return <AgentConnections administrator />;
}

// End reasons are explained in words without depending on colour.
const REASONS: Record<string, string> = {
  closed: 'You ended this session.',
  replaced: 'A new session replaced this one.',
  'no-agent': 'No agent connected before the code expired.',
  'agent-exited': 'Your agent exited.',
  'relay-lost': 'The relay stopped responding.',
  idle: 'The session ended after being idle.',
  'sign-out': 'You signed out.',
  expired: 'Your browser session expired.',
  deactivated: 'Your account was deactivated.',
  revoked: 'The connection was revoked.',
  'server-restarted': 'The server no longer holds this session. It may have restarted.',
  'protocol-error': 'The agent sent an invalid protocol exchange.',
  flood: 'The agent exceeded the connection limits.',
};

/** Names the session ending and makes clear a new connection is required. */
export function SessionNotice({ reason }: { reason: string }) {
  return <p role="status">{REASONS[reason] ?? 'The session ended.'} Start a new session to connect again.</p>;
}

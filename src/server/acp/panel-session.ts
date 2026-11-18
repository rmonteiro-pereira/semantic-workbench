// The life of one panel session as pure functions: what state follows an event, and which end the clock calls for. The clock is always passed in.

/** The four states of a session. `ended` is final. */
export const SESSION_STATES = ['waiting', 'connected', 'working', 'ended'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Every reason a session ends, in the words the panel and the audit record use. */
export const END_REASONS = [
  'closed',
  'replaced',
  'no-agent',
  'agent-exited',
  'relay-lost',
  'idle',
  'sign-out',
  'expired',
  'deactivated',
  'revoked',
  'server-restarted',
  'protocol-error',
  'flood',
] as const;
export type EndReason = (typeof END_REASONS)[number];

/** How long a session waits for its relay to attach, in milliseconds. */
export const WAITING_LIMIT_MS = 10 * 60_000;
/** How long a connected session may go without a prompt, update or answer. */
export const IDLE_LIMIT_MS = 30 * 60_000;
/** How long the relay may be unreachable before the session ends. */
export const RELAY_GRACE_MS = 45_000;
/** How long an ended session stays readable before its buffer is dropped. */
export const ENDED_RETENTION_MS = 10 * 60_000;

/** The timing and state of one session. Identity, owner and buffers live elsewhere. */
export type PanelSessionState = Readonly<{
  state: SessionState;
  createdAt: number;
  lastActivityAt: number;
  /** When the relay link was lost, while it is lost. */
  linkLostAt?: number;
  endReason?: EndReason;
  endedAt?: number;
}>;

/** What can happen to a session. */
export type SessionEvent =
  | { type: 'connect' }
  | { type: 'prompt' }
  | { type: 'turn-finished' }
  | { type: 'activity' }
  | { type: 'link-lost' }
  | { type: 'link-restored' }
  | { type: 'end'; reason: EndReason };

/** A session that has just been created and is waiting for its relay. */
export function newPanelSession(now: number): PanelSessionState {
  return { state: 'waiting', createdAt: now, lastActivityAt: now };
}

function ended(session: PanelSessionState, reason: EndReason, now: number): PanelSessionState {
  return { state: 'ended', createdAt: session.createdAt, lastActivityAt: session.lastActivityAt, endReason: reason, endedAt: now };
}

/** The state after an event. An event that does not apply, or any event after the end, returns the same object. */
export function applyEvent(session: PanelSessionState, event: SessionEvent, now: number): PanelSessionState {
  if (session.state === 'ended') return session;
  switch (event.type) {
    case 'end':
      return ended(session, event.reason, now);
    case 'connect':
      return session.state === 'waiting' ? { ...session, state: 'connected', lastActivityAt: now } : session;
    case 'prompt':
      return session.state === 'connected' ? { ...session, state: 'working', lastActivityAt: now } : session;
    case 'turn-finished':
      return session.state === 'working' ? { ...session, state: 'connected', lastActivityAt: now } : session;
    case 'activity':
      return session.state === 'waiting' ? session : { ...session, lastActivityAt: now };
    case 'link-lost':
      return session.state === 'waiting' || session.linkLostAt !== undefined ? session : { ...session, linkLostAt: now };
    case 'link-restored':
      return session.linkLostAt === undefined ? session : { ...session, linkLostAt: undefined };
  }
}

/** The reason the clock ends this session now, if it does. A lost relay is checked first because it is the most specific cause. */
export function endDueAt(session: PanelSessionState, now: number): EndReason | undefined {
  if (session.state === 'ended') return undefined;
  if (session.linkLostAt !== undefined && now - session.linkLostAt >= RELAY_GRACE_MS) return 'relay-lost';
  if (session.state === 'waiting') return now - session.createdAt >= WAITING_LIMIT_MS ? 'no-agent' : undefined;
  return now - session.lastActivityAt >= IDLE_LIMIT_MS ? 'idle' : undefined;
}

/** Whether an ended session has been kept long enough to be dropped. */
export function retentionOver(session: PanelSessionState, now: number): boolean {
  return session.state === 'ended' && session.endedAt !== undefined && now - session.endedAt >= ENDED_RETENTION_MS;
}

// What the agent panel needs from the connection service of server mode, stated as an interface so the panel can be built and tested before that service is wired in.
import type { Caller } from '../auth/caller';
import type { Session } from '../auth/sessions';

/** A request for a single-use credential for the relay, made on behalf of a signed-in person. */
export type RelayCredentialRequest = { session: Session; clientId: string; scopes: ('read' | 'validate' | 'edit' | 'commit' | 'remote' | 'publish' | 'administration')[]; origin?: 'mcp' | 'acp' };
/** The credential is shown to the person once and expires. */
export type RelayCredentialResult = { ok: true; credential: string; expiresAt: number } | { ok: false; reason: 'program-not-registered' | 'scope-not-allowed' | 'no-access' | 'connection-limit' };
/** A connection that ended, with the closed word for why. */
export type ConnectionEndNotice = {
  connectionId: string;
  reason: 'session-ended' | 'signed-out' | 'expired' | 'deactivated' | 'no-access' | 'revoked-by-person' | 'revoked-by-admin' | 'program-removed' | 'scope-removed' | 'replay' | 'code-reuse';
  origin: 'mcp' | 'acp';
  person: string;
  clientId: string;
};

/** The part of the connection service the panel uses. */
export type ConnectionDirectory = {
  createConnectionForSession(request: RelayCredentialRequest): RelayCredentialResult;
  /** Turns the relay's access token into a minted caller, or refuses with no reason. */
  resolve(accessToken: string): Promise<{ ok: true; caller: Caller; connection: string } | { ok: false }>;
  /** Calls the listener when any connection ends. Returns the function that stops listening. */
  onConnectionEnded(listener: (ended: ConnectionEndNotice) => void): () => void;
};

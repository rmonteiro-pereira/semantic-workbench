// A stand-in for the connection service of server mode that keeps the interface the agent panel was built against, so the panel can be tested before the real service is wired in.
import { mintCaller, type Caller } from '../../../src/server/auth/caller';
import type { Principal } from '../../../src/server/auth/principal';
import type { ConnectionDirectory, ConnectionEndNotice } from '../../../src/server/acp/connection-directory';

/** The double, with the controls a test needs: who a token belongs to, ending a connection, and counting touches. */
export function testDoubleConnections() {
  const listeners = new Set<(ended: ConnectionEndNotice) => void>();
  const tokens = new Map<string, { principal: Principal; connection: string; origin: 'acp' | 'mcp' }>();
  const credentials = new Map<string, { principal: Principal }>();
  const live = new Set<string>();
  let counter = 0;
  const calls = { created: 0, resolved: 0, sessionTouches: 0 };
  const directory: ConnectionDirectory = {
    createConnectionForSession(request) {
      calls.created += 1;
      counter += 1;
      const credential = `credential-${counter}`;
      credentials.set(credential, { principal: request.session.principal });
      return { ok: true, credential, expiresAt: Date.now() + 600_000 };
    },
    async resolve(token) {
      calls.resolved += 1;
      const known = tokens.get(token);
      if (!known || !live.has(known.connection)) return { ok: false };
      const caller: Caller = mintCaller({ principal: known.principal, origin: known.origin, connection: known.connection, scope: ['read', 'localWrite'] });
      return { ok: true, caller, connection: known.connection };
    },
    onConnectionEnded(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    directory,
    calls,
    /** Trades a credential for a token the way the real service would at its token endpoint. */
    exchange(credential: string, origin: 'acp' | 'mcp' = 'acp') {
      const issued = credentials.get(credential);
      if (!issued) return undefined;
      credentials.delete(credential);
      counter += 1;
      const token = `token-${counter}`;
      const connection = `conn-${counter}`;
      tokens.set(token, { principal: issued.principal, connection, origin });
      live.add(connection);
      return { token, connection };
    },
    end(connection: string, reason: string) {
      live.delete(connection);
      for (const listener of listeners) listener({ connectionId: connection, reason });
    },
  };
}

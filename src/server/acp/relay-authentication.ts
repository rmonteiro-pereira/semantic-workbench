// Who may speak for a session's relay. Local mode checks the installation's capability and the request's own address; server mode asks the connection service. Every failure looks the same to the caller.
import type { OperationEffect } from '../auth/operation-inventory';
import { localPrincipal, type Principal } from '../auth/principal';
import type { Session } from '../auth/sessions';
import type { LocalCapability } from '../mcp/local-capability';

/**
 * The answer to "who is this relay": a person, or nobody. A server-mode answer also names the connection, its effects and the browser session behind it.
 * Local mode names no connection; the session carries the one it was given.
 */
export type RelayAuthentication = { ok: true; principal: Principal; connection?: string; scope?: readonly OperationEffect[]; session?: Session | null } | { ok: false };
/** Decides who a relay request is. A server-mode implementation resolves a connection token. */
export type RelayAuthenticator = (request: Request) => Promise<RelayAuthentication>;

/** Names a local browser or program uses for the loopback address of this server. */
export function loopbackHostNames(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

/** The value of a `Bearer` header, or null. */
export function bearerOf(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.~+/=-]{1,4096})$/);
  return match ? match[1] : null;
}

/**
 * Local mode: no Origin header (a relay is not a browser), an exact loopback Host, and the capability as a bearer value.
 * The person it returns is the local one; the session store decides whose session it is.
 */
export function createLocalRelayAuthenticator(options: { capability: LocalCapability; port: number }): RelayAuthenticator {
  return async request => {
    if (request.headers.get('origin') !== null) return { ok: false };
    const host = request.headers.get('host')?.toLowerCase() ?? null;
    if (host === null || !loopbackHostNames(options.port).includes(host)) return { ok: false };
    if (!options.capability.matches(bearerOf(request))) return { ok: false };
    return { ok: true, principal: localPrincipal() };
  };
}

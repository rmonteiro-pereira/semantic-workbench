// Decides, from the request's own headers alone, whether the endpoint may answer it. The order is fixed and a refusal says nothing about the tools, the protocol version or whether the credential was close.

/** The parts of a request the gate looks at. */
export type GateRequest = { method: string; origin: string | null; host: string | null; authorization: string | null; contentType: string | null };

/** The reason for a refusal. The route logs it but never sends it to the caller. */
export type GateRefusal = { allow: false; status: 401 | 403 | 405 | 415; reason: 'method' | 'origin' | 'host' | 'capability' | 'content-type' };
export type GateDecision = { allow: true } | GateRefusal;

/** The names a local browser or program uses to reach the server's own loopback address. */
export function ownHostNames(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

function bearerValue(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

/**
 * Runs the checks in order and stops at the first failure: method, then any Origin header (even
 * `null`, because a program that is not a browser sends none), then an exact loopback Host, then
 * the capability, then the content type.
 */
export function decideRequest(request: GateRequest, own: { port: number; capabilityMatches: (value: string | null) => boolean }): GateDecision {
  if (request.method !== 'POST') return { allow: false, status: 405, reason: 'method' };
  if (request.origin !== null) return { allow: false, status: 403, reason: 'origin' };
  if (request.host === null || !ownHostNames(own.port).includes(request.host.toLowerCase())) return { allow: false, status: 403, reason: 'host' };
  if (!own.capabilityMatches(bearerValue(request.authorization))) return { allow: false, status: 401, reason: 'capability' };
  if (!/^application\/json(\s*;.*)?$/i.test(request.contentType ?? '')) return { allow: false, status: 415, reason: 'content-type' };
  return { allow: true };
}

import type { Caller } from '../auth/caller';
import type { ConnectionService } from '../connections/connection-service';
import type { GateRequest } from './request-gate';

/** Authentication result for a program presenting a server connection token. */
export type ServerGateDecision = { allow: true; caller: Caller; connection: string } | { allow: false; status: 401 | 403 | 405 | 415; reason: string };

/** Checks transport shape before resolving a connection; cookies never participate. */
export async function decideServerRequest(request: GateRequest, service: Pick<ConnectionService, 'resolve'>): Promise<ServerGateDecision> {
  if (request.method !== 'POST') return { allow: false, status: 405, reason: 'method' };
  if (request.origin !== null) return { allow: false, status: 403, reason: 'origin' };
  if (!/^application\/json(\s*;.*)?$/i.test(request.contentType ?? '')) return { allow: false, status: 415, reason: 'content-type' };
  const match = request.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match) return { allow: false, status: 401, reason: 'credential' };
  const resolved = await service.resolve(match[1]);
  if (!resolved.ok || resolved.caller.origin !== 'mcp') return { allow: false, status: 401, reason: 'credential' };
  return { allow: true, caller: resolved.caller, connection: resolved.connection };
}

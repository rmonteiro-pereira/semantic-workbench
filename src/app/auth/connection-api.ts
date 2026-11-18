import { apiFetch } from '../projects/api';
import type { ConnectionView } from '../../server/connections/connection-transitions';

/** Connection metadata exposed to people and administrators, without credentials. */
export type { ConnectionView };

/** Reads connection metadata and rejects malformed successful replies. */
export async function loadConnections(administrator = false): Promise<ConnectionView[]> {
  const response = await apiFetch(administrator ? '/api/admin/connections' : '/api/connections');
  if (response.status !== 200) throw new Error('Connections could not be loaded. Try again.');
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('The server returned invalid connections.');
  return body.map(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim()) throw new Error('The server returned an invalid connection.');
    for (const key of ['clientId', 'programName', 'personName', 'createdAt', 'lastUsedAt']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error('The server returned invalid connection metadata.');
    }
    if (!['active', 'ended'].includes(entry.state) || !Array.isArray(entry.scopes) || !entry.scopes.every((scope: unknown) => typeof scope === 'string')) {
      throw new Error('The server returned an invalid connection state.');
    }
    return entry as ConnectionView;
  });
}

/** Revokes a named connection and requires explicit acknowledgement. */
export async function revokeConnection(id: string, administrator = false): Promise<void> {
  const base = administrator ? '/api/admin/connections/' : '/api/connections/';
  const response = await apiFetch(base + encodeURIComponent(id), { method: 'DELETE' });
  if (response.status !== 200 || (await response.json()).ended !== true) throw new Error('The connection could not be revoked. Refresh and try again.');
}

// Browser transport for the panel; the ordinary API wrapper supplies write intent headers.
import { apiFetch } from '../projects/api';
import type { PanelEvent } from '../../shared/agent-panel/events';

/** The one-time connection instructions returned only when creating a session. */
export type StartedSession = { id: string; code: string; command: string; statement: string; scopes: string[]; notOffered: string; expiresAt: number };

/** Sends a panel action, rejecting HTTP failures with their readable explanation. */
export async function panelAction(path = '', body?: unknown, method = 'POST'): Promise<unknown> {
  const response = await apiFetch(`/api/acp/sessions${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const answer = await response.json();
  if (!response.ok) throw Object.assign(new Error(answer.error ?? 'The panel request failed.'), { status: response.status });
  return answer;
}

/** Reads numbered events until the server ends the stream or the panel closes. */
export async function followPanel(id: string, after: number, signal: AbortSignal, receive: (event: PanelEvent) => void): Promise<number> {
  const response = await apiFetch(`/api/acp/sessions/${encodeURIComponent(id)}/events?after=${after}`, { signal });
  if (!response.ok) return response.status;
  if (!response.body) throw new Error('The event stream has no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return 200;
      pending += decoder.decode(chunk.value, { stream: true });
      let boundary = pending.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = frame.split('\n').find(line => line.startsWith('data: '));
        if (data) receive(JSON.parse(data.slice(6)) as PanelEvent);
        boundary = pending.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

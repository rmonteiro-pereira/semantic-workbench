// Session endings close the protocol link and refuse subsequent relay and file frames.
import { streamEndReason } from '../../src/app/agent/agent-events';
import { expect, test } from 'bun:test';
import { IDLE_LIMIT_MS, RELAY_GRACE_MS, WAITING_LIMIT_MS } from '../../src/server/acp/panel-session';
import { MAXIMUM_FRAME_BYTES } from '../../src/server/acp/jsonrpc-connection';
import { startPanelServer } from './helpers/panel-server';

for (const reason of ['closed', 'replaced', 'no-agent', 'agent-exited', 'relay-lost', 'idle', 'sign-out', 'expired', 'deactivated', 'revoked', 'protocol-error', 'flood'] as const) {
  test(`ending with ${reason} refuses later relay and file requests`, async () => {
    let clock = Date.now();
    const server = await startPanelServer({ now: () => clock });
    try {
      const { body } = await server.startSession();
      const session = server.service.store.findForRelay(body.id)!;
      const base = `/api/acp/relay/${body.id}`;
      const post = (action: string, json: unknown) => server.relay(`${base}/${action}`, { method: 'POST', json });
      if (reason !== 'no-agent') expect((await post('hello', { code: body.code })).status).toBe(200);
      if (reason === 'closed') await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
      else if (reason === 'replaced') await server.startSession(true);
      else if (reason === 'agent-exited') await post('bye', { reason });
      else if (reason === 'no-agent') {
        clock += WAITING_LIMIT_MS;
        server.service.sweepOnce();
      } else if (reason === 'idle' || reason === 'relay-lost') {
        server.service.store.apply(session, { type: 'connect' });
        if (reason === 'relay-lost') server.service.store.apply(session, { type: 'link-lost' });
        clock += reason === 'idle' ? IDLE_LIMIT_MS : RELAY_GRACE_MS;
        server.service.sweepOnce();
      } else if (reason === 'protocol-error' || reason === 'flood') {
        const payload = reason === 'flood' ? 'x'.repeat(MAXIMUM_FRAME_BYTES + 1) : '{';
        await post('frames', { frames: [{ seq: 1, payload }] });
        if (reason === 'flood') await post('frames', { frames: [{ seq: 2, payload }] });
      } else server.service.store.endConnection(session.connection, reason);
      expect(session.timing.endReason).toBe(reason);
      const events = await server.readEvents(body.id, list => list.some(event => event.type === 'ended'));
      expect(events.filter(event => event.type === 'ended')).toEqual([expect.objectContaining({ reason })]);
      expect((await post('frames', { frames: [] })).status).toBe(404);
      const before = session.link.lastReceived;
      expect(
        (
          await post('frames', {
            frames: [{ seq: before + 1, payload: JSON.stringify({ jsonrpc: '2.0', id: 90, method: 'fs/read_text_file', params: { sessionId: 'agent', path: '/workbench/example/file.yaml' } }) }],
          })
        ).status,
      ).toBe(404);
      expect(session.link.lastReceived).toBe(before);
      expect((await server.relay(`${base}/stream`)).status).toBe(404);
    } finally {
      await server.close();
    }
  }, 30_000);
}

test('losing server memory refuses a known session and the browser infers a restart', async () => {
  const server = await startPanelServer();
  try {
    const { body } = await server.startSession();
    server.restart();
    const events = await server.browser(`/api/acp/sessions/${body.id}/events`);
    expect(events.status).toBe(404);
    expect(streamEndReason(events.status)).toBe('server-restarted');
    const file = { jsonrpc: '2.0', id: 'after-restart', method: 'fs/read_text_file', params: { sessionId: 'agent', path: '/workbench/example/file.yaml' } };
    const reply = await server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', json: { frames: [{ seq: 1, payload: JSON.stringify(file) }] } });
    expect(reply.status).toBe(404);
    expect(await reply.text()).toBe('');
  } finally {
    await server.close();
  }
});

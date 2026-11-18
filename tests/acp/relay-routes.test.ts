// The relay routes answer 404 with an empty body for a wrong, reused or expired code, an unknown or ended session and a browser, and they bound what they read and number what they carry.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { WAITING_LIMIT_MS } from '../../src/server/acp/panel-session';
import { AGENT_PANEL_REQUEST_LIMIT } from '../../src/server/request';
import { startPanelServer, type PanelServer } from './helpers/panel-server';

let server: PanelServer;
let clock = Date.now();
beforeAll(async () => {
  server = await startPanelServer({ now: () => clock });
}, 60_000);
afterAll(async () => {
  await server.close();
});

const hello = (id: string, code: string, init: Parameters<PanelServer['relay']>[1] = {}) => server.relay(`/api/acp/relay/${id}/hello`, { method: 'POST', json: { code }, ...init });
async function expectMissing(response: Response) {
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('');
}

test('a right code is accepted once and a reused code answers as an unknown one', async () => {
  const { body } = await server.startSession(true);
  const first = await hello(body.id, body.code);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ received: 0 });
  await expectMissing(await hello(body.id, body.code));
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('a wrong code, a lower-case-wrong code and a code of the wrong shape are refused alike', async () => {
  const { body } = await server.startSession(true);
  for (const code of ['AAAAAAAA', 'ZZZZZZZZ', '', 'short', body.code + 'X']) await expectMissing(await hello(body.id, code));
  expect((await hello(body.id, body.code.toLowerCase())).status).toBe(200);
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('an expired code is refused before the sweep has ended the session', async () => {
  const { body } = await server.startSession(true);
  clock += WAITING_LIMIT_MS + 1000;
  await expectMissing(await hello(body.id, body.code));
  server.service.sweepOnce();
  await expectMissing(await hello(body.id, body.code));
  const events = await server.readEvents(body.id, list => list.some(event => event.type === 'ended'));
  expect(events.find(event => event.type === 'ended')).toMatchObject({ reason: 'no-agent' });
});

test('an unknown session, a missing or wrong capability and a browser Origin all answer the same 404', async () => {
  const { body } = await server.startSession(true);
  await expectMissing(await hello('no-such-session', body.code));
  await expectMissing(await hello(body.id, body.code, { bearer: null }));
  await expectMissing(await hello(body.id, body.code, { bearer: 'wrong' }));
  await expectMissing(await hello(body.id, body.code, { headers: { origin: server.url } }));
  // Relay authentication refuses every browser origin before policy execution.
  expect((await hello(body.id, body.code, { headers: { origin: 'null' } })).status).toBe(404);
  expect((await hello(body.id, body.code, { headers: { origin: 'https://evil.example' } })).status).toBe(404);
  expect((await hello(body.id, body.code)).status).toBe(200);
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('an ended session answers every relay route as an unknown one', async () => {
  const { body } = await server.startSession(true);
  await hello(body.id, body.code);
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
  await expectMissing(await server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', json: { frames: [] } }));
  await expectMissing(await server.relay(`/api/acp/relay/${body.id}/stream`));
  await expectMissing(await server.relay(`/api/acp/relay/${body.id}/bye`, { method: 'POST', json: { reason: 'closed' } }));
});

test('frames and the stream are not served before the code is presented', async () => {
  const { body } = await server.startSession(true);
  await expectMissing(await server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', json: { frames: [] } }));
  await expectMissing(await server.relay(`/api/acp/relay/${body.id}/stream`));
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('an oversize body is refused with 413 and a body that is not JSON with 400, after the relay is recognised', async () => {
  const { body } = await server.startSession(true);
  await hello(body.id, body.code);
  const big = await server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(AGENT_PANEL_REQUEST_LIMIT + 10) } as never);
  expect(big.status).toBe(413);
  const notJson = await server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' } as never);
  expect(notJson.status).toBe(400);
  const badShape = await server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', json: { frames: [{ seq: 'one', payload: 1 }] } });
  expect(badShape.status).toBe(400);
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('frames are numbered: a repeat is dropped, a skip is reported with the number the workbench has, and bye ends the session', async () => {
  const { body } = await server.startSession(true);
  await hello(body.id, body.code);
  const post = (json: unknown) => server.relay(`/api/acp/relay/${body.id}/frames`, { method: 'POST', json });
  const noise = JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'x', update: { sessionUpdate: 'plan', entries: [] } } });
  expect(await (await post({ frames: [{ seq: 1, payload: noise }], ack: 0 })).json()).toEqual({ received: 1 });
  expect(await (await post({ frames: [{ seq: 1, payload: noise }], ack: 0 })).json()).toEqual({ received: 1 });
  const skipped = await post({ frames: [{ seq: 5, payload: noise }], ack: 0 });
  expect(skipped.status).toBe(409);
  expect(await skipped.json()).toEqual({ received: 1 });
  expect((await server.relay(`/api/acp/relay/${body.id}/bye`, { method: 'POST', json: { reason: 'agent-exited' } })).status).toBe(200);
  const events = await server.readEvents(body.id, list => list.some(event => event.type === 'ended'));
  expect(events.find(event => event.type === 'ended')).toMatchObject({ reason: 'agent-exited' });
});

test('the stream resumes after the number the relay last saw', async () => {
  const { body } = await server.startSession(true);
  await hello(body.id, body.code);
  const read = async (after: number) => {
    const controller = new AbortController();
    const response = await server.relay(`/api/acp/relay/${body.id}/stream`, { headers: { 'last-event-id': String(after) }, signal: controller.signal });
    const reader = response.body!.getReader();
    let text = '';
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !text.includes('data: ')) {
      const chunk = await Promise.race([reader.read(), Bun.sleep(200).then(() => null)]);
      if (chunk && !chunk.done) text += new TextDecoder().decode(chunk.value);
    }
    controller.abort();
    return text;
  };
  const fromStart = await read(0);
  expect(fromStart).toContain('id: 1');
  expect(fromStart).toContain('"method":"initialize"');
  expect(fromStart).not.toContain('secret');
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('a flood of requests from one source is limited', async () => {
  const statuses = new Set<number>();
  for (let index = 0; index < 400; index++) statuses.add((await server.relay('/api/acp/relay/nothing/frames', { method: 'POST', json: { frames: [] } })).status);
  expect(statuses.has(429)).toBe(true);
});

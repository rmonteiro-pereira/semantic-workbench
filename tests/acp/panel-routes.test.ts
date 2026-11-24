// The browser routes of the panel: starting, owner checks, the page marker, prompts and ending.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { activeBrand } from '../../src/server/brand/bundle';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { connectionStatement } from '../../src/shared/agent-panel/statement';
import { startPanelServer, type PanelServer } from './helpers/panel-server';

let server: PanelServer;
beforeAll(async () => {
  useDefaultBrand();
  server = await startPanelServer();
}, 60_000);
afterAll(async () => {
  await server.close();
});

test('starting a session answers the code, the command, the statement and the scopes in plain words', async () => {
  const { response, body } = await server.startSession(true);
  expect(response.status).toBe(201);
  expect(body.code).toMatch(/^[A-Z2-9]{8}$/);
  expect(body.statement).toBe(connectionStatement(activeBrand().manifest.productName));
  expect(body.scopes).toEqual(['Read files you may read', 'Change files you may edit']);
  expect(body.command).toContain(`--session ${body.id}.${body.code}`);
  expect(body.command).not.toContain('SW_ACP_CREDENTIAL');
  expect(body.expiresAt).toBeGreaterThan(Date.now());
});

test('a second session needs confirmation and then replaces the first', async () => {
  const first = await server.startSession(true);
  const refused = await server.startSession(false);
  expect(refused.response.status).toBe(409);
  const second = await server.startSession(true);
  expect(second.response.status).toBe(201);
  const events = await server.readEvents(first.body.id, list => list.some(event => event.type === 'ended'));
  expect(events.find(event => event.type === 'ended')).toMatchObject({ reason: 'replaced' });
  await server.browser(`/api/acp/sessions/${second.body.id}`, { method: 'DELETE' });
});

test('a write without the page marker, or from another site, is refused and starts nothing', async () => {
  const before = server.service.store.size;
  expect((await server.browser('/api/acp/sessions', { method: 'POST', json: {}, headers: { 'x-sw-request': '0' } })).status).toBe(403);
  expect((await server.browser('/api/acp/sessions', { method: 'POST', json: {}, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
  expect(server.service.store.size).toBe(before);
});

test('an unknown session answers the same as any other the person does not own', async () => {
  for (const [method, path] of [
    ['GET', '/api/acp/sessions/nothing/events'],
    ['POST', '/api/acp/sessions/nothing/prompt'],
    ['POST', '/api/acp/sessions/nothing/cancel'],
    ['POST', '/api/acp/sessions/nothing/questions/q1'],
    ['DELETE', '/api/acp/sessions/nothing'],
  ] as const) {
    const response = await server.browser(path, { method, json: method === 'POST' ? { text: 'x' } : undefined });
    expect(response.status, path).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found.' });
  }
});

test('a prompt before the agent is connected is refused, and ending is final', async () => {
  const { body } = await server.startSession(true);
  const early = await server.browser(`/api/acp/sessions/${body.id}/prompt`, { method: 'POST', json: { text: 'hello' } });
  expect(early.status).toBe(409);
  expect((await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' })).status).toBe(200);
  const afterEnd = await server.readEvents(body.id, list => list.some(event => event.type === 'ended'));
  expect(afterEnd.find(event => event.type === 'ended')).toMatchObject({ reason: 'closed' });
  expect((await server.browser(`/api/acp/sessions/${body.id}/prompt`, { method: 'POST', json: { text: 'hello' } })).status).toBe(409);
});

test('a prompt must be text, and attached paths are refused without saying whether they exist', async () => {
  const { body } = await server.startSession(true);
  expect((await server.browser(`/api/acp/sessions/${body.id}/prompt`, { method: 'POST', json: { text: '' } })).status).toBe(400);
  expect((await server.browser(`/api/acp/sessions/${body.id}/prompt`, { method: 'POST', json: { text: 'x', files: 'not a list' } })).status).toBe(400);
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('events carry numbers and a reconnect continues after the last one', async () => {
  const { body } = await server.startSession(true);
  const first = await server.readEvents(body.id, list => list.length >= 1);
  expect(first[0]).toMatchObject({ type: 'session', state: 'waiting', seq: 1 });
  const none = await server.readEvents(body.id, () => false, first[0].seq, 400);
  expect(none).toEqual([]);
  await server.browser(`/api/acp/sessions/${body.id}`, { method: 'DELETE' });
});

test('malformed session options cannot create or replace a connection', async () => {
  const before = server.service.store.size;
  for (const body of ['{broken', '[]', 'null', '{"confirmReplace":"yes"}', '{"unknown":true}']) {
    const response = await server.browser('/api/acp/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(response.status).toBe(400);
  }
  expect(server.service.store.size).toBe(before);
});

// The gate refuses in the documented order and the real route answers the same statuses without revealing anything.
import { expect, test } from 'bun:test';
import { decideRequest } from '../../src/server/mcp/request-gate';
import { startLocalServer } from './helpers/local-server';

const good = { method: 'POST', origin: null, host: '127.0.0.1:4310', authorization: 'Bearer abc', contentType: 'application/json' };
const own = { port: 4310, capabilityMatches: (value: string | null) => value === 'abc' };

test('each check refuses with its status, in order', () => {
  expect(decideRequest(good, own)).toEqual({ allow: true });
  expect(decideRequest({ ...good, method: 'GET' }, own)).toMatchObject({ status: 405 });
  expect(decideRequest({ ...good, method: 'DELETE', origin: 'http://x' }, own)).toMatchObject({ status: 405 });
  for (const origin of ['http://127.0.0.1:5173', 'http://localhost:4310', 'null', '']) expect(decideRequest({ ...good, origin }, own), origin).toMatchObject({ status: 403, reason: 'origin' });
  for (const host of ['localhost.evil.example', 'evil.example:4310', '127.0.0.1:9999', '127.0.0.1', null, 'localhost:4310@evil'])
    expect(decideRequest({ ...good, host }, own), String(host)).toMatchObject({ status: 403, reason: 'host' });
  expect(decideRequest({ ...good, host: 'LOCALHOST:4310' }, own)).toEqual({ allow: true });
  expect(decideRequest({ ...good, authorization: null, host: 'evil' }, own)).toMatchObject({ status: 403 });
  expect(decideRequest({ ...good, authorization: null }, own)).toMatchObject({ status: 401 });
  expect(decideRequest({ ...good, authorization: 'Bearer wrong' }, own)).toMatchObject({ status: 401 });
  expect(decideRequest({ ...good, contentType: 'application/x-www-form-urlencoded' }, own)).toMatchObject({ status: 415 });
  expect(decideRequest({ ...good, contentType: 'text/plain' }, own)).toMatchObject({ status: 415 });
});

test('the mounted route refuses every unsafe request without revealing anything', async () => {
  const server = await startLocalServer();
  try {
    const send = (headers: Record<string, string>, method = 'POST') =>
      fetch(server.endpoint, { method, headers: { 'content-type': 'application/json', ...headers }, body: method === 'POST' ? '{}' : undefined });
    const bearer = { authorization: `Bearer ${server.capability()}` };
    const refused: [Response, number][] = [
      [await send({}), 401],
      [await send({ authorization: 'Bearer wrong' }), 401],
      [await send({ ...bearer, origin: 'http://127.0.0.1:5173' }), 403],
      [await send({ ...bearer, origin: 'null' }), 403],
      [await send({ ...bearer, host: 'localhost.evil.example' }), 403],
      [await send({ ...bearer, 'content-type': 'application/x-www-form-urlencoded' }), 415],
      [await send(bearer, 'GET'), 405],
      [await send(bearer, 'DELETE'), 405],
    ];
    for (const [response, status] of refused) {
      expect(response.status).toBe(status);
      // The shared local check answers a foreign Host with its own short word; nothing names a tool, a version or the capability.
      expect(['', 'Forbidden']).toContain(await response.text());
      expect(response.headers.get('www-authenticate')).toBeNull();
    }
  } finally {
    await server.close();
  }
});

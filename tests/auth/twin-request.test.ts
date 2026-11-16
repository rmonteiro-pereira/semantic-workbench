// Twin paths preserve parameter encoding and never carry browser or network credentials.
import { expect, test } from 'bun:test';
import { buildTwinRequest } from '../../src/server/auth/twin-request';

test('twins encode parameters, sort query keys and attach only a JSON content type', async () => {
  const controller = new AbortController();
  const request = buildTwinRequest('files.save', {
    params: { slug: 'sales?x/#é', '*': 'docs/a?b#é.yaml' },
    query: { z: 'last', a: ['first', 'second'] },
    body: { baseHash: null, source: 'text' },
    signal: controller.signal,
  });
  expect(request.url).toBe('http://operation.internal/api/projects/sales%3Fx%2F%23%C3%A9/files/docs/a%3Fb%23%C3%A9.yaml?a=first&a=second&z=last');
  expect([...request.headers]).toEqual([['content-type', 'application/json']]);
  expect(await request.json()).toEqual({ baseHash: null, source: 'text' });
  controller.abort();
  expect(request.signal.aborted).toBe(true);
  for (const header of ['Cookie', 'Authorization', 'Origin', 'Host', 'Forwarded', 'X-Forwarded-For']) expect(request.headers.has(header)).toBe(false);
});

test('twins refuse unknown operations, missing parameters, dot segments and oversized bodies', () => {
  expect(() => buildTwinRequest('missing.operation', { params: {} })).toThrow('no twin');
  expect(() => buildTwinRequest('files.read', { params: {} })).toThrow('Missing');
  expect(() => buildTwinRequest('files.read', { params: { slug: '..', '*': 'a.yaml' } })).toThrow('addressable');
  expect(() => buildTwinRequest('files.read', { params: { slug: 'sales', '*': 'docs/../a.yaml' } })).toThrow('addressable');
  expect(() => buildTwinRequest('git.commit', { params: { slug: 'sales' }, body: { message: 'é'.repeat(64_000) } })).toThrow('request limit');
});

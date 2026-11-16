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

test('generated hostile parameters preserve every intended row and encoded value', async () => {
  const { operationInventory } = await import('../../src/server/auth/operation-inventory');
  const { routeFor } = await import('../../src/server/auth/route-actions');
  const hostile = ['../', '%2f', '?', '#', '\u0000', '\n', 'é文', 'x'.repeat(2048), '/', '%', '\ud800', 'a?b#c'];
  const shapes = new Set<string>();
  let generated = 0;
  for (const [row, operation] of Object.entries(operationInventory.operations)) {
    const names = [...row.matchAll(/:([a-z]+)|\*/g)].map(match => match[1] ?? '*');
    if (operation.dispatch !== 'twin' || names.length === 0) continue;
    shapes.add(row);
    for (const name of names) {
      for (let index = 0; index < 500; index++) {
        const value = hostile[index % hostile.length] + index;
        const params = Object.fromEntries(names.map(key => [key, key === name ? value : 'fixture']));
        generated++;
        let request: Request;
        try {
          request = buildTwinRequest(operation.id, { params });
        } catch {
          continue;
        }
        const pathname = new URL(request.url).pathname;
        expect(routeFor(request.method, pathname, 'server')?.row.path, row).toBe(row);
        const encoded = name === '*' ? value.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(value);
        expect(pathname, `${row}: ${JSON.stringify(value)}`).toContain(encoded);
      }
    }
  }
  expect(generated).toBeGreaterThanOrEqual(shapes.size * 500);
}, 30_000);

import { BadRequestError } from '../../src/server/projects/errors';

test('caller mistakes have a request error that adapters can answer as a client failure', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const body of [circular, 1n]) {
    expect(() => buildTwinRequest('projects.create', { params: {}, body })).toThrow(BadRequestError);
  }
  expect(() => buildTwinRequest('files.read', { params: { slug: 'sales', '*': '\ud800' } })).toThrow(BadRequestError);
  expect(() => buildTwinRequest('files.read', { params: { slug: 'sales', '*': 'file.yaml' }, body: {} })).toThrow(BadRequestError);
  expect(() => buildTwinRequest('files.read', { params: {} })).toThrow(BadRequestError);
});

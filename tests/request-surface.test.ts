// Tests definition surfaces carried by authenticated operation callers.
import { expect, test } from 'bun:test';
import { attachRequestSurface, requestSurface } from '../src/server/auth/request-surface';

import { mintCaller } from '../src/server/auth/caller';
import { localPrincipal } from '../src/server/auth/principal';

for (const [origin, surface, expected] of [
  ['http', 'browser', 'browser'],
  ['http', 'agent', 'agent'],
  ['http', undefined, 'agent'],
  ['mcp', 'browser', 'agent'],
  ['mcp', undefined, 'agent'],
] as const) {
  test(`surface for ${origin} caller with ${surface ?? 'absent'} metadata`, () => {
    const request = new Request('http://localhost/api/preview/catalog');
    expect(requestSurface(request)).toBe('agent');
    attachRequestSurface(request, mintCaller({ principal: localPrincipal(), origin, surface }));
    expect(requestSurface(request)).toBe(expected);
  });
}

test('the local preview entry point needs browser metadata even without an Origin', async () => {
  const { testWorkspace } = await import('./helpers/temp-data-dir');
  using fixture = await testWorkspace();
  const { slug } = await fixture.ws.loadExample('mapped-commerce');
  const url = `http://localhost/api/preview/catalog?project=${slug}`;
  const refused = await fixture.handler(new Request(url));
  expect(refused.status).toBe(404);
  expect(await refused.text()).toBe('Not found');
  const browser = await fixture.handler(new Request(url, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  expect(browser.status).toBe(200);
  expect((await browser.json()).mappings.length).toBeGreaterThan(0);
  const dev = await fixture.handler(new Request(url, { headers: { 'Sec-Fetch-Site': 'same-site', Origin: 'http://localhost:5173' } }));
  expect(dev.status).toBe(200);
});

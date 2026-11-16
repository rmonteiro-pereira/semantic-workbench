// Tests the interim credential seam without confusing a person's bearer with their browser session.
import { expect, test } from 'bun:test';
import { attachRequestSurface, requestSurface, surfaceFromCredential } from '../src/server/auth/request-surface';

for (const [mode, session, site, allowed, expected] of [
  ['server', true, null, true, 'browser'],
  ['server', false, 'same-origin', true, 'agent'],
  ['server', false, null, true, 'agent'],
  ['local', false, 'same-origin', true, 'browser'],
  ['local', false, 'same-site', true, 'browser'],
  ['local', false, null, true, 'agent'],
  ['local', false, 'none', true, 'agent'],
  ['local', false, 'cross-site', true, 'agent'],
  ['local', false, 'same-origin', false, 'agent'],
] as const) {
  test(`surface for ${mode} session ${session} fetch ${site} allowed origin ${allowed}`, () => {
    const request = new Request('http://localhost/api/preview/catalog', { headers: site ? { 'sec-fetch-site': site } : {} });
    const credential = { mode, session, originAllowed: allowed };
    expect(requestSurface(request)).toBe('agent');
    expect(surfaceFromCredential(request, credential)).toBe(expected);
    attachRequestSurface(request, credential);
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

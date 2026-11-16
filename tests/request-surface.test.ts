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

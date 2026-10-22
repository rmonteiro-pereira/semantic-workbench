// Checks the browser request boundary without a network server.
import { expect, test } from 'bun:test';
import { validCsrf } from '../../server/auth/csrf';
const origin = 'https://workbench.example';

test('writes require both the request marker and exact public origin', async () => {
  for (const headers of [
    {},
    { Origin: origin },
    { 'X-SW-Request': '1' },
    { Origin: 'https://foreign.example', 'X-SW-Request': '1' },
  ]) {
    expect(
      await validCsrf(
        new Request(origin, { method: 'POST', headers: headers as Record<string, string> }),
        origin,
      ),
    ).toBe(false);
  }
  expect(
    await validCsrf(
      new Request(origin, {
        method: 'POST',
        headers: { Origin: origin, 'X-SW-Request': '1' },
      }),
      origin,
    ),
  ).toBe(true);
});

test('logout forms require their session token and the origin', async () => {
  for (const [source, token, allowed] of [
    [origin, 'secret', true],
    [origin, 'wrong', false],
    ['https://foreign.example', 'secret', false],
  ] as const) {
    const request = new Request(origin + '/auth/logout', {
      method: 'POST',
      headers: { Origin: source },
      body: new URLSearchParams({ csrf: token }),
    });
    expect(await validCsrf(request, origin, 'secret')).toBe(allowed);
  }
});

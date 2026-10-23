// Drives browser sign-in through the real handler with the isolated provider and workspace.
import { beforeAll, expect, test } from 'bun:test';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { startMockOidc } from '../helpers/mock-oidc';
import { authWorkspace } from '../helpers/auth-workspace';
import { oidcConfig } from '../helpers/server-auth';
import { createServerAuthentication } from '../../server/auth/authentication';
import { createHandler } from '../../server/handler';

beforeAll(useDefaultBrand);

test('server sign-in, No access, overage, cookie events and logout', async () => {
  const provider = await startMockOidc();
  const fixture = await authWorkspace();
  const auth = await createServerAuthentication(
    fixture.ws,
    oidcConfig(provider.issuer, provider.graphUrl),
  );
  const handler = createHandler(fixture.ws, auth);
  const origin = 'http://127.0.0.1:4310';
  try {
    const anonymous = await handler(new Request(origin + '/api/me'));
    expect(anonymous.status).toBe(401);
    for (const [username, allowed] of [
      ['alice', true],
      ['erin', false],
      ['gina', false],
      ['bob', true],
      ['olga', true],
    ] as const) {
      const first = await handler(new Request(origin + '/catalog?view=one'));
      expect(first.status).toBe(302);
      const attemptCookie = first.headers.getSetCookie()[0].split(';')[0];
      const callback = await provider.authorizeAs(username, first.headers.get('location')!);
      const signedIn = await handler(new Request(callback, { headers: { Cookie: attemptCookie } }));
      expect(signedIn.headers.get('location')).toBe(
        allowed ? '/catalog?view=one' : '/auth/no-access',
      );
      const cookie = signedIn.headers
        .getSetCookie()
        .find(value => value.startsWith('sw-session='))!
        .split(';')[0];
      const headers = { Cookie: cookie };
      const me = await handler(new Request(origin + '/api/me', { headers }));
      expect(me.status).toBe(allowed ? 200 : 403);
      const body = await me.json();
      if (!allowed) {
        expect(body).toEqual({ error: 'no access' });
        const page = await handler(new Request(origin + '/auth/no-access', { headers }));
        const html = await page.text();
        expect(html).toContain('An Admin must grant you access');
        expect(html).not.toMatch(/LEAK-|sales-metrics/);
        const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
        const bad = await handler(
          new Request(origin + '/auth/logout', {
            method: 'POST',
            headers: { ...headers, Origin: origin },
            body: new URLSearchParams({ csrf: 'wrong' }),
          }),
        );
        expect(bad.status).toBe(403);
        const logout = await handler(
          new Request(origin + '/auth/logout', {
            method: 'POST',
            headers: { ...headers, Origin: origin },
            body: new URLSearchParams({ csrf }),
          }),
        );
        expect(logout.status).toBe(303);
      } else {
        expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken|idToken/);
        const stream = await handler(new Request(origin + '/api/events', { headers }));
        const reader = stream.body!.getReader();
        await reader.read();
        const logout = await handler(
          new Request(origin + '/auth/logout', {
            method: 'POST',
            headers: { ...headers, Origin: origin, 'X-SW-Request': '1' },
          }),
        );
        expect(logout.status).toBe(200);
        expect(new TextDecoder().decode((await reader.read()).value)).toContain('session-ended');
        expect((await reader.read()).done).toBe(true);
      }
    }
    provider.fail('graph-check', 'error');
    const first = await handler(new Request(origin + '/'));
    const callback = await provider.authorizeAs('olga', first.headers.get('location')!);
    const signedIn = await handler(
      new Request(callback, {
        headers: { Cookie: first.headers.getSetCookie()[0].split(';')[0] },
      }),
    );
    expect(signedIn.headers.get('location')).toBe('/auth/no-access');
    const cookie = signedIn.headers.getSetCookie().find(value => value.startsWith('sw-session='))!;
    const page = await handler(
      new Request(origin + '/auth/no-access', {
        headers: { Cookie: cookie.split(';')[0] },
      }),
    );
    expect(await page.text()).toContain('Group membership could not be resolved');
    const signedOut = await handler(new Request(origin + '/auth/signed-out'));
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get('set-cookie')).toBeNull();
  } finally {
    auth.close();
    fixture.dispose();
    await provider.stop();
  }
}, 30000);

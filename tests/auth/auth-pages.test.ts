// Checks that public authentication pages reveal identity only and need no scripts.
import { expect, test } from 'bun:test';
import { authPage } from '../../server/routes/auth';
import { localPrincipal } from '../../server/auth/principal';

test('No access escapes identity and includes a script-free sign-out form', async () => {
  const principal = { ...localPrincipal(), name: '<script>bad</script>', username: 'guest' };
  const response = authPage('no-access', { principal, csrf: 'token' });
  const body = await response.text();
  expect(body).toContain('&lt;script&gt;');
  expect(body).not.toContain('<script>');
  expect(body).toContain('An Admin must grant you access');
  expect(body).toContain('An Admin must grant you access to this workbench.</p>');
  expect(body).toContain('name="csrf"');
  expect(body).toContain('/auth/logout');
  expect(body).not.toMatch(/LEAK-|sales-metrics|projects|files|count/);
});

test('Signed out stays signed out and errors offer a safe retry', async () => {
  const response = authPage('signed-out');
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
  expect(await response.text()).toContain('Sign in again');
  const error = await authPage('error', { reason: 'tenant mismatch', returnTo: '/catalog' }).text();
  expect(error).toContain('tenant mismatch');
  expect(error).toContain('Try again');
});

test('No access routing reads only the session identity and csrf token', async () => {
  const { createAuthRoutes } = await import('../../server/routes/auth');
  const principal = { ...localPrincipal(), grants: [], name: 'Identity only' };
  const session = new Proxy(
    {
      principal,
      csrf: 'csrf-token',
      id: 'private',
      createdAt: 0,
      lastSeenAt: 0,
      tokens: { accessToken: 'secret', expiresAt: 0 },
    },
    {
      get(target, property) {
        if (property !== 'principal' && property !== 'csrf' && property !== 'then') {
          throw new Error('Renderer received private session field: ' + String(property));
        }
        return Reflect.get(target, property);
      },
    },
  );
  const route = createAuthRoutes({
    session: async () => session,
    login: async () => new Response(),
    callback: async () => new Response(),
    logout: async () => new Response(),
    frontChannelLogout: async () => new Response(),
  });
  const response = await route(new Request('https://workbench.example/auth/no-access'));
  expect(await response!.text()).toContain('Identity only');
});

test('identity pages share script-free button and link styles', async () => {
  const { createAuthRoutes } = await import('../../server/routes/auth');
  const route = createAuthRoutes({
    session: async () => null,
    login: async () => new Response(),
    callback: async () => new Response(),
    logout: async () => new Response(),
    frontChannelLogout: async () => new Response(),
  });
  const stylesheet = await route(new Request('https://workbench.example/auth/style.css'));
  expect(stylesheet!.headers.get('content-type')).toBe('text/css');
  const css = await stylesheet!.text();
  expect(css).toContain('button,a{');
  expect(css).toContain('border-radius:');
  for (const page of ['no-access', 'signed-out', 'error'] as const) {
    const html = await authPage(page, { principal: localPrincipal() }).text();
    expect(html).toContain('href="/auth/style.css"');
    expect(html).not.toContain('<script');
  }
});

test('the HTTP error mapper clears the attempt cookie and preserves a safe return path', async () => {
  const { errorResponse } = await import('../../server/routes/http');
  const { SignInError } = await import('../../server/auth/sign-in-error');
  for (const origin of ['https://workbench.example', 'http://127.0.0.1:4310']) {
    const error = new SignInError('attempt-invalid', '/catalog');
    const response = errorResponse(error, origin);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('set-cookie')).toContain('sw-auth=');
    const html = await response.text();
    expect(html).toContain('Expired or replayed sign-in attempt');
    expect(html).toContain('returnTo=%2Fcatalog');
    expect(error.returnTo).toBe('/catalog');
  }
});

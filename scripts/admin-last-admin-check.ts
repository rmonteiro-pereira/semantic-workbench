import assert from 'node:assert/strict';
import { expect, type Browser, type Route } from '@playwright/test';
import { useDefaultBrand } from '../tests/helpers/brand-fixture';
import { authWorkspace } from '../tests/helpers/auth-workspace';
import { oidcTransport } from '../tests/helpers/oidc-transport';
import { createOidcClient } from '../src/server/auth/oidc';
import { createServerAuthentication } from '../src/server/auth/authentication';
import { createHandler } from '../src/server/handler';
import { adminArea, adminGeometry } from './helpers/admin-browser';

async function forward(route: Route, handler: ReturnType<typeof createHandler>) {
  const incoming = route.request();
  if (new URL(incoming.url()).pathname === '/api/events') {
    await route.abort();
    return;
  }
  const method = incoming.method();
  const response = await handler(
    new Request(incoming.url(), {
      method,
      headers: await incoming.allHeaders(),
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: incoming.postData() }),
    }),
  );
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  });
}

/** Exercises the real guard without bootstrap recovery, using the actual handler in process. */
export async function lastAdminBrowserCheck(browser: Browser) {
  useDefaultBrand();
  using fixture = await authWorkspace();
  const transport = await oidcTransport();
  // Production requires recovery identities; this fixture isolates the last ordinary Admin guard.
  const config = { ...transport.config, bootstrapAdmins: { emails: [], ids: [] } };
  const client = await createOidcClient(config, { fetch: transport.fetch });
  const auth = await createServerAuthentication(fixture.ws, config, client);
  const handler = createHandler(fixture.ws, { ...auth, staticRoot: 'dist' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const initial = await handler(new Request(config.publicUrl + '/'));
    const callback = transport.authorize(initial.headers.get('location')!, 'dave');
    const signedIn = await handler(
      new Request(callback, {
        headers: { Cookie: initial.headers.getSetCookie()[0].split(';')[0] },
      }),
    );
    const cookie = signedIn.headers.getSetCookie().find(value => value.startsWith('sw-session='));
    assert(cookie, 'Mock sign-in did not issue a session');
    await context.addCookies([
      {
        name: 'sw-session',
        value: cookie.split(';')[0].slice('sw-session='.length),
        url: config.publicUrl,
      },
    ]);
    await context.route(config.publicUrl + '/**', route => forward(route, handler));
    const page = await context.newPage();
    const manifest = page.waitForResponse(response => new URL(response.url()).pathname === '/brand/brand.json');
    await page.goto(config.publicUrl);
    assert.equal((await manifest).status(), 200, 'The in-process server must load its brand');
    const users = await adminArea(page, 'Users & groups');
    await users.getByRole('button', { name: 'Actions for Dave Dias', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Deactivate', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Deactivate', exact: true });
    await dialog.getByLabel('Reason', { exact: true }).fill('Verify the last administrator guard');
    await dialog.getByRole('button', { name: 'Confirm deactivate', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(/last.admin/i);
    await adminGeometry(page, 'last-admin-refusal');
  } finally {
    await context.close();
    auth.close();
  }
}

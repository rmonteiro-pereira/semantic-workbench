// Captures the last-administrator guard through the real in-process handler. Usage: bun scripts/ui-review/last-admin-state.ts OUTPUT.
// Uses the same socketless identity transport and temporary access fixture as admin-last-admin-check.ts.
import { chromium, type Route } from '@playwright/test';
import { useDefaultBrand } from '../../tests/helpers/brand-fixture';
import { authWorkspace } from '../../tests/helpers/auth-workspace';
import { oidcTransport } from '../../tests/helpers/oidc-transport';
import { createOidcClient } from '../../src/server/auth/oidc';
import { createServerAuthentication } from '../../src/server/auth/authentication';
import { createHandler } from '../../src/server/handler';
import { adminArea } from '../helpers/admin-browser';
import { authViewports } from '../helpers/sign-in';
import { captureThemes, capture, failure } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
useDefaultBrand();
using fixture = await authWorkspace();
const transport = await oidcTransport();
transport.config.directory.overage = 'off';
const config = { ...transport.config, bootstrapAdmins: { emails: [], ids: [] } };
const client = await createOidcClient(config, { fetch: transport.fetch });
const auth = await createServerAuthentication(fixture.ws, config, client);
const handler = createHandler(fixture.ws, { ...auth, staticRoot: 'dist' });
const browser = await chromium.launch();

async function forward(route: Route) {
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
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
}

try {
  for (const theme of captureThemes()) {
    const context = await browser.newContext();
    await context.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
    const initial = await handler(new Request(config.publicUrl + '/'));
    const callback = transport.authorize(initial.headers.get('location')!, 'dave');
    const signedIn = await handler(new Request(callback, { headers: { Cookie: initial.headers.getSetCookie()[0].split(';')[0] } }));
    const cookie = signedIn.headers.getSetCookie().find(value => value.startsWith('sw-session='));
    if (!cookie) throw new Error('Mock sign-in did not issue a session');
    await context.addCookies([{ name: 'sw-session', value: cookie.split(';')[0].slice('sw-session='.length), url: config.publicUrl }]);
    await context.route(config.publicUrl + '/**', forward);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(config.publicUrl);
      const users = await adminArea(page, 'Users & groups');
      await users.getByRole('button', { name: 'Actions for Dave Dias', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Deactivate', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Deactivate', exact: true });
      await dialog.getByLabel('Reason', { exact: true }).fill('Administrator access protection');
      await dialog.getByRole('button', { name: 'Confirm deactivate', exact: true }).click();
      await dialog
        .getByRole('alert')
        .filter({ hasText: /last.admin/i })
        .waitFor();
      for (const [width, height] of authViewports) {
        await page.setViewportSize({ width, height });
        await capture(page, { output, mode: 'server', theme, width, height, user: 'admin' }, 'protection', 'last-admin');
      }
    } catch (error) {
      failure({ output, mode: 'server', theme, width: 1440, height: 900, user: 'admin' }, 'protection', 'last-admin', error);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  auth.close();
}

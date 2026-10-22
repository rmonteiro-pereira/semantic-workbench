// Shares browser identity assertions across provider and container checks.
import assert from 'node:assert/strict';
import { expect, type Browser, type Page, type Route } from '@playwright/test';
import { TEST_USERS, type TestUserName } from '../../tests/helpers/auth-identities';
import { screenshotPath } from './screenshots';
import { layoutProblems } from './layout-geometry';

/** Supported authentication viewports, including the narrow phone layout. */
export const authViewports = [
  [390, 844],
  [1280, 720],
  [1440, 900],
  [2560, 1440],
] as const;
/** Provider-specific login controls, sharing all application assertions. */
export type SignInTarget = { url: string; issuer: string; kind: 'entra' | 'keycloak' };

/** Prints a named success only after all assertions in that step pass. */
export async function check(name: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${name}`);
}

/** Rejects provider credentials in browser-visible data while allowing a CSRF form token. */
export function assertNoCredentials(value: unknown) {
  const text = JSON.stringify(value);
  assert(!/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/.test(text), 'JWT exposed to the browser');
  assert(
    !/"(?:access_token|refresh_token|id_token|accessToken|refreshToken|idToken)"/.test(text),
    'Provider credential field exposed to the browser',
  );
}

/** Checks effective roles and their grant provenance from parsed API data. */
export function assertPerson(value: any, username: TestUserName) {
  assert.equal(value.name, TEST_USERS[username].name);
  if (username === 'alice' || username === 'olga') {
    assert(
      value.roleSources.some((source: any) => source.roleId === 'editor' && source.via === 'group'),
      'Sales Editor must come from the group grant',
    );
  }
  if (username === 'bob') {
    assert(
      value.roleSources.some(
        (source: any) => source.roleId === 'steward' && source.via === 'email',
      ),
      'Steward must come from the case-insensitive address grant',
    );
  }
  assertNoCredentials(value);
}

/** Navigates directly to the provider and signs in, preserving the requested workspace path. */
export async function signIn(page: Page, target: SignInTarget, username: TestUserName) {
  const start = performance.now();
  const path = '/?auth-check=return';
  const response = await page.goto(target.url + path);
  assert(response);
  let first = response.request();
  while (first.redirectedFrom()) first = first.redirectedFrom()!;
  const initial = await first.response();
  assert.equal(initial?.status(), 302);
  assert(initial?.headers().location?.startsWith(target.issuer));
  assert(page.url().startsWith(target.issuer), 'First navigation must end at the provider');
  if (target.kind === 'keycloak') {
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(`test-${username}`);
    await page.locator('#kc-login').click();
  } else {
    await page.getByRole('button', { name: TEST_USERS[username].name, exact: true }).click();
  }
  if (username === 'erin' || username === 'gina') {
    await deniedPerson(page, target, username);
    return;
  }
  await signedInPerson(page, target, username, start);
}

async function deniedPerson(page: Page, target: SignInTarget, username: 'erin' | 'gina') {
  await expect(page.getByRole('heading', { name: 'No access', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText(TEST_USERS[username].name);
  let address: string = TEST_USERS[username].email;
  if (username === 'gina') {
    address = target.kind === 'entra' ? TEST_USERS.gina.upn : 'gina';
  }
  await expect(page.locator('main')).toContainText(address);
  assert.equal((await page.request.get(target.url + '/api/me')).status(), 403);
  const projects = await page.request.get(target.url + '/api/projects');
  assert.equal(projects.status(), 403);
  assert.deepEqual(await projects.json(), { error: 'no access' });
}

async function signedInPerson(
  page: Page,
  target: SignInTarget,
  username: TestUserName,
  start: number,
) {
  await expect(page.getByRole('button', { name: 'Person menu', exact: true })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
  await expect(page.locator('.workspace-sidebar')).toContainText('SHARED WORKSPACE');
  assert.equal(new URL(page.url()).search, '?auth-check=return');
  assert(performance.now() - start < 5000, `Sign-in as ${username} exceeded 5 seconds`);
  const me = await page.request.get(target.url + '/api/me');
  assert.equal(me.status(), 200);
  assertPerson(await me.json(), username);
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await expect(page.getByRole('menu')).toContainText(TEST_USERS[username].name);
  if (username === 'alice' || username === 'olga') {
    await expect(page.getByRole('menu')).toContainText('Editor');
  }
  if (username === 'bob') await expect(page.getByRole('menu')).toContainText('Steward');
  await page.keyboard.press('Escape');
}

/** Captures a page at every supported viewport after checking control geometry. */
export async function authGeometry(page: Page, name: string) {
  for (const [width, height] of authViewports) {
    await page.setViewportSize({ width, height });
    assert.deepEqual(await layoutProblems(page), [], `${name} at ${width}×${height}`);
    if (name === 'person-menu') {
      const trigger = await page
        .getByRole('button', { name: 'Person menu', exact: true })
        .boundingBox();
      const title = await page.locator('.workspace-title').boundingBox();
      assert(trigger && title);
      assert(
        trigger.y < title.y + title.height && title.y < trigger.y + trigger.height,
        'Person menu must stay on the first header row',
      );
      const summary = page.locator('.person-summary');
      await expect(summary).toBeVisible();
      await expect(summary).not.toHaveAttribute('role', 'menuitem');
      await expect(summary.locator('[tabindex], button, a')).toHaveCount(0);
      await expect(page.getByRole('menu')).toHaveAccessibleName('Person menu for Alice Andrade');
      await expect(page.getByRole('menuitem')).toHaveCount(2);
    }
    await page.screenshot({ path: screenshotPath(`/tmp/workbench-auth-${name}-${width}.png`) });
  }
}

/** Signs out through the native form and proves that the signed-out page remains passive. */
export async function signOut(page: Page, target: SignInTarget) {
  const trigger = page.getByRole('button', { name: 'Person menu', exact: true });
  if (await trigger.isVisible()) {
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  }
  if (target.kind === 'keycloak') {
    await page.waitForURL(
      url => url.href.startsWith(target.issuer) || url.pathname === '/auth/signed-out',
    );
    if (page.url().startsWith(target.issuer)) await page.locator('#kc-logout').click();
  }
  await expect(page.getByRole('heading', { name: 'Signed out', exact: true })).toBeVisible();
  await page.reload();
  assert.equal(page.url(), target.url + '/auth/signed-out');
  await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
}

/** Runs the shared identity, native sign-out, storage and responsive-page checks. */
export async function signInChecks(browser: Browser, target: SignInTarget) {
  const users = (Object.keys(TEST_USERS) as TestUserName[]).filter(
    username => target.kind !== 'keycloak' || username !== 'olga',
  );
  for (const username of users) await checkPerson(browser, target, username);
  const page = await browser.newPage();
  try {
    await page.goto(target.url + '/auth/callback?error=access_denied');
    await expect(page.getByRole('heading', { name: 'Sign-in error' })).toBeVisible();
    await authGeometry(page, 'sign-in-error');
  } finally {
    await page.close();
  }
}

// Every API body is read in the test process before the page gets it: reading bodies from the
// page side waits forever on responses the app never consumes. The live-update stream is left
// alone because it never ends.
function isInspectedApi(url: URL, target: SignInTarget) {
  return (
    url.origin === new URL(target.url).origin &&
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/events'
  );
}

async function forwardInspected(route: Route, findings: string[]) {
  const response = await route.fetch({ maxRedirects: 0 });
  if (response.headers()['content-type']?.includes('application/json')) {
    try {
      assertNoCredentials(await response.json());
    } catch (error) {
      findings.push(`${route.request().url()}: ${(error as Error).message}`);
    }
  }
  await route.fulfill({ response });
}

async function checkPerson(browser: Browser, target: SignInTarget, username: TestUserName) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const findings: string[] = [];
  let identityRequests = 0;
  page.on('request', request => {
    if (request.url() === target.url + '/api/me') identityRequests++;
  });
  await context.route(
    url => isInspectedApi(url, target),
    route => forwardInspected(route, findings),
  );
  try {
    await check(`sign-in ${username}`, () => signIn(page, target, username));
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    assert.deepEqual(findings, [], 'Provider credentials reached the browser');
    if (username !== 'erin' && username !== 'gina') assert.equal(identityRequests, 1);
    if (username === 'alice') {
      await page.getByRole('button', { name: 'Person menu' }).click();
      await authGeometry(page, 'person-menu');
      await page.keyboard.press('Escape');
    }
    if (username === 'erin') await authGeometry(page, 'no-access');
    assertNoCredentials(
      await page.evaluate(() => ({
        cookie: document.cookie,
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    );
    assert(!(await page.evaluate(() => document.cookie)).includes('sw-session'));
    await check(`sign-out ${username}`, () => signOut(page, target));
    if (username === 'alice') {
      await authGeometry(page, 'signed-out');
      await page.getByRole('link', { name: 'Sign in again' }).click();
      assert(page.url().startsWith(target.issuer));
    }
  } finally {
    await context.close();
  }
}

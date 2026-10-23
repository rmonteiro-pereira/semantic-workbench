// Shares browser identity assertions across provider and container checks.
import assert from 'node:assert/strict';
import { expect, type Browser, type Page, type Route } from '@playwright/test';
import { TEST_CLIENTS, TEST_USERS, type TestUserName } from '../../tests/helpers/auth-identities';
import { screenshotPath } from './screenshots';
import { layoutProblems } from './layout-geometry';
import { smallTextProblems, textCollisionProblems } from './text-geometry';

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

/** A role a person is expected to hold, how the person menu names it and where it comes from. */
export type ExpectedRole = { roleId: string; name: string; via: 'group' | 'email'; reason: string };

// The roles the default fixture grants give; people without an entry are not checked here.
const DEFAULT_ROLES: Partial<Record<TestUserName, ExpectedRole>> = {
  alice: {
    roleId: 'editor',
    name: 'Editor',
    via: 'group',
    reason: 'Sales Editor must come from the group grant',
  },
  olga: {
    roleId: 'editor',
    name: 'Editor',
    via: 'group',
    reason: 'Sales Editor must come from the group grant',
  },
  bob: {
    roleId: 'steward',
    name: 'Steward',
    via: 'email',
    reason: 'Steward must come from the case-insensitive address grant',
  },
};

/** Checks effective roles and their grant provenance from parsed API data. */
export function assertPerson(
  value: any,
  username: TestUserName,
  expected: ExpectedRole | undefined = DEFAULT_ROLES[username],
) {
  assert.equal(value.name, TEST_USERS[username].name);
  if (expected) {
    const held = value.roleSources.some(
      (source: any) => source.roleId === expected.roleId && source.via === expected.via,
    );
    assert(held, expected.reason);
  }
  assertNoCredentials(value);
}

/** Navigates directly to the provider and signs in, preserving the requested workspace path. */
export async function signIn(
  page: Page,
  target: SignInTarget,
  username: TestUserName,
  expected: ExpectedRole | undefined = DEFAULT_ROLES[username],
) {
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
  await signedInPerson(page, target, { username, start, expected });
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
  person: { username: TestUserName; start: number; expected?: ExpectedRole },
) {
  const { username, start, expected } = person;
  await expect(page.getByRole('button', { name: 'Person menu', exact: true })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
  await expect(page.locator('.workspace-sidebar')).toContainText('SHARED WORKSPACE');
  assert.equal(new URL(page.url()).search, '?auth-check=return');
  assert(performance.now() - start < 5000, `Sign-in as ${username} exceeded 5 seconds`);
  const me = await page.request.get(target.url + '/api/me');
  assert.equal(me.status(), 200);
  assertPerson(await me.json(), username, expected);
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await expect(page.getByRole('menu')).toContainText(TEST_USERS[username].name);
  if (expected) await expect(page.getByRole('menu')).toContainText(expected.name);
  await page.keyboard.press('Escape');
}

/** Captures a page at every supported viewport after checking control geometry. */
export async function authGeometry(page: Page, name: string) {
  const original = page.viewportSize();
  for (const [width, height] of authViewports) {
    await page.setViewportSize({ width, height });
    assert.deepEqual(await layoutProblems(page), [], `${name} at ${width}×${height}`);
    const scope = (await page.locator('dialog[open]').count()) ? 'dialog[open]' : 'body';
    assert.deepEqual(
      await smallTextProblems(page, scope),
      [],
      `${name} text size at ${width}×${height}`,
    );
    assert.deepEqual(
      await textCollisionProblems(page, scope),
      [],
      `${name} text collisions at ${width}×${height}`,
    );
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
  // Later steps of the same check must not inherit the largest size.
  if (original) await page.setViewportSize(original);
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

/**
 * The sidebar's note about files the person cannot open sits in the size of the file rows, and
 * the footer says the folders are on the server instead of on this machine.
 */
async function sidebarNotesChecks(page: Page) {
  const size = await page
    .locator('.hidden-files')
    .evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  assert(size <= 13, `The hidden-files line is drawn at ${size}px, larger than the file rows`);
  const location = page.locator('.workspace-sidebar .local');
  await expect(location).toContainText('on the server');
  await expect(location).not.toContainText('on your machine');
  await authGeometry(page, 'viewer-workspace');
}

/** Checks that a Sales reader receives only visible definitions and derived exports. */
export async function readVisibilityChecks(browser: Browser, target: SignInTarget) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const forbidden = [
    'LEAK-hr-',
    'LEAK-sales-contracts-finance/',
    'hr-people',
    'finance/revenue-recognition.odcs.yaml',
  ];
  const assertReadable = (text: string) => {
    for (const marker of forbidden) assert(!text.includes(marker), `Unreadable data: ${marker}`);
  };
  try {
    // Alice's groups were narrowed to Sales Viewers for this check.
    const viewer: ExpectedRole = {
      roleId: 'viewer',
      name: 'Viewer',
      via: 'group',
      reason: 'Sales Viewer must come from the group grant',
    };
    await signIn(page, target, 'alice', viewer);
    await expect(page.getByRole('tree', { name: 'Projects' })).toBeVisible();
    await expect(page.getByText('1 file you cannot open')).toBeVisible();
    await sidebarNotesChecks(page);
    assertReadable(await page.locator('body').innerText());
    for (const path of [
      '/api/projects',
      '/api/documents',
      '/api/agent/catalog',
      '/api/projects/sales-metrics/metrics',
      '/api/agent/context?mappingId=sales-contracts/people.mapping.yaml',
    ]) {
      const response = await context.request.get(target.url + path);
      assert.equal(response.status(), 200);
      assertReadable(await response.text());
    }
    for (const name of ['orders.odcs.yaml', 'people.mapping.yaml']) {
      await page.getByRole('button', { name, exact: true }).click();
      for (const tab of [/^Graph/, /^Metrics/, /^Mappings/]) {
        const control = page.getByRole('button', { name: tab }).first();
        if (await control.isVisible()) await control.click();
        assertReadable(await page.locator('body').innerText());
      }
    }
    const downloadText = async (action: () => Promise<void>) => {
      const downloaded = page.waitForEvent('download');
      await action();
      const stream = await (await downloaded).createReadStream();
      assert(stream);
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      assertReadable(Buffer.concat(chunks).toString('utf8'));
    };
    await downloadText(async () => {
      await page.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
    });
    await page.getByRole('button', { name: /^Mappings/ }).click();
    await expect(page.getByRole('button', { name: 'Export agent context' })).toBeEnabled();
    await downloadText(() => page.getByRole('button', { name: 'Export agent context' }).click());
    await page.getByRole('button', { name: 'orders.odcs.yaml', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
    const search = page.getByPlaceholder('Find an entity…');
    await expect(search).toBeVisible();
    await search.fill('Employee');
    assertReadable(await page.locator('body').innerText());
  } finally {
    await context.close();
  }
}

async function checkRoleControls(page: Page, target: SignInTarget, username: TestUserName) {
  const context = page.context();
  await signIn(page, target, username);
  const response = await context.request.get(target.url + '/api/projects');
  const projects = await response.json();
  const slug = username === 'carol' ? 'hr-people' : 'sales-contracts';
  const project = projects.find((item: { slug: string }) => item.slug === slug);
  assert(project);
  const writes = username !== 'carol' && username !== 'hank';
  assert.equal(project.actions.includes('edit'), writes);
  const tree = page.getByRole('treeitem', { name: project.name, exact: true });
  if ((await tree.getAttribute('aria-expanded')) === 'false') {
    await tree.getByRole('button', { name: project.name, exact: true }).click();
  }
  await tree.getByRole('button', { name: project.files[0].path, exact: true }).click();
  const remove = tree.getByRole('button', { name: `Delete project ${project.name}`, exact: true });
  if (username === 'dave') await expect(remove).toBeVisible();
  else await expect(remove).toHaveCount(0);
  await page.getByRole('button', { name: 'Source control', exact: false }).click();
  const remote = page.getByRole('button', { name: 'Remote…', exact: true });
  if (username === 'dave') await expect(remote).toBeVisible();
  else await expect(remote).toBeHidden();
  if (!writes) {
    const commit = page.getByRole('button', { name: 'Commit', exact: true });
    await expect(commit).toBeDisabled();
    await expect(commit).toHaveAttribute('title', /Editor/);
    const denied = await context.request.put(
      target.url + `/api/drafts/${slug}/${project.files[0].path}`,
      {
        headers: { Origin: target.url, 'X-SW-Request': '1' },
        data: { baseHash: null, text: 'forged draft', patches: [] },
      },
    );
    assert.equal(denied.status(), 403);
  }
  await page.getByRole('button', { name: 'Person menu' }).click();
  await authGeometry(page, `roles-${username}`);
}

/** Exercises built-in and custom role controls and forged writes in signed-in browser sessions. */
export async function roleControlChecks(browser: Browser, target: SignInTarget) {
  for (const username of ['carol', 'alice', 'bob', 'dave', 'hank'] as const) {
    const context = await browser.newContext();
    try {
      await checkRoleControls(await context.newPage(), target, username);
    } finally {
      await context.close();
    }
  }
}

type AgentClient = (typeof TEST_CLIENTS)[keyof typeof TEST_CLIENTS];

/** Asks the test provider for a client-credentials token, as an automation would. */
async function agentToken(page: Page, target: SignInTarget, client: AgentClient) {
  const issued = await page.context().request.post(target.issuer + '/token', {
    form: {
      grant_type: 'client_credentials',
      client_id: client.clientId,
      client_secret: client.secret,
      scope: 'api://semantic-workbench/.default',
    },
  });
  assert.equal(issued.status(), 200);
  const body = await issued.json();
  return body.access_token as string;
}

/**
 * Checks agent clients over HTTP from a browser that is also signed in, so the session cookie
 * travels with every call and must never widen what the bearer token may do.
 */
export async function agentBearerChecks(browser: Browser, target: SignInTarget) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page, target, 'dave');
    await check('agent client sees only granted projects', async () => {
      const token = await agentToken(page, target, TEST_CLIENTS.granted);
      const headers = { Authorization: 'Bearer ' + token };
      const catalog = await context.request.get(target.url + '/api/agent/catalog', { headers });
      assert.equal(catalog.status(), 200);
      const text = await catalog.text();
      assert(text.includes('sales-contracts/'));
      assert(!text.includes('hr-people/'));
      assert(!text.includes('shared-reference/'));
      const outside = await context.request.get(target.url + '/api/projects', { headers });
      assert.equal(outside.status(), 401);
    });
    await check('ungranted agent client is refused', async () => {
      const token = await agentToken(page, target, TEST_CLIENTS.ungranted);
      const headers = { Authorization: 'Bearer ' + token };
      const refused = await context.request.get(target.url + '/api/agent/catalog', { headers });
      assert.equal(refused.status(), 403);
    });
  } finally {
    await context.close();
  }
}

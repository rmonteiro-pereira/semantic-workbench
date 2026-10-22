// Exercises the Admin dialogs in Chromium against canned responses shaped like the HTTP API.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test';
import { adminMockState, openAdminHarness } from './helpers/admin-api-mock';

let browser: Browser | undefined;
let page: Page;
const state = adminMockState();
const requests = state.requests;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await openAdminHarness(page, state);
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

test('grant edits invalidate review and server guard errors stay visible', async () => {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Roles & access', exact: true }).click();
  await page.getByRole('button', { name: 'Add grant', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add grant', exact: true });
  await dialog.getByLabel('Member kind').selectOption('email');
  await dialog.getByLabel('E-mail address').fill('Erin@Example.org');
  await browserExpect(dialog.getByRole('button', { name: 'Confirm save changes' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Dry run', exact: true }).click();
  await browserExpect(dialog.getByRole('region', { name: 'Dry-run result' })).toContainText('Erin');
  await dialog.getByLabel('Role', { exact: true }).selectOption('editor');
  await browserExpect(dialog.getByRole('button', { name: 'Confirm save changes' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Dry run', exact: true }).click();
  await browserExpect(dialog.getByRole('button', { name: 'Confirm save changes' })).toBeVisible();
  state.refuseSaves = true;
  await dialog.getByRole('button', { name: 'Confirm save changes' }).click();
  await browserExpect(dialog.getByRole('alert')).toContainText('last-admin');
  const sent = requests.filter(request => request.method === 'PUT').at(-1)!;
  expect(sent.body.grants.at(-1).member.email).toBe('erin@example.org');
  expect(sent.body.baseVersion).toBe('base');
  expect(sent.body.dryRunId).toBe('review');
  state.refuseSaves = false;
  await page.keyboard.press('Escape');
}, 20_000);

test('built-in roles are locked and duplication exposes a custom role form', async () => {
  await page.getByRole('tab', { name: 'Roles', exact: true }).click();
  const role = page.getByRole('region', { name: 'Viewer', exact: true });
  await browserExpect(role).toContainText('read-only');
  await browserExpect(role.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await role.getByRole('button', { name: 'Duplicate as custom role' }).click();
  const dialog = page.getByRole('dialog', { name: 'New role', exact: true });
  await browserExpect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Viewer copy');
  await browserExpect(dialog.getByLabel('admin', { exact: true })).toHaveCount(0);
  await browserExpect(
    dialog.getByRole('button', { name: 'Add grant', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
}, 20_000);

async function openArea(name: string) {
  while (await page.locator('dialog').count()) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  return page.getByRole('dialog', { name, exact: true });
}

test('Users passes the no-access filter and prefills a verified address', async () => {
  const users = await openArea('Users & groups');
  await users.getByLabel('No access', { exact: true }).check();
  await users.getByRole('button', { name: 'Actions for Erin' }).click();
  await page.getByRole('menuitem', { name: 'Grant access', exact: true }).click();
  const grant = page.getByRole('dialog', { name: 'Add grant', exact: true });
  await browserExpect(grant.getByLabel('E-mail address')).toHaveValue('erin@example.org');
}, 20_000);

test('invalid raw policies show line and column and cannot reach dry run', async () => {
  const policies = await openArea('Policies');
  await browserExpect(policies.getByText('Baseline — read-only', { exact: true })).toBeVisible();
  await policies.getByRole('button', { name: 'New rule', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Policy editor', exact: true });
  await editor.getByLabel('Advanced raw editor').check();
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await browserExpect(editor.getByRole('alert').last()).toContainText(
    'Line 1, column 2: Invalid policy',
  );
  await browserExpect(editor.getByRole('button', { name: 'Dry run', exact: true })).toBeDisabled();
}, 20_000);

test('access check sends hypothetical attributes and renders provenance', async () => {
  const dialog = await openArea('Access check');
  await dialog.getByLabel('Hypothetical person').check();
  await dialog.getByLabel('Groups (comma separated)').fill('sales, hr');
  await dialog.getByLabel('E-mail address').fill('Erin@Example.org');
  await dialog.getByLabel('Project', { exact: true }).fill('sales');
  await dialog.getByRole('button', { name: 'Check access', exact: true }).click();
  await browserExpect(dialog.getByRole('region', { name: 'Access result' })).toContainText(
    'role:editor:1',
  );
  const sent = requests.filter(request => request.path === '/api/admin/check').at(-1)!;
  expect(sent.body.principal).toEqual({ groups: ['sales', 'hr'], email: 'erin@example.org' });
  await dialog.getByRole('button', { name: 'Who can access', exact: true }).click();
  await browserExpect(dialog.getByRole('region', { name: 'Who can access results' })).toContainText(
    'erin@example.org',
  );
}, 20_000);

test('project changes require review and preserve unrelated restrictions', async () => {
  const dialog = await openArea('Projects');
  await dialog.getByLabel('Domain for sales', { exact: true }).selectOption('');
  const review = dialog.getByRole('region', { name: 'Save project access', exact: true });
  await review.getByRole('button', { name: 'Dry run', exact: true }).click();
  await browserExpect(
    review.getByRole('button', { name: 'Confirm save project access' }),
  ).toBeVisible();
  const sent = requests.filter(request => request.path === '/api/admin/policies/dry-run').at(-1)!;
  expect(sent.body.projects.sales.domain).toBeUndefined();
  expect(sent.body.projects.sales.restricted).toEqual([]);
}, 20_000);

test('settings show provider metadata and confirm lifetime changes', async () => {
  const dialog = await openArea('Settings');
  await browserExpect(dialog).toContainText('workbench');
  await dialog.getByLabel('Idle hours').fill('4');
  await dialog.getByRole('button', { name: 'Save settings', exact: true }).click();
  await browserExpect(
    dialog.getByRole('button', { name: 'Confirm save settings', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm save settings', exact: true }).click();
  await browserExpect(
    dialog.getByRole('button', { name: 'Confirm save settings', exact: true }),
  ).toHaveCount(0);
  const sent = requests
    .filter(request => request.path === '/api/admin/settings' && request.method === 'PUT')
    .at(-1)!;
  expect(sent.body.session.idleHours).toBe(4);
  expect(sent.body.baseVersion).toBe('base');
}, 20_000);

test('audit paging uses the server cursor and filters reset pagination', async () => {
  const dialog = await openArea('Audit');
  await dialog.getByRole('button', { name: 'Next page', exact: true }).click();
  await browserExpect(
    dialog.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeEnabled();
  await dialog.getByLabel('Decision', { exact: true }).selectOption('deny');
  await browserExpect(
    dialog.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled();
}, 20_000);

test('Escape closes only the dialog on top, leaving the area and launcher open', async () => {
  const dialog = await openArea('Roles & access');
  await dialog.getByRole('button', { name: 'Add grant', exact: true }).click();
  await browserExpect(page.getByRole('dialog', { name: 'Add grant', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await browserExpect(page.getByRole('dialog', { name: 'Add grant', exact: true })).toHaveCount(0);
  await browserExpect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await browserExpect(dialog).toHaveCount(0);
  await browserExpect(page.getByRole('dialog', { name: 'Admin', exact: true })).toBeVisible();
}, 20_000);

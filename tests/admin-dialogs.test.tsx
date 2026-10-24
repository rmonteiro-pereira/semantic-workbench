// Exercises the Admin page in Chromium against canned responses shaped like the HTTP API.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test';
import { adminMockState, openAdminHarness } from './helpers/admin-api-mock';
import { adminArea, cancelAdminDialog } from '../scripts/helpers/admin-browser';

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
  const grants = await openArea('Access grants');
  await grants.getByRole('button', { name: 'Add grant', exact: true }).click();
  const form = page.getByRole('region', { name: 'Add grant', exact: true });
  await form.getByLabel('Member kind').selectOption('email');
  await form.getByLabel('E-mail address').fill('Erin@Example.org');
  await form.getByRole('button', { name: 'Dry run', exact: true }).click();
  const preview = page.getByRole('dialog');
  await browserExpect(preview.getByRole('region', { name: 'Dry-run result' })).toContainText(
    'Erin',
  );
  await preview.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await form.getByLabel('Role', { exact: true }).selectOption('editor');
  await browserExpect(page.getByRole('button', { name: 'Confirm save changes' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Dry run', exact: true }).click();
  await browserExpect(page.getByRole('button', { name: 'Confirm save changes' })).toBeVisible();
  state.refuseSaves = true;
  await page.getByRole('button', { name: 'Confirm save changes' }).click();
  await browserExpect(form.getByRole('alert')).toContainText('last-admin');
  const sent = requests.filter(request => request.method === 'PUT').at(-1)!;
  expect(sent.body.grants.at(-1).member.email).toBe('erin@example.org');
  expect(sent.body.baseVersion).toBe('base');
  expect(sent.body.dryRunId).toBe('review');
  state.refuseSaves = false;
}, 20_000);

test('built-in roles are locked and duplication exposes a custom role form', async () => {
  const roles = await openArea('Roles');
  const role = roles.getByRole('region', { name: 'Viewer', exact: true });
  await browserExpect(role).toContainText('Built-in role');
  await browserExpect(role.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await role.getByRole('button', { name: 'Duplicate as custom role' }).click();
  const form = page.getByRole('region', { name: 'New role', exact: true });
  await browserExpect(form.getByLabel('Name', { exact: true })).toHaveValue('Viewer copy');
  await browserExpect(form.getByLabel('admin', { exact: true })).toHaveCount(0);
  await browserExpect(form.getByRole('button', { name: 'Add grant', exact: true })).toBeDisabled();
}, 20_000);

function openArea(name: string) {
  return adminArea(page, name);
}

test('Users passes the no-access filter and prefills a verified address', async () => {
  const users = await openArea('Users & groups');
  await users.getByLabel('No access', { exact: true }).check();
  await users.getByRole('button', { name: 'Actions for Erin' }).click();
  await page.getByRole('menuitem', { name: 'Grant access', exact: true }).click();
  const grant = page.getByRole('region', { name: 'Add grant', exact: true });
  await browserExpect(grant.getByLabel('E-mail address')).toHaveValue('erin@example.org');
}, 20_000);

test('invalid raw policies show line and column and cannot reach dry run', async () => {
  const policies = await openArea('Policies');
  await browserExpect(policies.getByText(/^Built-in rules \(\d+\) — read-only$/)).toBeVisible();
  await policies.getByRole('button', { name: 'New rule', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Policy editor', exact: true });
  await editor.getByLabel('Advanced raw editor').check();
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await browserExpect(editor.getByRole('alert').last()).toContainText(
    'Line 1, column 2: Invalid policy',
  );
  await browserExpect(editor.getByRole('button', { name: 'Dry run', exact: true })).toBeDisabled();
}, 20_000);

test('access check sends hypothetical attributes and renders provenance', async () => {
  const area = await openArea('Access check');
  await area.getByLabel('Hypothetical person').check();
  await area.getByLabel('Groups (comma separated)').fill('sales, hr');
  await area.getByLabel('E-mail address').fill('Erin@Example.org');
  await area.getByLabel('Project', { exact: true }).fill('sales');
  await area.getByRole('button', { name: 'Check access', exact: true }).click();
  await browserExpect(area.getByRole('region', { name: 'Access result' })).toContainText(
    'role:editor:1',
  );
  const sent = requests.filter(request => request.path === '/api/admin/check').at(-1)!;
  expect(sent.body.principal).toEqual({ groups: ['sales', 'hr'], email: 'erin@example.org' });
  await area.getByRole('button', { name: 'Who can access', exact: true }).click();
  await browserExpect(area.getByRole('region', { name: 'Who can access results' })).toContainText(
    'erin@example.org',
  );
}, 20_000);

test('project changes require review and preserve unrelated restrictions', async () => {
  const area = await openArea('Projects access');
  await area.getByLabel('Domain for sales', { exact: true }).selectOption('');
  await area
    .getByRole('region', { name: 'Save project access', exact: true })
    .getByRole('button', { name: 'Preview project access', exact: true })
    .click();
  await browserExpect(
    page.getByRole('dialog').getByRole('button', { name: 'Confirm save project access' }),
  ).toBeVisible();
  await cancelAdminDialog(page, 'Cancel changes');
  const sent = requests.filter(request => request.path === '/api/admin/policies/dry-run').at(-1)!;
  expect(sent.body.projects.sales.domain).toBeUndefined();
  expect(sent.body.projects.sales.restricted).toEqual([]);
}, 20_000);

test('settings show provider metadata and confirm lifetime changes', async () => {
  const area = await openArea('Settings');
  await browserExpect(area).toContainText('workbench');
  await area.getByLabel('Idle hours').fill('4');
  await area.getByRole('button', { name: 'Save settings', exact: true }).click();
  await browserExpect(
    area.getByRole('button', { name: 'Confirm save settings', exact: true }),
  ).toBeVisible();
  await area.getByRole('button', { name: 'Confirm save settings', exact: true }).click();
  await browserExpect(
    area.getByRole('button', { name: 'Confirm save settings', exact: true }),
  ).toHaveCount(0);
  const sent = requests
    .filter(request => request.path === '/api/admin/settings' && request.method === 'PUT')
    .at(-1)!;
  expect(sent.body.session.idleHours).toBe(4);
  expect(sent.body.baseVersion).toBe('base');
}, 20_000);

test('audit paging uses the server cursor and filters reset pagination', async () => {
  const area = await openArea('Audit');
  await area.getByRole('button', { name: 'Next page', exact: true }).click();
  await browserExpect(
    area.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeEnabled();
  await area.getByLabel('Decision', { exact: true }).selectOption('deny');
  await browserExpect(
    area.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled();
}, 20_000);

test('Escape closes only the dialog on top, leaving the page and its pane open', async () => {
  const grants = await openArea('Access grants');
  await grants.getByRole('button', { name: 'Add grant', exact: true }).click();
  const form = page.getByRole('region', { name: 'Add grant', exact: true });
  await form.getByLabel('Member kind').selectOption('email');
  await form.getByLabel('E-mail address').fill('erin@example.org');
  await form.getByRole('button', { name: 'Dry run', exact: true }).click();
  await browserExpect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await browserExpect(page.getByRole('dialog')).toHaveCount(0);
  await browserExpect(form).toBeVisible();
  await page.keyboard.press('Escape');
  await browserExpect(page.locator('.admin-page')).toBeVisible();
}, 20_000);

test('sections have their own address, and Back returns to the previous section', async () => {
  await openArea('Access grants');
  await openArea('Users & groups');
  expect(new URL(page.url()).hash).toBe('#/admin/users');
  await page.goBack();
  expect(new URL(page.url()).hash).toBe('#/admin/grants');
  await browserExpect(
    page.getByRole('region', { name: 'Access grants', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await browserExpect(page.locator('.admin-page')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  await page.goBack();
  await browserExpect(page.locator('.admin-page')).toBeVisible();
}, 20_000);

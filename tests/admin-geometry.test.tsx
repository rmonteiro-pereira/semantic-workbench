// Measures every Admin dialog at the viewport matrix against canned API responses, so layout
// defects show up without a running server. Screenshots go to SW_SCREENSHOT_DIR when it is set.
import { afterAll, beforeAll, test } from 'bun:test';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { adminMockState, openAdminHarness } from './helpers/admin-api-mock';
import { ADMIN_AREAS, adminGeometry, screenshotName } from '../scripts/helpers/admin-browser';

let browser: Browser | undefined;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await openAdminHarness(page, adminMockState());
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

function topDialog(name: string) {
  return page.getByRole('dialog', { name, exact: true });
}

async function closeTop(name: string) {
  await topDialog(name).getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(topDialog(name)).toHaveCount(0);
}

async function openArea(name: string) {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await topDialog('Admin').getByRole('button', { name, exact: true }).click();
  const dialog = topDialog(name);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeArea(name: string) {
  await closeTop(name);
  await closeTop('Admin');
}

async function chooseMenuItem(dialog: ReturnType<typeof topDialog>, menu: string, item: string) {
  await dialog.getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('launcher and every area fit each viewport', async () => {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await adminGeometry(page, 'launcher');
  await closeTop('Admin');
  for (const area of ADMIN_AREAS) {
    const dialog = await openArea(area);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await adminGeometry(page, screenshotName(area));
    await closeArea(area);
  }
}, 180_000);

test('grant dialogs fit each viewport, including the dry-run result', async () => {
  const roles = await openArea('Roles & access');
  await roles.getByRole('button', { name: 'Add grant', exact: true }).click();
  const grant = topDialog('Add grant');
  await grant.getByLabel('Group object ID').fill('7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a01');
  await expect(grant).toContainText('Sales Editors');
  await grant.getByLabel('Scope', { exact: true }).selectOption('projects');
  await grant.getByLabel('Projects (comma separated)').fill('sales');
  await grant.getByRole('button', { name: 'Dry run', exact: true }).click();
  await expect(grant.getByRole('region', { name: 'Dry-run result' })).toBeVisible();
  await adminGeometry(page, 'add-grant');
  await closeTop('Add grant');
  await chooseMenuItem(roles, 'Actions for grant g_erin', 'Change');
  await expect(topDialog('Change grant').getByLabel('E-mail address')).toBeVisible();
  await adminGeometry(page, 'change-grant');
  await closeTop('Change grant');
  await chooseMenuItem(roles, 'Actions for grant g_erin', 'Remove');
  await adminGeometry(page, 'remove-grant');
  await closeTop('Remove grant');
  await closeArea('Roles & access');
}, 120_000);

test('role dialogs fit each viewport', async () => {
  const roles = await openArea('Roles & access');
  await roles.getByRole('tab', { name: 'Roles', exact: true }).click();
  await roles
    .getByRole('region', { name: 'Editor', exact: true })
    .getByRole('button', { name: 'Duplicate as custom role' })
    .click();
  const created = topDialog('New role');
  await created.getByText('Conditions for edit', { exact: true }).click();
  await adminGeometry(page, 'new-role');
  await closeTop('New role');
  const custom = roles.getByRole('region', { name: 'Metric reviewer', exact: true });
  await custom.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(topDialog('Edit role')).toContainText('Finance');
  await adminGeometry(page, 'edit-role');
  await closeTop('Edit role');
  await custom.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(topDialog('Delete role')).toContainText('Alice Andrade');
  await adminGeometry(page, 'delete-role');
  await closeTop('Delete role');
  await closeArea('Roles & access');
}, 120_000);

test('policy dialogs and version history fit each viewport', async () => {
  const policies = await openArea('Policies');
  await policies.getByRole('button', { name: 'New rule', exact: true }).click();
  const editor = topDialog('Policy editor');
  await editor.getByLabel('Template', { exact: true }).selectOption('Git action limits');
  await adminGeometry(page, 'policy-template');
  await editor.getByLabel('Advanced raw editor').check();
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(editor.getByRole('alert').last()).toContainText('Line 1, column 2');
  await adminGeometry(page, 'policy-raw');
  await closeTop('Policy editor');
  await policies.getByLabel('Enabled', { exact: true }).click();
  await adminGeometry(page, 'disable-policy');
  await closeTop('Disable No pushes to release branches');
  await policies.getByRole('button', { name: 'History', exact: true }).click();
  const history = topDialog('Version history');
  await history.getByLabel('Version', { exact: true }).selectOption('base');
  await history.getByRole('button', { name: 'Show diff', exact: true }).click();
  await expect(history.locator('.diff-view').first()).toBeVisible();
  await history.getByRole('button', { name: 'Roll back', exact: true }).click();
  await adminGeometry(page, 'version-history');
  await closeTop('Version history');
  await closeArea('Policies');
}, 120_000);

test('people, access check and settings dialogs fit each viewport', async () => {
  const users = await openArea('Users & groups');
  for (const action of ['Deactivate', 'End sessions']) {
    await chooseMenuItem(users, 'Actions for Alice Andrade', action);
    await adminGeometry(page, 'user-' + action.toLowerCase().replace(' ', '-'));
    await closeTop(action);
  }
  await chooseMenuItem(users, 'Actions for Alice Andrade', 'Check access');
  const check = topDialog('Access check');
  await check.getByLabel('Project', { exact: true }).fill('sales');
  await check.getByRole('button', { name: 'Check access', exact: true }).click();
  await check.getByRole('button', { name: 'Who can access', exact: true }).click();
  await expect(check.getByRole('region', { name: 'Who can access results' })).toBeVisible();
  await adminGeometry(page, 'access-check-results');
  await closeTop('Access check');
  await closeArea('Users & groups');
  const settings = await openArea('Settings');
  await settings.getByRole('button', { name: 'End session', exact: true }).first().click();
  await adminGeometry(page, 'settings-end-session');
  await closeTop('End sessions');
  await closeArea('Settings');
}, 120_000);

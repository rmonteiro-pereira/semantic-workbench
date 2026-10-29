// Measures the Admin page and its dialogs at the viewport matrix against canned API responses, so layout defects show up without a running server. Screenshots go to SW_SCREENSHOT_DIR when it is set.
import { afterAll, beforeAll, test } from 'bun:test';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { adminMockState, openAdminHarness } from './helpers/admin-api-mock';
import { ADMIN_AREAS, adminArea, adminGeometry, cancelAdminDialog, leaveAdmin, screenshotName } from '../scripts/helpers/admin-browser';

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

const pane = (name: string) => page.getByRole('region', { name, exact: true });

async function goBack(name: string) {
  await pane(name)
    .getByRole('button', { name: /^Back to /, exact: true })
    .click();
  await expect(pane(name)).toHaveCount(0);
}

async function chooseMenuItem(area: ReturnType<typeof pane>, menu: string, item: string) {
  await area.getByRole('button', { name: menu, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('Settings opens the page and every section fits each viewport', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.locator('.admin-page')).toBeVisible();
  for (const area of ADMIN_AREAS) {
    const section = await adminArea(page, area);
    await expect(section.getByRole('alert')).toHaveCount(0);
    await adminGeometry(page, screenshotName(area));
  }
  await leaveAdmin(page);
}, 180_000);

test('Git remotes lists each project with its address or No remote', async () => {
  const remotes = await adminArea(page, 'Git remotes');
  const sales = remotes.getByRole('row').filter({ hasText: 'Sales contracts' });
  await expect(sales).toContainText('origin: https://git.example.org/sales.git');
  await expect(sales.getByRole('button', { name: 'Remove remote', exact: true })).toBeVisible();
  const lab = remotes.getByRole('row').filter({ hasText: 'Lab notes' });
  await expect(lab).toContainText('No remote');
  await expect(lab.getByRole('button', { name: 'Set remote', exact: true })).toBeVisible();
  await expect(lab.getByRole('button', { name: 'Remove remote', exact: true })).toHaveCount(0);
});

test('grant panes fit each viewport, and the dry-run preview is a dialog', async () => {
  const grants = await adminArea(page, 'Access grants');
  await grants.getByRole('button', { name: 'Add grant', exact: true }).click();
  const grant = pane('Add grant');
  await grant.getByLabel('Group object ID').fill('7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a01');
  await expect(grant).toContainText('Sales Editors');
  await grant.getByLabel('Applies to', { exact: true }).selectOption('projects');
  await grant.getByLabel('Projects (comma separated)').fill('sales');
  await adminGeometry(page, 'add-grant');
  await grant.getByRole('button', { name: 'Dry run', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Dry-run result' })).toBeVisible();
  await adminGeometry(page, 'add-grant-preview');
  await cancelAdminDialog(page, 'Cancel changes');
  await goBack('Add grant');
  await chooseMenuItem(grants, 'Actions for grant g_erin', 'Change');
  await expect(pane('Change grant').getByLabel('E-mail address')).toBeVisible();
  await adminGeometry(page, 'change-grant');
  await goBack('Change grant');
  await chooseMenuItem(grants, 'Actions for grant g_erin', 'Remove');
  await adminGeometry(page, 'remove-grant');
  await cancelAdminDialog(page);
}, 120_000);

test('role panes fit each viewport', async () => {
  const roles = await adminArea(page, 'Roles');
  await roles.getByRole('region', { name: 'Editor', exact: true }).getByRole('button', { name: 'Duplicate as custom role' }).click();
  await pane('New role').getByText('Conditions for edit', { exact: true }).click();
  await adminGeometry(page, 'new-role');
  await goBack('New role');
  const custom = roles.getByRole('region', { name: 'Metric reviewer', exact: true });
  await custom.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(pane('Edit role')).toContainText('Finance');
  await adminGeometry(page, 'edit-role');
  await goBack('Edit role');
  await custom.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delete role', exact: true })).toContainText('Alice Andrade');
  await adminGeometry(page, 'delete-role');
  await cancelAdminDialog(page);
}, 120_000);

test('policy panes and version history fit each viewport', async () => {
  const policies = await adminArea(page, 'Policies');
  await policies.getByRole('button', { name: 'New rule', exact: true }).click();
  const editor = pane('Policy editor');
  await editor.getByLabel('Template', { exact: true }).selectOption('Git action limits');
  await adminGeometry(page, 'policy-template');
  await editor.getByLabel('Advanced raw editor').check();
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(editor.getByRole('alert').last()).toContainText('Line 1, column 2');
  await adminGeometry(page, 'policy-raw');
  await goBack('Policy editor');
  await policies.getByLabel('Enabled', { exact: true }).click();
  await adminGeometry(page, 'disable-policy');
  await cancelAdminDialog(page);
  await policies.getByRole('button', { name: 'History', exact: true }).click();
  const history = pane('Version history');
  await history.getByLabel('Version', { exact: true }).selectOption('base');
  await history.getByRole('button', { name: 'Show diff', exact: true }).click();
  await expect(history.locator('.diff-view').first()).toBeVisible();
  await adminGeometry(page, 'version-history');
  await history.getByRole('button', { name: 'Roll back', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Confirm rollback', exact: true })).toBeVisible();
  await adminGeometry(page, 'rollback');
  await cancelAdminDialog(page, 'Cancel rollback');
  await goBack('Version history');
}, 120_000);

test('people, access check and settings confirmations fit each viewport', async () => {
  const users = await adminArea(page, 'Users & groups');
  for (const action of ['Deactivate', 'End sessions']) {
    await chooseMenuItem(users, 'Actions for Alice Andrade', action);
    await adminGeometry(page, 'user-' + action.toLowerCase().replace(' ', '-'));
    await cancelAdminDialog(page);
  }
  await chooseMenuItem(users, 'Actions for Alice Andrade', 'Check access');
  const check = pane('Access check for Alice Andrade');
  await check.getByLabel('Project', { exact: true }).fill('sales');
  await check.getByRole('button', { name: 'Check access', exact: true }).click();
  await check.getByRole('button', { name: 'Who can access', exact: true }).click();
  await expect(check.getByRole('region', { name: 'Who can access results' })).toBeVisible();
  await adminGeometry(page, 'access-check-results');
  await goBack('Access check for Alice Andrade');
  const settings = await adminArea(page, 'Settings');
  await settings.getByRole('button', { name: 'End session', exact: true }).first().click();
  await adminGeometry(page, 'settings-end-session');
  await cancelAdminDialog(page);
  await leaveAdmin(page);
}, 120_000);

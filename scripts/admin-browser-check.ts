import assert from 'node:assert/strict';
import { lastAdminBrowserCheck } from './admin-last-admin-check';
import { adminPaneGeometry } from './admin-pane-geometry';
import { chromium, expect, type Page, type Locator } from '@playwright/test';
import { startMockOidc } from '../tests/helpers/mock-oidc';
import { TEST_GROUPS, TEST_TENANT_ID, TEST_USERS } from '../tests/helpers/auth-identities';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { signIn, type SignInTarget } from './helpers/sign-in';
import {
  ADMIN_AREAS,
  adminGeometry,
  adminArea,
  leaveAdmin,
  screenshotName,
  withinAdministrationTime,
} from './helpers/admin-browser';
import { openSettings } from './helpers/sidebar-menus';

/**
 * Runs the dry run in `scope`, checks the result and confirms. The result is in a dialog for a
 * form and inside the scope for a confirmation dialog, so the buttons are found on the page.
 */
async function review(page: Page, scope: Locator, name = 'save changes', previewName = 'Dry run') {
  await scope.getByRole('button', { name: previewName, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dry-run result', exact: true })).toBeVisible();
  const confirm = page.getByRole('button', { name: `Confirm ${name}`, exact: true });
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(scope.getByRole('alert')).toHaveCount(0);
}

/** One grant as the Add grant form takes it: who, which role, and where. */
interface GrantForm {
  member: 'group' | 'email';
  value: string;
  role: string;
  scope: 'domains' | 'projects';
  target: string;
}

async function addGrant(page: Page, { member, value, role, scope, target }: GrantForm) {
  const grants = await adminArea(page, 'Access grants');
  await grants.getByRole('button', { name: 'Add grant', exact: true }).click();
  const dialog = page.getByRole('region', { name: 'Add grant', exact: true });
  await dialog.getByLabel('Member kind').selectOption(member);
  await dialog.getByLabel(member === 'group' ? 'Group object ID' : 'E-mail address').fill(value);
  if (member === 'group') await expect(dialog).toContainText(TEST_GROUPS.salesEditors.name);
  await dialog.getByLabel('Role', { exact: true }).selectOption(role);
  await dialog.getByLabel('Scope', { exact: true }).selectOption(scope);
  await dialog
    .getByLabel(scope === 'domains' ? 'Domain IDs (comma separated)' : 'Projects (comma separated)')
    .fill(target);
  await adminGeometry(page, 'grant-form');
  await review(page, dialog);
  await expect(dialog).toHaveCount(0);
}

async function timedAdministration(page: Page, erin: Page, target: SignInTarget) {
  const start = performance.now();
  const projects = await adminArea(page, 'Projects access');
  await projects.getByLabel('Domain for lab-notes').selectOption('sales');
  const projectReview = projects.getByRole('region', { name: 'Save project access', exact: true });
  await review(page, projectReview, 'save project access', 'Preview project access');
  await addGrant(page, {
    member: 'group',
    value: TEST_GROUPS.salesEditors.id,
    role: 'steward',
    scope: 'domains',
    target: 'sales',
  });
  await addGrant(page, {
    member: 'email',
    value: 'Erin@Example.org',
    role: 'editor',
    scope: 'projects',
    target: 'sales-contracts',
  });
  await erin.goto(target.url + '/');
  const response = await erin.request.get(target.url + '/api/me');
  assert.equal(response.status(), 200);
  const identity = await response.json();
  assert(identity.roles.projects['sales-contracts'].includes('editor'));
  const access = await adminArea(page, 'Access check');
  await access
    .getByLabel('Person ID', { exact: true })
    .fill(TEST_TENANT_ID + ':' + TEST_USERS.alice.oid);
  await access.getByLabel('Project', { exact: true }).fill('sales-contracts');
  await access.getByRole('button', { name: 'Check access', exact: true }).click();
  await expect(access.getByRole('region', { name: 'Access result' })).toContainText('Allowed');
  assert(
    withinAdministrationTime(start, performance.now()),
    'Domain assignment, both grants and check exceeded three minutes',
  );
  await access.getByLabel('Hypothetical person').check();
  await access.getByLabel('Groups (comma separated)').fill(TEST_GROUPS.salesEditors.id);
  await access.getByLabel('E-mail address').fill('someone@example.org');
  await access.getByRole('button', { name: 'Check access', exact: true }).click();
  await expect(access.getByRole('region', { name: 'Access result' })).toContainText('steward');
  await access.getByRole('button', { name: 'Who can access', exact: true }).click();
  await expect(access.getByRole('region', { name: 'Who can access results' })).toBeVisible();
}

async function customRole(page: Page) {
  const roles = await adminArea(page, 'Roles');
  await roles.getByRole('button', { name: 'New role', exact: true }).click();
  const editor = page.getByRole('region', { name: 'New role', exact: true });
  await editor.getByLabel('Name', { exact: true }).fill('Metric reviewer browser');
  await editor.getByLabel('Description', { exact: true }).fill('Review metrics in Sales');
  await editor.getByLabel('Approve metric', { exact: true }).check();
  await editor.getByText('Conditions for approve metric', { exact: true }).click();
  await editor.getByLabel('Document type', { exact: true }).fill('metric');
  await adminGeometry(page, 'role-editor');
  await review(page, editor);
  await expect(editor).toHaveCount(0);
  const response = await page.request.get(new URL(page.url()).origin + '/api/admin/roles');
  assert.equal(response.status(), 200);
  const inventory = await response.json();
  const created = inventory.custom.find(
    (role: { name: string }) => role.name === 'Metric reviewer browser',
  );
  assert(created);
  await addGrant(page, {
    member: 'group',
    value: TEST_GROUPS.salesEditors.id,
    role: created.id,
    scope: 'domains',
    target: 'sales',
  });
  const rolesAgain = await adminArea(page, 'Roles');
  const region = rolesAgain.getByRole('region', { name: 'Metric reviewer browser', exact: true });
  await region.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('region', { name: 'Edit role', exact: true });
  await expect(edit).toContainText(TEST_GROUPS.salesEditors.name);
  await edit.getByLabel('Read', { exact: true }).check();
  await review(page, edit);
  await region.getByRole('button', { name: 'Delete', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete role', exact: true });
  await expect(deletion).toContainText(TEST_USERS.alice.name);
  await adminGeometry(page, 'delete-role');
  await review(page, deletion, 'delete role and grants');
  // The dialog closes only after the server has committed the deletion.
  await expect(deletion).toHaveCount(0);
  const grants = await (
    await page.request.get(new URL(page.url()).origin + '/api/admin/grants')
  ).json();
  assert(!grants.grants.some((grant: { roleId: string }) => grant.roleId === created.id));
  const rejected = await page.request.put(new URL(page.url()).origin + '/api/admin/roles', {
    headers: { Origin: new URL(page.url()).origin, 'X-SW-Request': '1' },
    data: {
      roles: [
        ...inventory.builtIn.filter((role: { id: string }) => role.id !== 'viewer'),
        ...inventory.custom,
      ],
      // The current version, so the refusal comes from the built-in role and not a stale base.
      baseVersion: grants.version,
      dryRunId: '',
    },
  });
  assert.equal(rejected.status(), 400, 'Built-in role deletion must be refused');
}

async function policyHistory(page: Page) {
  const policies = await adminArea(page, 'Policies');
  await policies.getByRole('button', { name: 'New rule', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Policy editor', exact: true });
  await editor.getByLabel('Description').fill('Browser branch limit');
  await editor.getByLabel('Template', { exact: true }).selectOption('Git action limits');
  await editor.getByLabel('branch', { exact: true }).fill('browser-protected');
  await editor.getByRole('button', { name: 'Use template', exact: true }).click();
  await editor.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(editor.getByText('Policy is valid.', { exact: true })).toBeVisible();
  await adminGeometry(page, 'policy-editor');
  await review(page, editor);
  const rule = policies
    .getByRole('heading', { name: 'Browser branch limit', exact: true })
    .locator('..');
  await rule.getByLabel('Enabled', { exact: true }).click();
  const disable = page.getByRole('dialog', { name: 'Disable Browser branch limit', exact: true });
  await adminGeometry(page, 'disable-policy');
  await review(page, disable, 'disable browser branch limit');
  await expect(disable).toHaveCount(0);
  await policies.getByRole('button', { name: 'History', exact: true }).click();
  const history = page.getByRole('region', { name: 'Version history', exact: true });
  await history.getByLabel('Version', { exact: true }).selectOption({ index: 2 });
  await history.getByRole('button', { name: 'Show diff', exact: true }).click();
  await expect(history.locator('.diff-view').first()).toBeVisible();
  await adminGeometry(page, 'history');
  await history.getByRole('button', { name: 'Roll back', exact: true }).click();
  // The rollback is reviewed like any other change before it can be confirmed.
  const rollback = page.getByRole('dialog', { name: 'Confirm rollback', exact: true });
  await expect(rollback.getByRole('region', { name: 'Dry-run result', exact: true })).toBeVisible();
  await adminGeometry(page, 'rollback');
  await rollback.getByRole('button', { name: 'Confirm rollback', exact: true }).click();
  await expect(history.getByRole('alert')).toHaveCount(0);
  await expect(rollback).toHaveCount(0);
  await history.getByRole('button', { name: 'Back to policies', exact: true }).click();
}

async function auditExport(page: Page) {
  const audit = await adminArea(page, 'Audit');
  await audit
    .getByLabel('From', { exact: true })
    .fill(new Date().toISOString().slice(0, 10) + 'T00:00');
  const download = page.waitForEvent('download');
  await audit.getByRole('button', { name: 'Export CSV', exact: true }).click();
  assert((await download).suggestedFilename().endsWith('.csv'));
}

/** Each section has its own address that reload and Back follow, and Back leaves Admin. */
async function adminRouting(page: Page) {
  const policies = await adminArea(page, 'Policies');
  await expect(policies).toBeVisible();
  await page.reload();
  expect(new URL(page.url()).hash).toBe('#/admin/policies');
  await expect(page.getByRole('region', { name: 'Policies', exact: true })).toBeVisible();
  await adminArea(page, 'Audit');
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Policies', exact: true })).toBeVisible();
  await leaveAdmin(page);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Policies', exact: true })).toBeVisible();
  await leaveAdmin(page);
}

/** A person without the Admin role cannot set or remove a remote, even by calling the API. */
async function remoteChangeRefused(page: Page, url: string) {
  const headers = { Origin: url, 'X-SW-Request': '1' };
  const endpoint = url + '/api/projects/sales-contracts/git/remote';
  const set = await page.request.put(endpoint, {
    headers,
    data: { name: 'origin', url: 'https://example.invalid/sales.git' },
  });
  assert.equal(set.status(), 403);
  const removed = await page.request.delete(endpoint, { headers, data: { name: 'origin' } });
  assert.equal(removed.status(), 403);
}

/** Runs administration against real routes and a disposable mock identity provider. */
export async function adminBrowserCheck() {
  const url = `http://127.0.0.1:${freeAuthPort()}`;
  const mock = await startMockOidc({
    shape: 'entra',
    port: 0,
    redirectUris: [url + '/auth/callback'],
    postLogoutRedirectUris: [url + '/auth/signed-out'],
  });
  try {
    const api = await startAuthApi(url, { ...mock, kind: 'entra' });
    try {
      const browser = await chromium.launch({ headless: true });
      try {
        await lastAdminBrowserCheck(browser);
        const target: SignInTarget = { url, issuer: mock.issuer, kind: 'entra' };
        const alice = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const erin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await signIn(alice, target, 'alice');
        const aliceSettings = await openSettings(alice);
        await expect(aliceSettings.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(
          0,
        );
        await alice.keyboard.press('Escape');
        await alice.goto(url + '/#/admin/grants');
        await expect(alice.locator('.admin-page')).toHaveCount(0);
        await remoteChangeRefused(alice, url);
        await signIn(erin, target, 'erin');
        await signIn(page, target, 'dave');
        await timedAdministration(page, erin, target);
        await customRole(page);
        await policyHistory(page);
        await auditExport(page);
        await adminPaneGeometry(page);
        for (const area of ADMIN_AREAS) {
          await adminArea(page, area);
          await adminGeometry(page, screenshotName(area));
        }
        await adminRouting(page);
      } finally {
        await browser.close();
      }
    } finally {
      await api.stop();
    }
  } finally {
    await mock.stop();
  }
}
if (import.meta.main) await adminBrowserCheck();

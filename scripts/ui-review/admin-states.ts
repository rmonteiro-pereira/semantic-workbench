// Captures real server administration forms, review, audit, and access results. Usage: bun scripts/ui-review/admin-states.ts OUTPUT.
// Uses a loopback mock identity provider and startAuthApi temporary data; no external service or canned decision response.
import { chromium, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { TEST_TENANT_ID, TEST_USERS } from '../../tests/helpers/auth-identities';
import { freeAuthPort, startAuthApi } from '../auth-environment';
import { adminArea } from '../helpers/admin-browser';
import { authViewports, signIn } from '../helpers/sign-in';
import { capture, attempt, failure, watchCaptureErrors, type CaptureIdentity } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const url = `http://127.0.0.1:${freeAuthPort()}`;
const mock = await startMockOidc({ shape: 'entra', layout: 'entra', port: 0, redirectUris: [url + '/auth/callback'] });
const api = await startAuthApi(url, { ...mock, kind: 'entra' });
const browser = await chromium.launch();
const target = { url, issuer: mock.endpointBase, kind: 'entra' as const };

async function grants(page: Page, identity: CaptureIdentity) {
  const area = await adminArea(page, 'Access grants');
  await area.getByRole('button', { name: 'Add grant', exact: true }).click();
  const grant = page.getByRole('region', { name: 'Add grant', exact: true });
  await capture(page, identity, 'grant-form', 'empty');
  await attempt(page, identity, 'grant-form', 'validation-error', async () => {
    await grant.getByLabel('Member kind', { exact: true }).selectOption('email');
    await grant.getByLabel('E-mail address', { exact: true }).fill('invalid-address');
    await grant.getByRole('button', { name: 'Dry run', exact: true }).click();
    await page.getByRole('alert').first().waitFor();
  });
  await page.keyboard.press('Escape');
  await attempt(page, identity, 'access-change', 'review-confirm', async () => {
    await grant.getByLabel('E-mail address', { exact: true }).fill('capture-person@example.invalid');
    await grant.getByLabel('Applies to', { exact: true }).selectOption('projects');
    await grant.getByLabel('Projects (comma separated)').fill('sales-contracts');
    await grant.getByRole('button', { name: 'Dry run', exact: true }).click();
    await page.getByRole('region', { name: 'Dry-run result', exact: true }).waitFor();
  });
  await page.keyboard.press('Escape');
}

async function audit(page: Page, identity: CaptureIdentity) {
  await attempt(page, identity, 'audit', 'filtered', async () => {
    const area = await adminArea(page, 'Audit');
    const filters = area.locator('.admin-filter-disclosure');
    if ((await filters.getAttribute('open')) === null) await filters.locator('summary').click();
    await area.getByLabel('From', { exact: true }).fill('2026-11-15T00:00');
  });
  failure(identity, 'audit', 'entry-expanded', new Error('AuditSection renders plain table rows with no entry expansion control'));
}

async function access(page: Page, identity: CaptureIdentity) {
  for (const [project, state, decision] of [
    ['sales-contracts', 'allowed', 'Allowed'],
    ['hr-people', 'refused', 'Denied'],
  ]) {
    await attempt(page, identity, 'access-check', state, async () => {
      await page.goto(url);
      const area = await adminArea(page, 'Access check');
      await area.getByLabel('Person ID', { exact: true }).fill(TEST_TENANT_ID + ':' + TEST_USERS.alice.oid);
      await area.getByLabel('Project', { exact: true }).fill(project);
      await area.getByRole('button', { name: 'Check access', exact: true }).click();
      await expect(area.getByRole('region', { name: 'Access result', exact: true })).toContainText(decision);
    });
  }
}

try {
  const editor = await browser.newPage();
  await signIn(editor, target, 'alice');
  await editor.close();
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext();
    await context.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await signIn(page, target, 'dave');
    for (const [width, height] of authViewports) {
      await page.setViewportSize({ width, height });
      const identity = { output, mode: 'server', theme, width, height, user: 'admin' };
      watchCaptureErrors(page, identity);
      await page.goto(url);
      await page.waitForTimeout(700);
      await attempt(page, identity, 'grant-form', 'stages', () => grants(page, identity));
      await attempt(page, identity, 'role-editor', 'open', async () => {
        const roles = await adminArea(page, 'Roles');
        await roles.getByRole('region', { name: 'Editor', exact: true }).getByRole('button', { name: 'Duplicate as custom role', exact: true }).click();
      });
      await audit(page, identity);
      await access(page, identity);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await api.stop();
  await mock.stop();
}

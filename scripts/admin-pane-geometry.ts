import { expect, type Page } from '@playwright/test';
import { adminArea, adminGeometry, cancelAdminDialog } from './helpers/admin-browser';

/** Exercises the grant panes and identity confirmations without applying destructive changes. */
export async function adminPaneGeometry(page: Page) {
  await domainFieldsAlign(page);
  const grants = await adminArea(page, 'Access grants');
  await grants
    .getByRole('button', { name: /^Change the grant for / })
    .first()
    .click();
  const change = page.getByRole('region', { name: 'Change grant', exact: true });
  await expect(change).toBeVisible();
  await adminGeometry(page, 'change-grant');
  await change.getByRole('button', { name: 'Back to grants', exact: true }).click();
  await grants
    .getByRole('button', { name: /^Remove the grant for / })
    .first()
    .click();
  await adminGeometry(page, 'remove-grant');
  await cancelAdminDialog(page);
  const users = await adminArea(page, 'Users & groups');
  const person = users.getByRole('button', { name: 'Actions for Alice Andrade', exact: true });
  for (const action of ['Deactivate', 'End sessions']) {
    await person.click();
    await page.getByRole('menuitem', { name: action, exact: true }).click();
    await adminGeometry(page, action.toLowerCase().replaceAll(' ', '-'));
    await cancelAdminDialog(page);
  }
}

/** Every domain name field ends at the same edge, whatever the domain id beside it says. */
async function domainFieldsAlign(page: Page) {
  const projects = await adminArea(page, 'Projects access');
  const fields = projects.getByLabel(/^Domain name /);
  await expect(fields.first()).toBeVisible();
  const rightEdges = await fields.evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().right)));
  expect(rightEdges.length).toBeGreaterThan(1);
  expect(new Set(rightEdges).size, `Domain field edges: ${rightEdges}`).toBe(1);
}

if (import.meta.main) {
  const { chromium } = await import('@playwright/test');
  const { openAdminHarness, adminMockState } = await import('../tests/helpers/admin-api-mock');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    await openAdminHarness(page, adminMockState());
    const grants = await adminArea(page, 'Access grants');
    const table = await grants.locator('.admin-table').first().boundingBox();
    expect(table!.width).toBeLessThanOrEqual(1200);
    await grants.getByRole('button', { name: 'Add grant', exact: true }).click();
    const form = await page.getByRole('region', { name: 'Add grant', exact: true }).boundingBox();
    expect(form!.width).toBeLessThanOrEqual(640);
    expect(form!.x).toBe(table!.x);
    console.log('Admin width check passed: form <= 640px, table <= 1200px, aligned left edges.');
  } finally {
    await browser.close();
  }
}

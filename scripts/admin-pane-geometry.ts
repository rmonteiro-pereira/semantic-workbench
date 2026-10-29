import { expect, type Page } from '@playwright/test';
import { adminArea, adminGeometry, cancelAdminDialog } from './helpers/admin-browser';

/** Exercises the grant panes and identity confirmations without applying destructive changes. */
export async function adminPaneGeometry(page: Page) {
  await domainFieldsAlign(page);
  const grants = await adminArea(page, 'Access grants');
  const actions = grants.getByRole('button', { name: /^Actions for grant/ }).first();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Change', exact: true }).click();
  const change = page.getByRole('region', { name: 'Change grant', exact: true });
  await expect(change).toBeVisible();
  await adminGeometry(page, 'change-grant');
  await change.getByRole('button', { name: 'Back to grants', exact: true }).click();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
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

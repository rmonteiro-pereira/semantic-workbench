import { expect, type Page } from '@playwright/test';
import { adminArea, adminGeometry, closeAdminArea } from './helpers/admin-browser';

/** Exercises secondary grant and identity dialogs without applying destructive changes. */
export async function adminSecondaryGeometry(page: Page) {
  const roles = await adminArea(page, 'Roles & access');
  const actions = roles.getByRole('button', { name: /^Actions for grant/ }).first();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Change', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Change grant', exact: true })).toBeVisible();
  await adminGeometry(page, 'change-grant');
  await page
    .getByRole('dialog', { name: 'Change grant', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await actions.click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await adminGeometry(page, 'remove-grant');
  await page
    .getByRole('dialog', { name: 'Remove grant', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await closeAdminArea(page, 'Roles & access');
  const users = await adminArea(page, 'Users & groups');
  const person = users.getByRole('button', { name: 'Actions for Alice Andrade', exact: true });
  for (const action of ['Deactivate', 'End sessions']) {
    await person.click();
    await page.getByRole('menuitem', { name: action, exact: true }).click();
    await adminGeometry(page, action.toLowerCase().replaceAll(' ', '-'));
    await page
      .getByRole('dialog', { name: action, exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
  }
  await closeAdminArea(page, 'Users & groups');
}

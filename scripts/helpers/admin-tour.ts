// The Admin page sections for the responsive suite: each one at every viewport size.
import type { Page } from '@playwright/test';
import { ADMIN_SECTIONS } from '../../src/app/admin/admin-sections';
import { adminHash } from '../../src/app/admin/admin-route';
import type { Screen } from './screen-tour';

async function showSection(page: Page, id: (typeof ADMIN_SECTIONS)[number]['id']) {
  await page.evaluate(hash => {
    globalThis.location.hash = hash;
  }, adminHash(id));
  await page.locator('.admin-page').waitFor();
  await page.getByRole('region', { name: ADMIN_SECTIONS.find(s => s.id === id)!.label }).waitFor();
}

/** Lists the Admin page sections; the page is a screen, not a dialog. */
export function adminScreens(): Screen[] {
  return ADMIN_SECTIONS.map(section => ({
    name: `admin-${section.id}`,
    show: page => showSection(page, section.id),
  }));
}

/** Leaves the Admin page through its Back button, as a person does. */
export async function leaveAdminPage(page: Page) {
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await page.locator('.admin-page').waitFor({ state: 'detached' });
}

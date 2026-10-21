// Opens file actions through the header menus used by browser checks.
import type { Page } from '@playwright/test';
// Export sits in the header's More actions menu; New ▾ holds one Add item per kind.
/** Opens Export through the header action menu. */
export async function exportFile(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Export' }).click();
}
/** Opens the named item creation action through the New menu. */
export async function newItem(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

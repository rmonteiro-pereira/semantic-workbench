// Opens file actions through the header menus used by browser checks.
import type { Page } from '@playwright/test';
// Export is a header button; New ▾ holds one Add item per kind.
/** Clicks the header's Export button. */
export async function exportFile(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
}
/** Opens the named item creation action through the New menu. */
export async function newItem(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

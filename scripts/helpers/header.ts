import type { Page } from '@playwright/test';
// v0.3.0 (FR-060): Export sits in the header's More actions menu; New ▾ holds one Add item per kind.
export async function exportFile(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Export' }).click();
}
export async function newItem(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

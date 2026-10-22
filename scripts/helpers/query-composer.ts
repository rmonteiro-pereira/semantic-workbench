// Opens and closes the Mappings tab's query composer, which is a dialog.
import { expect, type Page } from '@playwright/test';

/** The open Compose a query dialog. */
export const composerDialog = (page: Page) => page.getByRole('dialog', { name: 'Compose a query' });

/** Opens the composer from the Mappings tab and waits for it. */
export async function openComposer(page: Page) {
  await page.getByRole('button', { name: 'Compose a query…', exact: true }).click();
  await expect(composerDialog(page)).toBeVisible();
}

/** Closes the composer; its choices stay for the next time it opens. */
export async function closeComposer(page: Page) {
  await composerDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(composerDialog(page)).toHaveCount(0);
}

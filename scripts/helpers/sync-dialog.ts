import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the Sync dialog from the Source control panel and returns it. */
export async function openSyncDialog(page: Page) {
  await page
    .getByRole('region', { name: 'Source Control' })
    .getByRole('button', { name: 'Sync…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Sync', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Runs one remote action (Fetch, Pull, Push or Sync) from the Sync dialog, which then closes. */
export async function runSyncAction(page: Page, name: string) {
  const dialog = await openSyncDialog(page);
  await dialog.getByRole('group', { name: 'Remote actions' }).getByRole('button', { name }).click();
  await expect(dialog).toHaveCount(0);
}

/** The button of the Sync dialog that opens the remote form, whatever it is called by then. */
export const remoteButton = (dialog: Locator) =>
  dialog.getByRole('button', { name: /^(Add|Change) remote…$/ });

/** The remote dialog in either of its steps: the form or the review of a file move. */
export const remoteDialog = (page: Page) => page.getByRole('dialog', { name: /remote|file move/i });

/** Opens the remote dialog through the Sync dialog. */
export async function openRemoteDialog(page: Page) {
  const dialog = await openSyncDialog(page);
  await remoteButton(dialog).click();
  await expect(dialog).toHaveCount(0);
}

/** Closes the Sync dialog with its Close button. */
export async function closeSyncDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Says whether the panel offers the Sync dialog to this person. */
export async function offersSyncDialog(page: Page) {
  const opener = page
    .getByRole('region', { name: 'Source Control' })
    .getByRole('button', { name: 'Sync…', exact: true });
  return (await opener.count()) > 0;
}

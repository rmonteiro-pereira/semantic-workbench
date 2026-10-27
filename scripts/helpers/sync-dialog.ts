import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the Sync dialog (published-branch actions of a server working copy) and returns it. */
export async function openSyncDialog(page: Page) {
  await page
    .getByRole('region', { name: 'Source Control' })
    .getByRole('button', { name: 'Sync…', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Sync', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The Fetch, Pull, Push and Sync buttons under the remote line of the Source control panel. */
export const remoteActions = (page: Page) =>
  page
    .getByRole('region', { name: 'Source Control' })
    .getByRole('group', { name: 'Remote actions' });

/** Runs one remote action (Fetch, Pull, Push or Sync) from the Source control panel. */
export async function runSyncAction(page: Page, name: string) {
  await remoteActions(page).getByRole('button', { name }).click();
}

/** The Remote… button of the Source control panel, which opens the remote form directly. */
export const remoteButton = (page: Page) =>
  page.getByRole('region', { name: 'Source Control' }).getByRole('button', { name: 'Remote…' });

/** The remote dialog in either of its steps: the form or the review of a file move. */
export const remoteDialog = (page: Page) => page.getByRole('dialog', { name: /remote|file move/i });

/** Opens the remote dialog from the Source control panel. */
export async function openRemoteDialog(page: Page) {
  await remoteButton(page).click();
  await expect(remoteDialog(page)).toBeVisible();
}

/** Closes the Sync dialog with its Close button. */
export async function closeSyncDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

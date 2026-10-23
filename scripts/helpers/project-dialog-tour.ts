// Dialogs reached from Source control and the project tree, as screens of the responsive suite.
import type { Page } from '@playwright/test';
import { showSidebar, type Screen } from './screen-tour';
import { openSyncDialog } from './sync-dialog';

async function openSourceControlPanel(page: Page) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /Source control/ })
    .first()
    .click();
  await page.waitForTimeout(500);
}

async function showSyncDialog(page: Page) {
  await openSourceControlPanel(page);
  await openSyncDialog(page);
}

async function openCloneDialog(page: Page) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /Import/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Clone a Git repository…' }).click();
}

async function openProjectMenuItem(page: Page, item: string) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /^Actions for / })
    .first()
    .click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Lists the dialogs reached from Source control and the project tree. */
export function projectDialogScreens(): Screen[] {
  return [
    { name: 'source-control-sync', show: showSyncDialog, dialog: 'dialog[open]' },
    { name: 'clone-repository', show: openCloneDialog, dialog: 'dialog[open]' },
    {
      name: 'project-rename',
      show: page => openProjectMenuItem(page, 'Rename'),
      dialog: 'dialog[open]',
    },
    {
      name: 'project-delete',
      show: page => openProjectMenuItem(page, 'Delete'),
      dialog: 'dialog[open]',
    },
  ];
}

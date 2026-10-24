// The Clone and Remote dialogs with the Folder in repository field, for the responsive suite.
import type { Page } from '@playwright/test';
import { openCloneDialog } from './project-dialog-tour';
import { showSidebar, type Screen } from './screen-tour';
import { openSyncDialog, remoteButton, remoteDialog } from './sync-dialog';

async function openRemoteWithFolder(page: Page, folder: string) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /Source control/ })
    .first()
    .click();
  await page.waitForTimeout(500);
  const sync = await openSyncDialog(page);
  await remoteButton(sync).click();
  const dialog = remoteDialog(page);
  await dialog.getByLabel('Remote URL').fill('/tmp/team-repository.git');
  await dialog.getByLabel('Folder in repository').fill(folder);
  return dialog;
}

async function showCloneFolder(page: Page, folder: string) {
  await openCloneDialog(page);
  const dialog = page.getByRole('dialog', { name: 'Clone repository' });
  await dialog.getByLabel('Repository URL or path').fill('/tmp/team-repository.git');
  await dialog.getByLabel('Folder in repository').fill(folder);
}

async function showMovePreview(page: Page, serverMode = false) {
  const dialog = await openRemoteWithFolder(page, 'semantic/ubl');
  await dialog.getByRole('button', { name: 'Save remote' }).click();
  if (serverMode) {
    await dialog
      .getByText(
        'Choosing a folder for an existing project works in local mode. Clone the folder instead.',
        { exact: true },
      )
      .waitFor();
    return;
  }
  await dialog.getByRole('list', { name: 'Files that move' }).waitFor();
}

/** Lists the dialogs that carry the Folder in repository field and its confirmation. */
export function sparseScreens(serverMode = false): Screen[] {
  return [
    {
      name: 'clone-folder',
      show: page => showCloneFolder(page, 'semantic/ubl'),
      dialog: 'dialog[open]',
    },
    {
      name: 'clone-folder-refused',
      show: page => showCloneFolder(page, '../outside'),
      dialog: 'dialog[open]',
    },
    {
      name: 'remote-folder',
      show: async page => void (await openRemoteWithFolder(page, 'semantic/ubl')),
      dialog: 'dialog[open]',
    },
    {
      name: serverMode ? 'remote-folder-refused' : 'remote-folder-preview',
      show: page => showMovePreview(page, serverMode),
      dialog: 'dialog[open]',
    },
  ];
}

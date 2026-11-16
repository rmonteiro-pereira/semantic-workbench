// Dialogs that no other tour opens. The check every dialog must pass is in dialog-geometry.ts.
import { expect, type Page } from '@playwright/test';
import { openFile, showSidebar, type Screen } from './screen-tour';

async function openFileMoveDialog(page: Page, file: string) {
  await openFile(page, file);
  await showSidebar(page);
  const selectedFile = page.locator('.project-file[aria-selected="true"]');
  await selectedFile.getByRole('button', { name: /^Actions for / }).click({ force: true });
  await page.getByRole('menuitem', { name: 'Move' }).click();
  await expect(page.getByLabel('Path in that project (folder and file name)')).toBeVisible();
}

/** Lists the dialogs reached from a file's menu in the sidebar. */
export function dialogsTourScreens(file: string): Screen[] {
  return [
    {
      name: 'file-move',
      show: page => openFileMoveDialog(page, file),
      dialog: 'dialog[open]',
    },
  ];
}

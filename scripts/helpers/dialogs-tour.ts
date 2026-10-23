// Dialogs that no other tour opens. The check every dialog must pass is in dialog-geometry.ts.
import type { Page } from '@playwright/test';
import { openFile, showSidebar, type Screen } from './screen-tour';

async function openFileMoveDialog(page: Page, file: string) {
  await openFile(page, file);
  await showSidebar(page);
  await page
    .getByRole('button', { name: new RegExp(`^Actions for ${file} in `) })
    .click({ force: true });
  await page.getByRole('menuitem', { name: 'Move' }).click();
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

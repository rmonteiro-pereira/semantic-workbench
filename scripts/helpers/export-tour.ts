// The Export project dialog as screens of the responsive suite, with the Git history choice off
// and on, so both states are measured at every viewport size.
import { showSidebar, type Screen } from './screen-tour';

async function openExportDialog(page: Parameters<Screen['show']>[0]) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /^Actions for / })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Export project…' }).click();
  await page.getByRole('dialog').waitFor();
}

async function openExportDialogWithHistory(page: Parameters<Screen['show']>[0]) {
  await openExportDialog(page);
  await page.getByLabel('Include Git history').check();
}

/** Lists the Export project dialog in both of its states. */
export function exportScreens(): Screen[] {
  return [
    { name: 'project-export', show: openExportDialog, dialog: 'dialog[open]' },
    {
      name: 'project-export-history',
      show: openExportDialogWithHistory,
      dialog: 'dialog[open]',
    },
  ];
}

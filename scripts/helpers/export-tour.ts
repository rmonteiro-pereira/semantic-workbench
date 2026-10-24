// The Export project dialog as screens of the responsive suite, with the Git history choice off
// and on, so both states are measured at every viewport size.
import { expect, type Page } from '@playwright/test';
import { openProjectMenuItem } from './project-dialog-tour';
import type { Screen } from './screen-tour';

async function openExportDialog(page: Page, file: string) {
  await openProjectMenuItem(page, file, 'Export project…');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog', { name: /^Export / }).waitFor();
}

async function openExportDialogWithHistory(page: Page, file: string) {
  await openExportDialog(page, file);
  await page.getByLabel('Include Git history').check();
}

/** Lists the Export project dialog in both of its states, over the project that holds `file`. */
export function exportScreens(file: string): Screen[] {
  return [
    { name: 'project-export', show: page => openExportDialog(page, file), dialog: 'dialog[open]' },
    {
      name: 'project-export-history',
      show: page => openExportDialogWithHistory(page, file),
      dialog: 'dialog[open]',
    },
  ];
}

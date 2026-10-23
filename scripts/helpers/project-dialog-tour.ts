// Dialogs reached from Source control and the project tree, as screens of the responsive suite.
import type { Page } from '@playwright/test';
import { openFile, showSidebar, type Screen } from './screen-tour';
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

/** Opens the Clone repository dialog from the sidebar's Import dialog. */
export async function openCloneDialog(page: Page) {
  await showSidebar(page);
  await page
    .getByRole('button', { name: /Import/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Clone a Git repository…' }).click();
}

/**
 * Opens the project that holds `file` in the Models explorer and chooses an item of that project's
 * menu, so the dialog opens over the workspace of the project it is about.
 */
export async function openProjectMenuItem(page: Page, file: string, item: string) {
  // Another screen may have left Source control open, which opening the current file keeps.
  await showSidebar(page);
  await page.getByRole('button', { name: /Model explorer/ }).click();
  await openFile(page, file);
  await showSidebar(page);
  const project = page
    .locator('li.project')
    .filter({ has: page.getByRole('button', { name: file, exact: true }) });
  await project
    .getByRole('button', { name: /^Actions for / })
    .first()
    .click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Says when the open dialog is about another project than the one shown behind it. */
export async function projectDialogBackdropProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const chosen = document.querySelector('.document.chosen');
    const behind = chosen?.closest('li.project')?.getAttribute('aria-label');
    const title = document.querySelector('dialog[open] h2')?.textContent ?? '';
    const problems: string[] = [];
    if (!behind) problems.push('no project file is open behind the dialog');
    else if (!title.includes(behind)) {
      problems.push(`the dialog "${title}" is drawn over the project "${behind}"`);
    }
    if (document.querySelector('section.scm')) {
      problems.push('the page behind the dialog is Source control, not the Models explorer');
    }
    return problems;
  });
}

/** Lists the dialogs reached from Source control and the project tree. */
export function projectDialogScreens(file: string): Screen[] {
  return [
    { name: 'source-control-sync', show: showSyncDialog, dialog: 'dialog[open]' },
    { name: 'clone-repository', show: openCloneDialog, dialog: 'dialog[open]' },
    {
      name: 'project-rename',
      show: page => openProjectMenuItem(page, file, 'Rename'),
      dialog: 'dialog[open]',
    },
    {
      name: 'project-delete',
      show: page => openProjectMenuItem(page, file, 'Delete'),
      dialog: 'dialog[open]',
    },
  ];
}

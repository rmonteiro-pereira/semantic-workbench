// The ODCS graph screens and dialogs, for the responsive suite and the capture tools.
import type { Page } from '@playwright/test';
import { showSidebar, type Screen } from './screen-tour';
import { hopRowProblems, odcsGraphProblems } from './odcs-graph-geometry';

async function openGraph(page: Page, file: string) {
  await showSidebar(page);
  await page.getByRole('button', { name: file, exact: true }).first().click();
  await page.waitForTimeout(500);
  await page
    .locator('.tabs')
    .getByRole('button', { name: /^Graph/ })
    .click();
  await page.waitForTimeout(1500);
}

async function showAllCards(page: Page, file: string) {
  await openGraph(page, file);
  const showAll = page.getByRole('button', { name: /Show all$/ });
  if (await showAll.isVisible()) await showAll.click();
  await page.waitForTimeout(1200);
}

/** Lists the graph of the contract: its first view, every card, and its dialogs. */
export function odcsGraphScreens(contract: string): Screen[] {
  return [
    { name: 'odcs-graph-first-view', show: page => openGraph(page, contract) },
    { name: 'odcs-graph-all-cards', show: page => showAllCards(page, contract) },
    {
      name: 'odcs-dataset-lineage',
      show: async page => {
        await openGraph(page, contract);
        await page
          .locator('.tabs')
          .getByRole('button', { name: /^Contract/ })
          .click();
        const back = page.getByRole('button', { name: 'All tables' });
        if (await back.isVisible()) await back.click();
        await page.getByRole('button', { name: 'Open orders', exact: true }).click();
        await page.getByRole('tab', { name: 'Lineage' }).click();
        await page.waitForTimeout(1200);
      },
    },
    {
      name: 'odcs-graph-hop-list',
      dialog: 'dialog[open]',
      show: async page => {
        await openGraph(page, contract);
        await page.getByRole('button', { name: /^Foreign keys \(/ }).click();
      },
    },
    {
      name: 'odcs-graph-options',
      dialog: 'dialog[open]',
      show: async page => {
        await openGraph(page, contract);
        await page.getByRole('button', { name: /^Lineage options/ }).click();
      },
    },
  ];
}

/** Returns the graph problems of a screen of this tour; dialogs are covered by the text checks. */
export async function odcsGraphScreenProblems(page: Page, screen: Screen): Promise<string[]> {
  if (screen.dialog) return [];
  // With every card on screen the canvas zooms out, so only the first view must read at 12 px.
  const readableColumns = screen.name !== 'odcs-graph-all-cards';
  const problems = [
    ...(await odcsGraphProblems(page, { readableColumns })),
    ...(await hopRowProblems(page)),
  ];
  return problems.map(problem => `${screen.name}: ${problem}`);
}

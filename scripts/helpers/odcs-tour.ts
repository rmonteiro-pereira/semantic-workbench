// The ODCS contract and dataset screens, including their dialogs, for the responsive suite.
import type { Page } from '@playwright/test';
import { showSidebar, type Screen } from './screen-tour';

async function openContract(page: Page, file: string) {
  await showSidebar(page);
  await page.getByRole('button', { name: file, exact: true }).first().click();
  await page.waitForTimeout(500);
  await page
    .locator('.tabs')
    .getByRole('button', { name: /^Contract/ })
    .click();
  await page.waitForTimeout(500);
  // The contract tab remembers the dataset page a previous screen left open.
  const back = page.getByRole('button', { name: 'All objects' });
  if (await back.isVisible()) await back.click();
}

async function openOrders(page: Page, file: string) {
  await openContract(page, file);
  await page.getByRole('button', { name: 'Open orders', exact: true }).click();
  await page.waitForTimeout(300);
}

function datasetTab(file: string, tab: string): Screen['show'] {
  return async page => {
    await openOrders(page, file);
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(400);
  };
}

/** Lists the contract page, its section dialog, the dataset page tabs and the property dialog. */
export function odcsScreens(contract: string): Screen[] {
  return [
    { name: 'odcs-contract', show: page => openContract(page, contract) },
    {
      name: 'odcs-contract-section',
      dialog: 'dialog[open]',
      show: async page => {
        await openContract(page, contract);
        await page.getByRole('button', { name: 'Team and roles' }).click();
      },
    },
    { name: 'odcs-dataset-properties', show: datasetTab(contract, 'Properties') },
    { name: 'odcs-dataset-relationships', show: datasetTab(contract, 'Relationships') },
    { name: 'odcs-dataset-quality', show: datasetTab(contract, 'Data Quality') },
    { name: 'odcs-dataset-history', show: datasetTab(contract, 'History') },
    {
      name: 'odcs-property-edit',
      dialog: 'dialog[open]',
      show: async page => {
        await openOrders(page, contract);
        await page.getByRole('button', { name: 'Edit status', exact: true }).click();
      },
    },
  ];
}

/** Returns each table whose card scrolls sideways, which the ODCS pages must never do. */
export async function sidewaysTableProblems(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.odcs-table-wrap')]
      .filter(wrap => wrap.getClientRects().length > 0)
      .filter(wrap => wrap.scrollWidth > wrap.clientWidth + 1)
      .map(wrap => {
        const label = wrap.querySelector('table')?.getAttribute('aria-label') ?? 'table';
        return `${label} scrolls sideways (${wrap.scrollWidth} > ${wrap.clientWidth})`;
      }),
  );
}

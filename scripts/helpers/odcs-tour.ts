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
  const back = page.getByRole('button', { name: 'All tables' });
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

/** Lists the contract page with its team, the dataset page tabs and the property dialog. */
export function odcsScreens(contract: string): Screen[] {
  return [
    {
      name: 'odcs-contract-search',
      show: async page => {
        await openContract(page, contract);
        await page.getByRole('searchbox', { name: 'Find a table' }).fill('order');
        await page.waitForTimeout(300);
      },
    },
    {
      name: 'odcs-contract-team',
      show: async page => {
        await openContract(page, contract);
        await page.getByRole('region', { name: 'Team and roles' }).waitFor();
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

type OdcsMeasure = (page: Page) => Promise<string[]>;

// A contract id wraps neither inside the UUID nor out of its chip.
const contractIdProblems: OdcsMeasure = page =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.odcs-contract-id code')]
      .filter(chip => chip.getClientRects().length > 0)
      .flatMap(chip => {
        const box = chip.getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(chip).lineHeight) || 16;
        const wrapped = box.height > lineHeight * 1.8;
        const cut = chip.scrollWidth > chip.clientWidth + 1;
        return [...(wrapped ? [`contract id wraps onto ${Math.round(box.height)} px of height`] : []), ...(cut ? ['contract id is cut off'] : [])];
      }),
  );

// Table descriptions show in full: no cell clips its text.
const descriptionProblems: OdcsMeasure = page =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.odcs-objects-table td.odcs-desc')]
      .filter(cell => cell.getClientRects().length > 0)
      .filter(cell => cell.scrollWidth > cell.clientWidth + 1 || /ellipsis/.test(getComputedStyle(cell).textOverflow))
      .map(cell => `description is cut: "${cell.innerText.slice(0, 30)}"`),
  );

// Under the title, the dataset action sits on its own row or well clear of the title block.
const datasetHeaderProblems: OdcsMeasure = page =>
  page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.odcs-title > .odcs-head-action');
    const title = document.querySelector<HTMLElement>('.odcs-dataset .odcs-title > div');
    if (!action || !title || action.getClientRects().length === 0) return [];
    const actionBox = action.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const below = actionBox.top >= titleBox.bottom - 1;
    const gap = actionBox.left - titleBox.right;
    const out: string[] = [];
    if (!below && gap < 12) out.push(`Open in lineage is ${Math.round(gap)} px from the title`);
    if (actionBox.right > innerWidth) out.push('Open in lineage runs off the screen');
    return out;
  });

// The dataset tabs fit on one row, however narrow the window is.
const tabRowProblems: OdcsMeasure = page =>
  page.evaluate(() => {
    const tops = [...document.querySelectorAll<HTMLElement>('.odcs-tabs [role=tab]')].filter(tab => tab.getClientRects().length > 0).map(tab => Math.round(tab.getBoundingClientRect().top));
    return new Set(tops).size > 1 ? [`dataset tabs wrap onto ${new Set(tops).size} rows`] : [];
  });

// In the property table a name and its Edit button share one centre line.
const propertyRowProblems: OdcsMeasure = page =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.odcs-properties tbody tr')]
      .filter(row => row.getClientRects().length > 0)
      // On a phone each row is a stacked card, where the name and the button are on separate lines.
      .filter(row => getComputedStyle(row).display === 'table-row')
      .flatMap(row => {
        const name = row.querySelector<HTMLElement>('.col-name code');
        const edit = row.querySelector<HTMLElement>('.odcs-row-edit');
        if (!name || !edit) return [];
        const nameBox = name.getBoundingClientRect();
        const editBox = edit.getBoundingClientRect();
        const offset = Math.abs(nameBox.top + nameBox.height / 2 - (editBox.top + editBox.height / 2));
        return offset > 2 ? [`${name.innerText} is ${Math.round(offset)} px off its Edit button`] : [];
      }),
  );

// Stacked property cards name the edit action once and keep its button compact.
const propertyActionProblems: OdcsMeasure = page =>
  page.evaluate(() => {
    if (innerWidth > 700) return [];
    return [...document.querySelectorAll<HTMLElement>('.odcs-properties .col-actions')].flatMap(cell => {
      const button = cell.querySelector('button');
      if (!button) return [];
      const problems: string[] = [];
      if (getComputedStyle(cell, '::before').content !== 'none') {
        problems.push('property action repeats its Edit label');
      }
      if (button.getBoundingClientRect().width > 100) {
        problems.push('property Edit button stretches across its card');
      }
      return problems;
    });
  });

// Tables keep a readable width on a wide screen instead of stretching across it.
const tableWidthProblems: OdcsMeasure = page =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.odcs-page .odcs-table-wrap')]
      .filter(wrap => wrap.getClientRects().length > 0)
      .filter(wrap => wrap.getBoundingClientRect().width > 1402)
      .map(wrap => `a table is ${Math.round(wrap.getBoundingClientRect().width)} px wide`),
  );

// The Relationships tab explains both direction chips once, above the table.
const legendProblems: OdcsMeasure = page =>
  page.evaluate(() => {
    const table = document.querySelector('table[aria-label="Relationships"]');
    if (!table || table.getClientRects().length === 0) return [];
    const legend = document.querySelector('.odcs-legend');
    const panel = table.closest('.odcs-relationships');
    const content = table.closest('.odcs-panel');
    if (panel && content && innerWidth >= 1400) {
      const panelWidth = panel.getBoundingClientRect().width;
      if (panelWidth < Math.min(1400, content.clientWidth) - 2) {
        return ['the relationships panel is narrower than the readable content width'];
      }
    }
    for (const chip of legend?.querySelectorAll('.odcs-dir') ?? []) {
      if (getComputedStyle(chip).whiteSpace !== 'nowrap') {
        return ['a relationship direction badge can wrap into multiple lines'];
      }
    }
    const chips = legend ? legend.querySelectorAll('.odcs-dir').length : 0;
    return chips === 2 ? [] : [`direction legend shows ${chips} chips instead of 2`];
  });

// A dialog of these pages names its table and leaves room under the title.
const dialogTitleProblems: OdcsMeasure = page =>
  page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('dialog[open]');
    if (!dialog) return [];
    const title = dialog.querySelector('h2');
    const body = dialog.querySelector<HTMLElement>('.dialog-body');
    if (!title || !body) return [];
    const first = body.firstElementChild;
    const gap = first ? first.getBoundingClientRect().top - title.getBoundingClientRect().bottom : 99;
    return gap < 10 ? [`the first field is ${Math.round(gap)} px under the dialog title`] : [];
  });

/** Returns the layout problems of the ODCS screen now shown, on top of the shared geometry. */
export async function odcsLayoutProblems(page: Page, screenName: string): Promise<string[]> {
  const measures: OdcsMeasure[] = [
    contractIdProblems,
    descriptionProblems,
    datasetHeaderProblems,
    tabRowProblems,
    propertyRowProblems,
    propertyActionProblems,
    tableWidthProblems,
    legendProblems,
    dialogTitleProblems,
  ];
  const problems = (await Promise.all(measures.map(measure => measure(page)))).flat();
  return problems.map(problem => `${screenName}: ${problem}`);
}

/** Says whether the property edit dialog names the table and the property it edits. */
export async function editTitleProblems(page: Page): Promise<string[]> {
  const title = await page.locator('dialog[open] h2').first().innerText();
  return title === 'Edit orders.status' ? [] : [`the edit dialog is titled "${title}"`];
}

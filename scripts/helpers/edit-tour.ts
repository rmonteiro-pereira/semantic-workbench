// The editing, metrics, mappings and catalog screens: item drawers, add dialogs, the metrics list
// with its filters and detail, the metric wizard, the query composer and the catalog. The
// responsive suite measures each of them at every viewport size.
import type { Page } from '@playwright/test';
import { newItem } from './header';
import { fileTab, openFile, type Screen } from './screen-tour';

/** Files the tour opens: an ontology with a catalog and mappings, and a model with metrics. */
export type EditTourFiles = { ontology: string; metricsModel: string };

// A metric opened by an earlier screen hides the list on a phone until All metrics is pressed.
function metricsList(file: string): Screen['show'] {
  return async page => {
    await fileTab(file, 'Metrics')(page);
    const back = page.getByRole('button', { name: 'All metrics' });
    if (await back.isVisible()) await back.click();
  };
}

async function openFirstMetric(page: Page) {
  await page
    .getByRole('button', { name: /: explain$/ })
    .first()
    .click();
  await page.waitForTimeout(800);
}

async function openOnDemandSections(page: Page) {
  const closed = page.locator('details.on-demand:not([open]) > summary');
  while (await closed.count()) await closed.first().click();
  await page.waitForTimeout(400);
}

/** Lists the edit, metrics, mappings and catalog screens, one per view and dialog. */
export function editScreens({ ontology, metricsModel }: EditTourFiles): Screen[] {
  const dialog = 'dialog[open]';
  return [
    { name: 'catalog', show: fileTab(ontology, 'Catalog') },
    {
      name: 'item-editor',
      dialog,
      show: async page => {
        await fileTab(ontology, 'Catalog')(page);
        await page
          .getByRole('button', { name: /^Edit /, exact: false })
          .first()
          .click();
        await page.waitForTimeout(800);
      },
    },
    {
      name: 'add-concept',
      dialog,
      show: async page => {
        await openFile(page, ontology);
        await newItem(page, 'Add concept…');
        await page.waitForTimeout(500);
      },
    },
    { name: 'metrics-list', show: metricsList(metricsModel) },
    {
      name: 'metrics-filters',
      dialog,
      show: async page => {
        await metricsList(metricsModel)(page);
        await page.getByRole('button', { name: /^Filters/ }).click();
      },
    },
    {
      name: 'metric-detail',
      show: async page => {
        await metricsList(metricsModel)(page);
        await openFirstMetric(page);
        await openOnDemandSections(page);
      },
    },
    {
      name: 'metric-wizard',
      dialog,
      show: async page => {
        await metricsList(metricsModel)(page);
        await page.getByRole('button', { name: 'New metric' }).click();
        await page.waitForTimeout(500);
      },
    },
    { name: 'mappings', show: fileTab(ontology, 'Mappings') },
    {
      name: 'query-composer',
      dialog,
      show: async page => {
        await fileTab(ontology, 'Mappings')(page);
        await page.getByRole('button', { name: 'Compose a query…', exact: true }).click();
        await page.waitForTimeout(500);
      },
    },
  ];
}

/** Measures what each edit screen promises beyond readable text: where its parts sit. */
export async function editContainmentProblems(page: Page, screenName: string): Promise<string[]> {
  return page.evaluate(name => {
    const problems: string[] = [];
    const width = innerWidth;
    const height = innerHeight;
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const panel = box('dialog[open] .workbench-dialog');
    if (name === 'add-concept' && panel) {
      const offCentre = Math.abs(panel.left + panel.width / 2 - width / 2);
      if (offCentre > 2) problems.push(`the add dialog is ${offCentre}px off centre`);
      if (panel.left < 0 || panel.right > width) problems.push('the add dialog leaves the screen');
    }
    if (name === 'item-editor' || name === 'metric-wizard') {
      const footer = box('dialog[open] .dialog-footer');
      const body = box('dialog[open] .dialog-body');
      if (!footer || !body) problems.push('the drawer has no body and footer');
      else {
        if (Math.abs(footer.bottom - height) > 2) problems.push('the drawer footer is not pinned');
        if (body.bottom > footer.top + 1) problems.push('the drawer body runs under its footer');
        if (footer.right > width + 1) problems.push('the drawer footer leaves the screen');
      }
    }
    if (name === 'query-composer') {
      const scrollers = [...document.querySelectorAll<HTMLElement>('dialog[open] *')].filter(el => {
        const overflow = getComputedStyle(el).overflowY;
        return ['auto', 'scroll'].includes(overflow) && el.scrollHeight > el.clientHeight + 1;
      });
      if (scrollers.length > 1) problems.push(`${scrollers.length} nested scroll regions`);
    }
    if (name === 'metric-wizard' && panel) {
      const picker = box('dialog[open] select[aria-label="Go to step"]');
      if (!picker || picker.right > panel.right) problems.push('the step picker leaves the dialog');
    }
    if (name === 'catalog') {
      const cards = [...document.querySelectorAll('.catalog-card')].map(card =>
        card.getBoundingClientRect(),
      );
      const firstRow = cards.filter(card => Math.abs(card.top - cards[0].top) < 2);
      const unequal = firstRow.some(card => Math.abs(card.height - firstRow[0].height) > 1);
      if (unequal) problems.push('cards of one row differ in height');
      const clamped = [...document.querySelectorAll<HTMLElement>('.catalog-card p')].some(
        paragraph => paragraph.scrollHeight > paragraph.clientHeight && !paragraph.title,
      );
      if (clamped) problems.push('a clamped card description has no tooltip with the full text');
    }
    return problems.map(problem => `${name}: ${problem}`);
  }, screenName);
}

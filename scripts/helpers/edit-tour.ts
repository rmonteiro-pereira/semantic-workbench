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
  // Clicking the summaries scrolls the pane; a reader opens the metric at its title.
  await page.locator('.metrics-detail').evaluate(pane => pane.scrollTo({ top: 0 }));
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
    if (width <= 480 && panel) {
      const fields = document.querySelector<HTMLElement>('dialog[open] .item-fields');
      if (fields && getComputedStyle(fields).gridTemplateColumns.split(' ').length !== 1) {
        problems.push('phone item fields do not stack in one column');
      }
    }
    if (name === 'add-concept' && panel) {
      const offCentre = Math.abs(panel.left + panel.width / 2 - width / 2);
      if (offCentre > 2) problems.push(`the add dialog is ${offCentre}px off centre`);
      if (panel.left < 0 || panel.right > width) problems.push('the add dialog leaves the screen');
    }
    if (name === 'item-editor' || name === 'metric-wizard') {
      const bodyElement = document.querySelector<HTMLElement>('dialog[open] .dialog-body');
      if (bodyElement && Number.parseFloat(getComputedStyle(bodyElement).paddingBottom) < 24) {
        problems.push('the drawer has no space below the last field');
      }
      const footer = box('dialog[open] .dialog-footer');
      const body = box('dialog[open] .dialog-body');
      if (!footer || !body) problems.push('the drawer has no body and footer');
      else {
        // The item editor fills the window; the wizard is as tall as its step and no taller.
        const pinnedTo = name === 'metric-wizard' && panel ? panel.bottom : height;
        if (Math.abs(footer.bottom - pinnedTo) > 2)
          problems.push('the drawer footer is not pinned');
        if (footer.bottom > height + 1) problems.push('the drawer footer leaves the window');
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
      const picker =
        box('dialog[open] .wizard-stepper-compact') ?? box('dialog[open] .wizard-stepper-list');
      if (!picker || picker.right > panel.right) problems.push('the step list leaves the dialog');
      const current = document.querySelector<HTMLElement>(
        '.wizard-stepper-list [aria-current="step"]',
      );
      if (current && current.getClientRects().length > 0) {
        const style = getComputedStyle(current);
        const pending = document.querySelector('.wizard-stepper-list button:disabled');
        if (style.justifyContent !== 'flex-start')
          problems.push('step labels are not left aligned');
        if (pending && style.backgroundColor === getComputedStyle(pending).backgroundColor) {
          problems.push('the current step has the same fill as a pending step');
        }
      }
    }
    if (name === 'metric-detail') {
      const table = box('.metrics-table');
      const wrap = box('.metrics-table-wrap');
      if (table && wrap && table.right > wrap.right + 1) {
        problems.push('the metrics table is wider than its pane in the split view');
      }
      const pane = document.querySelector('.metrics-detail');
      if (pane && pane.scrollTop !== 0) problems.push('the metric detail is not at its top');
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
      for (const title of document.querySelectorAll<HTMLElement>('.catalog-card strong')) {
        if (title.scrollWidth > title.clientWidth && title.title !== title.textContent) {
          problems.push('a truncated catalog title has no full name tooltip');
        }
      }
    }
    return problems.map(problem => `${name}: ${problem}`);
  }, screenName);
}

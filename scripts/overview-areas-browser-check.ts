// Checks that Group by lives only in the Graph toolbar and that Overview cards pack as a masonry with a cap.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { expectModelName } from './helpers/header';
import { groupTrigger, groupingMenuLabels, openGroupMenu, chooseGrouping } from './helpers/grouping-menu';
import { pageLayoutProblems } from './helpers/page-layout';
import { LOCAL_READER } from '../src/server/projects/reader';

const AREA_ENTITY_LIMIT = 8;
const flightsSource = await Bun.file('public/examples/ossie/flights.ontology.yaml').text();
// Twelve entities of one type and no links, domains or IRIs: nothing to choose between, one big area.
const plainNames = 'Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima'.split(' ');
const plainSource = ['version: 0.2.0.dev0', 'name: Plain list', 'ontology:', ...plainNames.map(name => `- concept: ${name}\n  type: EntityType`)].join('\n') + '\n';

const api = await startIsolatedApi();
await api.ws.importBatch({ files: [{ path: 'plain.ontology.yaml', source: plainSource }] }, LOCAL_READER);
await api.ws.importBatch({ files: [{ path: 'flights.ontology.yaml', source: flightsSource }] }, LOCAL_READER);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);

const tabs = page.locator('.tabs');
const openTab = (name: string) => tabs.getByRole('button', { name, exact: true }).click();
let passed = 0;
async function check(name: string, action: () => Promise<void>) {
  await action();
  passed++;
  console.log('PASS', name);
}

try {
  await page.goto(appUrl());
  await page.getByRole('button', { name: 'flights.ontology.yaml', exact: true }).click();
  await expectModelName(page, 'Flights');

  await check('Overview has no Group by control, only a chip that names the grouping', async () => {
    await openTab('Overview');
    await expect(page.locator('.overview-grouping-note')).toContainText('Grouped by suggested communities');
    await expect(page.locator('.overview-grouping-note').getByRole('button', { name: 'Change in Graph' })).toBeVisible();
    await expect(groupTrigger(page)).toHaveCount(0);
    await expect(page.getByLabel('Group model by')).toHaveCount(0);
    await expect(page.locator('.grouping-controls')).toHaveCount(0);
    await page.locator('.overview-grouping-note').getByRole('button', { name: 'Change in Graph' }).click();
    await expect(groupTrigger(page)).toBeVisible();
  });

  await check('the Graph menu lists only usable ways, each explained, with a footer naming what Automatic picked', async () => {
    const menu = await openGroupMenu(page);
    await expect(menu.getByRole('menuitemradio', { disabled: true })).toHaveCount(0);
    await expect(menu.locator('[disabled], [aria-disabled="true"]')).toHaveCount(0);
    expect(await groupingMenuLabels(page)).toEqual(['Suggested communities', 'Definition types', 'Automatic']);
    const reopened = await openGroupMenu(page);
    for (const item of await reopened.getByRole('menuitemradio').all()) await expect(item.locator('small')).not.toBeEmpty();
    await expect(reopened).toContainText('Only ways that work for this file are listed. Automatic picked Suggested communities.');
    await page.keyboard.press('Escape');
  });

  await check('a card with more than eight entities shows eight and Show all N, which opens the Catalog filtered to the area', async () => {
    await chooseGrouping(page, 'Definition types');
    await openTab('Overview');
    const cards = page.locator('.business-area');
    const total = await page.locator('.business-area .area-count').evaluateAll(counts => counts.map(count => Number.parseInt(count.textContent ?? '', 10)));
    const bigIndex = total.findIndex(count => count > AREA_ENTITY_LIMIT);
    expect(bigIndex, 'Flights has an area with more than eight entities by type').toBeGreaterThanOrEqual(0);
    const big = cards.nth(bigIndex);
    await expect(big.locator('.area-entities button')).toHaveCount(AREA_ENTITY_LIMIT);
    const showAll = big.getByRole('button', { name: `Show all ${total[bigIndex]}`, exact: true });
    await expect(showAll).toBeVisible();
    for (let index = 0; index < total.length; index++) {
      if (total[index] <= AREA_ENTITY_LIMIT) await expect(cards.nth(index).getByRole('button', { name: /^Show all/ })).toHaveCount(0);
    }
    const areaName = (await big.locator('h3').innerText()).trim();
    await showAll.click();
    await expect(tabs.getByRole('button', { name: 'Catalog', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.catalog-area-filter')).toContainText(areaName);
    await expect(page.locator('.catalog-card')).toHaveCount(total[bigIndex]);
    expect(total[bigIndex]).toBeLessThan(49);
    await page.locator('.catalog-area-filter').getByRole('button', { name: 'Show every entity' }).click();
    await expect(page.locator('.catalog-card')).toHaveCount(49);
  });

  await check('the Group button is never cut at any width: its text fits and does not end in an ellipsis', async () => {
    await openTab('Graph');
    for (const width of [1100, 1280, 1450, 390]) {
      await page.setViewportSize({ width, height: 900 });
      // On a phone the graph options, Group included, sit behind the Controls button.
      const controls = page.getByRole('button', { name: 'Controls', exact: true });
      if (await controls.isVisible()) await controls.click();
      const trigger = groupTrigger(page);
      await expect(trigger).toBeVisible();
      const fit = await trigger.evaluate(button => ({ scrollWidth: button.scrollWidth, clientWidth: button.clientWidth, text: (button.textContent ?? '').trim() }));
      expect(fit.scrollWidth, `${width}px: button content fits`).toBeLessThanOrEqual(fit.clientWidth);
      expect(fit.text.endsWith('…'), `${width}px: text ${fit.text}`).toBe(false);
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
  });

  await check('Overview cards pack as a masonry: no card leaves a gap larger than the column gap or empty room inside', async () => {
    await openTab('Overview');
    await expect(page.locator('.business-area').first()).toBeVisible();
    expect(await pageLayoutProblems(page, 'ontology-overview')).toEqual([]);
    const heights = await page.locator('.business-area').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().height)));
    expect(new Set(heights).size, 'cards of different content keep different heights').toBeGreaterThan(1);
  });

  await check('a file with nothing to choose between hides the Graph control and the chip only says how it is grouped', async () => {
    await page.getByRole('button', { name: 'plain.ontology.yaml', exact: true }).click();
    await expectModelName(page, 'Plain list');
    await openTab('Graph');
    await expect(groupTrigger(page)).toHaveCount(0);
    await openTab('Overview');
    const note = page.locator('.overview-grouping-note');
    await expect(note).toContainText('Grouped by definition types, as in Graph.');
    await expect(note.getByRole('button')).toHaveCount(0);
    const card = page.locator('.business-area');
    await expect(card.locator('.area-entities button')).toHaveCount(AREA_ENTITY_LIMIT);
    await expect(card.getByRole('button', { name: 'Show all 12', exact: true })).toBeVisible();
  });

  expect(errors).toEqual([]);
  console.log(`${passed} overview area checks passed`);
} finally {
  await browser.close();
  await api.stop();
}

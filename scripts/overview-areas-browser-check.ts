// Checks that Group by lives only in the Graph toolbar and that Overview cards pack as a masonry with a cap.
import { appUrl } from './helpers/base-url';
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { expectModelName } from './helpers/header';
import { groupTrigger, groupingMenuLabels, openGroupMenu, chooseGrouping } from './helpers/grouping-menu';
import { pageLayoutProblems } from './helpers/page-layout';
import { LOCAL_READER } from '../src/server/projects/reader';

const AREA_ENTITY_LIMIT = 8;
const flightsSource = await Bun.file('public/examples/ossie/flights.ontology.yaml').text();
const ublSource = await Bun.file('public/examples/ubl/ubl.ontology.yaml').text();
// Twelve entities of one type and no links, domains or IRIs: nothing to choose between, one big area.
const plainNames = 'Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima'.split(' ');
const plainSource = ['version: 0.2.0.dev0', 'name: Plain list', 'ontology:', ...plainNames.map(name => `- concept: ${name}\n  type: EntityType`)].join('\n') + '\n';

const api = await startIsolatedApi();
await api.ws.importBatch({ files: [{ path: 'plain.ontology.yaml', source: plainSource }] }, LOCAL_READER);
await api.ws.importBatch({ files: [{ path: 'flights.ontology.yaml', source: flightsSource }] }, LOCAL_READER);
await api.ws.importBatch({ files: [{ path: 'ubl.ontology.yaml', source: ublSource }], name: 'UBL' }, LOCAL_READER);
const browser = await chromium.launch({ channel: 'msedge' });
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
async function screenshot(name: string) {
  const directory = process.env.GROUPING_SCREENSHOTS;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, name + '.png'), fullPage: true });
}

try {
  await page.goto(appUrl());
  await page.getByRole('button', { name: 'flights.ontology.yaml', exact: true }).click();
  await expectModelName(page, 'Flights');

  await check('Overview has no Group by control, only a grouping note that names the grouping', async () => {
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
      if (width === 390) await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeVisible();
      await openGroupMenu(page);
      const trigger = groupTrigger(page);
      await expect(trigger).toBeVisible();
      const fit = await trigger.evaluate(button => ({ scrollWidth: button.scrollWidth, clientWidth: button.clientWidth, text: (button.textContent ?? '').trim() }));
      expect(fit.scrollWidth, `${width}px: button content fits`).toBeLessThanOrEqual(fit.clientWidth);
      expect(fit.text.endsWith('…'), `${width}px: text ${fit.text}`).toBe(false);
      await page.keyboard.press('Escape');
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

  await check('manual grouping stays accessible when no automatic mode has a grouping basis', async () => {
    await page.getByRole('button', { name: 'plain.ontology.yaml', exact: true }).click();
    await expectModelName(page, 'Plain list');
    await openTab('Graph');
    await expect(groupTrigger(page)).toBeVisible();
    expect(await groupingMenuLabels(page)).toEqual(['Automatic']);
    await (await openGroupMenu(page)).getByRole('button', { name: 'Adjust grouping…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adjust grouping' });
    await dialog.getByLabel('New group name').fill('Reviewed');
    await dialog.getByRole('button', { name: 'Apply grouping correction' }).click();
    await expect(dialog.getByRole('list', { name: 'Grouping corrections' })).toContainText('Alpha → Reviewed');
    await screenshot('plain-manual-correction-desktop');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await openTab('Overview');
    const note = page.locator('.overview-grouping-note');
    await expect(note).toContainText('Grouped by definition types, as in Graph.');
    await expect(note.getByRole('button', { name: 'Change in Graph' })).toBeVisible();
    await expect(page.locator('.business-area')).toHaveCount(2);
    await page.reload();
    await openTab('Overview');
    await expect(page.locator('.business-area').filter({ hasText: 'Reviewed' })).toContainText('Alpha');
    expect(api.ws.documents().find(doc => doc.filename === 'plain.ontology.yaml')?.source).toBe(plainSource);
  });

  await check('UBL uses generic communities and manual corrections survive desktop/mobile reloads without changing source', async () => {
    await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
    await openTab('Overview');
    await expect(page.locator('.overview-grouping-note')).toContainText('Grouped by suggested communities');
    await expect(page.locator('.business-area')).toHaveCount(4);
    await screenshot('ubl-suggested-desktop');
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await openTab('Graph');
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
      expect(await groupingMenuLabels(page)).toEqual(['Suggested communities', 'Automatic']);
      const menu = await openGroupMenu(page);
      await expect(menu).not.toContainText(/UBL|Curated/);
      await screenshot(`ubl-grouping-menu-${width}`);
      await menu.getByRole('button', { name: 'Adjust grouping…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Adjust grouping' });
      await dialog.getByLabel('New group name').fill(`Review ${width}`);
      await dialog.getByRole('button', { name: 'Apply grouping correction' }).click();
      await expect(dialog.getByRole('list', { name: 'Grouping corrections' })).toContainText(`Review ${width}`);
      await screenshot(`ubl-manual-correction-${width}`);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      const doc = api.ws.documents().find(doc => doc.filename === 'ubl.ontology.yaml')!;
      await expect.poll(() => JSON.stringify(api.ws.grouping(doc.id, LOCAL_READER))).toContain(`custom:Review ${width}`);
      await openTab('Overview');
      await page.reload();
      const ubl = page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true });
      if (width === 390) await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      await ubl.click();
      await expectModelName(page, /UBL/);
      await openTab('Overview');
      await expect(page.locator('.business-area').filter({ hasText: `Review ${width}` })).toBeVisible();
      const source = api.ws.documents().find(doc => doc.filename === 'ubl.ontology.yaml')?.source;
      expect(source).toBe(ublSource);
    }
  });

  expect(errors).toEqual([]);
  console.log(`${passed} overview area checks passed`);
} finally {
  await browser.close();
  await api.stop();
}

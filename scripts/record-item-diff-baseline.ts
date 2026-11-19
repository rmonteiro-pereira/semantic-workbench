// Records rendered structures and published consumer answers without touching real workspace data.
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { configureLogging } from '../src/server/observability/log';
import { appUrl } from './helpers/base-url';
import { itemDiffStructure as structure, itemDiffToggle } from './helpers/item-diff-browser';
import { itemDiffAgentAnswers, itemDiffBaselineWorkspace } from '../tests/helpers/item-diff-baseline';

configureLogging({ level: 'error', format: 'text' });
const fixture = await itemDiffBaselineWorkspace();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.route('**/api/**', async route => {
    const original = route.request();
    const url = new URL(original.url());
    if (url.pathname === '/api/events') {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
      return;
    }
    const response = await fixture.handler(
      new Request(`http://localhost:5173${url.pathname}${url.search}`, {
        method: original.method(),
        headers: { ...(await original.allHeaders()), origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' },
        body: original.postDataBuffer(),
      }),
    );
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto(appUrl());
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: 'finance.ontology.yaml', exact: true }).click();
  const tab = (name: string) => page.locator('.tabs').getByRole('button', { name, exact: true }).click();
  await tab('Graph');
  // The structures are those of the overlay switched off, read the same way the browser check reads them.
  const overlay = await itemDiffToggle(page);
  if ((await overlay.getAttribute('aria-pressed')) === 'true') await overlay.click();
  await expect(page.locator('.full-graph .react-flow__node-entity')).toHaveCount(5, { timeout: 60000 });
  await expect(page.locator('.full-graph-loading')).toHaveCount(0);
  const fullGraph = await structure(page.locator('.full-graph'));
  await tab('Catalog');
  const catalog = await structure(page.locator('.catalog'));
  await page
    .locator('.catalog-card', { hasText: 'Customer' })
    .getByRole('button', { name: /View details/ })
    .click();
  const details = page.locator('aside[aria-label="Definition details"]');
  await details.getByRole('region', { name: 'Attributes' }).waitFor();
  const entityDetails = await structure(details);
  await details
    .locator('.related-edges')
    .getByRole('button', { name: /purchases/ })
    .click();
  await details.locator('.relationship-details').waitFor();
  const relationshipDetails = await structure(details);
  await details.getByRole('button', { name: 'Close details', exact: true }).click();
  await tab('Neighborhood');
  await expect(page.locator('.neighborhood-canvas .react-flow__node')).not.toHaveCount(0);
  const neighborhoodGraph = await structure(page.locator('.neighborhood-canvas'));
  await page.getByRole('button', { name: /^Source control/ }).click();
  await page.getByLabel('Published snapshot').waitFor();
  const publish = await structure(page.getByLabel('Published snapshot'));
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(
    'tests/fixtures/item-diff/baseline.json',
    JSON.stringify({ dom: { fullGraph, neighborhoodGraph, entityDetails, relationshipDetails, catalog, publish }, agent: await itemDiffAgentAnswers(fixture) }, null, 2) + '\n',
  );
  console.log('PASS recorded six rendered structures and three consumer answers with saved unpublished definitions');
} finally {
  await page.close();
  await browser.close();
  fixture.dispose();
}

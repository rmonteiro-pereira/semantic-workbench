import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1905, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const source = await Bun.file('public/examples/commerce/commerce-scale.ttl').text();
const api = await startIsolatedApi({ watch: false });
await api.ws.importBatch({ files: [{ path: 'commerce-scale.ttl', source }] });
await routeApi(page, api);
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '1000');
  await expect(page.locator('.full-graph-status')).toHaveAttribute(
    'data-relationship-count',
    '5000',
  );
  await page
    .locator('.full-graph-tools')
    .getByRole('button', { name: 'Overview', exact: true })
    .click();
  await expect(page.locator('.area-entities button')).toHaveCount(1000, { timeout: 10000 });
  const start = performance.now();
  await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 120000 });
  const laidOut = performance.now();
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('.full-graph-status')).toContainText('background worker', {
    timeout: 60000,
  });
  const count = await page.locator('.react-flow__node-entity').count();
  if (!count) throw Error('Empty large graph');
  await page.locator('.react-flow__node[data-id="collapsed:Customer"] .full-entity').click();
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 120000 });
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.react-flow__node-entity')).toHaveCount(107, { timeout: 10000 });
  await page.getByLabel('Zoom to group').selectOption('Customer');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/real-graph-1000.png' });
  if (process.env.EXPAND_ALL === '1') {
    const allStart = performance.now();
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 120000 });
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('.react-flow__node-entity')).toHaveCount(1000, { timeout: 20000 });
    await page.getByPlaceholder('Find an entity…').fill('customer_0');
    await page.waitForTimeout(600);
    await page
      .locator('.react-flow__node[data-id="https://example.org/commerce#customer_0"] .full-entity')
      .click();
    await expect(page.locator('.full-graph-status')).toContainText('background worker', {
      timeout: 30000,
    });
    console.log(
      'EXPANDED_ALL',
      Math.round(performance.now() - allStart),
      'ms',
      await page.locator('.full-graph-status').innerText(),
    );
    await page.screenshot({ path: '/tmp/real-graph-1000-expanded.png' });
  }
  console.log(
    JSON.stringify({
      entities: 1000,
      relationships: 5000,
      layoutMs: Math.round(laidOut - start),
      renderedNodesAtFit: count,
      expandedCustomerEntities: 100,
      errors,
    }),
  );
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
  await api.stop();
}

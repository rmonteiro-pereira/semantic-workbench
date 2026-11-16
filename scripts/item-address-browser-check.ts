/** Checks stable item selection through the address-bearing graph cards in isolated data. */
import { chromium, expect } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { routeApi, startIsolatedApi } from './helpers/isolated-api';
import { inspect, isStructuredEntity } from '../src/shared/core/model';
import { formatAddress } from '../src/shared/core/item-address';
import { LOCAL_READER } from '../src/server/projects/reader';

const api = await startIsolatedApi();
const browser = await chromium.launch();
try {
  const project = await api.ws.loadExample('mapped-commerce');
  const filename = 'commerce.mapped-ontology.yaml';
  const original = api.ws.readFile(project.slug, filename, LOCAL_READER);
  const model = inspect(original.source, filename);
  const customer = model.entities.find(entity => entity.name === 'Customer')!;
  if (!isStructuredEntity(customer)) throw new Error('Expected a structured customer definition.');
  const address = formatAddress(customer.address);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await routeApi(page, api);
  async function selectCustomer() {
    const projectTree = page.getByRole('tree', { name: 'Projects' }).getByRole('treeitem', { name: project.name });
    await projectTree.getByRole('button', { name: filename, exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    const card = page.locator(`[data-address=${JSON.stringify(address)}]`);
    await expect(card).toHaveCount(1);
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await card.click();
    await expect(page.locator('.inspector h2')).toHaveText('Customer');
  }
  await page.goto(appUrl());
  await selectCustomer();
  console.log('PASS select a structured card by its canonical address');
  await page.reload();
  await selectCustomer();
  console.log('PASS the same address selects the same card after reload');
  expect(api.ws.readFile(project.slug, filename, LOCAL_READER).source).toBe(original.source);
  expect(errors).toEqual([]);
  console.log('PASS selection and reload preserve source bytes and raise no browser errors');
  console.log('3 item address browser checks passed');
} finally {
  await browser.close();
  await api.stop();
}

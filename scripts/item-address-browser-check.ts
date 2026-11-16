import { readAddressMigrations } from '../src/server/projects/address-migrations';
import { dataLayout } from '../src/server/projects/paths';
import { absoluteItemAddress } from '../src/shared/core/model-addresses';
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
  await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.locator('.inspector').getByRole('button', { name: 'Edit Customer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Customer', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Client');
  const references = dialog.getByRole('region', { name: 'References to the old name' });
  const checkboxes = references.getByRole('checkbox');
  expect(await checkboxes.count()).toBeGreaterThan(0);
  for (const checkbox of await checkboxes.all()) await checkbox.check();
  const save = dialog.getByRole('button', { name: 'Save to file', exact: true });
  await expect(save).toBeEnabled({ timeout: 10000 });
  await save.click();
  await expect(dialog).toHaveCount(0);
  const from = formatAddress(absoluteItemAddress(customer.address, { project: project.slug, document: [filename] }));
  const history = readAddressMigrations(dataLayout(api.root), project.slug, LOCAL_READER);
  expect(history.filter(record => record.from === from)).toHaveLength(1);
  expect(history.find(record => record.from === from)!.to).toBe(from.replace('/concept:Customer', '/concept:Client'));
  expect(api.ws.readFile(project.slug, filename).source).toContain('concept: Client');
  expect(api.ws.readFile(project.slug, 'commerce.mapping.yaml').source).toContain('concept: Client');
  expect(errors).toEqual([]);
  console.log('PASS a concept rename and ticked cross-file references share one migration append');
  console.log('4 item address browser checks passed');
} finally {
  await browser.close();
  await api.stop();
}

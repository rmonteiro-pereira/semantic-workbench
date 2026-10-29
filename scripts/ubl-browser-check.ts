// Inspects UBL graph rendering and layout in the browser.
import { appUrl } from './helpers/base-url';
import { example } from './helpers/examples';
import { chromium } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const api = await startIsolatedApi({ watch: false });
const docs = {
  get length() {
    return api.ws.documents().length;
  },
};
await routeApi(page, api);
await page.goto(appUrl());
await (await example(page, /UBL business model/)).click();
await page.getByRole('status').filter({ hasText: 'Loaded UBL:' }).waitFor({ timeout: 60000 });
await page.locator('footer').getByText('45 entities · 277 relationships', { exact: true }).waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/ubl-business-model.png' });
for (const file of ['ubl.owl.ttl', 'ubl.odcs.yaml', 'ubl.semantic.yaml', 'ubl.shacl.ttl']) {
  await page.getByRole('button', { name: file, exact: true }).click();
  await page.waitForTimeout(400);
  if (!(await page.locator('.react-flow__node').count())) throw Error(`No graph: ${file}`);
}
await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
await page.getByPlaceholder('Find an entity…').fill('Invoice');
await page.waitForTimeout(400);
if (!(await page.locator('.react-flow__node').count())) throw Error('Invoice neighborhood missing');
console.log(
  JSON.stringify({
    documents: docs.length,
    businessEntities: 45,
    businessRelationships: 277,
    errors,
  }),
);
await browser.close();
await api.stop();
if (errors.length) throw Error(errors.join('\n'));

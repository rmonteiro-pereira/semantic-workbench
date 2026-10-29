// Inspects the commerce example in the browser.
import { appUrl } from './helpers/base-url';
import { chromium } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { example } from './helpers/examples';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const api = await startIsolatedApi({ watch: false });
const docs = {
  get length() {
    return api.ws.documents().length;
  },
  some: (f: (doc: any) => boolean) => api.ws.documents().some(f),
};
await routeApi(page, api);
await page.goto(appUrl());
await (await example(page, /Commerce workspace/)).click();
await page.getByRole('status').filter({ hasText: 'Loaded commerce contracts' }).waitFor({ timeout: 60000 });
if (docs.length !== 8) throw Error(`Expected 8 documents, got ${docs.length}`);
for (const [filename, kind] of [
  ['commerce.odcs.yaml', 'ODCS'],
  ['sales.ossie.yaml', 'Ossie semantic'],
  ['sales.mapping.yaml', 'Ossie mappings'],
  ['commerce-business.ossie.yaml', 'Ossie ontology'],
  ['commerce.owl.ttl', 'OWL'],
  ['commerce.owl', 'OWL'],
  ['commerce.shacl.ttl', 'SHACL'],
  ['commerce-data.ttl', 'RDF'],
]) {
  await page.getByRole('button', { name: filename, exact: true }).click();
  await page.locator('.heading .badge').filter({ hasText: kind }).waitFor();
  await page.waitForTimeout(400);
  if ((await page.locator('.react-flow__node').count()) === 0) throw Error(`No nodes for ${filename}`);
  await page.screenshot({ path: `/tmp/commerce-${filename.replaceAll('.', '-')}.png` });
}
await (await example(page, /Commerce scale data/)).click();
await page.getByText('1000 entities · 5000 relationships', { exact: true }).waitFor({ timeout: 60000 });
await page.waitForTimeout(500);
const visible = await page.locator('.react-flow__node').count();
if (visible > 16 || visible === 0) throw Error(`Bad neighborhood size ${visible}`);
await page.screenshot({ path: '/tmp/commerce-scale.png' });
await page.getByPlaceholder('Find an entity').fill('Order 10199');
await page.waitForTimeout(500);
if ((await page.locator('.react-flow__node').count()) === 0) throw Error('Search did not find order');
for (const [name, example] of [
  ['uploaded.rdf', 'commerce.owl'],
  ['uploaded.shacl', 'commerce.shacl.ttl'],
  ['uploaded.nt', null],
]) {
  const buffer = example
    ? await Bun.file('public/examples/commerce/' + example).arrayBuffer()
    : new TextEncoder().encode('<https://example.org/a> <https://example.org/link> <https://example.org/b> .\n<https://example.org/b> <http://www.w3.org/2000/01/rdf-schema#label> "B" .').buffer;
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(buffer) });
  await page.getByRole('button', { name, exact: true }).waitFor();
  await page.waitForTimeout(200);
  if (!docs.some(d => d.filename === name)) throw Error(`Upload failed: ${name}`);
}
console.log(
  JSON.stringify({
    exampleDocuments: docs.length,
    scale: '1000/5000',
    visibleNodes: visible,
    errors,
  }),
);
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
await api.stop();

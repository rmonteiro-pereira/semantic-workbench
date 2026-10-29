// Measures browser loading and alignment of a synthetic large graph in an isolated workspace.
import { appUrl } from './helpers/base-url';
import { chromium } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../src/server/projects/reader';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const count = Number(process.env.SCALE_COUNT ?? 3000);
const source = JSON.stringify({
  name: 'Browser scale test',
  ontology: Array.from({ length: count }, (_, i) => ({
    concept: `Entity_${i}`,
    type: 'EntityType',
    relationships: [1, 7, 31].map(index => ({
      name: `link_${index}`,
      roles: [{ concept: `Entity_${(i + index) % count}` }],
      verbalizes: ['links'],
    })),
  })),
});
const api = await startIsolatedApi({ watch: false });
await api.ws.importBatch({ files: [{ path: 'scale.ossie.json', source }] }, LOCAL_READER);
await routeApi(page, api);
const start = performance.now();
await page.goto(appUrl());
await page.getByRole('button', { name: 'Auto align', exact: true }).waitFor({ timeout: 60000 });
await page.getByText(`${count} entities · ${count * 3} relationships`, { exact: true }).waitFor();
const loaded = performance.now();
await page.getByRole('button', { name: 'Auto align', exact: true }).click();
await page.getByRole('button', { name: 'Auto align', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(1000);
const button = page.getByRole('button', { name: 'Auto align', exact: true });
if (!(await button.isEnabled())) throw Error('Layout did not complete');
if (!(await button.evaluate(el => !!el.closest('.canvas')))) throw Error('Auto align is outside canvas');
const handles = await page.locator('.react-flow__handle-right').count();
if (!handles) throw Error('Missing right-facing handles');
const aligned = performance.now();
const renderedNodes = await page.locator('.react-flow__node').count();
await page.screenshot({ path: '/tmp/semantic-workbench-scale.png' });
await page.getByPlaceholder('Find an entity').fill('Entity_2999');
await page.getByRole('button', { name: 'Auto align', exact: true }).click();
await page.getByRole('button', { name: 'Auto align', exact: true }).waitFor({ state: 'visible' });
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Catalog', exact: true }).click();
await page.getByRole('button', { name: /Entity_2999/ }).click();
await page.getByRole('heading', { name: 'Entity_2999', exact: true }).waitFor();
await page.getByRole('button', { name: 'Source', exact: true }).click();
if (await page.getByRole('button', { name: 'Auto align', exact: true }).count()) throw Error('Auto align leaked into YAML view');

console.log(
  JSON.stringify({
    entities: count,
    relationships: count * 3,
    loadMs: Math.round(loaded - start),
    alignAndPaintMs: Math.round(aligned - loaded),
    renderedNodes,
    errors,
  }),
);
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
await api.stop();

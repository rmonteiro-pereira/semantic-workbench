// Inspects the running workspace while refusing requests that could change it.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1905, height: 980 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text());
});
// Read-only inspection of the running workspace: every request that could change it is refused.
await page.route('**/api/**', route =>
  route.request().method() === 'GET'
    ? route.continue()
    : route.fulfill({ status: 403, json: { error: 'live-inspect is read-only' } }),
);
await page.goto('http://127.0.0.1:5173/');
await page.waitForTimeout(2500);
console.log('INITIAL', await page.locator('body').innerText());
console.log('NODES', await page.locator('.react-flow__node').count());
await page.screenshot({ path: '/tmp/workbench-live-initial.png' });
await page.getByRole('button', { name: 'ubl.owl.ttl', exact: true }).click();
await page.waitForTimeout(1000);
console.log('OWL NODES', await page.locator('.react-flow__node').count());
await page.screenshot({ path: '/tmp/workbench-live-owl.png' });
await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
await page.waitForTimeout(1000);
console.log('ONTOLOGY NODES', await page.locator('.react-flow__node').count());
await page.screenshot({ path: '/tmp/workbench-live-ontology.png' });
await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
await page.waitForTimeout(600);
console.log('REOPEN NODES', await page.locator('.react-flow__node').count());
await page.screenshot({ path: '/tmp/workbench-live-reopen.png' });
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Export', exact: true }).click(),
]);
const downloaded = await Bun.file((await download.path())!).text();
const documents = await (await fetch('http://127.0.0.1:4310/api/documents')).json();
const original = documents.find((d: any) => d.filename === 'ubl.ontology.yaml');
if (download.suggestedFilename() !== 'ubl.ontology.yaml' || downloaded !== original.source)
  throw Error('Live workspace export does not match the project file');
console.log(
  'LIVE EXPORT VERIFIED',
  download.suggestedFilename(),
  new TextEncoder().encode(downloaded).length,
  'bytes',
);
await browser.close();

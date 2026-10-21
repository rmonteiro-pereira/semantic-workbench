import { chromium, expect, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { inspect } from '../src/model';
import { groupRelationships } from '../src/graph-view';

const fixtures = [
  { filename: 'ubl.ontology.yaml', path: 'public/examples/ubl/ubl.ontology.yaml' },
  { filename: 'flights.ontology.yaml', path: 'public/examples/ossie/flights.ontology.yaml' },
];
const originals = new Map<string, string>();
// Isolated data root; Flights is imported first so its project opens first.
const api = await startIsolatedApi();
const store = { list: () => api.ws.documents() };
for (const fixture of [...fixtures].reverse()) {
  const source = await Bun.file(fixture.path).text();
  originals.set(fixture.filename, source);
  await api.ws.importBatch({ files: [{ path: fixture.filename, source }] });
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);
let passed = 0;
async function check(name: string, action: () => Promise<void>) {
  await action(); passed++; console.log('PASS', name);
}
async function groupingDetails() {
  const details = page.locator('.grouping-details');
  if (!(await details.evaluate(node => (node as HTMLDetailsElement).open))) await details.locator(':scope > summary').click();
}
async function graphReady() {
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
}
async function allFlightsContained() {
  await expect.poll(async () => page.locator('.full-graph > .react-flow').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect();
    const entities = [...canvas.querySelectorAll('.react-flow__node-entity .full-entity')];
    return {
      count: entities.length,
      clipped: entities.filter(entity => {
        const rect = entity.getBoundingClientRect();
        return rect.left < bounds.left - 2 || rect.top < bounds.top - 2 || rect.right > bounds.right + 2 || rect.bottom > bounds.bottom + 2;
      }).length,
    };
  }), { timeout: 15_000, message: 'Every Flights entity fits inside the actual graph canvas after grouping changes' }).toEqual({ count: 49, clipped: 0 });
}
async function unchangedExport(filename: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, 'utf8')).toBe(originals.get(filename)!);
  expect(store.list().find(doc => doc.filename === filename)?.source).toBe(originals.get(filename)!);
}
async function selectedText(editor: Locator) {
  return editor.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd));
}
async function attachedFlights() {
  const links = groupRelationships(inspect(originals.get('flights.ontology.yaml')!, 'flights.ontology.yaml').edges)
    .map(edge => ({ id: edge.id, source: edge.source, target: edge.target }));
  await expect.poll(async () => page.evaluate(links => {
    function borderDistance(point: {x:number;y:number}, rect: DOMRect) {
      const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
      const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
      return dx || dy ? Math.hypot(dx, dy) : Math.min(point.x - rect.left, rect.right - point.x, point.y - rect.top, rect.bottom - point.y);
    }
    const values: number[] = [];
    for (const edge of links) {
      const group = [...document.querySelectorAll('.react-flow__edge')].find(node => node.getAttribute('data-id') === edge.id);
      const path = group?.querySelector('.react-flow__edge-path') as SVGPathElement | null;
      const entity = (id: string) => [...document.querySelectorAll('.react-flow__node')]
        .find(node => node.getAttribute('data-id') === id)?.querySelector('.full-entity');
      const source = entity(edge.source), target = entity(edge.target), transform = path?.getScreenCTM();
      if (!path || !source || !target || !transform) continue;
      for (const [length, node] of [[0, source], [path.getTotalLength(), target]] as const) {
        const point = path.getPointAtLength(length);
        values.push(borderDistance({ x: transform.a * point.x + transform.c * point.y + transform.e, y: transform.b * point.x + transform.d * point.y + transform.f }, node.getBoundingClientRect()));
      }
    }
    return values.length > 10 ? Math.max(...values) : Infinity;
  }, links), { timeout: 15_000, message: 'Grouping changes retain edge attachment to rendered entity borders' }).toBeLessThanOrEqual(4.5);
}

try {
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('h1')).toHaveText('Flights');
  await graphReady();
  await check('Flights grouping modes state provenance honestly and retain all graph connections', async () => {
    const mode = page.getByLabel('Group model by', { exact: true });
    for (const value of ['suggested', 'types', 'declared', 'auto']) {
      await mode.selectOption(value);
      await graphReady();
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '49');
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-relationship-count', '90');
      await groupingDetails();
      await expect(page.locator('.grouping-explanation')).toBeVisible();
      await attachedFlights();
      await allFlightsContained();
      if (value === 'types') {
        await expect(page.locator('.grouping-explanation')).toContainText(/type/i);
        await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Business areas', exact: true })).toHaveCount(0);
        await expect(page.locator('.area-entities button')).toHaveCount(49);
        await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
        await graphReady();
      }
      if (value === 'suggested') await expect(page.locator('.grouping-explanation')).toContainText(/suggest|infer|graph/i);
    }
    await unchangedExport('flights.ontology.yaml');
    const details = page.locator('.grouping-details');
    if (await details.evaluate(node => (node as HTMLDetailsElement).open)) await details.locator(':scope > summary').click();
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await allFlightsContained();
    await page.screenshot({ path: '/tmp/workbench-grouping-flights.png' });
  });
  await check('grouping corrections persist across views, documents and reload without rewriting source', async () => {
    const airport = inspect(originals.get('flights.ontology.yaml')!, 'flights.ontology.yaml').entities.find(entity => entity.name === 'Airport')!;
    await page.getByLabel('Group model by', { exact: true }).selectOption('suggested');
    await groupingDetails();
    const adjustment = page.locator('.grouping-details > details');
    await adjustment.locator('summary').click();
    await page.getByLabel('Entity to regroup', { exact: true }).selectOption(airport.id);
    await page.getByLabel('New group name', { exact: true }).fill('Flight operations review');
    await page.getByRole('button', { name: 'Apply grouping correction', exact: true }).click();
    await graphReady();
    await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
    const custom = page.locator('.business-area').filter({ has: page.getByRole('heading', { name: 'Flight operations review', exact: true }) });
    await expect(custom).toBeVisible();
    await expect(custom.locator('[data-entity-id="' + airport.id + '"]')).toBeVisible();
    await unchangedExport('flights.ontology.yaml');
    await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
    await page.getByRole('button', { name: 'flights.ontology.yaml', exact: true }).click();
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Flights');
    await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(custom).toBeVisible();
    await expect(custom.locator('[data-entity-id="' + airport.id + '"]')).toBeVisible();
    await unchangedExport('flights.ontology.yaml');
    await page.screenshot({ path: '/tmp/workbench-grouping-correction.png' });
  });
  await check('UBL grouping provenance remains explicit and source exports remain unchanged', async () => {
    await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
    await expect(page.locator('h1')).toContainText('UBL');
    await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
    const mode = page.getByLabel('Group model by', { exact: true });
    await mode.selectOption('example');
    await groupingDetails();
    await expect(page.locator('.grouping-explanation')).toContainText(/example|curated|UBL/i);
    await expect(page.locator('.area-entities button')).toHaveCount(45);
    await unchangedExport('ubl.ontology.yaml');
  });
  await check('invalid source highlights the precise feature and finding action selects its offending line', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
    const editor = page.getByLabel('Definition source', { exact: true });
    const invalid = 'name: Source diagnostics\nontology:\n  - concept: Airport\n    type: EntityType\n    extends: [MissingSourceParent]\n';
    await editor.fill(invalid);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    const highlight = page.locator('.source-editor-line.line-error').filter({ hasText: 'MissingSourceParent' });
    await expect(highlight).toHaveCount(1);
    const finding = page.locator('.validation-report li').filter({ hasText: 'Unknown parent concept' }).first();
    await expect(finding).toContainText('Affected feature');
    await expect(finding.locator('.validation-feature')).toContainText('Airport');
    await expect(finding.locator('.validation-source-line')).toContainText('MissingSourceParent');
    await expect(finding).toContainText(/inherit|parent|extends/i);
    await expect(finding).toContainText('MissingSourceParent');
    await finding.getByRole('button', { name: /Go to line 5/ }).click();
    await expect(editor).toBeFocused();
    expect(await selectedText(editor)).toContain('MissingSourceParent');
    expect(store.list().find(doc => doc.filename === 'ubl.ontology.yaml')?.source).toBe(originals.get('ubl.ontology.yaml')!);
    await page.screenshot({ path: '/tmp/workbench-validation-line-focus.png' });
    await editor.fill(originals.get('ubl.ontology.yaml')!);
  });
  await check('mixed import repair highlights and locates the faulty file without modifying saved documents', async () => {
    const count = store.list().length;
    const invalid = 'name: Repair diagnostics\nontology:\n  - concept: Flight\n    type: EntityType\n    extends: [MissingRepairParent]\n';
    await page.locator('input[type=file]').setInputFiles([
      { name: 'valid.yaml', mimeType: 'application/yaml', buffer: Buffer.from('name: Valid\nontology: [{concept: A}]') },
      { name: 'invalid.yaml', mimeType: 'application/yaml', buffer: Buffer.from(invalid) },
    ]);
    const dialog = page.getByRole('dialog', { name: 'Review import' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('File to review').selectOption('1');
    const editor = dialog.getByLabel('Repair definition', { exact: true });
    await expect(editor).toHaveValue(invalid);
    await expect(dialog.locator('.source-editor-line.line-error').filter({ hasText: 'MissingRepairParent' })).toHaveCount(1);
    const finding = dialog.locator('.validation-report li').filter({ hasText: 'Unknown parent concept' }).first();
    await finding.getByRole('button', { name: /Go to line 5/ }).click();
    await expect(editor).toBeFocused();
    expect(await selectedText(editor)).toContain('MissingRepairParent');
    await expect(dialog.getByRole('button', { name: 'Import repaired files', exact: true })).toBeDisabled();
    expect(store.list().length).toBe(count);
    await page.screenshot({ path: '/tmp/workbench-validation-import-line.png' });
    await dialog.getByLabel('File to review').selectOption('0');
    await expect(dialog.locator('.source-editor-line.line-error')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(store.list().length).toBe(count);
    await expect(page.getByLabel('Definition source', { exact: true })).toHaveValue(originals.get('ubl.ontology.yaml')!);
  });
  await check('fixture exports preserve exact upstream Flights and UBL source', async () => {
    for (const fixture of [...fixtures].reverse()) {
      await page.getByRole('button', { name: fixture.filename, exact: true }).click();
      await unchangedExport(fixture.filename);
    }
  });
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} grouping and validation UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}

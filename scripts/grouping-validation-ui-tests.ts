// Checks grouping suggestions and validation dialogs in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { editorSelection, expectEditorValue, fillEditor } from './helpers/code-editor';
import { inspect } from '../src/model';
import { groupRelationships } from '../src/graph-view';
import { exportFile } from './helpers/header';
import { LOCAL_READER } from '../server/projects/reader';

const fixtures = [
  { filename: 'mall.semantic.yaml', path: 'public/examples/mall/mall.semantic.yaml' },
  { filename: 'ubl.odcs.yaml', path: 'public/examples/ubl/ubl.odcs.yaml' },
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
  await api.ws.importBatch({ files: [{ path: fixture.filename, source }] }, LOCAL_READER);
}
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);
let passed = 0;
async function check(name: string, action: () => Promise<void>) {
  await action();
  passed++;
  console.log('PASS', name);
}
async function groupingDetails() {
  const details = page.locator('.grouping-details');
  if (!(await details.evaluate(node => (node as HTMLDetailsElement).open)))
    await details.locator(':scope > summary').click();
}
async function graphReady() {
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
}
async function allFlightsContained() {
  await expect
    .poll(
      async () =>
        page.locator('.full-graph > .react-flow').evaluate(canvas => {
          const bounds = canvas.getBoundingClientRect();
          const entities = [...canvas.querySelectorAll('.react-flow__node-entity .full-entity')];
          return {
            count: entities.length,
            clipped: entities.filter(entity => {
              const rect = entity.getBoundingClientRect();
              return (
                rect.left < bounds.left - 2 ||
                rect.top < bounds.top - 2 ||
                rect.right > bounds.right + 2 ||
                rect.bottom > bounds.bottom + 2
              );
            }).length,
          };
        }),
      {
        timeout: 15_000,
        message: 'Every Flights entity fits inside the actual graph canvas after grouping changes',
      },
    )
    .toEqual({ count: 49, clipped: 0 });
}
async function unchangedExport(filename: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), exportFile(page)]);
  expect(download.suggestedFilename()).toBe(filename);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, 'utf8')).toBe(originals.get(filename)!);
  expect(store.list().find(doc => doc.filename === filename)?.source).toBe(
    originals.get(filename)!,
  );
}
const selectedText = (editor: Locator) => editorSelection(editor);
async function attachedFlights() {
  const links = groupRelationships(
    inspect(originals.get('flights.ontology.yaml')!, 'flights.ontology.yaml').edges,
  ).map(edge => ({ id: edge.id, source: edge.source, target: edge.target }));
  await expect
    .poll(
      async () =>
        page.evaluate(links => {
          function borderDistance(point: { x: number; y: number }, rect: DOMRect) {
            const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
            const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
            return dx || dy
              ? Math.hypot(dx, dy)
              : Math.min(
                  point.x - rect.left,
                  rect.right - point.x,
                  point.y - rect.top,
                  rect.bottom - point.y,
                );
          }
          const values: number[] = [];
          for (const edge of links) {
            const group = [...document.querySelectorAll('.react-flow__edge')].find(
              node => node.getAttribute('data-id') === edge.id,
            );
            const path = group?.querySelector('.react-flow__edge-path') as SVGPathElement | null;
            const entity = (id: string) =>
              [...document.querySelectorAll('.react-flow__node')]
                .find(node => node.getAttribute('data-id') === id)
                ?.querySelector('.full-entity');
            const source = entity(edge.source);
            const target = entity(edge.target);
            const transform = path?.getScreenCTM();
            if (!path || !source || !target || !transform) continue;
            for (const [length, node] of [
              [0, source],
              [path.getTotalLength(), target],
            ] as const) {
              const point = path.getPointAtLength(length);
              values.push(
                borderDistance(
                  {
                    x: transform.a * point.x + transform.c * point.y + transform.e,
                    y: transform.b * point.x + transform.d * point.y + transform.f,
                  },
                  node.getBoundingClientRect(),
                ),
              );
            }
          }
          return values.length > 10 ? Math.max(...values) : Infinity;
        }, links),
      {
        timeout: 15_000,
        message: 'Grouping changes retain edge attachment to rendered entity borders',
      },
    )
    .toBeLessThanOrEqual(4.5);
}

try {
  await page.goto(appUrl());
  await expect(page.locator('h1')).toHaveText('Flights');
  await graphReady();
  await check(
    'Flights grouping modes state provenance honestly and retain all graph connections',
    async () => {
      const mode = page.getByLabel('Group model by', { exact: true });
      // Flights declares no domains and no IRIs, so those modes are disabled with the reason.
      await expect(mode.locator('option[value="declared"]')).toHaveJSProperty('disabled', true);
      await expect(mode.locator('option[value="declared"]')).toContainText('No domains declared');
      await expect(mode.locator('option[value="namespaces"]')).toHaveJSProperty('disabled', true);
      await expect(mode.locator('option[value="namespaces"]')).toContainText('No IRIs declared');
      await expect(mode.locator('option[value="example"]')).toHaveCount(0);
      for (const value of ['suggested', 'types', 'auto']) {
        await mode.selectOption(value);
        await graphReady();
        await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '49');
        await expect(page.locator('.full-graph-status')).toHaveAttribute(
          'data-relationship-count',
          '90',
        );
        await groupingDetails();
        await expect(page.locator('.grouping-explanation')).toBeVisible();
        await attachedFlights();
        await allFlightsContained();
        if (value === 'types') {
          await expect(page.locator('.grouping-explanation')).toContainText(/type/i);
          await page
            .locator('.tabs')
            .getByRole('button', { name: 'Overview', exact: true })
            .click();
          await expect(
            page.getByRole('button', { name: 'Business areas', exact: true }),
          ).toHaveCount(0);
          await expect(page.locator('.area-entities button')).toHaveCount(49);
          await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
          await graphReady();
        }
        if (value === 'suggested')
          await expect(page.locator('.grouping-explanation')).toContainText(/suggest|infer|graph/i);
      }
      await unchangedExport('flights.ontology.yaml');
      const details = page.locator('.grouping-details');
      if (await details.evaluate(node => (node as HTMLDetailsElement).open))
        await details.locator(':scope > summary').click();
      await page.getByRole('button', { name: 'Fit model', exact: true }).click();
      await allFlightsContained();
      await page.screenshot({ path: '/tmp/workbench-grouping-flights.png' });
    },
  );
  await check(
    'grouping corrections persist across views, documents and reload without rewriting source',
    async () => {
      const airport = inspect(
        originals.get('flights.ontology.yaml')!,
        'flights.ontology.yaml',
      ).entities.find(entity => entity.name === 'Airport')!;
      const mode = page.getByLabel('Group model by', { exact: true });
      await mode.selectOption('types');
      // After an explicit choice, Auto still names its own choice.
      await expect(mode.locator('option[value="auto"]')).toHaveText('Auto: communities');
      await mode.selectOption('suggested');
      await groupingDetails();
      await page.getByRole('button', { name: 'Adjust grouping…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Adjust grouping' });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole('list', { name: 'Current groups' }).getByRole('listitem'),
      ).not.toHaveCount(0);
      await dialog.getByLabel('Entity to regroup', { exact: true }).selectOption(airport.id);
      await dialog.getByLabel('New group name', { exact: true }).fill('Flight operations review');
      await dialog.getByRole('button', { name: 'Apply grouping correction', exact: true }).click();
      await expect(dialog.getByRole('list', { name: 'Grouping corrections' })).toContainText(
        'Airport → Flight operations review',
      );
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await graphReady();
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      const custom = page.locator('.business-area').filter({
        has: page.getByRole('heading', { name: 'Flight operations review', exact: true }),
      });
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
    },
  );
  await check(
    'UBL grouping provenance remains explicit and source exports remain unchanged',
    async () => {
      await page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
      await expect(page.locator('h1')).toContainText('UBL');
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      const mode = page.getByLabel('Group model by', { exact: true });
      await mode.selectOption('example');
      await groupingDetails();
      await expect(page.locator('.grouping-explanation')).toContainText(/example|curated|UBL/i);
      await expect(page.locator('.area-entities button')).toHaveCount(45);
      await unchangedExport('ubl.ontology.yaml');
    },
  );
  await check(
    'contracts and semantic models group into communities; lineage cards carry the group tint',
    async () => {
      await page.getByRole('button', { name: 'ubl.odcs.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      const mode = page.getByLabel('Group model by', { exact: true });
      await expect(mode).toBeVisible();
      // The contract-level domain alone is not a grouping, and the contract has no IRIs.
      await expect(mode.locator('option[value="declared"]')).toHaveJSProperty('disabled', true);
      await expect(mode.locator('option[value="declared"]')).toContainText(
        'Only the contract-level domain is declared',
      );
      await expect(mode.locator('option[value="namespaces"]')).toContainText('No IRIs declared');
      await expect(mode.locator('option[value="auto"]')).toHaveText('Auto: example areas');
      await mode.selectOption('suggested');
      const canvas = page.getByRole('region', { name: 'Lineage graph' });
      await expect(
        canvas.locator('.lineage-card.k-object[style*="--card-tint"]').first(),
      ).toBeVisible();
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      await expect.poll(() => page.locator('.business-area').count()).toBeGreaterThan(1);
      await unchangedExport('ubl.odcs.yaml');
      await page.getByRole('button', { name: 'mall.semantic.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      await page.getByLabel('Group model by', { exact: true }).selectOption('suggested');
      await expect.poll(() => page.locator('.business-area').count()).toBeGreaterThan(1);
      await unchangedExport('mall.semantic.yaml');
      await page.screenshot({ path: '/tmp/workbench-grouping-semantic.png' });
      // The following checks edit the UBL ontology, so leave it open.
      const ubl = page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true });
      await ubl.click();
      await expect(ubl).toHaveClass(/chosen/);
    },
  );
  await check(
    'invalid source highlights the precise feature and finding action selects its offending line',
    async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
      const editor = page.getByLabel('Definition source', { exact: true });
      const invalid =
        'name: Source diagnostics\nontology:\n  - concept: Airport\n    type: EntityType\n    extends: [MissingSourceParent]\n';
      await fillEditor(editor, invalid);
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(
        /^Not saved: \d+ errors?$/,
        { timeout: 5000 },
      );
      const highlight = page
        .locator('.cm-lintRange-error')
        .filter({ hasText: 'MissingSourceParent' });
      await expect(highlight).toHaveCount(1);
      // The findings open in the Validation details dialog from the Save state indicator.
      await page.getByRole('status', { name: 'Save state' }).click();
      const finding = page
        .getByRole('dialog', { name: 'Validation details' })
        .locator('.validation-report li')
        .filter({ hasText: 'Unknown parent concept' })
        .first();
      await expect(finding).toContainText('Affected feature');
      await expect(finding.locator('.validation-feature')).toContainText('Airport');
      await expect(finding.locator('.validation-source-line')).toContainText('MissingSourceParent');
      await expect(finding).toContainText(/inherit|parent|extends/i);
      await expect(finding).toContainText('MissingSourceParent');
      await finding.getByRole('button', { name: /Go to line 5/ }).click();
      await expect(editor).toBeFocused();
      expect(await selectedText(editor)).toContain('MissingSourceParent');
      expect(store.list().find(doc => doc.filename === 'ubl.ontology.yaml')?.source).toBe(
        originals.get('ubl.ontology.yaml')!,
      );
      await page.screenshot({ path: '/tmp/workbench-validation-line-focus.png' });
      await fillEditor(editor, originals.get('ubl.ontology.yaml')!);
    },
  );
  await check(
    'mixed import repair highlights and locates the faulty file without modifying saved documents',
    async () => {
      const count = store.list().length;
      const invalid =
        'name: Repair diagnostics\nontology:\n  - concept: Flight\n    type: EntityType\n    extends: [MissingRepairParent]\n';
      await page.locator('input[type=file]').setInputFiles([
        {
          name: 'valid.yaml',
          mimeType: 'application/yaml',
          buffer: Buffer.from('name: Valid\nontology: [{concept: A}]'),
        },
        { name: 'invalid.yaml', mimeType: 'application/yaml', buffer: Buffer.from(invalid) },
      ]);
      const dialog = page.getByRole('dialog', { name: 'Review import' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('File to review').selectOption('1');
      const editor = dialog.getByLabel('Repair definition', { exact: true });
      await expectEditorValue(editor, invalid);
      await expect(
        dialog.locator('.cm-lintRange-error').filter({ hasText: 'MissingRepairParent' }),
      ).toHaveCount(1);
      const finding = dialog
        .locator('.validation-report li')
        .filter({ hasText: 'Unknown parent concept' })
        .first();
      await finding.getByRole('button', { name: /Go to line 5/ }).click();
      await expect(editor).toBeFocused();
      expect(await selectedText(editor)).toContain('MissingRepairParent');
      await expect(
        dialog.getByRole('button', { name: 'Import repaired files', exact: true }),
      ).toBeDisabled();
      expect(store.list().length).toBe(count);
      await page.screenshot({ path: '/tmp/workbench-validation-import-line.png' });
      await dialog.getByLabel('File to review').selectOption('0');
      await expect(dialog.locator('.cm-lintRange-error')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(store.list().length).toBe(count);
      await expectEditorValue(
        page.getByLabel('Definition source', { exact: true }),
        originals.get('ubl.ontology.yaml')!,
      );
    },
  );
  await check('fixture exports preserve the exact upstream source of every fixture', async () => {
    for (const fixture of [...fixtures].reverse()) {
      const file = page.getByRole('button', { name: fixture.filename, exact: true });
      await file.click();
      await expect(file).toHaveClass(/chosen/);
      await unchangedExport(fixture.filename);
    }
  });
  await check('browser has no uncaught runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} grouping and validation UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}

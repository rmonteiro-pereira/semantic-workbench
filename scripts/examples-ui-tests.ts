// Checks example loading, mappings and metric composition in the browser.
import { LOCAL_READER } from '../src/server/projects/reader';
import { appUrl } from './helpers/base-url';
import { expectAreaEntityTotal } from './helpers/overview-areas';
import { setShown, showToggle, viewOptions } from './helpers/graph-options';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Database } from 'bun:sqlite';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import manifest from '../tests/fixtures/ossie-mapping/manifest.json';
import { exampleSet } from '../src/shared/projects/examples';
import { example } from './helpers/examples';
import { expectModelName, exportFile } from './helpers/header';
import { closeComposer, composerDialog, openComposer } from './helpers/query-composer';
import { EXPECTED_EXAMPLE_METRICS } from './example-metric-checks';
import { expectMetricPresented, metricsList } from './helpers/examples-tour';
import { geometryProblems } from './helpers/screen-tour';
import { chooseConcept, expectResolvedBindings, showAllDatasets } from './helpers/mapping-bindings';
const api = await startIsolatedApi();
const store = { list: () => api.ws.documents() };
const db = new Database(':memory:');
db.exec(await Bun.file('public/examples/billing/fixture.sql').text());
const mallDb = new Database(':memory:');
mallDb.exec(await Bun.file('public/examples/mall/fixture.sql').text());
const mallExpected = await Bun.file('public/examples/mall/expected.json').json();
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  acceptDownloads: true,
});
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
let passed = 0;
await routeApi(page, api);
async function check(name: string, run: () => Promise<void>) {
  await run();
  console.log('PASS', name);
  passed++;
}
// One selection is one import batch, and one batch becomes one project.
async function upload(files: [string, string][]) {
  await page.locator('input[type=file]').setInputFiles(
    await Promise.all(
      files.map(async ([filename, path]) => ({
        name: filename,
        mimeType: 'application/yaml',
        buffer: Buffer.from(await Bun.file(path).text()),
      })),
    ),
  );
  for (const [filename] of files) await expect(page.getByRole('button', { name: filename, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Review import' })).toHaveCount(0);
}
try {
  await page.goto(appUrl());
  await check('all five official Ossie inputs import unchanged through the UI', async () => {
    await upload(manifest.files.map(f => [f.filename, 'tests/fixtures/ossie-mapping/' + f.filename]));
    if (store.list().length !== 5) throw Error('Official imports missing');
    await expect(page.locator('footer')).toContainText('13 entities · 17 relationships');
    await page.getByRole('button', { name: /^Validation details/ }).click();
    await expect(page.locator('.validation-details')).toContainText('ss_ticket_number');
    await page.keyboard.press('Escape');
    await expect(page.locator('.validation-details')).toHaveCount(0);
  });
  await check('official Flights sidebar loader opens the full graph, adds only labelled workbench files and reopens without duplicating', async () => {
    // The five imported official files, then the example project: four official Flights files
    // and three files the workbench adds.
    const importedFiles = manifest.files.length;
    const exampleFiles = 7;
    for (let i = 0; i < 2; i++) {
      await (await example(page, /Ossie Flights/)).click();
      await expectModelName(page, /Flight/);
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '49');
      if (store.list().length !== importedFiles + exampleFiles) throw Error('Flights loader duplicated or omitted documents');
      for (const doc of store.list()) {
        if (!manifest.files.some(file => file.filename === doc.filename)) {
          if (!doc.source.startsWith('# Workbench addition')) throw Error('Unlabelled workbench file: ' + doc.filename);
          continue;
        }
        const official = await Bun.file('tests/fixtures/ossie-mapping/' + doc.filename).text();
        if (doc.source !== official) throw Error('Flights loader changed official bytes');
      }
    }
  });
  await check('official semantic and ontology graphs render all inspectable definitions', async () => {
    for (const [file, count] of [
      ['tpcds_semantic_model.yaml', '13'],
      ['flights.ontology.yaml', '49'],
    ] as const) {
      await page.getByRole('button', { name: file, exact: true }).first().click();
      await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', count);
      await page.getByRole('button', { name: 'Fit model', exact: true }).click();
      await page.waitForTimeout(450);
      await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
    }
    await page.screenshot({ path: '/tmp/ossie-flights-graph.png' });
  });
  await check('both official standalone and embedded Flights mappings render 60 bindings and export their context', async () => {
    // The imported official files and the Flights example are two projects. The Mappings tab shows
    // the mapping of the open file, so each form is opened through its own file: the standalone
    // mapping, the consolidated file with its embedded mapping, and the example's metrics mapping.
    const fileButton = (name: string, index: number) => page.getByRole('button', { name, exact: true }).nth(index);
    for (const index of [0, 1]) {
      await fileButton('flights.mapping.yaml', index).click();
      await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
      await expect(page.locator('.mapping-page')).toHaveCount(1);
      const forms = [fileButton('flights.mapping.yaml', index), fileButton('flights.yaml', index)];
      for (const form of forms) {
        await form.click();
        await expect(page.locator('.mapping-page')).toHaveCount(1);
        await page.getByRole('button', { name: /^All concepts/ }).click();
        await expectResolvedBindings(page, 60);
        await expect(page.locator('.mapping-findings')).toHaveCount(0);
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export agent context', exact: true }).click()]);
        const path = await download.path();
        if (!path) throw Error('Missing context');
        const context = JSON.parse(await readFile(path, 'utf8'));
        if (context.bindings.length !== 60 || context.bindings.filter((b: any) => b.condition).length !== 2) throw Error('Lost official bindings/conditions');
      }
    }
    await page.getByRole('button', { name: 'flights.metrics.mapping.yaml', exact: true }).click();
    await expect(page.locator('.mapping-page h2')).toContainText('Flights metrics');
    // The example's ontology is read by its standalone mapping and its metrics mapping, so Mappings shows both, one after the other under their names.
    await page.getByRole('button', { name: 'flights.ontology.yaml', exact: true }).last().click();
    await expect(page.locator('.mapping-page h2')).toHaveCount(2);
  });
  await check('official mapped field generates SQL that executes on a synthetic warehouse mirror', async () => {
    await page.getByRole('button', { name: 'flights.mapping.yaml', exact: true }).last().click();
    await chooseConcept(page, /^AirportName/);
    await openComposer(page);
    await page.getByRole('checkbox', { name: 'Dimension AIRPORT.name', exact: true }).check();
    await page.getByRole('button', { name: 'Preview governed query', exact: true }).click();
    const sql = await page.getByLabel('Governed SQL preview').innerText();
    const mirror = new Database(':memory:');
    try {
      mirror.exec("ATTACH ':memory:' AS flights; CREATE TABLE flights.AIRPORTS(name TEXT); INSERT INTO flights.AIRPORTS VALUES('Boston'),('Seattle');");
      const rows = mirror.query(sql.replaceAll('"DATABASE"."SCHEMA".', '"flights".')).all() as any[];
      if (
        rows
          .map(r => r.dimension_1)
          .sort()
          .join(',') !== 'Boston,Seattle'
      )
        throw Error('Official preview returned wrong rows');
    } finally {
      mirror.close();
    }
    await page.getByLabel('Governed SQL preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/ossie-flights-query.png' });
    await closeComposer(page);
  });
  // The concept page lists where a concept lives as one row per dataset, with the fields bound in it.
  // The composer is a dialog; the concept list and the cards sit side by side and stack on a phone.
  await check('Flights Airport: the cards give the definition, the datasets with their fields and the AI context; concepts sit beside them', async () => {
    await page
      .locator('.mapping-concepts')
      .getByRole('button', { name: /^Airport\s*\d/ })
      .click();
    await expect(page.locator('.mapping-detail h3').first()).toContainText('Airport');
    await showAllDatasets(page);
    const rows = page.locator('.mapping-dataset-row');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      await expect(row.locator('b')).not.toHaveText('');
      await expect(row.locator('.mapping-binding .mapping-chain-step').first()).toBeVisible();
    }
    await expect(page.locator('.mapping-ai')).toContainText('Airport');
    // Concepts sit beside the cards, which take the rest of the width.
    const detail = (await page.locator('.mapping-detail').boundingBox())!;
    const concepts = (await page.locator('.mapping-concepts').boundingBox())!;
    const columns = (await page.locator('.mapping-columns').boundingBox())!;
    expect(concepts.x + concepts.width).toBeLessThanOrEqual(detail.x + 1);
    expect(detail.x + detail.width).toBeGreaterThan(columns.x + columns.width - 40);
    await page.setViewportSize({ width: 390, height: 844 });
    const detailPhone = (await page.locator('.mapping-detail').boundingBox())!;
    const conceptsPhone = (await page.locator('.mapping-concepts').boundingBox())!;
    expect(conceptsPhone.y).toBeLessThan(detailPhone.y);
    await openComposer(page);
    const dialogBox = (await composerDialog(page).locator('.workbench-dialog').boundingBox())!;
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
    await closeComposer(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1600, height: 1000 });
  });
  await check('all official source exports retain exact upstream bytes', async () => {
    for (const file of manifest.files) {
      await page.getByRole('button', { name: file.filename, exact: true }).first().click();
      const [download] = await Promise.all([page.waitForEvent('download'), exportFile(page)]);
      const path = await download.path();
      if (!path || (await readFile(path, 'utf8')) !== (await Bun.file('tests/fixtures/ossie-mapping/' + file.filename).text()) || download.suggestedFilename() !== file.filename)
        throw Error('Upstream export changed: ' + file.filename);
    }
  });
  await check('fresh billing ontology, semantic model and mappings import and render', async () => {
    await upload(['billing.ontology.yaml', 'billing.semantic.yaml', 'billing.mapping.yaml'].map(file => [file, 'public/examples/billing/' + file]));
    await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
    await expect(page.locator('.mapping-page h2')).toHaveText('Subscription billing mappings');
    await expect(page.locator('.mapping-layers')).toContainText('36 datasets');
    await page.getByRole('button', { name: /^All concepts/ }).click();
    await expectResolvedBindings(page, 119);
    await chooseConcept(page, /^Plan\s*\d/);
    await expectResolvedBindings(page, 4);
    await page.getByRole('button', { name: /^All concepts/ }).click();
  });
  await check('billing query selected in the UI produces verified net revenue, distinct counts and governed ratios', async () => {
    await openComposer(page);
    for (const name of ['net_revenue', 'invoice_count', 'revenue_per_invoice']) await page.getByRole('checkbox', { name: 'Metric ' + name, exact: true }).check();
    await page.getByRole('checkbox', { name: 'Dimension plans.tier', exact: true }).check();
    await page.getByRole('button', { name: 'Preview governed query', exact: true }).click();
    await expect(page.getByLabel('Governed SQL preview')).toBeVisible();
    const sql = await page.getByLabel('Governed SQL preview').innerText();
    const rows = db.query(sql).all() as any[];
    const growth = rows.find(r => r.dimension_1 === 'Growth');
    if (growth.metric_1 !== 560 || growth.metric_2 !== 3 || Math.abs(growth.metric_3 - 560 / 3) > 1e-8) throw Error('Wrong Growth metrics');
    if (rows.reduce((n, r) => n + r.metric_1, 0) !== 2090 || rows.find(r => r.dimension_1 === null)?.metric_1 !== 80) throw Error('Facts lost or duplicated');
    await page.getByLabel('Governed SQL preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/billing-verified-query.png' });
  });
  await check('genuine billed-vs-subscribed cycle ambiguity is explained without returning SQL', async () => {
    await page.getByRole('checkbox', { name: 'Dimension plans.tier', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Dimension billing_cycles.name', exact: true }).check();
    await page.getByRole('button', { name: 'Preview governed query', exact: true }).click();
    await expect(composerDialog(page).getByRole('alert')).toContainText('Ambiguous join paths');
    await expect(page.getByLabel('Governed SQL preview')).toHaveCount(0);
    await composerDialog(page).getByRole('alert').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/billing-ambiguous-query.png' });
    await closeComposer(page);
  });
  await check('generated 36-entity business model opens in the preserved graph and overview', async () => {
    await page.getByRole('button', { name: 'billing.ontology.yaml', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '45');
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await page.waitForTimeout(450);
    await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
    await page.screenshot({ path: '/tmp/billing-full-graph.png' });
    await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
    await expectAreaEntityTotal(page, 45);
  });
  await check('billing example sidebar action opens its project of four documents once and reopens it without duplicating', async () => {
    // The uploaded files lack the data contract, so the first load saves the example project.
    const before = store.list().length;
    const exampleDocuments = 4;
    for (let opening = 0; opening < 2; opening++) {
      await (await example(page, /Subscription billing/)).click();
      await expect(page.locator('.mapping-page h2')).toHaveText('Subscription billing mappings');
      await page.getByRole('button', { name: /^All concepts/ }).click();
      await expectResolvedBindings(page, 119);
      if (store.list().length !== before + exampleDocuments) throw Error('Example loader duplicated or omitted definitions');
    }
  });
  await check('shopping center example loads seven documents and groups its ontology by namespace', async () => {
    const before = store.list().length;
    await (await example(page, /Shopping center administration/)).click();
    await expectModelName(page, /Shopping center administration ontology/);
    if (store.list().length !== before + 7) throw Error('Shopping center loader did not save seven documents');
    await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.getByLabel('Group model by')).toHaveCount(0);
    await expect(page.locator('.overview-grouping-note')).toContainText('Grouped by IRI namespaces');
    for (const prefix of ['core:', 'asset:', 'party:', 'lease:', 'legal:', 'hr:', 'proc:', 'ops:', 'fin:', 'perf:'])
      await expect(page.locator('.area-grid h3', { hasText: prefix }).first()).toBeVisible();
    await page.screenshot({ path: '/tmp/mall-namespaces.png' });
  });
  await check('shopping center ODCS neighborhood shows foreign keys and the ontology links to the ODCS table', async () => {
    await page.getByRole('button', { name: 'mall.odcs.yaml', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
    await expect(page.locator('footer')).toContainText('259 relationships');
    if ((await page.locator('.react-flow__node').count()) < 2) throw Error('ODCS neighborhood has no connected tables');
    await page.getByRole('button', { name: 'mall.ontology.yaml', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
    await page
      .getByRole('button', { name: /^EntityType\s*Organization\b/ })
      .first()
      .click();
    await expect(page.locator('.inspector')).toContainText('mall.odcs.yaml');
    await expect(page.locator('.inspector')).toContainText('mall.owl.ttl');
  });
  await check('value type switch hides value types in the shopping center graph and is remembered', async () => {
    await page.getByRole('button', { name: 'mall.ontology.yaml', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 90000 });
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '195');
    await viewOptions(page, options => setShown(options, 'Value types', false));
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 90000 });
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '145');
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-relationship-count', '264');
    await expect(page.locator('.full-graph-status')).toContainText('50 value types hidden');
    const close = page.getByRole('button', { name: 'Close details', exact: true });
    if (await close.count()) await close.click();
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/mall-graph-value-types-hidden.png' });
    await page.reload();
    await page.getByRole('button', { name: 'mall.ontology.yaml', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    await viewOptions(page, async options => {
      // The hidden choice is remembered across the reload.
      await expect(showToggle(options, 'Value types')).toHaveAttribute('aria-pressed', 'false');
      await setShown(options, 'Value types', true);
    });
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '195');
  });
  await check('shopping center occupancy rate query from the UI matches the computed KPIs', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
    await page.getByRole('button', { name: 'mall.mapping.yaml', exact: true }).click();
    await expect(page.locator('.mapping-page h2')).toHaveText('Shopping center administration mappings');
    await page.getByRole('button', { name: /^All concepts/ }).click();
    await openComposer(page);
    await page.getByRole('checkbox', { name: 'Metric occupancy_rate', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Dimension calendar_months.year_month', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Dimension properties.name', exact: true }).check();
    await page.getByRole('button', { name: 'Preview governed query', exact: true }).click();
    const sql = await page.getByLabel('Governed SQL preview').innerText();
    const rows = mallDb.query(sql).all() as any[];
    const wanted = mallExpected.occupancyRateByMonthProperty;
    if (rows.length !== Object.keys(wanted).length) throw Error('Wrong occupancy row count');
    for (const row of rows) if (Math.abs(row.metric_1 - wanted[`${row.dimension_1}|${row.dimension_2}`]) > 1e-9) throw Error('Wrong occupancy rate for ' + row.dimension_1 + ' ' + row.dimension_2);
    await page.screenshot({ path: '/tmp/mall-occupancy-query.png' });
    await closeComposer(page);
  });
  await check('UBL and commerce ODCS contracts show their foreign keys in the neighborhood', async () => {
    for (const [button, file, relationships] of [
      [/UBL business model/, 'ubl.odcs.yaml', '401'],
      [/Commerce workspace/, 'commerce.odcs.yaml', '3'],
    ] as const) {
      await (await example(page, button as RegExp)).click();
      await page.getByRole('button', { name: file, exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
      await expect(page.locator('footer')).toContainText(relationships + ' relationships');
      if ((await page.locator('.react-flow__node').count()) < 2) throw Error(file + ' neighborhood has no connected tables');
      for (const node of await page.locator('.react-flow__node .node').all()) {
        const title = await node.locator('strong').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        if (title.scroll > title.client + 1) throw Error(file + ': node title overflows its card');
      }
      await page.screenshot({ path: `/tmp/${file}-neighborhood.png` });
    }
  });
  await check('mapped commerce Customer chains reach fields, datasets and sources; a mapping finding opens the item editor', async () => {
    await (await example(page, /Mapped commerce/)).click();
    await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
    await expect(page.locator('.mapping-layers')).toContainText('Mapped commerce ontology');
    await page
      .locator('.mapping-concepts')
      .getByRole('button', { name: /^Customer\s*\d/ })
      .click();
    await expect(page.locator('.mapping-dataset-row').filter({ hasText: 'customers' }).first()).toContainText('customers.customer_id');
    // A mapping whose expression names a field the semantic model does not declare.
    const broken = (await Bun.file('public/examples/commerce/commerce.mapping.yaml').text())
      .replace('name: Commerce ontology mapping', 'name: Broken commerce mapping')
      .replace('expression: orders.amount', 'expression: orders.amount_missing');
    await api.ws.importInto(
      (await api.ws.listProjects(LOCAL_READER)).find(project => project.files.some(file => file.path === 'commerce.mapping.yaml'))!.slug,
      [{ path: 'commerce.broken.mapping.yaml', source: broken }],
      undefined,
      LOCAL_READER,
    );
    await page.getByRole('button', { name: 'commerce.broken.mapping.yaml', exact: true }).click();
    await expect(page.locator('.mapping-page h2')).toHaveText('Broken commerce mapping');
    const finding = page.locator('.mapping-findings p').filter({ hasText: 'amount_missing' });
    await expect(finding).toBeVisible();
    await finding.getByRole('button', { name: 'Edit item' }).first().click();
    const editor = page.getByRole('dialog', { name: /^Edit / });
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('Order');
    await page.screenshot({ path: '/tmp/workbench-mapping-finding-edit.png' });
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toHaveCount(0);
  });
  await check('every example lists its governed metrics; a simple, a composed and a cross-table metric show owner, lineage, breakdown and an unexecuted SQL preview', async () => {
    for (const [setId, expected] of Object.entries(EXPECTED_EXAMPLE_METRICS)) {
      const set = exampleSet(setId)!;
      const loader = new RegExp(`^${set.name}`, 'i');
      await (await example(page, loader)).click();
      await expect(page.locator('main > .status')).toHaveText(set.message);
      await page
        .locator('.tabs')
        .getByRole('button', { name: /^Metrics/ })
        .click();
      await expect(metricsList(page).getByRole('status')).toHaveText(`${expected.count} metrics`);
      for (const kind of ['simple', 'composed', 'path'] as const) await expectMetricPresented(page, setId, kind);
      expect(await geometryProblems(page)).toEqual([]);
      await page.screenshot({ path: `/tmp/workbench-example-metrics-${setId}.png` });
    }
  });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`${passed} example UI checks passed; no browser runtime errors.`);
} finally {
  await browser.close();
  await api.stop();
  db.close();
  mallDb.close();
}

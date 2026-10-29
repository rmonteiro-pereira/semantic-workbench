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
import { chooseConcept, expectResolvedBindings, showAllBindings } from './helpers/mapping-bindings';
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
    // The imported official files and the Flights example are two projects, and each lists only
    // its own mappings: the standalone and embedded forms of the official files, plus, in the
    // example, its own metrics mapping. Open a file of each project to see its list.
    const projects = [
      { open: page.getByRole('button', { name: 'flights.mapping.yaml', exact: true }).first() },
      { open: page.getByRole('button', { name: 'flights.mapping.yaml', exact: true }).last() },
    ];
    const allIds: string[] = [];
    let metricsMappings = 0;
    for (const project of projects) {
      await project.open.click();
      await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
      const chooser = page.getByLabel('Mapping document');
      // The list loads from the server; wait for it before reading the options.
      await expect(chooser.locator('option').nth(2)).toBeAttached();
      const options = await chooser.locator('option').evaluateAll(list => list.map((o: any) => ({ value: o.value, text: o.textContent })));
      const listed = options.filter(o => o.value);
      const slugs = new Set(listed.map(o => o.value.split('/')[0]));
      if (slugs.size !== 1) throw Error('Mapping list mixes projects: ' + [...slugs].join(', '));
      metricsMappings += listed.filter(o => o.text.includes('Flights metrics')).length;
      const ids = listed.filter(o => !o.text.includes('Flights metrics')).map(o => o.value);
      allIds.push(...ids);
      for (const id of ids) {
        await chooser.selectOption(id);
        await expectResolvedBindings(page, 60);
        await expect(page.locator('.mapping-findings')).toHaveCount(0);
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export agent context', exact: true }).click()]);
        const path = await download.path();
        if (!path) throw Error('Missing context');
        const context = JSON.parse(await readFile(path, 'utf8'));
        if (context.bindings.length !== 60 || context.bindings.filter((b: any) => b.condition).length !== 2) throw Error('Lost official bindings/conditions');
      }
    }
    if (metricsMappings !== 1) throw Error('Missing Flights metrics mapping');
    if (new Set(allIds).size !== 4) throw Error('Missing Flights mapping forms');
    await page.screenshot({ path: '/tmp/ossie-flights-mappings.png' });
  });
  await check('official mapped field generates SQL that executes on a synthetic warehouse mirror', async () => {
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
  // Bindings remain separate labelled steps, grouped by dataset with counts and collapse. The
  // composer moves below the evidence on narrow screens; findings open the item editor.
  const STEP_LABELS: Record<string, string> = {
    concept: 'Concept',
    relationship: 'Relationship',
    field: 'Field',
    metric: 'Metric',
    dataset: 'Dataset',
    source: 'Physical source',
  };
  async function chainProblems() {
    return page.locator('.mapping-binding').evaluateAll(
      (items, labels) =>
        items.flatMap((binding, i) => {
          const out: string[] = [];
          const steps = [...binding.querySelectorAll('[data-step]')];
          const kinds = steps.map(s => s.getAttribute('data-step')!);
          if (binding.getAttribute('role') !== 'group' || !(binding.getAttribute('aria-label') ?? '').startsWith('Binding ')) out.push(`binding ${i}: not a labelled group`);
          if (kinds[0] !== 'concept') out.push(`binding ${i}: chain does not start with the concept`);
          if (!kinds.some(k => k === 'field' || k === 'metric')) out.push(`binding ${i}: no field or metric step`);
          if (kinds.includes('field') && !(kinds.includes('dataset') && kinds.includes('source'))) out.push(`binding ${i}: field without dataset and physical source`);
          for (const step of steps) {
            const label = step.querySelector('.step-label')?.textContent?.trim();
            if (label !== labels[step.getAttribute('data-step')!]) out.push(`binding ${i}: step ${step.getAttribute('data-step')} labelled "${label}"`);
            if (!step.textContent?.replace(label ?? '', '').trim()) out.push(`binding ${i}: empty ${step.getAttribute('data-step')} step`);
          }
          return out;
        }),
      STEP_LABELS,
    );
  }
  async function groupCounts() {
    return page.locator('details.mapping-group').evaluateAll(gs =>
      gs.map(group => ({
        dataset: group.getAttribute('data-dataset'),
        summary: group.querySelector('summary')?.textContent ?? '',
        bindings: group.querySelectorAll('.mapping-binding').length,
      })),
    );
  }
  await check('Flights Airport: every binding is a chain of labelled steps, grouped by dataset with counts; composer beside the evidence', async () => {
    await page
      .locator('.mapping-concepts')
      .getByRole('button', { name: /^Airport\s*\d/ })
      .click();
    await expect(page.locator('.mapping-detail>h3')).toHaveText('Airport');
    await showAllBindings(page);
    const bindingCount = await page.locator('.mapping-binding').count();
    if (!bindingCount) throw Error('No Airport bindings');
    expect(await chainProblems()).toEqual([]);
    const groups = await groupCounts();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.reduce((a, g) => a + g.bindings, 0)).toBe(bindingCount);
    for (const group of groups) {
      expect(group.summary).toContain(group.dataset || 'Metrics');
      expect(group.summary).toMatch(new RegExp(`${group.bindings} binding`));
    }
    const first = page.locator('details.mapping-group').first();
    await first.locator(':scope > summary').click();
    await expect(first.locator('.mapping-binding').first()).toBeHidden();
    await first.locator(':scope > summary').click();
    await expect(first.locator('.mapping-binding').first()).toBeVisible();
    // Concepts sit beside the bindings, which take the rest of the width; the composer is a
    // dialog, so it no longer takes a column.
    const evidence = (await page.locator('.mapping-bindings').boundingBox())!;
    const concepts = (await page.locator('.mapping-concepts').boundingBox())!;
    const explorer = (await page.locator('.mapping-columns').boundingBox())!;
    expect(concepts.x + concepts.width).toBeLessThanOrEqual(evidence.x + 1);
    expect(evidence.x + evidence.width).toBeGreaterThan(explorer.x + explorer.width - 40);
    await page.screenshot({ path: '/tmp/workbench-mapping-chains.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const e2 = (await page.locator('.mapping-bindings').boundingBox())!;
    const k2 = (await page.locator('.mapping-concepts').boundingBox())!;
    expect(k2.y).toBeLessThan(e2.y);
    await openComposer(page);
    const dialogBox = (await composerDialog(page).locator('.workbench-dialog').boundingBox())!;
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: '/tmp/workbench-mapping-composer-390.png' });
    await closeComposer(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/workbench-mapping-chains-390.png' });
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
    await expect(page.locator('.mapping-layer-chain')).toContainText('Subscription billing mappings');
    await expect(page.locator('.mapping-layer-chain')).toContainText('36 datasets');
    await expectResolvedBindings(page, 119);
    await expect(page.locator('.mapping-bindings')).not.toHaveAttribute('open', '');
    await page
      .locator('.mapping-concepts')
      .getByRole('button', { name: /^Plan / })
      .click();
    await expectResolvedBindings(page, 4);
    await expect(page.locator('.mapping-bindings')).toHaveAttribute('open', '');
    await page.getByRole('button', { name: 'All concepts', exact: true }).click();
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
      await expect(page.locator('.mapping-layer-chain')).toContainText('Subscription billing mappings');
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
    const select = page.getByLabel('Mapping document');
    const value = await select.locator('option', { hasText: 'Shopping center' }).getAttribute('value');
    await select.selectOption(value!);
    await expect(page.locator('.mapping-layer-chain')).toContainText('Shopping center administration mappings');
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
    await expect(page.locator('.mapping-layer-chain')).toContainText('Mapped commerce ontology');
    await page
      .locator('.mapping-concepts')
      .getByRole('button', { name: /^Customer\s*\d/ })
      .click();
    expect(await chainProblems()).toEqual([]);
    await expect(page.locator('.mapping-binding [data-step="source"]').first()).toContainText('customers');
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
    const select = page.getByLabel('Mapping document');
    await expect(select.locator('option', { hasText: 'Broken commerce mapping' })).toHaveCount(1);
    await select.selectOption((await select.locator('option', { hasText: 'Broken commerce mapping' }).getAttribute('value'))!);
    const finding = page.locator('.mapping-findings, .mapping-binding-finding').filter({ hasText: 'amount_missing' });
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

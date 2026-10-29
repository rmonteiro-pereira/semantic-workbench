// Checks item editing and dependent changes in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { projectDir, projectFile } from '../src/server/projects/paths';
import { editorValue, fillEditor } from './helpers/code-editor';
import { expectFileOpen, newItem } from './helpers/header';
import { LOCAL_READER } from '../src/server/projects/reader';

// A very long metric name must wrap, never widen the wizard, at every width the app supports: the
// drawer does not scroll sideways, its footer is in the window, and every step can be reached.
async function expectWizardFits(page: Page, wizard: Locator) {
  const original = page.viewportSize()!;
  const longLabel = 'Valor aluguel merchandising gerencial total ' + 'por loja e por mes '.repeat(2);
  await wizard.getByLabel('Label').fill(longLabel);
  for (const [width, height] of [
    [390, 844],
    [600, 800],
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const problems = await page.evaluate(() => {
      const found: string[] = [];
      const dialog = document.querySelector('dialog[open] .workbench-dialog') as HTMLElement;
      const body = dialog.querySelector('.dialog-body') as HTMLElement;
      const footer = dialog.querySelector('.dialog-footer') as HTMLElement;
      if (dialog.scrollWidth > dialog.clientWidth + 1) found.push('the drawer scrolls sideways');
      if (body.scrollWidth > body.clientWidth + 1) found.push('the body scrolls sideways');
      if (footer.getBoundingClientRect().bottom > innerHeight + 1) found.push('footer below window');
      const stepper = dialog.querySelector('.wizard-stepper') as HTMLElement;
      const compact = stepper.querySelector('.wizard-stepper-compact') as HTMLElement;
      const compactShown = getComputedStyle(compact).display !== 'none';
      const reachable = compactShown ? compact.querySelectorAll('option').length : stepper.querySelectorAll('.wizard-stepper-list button').length;
      if (reachable !== 8) found.push(`${reachable} steps listed, not 8`);
      return found;
    });
    expect(problems, `wizard at ${width}x${height}`).toEqual([]);
  }
  await page.setViewportSize(original);
  await wizard.getByLabel('Label').fill('Vacancy rate');
}

// Each saved item edit must limit the Git diff to that item and its dependent changes. Screenshots
// use /tmp/workbench-item-*.png.
const api = await startIsolatedApi();
const commerce = await api.ws.loadExample('commerce');
const mall = await api.ws.loadExample('mall');
const contract = JSON.stringify(parse(readFileSync('public/examples/commerce/commerce.odcs.yaml', 'utf8')), null, 4) + '\n';
const jsonProject = await api.ws.importBatch(
  {
    name: 'JSON contract',
    files: [{ path: 'commerce.odcs.json', source: contract }],
  },
  LOCAL_READER,
);
const read = (slug: string, path: string) => readFileSync(projectFile(api.ws.layout, slug, path), 'utf8');
const git = async (slug: string, args: string[]) => (await api.ws.git.run(projectDir(api.ws.layout, slug), args)).stdout;
// Changed lines of a file against its last commit: [removed, added].
async function changed(slug: string, path: string) {
  const diff = await git(slug, ['diff', '-U0', '--', path]);
  return {
    removed: diff
      .split('\n')
      .filter(l => /^-(?!--)/.test(l))
      .map(l => l.slice(1)),
    added: diff
      .split('\n')
      .filter(l => /^\+(?!\+\+)/.test(l))
      .map(l => l.slice(1)),
    hunks: diff.split('\n').filter(l => l.startsWith('@@')).length,
  };
}
const commit = (slug: string, message: string) => api.ws.git.run(projectDir(api.ws.layout, slug), ['commit', '-qam', message]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  const startedAt = Date.now();
  await run();
  passed++;
  console.log('PASS', name, `(${((Date.now() - startedAt) / 1000).toFixed(1)} s)`);
}
const tree = () => page.getByRole('tree', { name: 'Projects' });
async function openFile(path: string) {
  await tree().getByRole('button', { name: path, exact: true }).first().click();
  await expectFileOpen(page);
}
const tabs = () => page.locator('.tabs');
const editor = (name: string | RegExp) => page.getByRole('dialog', { name: typeof name === 'string' ? `Edit ${name}` : name });
async function saveDialog(dialog: ReturnType<typeof editor>) {
  await expect(dialog.getByRole('button', { name: 'Save to file', exact: true })).toBeEnabled({
    timeout: 5000,
  });
  await dialog.getByRole('button', { name: 'Save to file', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 5000 });
}
try {
  await page.goto(appUrl());
  await check('catalog → Edit a concept: one field changes one line of the YAML file', async () => {
    await openFile('commerce-business.ossie.yaml');
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page.getByRole('button', { name: 'Edit Customer', exact: true }).click();
    const dialog = editor('Customer');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Customer');
    await expect(dialog.getByLabel('Type')).toHaveValue('EntityType');
    await dialog.getByLabel('Description').fill('Person or company that buys from us.');
    await page.screenshot({ path: '/tmp/workbench-item-concept.png' });
    await saveDialog(dialog);
    expect(await changed(commerce.slug, 'commerce-business.ossie.yaml')).toEqual({
      removed: ['    description: Customer in the order-to-cash process.'],
      added: ['    description: Person or company that buys from us.'],
      hunks: 1,
    });
    await expect(page.locator('main > .status')).toContainText('Saved to commerce-business.ossie.yaml');
    await commit(commerce.slug, 'concept edit');
  });
  await check('graph inspector → E opens the editor; Source tab shows only the item; an invalid edit is flagged and Save stays off', async () => {
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page.locator('.catalog-card').filter({ hasText: 'Order' }).first().locator('button').first().click();
    await expect(page.getByRole('complementary', { name: 'Definition details' })).toBeVisible();
    await page.keyboard.press('e');
    const dialog = editor('Order');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Source' }).click();
    const source = dialog.getByRole('textbox', { name: 'Source of Order' });
    await expect(source).toBeVisible();
    const fragment = await editorValue(source);
    expect(fragment.startsWith('- concept: Order\n  type: EntityType\n')).toBe(true);
    expect(fragment).not.toContain('concept: Customer');
    await fillEditor(source, fragment.replace('  type: EntityType\n', '  type: EntityType\n  extends: [Nowhere]\n'));
    await expect(dialog.locator('.cm-lintRange-error')).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByRole('button', { name: 'Save to file', exact: true })).toBeDisabled();
    await page.screenshot({ path: '/tmp/workbench-item-source-invalid.png' });
    await fillEditor(
      source,
      fragment.replace('      verbalizes:\n        - "{Order} contains {OrderLine}"', '      multiplicity: OneToOne\n      verbalizes:\n        - "{Order} contains {OrderLine}"'),
    );
    await saveDialog(dialog);
    expect(await changed(commerce.slug, 'commerce-business.ossie.yaml')).toEqual({
      removed: [],
      added: ['        multiplicity: OneToOne'],
      hunks: 1,
    });
    await commit(commerce.slug, 'source fragment edit');
  });
  await check('relationship → Edit: the related concept and reading change in place', async () => {
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page
      .locator('.catalog-card')
      // A concept that metrics measure carries a count of them between its type and its name.
      .filter({ hasText: /^EntityType(\d+ metrics?)?Customer/ })
      .locator('button')
      .first()
      .click();
    await page.locator('.related-edges button').filter({ hasText: 'places' }).click();
    await page.getByRole('complementary', { name: 'Definition details' }).getByRole('button', { name: 'Edit places', exact: true }).click();
    const dialog = editor('places');
    await dialog.getByLabel('Reading').fill('{Customer} places {Order}, {Customer} orders {Order}');
    await dialog.getByLabel('Multiplicity').selectOption('ManyToOne');
    await saveDialog(dialog);
    const change = await changed(commerce.slug, 'commerce-business.ossie.yaml');
    expect(change.added).toEqual(['          - "{Customer} orders {Order}"', '        multiplicity: ManyToOne']);
    expect(change.removed).toEqual([]);
    await commit(commerce.slug, 'relationship edit');
  });
  await check('ODCS object → property editor (YAML): flags and classification touch only that property', async () => {
    await openFile('commerce.odcs.yaml');
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page.getByRole('button', { name: 'Edit customers', exact: true }).click();
    const dialog = editor('customers');
    await dialog.getByRole('region', { name: 'Properties' }).getByRole('button', { name: 'Edit email' }).click();
    const propertyDialog = editor('email');
    await expect(propertyDialog.getByLabel('Logical type')).toHaveValue('string');
    await propertyDialog.getByLabel('Unique').check();
    await propertyDialog.getByLabel('Classification').fill('restricted');
    await page.screenshot({ path: '/tmp/workbench-item-odcs-property.png' });
    await saveDialog(propertyDialog);
    expect(await changed(commerce.slug, 'commerce.odcs.yaml')).toEqual({
      removed: [],
      added: ['        unique: true', '        classification: restricted'],
      hunks: 1,
    });
    await commit(commerce.slug, 'property edit');
  });
  await check('ODCS JSON (4-space indent): a property edit is one changed line, the rest is not re-serialized', async () => {
    await openFile('commerce.odcs.json');
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page.getByRole('button', { name: 'Edit orders', exact: true }).click();
    await editor('orders').getByRole('region', { name: 'Properties' }).getByRole('button', { name: 'Edit amount' }).click();
    const dialog = editor('amount');
    await dialog.getByLabel('Description').fill('Order total in USD, after discounts.');
    await dialog.getByLabel('Required').uncheck();
    await saveDialog(dialog);
    const change = await changed(jsonProject.slug, 'commerce.odcs.json');
    expect(change.added).toEqual(['                    "description": "Order total in USD, after discounts."']);
    const commerceContract = parse(readFileSync('public/examples/commerce/commerce.odcs.yaml', 'utf8'));
    const amountDescription = commerceContract.schema[1].properties.find((x: any) => x.name === 'amount').description;
    expect(change.removed.map(l => l.trim())).toEqual(['"required": true,', `"description": "${amountDescription}"`]);
    expect(JSON.parse(read(jsonProject.slug, 'commerce.odcs.json')).schema[1].properties.find((x: any) => x.name === 'amount').required).toBeUndefined();
  });
  await check('add a concept and a relationship to it, then delete both: the file is back to its last commit', async () => {
    await openFile('commerce-business.ossie.yaml');
    const before = read(commerce.slug, 'commerce-business.ossie.yaml');
    await newItem(page, 'Add concept…');
    const dialog = page.getByRole('dialog', { name: /^Add concept/ });
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Supplier');
    await dialog.getByLabel('Type').selectOption('EntityType');
    await dialog.getByLabel('Description').fill('Sells products to us.');
    await expect(dialog.getByLabel('Text to insert')).toHaveText('  - concept: Supplier\n    type: EntityType\n    description: Sells products to us.\n');
    await page.screenshot({ path: '/tmp/workbench-item-add.png' });
    await dialog.getByRole('button', { name: 'Save to file' }).click();
    await expect(dialog).toHaveCount(0);
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page
      .locator('.catalog-card')
      // A concept that metrics measure carries a count of them between its type and its name.
      .filter({ hasText: /^EntityType(\d+ metrics?)?Product/ })
      .locator('button')
      .first()
      .click();
    await page.getByRole('complementary', { name: 'Definition details' }).getByRole('button', { name: 'Add relationship' }).click();
    const relationshipDialog = page.getByRole('dialog', { name: /^Add relationship/ });
    await relationshipDialog.getByRole('textbox', { name: 'Name', exact: true }).fill('supplied_by');
    await relationshipDialog.getByLabel('Related concept').selectOption('Supplier');
    await relationshipDialog.getByRole('button', { name: 'Save to file' }).click();
    await expect(relationshipDialog).toHaveCount(0);
    expect(read(commerce.slug, 'commerce-business.ossie.yaml')).toContain('    relationships:\n      - name: supplied_by\n        roles:\n          - concept: Supplier\n');
    // Deleting Supplier lists the relationship that names it and removes it too.
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page
      .locator('.catalog-card')
      .filter({ hasText: /^EntityTypeSupplier/ })
      .locator('button')
      .first()
      .click();
    await page.getByRole('complementary', { name: 'Definition details' }).getByRole('button', { name: 'Delete Supplier' }).click();
    const del = page.getByRole('dialog', { name: 'Delete Supplier?' });
    await expect(del.locator('.delete-list')).toContainText('relationship supplied_by of Product');
    await page.screenshot({ path: '/tmp/workbench-item-delete.png' });
    await del.getByRole('button', { name: 'Delete' }).click();
    await expect(del).toHaveCount(0);
    await expect.poll(() => read(commerce.slug, 'commerce-business.ossie.yaml')).toBe(before);
    expect(await git(commerce.slug, ['status', '--porcelain', '--', 'commerce-business.ossie.yaml'])).toBe('');
  });
  await check('rename: remaining references are listed; unticked ones block Save, ticked ones are rewritten', async () => {
    await tabs().getByRole('button', { name: 'Catalog' }).click();
    await page.getByRole('button', { name: 'Edit OrderLine', exact: true }).click();
    const dialog = editor('OrderLine');
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('LineItem');
    const refs = dialog.getByRole('region', { name: 'References to the old name' });
    await expect(refs).toContainText('reference');
    // Unticked, the relationship that names OrderLine no longer resolves: the finding blocks
    // Save.
    await expect(dialog.getByLabel('Findings')).toContainText('OrderLine', { timeout: 5000 });
    await expect(dialog.getByRole('button', { name: 'Save to file', exact: true })).toBeDisabled();
    const boxes = refs.getByRole('checkbox');
    const count = await boxes.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await boxes.nth(i).check();
    await page.screenshot({ path: '/tmp/workbench-item-rename.png' });
    await saveDialog(dialog);
    const text = read(commerce.slug, 'commerce-business.ossie.yaml');
    expect(text).toContain('  - concept: LineItem\n');
    expect(text).toContain('          - concept: LineItem\n');
    expect(text).not.toMatch(/concept: OrderLine\n/);
    await git(commerce.slug, ['checkout', '--', '.']);
  });
  await check('metric wizard (mall): a ratio metric in eight steps; the semantic model gains the metric, the mapping one binding line', async () => {
    const started = Date.now();
    await openFile('mall.semantic.yaml');
    await tabs()
      .getByRole('button', { name: /Metrics/ })
      .click();
    await page.getByRole('button', { name: 'New metric' }).click();
    const dialog = page.getByRole('dialog', { name: 'New metric' });
    // The wizard drawer takes the height of its first step instead of the whole window.
    const drawer = await dialog.locator('section').first().boundingBox();
    expect(drawer && drawer.height).toBeLessThan(page.viewportSize()!.height - 40);
    await dialog.getByLabel('Concept measured').fill('Property');
    await dialog.getByLabel('Concept it is about').fill('Property');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByLabel('Semantic model')).toHaveValue('mall.semantic.yaml');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByLabel('Label').fill('Vacancy rate');
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('vacancy_rate');
    await expectWizardFits(page, dialog);
    await dialog.getByLabel('Metric type').selectOption('ratio');
    await dialog.getByLabel('Numerator').selectOption('vacant_gla');
    await dialog.getByLabel('Denominator').selectOption('total_gla');
    await expect(dialog.locator('.formula-line code')).toHaveText('vacant_gla / NULLIF(total_gla, 0)');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByLabel('Time dimension').selectOption('calendar_months.first_day');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByLabel('Target direction').selectOption('lower_is_better');
    await dialog.getByLabel('Target value').fill('0.05');
    await dialog.getByLabel('Warning threshold').fill('0.08');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
    await dialog.getByLabel('Owner').fill('Leasing');
    await dialog.getByLabel('Unit').fill('ratio');
    await dialog.getByLabel('Format').fill('0.0%');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('tree', { name: 'Composition tree' })).toContainText('Vacant GLA');
    await expect(dialog.getByLabel('Preview · not executed')).toContainText('SELECT');
    await page.screenshot({ path: '/tmp/workbench-item-wizard-preview.png' });
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByLabel('Changes to mall.mapping.yaml')).toContainText('vacancy_rate');
    await dialog.getByRole('button', { name: 'Save to file' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
    console.log(`  wizard completed in ${((Date.now() - started) / 1000).toFixed(1)} s of scripted use`);
    const mappingChange = await changed(mall.slug, 'mall.mapping.yaml');
    expect(mappingChange).toEqual({
      removed: [],
      added: ['        {"metric":"vacancy_rate","measures":"Property","of":"Property"},'],
      hunks: 1,
    });
    const semanticChange = await changed(mall.slug, 'mall.semantic.yaml');
    expect(semanticChange.removed).toEqual([]);
    expect(semanticChange.hunks).toBe(1);
    expect(semanticChange.added[0]).toBe('  - name: vacancy_rate');
    expect(semanticChange.added.filter(l => l.includes('NULLIF'))).toEqual(['          expression: vacant_gla / NULLIF(total_gla, 0)']);
    await expect(page.getByRole('region', { name: 'Metric Vacancy rate' })).toBeVisible({
      timeout: 10000,
    });
    await page.screenshot({ path: '/tmp/workbench-item-wizard-saved.png' });
    await commit(mall.slug, 'new metric');
  });
  await check('metric edit: changing an approved metric returns it to proposed and lists its dependents before saving', async () => {
    await page.getByRole('button', { name: 'Find a metric' }).or(page.getByLabel('Find a metric')).fill('Total GLA');
    await page.getByRole('button', { name: 'Total GLA: explain' }).click();
    await page.getByRole('button', { name: 'Edit Total GLA' }).click();
    const dialog = editor('Total GLA');
    await expect(dialog.locator('.item-dependents')).toContainText('metric occupancy_rate');
    await dialog.getByLabel('Expression (ANSI SQL)').fill('SUM(occupancy_snapshots.gla_m2) + 0');
    await expect(dialog.getByRole('status').filter({ hasText: 'returns it to proposed' })).toBeVisible();
    await expect(dialog.getByLabel('Status')).toHaveValue('proposed');
    await page.screenshot({ path: '/tmp/workbench-item-kpi-edit.png' });
    await saveDialog(dialog);
    const change = await changed(mall.slug, 'mall.semantic.yaml');
    expect(change.added.map(l => l.trim())).toEqual(['expression: SUM(occupancy_snapshots.gla_m2) + 0', '"status": "proposed",']);
    expect(change.hunks).toBe(2);
  });
  await check('metric deprecation needs a replacement or a reason before Save is allowed', async () => {
    await page.getByLabel('Find a metric').fill('Visitors');
    await page.getByRole('button', { name: /^Visitors: explain/ }).click();
    await page.getByRole('button', { name: 'Edit Visitors' }).click();
    const dialog = editor('Visitors');
    await dialog.getByLabel('Status').selectOption('deprecated');
    await expect(dialog.getByLabel('Findings')).toContainText('requires replaced_by or deprecation_reason', { timeout: 5000 });
    await expect(dialog.getByRole('button', { name: 'Save to file', exact: true })).toBeDisabled();
    await dialog.getByLabel('Deprecation reason').fill('Footfall counters were replaced in 2025.');
    await saveDialog(dialog);
    expect(read(mall.slug, 'mall.semantic.yaml')).toContain('"deprecation_reason": "Footfall counters were replaced in 2025."');
  });
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} item-edit checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}

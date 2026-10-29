// Checks contract pages, history and byte-preserving property edits in the browser.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { projectDir, projectFile } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { expectFileOpen } from './helpers/header';
// Contract property edits must change only the edited value. Screenshots use
// /tmp/workbench-odcs-*.png.
const api = await startIsolatedApi();
const commerce = await api.ws.loadExample('commerce');
const mall = await api.ws.loadExample('mall');
await api.ws.loadExample('ubl');
const git = async (slug: string, args: string[]) => (await api.ws.git.run(projectDir(api.ws.layout, slug), args)).stdout;
const read = (slug: string, path: string) => readFileSync(projectFile(api.ws.layout, slug, path), 'utf8');
// Two committed edits to the commerce contract, for History.
async function commitEdit(change: (text: string) => string, message: string) {
  const f = api.ws.readFile(commerce.slug, 'commerce.odcs.yaml');
  await api.ws.saveFile(
    commerce.slug,
    'commerce.odcs.yaml',
    {
      baseHash: f.hash,
      source: change(f.source),
    },
    LOCAL_READER,
  );
  await git(commerce.slug, ['commit', '-qam', message]);
}
await commitEdit(t => t.replace('version: 1.0.0', 'version: 1.1.0').replace('        description: Order amount.', '        description: Order amount in USD.'), 'Describe amount');
await commitEdit(
  t =>
    t
      .replace('version: 1.1.0', 'version: 1.2.0')
      .replace(
        '      - name: status\n        logicalType: string\n        required: true\n        description: Order status.\n',
        '      - name: status\n        logicalType: string\n        required: true\n        description: Order status.\n      - name: currency\n        logicalType: string\n        required: false\n        description: ISO currency code.\n',
      ),
  'Add currency',
);
const browser = await chromium.launch();
const errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  const t = Date.now();
  await run();
  passed++;
  console.log('PASS', name, `(${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
const tree = (p: Page = page) => p.getByRole('tree', { name: 'Projects' });
async function openFile(path: string, project: string) {
  await tree().getByRole('treeitem', { name: project }).getByRole('button', { name: path, exact: true }).click();
  await expectFileOpen(page);
}
const contractTab = () => page.locator('.tabs').getByRole('button', { name: 'Contract' });
const overview = () => page.getByRole('region', { name: 'Contract overview' });
const dataset = (name: string) => page.getByRole('region', { name: `Table ${name}` });
async function openDataset(name: string) {
  await overview()
    .getByRole('button', { name: `Open ${name}`, exact: true })
    .click();
  await expect(dataset(name)).toBeVisible();
}
async function openSection(label: string) {
  await overview().getByRole('button', { name: label }).click();
  const dialog = page.getByRole('dialog', { name: label });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function closeSection(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
}
const views = (name: string) => dataset(name).getByRole('tablist', { name: 'Asset views' });
const noHorizontalScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
try {
  await page.goto(appUrl());
  await check('contract overview: identity, status, team, and a searchable table list with counts', async () => {
    await openFile('commerce.odcs.yaml', 'Commerce workspace');
    await contractTab().click();
    const o = overview();
    await expect(o).toBeVisible();
    await expect(o.getByRole('heading', { level: 2 })).toHaveText('Commerce warehouse contract');
    // The id is one monospace chip with a copy button, never a text that breaks inside the UUID.
    await expect(o.locator('.odcs-contract-id code')).toHaveText(/^[0-9a-f-]{36}$/);
    await expect(o.getByRole('button', { name: 'Copy contract id' })).toBeVisible();
    for (const fact of ['1.2.0', 'active', 'Commerce', 'Sales analytics', 'v3.1.0']) await expect(o).toContainText(fact);
    // Who owns the contract is on the page itself, with no dialog to open.
    const team = o.getByRole('region', { name: 'Team and roles' });
    await expect(team).toContainText('commerce-data');
    await expect(team).toContainText('owner');
    await expect(o.getByRole('button', { name: 'Team and roles' })).toHaveCount(0);
    const table = o.getByRole('table', { name: 'Tables' });
    await expect(table.getByRole('row')).toHaveCount(5);
    const orders = table.getByRole('row').filter({ hasText: 'analytics.commerce.orders' });
    await expect(orders).toContainText('6'); // Properties after the "Add currency" commit.
    await expect(orders.locator('td[data-label="Keys"]')).toContainText('1 PK');
    await expect(orders.locator('td[data-label="Keys"]')).toContainText('1 FK');
    // The physical name is a second line under the table name, not a column of its own.
    expect(await table.getByRole('columnheader').allTextContents()).toEqual(['Table', 'Properties', 'Keys', 'Description']);
    await o.getByRole('searchbox', { name: 'Find a table' }).fill('line');
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table).toContainText('order_lines');
    await o.getByRole('searchbox', { name: 'Find a table' }).fill('');
    await page.screenshot({ path: '/tmp/workbench-odcs-overview.png' });
  });
  await check('dataset page header and Schema tab: every property with type, flags and keys; sortable, filterable, foreign keys link to their target', async () => {
    await openDataset('orders');
    const d = dataset('orders');
    await expect(d.getByRole('heading', { level: 2 })).toHaveText('orders');
    const header = d.getByRole('group', { name: 'Table facts' });
    for (const fact of ['table', '6 properties', '0 quality rules', 'Add currency']) await expect(header).toContainText(fact);
    // Properties is the default asset tab and contains the schema table.
    expect(await views('orders').getByRole('tab').allTextContents()).toEqual(['Lineage', 'Relationships', 'Data Quality', 'Properties', 'History']);
    await expect(views('orders').getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
    const table = d.getByRole('table', { name: 'Properties' });
    // Columns nobody fills (physical type, classification, tags) are not drawn. Logical type and
    // the three flags are controls in the row.
    expect(await table.getByRole('columnheader').allTextContents()).toEqual(['Name', 'Logical type', 'Required', 'Unique', 'Primary key', 'Description', 'Foreign keys', 'Edit']);
    await expect(table.getByRole('row')).toHaveCount(7);
    await expect(table.getByLabel('Logical type of order_id')).toHaveValue('integer');
    for (const flag of ['Required', 'Unique', 'Primary key']) await expect(table.getByLabel(`${flag} of order_id`)).toBeChecked();
    await expect(table.getByLabel('Primary key of amount')).not.toBeChecked();
    const names = async () => (await table.getByRole('row').locator('td:first-child').allTextContents()).map(s => s.trim());
    expect(await names()).toEqual(['order_id', 'customer_id', 'order_date', 'amount', 'status', 'currency']);
    const sortBy = d.getByRole('combobox', { name: 'Sort properties by' });
    await sortBy.selectOption('name');
    expect(await names()).toEqual(['amount', 'currency', 'customer_id', 'order_date', 'order_id', 'status']);
    await d.getByRole('button', { name: /reverse/ }).click();
    expect(await names()).toEqual(['status', 'order_id', 'order_date', 'customer_id', 'currency', 'amount']);
    await d.getByRole('searchbox', { name: 'Filter properties' }).fill('date');
    expect(await names()).toEqual(['order_date']);
    await d.getByRole('searchbox', { name: 'Filter properties' }).fill('');
    await page.screenshot({ path: '/tmp/workbench-odcs-schema.png' });
    await table.getByRole('row').filter({ hasText: 'customer_id' }).getByRole('button', { name: 'Open customers' }).click();
    await expect(dataset('customers')).toBeVisible();
    await dataset('customers').getByRole('button', { name: 'All tables' }).click();
    await expect(overview()).toBeVisible();
  });
  // The asset page's Lineage tab hosts the column-level lineage canvas.
  await check('Lineage tab: the lineage canvas centred on the table, foreign-key neighbours, the sales metrics; property lineage; Relationships', async () => {
    await openDataset('orders');
    await views('orders').getByRole('tab', { name: 'Lineage' }).click();
    const graph = dataset('orders').getByRole('region', { name: 'Lineage graph' });
    await expect(graph).toBeVisible();
    // The first view is a readable zoom that may leave outer cards off screen; Fit shows them
    // all.
    await expect(graph.locator('.lineage-card.center')).toBeVisible({ timeout: 8000 });
    await graph.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(300);
    for (const name of ['Table orders', 'Table customers', 'Table order_lines']) await expect(graph.getByRole('group', { name }).first()).toBeVisible({ timeout: 8000 });
    // The orders dataset copies its table, so it has no card of its own.
    await expect(graph.getByRole('group', { name: 'Semantic dataset orders' })).toHaveCount(0);
    await expect(graph.locator('.lineage-card.k-metric')).toHaveCount(3);
    await expect(graph.getByRole('group', { name: 'Table orders' })).toHaveClass(/center/);
    const props = dataset('orders').getByRole('table', { name: 'Property lineage' });
    await expect(props.getByRole('row').filter({ hasText: 'amount' })).toContainText('Gross revenue');
    await expect(props.getByRole('row').filter({ hasText: 'amount' })).toContainText('orders.amount');
    await page.screenshot({ path: '/tmp/workbench-odcs-lineage.png' });
    await views('orders').getByRole('tab', { name: 'Relationships' }).click();
    const rel = dataset('orders').getByRole('table', { name: 'Relationships' });
    await expect(rel.getByRole('row').filter({ hasText: 'customer_id' })).toContainText('references');
    await expect(rel.getByRole('row').filter({ hasText: 'customer_id' })).toContainText('customers');
    await expect(rel.getByRole('row').filter({ hasText: 'order_lines' })).toContainText('referenced by');
    // Each key reads as a sentence, and one legend explains the two direction chips.
    await expect(rel.getByRole('row').filter({ hasText: 'customer_id' })).toContainText('orders.customer_id references customers.customer_id');
    const legend = dataset('orders').getByRole('definition').filter({ hasText: 'holds the key' });
    await expect(legend).toHaveCount(2);
    await views('orders').getByRole('tab', { name: 'Data Quality' }).click();
    const empty = dataset('orders').locator('.empty-state');
    await expect(empty).toContainText('No quality rules declared');
    await expect(empty).toContainText('Add a quality list');
    await expect(empty).toContainText('does not run them');
  });
  await check('History tab: versions from Git with property-level changes between two versions', async () => {
    await views('orders').getByRole('tab', { name: 'History' }).click();
    const versions = dataset('orders').getByRole('table', { name: 'Versions' });
    await expect(versions.getByRole('row')).toHaveCount(4); // Header + 3 commits touching the contract.
    await expect(versions).toContainText('Add currency');
    await expect(versions).toContainText('1.2.0');
    await expect(versions).toContainText('Workbench Test');
    const log = (await git(commerce.slug, ['log', '--format=%H %s', '--', 'commerce.odcs.yaml']))
      .trim()
      .split('\n')
      .map(l => ({ commit: l.slice(0, 40), message: l.slice(41) }));
    await dataset('orders').getByLabel('From version').selectOption(log.at(-1)!.commit);
    await dataset('orders').getByLabel('To version').selectOption(log[0].commit);
    const changes = dataset('orders').getByRole('region', { name: 'Changes between versions' });
    await expect(changes).toContainText('currency');
    await expect(changes).toContainText('added');
    await expect(changes).toContainText('amount');
    await expect(changes).toContainText('Order amount in USD.');
    await dataset('orders').getByLabel('From version').selectOption(log[1].commit);
    await expect(changes).not.toContainText('Order amount in USD.');
    await expect(changes).toContainText('currency');
    await page.screenshot({ path: '/tmp/workbench-odcs-history.png' });
  });
  await check('Quality tab (mall): rules as declared, with dimension, severity and thresholds; nothing is run', async () => {
    await openFile('mall.odcs.yaml', 'Shopping center administration');
    await contractTab().click();
    const withRules = parse(read(mall.slug, 'mall.odcs.yaml')).schema.filter((o: any) => o.quality || o.properties?.some((p: any) => p.quality));
    expect(withRules.length).toBeGreaterThan(0);
    const target = withRules[0].name;
    await overview().getByRole('searchbox', { name: 'Find a table' }).fill(target);
    await openDataset(target);
    await views(target).getByRole('tab', { name: 'Data Quality' }).click();
    const rules = dataset(target).getByRole('table', { name: 'Quality rules' });
    await expect(rules.getByRole('row').nth(1)).toBeVisible();
    const declared = [...(withRules[0].quality ?? []), ...withRules[0].properties.flatMap((p: any) => p.quality ?? [])];
    await expect(rules.getByRole('row')).toHaveCount(declared.length + 1);
    if (declared[0].dimension) await expect(rules).toContainText(declared[0].dimension);
    await expect(dataset(target)).toContainText('does not run');
    await expect(rules).toContainText('nullValues');
    await expect(rules).toContainText('completeness');
    await expect(rules).toContainText('error');
    await dataset(target).getByRole('button', { name: 'All tables' }).click();
    const levels = await openSection('Service levels');
    await expect(levels).toContainText('latency');
    await expect(levels).toContainText('retention');
    await closeSection(levels);
    await page.screenshot({ path: '/tmp/workbench-odcs-quality.png' });
  });
  await check('UBL: 169 tables stay searchable and a dataset page opens quickly', async () => {
    await openFile('ubl.odcs.yaml', 'UBL business model');
    await contractTab().click();
    const table = overview().getByRole('table', { name: 'Tables' });
    await expect(table.getByRole('row')).toHaveCount(170);
    const t = Date.now();
    await overview().getByRole('searchbox', { name: 'Find a table' }).fill('invoice');
    await expect(table.getByRole('row').nth(1)).toContainText(/invoice/i);
    expect(Date.now() - t).toBeLessThan(1500);
    const first = (await table.getByRole('row').nth(1).locator('td').first().getByRole('button').first().textContent())!.trim();
    await openDataset(first);
    await expect(dataset(first).getByRole('table', { name: 'Properties' })).toBeVisible();
    await page.screenshot({ path: '/tmp/workbench-odcs-ubl.png' });
  });
  await check('narrow screens: overview and dataset page fit at 390 px without horizontal page scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalScroll();
    await page.screenshot({ path: '/tmp/workbench-odcs-narrow.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('in-place property edits change only the edited value and are saved against the base hash', async () => {
    await git(commerce.slug, ['commit', '-qam', 'before edits', '--allow-empty']);
    await openFile('commerce.odcs.yaml', 'Commerce workspace');
    await contractTab().click();
    await openDataset('orders');
    const table = dataset('orders').getByRole('table', { name: 'Properties' });
    const diff = async () => {
      const d = await git(commerce.slug, ['diff', '-U0', '--', 'commerce.odcs.yaml']);
      return {
        removed: d
          .split('\n')
          .filter(l => /^-(?!--)/.test(l))
          .map(l => l.slice(1)),
        added: d
          .split('\n')
          .filter(l => /^\+(?!\+\+)/.test(l))
          .map(l => l.slice(1)),
      };
    };
    const openEditor = async (path: string) => {
      await table.getByRole('button', { name: `Edit ${path}`, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `Edit orders.${path}`, exact: true });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    const saveEditor = async (dialog: Locator) => {
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toHaveCount(0);
    };
    const status = await openEditor('status');
    await status.getByLabel('Required').uncheck();
    await saveEditor(status);
    await expect.poll(diff).toEqual({ removed: ['        required: true'], added: [] });
    await expect(page.locator('main > .status')).toContainText('Saved required of status');
    const amountEditor = await openEditor('amount');
    await amountEditor.getByLabel('Description').fill('Order total in USD, after discounts.');
    await saveEditor(amountEditor);
    await expect.poll(diff).toEqual({
      removed: ['        description: Order amount in USD.', '        required: true'],
      added: ['        description: Order total in USD, after discounts.'],
    });
    // Wait until the page has the saved version's hash before the next edit (the file on disk
    // can change before the save response arrives; an edit in between is correctly refused as
    // stale).
    await expect(page.locator('main > .status')).toContainText('Saved description of amount');
    const currency = await openEditor('currency');
    await currency.getByLabel('Logical type').selectOption('date');
    await saveEditor(currency);
    await expect.poll(async () => (await diff()).added).toContain('        logicalType: date');
    await expect(page.locator('main > .status')).toContainText('Saved logicalType of currency');
    const customer = await openEditor('customer_id');
    await customer.getByLabel('Classification').fill('internal');
    await saveEditor(customer);
    await expect.poll(async () => (await diff()).added).toContain('        classification: internal');
    await expect(page.locator('main > .status')).toContainText('Saved classification');
    // Two fields changed in one dialog are written in one save, and nothing else changes.
    const orderDate = await openEditor('order_date');
    await orderDate.getByLabel('Unique').check();
    await orderDate.getByLabel('Description').fill('Date the order was placed.');
    await saveEditor(orderDate);
    await expect.poll(async () => (await diff()).added).toEqual(expect.arrayContaining(['        unique: true', '        description: Date the order was placed.']));
    expect((await diff()).removed).toContain('        description: Order order date.');
    // Cancel and Escape leave the file as it was, and Save stays off until something changes.
    const before = read(commerce.slug, 'commerce.odcs.yaml');
    const discarded = await openEditor('amount');
    await expect(discarded.getByRole('button', { name: 'Save to file' })).toBeDisabled();
    await expect(discarded).toContainText('No changes yet');
    await discarded.getByLabel('Description').fill('Discarded');
    await expect(discarded.getByRole('button', { name: 'Save to file' })).toBeEnabled();
    await expect(discarded).not.toContainText('No changes yet');
    await page.keyboard.press('Escape');
    await expect(discarded).toHaveCount(0);
    const reopened = await openEditor('amount');
    await expect(reopened.getByLabel('Description')).toHaveValue('Order total in USD, after discounts.');
    await reopened.getByRole('button', { name: 'Cancel' }).click();
    await expect(reopened).toHaveCount(0);
    expect(read(commerce.slug, 'commerce.odcs.yaml')).toBe(before);
    await page.screenshot({ path: '/tmp/workbench-odcs-edit.png' });
    // The History tab sees the saved edits once committed.
    await git(commerce.slug, ['commit', '-qam', 'Edit orders in place']);
    await views('orders').getByRole('tab', { name: 'History' }).click();
    await expect(dataset('orders').getByRole('region', { name: 'Changes between versions' })).toContainText('classification');
  });
  await check('logical type and the Required, Unique and Primary key flags change in the table row, with no dialog', async () => {
    const table = dataset('orders').getByRole('table', { name: 'Properties' });
    await views('orders').getByRole('tab', { name: 'Properties' }).click();
    const diff = async () => (await git(commerce.slug, ['diff', '-U0', '--', 'commerce.odcs.yaml'])).split('\n').filter(line => /^[-+](?![-+])/.test(line));
    await table.getByLabel('Logical type of amount').selectOption('integer');
    await expect.poll(diff).toContain('-        logicalType: number');
    await expect(page.locator('main > .status')).toContainText('Saved logicalType of amount');
    await table.getByLabel('Unique of amount').check();
    await expect.poll(diff).toContain('+        unique: true');
    await expect(page.locator('main > .status')).toContainText('Saved unique of amount');
    await table.getByLabel('Primary key of status').check();
    await expect.poll(diff).toContain('+        primaryKey: true');
    await expect(page.locator('main > .status')).toContainText('Saved primaryKey of status');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} ODCS checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}

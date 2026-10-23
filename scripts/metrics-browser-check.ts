// Checks metric details, explanations and graph navigation in an isolated browser workspace.
import { LOCAL_READER } from '../server/projects/reader';
import { appUrl } from './helpers/base-url';
import { viewOptions } from './helpers/graph-options';
import { chromium, expect, type Page } from '@playwright/test';
import { parseDocument } from 'yaml';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
// Checks metric explanations, refused rollups and lineage in split and consolidated examples.
const api = await startIsolatedApi();
const file = (path: string) => Bun.file('public/examples/' + path).text();
await api.ws.importBatch(
  {
    name: 'Mall',
    files: await Promise.all(
      ['mall.ontology.yaml', 'mall.semantic.yaml', 'mall.mapping.yaml', 'mall.odcs.yaml'].map(
        async path => ({ path, source: await file('mall/' + path) }),
      ),
    ),
  },
  LOCAL_READER,
);
// Flights ships without metrics: the same metric is added to the split files and to the
// consolidated file.
const metric = {
  name: 'total_departure_delay',
  description: 'Departure delay summed over flights (minutes).',
  expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(FLIGHT.dep_delay)' }] },
  custom_extensions: [
    {
      vendor_name: 'SEMANTIC_WORKBENCH',
      data:
        JSON.stringify(
          {
            schema: 'semantic-workbench/metric/v1',
            label: 'Total departure delay',
            type: 'simple',
            additivity: 'additive',
            unit: 'min',
            owner: 'Operations',
            status: 'approved',
          },
          null,
          2,
        ) + '\n',
    },
  ],
};
const bindings = [
  {
    vendor_name: 'SEMANTIC_WORKBENCH',
    data:
      JSON.stringify({
        schema: 'semantic-workbench/mapping/v1',
        kpi_bindings: [{ metric: 'total_departure_delay', measures: 'Delay', of: 'Flight' }],
      }) + '\n',
  },
];
const edit = (source: string, change: (doc: any) => void) => {
  const doc = parseDocument(source);
  change(doc);
  return doc.toString({ lineWidth: 0 });
};
await api.ws.importBatch(
  {
    name: 'Flights split',
    files: [
      { path: 'flights.ontology.yaml', source: await file('ossie/flights.ontology.yaml') },
      {
        path: 'flights.semantic_model.yaml',
        source: edit(await file('ossie/flights.semantic_model.yaml'), d =>
          d.set('metrics', d.createNode([metric])),
        ),
      },
      {
        path: 'flights.mapping.yaml',
        source: edit(await file('ossie/flights.mapping.yaml'), d =>
          d.set('custom_extensions', d.createNode(bindings)),
        ),
      },
    ],
  },
  LOCAL_READER,
);
await api.ws.importBatch(
  {
    name: 'Flights consolidated',
    files: [
      {
        path: 'flights.yaml',
        source: edit(await file('ossie/flights.yaml'), d => {
          d.setIn(['ontology_mappings', 0, 'semantic_model', 'metrics'], d.createNode([metric]));
          d.setIn(
            ['ontology_mappings', 0, 'semantic_model', 'custom_extensions'],
            d.createNode(bindings),
          );
        }),
      },
    ],
  },
  LOCAL_READER,
);
// Commerce's metrics have no workbench attributes; the last check adds them to one.
const commerce = await api.ws.loadExample('commerce');
const hashes = async () =>
  JSON.stringify(
    (await api.ws.listProjects(LOCAL_READER)).map(p => p.files.map(f => f.path + ':' + f.hash)),
  );
const before = await hashes();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
let loads = 0;
page.on('load', () => loads++);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const tree = (p: Page = page) => p.getByRole('tree', { name: 'Projects' });
async function openFile(path: string, p: Page = page) {
  await tree(p).getByRole('button', { name: path, exact: true }).click();
}
// On a narrow screen the app may open a document right after loading, which closes the drawer
// the check has just opened, so the drawer is opened again until the tree shows.
async function openDrawer(p: Page) {
  await expect(async () => {
    if (!(await tree(p).isVisible()))
      await p.getByRole('button', { name: 'Open workspace', exact: true }).click();
    await expect(tree(p)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}
const metricsTab = (p: Page = page) => p.locator('.tabs').getByRole('button', { name: /^Metrics/ });
const list = (p: Page = page) => p.getByRole('region', { name: 'Metrics' });
const filtersDialog = (p: Page = page) => p.getByRole('dialog', { name: 'Filters' });
async function openFilters(p: Page = page) {
  await list(p)
    .getByRole('button', { name: /^Filters/ })
    .click();
  await expect(filtersDialog(p)).toBeVisible();
}
async function closeFilters(p: Page = page) {
  await filtersDialog(p).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(filtersDialog(p)).toHaveCount(0);
}
// Rules and the SQL preview stay closed until their heading is pressed.
async function openSection(title: 'Rules' | 'SQL preview', p: Page = page) {
  const section = p.locator('details.on-demand').filter({ hasText: title }).first();
  if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
  await expect(section).toHaveAttribute('open', '');
}
try {
  await routeApi(page, api);
  await page.goto(appUrl());
  await expect(tree()).toBeVisible();
  await check(
    'the Metrics tab lists the 25 shopping center metrics with label, type, unit, status, owner and concept',
    async () => {
      await openFile('mall.odcs.yaml');
      await metricsTab().click();
      await expect(list().getByRole('status')).toHaveText('25 metrics');
      const row = list()
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Occupancy rate: explain' }) });
      await expect(row.getByRole('cell')).toHaveText([
        'Occupancy rateoccupancy_rate',
        'Ratio',
        'ratio',
        'approved',
        'Leasing',
        'OccupancyRate of Property',
      ]);
      await expect(metricsTab()).toContainText('25');
    },
  );
  await check('filter and group: by type, owner and text; grouped rows carry counts', async () => {
    await openFilters();
    await page.getByRole('combobox', { name: 'Filter by type' }).selectOption('ratio');
    await closeFilters();
    await expect(list().getByRole('status')).toHaveText('6 of 25 metrics');
    await expect(list().getByRole('button', { name: /^Filters/ })).toContainText('1');
    await openFilters();
    await page.getByRole('combobox', { name: 'Group metrics by' }).selectOption('owner');
    await closeFilters();
    await expect(list().locator('.metrics-group')).toHaveText(['Finance2', 'Leasing4']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(list().getByRole('status')).toHaveText('25 metrics');
    await expect(list().getByRole('button', { name: /^Filters/ })).toContainText('1');
    await expect(list().locator('.metrics-group').first()).toBeVisible();
    await openFilters();
    await page.getByRole('combobox', { name: 'Group metrics by' }).selectOption('none');
    await closeFilters();
    await expect(list().getByRole('button', { name: /^Filters/ })).not.toContainText('1');
    await page.getByRole('textbox', { name: 'Find a metric' }).fill('Supplier');
    await expect(list().getByRole('status')).toHaveText('2 of 25 metrics');
    await page.getByRole('textbox', { name: 'Find a metric' }).fill('');
  });
  await check(
    'metric detail: what it measures, its owner, target and the file it is defined in',
    async () => {
      await page.getByRole('button', { name: 'Occupancy rate: explain' }).click();
      const detail = page.getByRole('region', { name: 'Metric Occupancy rate' });
      await expect(detail.getByRole('heading', { level: 2 })).toHaveText('Occupancy rate');
      await expect(detail.locator('.kpi-facts')).toContainText('MeasuresOccupancyRate');
      await expect(detail.locator('.kpi-facts')).toContainText('AboutProperty');
      await expect(detail.locator('.kpi-targets')).toContainText('at least 95% per month');
      await expect(detail.locator('.kpi-badges')).toContainText('RatioNon-additiveapproved');
    },
  );
  await check(
    '"How this metric is calculated": formula in words, composition tree, rules, SQL preview labelled not executed',
    async () => {
      const region = page.getByRole('region', { name: 'How this metric is calculated' });
      await expect(region).toBeVisible();
      // Rules and the SQL preview start closed.
      await expect(region.locator('details.on-demand[open]')).toHaveCount(0);
      await expect(region.getByLabel('Formula in words')).toHaveText('Occupied GLA÷Total GLA');
      const tree = region.getByRole('tree', { name: 'Composition tree' });
      await expect(tree.getByRole('treeitem', { name: 'Numerator: Occupied GLA' })).toBeVisible();
      await expect(tree.getByRole('treeitem', { name: 'Denominator: Total GLA' })).toBeVisible();
      await openSection('Rules');
      await expect(region.locator('.rule')).toHaveCount(6);
      await expect(
        region.locator('.rule.tone-ok').filter({ hasText: 'Division by zero guarded' }),
      ).toBeVisible();
      await openSection('SQL preview');
      await expect(region.locator('.not-executed')).toHaveText('Preview · not executed');
      await expect(region.getByLabel('SQL preview, not executed')).toContainText(
        "DATE_TRUNC('month'",
      );
      await page.screenshot({ path: '/tmp/workbench-metrics-detail.png' });
    },
  );
  await check('refused rollups: summing a ratio, and a stock summed over a quarter', async () => {
    const region = page.getByRole('region', { name: 'How this metric is calculated' });
    await openSection('SQL preview');
    await region.getByRole('checkbox', { name: 'Sum the metric values' }).check();
    await expect(region.getByRole('alert')).toContainText('Summing ratios gives a wrong result');
    await expect(region.getByLabel('SQL preview, not executed')).toHaveCount(0);
    await region.getByRole('checkbox', { name: 'Sum the metric values' }).uncheck();
    await expect(region.getByLabel('SQL preview, not executed')).toBeVisible();
    await region.getByRole('combobox', { name: 'Time grain' }).selectOption('quarter');
    await expect(region.getByRole('alert')).toContainText('take the last month of each quarter');
    await region.getByRole('combobox', { name: 'Time grain' }).selectOption('month');
    await region.getByRole('checkbox', { name: 'properties.name' }).check();
    await expect(region.getByLabel('SQL preview, not executed')).toContainText(
      '"properties".name AS "dimension_1"',
    );
  });
  await check(
    'derived metric: the tree goes through NOI to its inputs, and lineage reaches ODCS properties with declared trust',
    async () => {
      await page.getByRole('button', { name: 'NOI margin: explain' }).click();
      const tree = page.getByRole('tree', { name: 'Composition tree' });
      await expect(
        tree
          .getByRole('treeitem', { name: 'Numerator: Net operating income (NOI)' })
          .getByRole('treeitem', { name: 'Input: Operating revenue' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Billed amount: explain' }).click();
      const lineage = page
        .getByRole('region', { name: 'Where the data comes from' })
        .getByRole('group', { name: 'Lineage of Billed amount' });
      await expect(lineage).toContainText('charges.amount');
      await expect(lineage).toContainText('mall.charges');
      await expect(lineage.locator('.odcs-property')).toHaveText('amountnumber');
      await expect(lineage.locator('.trust.quality')).toContainText('completeness');
      await expect(lineage.locator('.trust.sla').first()).toContainText('SLA · latency 1 d');
    },
  );
  await check(
    'Flights in both layouts: the same metric, concept and preview; the consolidated file is labelled',
    async () => {
      for (const [path, layout] of [
        ['flights.semantic_model.yaml', false],
        ['flights.yaml', true],
      ] as const) {
        await openFile(path);
        await metricsTab().click();
        await expect(list().getByRole('status')).toHaveText('1 metric');
        await page.getByRole('button', { name: 'Total departure delay: explain' }).click();
        const detail = page.getByRole('region', { name: 'Metric Total departure delay' });
        await expect(detail.locator('.kpi-facts')).toContainText('MeasuresDelay');
        await expect(detail.locator('.kpi-facts')).toContainText('AboutFlight');
        await expect(detail.locator('.layout-note')).toHaveCount(layout ? 1 : 0);
        await openSection('SQL preview');
        await expect(detail.getByLabel('SQL preview, not executed')).toContainText(
          'SUM("FLIGHT".dep_delay)',
        );
      }
    },
  );
  await check(
    'graph: metric nodes can be hidden, and concepts measured by a metric carry a badge (graph and catalog)',
    async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      // The consolidated Flights file opens on its mapping graph; the metric nodes are in its
      // ontology graph.
      const views = page.getByRole('group', { name: 'Graph view' });
      const options = page.getByRole('button', { name: /^View options/ });
      await expect(views.or(options).first()).toBeVisible();
      if (await views.count()) await views.getByRole('button', { name: 'Ontology graph' }).click();
      // The Metrics switch is in the View options dialog; one helper flips it and reports its label.
      const flipMetrics = async () => {
        let label = '';
        await viewOptions(page, async dialog => {
          const toggle = dialog.getByRole('button', { name: /^Metrics (shown|hidden)$/ });
          await toggle.click();
          label = (await toggle.textContent())?.trim() ?? '';
        });
        return label;
      };
      await viewOptions(page, async dialog => {
        await expect(dialog.getByRole('button', { name: /^Metrics (shown|hidden)$/ })).toHaveText(
          'Metrics shown',
        );
      });
      await expect(page.locator('.full-entity.kpi-node')).toHaveCount(1);
      await expect(
        page
          .locator('.full-entity')
          .filter({ hasText: /^Delay/ })
          .locator('.node-kpi-badge'),
      ).toHaveText('Metric');
      expect(await flipMetrics()).toBe('Metrics hidden');
      await expect(page.locator('.full-entity.kpi-node')).toHaveCount(0);
      expect(await flipMetrics()).toBe('Metrics shown');
      await expect(page.locator('.full-entity.kpi-node')).toHaveCount(1);
      await page.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
      await expect(
        page
          .locator('.catalog button')
          .filter({ has: page.getByText('Delay', { exact: true }) })
          .locator('.kpi-badge'),
      ).toHaveAttribute('title', 'Metrics: Total departure delay');
      await expect(page.locator('.catalog small').filter({ hasText: /^Metric$/ })).toHaveCount(1);
    },
  );
  await check(
    'responsive: the list and an open metric fit at 390 px and 2560 px without sideways scrolling',
    async () => {
      for (const [width, height] of [
        [390, 844],
        [2560, 1440],
      ] as const) {
        const context = await browser.newContext({ viewport: { width, height } });
        const p = await context.newPage();
        try {
          p.on('pageerror', e => errors.push(`${width}: ${e.message}`));
          await routeApi(p, api);
          await p.goto(appUrl());
          if (width < 1100) await openDrawer(p);
          await openFile('mall.odcs.yaml', p);
          await metricsTab(p).click();
          await expect(list(p).getByRole('status')).toHaveText('25 metrics');
          const overflow = () =>
            p.evaluate(() =>
              [...document.querySelectorAll('.metrics-view, .metrics-list, .metrics-detail')]
                .filter(el => el.scrollWidth > el.clientWidth + 1)
                .map(el => el.className),
            );
          expect(await overflow()).toEqual([]);
          await p.getByRole('button', { name: 'Delinquency rate: explain' }).click();
          await expect(
            p.getByRole('region', { name: 'How this metric is calculated' }),
          ).toBeVisible();
          await openSection('SQL preview', p);
          await expect(p.getByLabel('SQL preview, not executed')).toBeVisible();
          expect(await overflow()).toEqual([]);
          if (width === 390) {
            await expect(list(p)).toBeHidden();
            await p.getByRole('button', { name: 'All metrics' }).click();
            await expect(list(p)).toBeVisible();
          } else await expect(list(p)).toBeVisible();
          await p.screenshot({ path: `/tmp/workbench-metrics-${width}.png` });
        } finally {
          await context.close();
        }
      }
    },
  );
  await check('explaining wrote nothing; no page reload and no browser errors', async () => {
    expect(await hashes()).toBe(before);
    expect(loads).toBe(1);
    expect(errors).toEqual([]);
  });
  await check(
    'all metrics are listed; Governed only keeps those with attributes; Add attributes adds only the extension lines to an existing metric',
    async () => {
      await openFile('sales.ossie.yaml');
      await metricsTab().click();
      await expect(list().getByRole('status')).toHaveText('3 metrics');
      const governed = filtersDialog().getByRole('checkbox', { name: 'Governed only' });
      await openFilters();
      await governed.check();
      await closeFilters();
      await expect(list().getByRole('status')).toHaveText('0 of 3 metrics');
      await openFilters();
      await governed.uncheck();
      await closeFilters();
      await expect(list().getByRole('status')).toHaveText('3 metrics');
      await expect(list().getByRole('button', { name: /^Add attributes/ })).toHaveCount(0);
      const path = `${api.root}/projects/${commerce.slug}/sales.ossie.yaml`;
      const before = await Bun.file(path).text();
      await list().getByRole('button', { name: 'gross_revenue: explain' }).click();
      await page
        .getByRole('region', { name: 'Metric gross_revenue' })
        .getByRole('button', { name: 'Add attributes', exact: true })
        .click();
      const w = page.getByRole('dialog', { name: 'Add attributes to gross_revenue' });
      await expect(w).toBeVisible();
      const next = () => w.getByRole('button', { name: 'Next' }).click();
      await next();
      await expect(w).toContainText('sales.ossie.yaml');
      await next();
      await expect(w.getByLabel('Name')).toHaveValue('gross_revenue');
      await expect(w.getByLabel('Metric type')).toHaveValue('simple');
      await expect(w.locator('.formula-line code')).toHaveText('SUM(orders.amount)');
      await w.getByLabel('Label').fill('Gross revenue');
      await next();
      await next();
      await next();
      await w.getByLabel('Owner').fill('Sales');
      await next();
      await expect(w.getByLabel('Preview · not executed')).toBeVisible({ timeout: 10000 });
      await next();
      await w.getByRole('button', { name: 'Save to file' }).click();
      await expect(w).toBeHidden({ timeout: 10000 });
      const after = await Bun.file(path).text();
      const a = before.split('\n');
      const b = after.split('\n');
      let i = 0;
      while (a[i] === b[i]) i++;
      let j = 0;
      while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j])
        j++;
      expect(a.length - i - j).toBe(0);
      expect(b.length - i - j).toBeGreaterThan(0); // Only added lines.
      expect(after).toContain('SUM(orders.amount)');
      expect(after).toContain('"owner": "Sales"');
      await openFilters();
      await governed.check();
      await closeFilters();
      await expect(list().getByRole('status')).toHaveText('1 of 3 metrics');
      await expect(list()).toContainText('Gross revenue');
      await list().getByRole('button', { name: 'Gross revenue: explain' }).click();
      await expect(
        page.getByRole('region', { name: 'Metric Gross revenue' }).getByRole('button', {
          name: 'Add attributes',
          exact: true,
        }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
    },
  );
  console.log(`${passed} metrics checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}

// Checks mapping graph bindings, selection and warnings in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { agentCatalog, buildContext } from '../server/agent/runtime';
import { buildMappingGraph, type MappingGraph } from '../src/mappings/mapping-graph';
import { lineagePierce } from '../src/odcs/lineage-pierce';
import { selectionNodes } from '../src/odcs/lineage';
import { LOCAL_READER } from '../server/projects/reader';
// Checks rendered bindings against the resolver, including selection, filters and warnings.
// Screenshots use /tmp/workbench-mapping-graph-*.png.
const api = await startIsolatedApi();
const loaded: Record<string, { slug: string; name: string }> = {};
for (const id of ['mapped-commerce', 'flights', 'billing', 'mall'])
  loaded[id] = await api.ws.loadExample(id);
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
const graph = () => page.getByRole('region', { name: 'Mapping graph' });
const card = (name: string) => graph().getByRole('group', { name, exact: true });
// The resolver's graph for a mapping, as the server sees the saved files.
function expected(filename: string, embedded = false): MappingGraph {
  const docs = api.ws.documents();
  const m = agentCatalog(docs).mappings.find(
    x => x.filename === filename && x.embedded === embedded,
  )!;
  return buildMappingGraph(buildContext(docs, m.id) as any);
}
async function openMapping(path: string, project: string) {
  await tree()
    .getByRole('treeitem', { name: project })
    .getByRole('button', { name: path, exact: true })
    .click();
  await page.locator('.tabs').getByRole('button', { name: 'Graph' }).click();
  await expect(graph().locator('.lineage-card').first()).toBeVisible({ timeout: 15000 });
  await graph().getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(400);
}
async function compare(g: MappingGraph, label: string) {
  const want = new Set(g.edges.map(e => `${e.from}>${e.to}>${e.kind}`));
  const { lines, ports } = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('[aria-label="Mapping graph"] g[data-edge-kind]')].map(
      e => ({
        from: e.getAttribute('data-from')!,
        to: e.getAttribute('data-to')!,
        kind: e.getAttribute('data-edge-kind')!,
        count: Number(e.getAttribute('data-count')),
      }),
    ),
    ports: [...document.querySelectorAll('[aria-label="Mapping graph"] [data-id]')].map(e =>
      e.getAttribute('data-id')!,
    ),
  }));
  expect(lines.length).toBeGreaterThan(0);
  const drawn = new Set<string>();
  for (const l of lines) {
    if (l.count > 1 || l.from.endsWith('/#more') || l.to.endsWith('/#more')) continue;
    const k = `${l.from}>${l.to}>${l.kind}`;
    drawn.add(k);
    if (!want.has(k)) throw Error(`${label}: line ${k} is not a resolver binding`);
  }
  const shown = new Set(ports);
  const bundled = lines.some(l => l.count > 1);
  for (const k of want) {
    const [from, to] = k.split('>');
    if (shown.has(from) && shown.has(to) && !drawn.has(k) && !bundled)
      throw Error(`${label}: binding line ${k} is missing`);
  }
  // The entity graph's area boxes never appear for a mapping.
  await expect(page.locator('.full-area-title')).toHaveCount(0);
  return drawn.size;
}
async function shots(name: string) {
  for (const [w, h] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    await graph().getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/workbench-mapping-graph-${name}-${w}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
}
try {
  await page.goto(appUrl());
  await check(
    'mapped commerce: concepts left, datasets right, the shared legend; drawn lines are the resolver bindings both ways',
    async () => {
      await openMapping('commerce.mapping.yaml', loaded['mapped-commerce'].name);
      for (const n of ['Concept Customer', 'Dataset customers'])
        await expect(card(n)).toBeVisible();
      const c = (await card('Concept Customer').boundingBox())!;
      const d = (await card('Dataset customers').boundingBox())!;
      expect(c.x + c.width).toBeLessThan(d.x + 1);
      const legend = graph().getByRole('list', { name: 'Legend' });
      for (const t of ['Concept', 'Semantic dataset', 'Object mapping', 'Referent'])
        await expect(legend).toContainText(t);
      expect(await compare(expected('commerce.mapping.yaml'), 'commerce')).toBeGreaterThan(2);
      await expect(
        graph().locator(
          'g[data-edge-kind="object"][data-from="concept:Customer"][data-to="dataset:customers"]',
        ),
      ).toHaveCount(1);
      await expect(
        card('Dataset customers').getByRole('button', { name: 'customers.customer_id' }),
      ).toContainText('Identifying');
    },
  );
  await check(
    'selecting a concept (Region) emphasises its mappings, dims the rest, and lists its bindings with Edit item',
    async () => {
      await graph().getByRole('button', { name: 'Fit' }).click();
      await card('Concept Region').locator('.lineage-card-title').click();
      await expect.poll(() => graph().locator('g[data-on-path="true"]').count()).toBeGreaterThan(0);
      await expect.poll(() => graph().locator('.lineage-card.dim').count()).toBeGreaterThan(0);
      const panel = graph().getByRole('region', { name: 'Selected path' });
      await expect(panel).toBeVisible();
      const bindings = panel.getByRole('list', { name: 'Bindings' });
      await expect(bindings.getByRole('button', { name: 'Edit item' }).first()).toBeVisible();
      await bindings.getByRole('button', { name: 'Edit item' }).first().click();
      const editor = page.getByRole('dialog', { name: /^Edit / });
      await expect(editor).toBeVisible();
      await editor.getByRole('button', { name: 'Cancel' }).click();
      await expect(editor).toHaveCount(0);
      await page.locator('.tabs').getByRole('button', { name: 'Graph' }).click();
      await expect(graph()).toBeVisible();
    },
  );
  await check(
    'link Order.customer → Customer is labelled and passes through orders.customer_id and customers.customer_id',
    async () => {
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('Order');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .first()
        .click();
      await expect(card('Concept Order')).toHaveClass(/center/);
      const link = graph().locator('g[data-edge-kind="link"][data-from="concept:Order/customer"]');
      await expect(link).toHaveCount(1);
      await expect(link).toContainText('customer');
      await card('Concept Order')
        .getByRole('button', { name: 'Order.customer', exact: true })
        .click();
      await page.waitForTimeout(300);
      await graph().getByRole('button', { name: 'Fit' }).click();
      await page.waitForTimeout(300);
      for (const [d, f] of [
        ['orders', 'customer_id'],
        ['customers', 'customer_id'],
      ])
        await expect(card(`Dataset ${d}`).locator(`li[data-id="dataset:${d}/${f}"]`)).toHaveClass(
          /on-path/,
        );
      await page.keyboard.press('Escape');
      await shots('commerce');
    },
  );
  await check(
    'Unmapped only: unmapped concepts and fields carry the badge; the filter leaves only them',
    async () => {
      // Add an unmapped concept to the mapped commerce ontology through the API, as an edit would.
      const slug = loaded['mapped-commerce'].slug;
      const f = api.ws.readFile(slug, 'commerce.mapped-ontology.yaml');
      await api.ws.saveFile(
        slug,
        'commerce.mapped-ontology.yaml',
        {
          baseHash: f.hash,
          source: f.source + '  - concept: Shipment\n    type: EntityType\n',
        },
        LOCAL_READER,
      );
      await page.reload();
      await openMapping('commerce.mapping.yaml', loaded['mapped-commerce'].name);
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('Shipment');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .first()
        .click();
      await expect(card('Concept Shipment')).toContainText('Unmapped');
      await graph().getByRole('checkbox', { name: 'Unmapped only' }).check();
      for (const c of await graph().locator('.lineage-card').all())
        await expect(c).toContainText('Unmapped');
      await graph().getByRole('checkbox', { name: 'Unmapped only' }).uncheck();
      await api.ws.saveFile(
        slug,
        'commerce.mapped-ontology.yaml',
        {
          baseHash: api.ws.readFile(slug, 'commerce.mapped-ontology.yaml').hash,
          source: f.source,
        },
        LOCAL_READER,
      );
    },
  );
  await check(
    'warning markers: a resolver finding shows on the affected card with its message and Edit item',
    async () => {
      const slug = loaded['mapped-commerce'].slug;
      const f = api.ws.readFile(slug, 'commerce.mapping.yaml');
      await api.ws.saveFile(
        slug,
        'commerce.mapping.yaml',
        {
          baseHash: f.hash,
          source: f.source.replace(
            '            - relationship: id\n              expression: orders.order_id',
            '            - relationship: id\n              expression: orders.no_such_field',
          ),
        },
        LOCAL_READER,
      );
      await page.reload();
      await openMapping('commerce.mapping.yaml', loaded['mapped-commerce'].name);
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('Order');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .first()
        .click();
      const marker = card('Concept Order').getByRole('button', {
        name: /^Mapping finding: .*no_such_field/,
      });
      await expect(marker).toBeVisible();
      await marker.click();
      const dialog = page.getByRole('dialog', { name: 'Mapping finding' });
      await expect(dialog).toContainText('no_such_field');
      await dialog.getByRole('button', { name: 'Edit item' }).click();
      await expect(page.getByRole('dialog', { name: /^Edit / })).toBeVisible();
      await page
        .getByRole('dialog', { name: /^Edit / })
        .getByRole('button', { name: 'Cancel' })
        .click();
      await api.ws.saveFile(
        slug,
        'commerce.mapping.yaml',
        {
          baseHash: api.ws.readFile(slug, 'commerce.mapping.yaml').hash,
          source: f.source,
        },
        LOCAL_READER,
      );
    },
  );
  await check(
    'Expand, Collapse and Full pierce work on the mapping canvas: Full pierce from Customer opens exactly the cards its mappings reach',
    async () => {
      const g = expected('commerce.mapping.yaml');
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('Customer');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .filter({ hasText: 'Concept' })
        .first()
        .click();
      await expect(card('Concept Customer')).toHaveClass(/center/);
      await page.keyboard.press('Escape');
      const want = lineagePierce({
        edges: g.edges.map(e => [e.from, e.to] as [string, string]),
        owners: Object.fromEntries(
          [...g.cards.values()].flatMap(c => c.columns.map(x => [x.id, c.id])),
        ),
        start: selectionNodes(g as any, 'concept:Customer'),
        direction: 'both',
        budget: 150,
      });
      await graph().getByRole('button', { name: 'Full pierce' }).click();
      await expect(graph().getByLabel('Walk', { exact: true })).toContainText('pierced Customer');
      await page.waitForTimeout(500);
      await graph().getByRole('button', { name: 'Fit' }).click();
      await page.waitForTimeout(300);
      const ids = await graph()
        .locator('.lineage-card')
        .evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
      for (const c of want.cards) expect(ids).toContain(c);
      await graph().getByRole('button', { name: 'Undo expansion' }).click();
      const trail = graph().getByLabel('Walk', { exact: true });
      await expect(trail.getByRole('button', { name: 'pierced Customer' })).not.toHaveAttribute(
        'aria-current',
        'step',
      );
      await expect(trail.getByRole('button', { name: 'Forward' })).toBeEnabled();
    },
  );
  await check('Flights standalone: drawn lines are the resolver bindings', async () => {
    await page.reload();
    await openMapping('flights.mapping.yaml', loaded.flights.name);
    await compare(expected('flights.mapping.yaml'), 'flights');
    await shots('flights');
  });
  await check(
    'Flights consolidated: the same mapping graph for the embedded mappings, and Ontology graph switches to the entity graph',
    async () => {
      await openMapping('flights.yaml', loaded.flights.name);
      await compare(expected('flights.yaml', true), 'flights.yaml');
      const views = page.getByRole('group', { name: 'Graph view' });
      await views.getByRole('button', { name: 'Ontology graph' }).click();
      await expect(graph()).toHaveCount(0);
      await expect(page.locator('.full-graph-status')).toBeVisible({ timeout: 20000 });
      await views.getByRole('button', { name: 'Mapping graph' }).click();
      await expect(graph()).toBeVisible();
    },
  );
  await check('billing: drawn lines are the resolver bindings', async () => {
    await openMapping('billing.mapping.yaml', loaded.billing.name);
    await compare(expected('billing.mapping.yaml'), 'billing');
    await shots('billing');
  });
  await check(
    'shopping center: KPI bindings as metric cards, measures solid and of dashed',
    async () => {
      await openMapping('mall.mapping.yaml', loaded.mall.name);
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('BilledAmount');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .first()
        .click();
      await expect(card('Metric billed_amount')).toBeVisible();
      await expect(
        graph().locator('g[data-edge-kind="measures"][data-to="metric:billed_amount"]'),
      ).toHaveCount(1);
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('billed_amount');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .filter({ hasText: 'Metric' })
        .first()
        .click();
      await page.waitForTimeout(400);
      await graph().getByRole('button', { name: 'Fit' }).click();
      await page.waitForTimeout(300);
      await expect(
        graph().locator(
          'g[data-edge-kind="of"][data-to="metric:billed_amount"][data-from="concept:Lease"]',
        ),
      ).toHaveCount(1);
      expect(
        await graph()
          .locator('g[data-edge-kind="of"] path.react-flow__edge-path')
          .first()
          .getAttribute('style'),
      ).toContain('dasharray');
      await compare(expected('mall.mapping.yaml'), 'mall');
      await shots('mall');
    },
  );
  await check(
    'readable first view: concept and field names render at 12 px or more at 1280×720 and 1440×900',
    async () => {
      for (const [w, h] of [
        [1280, 720],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        await page.reload();
        await tree()
          .getByRole('treeitem', { name: loaded.billing.name })
          .getByRole('button', { name: 'billing.mapping.yaml', exact: true })
          .click();
        await page.locator('.tabs').getByRole('button', { name: 'Graph' }).click();
        await expect(graph().locator('.lineage-card.center')).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(600);
        const px = await page.evaluate(() => {
          const v = document.querySelector(
            '[aria-label="Mapping graph"] .react-flow__viewport',
          ) as HTMLElement;
          const m = v.style.transform.match(/scale\(([\d.]+)\)/);
          const name = document.querySelector(
            '[aria-label="Mapping graph"] .lineage-card.center .lineage-row-name, [aria-label="Mapping graph"] .lineage-row-name',
          ) as HTMLElement;
          return parseFloat(getComputedStyle(name).fontSize) * (m ? Number(m[1]) : 1);
        });
        console.log(`  billing ${w}×${h}: row names at ${px.toFixed(1)} px`);
        expect(px).toBeGreaterThanOrEqual(12);
        await page.screenshot({ path: `/tmp/workbench-mapping-graph-billing-first-${w}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  );
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} mapping graph checks passed on isolated data root ${api.root}.`);
} catch (e) {
  await page.screenshot({ path: '/tmp/workbench-mapping-graph-failure.png' });
  console.log('browser errors:', errors.join('\n').slice(0, 3000));
  throw e;
} finally {
  await browser.close();
  await api.stop();
}

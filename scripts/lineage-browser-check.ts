import { chromium, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { parse } from 'yaml';
import { readdirSync } from 'node:fs';
import { buildLineage, selectionNodes } from '../src/odcs/lineage';
import { lineagePierce } from '../src/odcs/lineage-pierce';
// Column-level lineage canvas (T037; SC-001, SC-002, FR-001–FR-012) on the commerce, mall and UBL
// contracts: every drawn line is one of the expected (golden) edges and every expected edge between
// two drawn rows is drawn; a selected column's path is emphasised within 200 ms; UBL's first view
// appears within 2 s; paging, walking with a trail, the legend, badges and full screen. Isolated
// data root; screenshots in /tmp/workbench-lineage-*.png at four viewports.
const api = await startIsolatedApi();
const examples = {
  commerce: await api.ws.loadExample('commerce'),
  mall: await api.ws.loadExample('mall'),
  ubl: await api.ws.loadExample('ubl'),
};
const golden = (name: string) =>
  new Set(
    (
      JSON.parse(readFileSync(`tests/fixtures/lineage/${name}.edges.json`, 'utf8')) as string[][]
    ).map(e => e.join('>')),
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
const graph = () => page.getByRole('region', { name: 'Lineage graph' });
const card = (name: string) => graph().getByRole('group', { name, exact: true });
async function openContract(path: string, project: string) {
  // Timed from opening the file (the Graph tab stays selected between files).
  const t = Date.now();
  await tree()
    .getByRole('treeitem', { name: project })
    .getByRole('button', { name: path, exact: true })
    .click();
  await page.locator('.tabs').getByRole('button', { name: 'Graph' }).click();
  await expect(graph().locator(`.lineage-card[data-id^="object:${path}#"]`).first()).toBeVisible({
    timeout: 8000,
  });
  await page.waitForTimeout(300); // the first view settles once the pane is measured
  await expect(graph().locator('.lineage-card').first()).toBeVisible({ timeout: 8000 });
  return Date.now() - t;
}
const fit = async () => {
  await graph().getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(350);
};
// Lines drawn vs golden: drawn ⊆ expected (non-bundled, both ends real ports), and expected ⊆ drawn
// for edges whose two ends are drawn rows or cards.
async function compare(name: string) {
  await fit();
  const g = golden(name);
  const { lines, ports } = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('[aria-label="Lineage graph"] g[data-edge-kind]')].map(
      e => ({
        from: e.getAttribute('data-from')!,
        to: e.getAttribute('data-to')!,
        kind: e.getAttribute('data-edge-kind')!,
        count: Number(e.getAttribute('data-count')),
      }),
    ),
    ports: [...document.querySelectorAll('[aria-label="Lineage graph"] [data-id]')].map(e =>
      e.getAttribute('data-id')!,
    ),
  }));
  expect(lines.length).toBeGreaterThan(0);
  const drawn = new Set<string>();
  for (const l of lines) {
    if (l.from.startsWith('group:') || l.to.startsWith('group:')) continue;
    if (l.count > 1 || l.from.endsWith('/#more') || l.to.endsWith('/#more')) continue;
    const k = `${l.from}>${l.to}>${l.kind}`;
    drawn.add(k);
    if (!g.has(k)) throw new Error(`${name}: unexpected line ${k}`);
  }
  const shown = new Set(ports),
    bundled = lines.some(l => l.count > 1);
  for (const k of g) {
    const [from, to] = k.split('>');
    if (shown.has(from) && shown.has(to) && !drawn.has(k) && !bundled)
      throw new Error(`${name}: missing line ${k}`);
  }
  return drawn.size;
}
// Readability (owner review): a column name in the centre card renders at 12 px or more in the
// first view, at 1280×720 and 1440×900.
async function renderedRowPx() {
  return page.evaluate(() => {
    const v = document.querySelector(
      '[aria-label="Lineage graph"] .react-flow__viewport',
    ) as HTMLElement;
    const m = v.style.transform.match(/scale\(([\d.]+)\)/);
    const scale = m ? Number(m[1]) : 1;
    const name = document.querySelector(
      '[aria-label="Lineage graph"] .lineage-card.center .lineage-row-name',
    ) as HTMLElement | null;
    return name ? parseFloat(getComputedStyle(name).fontSize) * scale : 0;
  });
}
async function firstViewReadable(path: string, project: string, label: string) {
  for (const [w, h] of [
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract(path, project);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/workbench-lineage-${label.toLowerCase()}-first-${w}.png` });
    const px = await renderedRowPx();
    console.log(`  ${label} ${w}×${h}: column names at ${px.toFixed(1)} px`);
    expect(px).toBeGreaterThanOrEqual(12);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
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
    await fit();
    await page.screenshot({ path: `/tmp/workbench-lineage-${name}-${w}.png` });
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
  await page.goto(process.env.UI_URL ?? 'http://127.0.0.1:5173/');
  await check(
    'commerce: the Graph tab opens the lineage canvas centred on orders; drawn lines match the expected edges both ways',
    async () => {
      await openContract('commerce.odcs.yaml', 'Commerce workspace');
      await expect(card('Contract object orders')).toHaveClass(/center/);
      // the first view may leave outer cards off screen at a readable zoom; Fit shows them all
      expect(await compare('commerce')).toBeGreaterThan(5);
      for (const n of [
        'Contract object customers',
        'Contract object order_lines',
        'Semantic dataset orders',
        'Metric gross_revenue',
      ])
        await expect(card(n)).toBeVisible();
    },
  );
  await check(
    'commerce: the first view is readable (column names ≥ 12 px) at 1280×720 and 1440×900',
    async () => {
      await firstViewReadable('commerce.odcs.yaml', 'Commerce workspace', 'commerce');
    },
  );
  await check(
    'legend and badges: kinds and line styles in the footer; PK, FK and Required on the rows',
    async () => {
      const legend = graph().getByRole('list', { name: 'Legend' });
      for (const t of ['Contract object', 'Metric']) await expect(legend).toContainText(t);
      await expect(legend.locator('li').filter({ hasText: 'Foreign key' })).toHaveCount(1);
      const orderId = card('Contract object orders').getByRole('button', {
        name: 'orders.order_id',
      });
      for (const b of ['PK', 'Required']) await expect(orderId).toContainText(b);
      await expect(
        card('Contract object orders').getByRole('button', { name: 'orders.customer_id' }),
      ).toContainText('FK');
    },
  );
  await check(
    'selecting a column emphasises its whole path within 200 ms and dims the rest; the path panel lists it in order',
    async () => {
      // The readable first view may leave outer cards off screen (they are not rendered); Fit shows the whole path.
      await graph().getByRole('button', { name: 'Fit' }).click();
      await page.waitForTimeout(300);
      const ms = await page.evaluate(
        () =>
          new Promise<number>(res => {
            const b = [...document.querySelectorAll('button')].find(
              x => x.getAttribute('aria-label') === 'orders.amount',
            )!;
            const t = performance.now();
            const obs = new MutationObserver(() => {
              if (document.querySelector('[aria-label="Lineage graph"] g[data-on-path="true"]')) {
                obs.disconnect();
                res(performance.now() - t);
              }
            });
            obs.observe(document.body, { subtree: true, attributes: true, childList: true });
            b.click();
          }),
      );
      console.log(`  highlight ${ms.toFixed(0)} ms`);
      expect(ms).toBeLessThanOrEqual(200);
      await expect(
        card('Contract object orders').getByRole('button', { name: 'orders.amount' }),
      ).toHaveAttribute('aria-pressed', 'true');
      const on = graph().locator('g[data-on-path="true"]');
      expect(await on.count()).toBeGreaterThanOrEqual(3);
      await expect(card('Contract object customers')).toHaveClass(/dim/);
      const panel = graph().getByRole('region', { name: 'Selected path' });
      await expect(panel).toContainText('orders.amount');
      await expect(panel).toContainText('gross_revenue');
      const items = await panel.locator('li').allTextContents();
      expect(items.findIndex(t => t.includes('orders.amount'))).toBeLessThan(
        items.findIndex(t => t.includes('gross_revenue')),
      );
      await page.keyboard.press('Escape');
      await expect(graph().locator('g[data-on-path="true"]')).toHaveCount(0);
    },
  );
  await check(
    'walk: Walk here re-centres on customers, the trail records it, Back and Forward return; Find assets walks too',
    async () => {
      await card('Contract object customers').getByRole('button', { name: 'Walk here' }).click();
      await expect(card('Contract object customers')).toHaveClass(/center/);
      const trail = graph().getByLabel('Walk', { exact: true });
      await expect(trail.locator('li')).toHaveCount(2);
      await trail.getByRole('button', { name: 'Back' }).click();
      await expect(card('Contract object orders')).toHaveClass(/center/);
      await trail.getByRole('button', { name: 'Forward' }).click();
      await expect(card('Contract object customers')).toHaveClass(/center/);
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('order_lines');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .first()
        .click();
      await expect(card('Contract object order_lines')).toHaveClass(/center/);
      await expect(trail.locator('li')).toHaveCount(3);
      await trail.getByRole('button', { name: 'Back' }).click();
      await trail.getByRole('button', { name: 'Back' }).click();
    },
  );
  await check(
    'full screen: the canvas fills the window and Exit full screen restores it',
    async () => {
      await graph().getByRole('button', { name: 'Full screen' }).click();
      await expect.poll(async () => (await graph().boundingBox())!.height).toBeGreaterThan(860);
      await graph().getByRole('button', { name: 'Exit full screen' }).click();
      await expect.poll(async () => (await graph().boundingBox())!.height).toBeLessThan(860);
      await shots('commerce');
    },
  );
  await check('mall: drawn lines match the expected edges both ways', async () => {
    await openContract('mall.odcs.yaml', examples.mall.name);
    expect(await compare('mall')).toBeGreaterThan(0);
    await shots('mall');
  });
  await check(
    'UBL (169 objects): first view within 2 s, centred on consignment; drawn lines match; paging shows the next columns',
    async () => {
      const ms = await openContract('ubl.odcs.yaml', examples.ubl.name);
      console.log(`  first view ${ms} ms`);
      expect(ms).toBeLessThanOrEqual(2000);
      const center = graph().locator('.lineage-card.center');
      await expect(center).toHaveAttribute('aria-label', 'Contract object consignment');
      expect(await renderedRowPx()).toBeGreaterThanOrEqual(12);
      // the fan-out of bridge tables is one "N more objects" card, which opens on request
      await fit();
      const group = graph().locator('.lineage-card.group').first();
      await expect(group).toContainText('more objects');
      const before = await graph().locator('.lineage-card').count();
      await group.getByRole('button', { name: /^Expand / }).click();
      await expect.poll(() => graph().locator('.lineage-card').count()).toBeGreaterThan(before);
      await compare('ubl');
      const pager = center.getByRole('navigation');
      await expect(pager).toBeVisible();
      const first = await center.locator('li[data-id]').first().getAttribute('data-id');
      await pager.getByRole('button', { name: 'Page 2' }).click();
      await expect(pager.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(await center.locator('li[data-id]').first().getAttribute('data-id')).not.toBe(first);
      await expect(center.locator('.lineage-more')).toBeVisible();
      await compare('ubl');
      await shots('ubl');
    },
  );
  await check(
    'UBL: the first view is readable (column names ≥ 12 px) at 1280×720 and 1440×900',
    async () => {
      await firstViewReadable('ubl.odcs.yaml', examples.ubl.name, 'UBL');
    },
  );
  // Expand in place and Full pierce (T047; FR-018, FR-019, FR-023).
  const cardPositions = () =>
    graph()
      .locator('.react-flow__node')
      .evaluateAll(ns =>
        Object.fromEntries(
          ns.map(n => [n.getAttribute('data-id'), (n as HTMLElement).style.transform]),
        ),
      );
  await check(
    'UBL: Expand on a card adds its neighbours beside it; placed cards do not move; Undo expansion restores the canvas',
    async () => {
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('invoice_line');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .filter({ hasText: 'Object' })
        .first()
        .click();
      await expect(card('Contract object invoice_line')).toHaveClass(/center/);
      await page.waitForTimeout(500);
      await fit();
      const before = await cardPositions(),
        button = graph()
          .locator('.lineage-card:not(.group):not(.center)')
          .getByRole('button', { name: /^Expand / })
          .first();
      const name = (await button.getAttribute('aria-label'))!.slice('Expand '.length);
      await button.click();
      await expect(graph().getByLabel('Walk', { exact: true })).toContainText(`expanded ${name}`);
      await page.waitForTimeout(600);
      await fit();
      const after = await cardPositions();
      expect(Object.keys(after).length).toBeGreaterThan(Object.keys(before).length);
      for (const [id, t] of Object.entries(before)) expect(after[id], `${id} moved`).toBe(t);
      await graph().getByRole('button', { name: 'Undo expansion' }).click();
      await page.waitForTimeout(600);
      await fit();
      expect(Object.keys(await cardPositions()).sort()).toEqual(Object.keys(before).sort());
    },
  );
  await check(
    'UBL invoice_line.line_extension_amount: Full pierce (Both) opens every card on its upstream and downstream path, highlighted',
    async () => {
      const files = readdirSync('public/examples/ubl')
          .filter(f => /\.ya?ml$/.test(f))
          .map(f => ({ path: f, data: parse(readFileSync(`public/examples/ubl/${f}`, 'utf8')) })),
        g = buildLineage(files, 'ubl.odcs.yaml');
      const col = 'object:ubl.odcs.yaml#invoice_line/line_extension_amount',
        want = lineagePierce({
          edges: g.edges.map(e => [e.from, e.to] as [string, string]),
          owners: Object.fromEntries(
            [...g.cards.values()].flatMap(c => c.columns.map(x => [x.id, c.id])),
          ),
          start: selectionNodes(g, col),
          direction: 'both',
          budget: 150,
        });
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('line_extension_amount');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .filter({ hasText: 'Column' })
        .filter({ hasText: 'invoice_line.line_extension_amount' })
        .first()
        .click();
      await expect(graph().getByRole('region', { name: 'Selected path' })).toBeVisible();
      await graph().getByRole('button', { name: 'Full pierce' }).click();
      await expect(graph().getByLabel('Walk', { exact: true })).toContainText(
        'pierced line_extension_amount',
      );
      await page.waitForTimeout(600);
      await fit();
      const ids = await graph()
        .locator('.lineage-card')
        .evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
      for (const c of want.cards) expect(ids).toContain(c);
      expect(await graph().locator('g[data-on-path="true"]').count()).toBeGreaterThan(0);
      await expect(page.locator('.pierce-banner')).toContainText(
        `${want.cards.length} cards shown`,
      );
      await page.screenshot({ path: '/tmp/workbench-lineage-pierce.png' });
    },
  );
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} lineage checks passed on isolated data root ${api.root}.`);
} catch (e) {
  await page.screenshot({ path: '/tmp/workbench-lineage-failure.png' });
  console.log('browser errors:', errors.join('\n').slice(0, 3000));
  throw e;
} finally {
  await browser.close();
  await api.stop();
}

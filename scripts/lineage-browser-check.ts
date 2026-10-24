// Checks column lineage against reference edges and measures browser interaction latency.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { parse } from 'yaml';
import { readdirSync } from 'node:fs';
import { buildLineage, selectionNodes } from '../src/odcs/lineage';
import { lineagePierce } from '../src/odcs/lineage-pierce';
import { layoutProblems } from './helpers/layout-geometry';
import { smallTextProblems, textCollisionProblems } from './helpers/text-geometry';
import { hopRowProblems, odcsGraphProblems } from './helpers/odcs-graph-geometry';
import { anchorReport, drawnLabels, paginationControls } from './helpers/odcs-graph-flow';
// Every visible edge must match a reference edge, and all reference edges between visible rows
// must appear. Path highlighting has a 200 ms budget; the first UBL view has a 2 s budget.
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
  // On a phone the workspace tree is a drawer.
  const drawer = page.getByRole('button', { name: 'Open workspace', exact: true });
  if (await drawer.isVisible()) await drawer.click();
  await tree()
    .getByRole('treeitem', { name: project })
    .getByRole('button', { name: path, exact: true })
    .click();
  await page.locator('.tabs').getByRole('button', { name: 'Graph' }).click();
  await expect(graph().locator(`.lineage-card[data-id^="object:${path}#"]`).first()).toBeVisible({
    timeout: 8000,
  });
  await page.waitForTimeout(300); // The first view settles once the pane is measured.
  await expect(graph().locator('.lineage-card').first()).toBeVisible({ timeout: 8000 });
  return Date.now() - t;
}
const fit = async () => {
  await graph().getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(350);
};
// Lines drawn vs golden: drawn ⊆ expected (non-bundled, both ends real ports), and expected ⊆
// drawn for edges whose two ends are drawn rows or cards.
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
  const shown = new Set(ports);
  const bundled = lines.some(l => l.count > 1);
  for (const k of g) {
    const [from, to] = k.split('>');
    if (shown.has(from) && shown.has(to) && !drawn.has(k) && !bundled)
      throw new Error(`${name}: missing line ${k}`);
  }
  return drawn.size;
}
// Center-card column names must render at 12 px or more in the initial laptop views.
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
  await page.goto(appUrl());
  await check(
    'commerce: the Graph tab opens the lineage canvas centred on orders; drawn lines match the expected edges both ways',
    async () => {
      await openContract('commerce.odcs.yaml', 'Commerce workspace');
      await expect(card('Table orders')).toHaveClass(/center/);
      // The first view may leave outer cards off screen at a readable zoom; Fit shows them all.
      expect(await compare('commerce')).toBeGreaterThan(5);
      for (const n of [
        'Table customers',
        'Table order_lines',
        'Semantic dataset orders',
        'Metric Gross revenue',
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
    'commerce: zoomed far out, card names are drawn larger and stay at least 11.5 px on screen',
    async () => {
      await openContract('commerce.odcs.yaml', 'Commerce workspace');
      await fit();
      const flow = graph().locator('.react-flow');
      for (
        let step = 0;
        step < 12 && !(await flow.evaluate(el => el.classList.contains('zoom-far')));
        step++
      ) {
        await graph().getByRole('button', { name: 'Zoom out', exact: true }).click();
        await page.waitForTimeout(250);
      }
      await expect(flow).toHaveClass(/zoom-far/);
      const names = await graph()
        .locator('.lineage-card-title strong')
        .evaluateAll(titles =>
          titles
            .filter(title => title.getBoundingClientRect().width > 0)
            .map(title => {
              const scale =
                title.getBoundingClientRect().height / (title as HTMLElement).offsetHeight;
              return parseFloat(getComputedStyle(title).fontSize) * scale;
            }),
        );
      expect(names.length).toBeGreaterThan(0);
      expect(Math.min(...names)).toBeGreaterThanOrEqual(11.5);
    },
  );
  await check(
    'commerce: resizing the window never turns a measured card back into an unmeasured one',
    async () => {
      await openContract('commerce.odcs.yaml', 'Commerce workspace');
      // React Flow hides a card until it has measured it, so a card that turns hidden again after
      // being shown was handed back unmeasured.
      await page.evaluate(() => {
        const watched = window as typeof window & { cardsHiddenAgain: string[] };
        watched.cardsHiddenAgain = [];
        const observer = new MutationObserver(records => {
          for (const record of records) {
            const node = record.target as HTMLElement;
            const isCard = node.classList.contains('react-flow__node-card');
            if (isCard && node.style.visibility === 'hidden') {
              watched.cardsHiddenAgain.push(node.getAttribute('data-id') ?? '');
            }
          }
        });
        observer.observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ['style'],
        });
      });
      for (const width of [1024, 390, 1440, 1280, 800, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(300);
      }
      const hiddenAgain = await page.evaluate(
        () => (window as typeof window & { cardsHiddenAgain: string[] }).cardsHiddenAgain,
      );
      expect(hiddenAgain).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  );
  await check(
    'legend and badges: kinds and line styles in the footer; PK, FK and Required on the rows',
    async () => {
      const legend = graph().getByRole('list', { name: 'Legend' });
      for (const t of ['Table', 'Metric']) await expect(legend).toContainText(t);
      await expect(legend.locator('li').filter({ hasText: 'Foreign key' })).toHaveCount(1);
      const orderId = card('Table orders').getByRole('button', {
        name: 'orders.order_id',
      });
      for (const b of ['PK', 'Required']) await expect(orderId).toContainText(b);
      await expect(
        card('Table orders').getByRole('button', { name: 'orders.customer_id' }),
      ).toContainText('FK');
    },
  );
  await check(
    'selecting a column emphasises its whole path within 200 ms and dims the rest; the path panel lists it in order',
    async () => {
      // The readable first view may leave outer cards off screen (they are not rendered); Fit
      // shows the whole path.
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
        card('Table orders').getByRole('button', { name: 'orders.amount' }),
      ).toHaveAttribute('aria-pressed', 'true');
      const on = graph().locator('g[data-on-path="true"]');
      expect(await on.count()).toBeGreaterThanOrEqual(3);
      await expect(card('Table customers')).toHaveClass(/dim/);
      const panel = graph().getByRole('region', { name: 'Selected path' });
      await expect(panel).toContainText('orders.amount');
      await expect(panel).toContainText('Gross revenue');
      const items = await panel.locator('li').allTextContents();
      expect(items.findIndex(t => t.includes('orders.amount'))).toBeLessThan(
        items.findIndex(t => t.includes('Gross revenue')),
      );
      await page.keyboard.press('Escape');
      await expect(graph().locator('g[data-on-path="true"]')).toHaveCount(0);
    },
  );
  await check(
    'walk: Walk here re-centres on customers, the trail records it, Back and Forward return; Find assets walks too',
    async () => {
      await card('Table customers').getByRole('button', { name: 'Walk here' }).click();
      await expect(card('Table customers')).toHaveClass(/center/);
      const trail = graph().getByLabel('Walk', { exact: true });
      await expect(trail.locator('li')).toHaveCount(2);
      await trail.getByRole('button', { name: 'Back' }).click();
      await expect(card('Table orders')).toHaveClass(/center/);
      await trail.getByRole('button', { name: 'Forward' }).click();
      await expect(card('Table customers')).toHaveClass(/center/);
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('order_lines');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .first()
        .click();
      await expect(card('Table order_lines')).toHaveClass(/center/);
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
    'UBL (169 tables): first view within 2 s, centred on consignment; drawn lines match; the card opens in place',
    async () => {
      const ms = await openContract('ubl.odcs.yaml', examples.ubl.name);
      console.log(`  first view ${ms} ms`);
      expect(ms).toBeLessThanOrEqual(2000);
      const center = graph().locator('.lineage-card.center');
      await expect(center).toHaveAttribute('aria-label', 'Table consignment');
      expect(await renderedRowPx()).toBeGreaterThanOrEqual(12);
      // The fan-out of bridge tables is one "N more tables" card, which opens on request.
      await fit();
      const group = graph().locator('.lineage-card.group').first();
      await expect(group).toContainText('more tables');
      const before = await graph().locator('.lineage-card').count();
      await group.getByRole('button', { name: /^Expand / }).click();
      // The new cards arrive after ELK has laid them out, so fit again until they are on screen.
      await expect
        .poll(async () => {
          await fit();
          return graph().locator('.lineage-card').count();
        })
        .toBeGreaterThan(before);
      await compare('ubl');
      // Cards never page: a wide table opens in place into one scrolling list.
      await expect(center.getByRole('navigation')).toHaveCount(0);
      await center.getByRole('button', { name: /^Show all \d+ columns of consignment/ }).click();
      const list = center.getByRole('region', { name: 'Columns of consignment' });
      await expect(list).toBeVisible();
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
        .filter({ hasText: 'Table' })
        .first()
        .click();
      await expect(card('Table invoice_line')).toHaveClass(/center/);
      await page.waitForTimeout(500);
      await fit();
      const before = await cardPositions();
      const button = graph()
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
    'UBL invoice_line.line_extension_amount: Show all connected (Both) opens every card on its upstream and downstream path, highlighted',
    async () => {
      const files = readdirSync('public/examples/ubl')
        .filter(f => /\.ya?ml$/.test(f))
        .map(f => ({ path: f, data: parse(readFileSync(`public/examples/ubl/${f}`, 'utf8')) }));
      const g = buildLineage(files, 'ubl.odcs.yaml');
      const col = 'object:ubl.odcs.yaml#invoice_line/line_extension_amount';
      const want = lineagePierce({
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
      await graph().getByRole('button', { name: 'Show all connected' }).click();
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
  await check(
    'graph: at four sizes the first view of three contracts has whole cards, readable column names, clear lines and labels, and a legend',
    async () => {
      const contracts = [
        ['commerce.odcs.yaml', 'Commerce workspace'],
        ['mall.odcs.yaml', examples.mall.name],
        ['ubl.odcs.yaml', examples.ubl.name],
      ] as const;
      for (const [width, height] of [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ] as const) {
        await page.setViewportSize({ width, height });
        for (const [file, project] of contracts) {
          const where = `${file} ${width}×${height}`;
          await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
          await openContract(file, project);
          await page.waitForTimeout(700);
          expect(await odcsGraphProblems(page), where).toEqual([]);
          expect(await layoutProblems(page), `${where} layout`).toEqual([]);
          expect(await smallTextProblems(page, '.lineage-view'), where).toEqual([]);
          expect(await textCollisionProblems(page, '.lineage-view'), where).toEqual([]);
          // Cards that do not fit wait behind a counted control; Show all brings them in.
          const showAll = page.getByRole('button', { name: /^\d+ of \d+ cards shown · Show all$/ });
          if (await showAll.isVisible()) {
            const before = await page.locator('.lineage-card').count();
            await showAll.click();
            await expect
              .poll(() => page.locator('.lineage-card').count(), { timeout: 8000 })
              .toBeGreaterThan(before);
          }
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  );
  await check('graph: no canvas card has page buttons; wide tables open in place', async () => {
    for (const [file, project] of [
      ['mall.odcs.yaml', examples.mall.name],
      ['ubl.odcs.yaml', examples.ubl.name],
    ] as const) {
      await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
      await openContract(file, project);
      await fit();
      expect(await paginationControls(page), file).toBe(0);
    }
  });
  await check(
    'graph: a card opens in place with a filter and Show fewer; its lines stay on their rows, and rows out of view keep a marker',
    async () => {
      // consignment has more than 30 columns, so its opened card carries a filter box.
      await graph().getByRole('textbox', { name: 'Find assets' }).fill('consignment');
      await graph()
        .getByRole('listbox', { name: 'Asset results' })
        .getByRole('option')
        .filter({ hasText: 'Table' })
        .first()
        .click();
      await expect(card('Table consignment')).toHaveClass(/center/);
      await page.waitForTimeout(600);
      const center = graph().locator('.lineage-card.center');
      const centreName = ((await center.getAttribute('aria-label')) ?? '').replace('Table ', '');
      const more = center.getByRole('button', { name: /^Show all \d+ columns of / });
      await more.click();
      const list = center.getByRole('region', { name: `Columns of ${centreName}` });
      await expect(list).toBeVisible();
      await expect(center.getByRole('searchbox', { name: /^Filter columns of/ })).toBeVisible();
      await page.waitForTimeout(500);
      const top = await anchorReport(page, `Table ${centreName}`);
      expect(top.problems).toEqual([]);
      expect(top.onRow).toBeGreaterThan(0);
      expect(top.onEdge).toBeGreaterThan(0);
      expect(top.markers).toBeGreaterThan(0);
      await list.evaluate(el => {
        el.scrollTop = 400;
      });
      await page.waitForTimeout(500);
      const scrolled = await anchorReport(page, `Table ${centreName}`);
      expect(scrolled.problems).toEqual([]);
      expect(scrolled.onRow).toBeGreaterThan(0);
      // The filter narrows the list; clearing it brings every column back.
      const filter = center.getByRole('searchbox', { name: /^Filter columns of/ });
      await filter.fill('carrier');
      await expect(center.getByText(/\d+ of \d+ columns/)).toBeVisible();
      await filter.fill('');
      await center.getByRole('button', { name: 'Show fewer' }).click();
      await expect(list).toHaveCount(0);
      await expect(more).toBeVisible();
      expect(await paginationControls(page)).toBe(0);
    },
  );
  await check(
    'graph: a bundle of lines is labelled once and no label repeats the word lines',
    async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
      await openContract('mall.odcs.yaml', examples.mall.name);
      await page.waitForTimeout(500);
      expect(await odcsGraphProblems(page)).toEqual([]);
      await fit();
      const labels = await drawnLabels(page);
      for (const label of labels) expect(label.text).not.toMatch(/lines/);
      const bundles = labels.filter(label => /^\d+$/.test(label.text));
      const pairs = bundles.map(label => `${label.fromCard}>${label.toCard}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    },
  );
  await check(
    'foreign-key hops: the hop control, the path line and the list of keys read as sentences at four sizes',
    async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
      await openContract('commerce.odcs.yaml', 'Commerce workspace');
      const hops = graph().getByRole('group', { name: 'How far to follow foreign keys' });
      await expect(hops.getByRole('button', { name: '1 hop' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await hops.getByRole('button', { name: '2 hops' }).click();
      await expect(hops.getByRole('button', { name: '2 hops' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await hops.getByRole('button', { name: '1 hop' }).click();
      for (const [width, height] of [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        expect(await hopRowProblems(page), `${width}×${height}`).toEqual([]);
        expect(await smallTextProblems(page, '.lineage-hops')).toEqual([]);
        expect(await textCollisionProblems(page, '.lineage-hops')).toEqual([]);
        const row = graph().locator('.lineage-hops');
        await expect(row.locator('.lineage-hops-path')).toHaveText('orders · 2 connected tables');
        await expect(row.locator('.lineage-hops-path')).toHaveAttribute('title', /^orders → /);
        await expect(row).toContainText('1 hop');
        await graph()
          .getByRole('button', { name: /^Foreign keys \(\d+\)$/ })
          .click();
        const dialog = page.getByRole('dialog', { name: 'Foreign keys in this view' });
        await expect(dialog).toContainText('orders.customer_id → customers.customer_id');
        await expect(dialog).toContainText('orders references customers');
        expect(await smallTextProblems(page, 'dialog[open]')).toEqual([]);
        expect(await textCollisionProblems(page, 'dialog[open]')).toEqual([]);
        expect(await layoutProblems(page)).toEqual([]);
        await dialog.getByRole('button', { name: 'Done' }).click();
      }
      await page.setViewportSize({ width: 1440, height: 900 });
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

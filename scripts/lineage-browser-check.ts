// Checks column lineage against reference edges and measures browser interaction latency.
import { appUrl } from './helpers/base-url';
import { recordResizeErrors } from './helpers/resize-errors';
import { chromium, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { LOCAL_READER } from '../src/server/projects/reader';
import { parse } from 'yaml';
import { readdirSync } from 'node:fs';
import { buildLineage, selectionNodes } from '../src/app/odcs/lineage';
import { lineagePierce } from '../src/app/odcs/lineage-pierce';
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
// A dataset that renames a wide table reads nine of its columns. It is not a copy, so its card
// stays, and nine lines between the same two cards draw as one bundled line.
const wideColumns = Array.from({ length: 9 }, (_, index) => `measure_${index + 1}`);
const wideContract = [
  'apiVersion: v3.1.0',
  'kind: DataContract',
  'id: 2f6c3e0a-8b1d-4c55-9a77-1d2e3f4a5b6c',
  'name: Wide contract',
  'version: 1.0.0',
  'status: active',
  'schema:',
  '  - name: wide_table',
  '    physicalName: analytics.wide_table',
  '    physicalType: table',
  '    logicalType: object',
  '    properties:',
  ...wideColumns.flatMap(column => [`      - name: ${column}`, '        logicalType: number']),
].join('\n');
const wideModel = [
  'version: 0.2.0.dev0',
  'name: Wide model',
  'datasets:',
  '  - name: wide_view',
  '    source: analytics.wide_table',
  '    fields:',
  ...wideColumns.flatMap(column => [`      - name: ${column}`, '        expression:', '          dialects:', '            - dialect: ANSI_SQL', `              expression: ${column}`]),
].join('\n');
const wide = await api.ws.importBatch(
  {
    name: 'Wide lines',
    files: [
      { path: 'wide.odcs.yaml', source: wideContract + '\n' },
      { path: 'wide.semantic.yaml', source: wideModel + '\n' },
    ],
  },
  LOCAL_READER,
);
const golden = (name: string) => new Set((JSON.parse(readFileSync(`tests/fixtures/lineage/${name}.edges.json`, 'utf8')) as string[][]).map(e => e.join('>')));
const browser = await chromium.launch();
const errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', consoleMessage => {
  if ((consoleMessage.type() === 'error' && !/Failed to load resource/.test(consoleMessage.text())) || (consoleMessage.type() === 'warning' && consoleMessage.text().includes('[React Flow]'))) {
    errors.push(consoleMessage.text());
  }
});
await recordResizeErrors(page, message => errors.push(message));
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  const startedAt = Date.now();
  await run();
  passed++;
  console.log('PASS', name, `(${((Date.now() - startedAt) / 1000).toFixed(1)} s)`);
}
const tree = (p: Page = page) => p.getByRole('tree', { name: 'Projects' });
const graph = () => page.getByRole('region', { name: 'Lineage graph' });
const card = (name: string) => graph().getByRole('group', { name, exact: true });
async function openContract(path: string, project: string) {
  // Timed from opening the file (the Graph tab stays selected between files).
  const startedAt = Date.now();
  // On a phone the workspace tree is a drawer.
  const drawer = page.getByRole('button', {
    name: 'Open workspace',
    exact: true,
  });
  if (await drawer.isVisible()) await drawer.click();
  await tree().getByRole('treeitem', { name: project }).getByRole('button', { name: path, exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Graph' }).click();
  await expect(graph().locator(`.lineage-card[data-id^="object:${path}#"]`).first()).toBeVisible({
    timeout: 8000,
  });
  await page.waitForTimeout(300); // The first view settles once the pane is measured.
  await expect(graph().locator('.lineage-card').first()).toBeVisible({
    timeout: 8000,
  });
  return Date.now() - startedAt;
}
// Makes a table the centre of the open contract's graph through the asset search.
async function centreOn(table: string) {
  await graph().getByRole('textbox', { name: 'Find assets' }).fill(table);
  await graph().getByRole('listbox', { name: 'Asset results' }).getByRole('option').filter({ hasText: 'Table' }).first().click();
  await expect(graph().locator('.lineage-card.center')).toHaveAttribute('aria-label', `Table ${table}`);
  await page.waitForTimeout(600);
}
// How many drawn cards lie inside the canvas, and whether the centre card is among them.
async function cardsInView() {
  return graph().evaluate(root => {
    const pane = root.querySelector('.react-flow')!.getBoundingClientRect();
    const cards = [...root.querySelectorAll('.lineage-card')];
    const inside = cards.filter(card => {
      const box = card.getBoundingClientRect();
      return box.right > pane.left && box.left < pane.right && box.bottom > pane.top && box.top < pane.bottom;
    });
    return {
      drawn: cards.length,
      inView: inside.length,
      centreInView: inside.some(card => card.classList.contains('center')),
    };
  });
}
const fit = async () => {
  await graph().getByRole('button', { name: 'Fit' }).click();
  await page.waitForTimeout(350);
};
// Clicks a drawn line matching the selector where no card covers it: its label first, which is
// what a person aims at, then points along its path, trying each matching line in turn.
async function clickLine(selector: string) {
  const point = await page.evaluate(css => {
    const fractions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];
    for (const edge of document.querySelectorAll(css)) {
      const wrapper = edge.closest('.react-flow__edge');
      const path = edge.querySelector('.react-flow__edge-interaction') as SVGPathElement | null;
      const matrix = path?.getScreenCTM();
      if (!path || !matrix) continue;
      const candidates: { x: number; y: number }[] = [];
      const label = edge.querySelector('.lineage-edge-label.shown rect');
      if (label) {
        const box = label.getBoundingClientRect();
        candidates.push({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        });
      }
      for (const fraction of fractions) {
        const local = path.getPointAtLength(path.getTotalLength() * fraction);
        candidates.push({
          x: matrix.a * local.x + matrix.c * local.y + matrix.e,
          y: matrix.b * local.x + matrix.d * local.y + matrix.f,
        });
      }
      for (const candidate of candidates) {
        const hit = document.elementFromPoint(candidate.x, candidate.y)?.closest('.react-flow__edge');
        if (hit && hit === wrapper) return candidate;
      }
    }
    return null;
  }, selector);
  expect(point, `a clickable point on ${selector}`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}
// Lines drawn vs golden: drawn ⊆ expected (non-bundled, both ends real ports), and expected ⊆
// drawn for edges whose two ends are drawn rows or cards.
async function compare(name: string) {
  await fit();
  const expectedLines = golden(name);
  const { lines, ports } = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('[aria-label="Lineage graph"] g[data-edge-kind]')].map(edge => ({
      from: edge.getAttribute('data-from')!,
      to: edge.getAttribute('data-to')!,
      kind: edge.getAttribute('data-edge-kind')!,
      count: Number(edge.getAttribute('data-count')),
    })),
    ports: [...document.querySelectorAll('[aria-label="Lineage graph"] [data-id]')].map(e => e.getAttribute('data-id')!),
  }));
  expect(lines.length).toBeGreaterThan(0);
  const drawn = new Set<string>();
  for (const line of lines) {
    if (line.from.startsWith('group:') || line.to.startsWith('group:')) continue;
    if (line.count > 1 || line.from.endsWith('/#more') || line.to.endsWith('/#more')) continue;
    const key = `${line.from}>${line.to}>${line.kind}`;
    drawn.add(key);
    if (!expectedLines.has(key)) throw new Error(`${name}: unexpected line ${key}`);
  }
  const shown = new Set(ports);
  const bundled = lines.some(l => l.count > 1);
  for (const key of expectedLines) {
    const [from, to] = key.split('>');
    if (shown.has(from) && shown.has(to) && !drawn.has(key) && !bundled) throw new Error(`${name}: missing line ${key}`);
  }
  return drawn.size;
}
// Center-card column names must render at 12 px or more in the initial laptop views.
async function renderedRowPx() {
  return page.evaluate(() => {
    const element = document.querySelector('[aria-label="Lineage graph"] .react-flow__viewport') as HTMLElement;
    const match = element.style.transform.match(/scale\(([\d.]+)\)/);
    const scale = match ? Number(match[1]) : 1;
    const name = document.querySelector('[aria-label="Lineage graph"] .lineage-card.center .lineage-row-name') as HTMLElement | null;
    return name ? parseFloat(getComputedStyle(name).fontSize) * scale : 0;
  });
}
async function firstViewReadable(path: string, project: string, label: string) {
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract(path, project);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `/tmp/workbench-lineage-${label.toLowerCase()}-first-${width}.png`,
    });
    const px = await renderedRowPx();
    console.log(`  ${label} ${width}×${height}: column names at ${px.toFixed(1)} px`);
    expect(px).toBeGreaterThanOrEqual(12);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function shots(name: string) {
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await fit();
    await page.screenshot({ path: `/tmp/workbench-lineage-${name}-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
}
try {
  await page.goto(appUrl());
  await check('commerce: the Graph tab opens the lineage canvas centred on orders; drawn lines match the expected edges both ways', async () => {
    await openContract('commerce.odcs.yaml', 'Commerce workspace');
    await expect(card('Table orders')).toHaveClass(/center/);
    // The first view may leave outer cards off screen at a readable zoom; Fit shows them all.
    expect(await compare('commerce')).toBeGreaterThan(5);
    for (const cardName of ['Table customers', 'Table order_lines', 'Metric Gross revenue']) await expect(card(cardName)).toBeVisible();
    // The orders dataset copies its table, so the table card stands for it with a badge.
    await expect(card('Semantic dataset orders')).toHaveCount(0);
    await expect(card('Table orders')).toContainText('Semantic dataset');
  });
  await check('commerce: the first view is readable (column names ≥ 12 px) at 1280×720 and 1440×900', async () => {
    await firstViewReadable('commerce.odcs.yaml', 'Commerce workspace', 'commerce');
  });
  await check('commerce: zoomed far out, card names are drawn larger and stay at least 11.5 px on screen', async () => {
    await openContract('commerce.odcs.yaml', 'Commerce workspace');
    await fit();
    const flow = graph().locator('.react-flow');
    for (let step = 0; step < 12 && !(await flow.evaluate(el => el.classList.contains('zoom-far'))); step++) {
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
            const scale = title.getBoundingClientRect().height / (title as HTMLElement).offsetHeight;
            return parseFloat(getComputedStyle(title).fontSize) * scale;
          }),
      );
    expect(names.length).toBeGreaterThan(0);
    expect(Math.min(...names)).toBeGreaterThanOrEqual(11.5);
  });
  await check('commerce: resizing the window never turns a measured card back into an unmeasured one', async () => {
    await openContract('commerce.odcs.yaml', 'Commerce workspace');
    // React Flow hides a card until it has measured it, so a card that turns hidden again after
    // being shown was handed back unmeasured.
    await page.evaluate(() => {
      const watched = window as typeof window & {
        cardsHiddenAgain: string[];
      };
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
    const hiddenAgain = await page.evaluate(() => (window as typeof window & { cardsHiddenAgain: string[] }).cardsHiddenAgain);
    expect(hiddenAgain).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('legend and badges: kinds and line styles in the footer; PK, FK and Required on the rows', async () => {
    const legend = graph().getByRole('list', { name: 'Legend' });
    for (const kind of ['Table', 'Metric']) await expect(legend).toContainText(kind);
    await expect(legend.locator('li').filter({ hasText: 'Foreign key' })).toHaveCount(1);
    const orderId = card('Table orders').getByRole('button', {
      name: 'orders.order_id',
    });
    for (const badge of ['PK', 'Required']) await expect(orderId).toContainText(badge);
    await expect(
      card('Table orders').getByRole('button', {
        name: 'orders.customer_id',
      }),
    ).toContainText('FK');
  });
  await check('selecting a column emphasises its whole path within 200 ms and dims the rest; the path panel lists it in order', async () => {
    // The readable first view may leave outer cards off screen (they are not rendered); Fit
    // shows the whole path.
    await graph().getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(300);
    const ms = await page.evaluate(
      () =>
        new Promise<number>(res => {
          const button = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'orders.amount')!;
          const startedAt = performance.now();
          const obs = new MutationObserver(() => {
            if (document.querySelector('[aria-label="Lineage graph"] g[data-on-path="true"]')) {
              obs.disconnect();
              res(performance.now() - startedAt);
            }
          });
          obs.observe(document.body, {
            subtree: true,
            attributes: true,
            childList: true,
          });
          button.click();
        }),
    );
    console.log(`  highlight ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThanOrEqual(200);
    await expect(card('Table orders').getByRole('button', { name: 'orders.amount' })).toHaveAttribute('aria-pressed', 'true');
    // The orders dataset copies its table, so the amount column feeds Gross revenue directly,
    // and Gross revenue feeds the average order value.
    const onPath = (from: string, to: string) => graph().locator(`g[data-on-path="true"][data-from="${from}"][data-to="${to}"]`);
    await expect(onPath('object:commerce.odcs.yaml#orders/amount', 'metric:sales.ossie.yaml#/gross_revenue')).toHaveCount(1);
    await expect(onPath('metric:sales.ossie.yaml#/gross_revenue', 'metric:sales.ossie.yaml#/average_order_value')).toHaveCount(1);
    await expect(card('Table customers')).toHaveClass(/dim/);
    const panel = graph().getByRole('region', { name: 'Selected path' });
    await expect(panel).toContainText('orders.amount');
    await expect(panel).toContainText('Gross revenue');
    const items = await panel.locator('li').allTextContents();
    expect(items.findIndex(t => t.includes('orders.amount'))).toBeLessThan(items.findIndex(t => t.includes('Gross revenue')));
    await page.keyboard.press('Escape');
    await expect(graph().locator('g[data-on-path="true"]')).toHaveCount(0);
  });
  await check('walk: Walk here re-centres on customers, the trail records it, Back and Forward return; Find assets walks too', async () => {
    await card('Table customers').getByRole('button', { name: 'Walk here' }).click();
    await expect(card('Table customers')).toHaveClass(/center/);
    const trail = graph().getByLabel('Walk', { exact: true });
    await expect(trail.locator('li')).toHaveCount(2);
    await trail.getByRole('button', { name: 'Back' }).click();
    await expect(card('Table orders')).toHaveClass(/center/);
    await trail.getByRole('button', { name: 'Forward' }).click();
    await expect(card('Table customers')).toHaveClass(/center/);
    await graph().getByRole('textbox', { name: 'Find assets' }).fill('order_lines');
    await graph().getByRole('listbox', { name: 'Asset results' }).getByRole('option').first().click();
    await expect(card('Table order_lines')).toHaveClass(/center/);
    await expect(trail.locator('li')).toHaveCount(3);
    await trail.getByRole('button', { name: 'Back' }).click();
    await trail.getByRole('button', { name: 'Back' }).click();
  });
  await check('full screen: the canvas fills the window and Exit full screen restores it', async () => {
    await graph().getByRole('button', { name: 'Full screen' }).click();
    await expect.poll(async () => (await graph().boundingBox())!.height).toBeGreaterThan(860);
    await graph().getByRole('button', { name: 'Exit full screen' }).click();
    await expect.poll(async () => (await graph().boundingBox())!.height).toBeLessThan(860);
    await shots('commerce');
  });
  await check('mall: drawn lines match the expected edges both ways', async () => {
    await openContract('mall.odcs.yaml', examples.mall.name);
    expect(await compare('mall')).toBeGreaterThan(0);
    await shots('mall');
  });
  await check('UBL (169 tables): first view within 2 s, centred on the most connected table; drawn lines match; the card opens in place', async () => {
    const ms = await openContract('ubl.odcs.yaml', examples.ubl.name);
    console.log(`  first view ${ms} ms`);
    expect(ms).toBeLessThanOrEqual(2000);
    const center = graph().locator('.lineage-card.center');
    // party has the most foreign keys and metric reads; semantic copies of a table add none.
    await expect(center).toHaveAttribute('aria-label', 'Table party');
    expect(await renderedRowPx()).toBeGreaterThanOrEqual(12);
    // consignment is the widest table, so its card exercises the opened column list.
    await graph().getByRole('textbox', { name: 'Find assets' }).fill('consignment');
    await graph().getByRole('listbox', { name: 'Asset results' }).getByRole('option').filter({ hasText: 'Table' }).first().click();
    await expect(center).toHaveAttribute('aria-label', 'Table consignment');
    // Opening the group adds connected handles to an already expanded column list.
    await expect(center.getByRole('navigation')).toHaveCount(0);
    await center.getByRole('button', { name: /^Show all \d+ columns of consignment/ }).click();
    const list = center.getByRole('region', {
      name: 'Columns of consignment',
    });
    await expect(list).toBeVisible();
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
    await expect(list).toBeVisible();
    await compare('ubl');
    await shots('ubl');
  });
  await check('UBL: the first view is readable (column names ≥ 12 px) at 1280×720 and 1440×900', async () => {
    await firstViewReadable('ubl.odcs.yaml', examples.ubl.name, 'UBL');
  });

  const cardPositions = () =>
    graph()
      .locator('.react-flow__node')
      .evaluateAll(ns => Object.fromEntries(ns.map(n => [n.getAttribute('data-id'), (n as HTMLElement).style.transform])));
  await check('UBL: Expand on a card adds its neighbours beside it; placed cards do not move; Undo expansion restores the canvas', async () => {
    await graph().getByRole('textbox', { name: 'Find assets' }).fill('invoice_line');
    await graph().getByRole('listbox', { name: 'Asset results' }).getByRole('option').filter({ hasText: 'Table' }).first().click();
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
    for (const [id, position] of Object.entries(before)) expect(after[id], `${id} moved`).toBe(position);
    await graph().getByRole('button', { name: 'Undo expansion' }).click();
    await page.waitForTimeout(600);
    await fit();
    expect(Object.keys(await cardPositions()).sort()).toEqual(Object.keys(before).sort());
  });
  await check('UBL invoice_line.line_extension_amount: Show all connected (Both) opens every card on its upstream and downstream path, highlighted', async () => {
    const files = readdirSync('public/examples/ubl')
      .filter(f => /\.ya?ml$/.test(f))
      .map(f => ({
        path: f,
        data: parse(readFileSync(`public/examples/ubl/${f}`, 'utf8')),
      }));
    const lineageGraph = buildLineage(files, 'ubl.odcs.yaml');
    const col = 'object:ubl.odcs.yaml#invoice_line/line_extension_amount';
    const want = lineagePierce({
      edges: lineageGraph.edges.map(e => [e.from, e.to] as [string, string]),
      owners: Object.fromEntries([...lineageGraph.cards.values()].flatMap(c => c.columns.map(x => [x.id, c.id]))),
      start: selectionNodes(lineageGraph, col),
      direction: 'both',
      budget: 150,
    });
    await graph().getByRole('textbox', { name: 'Find assets' }).fill('line_extension_amount');
    await graph().getByRole('listbox', { name: 'Asset results' }).getByRole('option').filter({ hasText: 'Column' }).filter({ hasText: 'invoice_line.line_extension_amount' }).first().click();
    await expect(graph().getByRole('region', { name: 'Selected path' })).toBeVisible();
    await graph().getByRole('button', { name: 'Show all connected' }).click();
    await expect(graph().getByLabel('Walk', { exact: true })).toContainText('All connected to line_extension_amount');
    await page.waitForTimeout(600);
    await fit();
    const ids = await graph()
      .locator('.lineage-card')
      .evaluateAll(ns => ns.map(n => n.getAttribute('data-id')));
    for (const cardId of want.cards) expect(ids).toContain(cardId);
    expect(await graph().locator('g[data-on-path="true"]').count()).toBeGreaterThan(0);
    await expect(page.locator('.pierce-banner')).toContainText(`${want.cards.length} cards shown`);
    await page.screenshot({ path: '/tmp/workbench-lineage-pierce.png' });
  });
  await check('graph: at four sizes the first view of three contracts has whole cards, readable column names, clear lines and labels, and a legend', async () => {
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
        // No card waits behind a control: the cards past the first view are laid out and Fit
        // brings them all on screen.
        await expect(page.getByRole('button', { name: /cards shown/ }), `${where} has no hidden-card control`).toHaveCount(0);
        const before = await page.locator('.lineage-card').count();
        await fit();
        expect(await page.locator('.lineage-card').count(), `${where} Fit`).toBeGreaterThanOrEqual(before);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('mall: expanding the "N more tables" card in the first view lays every member out, with no hidden-card control', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('mall.odcs.yaml', examples.mall.name);
    await fit();
    const group = graph().locator('.lineage-card.group').first();
    await expect(group).toContainText('more tables');
    const members = Number(/(\d+) more/.exec((await group.textContent()) ?? '')?.[1]);
    const before = await graph().locator('.lineage-card').count();
    await group.getByRole('button', { name: /^Expand / }).click();
    await expect
      .poll(async () => {
        await fit();
        return graph().locator('.lineage-card').count();
      })
      .toBeGreaterThanOrEqual(before - 1 + members);
    await expect(page.getByRole('button', { name: /cards shown/ })).toHaveCount(0);
  });
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
  await check('graph: a card opens in place with a filter and Show fewer; its lines stay on their rows, and rows out of view keep a marker', async () => {
    // consignment has more than 30 columns, so its opened card carries a filter box.
    await graph().getByRole('textbox', { name: 'Find assets' }).fill('consignment');
    await graph().getByRole('listbox', { name: 'Asset results' }).getByRole('option').filter({ hasText: 'Table' }).first().click();
    await expect(card('Table consignment')).toHaveClass(/center/);
    await page.waitForTimeout(600);
    const center = graph().locator('.lineage-card.center');
    const centreName = ((await center.getAttribute('aria-label')) ?? '').replace('Table ', '');
    const more = center.getByRole('button', {
      name: /^Show all \d+ columns of /,
    });
    await more.click();
    const list = center.getByRole('region', {
      name: `Columns of ${centreName}`,
    });
    await expect(list).toBeVisible();
    await expect(center.getByRole('searchbox', { name: /^Filter columns of/ })).toBeVisible();
    await page.waitForTimeout(500);
    const top = await anchorReport(page, `Table ${centreName}`);
    expect(top.problems).toEqual([]);
    expect(top.onRow).toBeGreaterThan(0);
    expect(top.onEdge).toBeGreaterThan(0);
    await list.evaluate(el => {
      el.scrollTop = 400;
    });
    await page.waitForTimeout(500);
    const scrolled = await anchorReport(page, `Table ${centreName}`);
    expect(scrolled.problems).toEqual([]);
    // Scrolling moves connected rows out of view, and each keeps a marker at the list edge.
    expect(top.markers + scrolled.markers).toBeGreaterThan(0);
    // The filter narrows the list; clearing it brings every column back.
    const filter = center.getByRole('searchbox', {
      name: /^Filter columns of/,
    });
    await filter.fill('carrier');
    await expect(center.getByText(/\d+ of \d+ columns/)).toBeVisible();
    await filter.fill('');
    await center.getByRole('button', { name: 'Show fewer' }).click();
    await expect(list).toHaveCount(0);
    await expect(more).toBeVisible();
    expect(await paginationControls(page)).toBe(0);
  });
  await check('graph: a bundle of lines is labelled once and no label repeats the word lines', async () => {
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
  });
  await check('graph: clicking a line shows its relationships, and a card stays drawn when it shows more columns', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('mall.odcs.yaml', examples.mall.name);
    await fit();
    // A single foreign-key line selects its relationship: both columns join the selected path.
    const foreignKey = 'g.lineage-edge[data-edge-kind="foreign-key"][data-count="1"]';
    const fkFrom = await graph().locator(foreignKey).first().getAttribute('data-from');
    const fkTo = await graph().locator(foreignKey).first().getAttribute('data-to');
    await clickLine(`[aria-label="Lineage graph"] ${foreignKey}`);
    const selectedLine = graph().locator(`g.lineage-edge[data-from="${fkFrom}"][data-to="${fkTo}"]`);
    await expect(selectedLine).toHaveAttribute('data-on-path', 'true');
    const selectedPath = page.getByRole('region', { name: 'Selected path' });
    await expect(selectedPath).toBeVisible();
    const columnLabel = (id: string) => id.slice(id.indexOf('#') + 1).replace('/', '.');
    await expect(selectedPath).toContainText(columnLabel(fkFrom!));
    await expect(selectedPath).toContainText(columnLabel(fkTo!));
    await selectedPath.getByRole('button', { name: 'Clear the selected path' }).click();
    await expect(selectedLine).toHaveAttribute('data-on-path', 'false');
    await fit();
    // A line to a counted card opens that card, as its own Expand button does.
    const toGroup = 'g.lineage-edge[data-to^="group:"], g.lineage-edge[data-from^="group:"]';
    const groupCard = graph().locator('.lineage-card[data-id^="group:"]');
    const cardIds = () =>
      graph()
        .locator('.lineage-card')
        .evaluateAll(cards => cards.map(card => card.getAttribute('data-id')));
    expect(await groupCard.count(), JSON.stringify(await cardIds())).toBe(1);
    await clickLine(`[aria-label="Lineage graph"] :is(${toGroup})`);
    await expect(groupCard).toHaveCount(0);
    // A bundled line splits into the separate lines it stands for.
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('wide.odcs.yaml', wide.name);
    await fit();
    const bundled = graph().locator('g.lineage-edge[data-count="9"]');
    await expect(bundled).toHaveCount(1);
    await clickLine('[aria-label="Lineage graph"] g.lineage-edge[data-count="9"]');
    await expect(bundled).toHaveCount(0);
    await expect(graph().locator('g.lineage-edge[data-edge-kind="reads"]')).toHaveCount(9);
    // A card that is not the centre keeps drawing, with lines on its rows, when it shows more
    // columns.
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('mall.odcs.yaml', examples.mall.name);
    await fit();
    const side = graph()
      .locator('.lineage-card:not(.center)')
      .filter({
        has: page.getByRole('button', { name: /^Show all \d+ columns of / }),
      })
      .first();
    const sideName = (await side.getAttribute('aria-label'))!;
    await side.getByRole('button', { name: /^Show all \d+ columns of / }).click();
    await page.waitForTimeout(1200);
    const opened = card(sideName);
    await expect(opened).toBeVisible();
    const hidden = await opened.evaluate(element => getComputedStyle(element.closest('.react-flow__node')!).visibility === 'hidden');
    expect(hidden, `${sideName} is hidden after showing more columns`).toBe(false);
    const anchors = await anchorReport(page, sideName);
    expect(anchors.problems).toEqual([]);
  });
  await check('foreign-key hops: the hop control, the path line and the list of keys read as sentences at four sizes', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('commerce.odcs.yaml', 'Commerce workspace');
    const hops = graph().getByRole('group', {
      name: 'How far to follow foreign keys',
    });
    await expect(hops.getByRole('button', { name: '1 hop' })).toHaveAttribute('aria-pressed', 'true');
    await hops.getByRole('button', { name: '2 hops' }).click();
    await expect(hops.getByRole('button', { name: '2 hops' })).toHaveAttribute('aria-pressed', 'true');
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
      const dialog = page.getByRole('dialog', {
        name: 'Foreign keys in this view',
      });
      await expect(dialog).toContainText('orders.customer_id → customers.customer_id');
      await expect(dialog).toContainText('orders references customers');
      expect(await smallTextProblems(page, 'dialog[open]')).toEqual([]);
      expect(await textCollisionProblems(page, 'dialog[open]')).toEqual([]);
      expect(await layoutProblems(page)).toEqual([]);
      await dialog.getByRole('button', { name: 'Done' }).click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await check('graph: opening a bundled line keeps its cards on screen, at a group card and between cards', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('mall.odcs.yaml', examples.mall.name);
    await centreOn('properties');
    const bundleToGroup = 'g.lineage-edge[data-count]:not([data-count="1"]):is([data-to^="group:"], [data-from^="group:"])';
    await clickLine(`[aria-label="Lineage graph"] ${bundleToGroup}`);
    await expect(graph().locator('.lineage-card[data-id^="group:"]')).toHaveCount(0);
    await page.waitForTimeout(1200);
    const afterGroup = await cardsInView();
    expect(afterGroup.inView, JSON.stringify(afterGroup)).toBeGreaterThan(1);
    expect(afterGroup.centreInView, 'the centre card stays on screen').toBe(true);
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('wide.odcs.yaml', wide.name);
    await fit();
    await clickLine('[aria-label="Lineage graph"] g.lineage-edge[data-count="9"]');
    await page.waitForTimeout(600);
    const afterSplit = await cardsInView();
    expect(afterSplit.inView, JSON.stringify(afterSplit)).toBeGreaterThan(1);
  });
  await check('graph: a card that shows more columns stays whole inside the canvas', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('mall.odcs.yaml', examples.mall.name);
    await centreOn('portfolios');
    const organizations = card('Table organizations');
    await organizations.getByRole('button', { name: /^Show all \d+ columns of / }).click();
    await page.waitForTimeout(1200);
    const box = await organizations.boundingBox();
    const pane = await graph().locator('.react-flow').boundingBox();
    expect(box && pane, 'the opened card and the canvas are drawn').toBeTruthy();
    expect(box!.y, 'top edge').toBeGreaterThanOrEqual(pane!.y);
    const fits = box!.height <= pane!.height;
    const bottom = fits ? box!.y + box!.height : box!.y;
    expect(bottom, fits ? 'bottom edge' : 'top of a tall card').toBeLessThanOrEqual(pane!.y + pane!.height);
  });
  await check('graph: the Semantic dataset badge sits on the type row and no table name is cut', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview' }).click();
    await openContract('commerce.odcs.yaml', 'Commerce workspace');
    await fit();
    const cut = await graph().evaluate(root => {
      const badged = [...root.querySelectorAll('.lineage-card')].filter(candidate => candidate.querySelector('.prop-badge.b-semantic'));
      return {
        badged: badged.length,
        offTypeRow: badged.filter(candidate => !candidate.querySelector('.lineage-card-kind .prop-badge.b-semantic')).length,
        cutNames: badged
          .map(candidate => candidate.querySelector('.lineage-card-title strong')!)
          .filter(name => name.scrollWidth > name.clientWidth)
          .map(name => name.textContent),
      };
    });
    expect(cut.badged).toBeGreaterThan(0);
    expect(cut.offTypeRow).toBe(0);
    expect(cut.cutNames).toEqual([]);
  });
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} lineage checks passed on isolated data root ${api.root}.`);
} catch (error) {
  await page.screenshot({ path: '/tmp/workbench-lineage-failure.png' });
  console.log('browser errors:', errors.join('\n').slice(0, 3000));
  throw error;
} finally {
  await browser.close();
  await api.stop();
}

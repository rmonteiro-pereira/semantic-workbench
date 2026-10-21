import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { treeRowProblems } from './helpers/tree-geometry';
import { neighborhoodEdgeProblems, neighborhoodState, pickCenter } from './helpers/edge-geometry';
import { inspect } from '../src/model';
import { layoutProblems } from './helpers/layout-geometry';

// Isolated API fixture: exercising viewport changes never modifies the local workspace.
// The UBL ontology is imported first so that it opens first.
const api = await startIsolatedApi();
await api.ws.importBatch({ files: [{ path: 'ubl.ontology.yaml', source: await Bun.file('public/examples/ubl/ubl.ontology.yaml').text() }] });
await api.ws.importBatch({ files: await Promise.all(['commerce.odcs.yaml', 'sales.ossie.yaml'].map(async path => ({ path, source: await Bun.file(`public/examples/commerce/${path}`).text() }))) });
const ublModel = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text(), 'ubl.ontology.yaml');
const name40 = ublModel.entities.find(e => e.id === 'ontology/40')!.name;
const centerOf = async (page: Page) => (await neighborhoodState(page)).center;
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
let passed = 0;
async function check(name: string, action: () => Promise<void>) {
  await action();
  console.log('PASS', name);
  passed++;
}
async function openPage(width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', error => errors.push(`${width}×${height}: ${error.message}`));
  await routeApi(page, api);
  await page.goto(process.env.UI_URL ?? 'http://127.0.0.1:5173/');
  await expect(page.locator('h1')).toContainText('UBL');
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
  return page;
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(size.document).toBeLessThanOrEqual(size.viewport + 1);
}
async function visibleGraph(page: Page) {
  const canvas = page.locator('.react-flow');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => page.locator('.react-flow__node').evaluateAll(nodes => {
    const parent = document.querySelector('.react-flow')!.getBoundingClientRect();
    return nodes.filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && rect.right > parent.left && rect.left < parent.right && rect.bottom > parent.top && rect.top < parent.bottom;
    }).length;
  }), { timeout: 15_000, message: 'At least one measured graph node intersects the actual canvas' }).toBeGreaterThan(0);
}
async function clickVisibleEdge(page: Page) {
  let point: { x: number; y: number } | null = null;
  await expect.poll(async () => { point = await page.locator('.react-flow__edge-interaction').evaluateAll(paths => {
    for (const element of paths) {
      const path = element as SVGPathElement;
      const transform = path.getScreenCTM();
      if (!transform) continue;
      for (let sample = 1; sample < 30; sample++) {
        const local = path.getPointAtLength(path.getTotalLength() * sample / 30);
        const x = transform.a * local.x + transform.c * local.y + transform.e;
        const y = transform.b * local.x + transform.d * local.y + transform.f;
        if (document.elementFromPoint(x, y)?.closest('.react-flow__edge') === path.closest('.react-flow__edge')) return { x, y };
      }
    }
    return null;
  }); return !!point; }, { timeout: 10000, message: 'Relationship hit area becomes accessible after fit animation' }).toBe(true);
  await page.mouse.click(point!.x, point!.y);
}
try {
  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [1024, 768], [390, 844]]) {
    const page = await openPage(width!, height!);
    const desktop = width! >= 1100;
    await check(`${width}×${height}: compact shell, graph real estate and contained controls`, async () => {
      const header = await page.locator('main > header.workspace-header').boundingBox();
      expect(header).not.toBeNull();
      expect(header!.height).toBeLessThanOrEqual(desktop ? 64 : 110);
      const graph = await page.locator('.react-flow').boundingBox();
      expect(graph).not.toBeNull();
      expect(graph!.height).toBeGreaterThan(height! * (desktop ? .7 : .55));
      expect(graph!.width).toBeGreaterThan(desktop ? width! * .5 : width! * .7);
      await noOverflow(page);
      await visibleGraph(page);
      await expect(page.getByRole('button', { name: desktop ? 'Close workspace' : 'Open workspace', exact: true })).toBeVisible();
      await page.screenshot({ path: `/tmp/workbench-responsive-${width}x${height}.png` });
    });
    await check(`${width}×${height}: workspace toggle preserves graph and document access`, async () => {
      const before = (await page.locator('.react-flow').boundingBox())!.width;
      if (desktop) {
        await page.getByRole('button', { name: 'Close workspace', exact: true }).click();
        await expect.poll(async () => (await page.locator('.react-flow').boundingBox())!.width).toBeGreaterThan(before + 150);
      }
      await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      await expect(page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: /Load UBL business model/ })).toBeVisible();
      await expect(page.locator('input[type=file]')).toHaveCount(1);
      // Project tree rows: name, delete icon and menu stay side by side at every viewport.
      await expect(page.getByRole('button', { name: 'Delete ubl.ontology.yaml', exact: true })).toBeVisible();
      expect(await treeRowProblems(page)).toEqual([]);
      if (width === 390) await page.screenshot({ path: '/tmp/workbench-responsive-drawer-390.png' });
      if (desktop) await page.getByRole('button', { name: 'Close workspace', exact: true }).click();
      else await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Open workspace', exact: true })).toBeVisible();
      await visibleGraph(page);
      await noOverflow(page);
    });
    await check(`${width}×${height}: neighborhood center, inspector and repeated view transitions work`, async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
      await pickCenter(page, name40);
      await expect.poll(() => centerOf(page)).toBe('ontology/40');
      await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
      if (desktop) {
        await page.getByRole('button', { name: 'Labels off', exact: true }).click();
        await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
        await page.getByRole('button', { name: 'Labels on', exact: true }).click();
      }
      if (width === 1280) await page.screenshot({ path: '/tmp/workbench-responsive-neighborhood-1280.png' });
      const focused = page.locator('.react-flow__node[data-id="ontology/40"]');
      await expect(focused).toBeVisible();
      await visibleGraph(page);
      await expect.poll(async () => {
        const bounds = await focused.boundingBox();
        return bounds ? Math.min(bounds.width, bounds.height) : 0;
      }).toBeGreaterThan(10);
      await expect(page.locator('.inspector h2')).toBeInViewport();
      if (!desktop) await page.getByRole('button', { name: 'Close details', exact: true }).click();
      const neighbor = page.locator('.react-flow__node:not([data-id="ontology/40"])').first();
      const neighborId = await neighbor.getAttribute('data-id');
      await neighbor.click();
      await expect.poll(() => centerOf(page)).toBe(neighborId);
      await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
      await expect(page.locator('.inspector h2')).toBeInViewport();
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      await expect(page.locator('.inspector')).toHaveCount(0);
      for (let index = 0; index < 3; index++) {
        await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
        await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
        await visibleGraph(page);
        await page.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
        await visibleGraph(page);
      }
      await noOverflow(page);
    });
    if (desktop) await check(`${width}×${height}: relationship inspection closes and restores canvas width`, async () => {
      const before = (await page.locator('.react-flow').boundingBox())!.width;
      await clickVisibleEdge(page);
      await expect(page.locator('.inspector h2')).toBeInViewport();
      await expect(page.locator('.relationship-details')).toBeVisible();
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      await expect(page.locator('.inspector')).toHaveCount(0);
      await expect.poll(async () => (await page.locator('.react-flow').boundingBox())!.width).toBeGreaterThanOrEqual(before - 1);
    });
    await page.close();
  }
  const page = await openPage(1920, 1080);
  await check('overview-selected entity becomes neighborhood center and survives desktop resizing', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
    await page.locator('[data-entity-id="ontology/40"]').click();
    await page.getByRole('button', { name: 'Neighborhood', exact: true }).last().click();
    await expect.poll(() => centerOf(page)).toBe('ontology/40');
    await expect(page.locator('.react-flow__node[data-id="ontology/40"]')).toBeVisible();
    await page.getByRole('button', { name: 'Close details', exact: true }).click();
    for (const [width, height] of [[1280, 720], [2560, 1440], [1366, 768]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await visibleGraph(page);
      await noOverflow(page);
      await expect.poll(() => centerOf(page)).toBe('ontology/40');
      await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
    }
  });
  await page.close();
  // Full screen (FR-066): Graph and Neighborhood fill the screen, details open over the graph, and
  // Escape (or the exit control) restores the earlier layout, zoom and selection.
  const transform = (p: Page) => p.locator('.react-flow__viewport').first().evaluate(el => getComputedStyle(el).transform);
  const fsPage = await openPage(1440, 900);
  await check('full screen: Graph fills the screen, details overlay it, Escape restores zoom and selection', async () => {
   await fsPage.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
   await expect(fsPage.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
   await fsPage.getByRole('button', { name: 'Fit model' }).click();
   await fsPage.mouse.move(700, 500); await fsPage.mouse.wheel(0, -240);
   await expect.poll(() => transform(fsPage)).not.toBe('none');
   await fsPage.waitForTimeout(400);
   const before = await transform(fsPage);
   await fsPage.getByRole('button', { name: 'Enter full screen' }).click();
   await expect(fsPage.locator('.canvas-row.is-fullscreen')).toBeVisible();
   await expect.poll(async () => { const b = (await fsPage.locator('.canvas-row').boundingBox())!; return Math.round(b.width) >= 1438 && Math.round(b.height) >= 898; }).toBe(true);
   await expect.poll(() => transform(fsPage)).not.toBe(before);
   await fsPage.locator('.react-flow__node-entity').first().click();
   const inspector = fsPage.locator('.inspector');
   await expect(inspector).toBeVisible();
   const selectedName = await fsPage.locator('.inspector h2').textContent();
   // Details sit over the graph: the graph keeps the full width.
   expect((await fsPage.locator('.react-flow').boundingBox())!.width).toBeGreaterThan(1400);
   expect(await layoutProblems(fsPage)).toEqual([]);
   await fsPage.screenshot({ path: '/tmp/workbench-fullscreen-graph.png' });
   await fsPage.keyboard.press('Escape');
   await expect(fsPage.locator('.canvas-row.is-fullscreen')).toHaveCount(0);
   await expect.poll(() => transform(fsPage), { timeout: 3000 }).toBe(before);
   await expect(fsPage.locator('.inspector h2')).toHaveText(selectedName!);
   await fsPage.getByRole('button', { name: 'Close details', exact: true }).click();
  });
  await check('full screen: the F key works in Neighborhood, and the exit control restores the view', async () => {
   await fsPage.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
   await pickCenter(fsPage, name40);
   await expect.poll(() => centerOf(fsPage)).toBe('ontology/40');
   await fsPage.waitForTimeout(400);
   const before = await transform(fsPage);
   await fsPage.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
   await fsPage.keyboard.press('f');
   await expect(fsPage.locator('.canvas-row.is-fullscreen')).toBeVisible();
   await expect.poll(() => neighborhoodEdgeProblems(fsPage)).toEqual([]);
   await fsPage.screenshot({ path: '/tmp/workbench-fullscreen-neighborhood.png' });
   await fsPage.getByRole('button', { name: 'Exit full screen' }).click();
   await expect(fsPage.locator('.canvas-row.is-fullscreen')).toHaveCount(0);
   await expect.poll(() => transform(fsPage), { timeout: 3000 }).toBe(before);
   await expect.poll(() => centerOf(fsPage)).toBe('ontology/40');
   // Full screen belongs to the graph views: other tabs have no control and F does nothing there.
   await fsPage.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
   await expect(fsPage.getByRole('button', { name: 'Enter full screen' })).toHaveCount(0);
   await fsPage.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
   await fsPage.keyboard.press('f');
   await expect(fsPage.locator('.canvas-row.is-fullscreen')).toHaveCount(0);
  });
  await fsPage.close();
  // Resize sweep (FR-067): every view reflows across the viewport matrix and on resize between
  // sizes, with no horizontal page scroll and no control cut off.
  const sweep = await openPage(1440, 900);
  const sizes: [number, number][] = [[2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [800, 900], [390, 844], [1440, 900]];
  async function tab(p: Page, name: string) {
   if (!(await p.locator('.tabs').isVisible())) return;
   await p.locator('.tabs').getByRole('button', { name, exact: true }).click();
  }
  async function sidebarNav(p: Page, name: RegExp) {
   const open = p.getByRole('button', { name: 'Open workspace', exact: true });
   if (await open.isVisible()) await open.click();
   await p.getByRole('button', { name }).click();
  }
  async function openFile(p: Page, path: string) {
   const open = p.getByRole('button', { name: 'Open workspace', exact: true });
   if (await open.isVisible()) await open.click();
   await p.getByRole('button', { name: path, exact: true }).click();
  }
  const views: [string, (p: Page) => Promise<void>][] = [
   ['Graph', async p => { await openFile(p, 'ubl.ontology.yaml'); await tab(p, 'Graph'); await expect(p.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 }); }],
   ['Neighborhood', async p => tab(p, 'Neighborhood')],
   ['Overview', async p => tab(p, 'Overview')],
   ['Catalog', async p => tab(p, 'Catalog')],
   ['Source', async p => tab(p, 'Source')],
   ['Mappings', async p => tab(p, 'Mappings')],
   ['Metrics', async p => { await openFile(p, 'sales.ossie.yaml'); await p.locator('.tabs').getByRole('button', { name: /^Metrics/ }).click(); }],
   ['Contract', async p => { await openFile(p, 'commerce.odcs.yaml'); await tab(p, 'Contract'); await expect(p.getByRole('region', { name: 'Contract overview' })).toBeVisible(); }],
   ['Dataset page', async p => { await p.getByRole('button', { name: 'Open orders', exact: true }).click(); await expect(p.getByRole('region', { name: 'Dataset orders' })).toBeVisible(); }],
   ['Source control', async p => { await sidebarNav(p, /^Source control/); await expect(p.getByRole('region', { name: 'Source Control' })).toBeVisible(); }],
  ];
  for (const [view, show] of views) {
   await check(`resize sweep: ${view} reflows at every size without horizontal scroll or cut-off controls`, async () => {
    await sweep.setViewportSize({ width: 1440, height: 900 });
    await show(sweep);
    const found: string[] = [];
    for (const [width, height] of sizes) {
     await sweep.setViewportSize({ width, height });
     await sweep.waitForTimeout(250);
     for (const problem of await layoutProblems(sweep)) found.push(`${width}×${height}: ${problem}`);
     // Review screenshots at the four reference sizes (phone, small laptop, laptop, wide screen).
     if ([390, 1280, 1440, 2560].includes(width)) await sweep.screenshot({ path: `/tmp/workbench-sweep-${view.toLowerCase().replace(/ /g, '-')}-${width}.png` });
    }
    expect(found).toEqual([]);
   });
  }
  await sweep.close();
  await check('no uncaught browser errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} responsive UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}

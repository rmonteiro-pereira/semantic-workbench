import { chromium, expect, type Page } from '@playwright/test';
import { createStore } from '../server/store';
import { createHandler } from '../server/handler';

// Isolated API fixture: exercising viewport changes never modifies the local workspace.
const store = createStore(':memory:');
for (const [folder, filename] of [
  ['commerce', 'commerce.odcs.yaml'],
  ['commerce', 'sales.ossie.yaml'],
  ['ubl', 'ubl.ontology.yaml'],
] as const) store.save(filename, await Bun.file(`public/examples/${folder}/${filename}`).text());
const handler = createHandler(store);
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
  await page.route('**/api/**', async route => {
    const request = route.request();
    const method = request.method();
    const response = await handler(new Request(request.url(), {
      method, ...(method === 'GET' || method === 'HEAD' ? {} : { body: request.postData() }),
    }));
    await route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' });
  });
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
      if (width === 390) await page.screenshot({ path: '/tmp/workbench-responsive-drawer-390.png' });
      if (desktop) await page.getByRole('button', { name: 'Close workspace', exact: true }).click();
      else await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Open workspace', exact: true })).toBeVisible();
      await visibleGraph(page);
      await noOverflow(page);
    });
    await check(`${width}×${height}: neighborhood center, inspector and repeated view transitions work`, async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
      const center = page.getByLabel('Neighborhood center', { exact: true });
      await center.selectOption('ontology/40');
      await expect(center).toHaveValue('ontology/40');
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
      await expect(center).toHaveValue(neighborId!);
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
    await expect(page.getByLabel('Neighborhood center', { exact: true })).toHaveValue('ontology/40');
    await expect(page.locator('.react-flow__node[data-id="ontology/40"]')).toBeVisible();
    await page.getByRole('button', { name: 'Close details', exact: true }).click();
    for (const [width, height] of [[1280, 720], [2560, 1440], [1366, 768]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await visibleGraph(page);
      await noOverflow(page);
      await expect(page.getByLabel('Neighborhood center', { exact: true })).toHaveValue('ontology/40');
    }
  });
  await page.close();
  await check('no uncaught browser errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} responsive UI checks passed`);
} finally {
  await browser.close();
}

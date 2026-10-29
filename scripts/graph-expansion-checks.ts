import { expect, type Browser, type Page } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { revealGraphControls } from './helpers/graph-options';
import { routeApi, type IsolatedApi } from './helpers/isolated-api';

async function recordViewportChanges(page: Page) {
  await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.neighborhood-canvas .react-flow__viewport');
    if (!viewport) throw new Error('Neighborhood viewport is missing.');
    const canvas = viewport.closest<HTMLElement>('.neighborhood-canvas')!;
    const initialCount = Number(canvas.dataset.canvasNodes);
    const observations: number[] = [];
    const state = window as typeof window & { expansionZooms: number[] };
    state.expansionZooms = observations;
    new MutationObserver(() => {
      // Worker startup may resize the old canvas before the expansion reaches the page.
      if (Number(canvas.dataset.canvasNodes) <= initialCount) return;
      const scale = viewport.style.transform.match(/scale\(([^)]+)\)/);
      if (scale) observations.push(Number(scale[1]));
    }).observe(viewport, { attributes: true, attributeFilter: ['style'] });
  });
}

async function openExpansionModel(page: Page, api: IsolatedApi) {
  await routeApi(page, api);
  await page.goto(appUrl());
  const workspace = page.getByRole('button', { name: 'Open workspace', exact: true });
  if ((page.viewportSize()?.width ?? 0) < 1100) await workspace.click();
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: 'commerce-scale.ttl', exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Neighborhood', exact: true }).click();
  await expect(page.locator('.neighborhood-canvas .react-flow__node.center')).toBeVisible();
  await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
  await revealGraphControls(page);
  await page.getByRole('radiogroup', { name: 'Pierce direction' }).getByRole('radio', { name: 'Both' }).click();
}

async function checkExpansion(page: Page, api: IsolatedApi) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openExpansionModel(page, api);
  await recordViewportChanges(page);
  await page.getByRole('button', { name: 'Show all connected' }).click();
  await expect(page.locator('.pierce-banner')).toContainText('more reachable');
  await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window as typeof window & { expansionZooms: number[] };
        return state.expansionZooms.length;
      }),
    )
    .toBeGreaterThan(0);
  const zooms = await page.evaluate(() => {
    const state = window as typeof window & { expansionZooms: number[] };
    return state.expansionZooms;
  });
  expect(zooms.length).toBeGreaterThan(0);
  expect(Math.min(...zooms)).toBeGreaterThanOrEqual(1);
  const canvas = await page.locator('.neighborhood-canvas').boundingBox();
  expect(canvas?.width).toBeGreaterThan(0);
  expect(canvas?.height).toBeGreaterThan(0);
  expect(errors).toEqual([]);
}

/** Checks that expansions retain readable zoom without an intermediate fit-all viewport. */
export async function checkExpansionViewports(browser: Browser, api: IsolatedApi) {
  const sizes = [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ];
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme });
      try {
        await checkExpansion(page, api);
        console.log(`PASS expansion viewport: ${colorScheme} ${width}×${height} stays readable`);
      } finally {
        await page.close();
      }
    }
  }
}

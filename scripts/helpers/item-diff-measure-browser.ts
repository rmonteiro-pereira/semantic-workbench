import { chromium, expect, type Page } from '@playwright/test';
import { appUrl } from './base-url';
import { routeApi, startIsolatedApi } from './isolated-api';
import { itemDiffTab, setItemDiffOverlay } from './item-diff-browser';
import { measurementFixture } from './item-diff-measurement-fixture';

/** Measures the middle observed elapsed time in a sample of comparable runs. */
export function median(samples: number[]) {
  return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
}

async function graphShown(page: Page, enabled: boolean) {
  const started = performance.now();
  await itemDiffTab(page, 'Graph');
  const expand = page.getByRole('button', { name: 'Expand all', exact: true });
  if (await expand.isEnabled()) await expand.click();
  await expect(page.locator('.full-graph .react-flow__node-entity')).toHaveCount(500, { timeout: 60_000 });
  await expect(page.locator('.full-graph .item-change-mark')).toHaveCount(enabled ? 25 : 0);
  return performance.now() - started;
}

/** Times the visible 500-entity graph through the browser with the overlay off and on. */
export async function measureBrowserGraph(path: string) {
  const { fixture } = await measurementFixture(path, 500);
  fixture.ws.close();
  const api = await startIsolatedApi({ root: fixture.root });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await routeApi(page, api, async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith('/item-diff')) return false;
      const response = await api.handler(new Request('http://localhost:5173' + url.pathname + url.search, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
      await route.fulfill({ status: response.status, body: await response.text(), headers: Object.fromEntries(response.headers) });
      return true;
    });
    await page.goto(appUrl());
    await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: path, exact: true }).click();
    await graphShown(page, true);
    const off: number[] = [];
    const on: number[] = [];
    for (const enabled of [false, true, false, true, false, true]) {
      await setItemDiffOverlay(page, enabled);
      await itemDiffTab(page, 'Catalog');
      const duration = await graphShown(page, enabled);
      (enabled ? on : off).push(duration);
    }
    return { off: median(off), on: median(on) };
  } finally {
    await browser.close();
    await api.stop();
    fixture.dispose();
  }
}

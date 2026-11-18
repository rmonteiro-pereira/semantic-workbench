/** Checks first-view representation and area framing against isolated, completed browser layouts. */
import { expect, type Browser, type Page } from '@playwright/test';
import { appUrl } from './base-url';
import { routeApi, type IsolatedApi } from './isolated-api';
import { fileTab } from './screen-tour';
import { chooseLayout, viewOptions } from './graph-options';

async function minimumName(page: Page) {
  return page.locator('.full-graph').evaluate(graph => {
    const viewport = graph.querySelector('.react-flow__viewport')!;
    const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a;
    return Math.min(...[...graph.querySelectorAll('.full-entity strong')].map(name => Number.parseFloat(getComputedStyle(name).fontSize) * zoom));
  });
}

async function checkNetworkRepresentation(page: Page, filename: string) {
  const named = page.locator('.full-entity:not(.collapsed)');
  const counted = page.locator('.full-entity.collapsed');
  if (filename === 'ubl.ontology.yaml') {
    await expect(named).toHaveCount(45);
    await expect(counted).toHaveCount(0);
    const fill = await page.locator('.full-graph .react-flow').evaluate(canvas => {
      const pane = canvas.getBoundingClientRect();
      const areas = [...canvas.querySelectorAll('.react-flow__node-businessArea')].map(area => area.getBoundingClientRect());
      const width = Math.max(...areas.map(area => area.right)) - Math.min(...areas.map(area => area.left));
      const height = Math.max(...areas.map(area => area.bottom)) - Math.min(...areas.map(area => area.top));
      return Math.max(width / pane.width, height / pane.height);
    });
    expect(fill).toBeGreaterThanOrEqual(0.8);
  }
  const width = page.viewportSize()!.width;
  if (filename === 'mall.ontology.yaml' && (width === 1280 || width === 1440)) {
    await expect(named).toHaveCount(0);
    expect(await counted.count()).toBeGreaterThan(0);
  }
}

async function checkOpening(page: Page, filename: string, layout: 'network' | 'layered') {
  const started = Date.now();
  await fileTab(filename, 'Graph')(page);
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  if (layout === 'layered') {
    await viewOptions(page, options => chooseLayout(options, layout));
    await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  }
  await expect.poll(() => minimumName(page)).toBeGreaterThanOrEqual(9);
  const openingName = await minimumName(page);
  const graph = page.locator('.full-graph');
  const measured = Number(await graph.getAttribute('data-opening-name-px'));
  const passes = Number(await graph.getAttribute('data-layout-passes'));
  const extraMs = Number(await graph.getAttribute('data-layout-ms'));
  if (layout === 'network') await checkNetworkRepresentation(page, filename);
  if (layout === 'network' && measured < 9) {
    expect(await page.locator('.full-entity.collapsed').count()).toBeGreaterThan(0);
    expect(passes).toBeGreaterThanOrEqual(2);
  }
  if (layout === 'layered') {
    const firstArea = await page.locator('.react-flow__node-businessArea').first().getAttribute('data-id');
    await viewOptions(page, async () => {
      await expect(page.getByRole('combobox', { name: 'Zoom to group' })).toHaveValue(firstArea!.slice(5));
    });
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await viewOptions(page, async () => {
      await expect(page.getByRole('combobox', { name: 'Zoom to group' })).toHaveValue('');
    });
  }
  console.log(
    `PASS opening ${filename} ${layout} ${page.viewportSize()!.width}: names=${openingName}, measured=${measured}, passes=${passes}, ` +
      `extra-layout=${extraMs.toFixed(1)}ms, total=${Date.now() - started}ms`,
  );
}

/** Verifies both examples at the review widths without reusing explicit collapse choices. */
export async function checkGraphOpening(browser: Browser, api: IsolatedApi) {
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    for (const example of ['ubl', 'mall']) {
      for (const layout of ['network', 'layered'] as const) {
        const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' });
        try {
          await routeApi(page, api);
          await page.goto(appUrl());
          await checkOpening(page, `${example}.ontology.yaml`, layout);
        } finally {
          await page.close();
        }
      }
    }
  }
}

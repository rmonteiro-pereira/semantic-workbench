/** Measures first-view graph geometry against an isolated example workspace. */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { fileTab } from '../helpers/screen-tour';
import { viewOptions, chooseLayout } from '../helpers/graph-options';

async function measureGraph(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.react-flow')!.getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.react-flow__node')].map(element => element.getBoundingClientRect());
    const names = [...document.querySelectorAll('.full-entity strong, .neighborhood-node strong')].map(element => element.getBoundingClientRect().height);
    const left = Math.min(...nodes.map(box => box.left));
    const top = Math.min(...nodes.map(box => box.top));
    return {
      nameHeight: Math.min(...names),
      graphWidth: Math.max(...nodes.map(box => box.right)) - left,
      graphHeight: Math.max(...nodes.map(box => box.bottom)) - top,
      paneWidth: pane.width,
      paneHeight: pane.height,
    };
  });
}

const output = process.argv[2] ?? '/tmp/sw-A/baseline-measurements';
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
const browser = await chromium.launch();
try {
  for (const example of ['ubl', 'mall']) await api.ws.loadExample(example);
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    for (const example of ['ubl', 'mall']) {
      for (const layout of ['network', 'layered', 'neighborhood'] as const) {
        const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' });
        try {
          await page.addInitScript(() => localStorage.setItem('workbench.theme', 'light'));
          await routeApi(page, api);
          await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5211');
          await fileTab(`${example}.ontology.yaml`, layout === 'neighborhood' ? 'Neighborhood' : 'Graph')(page);
          if (layout !== 'neighborhood') {
            await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
            await page.waitForTimeout(300);
            await viewOptions(page, options => chooseLayout(options, layout));
            await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
          }
          await page.waitForTimeout(1500);
          const geometry = await measureGraph(page);
          console.log(JSON.stringify({ example, width, height, layout, ...geometry }));
          await page.screenshot({ path: `${output}/${example}-${layout}-${width}.png` });
        } finally {
          await page.close();
        }
      }
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

// Captures loading bursts after each layout selection and dataset-tab opening. Usage: bun scripts/ui-review/graph-loading-states.ts OUTPUT.
// SW_BASE_URL selects Vite; examples and API state are temporary.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { authViewports } from '../helpers/sign-in';
import { fileTab } from '../helpers/screen-tour';
import { revealGraphControls, viewOptions, chooseLayout } from '../helpers/graph-options';
import { groupingMenuLabels, chooseGrouping } from '../helpers/grouping-menu';
import { capture, attempt, failure, watchCaptureErrors, type CaptureIdentity } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
await api.ws.loadExample('ubl');
await api.ws.loadExample('mall');
const browser = await chromium.launch();

async function burst(page: import('@playwright/test').Page, identity: CaptureIdentity, screen: string) {
  for (let index = 1; index <= 3; index++) {
    await capture(page, identity, screen, `layout-loading-${index}`, true);
    await page.waitForTimeout(150);
  }
}

try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of authViewports) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(5000);
      const identity = { output, mode: 'local', theme, width, height };
      watchCaptureErrors(page, identity);
      try {
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
        await page.waitForTimeout(1000);
        await fileTab('ubl.ontology.yaml', 'Graph')(page);
        for (const layout of ['network', 'layered'] as const) {
          await attempt(page, identity, `full-graph-${layout}`, 'layout-settled', async () => {
            const previous = layout === 'network' ? 'layered' : 'network';
            await viewOptions(page, options => chooseLayout(options, previous));
            await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 30000 });
            await viewOptions(page, options => chooseLayout(options, layout));
            await burst(page, identity, `full-graph-${layout}`);
          });
        }
        await fileTab('mall.ontology.yaml', 'Graph')(page);
        const labels = await groupingMenuLabels(page);
        for (const label of labels) {
          await attempt(page, identity, 'mall-full-graph', 'group-' + label.toLowerCase().replace(/\W+/g, '-'), async () => {
            await chooseGrouping(page, label);
          });
        }
        await attempt(page, identity, 'mall-full-graph', 'areas-collapsed', async () => {
          await revealGraphControls(page);
          const collapse = page.getByRole('button', { name: 'Collapse areas', exact: true });
          if (await collapse.isEnabled()) await collapse.click();
        });
        await attempt(page, identity, 'mall-full-graph', 'area-expanded', async () => {
          await page.getByRole('button', { name: 'Fit model', exact: true }).click();
          await page.locator('.react-flow__node[data-id^="collapsed:"]').first().click();
        });
        await attempt(page, identity, 'dataset-lineage', 'loaded', async () => {
          await fileTab('mall.odcs.yaml', 'Contract')(page);
          await page.getByRole('button', { name: 'Open properties', exact: true }).click();
          await page.getByRole('tab', { name: 'Properties', exact: true }).click();
          await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
          await burst(page, identity, 'dataset-lineage');
        });
      } catch (error) {
        failure(identity, 'graph-loading', 'viewport', error);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

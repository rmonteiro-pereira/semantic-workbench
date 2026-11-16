// Captures the existing synthetic graph fixture at desktop widths. Usage: bun scripts/ui-review/large-model-states.ts OUTPUT.
// SW_BASE_URL selects Vite; uses the same public fixture as large-graph-browser-check.ts in a temporary workspace.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { fileTab } from '../helpers/screen-tour';
import { viewOptions, chooseLayout } from '../helpers/graph-options';
import { capture, attempt, watchCaptureErrors, failure } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi({ watch: false });
const source = await Bun.file('public/examples/commerce/commerce-scale.ttl').text();
await api.ws.importBatch({ files: [{ path: 'commerce-scale.ttl', source }] }, LOCAL_READER);
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [
      [1440, 900],
      [2560, 1440],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(10000);
      const identity = { output, mode: 'local', theme, width, height };
      watchCaptureErrors(page, identity);
      try {
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
        await page.waitForTimeout(1200);
        await fileTab('commerce-scale.ttl', 'Graph')(page);
        await viewOptions(page, options => chooseLayout(options, 'network'));
        await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 120000 });
        await capture(page, identity, 'large-synthetic-graph', 'first-view');
        await attempt(page, identity, 'large-synthetic-graph', 'all-areas-expanded', async () => {
          await viewOptions(page, async options => {
            const expand = options.getByRole('button', { name: 'Expand all', exact: true });
            if (await expand.isEnabled()) await expand.click();
          });
          await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 120000 });
          await page.getByRole('button', { name: 'Fit model', exact: true }).click();
          await page.waitForTimeout(1000);
        });
      } catch (error) {
        failure(identity, 'large-synthetic-graph', 'stages', error);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

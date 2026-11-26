import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../../helpers/isolated-api';
import { fileTab } from '../../helpers/screen-tour';
import { attempt } from '../capture-records';

const output = process.env.JOURNEY_OUTPUT!;
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
const browser = await chromium.launch();

try {
  await api.ws.loadExample('commerce');
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
      page.setDefaultTimeout(10000);
      await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
      await routeApi(page, api);
      await page.goto('http://127.0.0.1:5410');
      const identity = { output, mode: 'local', width, height, theme };
      await attempt(page, identity, 'ossie-02-validation', 'conversion-entry', async () => {
        await fileTab('sales.ossie.yaml', 'Overview')(page);
        await page
          .locator('footer')
          .getByRole('button', { name: /^Validation details/ })
          .click();
        await page.locator('dialog[open]').waitFor();
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

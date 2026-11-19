// Checks metric status labels in the real composer at phone and desktop width in both themes.
import { chromium, expect } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { showSidebar } from './helpers/screen-tour';
import { clippedTextProblems } from './helpers/clipped-text';
import { layoutProblems } from './helpers/layout-geometry';
import { lowContrastProblems } from './helpers/text-geometry';

const api = await startIsolatedApi({ watch: false });
const browser = await chromium.launch();
const errors: string[] = [];
try {
  await api.ws.loadExample('mapped-commerce');
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
    [360, 800, 'light'],
    [360, 800, 'dark'],
  ] as const) {
    for (const status of ['approved', 'proposed', 'draft', 'deprecated', undefined]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
      page.on('pageerror', error => errors.push(error.message));
      await routeApi(page, api, async route => {
        const url = new URL(route.request().url());
        if (url.pathname !== '/api/preview/context') return false;
        const response = await route.fetch({
          url: api.url + url.pathname + url.search,
          headers: { ...(await route.request().allHeaders()), 'sec-fetch-site': 'same-origin' },
        });
        if (response.status() !== 200) throw new Error(`Context fixture refused: ${response.status()} ${await response.text()}`);
        const context = await response.json();
        for (const metric of context.metrics) {
          const extension = metric.definition.custom_extensions?.find((entry: { vendor_name: string }) => entry.vendor_name === 'SEMANTIC_WORKBENCH');
          if (!extension) throw new Error('The governed fixture metric has no extension.');
          const value = JSON.parse(extension.data);
          if (status === undefined) delete value.status;
          else value.status = status;
          extension.data = JSON.stringify(value);
        }
        await route.fulfill({ response, json: context });
        return true;
      });
      await page.goto(appUrl());
      await showSidebar(page);
      await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: 'commerce.mapping.yaml', exact: true }).click();
      await page.locator('.tabs').getByRole('button', { name: 'Mappings', exact: true }).click();
      await page.getByRole('button', { name: 'Show query', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Compose a query' });
      const metric = dialog.locator('label', { has: page.getByRole('checkbox', { name: 'Metric gross_revenue', exact: true }) });
      await metric.waitFor();
      if (status === 'approved') {
        await expect(metric).not.toContainText('Not approved');
        await expect(metric).not.toContainText('Status not set');
      } else if (status === undefined) await expect(metric).toContainText('Status not set');
      else await expect(metric).toContainText(`Not approved: ${status}`);
      expect(await layoutProblems(page)).toEqual([]);
      expect(await clippedTextProblems(page, 'dialog')).toEqual([]);
      expect(await lowContrastProblems(page, 'dialog')).toEqual([]);
      await page.close();
    }
    console.log(`PASS ${width}px ${theme}: approved, proposed, legacy draft, deprecated and absent status; geometry and contrast`);
  }
  expect(errors).toEqual([]);
  console.log('PASS planner status labels preserve the existing query controls');
} finally {
  await browser.close();
  await api.stop();
}

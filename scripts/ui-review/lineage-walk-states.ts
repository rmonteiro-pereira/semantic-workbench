// Captures three successive distinct lineage walks with Fit between steps. Usage: bun scripts/ui-review/lineage-walk-states.ts OUTPUT.
// SW_BASE_URL selects Vite; mall fixtures and workspace data are temporary.
import { chromium, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { fileTab } from '../helpers/screen-tour';
import { authViewports } from '../helpers/sign-in';
import { captureThemes, capture, failure, attempt, watchCaptureErrors, type CaptureIdentity } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
await api.ws.loadExample('mall');
const browser = await chromium.launch();

async function walks(page: Page, identity: CaptureIdentity, screen: string) {
  const region = page.getByRole('region', { name: 'Lineage graph', exact: true });
  const seen = new Set([await region.locator('.lineage-card.center').getAttribute('data-id')]);
  for (let step = 1; step <= 3; step++) {
    await region.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(500);
    const ids = await region.locator('.lineage-card:not(.center):not(.group)[aria-label^="Table "]').evaluateAll(cards => cards.map(card => card.getAttribute('data-id')!));
    const id = ids.find(id => !seen.has(id));
    if (!id) throw new Error(`No new neighboring table after Fit at walk ${step}`);
    const button = region.locator(`.lineage-card[data-id=${JSON.stringify(id)}]`).getByRole('button', { name: 'Walk here', exact: true });
    await capture(page, identity, screen, `fitted-walk-${step}-before`);
    await attempt(page, identity, screen, `fitted-walk-${step}-hover`, async () => {
      await button.hover({ timeout: 5000 });
    });
    try {
      await button.click({ timeout: 5000 });
      await expect(region.locator('.lineage-card.center')).toHaveAttribute('data-id', id);
      seen.add(id);
      await capture(page, identity, screen, `fitted-walk-${step}-after`);
    } catch (error) {
      failure(identity, screen, `fitted-walk-${step}-after`, error);
    }
  }
}

try {
  for (const theme of captureThemes()) {
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
        for (const dataset of [false, true]) {
          const screen = dataset ? 'dataset-lineage' : 'contract-lineage';
          await attempt(page, identity, screen, 'fitted-walk-trail', async () => {
            await fileTab('mall.odcs.yaml', dataset ? 'Contract' : 'Graph')(page);
            if (dataset) {
              const all = page.getByRole('button', { name: 'All tables', exact: true });
              if (await all.isVisible()) await all.click();
              await page.getByRole('button', { name: 'Open properties', exact: true }).click();
              await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
            }
            await regionReady(page);
            await walks(page, identity, screen);
          });
        }
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

async function regionReady(page: Page) {
  await page.locator('.lineage-card.center').waitFor();
  await page.waitForTimeout(600);
}

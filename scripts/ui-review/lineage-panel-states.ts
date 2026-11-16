// Captures lineage column lists and full-screen views using native controls. Usage: bun scripts/ui-review/lineage-panel-states.ts OUTPUT.
// SW_BASE_URL selects Vite. The mall and mapped-commerce examples live in a temporary isolated API.
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { fileTab } from '../helpers/screen-tour';
import { authViewports } from '../helpers/sign-in';
import { attempt, failure, watchCaptureErrors, type CaptureIdentity } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
await api.ws.loadExample('mall');
await api.ws.loadExample('mapped-commerce');
const browser = await chromium.launch();

async function panels(page: Page, identity: CaptureIdentity, screen: string) {
  const graph = page.getByRole('region', { name: /^(Lineage|Mapping) graph$/ });
  await graph.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(400);
  await attempt(page, identity, screen, 'fullscreen', async () => {
    await graph.getByRole('button', { name: 'Full screen', exact: true }).click();
  });
  await attempt(page, identity, screen, 'fullscreen-node-selected', async () => {
    await page.locator('.canvas-row.is-fullscreen').waitFor();
    await graph.locator('.lineage-card.center .lineage-card-title').first().click();
  });
  await page.keyboard.press('Escape');
  const exit = page.getByRole('button', { name: 'Exit full screen', exact: true });
  if (await exit.isVisible()) await exit.click();
  await attempt(page, identity, screen, 'column-list-open', async () => {
    await graph
      .getByRole('button', { name: /^Show all \d+ columns of/ })
      .first()
      .click();
    await graph.locator('.lineage-list').first().waitFor();
  });
  await attempt(page, identity, screen, 'column-list-scrolled', async () => {
    const list = graph.locator('.lineage-list').first();
    await list.hover();
    await page.mouse.wheel(0, 350);
  });
  await attempt(page, identity, screen, 'column-filter', async () => {
    await graph
      .getByRole('searchbox', { name: /^Filter columns of/ })
      .first()
      .fill('id');
  });
  await attempt(page, identity, screen, 'node-selected', async () => {
    await graph.locator('.lineage-card.center .lineage-card-title').first().click();
  });
}

try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of authViewports) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const identity = { output, mode: 'local', theme, width, height };
      page.setDefaultTimeout(5000);
      watchCaptureErrors(page, identity);
      try {
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        for (const screen of ['contract-lineage', 'dataset-lineage', 'mapping-graph']) {
          await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
          await page.waitForTimeout(700);
          await attempt(page, identity, screen, 'panel-stages', async () => {
            if (screen === 'mapping-graph') await fileTab('commerce.mapping.yaml', 'Graph')(page);
            else {
              await fileTab('mall.odcs.yaml', screen === 'dataset-lineage' ? 'Contract' : 'Graph')(page);
              if (screen === 'dataset-lineage') {
                await page.getByRole('button', { name: 'Open properties', exact: true }).click();
                await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
              }
            }
            await page.locator('.lineage-card').first().waitFor();
            await panels(page, identity, screen);
          });
        }
      } catch (error) {
        failure(identity, 'lineage-panels', 'viewport', error);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

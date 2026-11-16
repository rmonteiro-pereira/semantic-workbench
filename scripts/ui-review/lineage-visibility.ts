// Captures first-view visibility and fitted lineage click evidence. Usage: bun scripts/ui-review/lineage-visibility.ts OUTPUT.
// SW_BASE_URL selects Vite. Uses the mall example in a temporary workspace; no mocked responses.
import { checkReadableWalks, checkFittedWalk } from '../helpers/odcs-graph-walk';
import { chromium } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { fileTab } from '../helpers/screen-tour';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
const api = await startIsolatedApi();
await api.ws.loadExample('mall');
const browser = await chromium.launch();
const log = (entry: object) => {
  console.log(JSON.stringify(entry));
  appendFileSync(`${output}/lineage-visibility.jsonl`, JSON.stringify(entry) + '\n');
};
try {
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(5000);
    await routeApi(page, api);
    try {
      await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
      await page.waitForTimeout(1000);
      await fileTab('mall.odcs.yaml', 'Graph')(page);
      log({ type: 'mall-contract-canvas', width, height, canvas: await page.locator('.lineage-flow .react-flow').boundingBox() });
      await fileTab('mall.odcs.yaml', 'Contract')(page);
      await page.getByRole('button', { name: 'Open properties', exact: true }).click();
      await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${output}/local-lineage-walk--first-view-${width}.png` });
      const captureWalk = async (stage: string) => {
        await page.screenshot({ path: `${output}/local-lineage-walk--${stage}-${width}.png` });
      };
      await checkReadableWalks(page, captureWalk);
      await checkFittedWalk(page, captureWalk);
      log({ type: 'lineage-walk', width, height, readableClicks: 4, fittedSelection: 'success' });
    } catch (error) {
      log({ type: 'lineage-visibility-unreachable', width, error: String(error) });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

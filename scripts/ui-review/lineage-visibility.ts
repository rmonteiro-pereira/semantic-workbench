// Captures first-view visibility and fitted lineage click evidence. Usage: bun scripts/ui-review/lineage-visibility.ts OUTPUT.
// SW_BASE_URL selects Vite. Uses the mall example in a temporary workspace; no mocked responses.
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
      await page.getByRole('region', { name: 'Lineage graph', exact: true }).getByRole('button', { name: 'Fit', exact: true }).click();
      await page.waitForTimeout(600);
      const cards = page.locator('.lineage-card:not(.center):not(.group)[aria-label^="Table "]');
      const ids = await cards.evaluateAll(cards => cards.slice(0, 3).map(card => card.getAttribute('data-id')!));
      log({ type: 'fitted-neighbor-count', width, count: ids.length, ids });
      for (const [index, id] of ids.entries()) {
        const button = page.locator(`.lineage-card[data-id=${JSON.stringify(id)}]`).getByRole('button', { name: 'Walk here', exact: true });
        const stem = `${output}/local-lineage-walk--fitted-${index + 1}`;
        await page.screenshot({ path: `${stem}-before-${width}.png` });
        const geometry = await button.evaluate(element => {
          const box = element.getBoundingClientRect();
          const pane = element.closest('.react-flow')!.getBoundingClientRect();
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return {
            box: box.toJSON(),
            pane: pane.toJSON(),
            inside: box.left >= pane.left && box.right <= pane.right && box.top >= pane.top && box.bottom <= pane.bottom,
            uncovered: !!top && element.contains(top),
            top: top ? { tag: top.tagName, class: top.getAttribute('class'), text: top.textContent?.slice(0, 100) } : null,
          };
        });
        let outcome = 'success';
        try {
          await button.click({ timeout: 5000 });
        } catch (error) {
          outcome = String(error);
        }
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${stem}-after-${width}.png` });
        log({ type: 'fitted-lineage-walk', width, height, index, id, geometry, outcome });
        if (outcome === 'success') {
          await page.goBack();
          await page.waitForTimeout(500);
          await page.getByRole('region', { name: 'Lineage graph', exact: true }).getByRole('button', { name: 'Fit', exact: true }).click();
          await page.waitForTimeout(400);
        }
      }
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

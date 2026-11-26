import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../../helpers/isolated-api';
import { fileTab } from '../../helpers/screen-tour';
import { chooseLayout, hideGraphControls, revealGraphControls, setShown, viewOptions } from '../../helpers/graph-options';

const output = process.env.JOURNEY_OUTPUT!;
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
const browser = await chromium.launch();
const records: unknown[] = [];

try {
  await api.ws.loadExample('ubl');
  await api.ws.loadExample('mall');
  for (const example of ['ubl', 'mall']) {
    for (const width of [1440, 1920]) {
      for (const theme of ['light', 'dark'] as const) {
        const page = await browser.newPage({ viewport: { width, height: width === 1920 ? 1080 : 900 }, colorScheme: theme });
        page.setDefaultTimeout(15000);
        await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
        await routeApi(page, api);
        await page.goto('http://127.0.0.1:5410');
        await fileTab(`${example}.ontology.yaml`, 'Graph')(page);
        await viewOptions(page, async options => {
          await chooseLayout(options, 'network');
          await setShown(options, /^Labels/, true);
        });
        await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
        await revealGraphControls(page);
        const collapse = page.getByRole('button', { name: 'Collapse areas', exact: true });
        if (await collapse.isEnabled()) await collapse.click();
        await hideGraphControls(page);
        await page.getByRole('button', { name: 'Fit model', exact: true }).click();
        await page.waitForTimeout(1500);
        const labels = await page.locator('.react-flow__edge-text, .relationship-label').allTextContents();
        const collapsed = await page.locator('.react-flow__node[data-id^="collapsed:"]').count();
        records.push({ example, width, theme, collapsed, count: labels.length, labels });
        await page.screenshot({ path: `${output}/${example}-${theme}-${width}.png` });
        await page.close();
      }
    }
  }
} finally {
  writeFileSync(`${output}/labels.json`, JSON.stringify(records, null, 2));
  await browser.close();
  await api.stop();
}

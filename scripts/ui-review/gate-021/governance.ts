import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../../helpers/isolated-api';
import { ONTOLOGY_TEXT } from '../../../tests/helpers/tessera-repository';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import { openConcept } from '../feature-states/navigation';
import { attempt } from '../capture-records';

const output = process.env.JOURNEY_OUTPUT!;
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
const browser = await chromium.launch();
const source = ONTOLOGY_TEXT.replace('tessera: 1', 'tessera: 2').replace('\n  - concept: Customer\n', '\n  - concept: Customer\n    tessera_governance: {status: approved}\n');
try {
  await api.ws.importBatch({ name: 'Retail', files: [{ path: 'retail.ontology.yaml', source }] }, LOCAL_READER);
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
      page.setDefaultTimeout(10000);
      await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
      await routeApi(page, api);
      await page.goto('http://127.0.0.1:5410');
      await attempt(page, { output, mode: 'local', theme, width, height }, 'governance-and-header', 'approved', async () => {
        await openConcept(page, 'retail.ontology.yaml', 'Customer');
        await page.getByRole('region', { name: 'Governance', exact: true }).locator('.status-filled').waitFor();
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

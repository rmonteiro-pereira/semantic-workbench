// Captures accepted documents with no graph entities or lineage links. Usage: bun scripts/ui-review/empty-graph-states.ts OUTPUT.
// SW_BASE_URL selects Vite; the RDF and isolated-table fixtures exist only in a temporary workspace.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { fileTab } from '../helpers/screen-tour';
import { authViewports } from '../helpers/sign-in';
import { attempt, failure, watchCaptureErrors } from './capture-records';

const output = process.argv[2];
if (!output) throw new Error('Expected OUTPUT');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
await api.ws.importBatch(
  {
    name: 'Empty graph fixtures',
    files: [
      { path: 'empty.ttl', source: '@prefix ex: <https://example.invalid/> .\nex:value ex:description "No entities or relationships" .\n' },
      {
        path: 'isolated.odcs.yaml',
        source: [
          'apiVersion: v3.1.0',
          'kind: DataContract',
          'id: isolated',
          'name: Isolated table',
          'version: 1.0.0',
          'status: active',
          'schema:',
          '  - name: isolated',
          '    logicalType: object',
          '    physicalName: isolated',
          '    properties:',
          '      - name: id',
          '        logicalType: string',
          '',
        ].join('\n'),
      },
    ],
  },
  LOCAL_READER,
);
const browser = await chromium.launch();
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
        await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
        await page.waitForTimeout(700);
        await attempt(page, identity, 'full-graph', 'empty', () => fileTab('empty.ttl', 'Graph')(page));
        await attempt(page, identity, 'neighborhood', 'empty', () => fileTab('empty.ttl', 'Neighborhood')(page));
        await attempt(page, identity, 'contract-lineage', 'no-links', () => fileTab('isolated.odcs.yaml', 'Graph')(page));
        await attempt(page, identity, 'dataset-lineage', 'no-links', async () => {
          await fileTab('isolated.odcs.yaml', 'Contract')(page);
          await page.getByRole('button', { name: 'Open isolated', exact: true }).click();
          await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
        });
      } catch (error) {
        failure(identity, 'empty-graphs', 'viewport', error);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await api.stop();
}

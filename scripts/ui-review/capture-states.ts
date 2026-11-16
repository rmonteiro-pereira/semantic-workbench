// Captures additional local states in the standard theme/viewport matrix. Usage: bun scripts/ui-review/capture-states.ts OUTPUT [graphs|rest].
// SW_ONLY=neighborhood limits graphs; SW_ONLY=shell/catalog/metrics/mappings/odcs/editing selects a rest group. SW_THEME limits capture to light or dark. SW_BASE_URL selects the loopback Vite frontend. Every fixture uses startIsolatedApi and is deleted on completion.
import { chromium } from '@playwright/test';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { authViewports } from '../helpers/sign-in';
import { withCleanup } from '../helpers/processes';
import { captureGraphStates } from './graph-states';
import { captureRestStates } from './workspace-states';
import { captureThemes, watchCaptureErrors, failure, type CaptureIdentity } from './capture-records';
import { mkdirSync, readFileSync } from 'node:fs';
import { LOCAL_READER } from '../../src/server/projects/reader';

const [output, group = 'graphs'] = process.argv.slice(2);
if (!output) throw new Error('Expected OUTPUT [graphs|rest]');
mkdirSync(output, { recursive: true });
const api = await startIsolatedApi();
for (const example of ['ubl', 'commerce', 'mapped-commerce', 'mall']) await api.ws.loadExample(example);
if (group === 'rest') {
  const files = ['case-when.ossie.yaml', 'case-when-broken.ossie.yaml'].map(path => ({ path, source: readFileSync(`tests/fixtures/sql/${path}`, 'utf8') }));
  await api.ws.importBatch({ name: 'SQL examples', files }, LOCAL_READER);
  const trio = ['commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml', 'commerce.mapping.yaml'];
  const mapping = readFileSync('public/examples/commerce/commerce.mapping.yaml', 'utf8');
  const emptyMapping = mapping.split('concept_mappings:')[0].replace('name: Commerce ontology mapping', 'name: Unbound mapping regression') + 'concept_mappings: []\n';
  await api.ws.importBatch(
    { name: 'Unbound commerce', files: trio.map(path => ({ path, source: path === 'commerce.mapping.yaml' ? emptyMapping : readFileSync(`public/examples/commerce/${path}`, 'utf8') })) },
    LOCAL_READER,
  );
}
const browser = await chromium.launch();
await withCleanup(
  async () => {
    await browser.close();
    await api.stop();
  },
  async () => {
    for (const theme of captureThemes()) {
      for (const [width, height] of authViewports) {
        const identity: CaptureIdentity = { output, mode: 'local', theme, width, height };
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme as 'light' | 'dark' });
        watchCaptureErrors(page, identity);
        page.setDefaultTimeout(3000);
        page.on('pageerror', error => console.log('BROWSER_ERROR', width, theme, error.message));
        page.on('console', message => {
          if (message.type() === 'error') console.log('CONSOLE_ERROR', width, theme, message.text());
        });
        try {
          await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
          await routeApi(page, api);
          await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
          await page.waitForTimeout(1500);
          if (group === 'graphs') await captureGraphStates(page, identity);
          else await captureRestStates(page, identity);
        } catch (error) {
          failure(identity, group, 'viewport', error);
        } finally {
          await page.close();
        }
      }
    }
  },
);

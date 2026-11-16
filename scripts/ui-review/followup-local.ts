// Captures independent local follow-up states. Usage: bun scripts/ui-review/followup-local.ts OUTPUT_ROOT [graphs|lineage|content|all].
// SW_FOLLOWUP_WIDTH optionally selects one width. SW_BASE_URL defaults to loopback port 5190; SW_FOLLOWUP_ONLY filters screen/state names. Fixtures bind checked port 5191 with temporary DATA_DIR.
import { chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { startIsolatedApi, routeApi } from '../helpers/isolated-api';
import { withCleanup } from '../helpers/processes';
import { fixtureAtPort } from './followup-ports';
import { loadFollowupFixtures } from './followup-fixtures';
import { freshCapture, followupViews, type State, type View } from './followup-capture';
import { fullGraphStates, neighborhoodStates } from './followup-graphs';
import { lineageStates, emptyMappingStates } from './followup-lineage';
import { mappingStates, formStates, interactionStates, statusStates } from './followup-content';

const [root, group = 'all'] = process.argv.slice(2);
if (!root) throw new Error('Expected OUTPUT_ROOT [graphs|lineage|content|all]');
const data = mkdtempSync('/tmp/sw-followup-local-');
process.env.DATA_DIR = data;
const api = await fixtureAtPort(5191, () => startIsolatedApi({ root: data }));
const browser = await chromium.launch();
const views: View[] = [...followupViews, { width: 1280, height: 720, theme: 'light' }];

function inventory(view: View): State[] {
  const states: State[] = [];
  if (group === 'all' || group === 'graphs') states.push(...fullGraphStates(view), ...neighborhoodStates(view));
  if (group === 'all' || group === 'lineage') {
    states.push(...lineageStates(view).filter(state => view.width !== 1280 || state.state === 'toolbar-zoom-row'));
    if (view.width === 1440) states.push(...emptyMappingStates());
  }
  if ((group === 'all' || group === 'content') && view.width !== 1280) states.push(...mappingStates(), ...formStates(), ...interactionStates(view), ...statusStates());
  return states.filter(state => !process.env.SW_FOLLOWUP_ONLY || `${state.screen} ${state.state}`.includes(process.env.SW_FOLLOWUP_ONLY));
}

await withCleanup(
  async () => {
    await browser.close();
    await api.stop();
  },
  async () => {
    await loadFollowupFixtures(api);
    for (const view of views) {
      if (process.env.SW_FOLLOWUP_WIDTH && view.width !== Number(process.env.SW_FOLLOWUP_WIDTH)) continue;
      for (const state of inventory(view)) {
        await freshCapture(browser, root, view, state, async page => {
          await routeApi(page, api);
          await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
          await page.locator('.workspace-header').waitFor();
        });
      }
    }
  },
);

// Photographs the states of one feature, each cropped to the region that shows it, and measures every image.
// Usage, through sw-midgard-run: bun scripts/ui-review/feature-states.ts OUTPUT GROUP [STATES]
//   GROUP is proposals, connections, agent, closed, open, traffic, attributes, context, diff, mesh, compile, convert or item-editors.
//   closed, open and context retake part of the agent and attributes groups.
//   STATES is an optional comma-separated list, such as loading,error, for a targeted recapture.
// OUTPUT is the folder of one feature. Images in it and its sibling folders count toward one shared limit.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { loadBrandBundle, setActiveBrand } from '../../src/server/brand/bundle';
import { startIsolatedApi } from '../helpers/isolated-api';
import { withCleanup } from '../helpers/processes';
import { captureAgentPanel } from './feature-states/agent-panel';
import { captureAttributes } from './feature-states/attributes';
import { captureCompile } from './feature-states/compile';
import { captureConvert } from './feature-states/convert';
import { captureConnections } from './feature-states/connections';
import { startDevServer } from './feature-states/dev-server';
import { captureItemEditors } from './feature-states/item-editors';
import { captureItemDiff } from './feature-states/item-diff';
import { captureMesh } from './feature-states/mesh';
import { captureProposals } from './feature-states/proposals';
import { attempt, type CaptureSession } from './feature-states/session';
import { captureTraffic } from './feature-states/traffic';

const [output, group = 'proposals', states] = process.argv.slice(2);
if (!output) throw new Error('Expected OUTPUT GROUP');
mkdirSync(output, { recursive: true });
setActiveBrand(loadBrandBundle());

/** Groups that bring their own server; the others need the shared isolated API and the Vite frontend. */
async function runStandalone(session: CaptureSession) {
  if (group === 'proposals') return attempt(session, group, () => captureProposals(session));
  if (group === 'connections') return attempt(session, group, () => captureConnections(session));
  if (group === 'agent') return attempt(session, group, () => captureAgentPanel(session, 'all'));
  if (group === 'closed' || group === 'open') return attempt(session, group, () => captureAgentPanel(session, group));
  return undefined;
}

async function runWithWorkspace(session: CaptureSession) {
  const api = await startIsolatedApi({ watch: false });
  const stopDevServer = await startDevServer();
  await withCleanup(
    async () => {
      await stopDevServer();
      await api.stop();
    },
    async () => {
      if (group === 'item-editors') await attempt(session, group, () => captureItemEditors(session, api));
      if (group === 'mesh') await attempt(session, group, () => captureMesh(session));
      if (group === 'diff') await attempt(session, group, () => captureItemDiff(session));
      if (group === 'traffic') await captureTraffic(session, api);
      if (group === 'attributes') await attempt(session, group, () => captureAttributes(session, api));
      if (group === 'context') await attempt(session, group, () => captureAttributes(session, api, true));
      if (group === 'compile') await attempt(session, group, () => captureCompile(session, api));
      if (group === 'convert') await attempt(session, group, () => captureConvert(session, api));
    },
  );
}

const STANDALONE_GROUPS = ['proposals', 'connections', 'agent', 'closed', 'open'];
const browser = await chromium.launch();
// One capture job may hand at most this many images to the visual reviewers.
const IMAGE_LIMIT = 110;
const onlyStates = states ? new Set(states.split(',')) : undefined;
const session: CaptureSession = { browser, output, imageLimit: IMAGE_LIMIT, onlyStates };
await withCleanup(
  () => browser.close(),
  async () => {
    if (STANDALONE_GROUPS.includes(group)) await runStandalone(session);
    else await runWithWorkspace(session);
  },
);

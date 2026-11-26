// Usage traffic on the graph: Traffic on in six viewports, the details and neighbourhood panels,
// and the empty, off, loading, error, partial, non-Admin and long-name states.
import type { Page } from '@playwright/test';
import { inspect } from '../../../src/shared/core/model';
import { LOCAL_READER } from '../../../src/server/projects/reader';
import type { IsolatedApi } from '../../helpers/isolated-api';
import { fileTab } from '../../helpers/screen-tour';
import { countedItems, usageInterceptor, type UsageMock } from '../../helpers/usage-traffic';
import { viewOptions, setShown, showEveryEntity } from '../../helpers/graph-options';
import { appPage, attempt, capture, readOnlyServer, type CaptureSession, type Viewport } from './session';

const ONTOLOGY = 'ubl.ontology.yaml';
const VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [768, 'light'],
  [360, 'light'],
  [1280, 'dark'],
  [768, 'dark'],
  [360, 'dark'],
];
const SWITCHED_STATES = ['empty', 'off', 'loading', 'error', 'partial'] as const;

function readyMock(): UsageMock {
  return { mode: 'ready', requests: [], release() {} };
}

async function showTrafficGraph(page: Page) {
  await fileTab(ONTOLOGY, 'Graph')(page);
  await showEveryEntity(page);
  await viewOptions(page, options => setShown(options, 'Traffic', true));
}

/** Switching Traffic off and on again makes the graph ask for counts in the mock's new mode. */
async function captureSwitchedStates(session: CaptureSession, page: Page, mock: UsageMock) {
  for (const state of SWITCHED_STATES) {
    mock.mode = state;
    await viewOptions(page, options => setShown(options, 'Traffic', false));
    await viewOptions(page, options => setShown(options, 'Traffic', true));
    await page.waitForTimeout(300);
    await capture(session, page, `graph-${state}`, '.full-graph');
    mock.release();
  }
}

async function capturePanels(session: CaptureSession, page: Page) {
  await page.locator('.full-entity:has(.traffic-ring)').first().click();
  await capture(session, page, 'details-1200000', '.inspector');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await fileTab(ONTOLOGY, 'Neighborhood')(page);
  await capture(session, page, 'neighbourhood-on', '.neighborhood-graph');
  await fileTab(ONTOLOGY, 'Graph')(page);
}

async function captureViewports(session: CaptureSession, api: IsolatedApi) {
  await api.ws.loadExample('ubl');
  const project = api.ws.state.registry().projects[0].slug;
  const items = countedItems(project, ONTOLOGY, await Bun.file(`public/examples/ubl/${ONTOLOGY}`).text());
  for (const [width, theme] of VIEWPORTS) {
    const mock = readyMock();
    const page = await appPage(
      session,
      api,
      width,
      theme,
      usageInterceptor(mock, () => items),
    );
    await showTrafficGraph(page);
    await page.locator('.traffic-ring').first().waitFor({ state: 'attached' });
    await capture(session, page, 'graph-on', '.full-graph', theme);
    if (width === 1280 && theme === 'light') {
      await capturePanels(session, page);
      await captureSwitchedStates(session, page, mock);
    }
    await page.close();
  }
}

async function renameFirstConceptLong(api: IsolatedApi, project: string) {
  const file = api.ws.readFile(project, ONTOLOGY);
  const name = inspect(file.source, ONTOLOGY).entities[0].name;
  const source = file.source.replaceAll(name, 'A_very_long_ontology_concept_name_'.repeat(5));
  await api.ws.saveFile(project, ONTOLOGY, { baseHash: file.hash, source }, LOCAL_READER);
  return source;
}

async function captureNonAdmin(session: CaptureSession, api: IsolatedApi, project: string) {
  const items = countedItems(project, ONTOLOGY, api.ws.readFile(project, ONTOLOGY).source);
  const usage = usageInterceptor({ mode: 'off', requests: [], release() {} }, () => items);
  const asReader = readOnlyServer(api);
  const page = await appPage(session, api, 1280, 'light', async route => (await asReader(route)) || usage(route));
  await showTrafficGraph(page);
  await page.waitForTimeout(500);
  await capture(session, page, 'graph-off-non-admin', '.full-graph');
  await page.close();
}

async function captureLongNames(session: CaptureSession, api: IsolatedApi, project: string) {
  const source = await renameFirstConceptLong(api, project);
  const items = countedItems(project, ONTOLOGY, source);
  const page = await appPage(
    session,
    api,
    1280,
    'light',
    usageInterceptor(readyMock(), () => items),
  );
  await showTrafficGraph(page);
  await page.waitForTimeout(500);
  await capture(session, page, 'graph-long-names', '.full-graph');
  await page.close();
}

export async function captureTraffic(session: CaptureSession, api: IsolatedApi) {
  await attempt(session, 'traffic', () => captureViewports(session, api));
  const project = api.ws.state.registry().projects[0].slug;
  await attempt(session, 'off-non-admin', () => captureNonAdmin(session, api, project));
  await attempt(session, 'long-names', () => captureLongNames(session, api, project));
}

// Usage: bun scripts/ui-review/feature-states.ts OUTPUT GROUP. Run through sw-midgard-run.
import { loadBrandBundle, setActiveBrand } from '../../src/server/brand/bundle';
import { chromium, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openProposalsHarness, proposalView, proposalsMock } from '../../tests/helpers/proposals-harness';
import { startIsolatedApi, routeApi, type IsolatedApi } from '../helpers/isolated-api';
import { fileTab, showSidebar, openProjectFileTab } from '../helpers/screen-tour';
import { screenshotPath } from '../helpers/screenshots';
import { lowContrastProblems, textCollisionProblems } from '../helpers/text-geometry';
import { countedItems, usageInterceptor, type UsageMock } from '../helpers/usage-traffic';
import { viewOptions, setShown, showEveryEntity, revealGraphControls } from '../helpers/graph-options';
import { inspect } from '../../src/shared/core/model';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT, MAPPING_TEXT } from '../../tests/helpers/tessera-repository';
import { startPanelServer } from '../../tests/acp/helpers/panel-server';
import { startRelay } from '../../tests/acp/helpers/relay-process';
import { startMockOidc } from '../../tests/helpers/mock-oidc';
import { startAuthApi } from '../auth-environment';
import { signIn } from '../helpers/sign-in';
import { pkcePair, referenceProgram } from '../../tests/helpers/connection-server';
import { itemDiffBaselineWorkspace } from '../../tests/helpers/item-diff-baseline';
import { meshWorkspace } from '../../tests/helpers/mesh-workspace';
import { openProjectMenuItem } from '../helpers/project-dialog-tour';

const output = process.argv[2];
const group = process.argv[3] ?? 'proposals';
if (!output) throw new Error('Expected OUTPUT GROUP');
mkdirSync(output, { recursive: true });
setActiveBrand(loadBrandBundle());
const browser = await chromium.launch();
const base = 'http://127.0.0.1:5450';
type Theme = 'light' | 'dark';

async function newPage(width = 1280, theme: Theme = 'light') {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  page.setDefaultTimeout(6000);
  await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
  return page;
}

async function capture(page: Page, state: string, selector: string, theme: Theme = 'light') {
  if (selector === 'dialog[open]') selector = 'dialog[open]:last-of-type .workbench-dialog';
  const width = page.viewportSize()!.width;
  const file = `${state}-${theme}-${width}.png`;
  const alreadyCaptured = existsSync(join(output, file));
  if (!alreadyCaptured && [...new Bun.Glob('specs/01[2-9]*/captures/*.png').scanSync('.')].length >= 110) throw new Error('The image budget is exhausted.');
  const region = page.locator(selector).first();
  await region.waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
  await region.scrollIntoViewIfNeeded();
  const box = await region.boundingBox();
  if (!box) throw new Error('Missing crop');
  if (Math.max(box.width, box.height) > 1600) throw new Error('Crop exceeds 1600 CSS pixels');
  const measurements = await region.evaluate(root => {
    const clipped: string[] = [];
    const ellipsis: string[] = [];
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!bounds.width || !bounds.height || style.visibility === 'hidden' || style.clipPath === 'inset(50%)' || (element.closest('details:not([open])') && element.tagName !== 'SUMMARY')) continue;
      const text = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('')
        .trim();
      if (!text) continue;
      const label = `${element.tagName.toLowerCase()}.${String(element.className)} ${text.slice(0, 100)}`;
      if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
        clipped.push(`${label}: scroll ${element.scrollWidth}×${element.scrollHeight}, client ${element.clientWidth}×${element.clientHeight}`);
      }
      if (text.includes('…') || text.includes('...') || (style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth)) ellipsis.push(label);
    }
    const indicators = [...root.querySelectorAll('.traffic-ring, .traffic-bar, .item-change-mark, .compile-state-title, [role=alert], [role=status], [aria-pressed]')]
      .filter(element => element.getBoundingClientRect().width > 0)
      .map(element => {
        const style = getComputedStyle(element);
        return {
          text: element.textContent?.trim().slice(0, 200),
          label: element.getAttribute('aria-label'),
          pressed: element.getAttribute('aria-pressed'),
          class: String(element.className),
          border: style.borderTopWidth,
          width: element.getBoundingClientRect().width,
        };
      });
    return { clipped, ellipsis, indicators };
  });
  const contrast = await lowContrastProblems(page, selector);
  const overlaps = await textCollisionProblems(page, selector);
  if (!alreadyCaptured) await region.screenshot({ path: screenshotPath(file, output), animations: 'disabled' });
  appendFileSync(join(output, 'records.jsonl'), JSON.stringify({ file, state, theme, width, crop: selector, dpr: 1, size: [box.width, box.height], ...measurements, contrast, overlaps }) + '\n');
  console.log('CAPTURE', file);
}

async function attempt(name: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    const reason = String(error).split('\n').slice(0, 4).join(' ');
    appendFileSync(join(output, 'missing.jsonl'), JSON.stringify({ state: name, reason }) + '\n');
    console.log('MISSING', name, reason);
  }
}

async function proposals() {
  for (const [width, theme] of [
    [1280, 'light'],
    [1280, 'dark'],
    [390, 'light'],
  ] as const) {
    const view = proposalView({ may: { contribute: true, promote: true, close: true, restore: false } });
    const mock = proposalsMock({ views: [view] });
    const page = await newPage(width, theme);
    await openProposalsHarness(page, mock);
    await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
    await expect(page.getByText(view.name).first()).toBeVisible();
    await capture(page, 'list', 'main', theme);
    await page
      .getByRole('region', { name: 'Proposals' })
      .getByRole('button', { name: new RegExp(view.name) })
      .click();
    await capture(page, 'detail', 'dialog[open]', theme);
    if (width === 1280 && theme === 'light') {
      await page.getByRole('button', { name: 'Check promotion' }).click();
      await expect(page.getByText('Publishing would work now')).toBeVisible();
      await capture(page, 'check', 'dialog[open]');
      await page.getByRole('button', { name: 'Promote proposal' }).click();
      await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
      await capture(page, 'promote', 'dialog[open]');
    }
    await page.close();
  }
  for (const state of ['empty', 'loading', 'error', 'long-text', 'create', 'close', 'restore']) {
    await attempt(state, async () => {
      const view = proposalView({
        name: state === 'long-text' ? 'Rename the customer concept across sales, billing and reporting definitions '.repeat(5) : 'Rename customer',
        may: { contribute: true, promote: true, close: true, restore: false },
      });
      const mock = proposalsMock({ views: state === 'empty' ? [] : [view], listStatus: state === 'error' ? 500 : 200, listDelayMs: state === 'loading' ? 30000 : 0 });
      const page = await newPage();
      await openProposalsHarness(page, mock);
      if (state === 'loading') await page.getByText('Loading proposals').waitFor();
      else if (state === 'error') await page.getByRole('alert').waitFor();
      else if (state === 'empty') await page.getByText('No proposals yet').waitFor();
      else await page.getByText(view.name).first().waitFor();
      let selector = 'main';
      if (state === 'create') {
        await page.getByRole('button', { name: 'New proposal' }).click();
        selector = 'dialog[open]';
      }
      if (state === 'close' || state === 'restore') {
        await page
          .getByRole('region', { name: 'Proposals' })
          .getByRole('button', { name: /Rename customer/ })
          .click();
        await page.getByRole('button', { name: 'Close proposal' }).click();
        await page.getByRole('button', { name: 'Restore proposal' }).waitFor();
        if (state === 'restore') await page.getByRole('button', { name: 'Restore proposal' }).click();
        selector = 'dialog[open]';
      }
      await capture(page, state, selector);
      await page.close();
    });
  }
}

async function appPage(api: IsolatedApi, width = 1280, theme: Theme = 'light', intercept?: Parameters<typeof routeApi>[2]) {
  const page = await newPage(width, theme);
  await routeApi(page, api, intercept);
  await page.goto(base);
  return page;
}

async function traffic(api: IsolatedApi) {
  await api.ws.loadExample('ubl');
  const project = api.ws.state.registry().projects[0].slug;
  const items = countedItems(project, 'ubl.ontology.yaml', await Bun.file('public/examples/ubl/ubl.ontology.yaml').text());
  const variants = [
    [1280, 'light'],
    [768, 'light'],
    [360, 'light'],
    [1280, 'dark'],
    [768, 'dark'],
    [360, 'dark'],
  ] as const;
  for (const [width, theme] of variants) {
    const mock: UsageMock = { mode: 'ready', requests: [], release() {} };
    const page = await appPage(
      api,
      width,
      theme,
      usageInterceptor(mock, () => items),
    );
    await fileTab('ubl.ontology.yaml', 'Graph')(page);
    await showEveryEntity(page);
    await viewOptions(page, options => setShown(options, 'Traffic', true));
    await page.locator('.traffic-ring').first().waitFor({ state: 'attached' });
    await capture(page, 'graph-on', '.full-graph', theme);
    if (width === 1280 && theme === 'light') {
      await page.locator('.full-entity:has(.traffic-ring)').first().click();
      await capture(page, 'details-1200000', '.inspector');
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      await fileTab('ubl.ontology.yaml', 'Neighborhood')(page);
      await capture(page, 'neighbourhood-on', '.neighborhood-graph');
      await fileTab('ubl.ontology.yaml', 'Graph')(page);
      for (const state of ['empty', 'off', 'loading', 'error', 'partial'] as const) {
        mock.mode = state;
        await viewOptions(page, options => setShown(options, 'Traffic', false));
        await viewOptions(page, options => setShown(options, 'Traffic', true));
        await page.waitForTimeout(300);
        await capture(page, `graph-${state}`, '.full-graph');
        mock.release();
      }
    }
    await page.close();
  }
}

async function trafficExtras(api: IsolatedApi) {
  const project = api.ws.state.registry().projects[0].slug;
  for (const state of ['off-non-admin', 'long-names']) {
    await attempt(state, async () => {
      const file = api.ws.readFile(project, 'ubl.ontology.yaml');
      let source = file.source;
      if (state === 'long-names') {
        const name = inspect(source, 'ubl.ontology.yaml').entities[0].name;
        source = source.replaceAll(name, 'A_very_long_ontology_concept_name_'.repeat(5));
        await api.ws.saveFile(project, 'ubl.ontology.yaml', { baseHash: file.hash, source }, LOCAL_READER);
      }
      const items = countedItems(project, 'ubl.ontology.yaml', source);
      const mock: UsageMock = { mode: state === 'long-names' ? 'ready' : 'off', requests: [], release() {} };
      const usage = usageInterceptor(mock, () => items);
      const page = await appPage(api, 1280, 'light', async route => {
        const url = new URL(route.request().url());
        if (state === 'off-non-admin' && ['/api/me', '/api/projects'].includes(url.pathname)) {
          const response = await api.handler(new Request('http://localhost:5173' + url.pathname, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
          const answer = await response.json();
          if (url.pathname === '/api/me') answer.mode = 'server';
          else for (const project of answer) project.actions = ['read'];
          await route.fulfill({ json: answer });
          return true;
        }
        return usage(route);
      });
      await fileTab('ubl.ontology.yaml', 'Graph')(page);
      await showEveryEntity(page);
      await viewOptions(page, options => setShown(options, 'Traffic', true));
      await page.waitForTimeout(500);
      await capture(page, `graph-${state}`, '.full-graph');
      await page.close();
    });
  }
}

async function attributes(api: IsolatedApi) {
  const source = ONTOLOGY_TEXT.replace('tessera: 1', 'tessera: 2');
  await api.ws.importBatch({ name: 'Retail', files: [{ path: 'retail.ontology.yaml', source }] }, LOCAL_READER);
  const attributeViews =
    group === 'context'
      ? []
      : ([
          [1280, 'light'],
          [360, 'light'],
          [1280, 'dark'],
          [360, 'dark'],
        ] as const);
  for (const [width, theme] of attributeViews) {
    await attempt(`attributes-${width}-${theme}`, async () => {
      const saved = api.ws.readFile('retail', 'retail.ontology.yaml');
      await api.ws.saveFile('retail', 'retail.ontology.yaml', { baseHash: saved.hash, source }, LOCAL_READER);
      const page = await appPage(api, width, theme);
      await openConcept(page, 'retail.ontology.yaml', 'Customer');
      const details = page.locator('aside[aria-label="Definition details"]');
      if (width === 1280 && theme === 'light') await capture(page, 'attributes-empty', 'section[aria-label="Attributes"]');
      const attributes = details.getByRole('region', { name: 'Attributes' });
      await attributes.getByRole('button', { name: 'Add attribute' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add an attribute to Customer' });
      const name = 'a_very_long_attribute_name_without_a_break_'.repeat(3);
      await dialog.getByLabel('Name').fill(name);
      await dialog.getByRole('button', { name: 'Add attribute', exact: true }).click();
      await attributes.getByText(name, { exact: true }).waitFor();
      await capture(page, 'attributes-populated-long-text', 'section[aria-label="Attributes"]', theme);
      await attributes.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
      await page.route('**/api/projects/*/files/**', async route => {
        if (route.request().method() === 'PUT') await route.fulfill({ status: 500, json: { error: 'Attribute could not be saved.' } });
        else await route.fallback();
      });
      await page
        .getByRole('dialog', { name: `Edit attribute ${name}`, exact: true })
        .getByLabel('Name')
        .fill('phone');
      await page.getByRole('button', { name: 'Save attribute', exact: true }).click();
      await page
        .getByRole('dialog', { name: `Edit attribute ${name}`, exact: true })
        .getByRole('alert')
        .waitFor();
      await capture(page, 'attribute-error', 'dialog[open]', theme);
      await page.close();
    });
  }
  const saved = api.ws.readFile('retail', 'retail.ontology.yaml');
  await api.ws.saveFile(
    'retail',
    'retail.ontology.yaml',
    { baseHash: saved.hash, source: source.replace('\n  - concept: Customer\n', '\n  - concept: Customer\n    tessera_governance: {status: deprecated}\n') },
    LOCAL_READER,
  );
  for (const state of group === 'context' ? [] : ['deprecated', 'read-only']) {
    await attempt(state, async () => {
      const page = await appPage(api, 1280, 'light', async route => {
        if (state !== 'read-only') return false;
        const url = new URL(route.request().url());
        if (!['/api/me', '/api/projects'].includes(url.pathname)) return false;
        const response = await api.handler(new Request('http://localhost:5173' + url.pathname, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
        const answer = await response.json();
        if (url.pathname === '/api/me') answer.mode = 'server';
        else for (const project of answer) project.actions = ['read'];
        await route.fulfill({ json: answer });
        return true;
      });
      await openConcept(page, 'retail.ontology.yaml', 'Customer');
      await capture(page, state, 'section[aria-label="Governance"]');
      await page.close();
    });
  }
  const contextPage = await appPage(api);
  await openConcept(contextPage, 'retail.ontology.yaml', 'Customer');
  const context = contextPage.getByRole('region', { name: 'Agent context', exact: true });
  await context
    .locator('label')
    .filter({ has: contextPage.getByText('Instructions', { exact: true }) })
    .locator('textarea')
    .fill('Prefer the published customer definition. '.repeat(12));
  await context.getByRole('button', { name: 'Save agent context', exact: true }).click();
  await contextPage.waitForTimeout(500);
  await capture(contextPage, 'agent-context-populated-long-text', '.agent-context-fields');
  await contextPage.close();
}

async function agent() {
  const server = await startPanelServer({ examples: ['mapped-commerce'], port: 5451, staticRoot: resolve('dist') });
  let relay: Awaited<ReturnType<typeof startRelay>> | undefined;
  try {
    const agentViews =
      group === 'open'
        ? ([
            [1280, 'dark'],
            [390, 'light'],
          ] as const)
        : ([
            [1280, 'light'],
            [1280, 'dark'],
            [390, 'light'],
          ] as const);
    for (const [width, theme] of agentViews) {
      const page = await newPage(width, theme);
      await page.goto(server.url);
      if (theme === 'light' && width === 1280) {
        await page.locator('.full-graph-loading').waitFor({ state: 'detached' });
        await capture(page, 'closed', 'body');
      }
      if (group === 'closed') {
        await page.close();
        break;
      }
      await page.getByRole('button', { name: 'Person menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Agent panel', exact: true }).click();
      if (theme !== 'light' || width !== 1280) {
        await page.getByRole('button', { name: 'Start session', exact: true }).click();
        await page.getByText(/Waiting for your agent/).waitFor();
        await capture(page, 'open-empty', '.agent-panel', theme);
        await page.close();
        server.restart();
        continue;
      }
      await capture(page, 'open-empty', 'dialog[open]', theme);
      await page.route('**/api/acp/sessions', route => route.fulfill({ status: 503, json: { error: 'Connection setup unavailable.' } }));
      await page.getByRole('button', { name: 'Start session', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await capture(page, 'error', 'dialog[open]');
      await page.unroute('**/api/acp/sessions');
      const pending = page.waitForResponse(response => response.url().endsWith('/api/acp/sessions') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Start session', exact: true }).click();
      const created = await (await pending).json();
      await page.getByText(/Waiting for your agent/).waitFor();
      await capture(page, 'connecting', '.agent-panel');
      const session = server.service.store.findForRelay(created.id)!;
      relay = await startRelay(server, { id: session.id, code: session.code! }, [[{ say: 'Definitions reviewed.' }], [{ say: 'Long definition path/'.repeat(100) }]]);
      await page.getByText('reference-agent · Connected', { exact: true }).waitFor({ timeout: 30000 });
      await page.getByRole('textbox', { name: 'Message to your agent' }).fill('Review definitions');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page.getByLabel('Conversation').getByText('Definitions reviewed.').waitFor();
      await capture(page, 'connected-conversation', '.agent-panel');
      await page.getByRole('textbox', { name: 'Message to your agent' }).fill('Show the long path');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await page
        .getByLabel('Conversation')
        .getByText(/Long definition path/)
        .waitFor();
      await capture(page, 'long-text', '.agent-panel');
      await relay.stop();
      relay = undefined;
      await page.close();
      server.restart();
    }
  } finally {
    await relay?.stop();
    await server.close();
  }
}

async function connections() {
  const url = 'http://127.0.0.1:5452';
  const provider = await startMockOidc({ port: 5453, shape: 'entra', redirectUris: [url + '/auth/callback'] });
  const program = { ...referenceProgram, redirectUris: ['http://127.0.0.1:5454/callback'] };
  const api = await startAuthApi(
    url,
    { ...provider, kind: 'entra' },
    { prepare: root => Bun.write(join(root, 'admin/programs.json'), JSON.stringify({ formatVersion: 1, programs: [program] })).then(() => {}) },
  );
  try {
    for (const [width, theme] of [
      [1280, 'light'],
      [1280, 'dark'],
      [390, 'light'],
    ] as const) {
      const page = await newPage(width, theme);
      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page, { url, issuer: provider.endpointBase, kind: 'entra' }, 'dave');
      await page.setViewportSize({ width, height: 900 });
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: program.clientId,
        redirect_uri: program.redirectUris[0],
        code_challenge: pkcePair().challenge,
        code_challenge_method: 'S256',
        resource: url + '/api/mcp',
        scope: 'read edit',
      });
      await page.goto(url + '/oauth/authorize?' + query);
      await page.getByRole('heading', { name: 'Connect an agent', exact: true }).waitFor();
      await capture(page, 'consent', 'main', theme);
      if (width === 1280 && theme === 'light') {
        await page.goto(url + '/oauth/setup');
        await capture(page, 'setup-credential', 'main');
        await page.goto(url + '/oauth/authorize?client_id=missing');
        await capture(page, 'authorize-error', 'main');
      }
      for (const state of width === 1280 && theme === 'light' ? ['empty', 'loading', 'error', 'long-text'] : ['empty']) {
        const held = Promise.withResolvers<void>();
        await page.route('**/api/connections', async route => {
          if (state === 'loading') await held.promise;
          await route.fulfill({
            status: state === 'error' ? 500 : 200,
            json:
              state === 'long-text'
                ? [
                    {
                      id: 'capture',
                      origin: 'acp',
                      clientId: program.clientId,
                      programName: 'Agent program with a long descriptive name '.repeat(5),
                      scopes: program.scopes,
                      createdAt: '2026-11-17T12:00:00Z',
                      lastUsedAt: '2026-11-17T12:00:00Z',
                      personName: 'Test person with a long display name',
                      state: 'active',
                    },
                  ]
                : [],
          });
        });
        await page.goto(url);
        await page.getByRole('button', { name: 'Person menu', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Agent connections', exact: true }).click();
        await page.waitForTimeout(300);
        await capture(page, `person-${state}`, 'dialog[open]', theme);
        held.resolve();
        await page.waitForTimeout(100);
        await page.unroute('**/api/connections');
      }
      if (width === 1280 && theme === 'light') {
        for (const section of ['agent-connections', 'agent-programs']) {
          await page.goto(url + '/#/admin/' + section);
          await page.locator('.admin-page').waitFor();
          await page.waitForTimeout(300);
          await capture(page, section, '.admin-page');
        }
      }
      await page.close();
    }
  } finally {
    await api.stop();
    await provider.stop();
  }
}

async function openConcept(page: Page, file: string, name: string) {
  await fileTab(file, 'Catalog')(page);
  await page
    .locator('.catalog-card')
    .filter({ has: page.locator(`strong[title="${name}"]`) })
    .getByRole('button', { name: /View details/ })
    .click();
  await page.locator('aside[aria-label="Definition details"]').waitFor();
}

async function mesh() {
  const fixture = await meshWorkspace('separate');
  fixture.ws.close();
  const api = await startIsolatedApi({ root: fixture.fixture.root, watch: false });
  try {
    for (const [width, theme] of [
      [1280, 'light'],
      [768, 'light'],
      [390, 'light'],
      [1280, 'dark'],
      [768, 'dark'],
      [390, 'dark'],
    ] as const) {
      await attempt(`mesh-${width}-${theme}`, async () => {
        const page = await appPage(api, width, theme);
        await fileTab('private/customer.yaml', 'Source')(page);
        if (width === 1280 && theme === 'light') await capture(page, 'part-picker', '.mesh-unit-files');
        await openProjectFileTab(page, 'retail', 'ontology.yaml', 'Catalog');
        await page
          .locator('.catalog-card', { hasText: 'Order' })
          .first()
          .getByRole('button', { name: /View details/ })
          .click();
        const imports = page.getByRole('region', { name: 'Imports', exact: true });
        if (width === 1280 && theme === 'light') await capture(page, 'imports-empty', '.mesh-imports');
        await imports.getByRole('button', { name: 'Add import', exact: true }).click();
        await imports.getByRole('radio', { name: /finance/ }).check();
        await imports.getByLabel('Alias', { exact: true }).fill('fin');
        await imports.getByRole('checkbox', { name: 'Invoice', exact: true }).check();
        await capture(page, 'import-editor-populated', '.mesh-imports', theme);
        if (width === 1280 && theme === 'light') await capture(page, 'disclosure', '.mesh-disclosure');
        await page.getByRole('button', { name: 'Close details', exact: true }).click();
        await showSidebar(page);
        await page.getByRole('button', { name: 'Mesh', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Ontology mesh' });
        await dialog.getByRole('button', { name: 'finance', exact: true }).click();
        await dialog.getByRole('button', { name: 'Used by', exact: true }).click();
        await capture(page, 'mesh-populated', 'dialog[open]', theme);
        if (width === 1280 && theme === 'light') await capture(page, 'used-by-empty', 'section[aria-label="Used by"]');
        await page.close();
      });
    }
    for (const state of ['error', 'empty']) {
      const page = await appPage(api);
      await page.route('**/api/mesh', route => route.fulfill({ status: state === 'error' ? 500 : 200, json: { projects: [], links: [] } }));
      await showSidebar(page);
      await page.getByRole('button', { name: 'Mesh', exact: true }).click();
      await page.waitForTimeout(400);
      await capture(page, `mesh-${state}`, 'dialog[open]');
      await page.close();
    }
    await meshExtras(api);
  } finally {
    await api.stop();
  }
}

async function meshExtras(api: IsolatedApi) {
  for (const state of ['imports-error', 'import-editor-error', 'imports-populated']) {
    await attempt(state, async () => {
      const page = await appPage(api);
      if (state === 'imports-error') await page.route('**/api/projects/*/dependencies', route => route.fulfill({ status: 500, json: {} }));
      if (state === 'import-editor-error') await page.route('**/api/mesh/providers', route => route.fulfill({ status: 500, json: {} }));
      await openProjectFileTab(page, 'retail', 'ontology.yaml', 'Catalog');
      await page
        .locator('.catalog-card', { hasText: 'Order' })
        .first()
        .getByRole('button', { name: /View details/ })
        .click();
      const section = page.getByRole('region', { name: 'Imports', exact: true });
      if (state !== 'imports-error') await section.getByRole('button', { name: 'Add import', exact: true }).click();
      if (state === 'imports-populated') {
        await section.getByRole('radio', { name: /finance/ }).check();
        await section.getByLabel('Alias', { exact: true }).fill('fin');
        await section.getByRole('checkbox', { name: 'Invoice', exact: true }).check();
        await section.getByRole('button', { name: 'Save import', exact: true }).click();
        await section.getByRole('button', { name: 'Edit import fin', exact: true }).waitFor();
      } else await section.getByRole('alert').waitFor();
      await capture(page, state, 'section[aria-label="Imports"]');
      await page.close();
    });
  }
}

async function publicationReview(api: IsolatedApi) {
  await attempt('publication-review', async () => {
    const page = await appPage(api, 1280, 'light', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith('/git/status')) return false;
      const response = await api.handler(new Request('http://localhost:5173' + url.pathname, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
      const answer = await response.json();
      if (answer.published && answer.published.state !== 'none') answer.published.ahead = 1;
      await route.fulfill({ json: answer });
      return true;
    });
    await fileTab('finance.ontology.yaml', 'Graph')(page);
    await showSidebar(page);
    await page.getByRole('button', { name: /^Source control/ }).click();
    await page.getByRole('region', { name: 'Source Control' }).getByLabel('Published snapshot').getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('region', { name: 'Publication changes', exact: true }).waitFor();
    await capture(page, 'publication-review', 'dialog[open]');
    await page.close();
  });
}

async function diffStates(api: IsolatedApi) {
  for (const state of ['empty', 'loading', 'error', 'long-names']) {
    await attempt(`comparison-${state}`, async () => {
      const held = Promise.withResolvers<void>();
      const page = await appPage(api, 1280, 'light', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.endsWith('/item-diff')) return false;
        if (state === 'loading') await held.promise;
        if (state === 'error') {
          await route.fulfill({ status: 503, json: { error: 'Comparison temporarily unavailable.' } });
          return true;
        }
        const response = await api.handler(new Request('http://localhost:5173' + url.pathname + url.search, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
        const answer = await response.json();
        if (state === 'empty') {
          answer.changes = [];
          answer.counts = { added: 0, changed: 0, removed: 0 };
          answer.omitted = 0;
          answer.notCompared = [];
        }
        if (state === 'long-names') answer.changes = answer.changes.map((change: { name: string }) => ({ ...change, name: 'A_very_long_definition_name_'.repeat(12) }));
        await route.fulfill({ json: answer });
        return true;
      });
      await fileTab('finance.ontology.yaml', 'Graph')(page);
      await revealGraphControls(page);
      await page.getByRole('button', { name: 'Unpublished comparison details', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Unpublished comparison', exact: true });
      if (state === 'empty') await dialog.getByText('No unpublished item changes.', { exact: true }).first().waitFor();
      if (state === 'loading') await dialog.getByText('Comparing saved items.', { exact: true }).first().waitFor();
      if (state === 'error') await dialog.getByRole('alert').waitFor();
      if (state === 'long-names') await dialog.getByText('A_very_long_definition_name_'.repeat(12), { exact: true }).first().waitFor();
      await capture(page, `comparison-${state}`, 'dialog[open]');
      held.resolve();
      await page.close();
    });
  }
}

async function diff() {
  const fixture = await itemDiffBaselineWorkspace();
  fixture.ws.close();
  const api = await startIsolatedApi({ root: fixture.root, watch: false });
  const original = api.ws.readFile('finance', 'finance.ontology.yaml');
  await api.ws.saveFile(
    'finance',
    'finance.ontology.yaml',
    { baseHash: original.hash, source: original.source.replace('  - concept: Retired\n    type: EntityType', '  - concept: Invoice\n    type: EntityType') },
    LOCAL_READER,
  );
  try {
    for (const [width, theme] of [
      [1280, 'light'],
      [1280, 'dark'],
      [390, 'light'],
    ] as const) {
      const page = await appPage(api, width, theme);
      await fileTab('finance.ontology.yaml', 'Graph')(page);
      await page.locator('.item-change-mark').first().waitFor();
      await page.waitForTimeout(1200);
      await capture(page, 'overlay', '.full-graph', theme);
      if (width === 1280 && theme === 'light') {
        for (const state of ['added', 'changed', 'removed']) {
          await page
            .locator('.full-entity')
            .filter({ has: page.getByText(`Not published: ${state}`, { exact: true }) })
            .first()
            .evaluate(element => element.setAttribute('data-capture-state', 'selected'));
          await capture(page, state, '[data-capture-state=selected]');
          await page.locator('[data-capture-state=selected]').evaluate(element => element.removeAttribute('data-capture-state'));
        }
        await openConcept(page, 'finance.ontology.yaml', 'Customer');
        await page.getByRole('button', { name: 'Start a branch for this item', exact: true }).first().click();
        await capture(page, 'branch-control', 'dialog[open]');
      }
      await page.close();
    }
    await diffStates(api);
    await publicationReview(api);
  } finally {
    await api.stop();
  }
}

async function openCompile(page: Page) {
  await openProjectMenuItem(page, 'retail.ontology.yaml', 'Export project…');
  await page.getByLabel('Files to export').selectOption('standard');
  await page.getByRole('button', { name: 'Review standard Ossie' }).click();
  await page.getByRole('dialog', { name: 'Standard Ossie for Retail' }).waitFor();
}

async function compile(api: IsolatedApi) {
  const files = [
    { path: 'retail.ontology.yaml', source: ONTOLOGY_TEXT },
    { path: 'retail.semantic.yaml', source: SEMANTIC_MODEL_TEXT },
    { path: 'retail.mapping.yaml', source: MAPPING_TEXT },
  ];
  const project = await api.ws.importBatch({ name: 'Retail', files }, LOCAL_READER);
  await api.ws.publish(project.slug, LOCAL_READER);
  const response = await api.handler(
    new Request(`http://localhost:5173/api/projects/${project.slug}/compile/check`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'X-SW-Request': '1', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ source: 'published' }),
    }),
  );
  const template = await response.json();
  for (const state of ['unavailable', 'loading', 'nothing-to-do', 'refused', 'loss-1', 'loss-200', 'error']) {
    await attempt(state, async () => {
      const page = await appPage(api);
      const held = Promise.withResolvers<void>();
      const answer = structuredClone(template);
      if (state.startsWith('loss-')) {
        const count = Number(state.slice(5));
        answer.report.losses = Array.from({ length: count }, (_, index) => ({ ...template.report.losses[0], pointer: `/ontology/${index}/tessera_notes`, item: `Order${index}` }));
        answer.report.counts = { tessera_notes: count };
      }
      if (state === 'nothing-to-do') {
        answer.result = 'ok';
        answer.report.losses = [];
        answer.report.counts = {};
        answer.files = answer.files.map((file: { treatment: string }) => ({ ...file, treatment: 'copied' }));
      }
      if (state === 'refused') {
        answer.result = 'refused';
        answer.findings = [{ severity: 'error', path: 'retail.ontology.yaml', message: 'The definition cannot be compiled.' }];
      }
      await page.route('**/compile/check', async route => {
        if (state === 'loading') await held.promise;
        if (state === 'unavailable') await route.fulfill({ status: 409, json: { error: 'not-published' } });
        else if (state === 'error') await route.fulfill({ status: 500, json: { error: 'Compile temporarily unavailable.' } });
        else await route.fulfill({ json: answer });
      });
      await openCompile(page);
      if (state !== 'loading') await page.locator('.compile-placeholder').waitFor({ state: 'detached' });
      if (state === 'loss-1' || state === 'loss-200') await page.locator('.loss-group summary').first().click();
      await capture(page, state, 'dialog[open]');
      if (state === 'loss-200') {
        await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
        await capture(page, state, 'dialog[open]', 'dark');
        await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
        await page.setViewportSize({ width: 390, height: 900 });
        await capture(page, state, 'dialog[open]');
      }
      held.resolve();
      await page.close();
    });
  }
  for (const [width, theme] of [
    [1280, 'light'],
    [1280, 'dark'],
    [390, 'light'],
  ] as const) {
    const page = await appPage(api, width, theme);
    await openCompile(page);
    await page.getByRole('button', { name: 'Accept this report' }).click();
    await page.getByText('Accepted. The standard files are ready to download.').waitFor();
    await capture(page, 'released', 'dialog[open]', theme);
    if (width === 1280 && theme === 'light') {
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await openProjectMenuItem(page, 'retail.ontology.yaml', 'Export project…');
      await capture(page, 'export-entry', 'dialog[open]');
      await page.keyboard.press('Escape');
      await fileTab('retail.ontology.yaml', 'Overview')(page);
      await page
        .locator('footer')
        .getByRole('button', { name: /^Validation details/ })
        .click();
      await capture(page, 'validation-entry', 'dialog[open]');
    }
    await page.close();
  }
}

try {
  if (group === 'proposals') await attempt(group, proposals);
  else if (group === 'agent' || group === 'closed' || group === 'open') await attempt(group, agent);
  else if (group === 'connections') await attempt(group, connections);
  else {
    const api = await startIsolatedApi({ watch: false });
    const launcher = `import { createServer } from 'vite-plus';
const server = await createServer({ server: { host: '127.0.0.1', port: 5450, strictPort: true } });
await server.listen();
process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});`;
    const vite = Bun.spawn(['node', '--input-type=module', '-e', launcher], { stdout: 'ignore', stderr: 'inherit' });
    try {
      for (let index = 0; index < 100; index++) {
        if (
          await fetch(base)
            .then(answer => answer.ok)
            .catch(() => false)
        )
          break;
        await Bun.sleep(100);
      }
      if (group === 'mesh') await attempt(group, mesh);
      if (group === 'diff') await attempt(group, diff);
      if (group === 'traffic') {
        await attempt(group, () => traffic(api));
        await trafficExtras(api);
      }
      if (group === 'attributes' || group === 'context') await attempt(group, () => attributes(api));
      if (group === 'compile') await attempt(group, () => compile(api));
    } finally {
      vite.kill();
      await vite.exited;
      await api.stop();
    }
  }
} finally {
  await browser.close();
}

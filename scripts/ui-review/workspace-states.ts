// Captures shell, catalog, editing, metrics, and source-control stages. Imported by capture-states; no additional environment variables.
import { expect, type Page } from '@playwright/test';
import { captureScreens } from '../helpers/all-tours';
import { fileTab, openProjectFileTab, showScreen, showSidebar } from '../helpers/screen-tour';
import { openNewMenu } from '../helpers/header';
import { capture, attempt, failure, type CaptureIdentity } from './capture-records';

const screens = captureScreens({ ontology: 'ubl.ontology.yaml', contract: 'commerce.odcs.yaml', metricsModel: 'mall.semantic.yaml', mapping: 'commerce.mapping.yaml' });

async function tour(page: Page, name: string) {
  const screen = screens.find(screen => screen.name === name);
  if (!screen) throw new Error(`Tour inventory has no ${name}`);
  await showScreen(page, screen);
}

async function shell(page: Page, identity: CaptureIdentity) {
  await attempt(page, identity, 'shell', 'sidebar-expanded', () => showSidebar(page));
  await attempt(page, identity, 'shell', 'sidebar-collapsed', async () => {
    const drawerClose = page.getByRole('button', { name: 'Close workspace drawer', exact: true });
    if (await drawerClose.isVisible()) await drawerClose.click();
    else await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  });
  await attempt(page, identity, 'shell', 'new-menu', async () => {
    await openNewMenu(page);
  });
  await page.keyboard.press('Escape');
  await attempt(page, identity, 'shell', 'avatar-menu', async () => {
    await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  });
  await page.keyboard.press('Escape');
  await attempt(page, identity, 'settings', 'theme-control', () => tour(page, 'settings'));
  await page.keyboard.press('Escape');
  for (const [name, tab] of [
    ['overview', 'Overview'],
    ['catalog', 'Catalog'],
    ['metrics', 'Metrics'],
  ]) {
    await attempt(page, identity, name, 'keyboard-focus', async () => {
      await fileTab('mall.ontology.yaml', tab)(page);
      for (let index = 0; index < 4; index++) await page.keyboard.press('Tab');
    });
  }
  await attempt(page, identity, 'shell', 'history-back', async () => {
    await page.goBack();
  });
  await attempt(page, identity, 'shell', 'history-forward', async () => {
    await page.goForward();
  });
  await attempt(page, identity, 'shell', 'sidebar-item-hover', async () => {
    await showSidebar(page);
    await page.getByRole('button', { name: 'mall.ontology.yaml', exact: true }).first().hover();
  });
}

async function catalog(page: Page, identity: CaptureIdentity) {
  await tour(page, 'catalog');
  await capture(page, identity, 'catalog', 'populated');
  console.log(
    'CATALOG_CONTROLS',
    await page
      .locator('input,select')
      .evaluateAll(elements => elements.map(element => ({ tag: element.tagName, label: element.getAttribute('aria-label'), placeholder: element.getAttribute('placeholder') }))),
  );
  const search = page.getByPlaceholder('Find an entity…');
  for (const [state, value] of [
    ['search-matching', 'Address'],
    ['search-no-result', 'zzzz-no-match-98765'],
  ]) {
    await attempt(page, identity, 'catalog', state, async () => {
      await search.fill(value);
    });
  }
  await search.fill('');
  await tour(page, 'catalog');
  await attempt(page, identity, 'catalog', 'area-filter', async () => {
    await fileTab('ubl.ontology.yaml', 'Overview')(page);
    await page
      .getByRole('button', { name: /^Show all/ })
      .first()
      .click();
    await page.locator('.catalog-area-filter').waitFor();
  });
  await attempt(page, identity, 'catalog', 'table-row-hover', async () => {
    await page.locator('.catalog-card, .catalog-row').first().hover();
  });
  await attempt(page, identity, 'overview', 'show-all-expanded', async () => {
    await fileTab('ubl.ontology.yaml', 'Overview')(page);
    await page
      .getByRole('button', { name: /^Show all/ })
      .first()
      .click();
  });
  await attempt(page, identity, 'overview', 'entity-details', async () => {
    await page.locator('.catalog-card > button').first().click();
  });
  await attempt(page, identity, 'overview', 'long-named-entity-selected', async () => {
    await page.keyboard.press('Escape');
    await fileTab('ubl.ontology.yaml', 'Overview')(page);
    const names = await page.locator('.area-entities button[title]').evaluateAll(buttons => buttons.map(button => button.getAttribute('title')!).sort((first, second) => second.length - first.length));
    if (!names[0]) throw new Error('No named entity in the overview');
    console.log('LONG_ENTITY', names[0], names[0].length);
    await page.locator(`.area-entities button[title=${JSON.stringify(names[0])}]`).click();
  });
}

async function metrics(page: Page, identity: CaptureIdentity) {
  await tour(page, 'metrics-list');
  await capture(page, identity, 'metrics', 'list');
  console.log(
    'METRIC_INPUTS',
    await page
      .locator('input,select')
      .evaluateAll(elements => elements.map(element => ({ tag: element.tagName, label: element.getAttribute('aria-label'), placeholder: element.getAttribute('placeholder') }))),
  );
  await attempt(page, identity, 'metrics', 'filter-matching', async () => {
    await page.getByLabel('Find a metric', { exact: true }).fill('revenue');
  });
  await attempt(page, identity, 'metrics', 'filter-no-result', async () => {
    await page.getByLabel('Find a metric', { exact: true }).fill('zzzz-no-match');
  });
  await page.getByLabel('Find a metric', { exact: true }).fill('');
  await attempt(page, identity, 'metrics', 'detail', () => tour(page, 'metric-detail'));
  await tour(page, 'metric-wizard');
  await capture(page, identity, 'metric-wizard', 'step-1-empty-validation');
  await attempt(page, identity, 'metric-wizard', 'primary-hover', async () => {
    await page.getByRole('button', { name: 'Next', exact: true }).hover();
  });
  await attempt(page, identity, 'metric-wizard', 'step-1-filled', async () => {
    await page.getByLabel('Concept measured', { exact: true }).fill('Revenue');
    await page.getByLabel('Concept it is about', { exact: true }).fill('Order');
  });
  for (let step = 2; step <= 8; step++) {
    let advanced = false;
    await attempt(page, identity, 'metric-wizard', `step-${step}`, async () => {
      const model = page.getByLabel('Semantic model', { exact: true });
      if (await model.isVisible()) {
        const values = await model.locator('option').evaluateAll(options => options.map(option => option.getAttribute('value')).filter(Boolean));
        if (values[0]) await model.selectOption(values[0]);
      }
      const label = page.getByLabel('Label', { exact: true });
      if (await label.isVisible()) {
        await capture(page, identity, 'metric-wizard', 'step-3-validation-error');
        await label.fill('Capture revenue');
        await page.getByLabel('Name', { exact: true }).fill('capture_revenue');
        await page.getByLabel('Metric type', { exact: true }).selectOption('simple');
        const field = page.getByLabel('Field to aggregate', { exact: true });
        const choices = await field.locator('option').allTextContents();
        if (choices[1]) await field.selectOption({ label: choices[1] });
      }
      const owner = page.getByLabel('Owner', { exact: true });
      if (await owner.isVisible()) await owner.fill('data-team');
      const next = page.getByRole('button', { name: 'Next', exact: true });
      if (!(await next.isEnabled())) console.log('WIZARD_BLOCKING', await page.locator('dialog[open]').innerText());
      await expect(next).toBeEnabled({ timeout: 10000 });
      if (!(await next.isEnabled())) throw new Error(`Next is disabled: ${await page.locator('.dialog-footer').innerText()}`);
      await next.click();
      advanced = true;
    });
    if (!advanced) {
      for (let remaining = step + 1; remaining <= 8; remaining++) {
        failure(identity, 'metric-wizard', `step-${remaining}`, new Error(`Wizard could not advance past step ${step - 1}; see the preceding selector or validation error`));
      }
      break;
    }
  }
  await page.keyboard.press('Escape');
}

async function edits(page: Page, identity: CaptureIdentity) {
  for (const name of ['item-editor', 'add-concept', 'query-composer', 'file-move', 'project-rename', 'project-delete', 'import', 'project-export', 'project-export-history', 'trash']) {
    await attempt(page, identity, name, 'empty-or-resting', () => tour(page, name));
    await page.keyboard.press('Escape');
  }
  await attempt(page, identity, 'add-concept', 'filled', async () => {
    await tour(page, 'add-concept');
    console.log('ADD_FORM', await page.locator('dialog input').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') ?? element.getAttribute('placeholder'))));
    await page.locator('dialog input').first().fill('Capture concept');
  });
  await attempt(page, identity, 'add-concept', 'field-errors', async () => {
    await page.getByLabel('Name', { exact: true }).fill('Order');
    await page.getByLabel('Type', { exact: true }).selectOption('EntityType');
    await page.waitForTimeout(500);
  });
  await page.keyboard.press('Escape');
  await attempt(page, identity, 'item-editor', 'filled', async () => {
    await tour(page, 'item-editor');
    await page.getByLabel('Description', { exact: true }).fill('A purchase order with declared parties and order lines.');
  });
  await attempt(page, identity, 'item-editor', 'field-errors', async () => {
    await page.getByLabel('Name', { exact: true }).fill('');
  });
  await page.keyboard.press('Escape');
  await attempt(page, identity, 'item-editor', 'delete-confirmation', async () => {
    await tour(page, 'item-editor');
    await page.getByRole('button', { name: 'Delete…', exact: true }).click();
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await attempt(page, identity, 'source-editor', 'sql-colouring', () => fileTab('case-when.ossie.yaml', 'Source')(page));
  await attempt(page, identity, 'source-editor', 'sql-warning-gutter', () => fileTab('case-when-broken.ossie.yaml', 'Source')(page));
  await attempt(page, identity, 'source-editor', 'clean', () => tour(page, 'source-editor'));
  await attempt(page, identity, 'source-editor', 'invalid-unsaved-draft', async () => {
    const editor = page.locator('.cm-content[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('invalid: [\n');
    await page.waitForTimeout(1200);
  });
}

async function mappings(page: Page, identity: CaptureIdentity) {
  await tour(page, 'mappings');
  await capture(page, identity, 'mappings', 'list');
  await attempt(page, identity, 'mappings', 'selected-binding', async () => {
    await page.locator('.mapping-concept-list button[aria-pressed]').nth(1).click();
  });
  await attempt(page, identity, 'mappings', 'agent-context', async () => {
    await page
      .getByRole('button', { name: /Agent context|AI context/i })
      .first()
      .click();
  });
  await attempt(page, identity, 'mappings', 'selected-document-source', async () => {
    await openProjectFileTab(page, 'Unbound commerce', 'commerce.mapped-ontology.yaml', 'Mappings');
    await page.getByText('No bindings in this mapping', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show query', exact: true }).click();
    await page.getByRole('button', { name: 'Open Source to add bindings', exact: true }).click();
    await expect(page.locator('.workspace-title h1')).toHaveText('commerce.mapping.yaml');
  });
  await attempt(page, identity, 'mapping-graph', 'empty-bindings', async () => {
    await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
    await expect(page.locator('.lineage-card')).toHaveCount(0);
  });
}

async function odcs(page: Page, identity: CaptureIdentity) {
  await fileTab('mall.odcs.yaml', 'Contract')(page);
  await capture(page, identity, 'odcs-contract', 'populated');
  for (const [state, query] of [
    ['search-matching', 'property'],
    ['search-no-result', 'zzzz-no-match'],
  ]) {
    await attempt(page, identity, 'odcs-contract', state, async () => {
      await page.getByRole('searchbox', { name: 'Find a table', exact: true }).fill(query);
    });
  }
  await page.getByRole('searchbox', { name: 'Find a table', exact: true }).fill('');
  const sections = await page.locator('.odcs-section-rows button').allTextContents();
  for (const section of sections) {
    await attempt(page, identity, 'odcs-contract', 'section-' + section.toLowerCase().replace(/\W+/g, '-'), async () => {
      await page.locator('.odcs-section-rows button').filter({ hasText: section }).click();
    });
    await page.keyboard.press('Escape');
  }
  await attempt(page, identity, 'odcs-contract', 'team', async () => {
    await page.getByRole('region', { name: 'Team and roles', exact: true }).waitFor();
  });
  await page.getByRole('button', { name: 'Open properties', exact: true }).click();
  for (const tab of ['Properties', 'Data Quality', 'Relationships', 'History', 'Lineage']) {
    await attempt(page, identity, 'odcs-dataset', tab.toLowerCase().replaceAll(' ', '-'), async () => {
      await page.getByRole('tab', { name: tab, exact: true }).click();
    });
  }
}

/** Captures non-graph local states for the current viewport and theme. */
export async function captureRestStates(page: Page, identity: CaptureIdentity) {
  for (const [name, run] of [
    ['shell', shell],
    ['catalog', catalog],
    ['metrics', metrics],
    ['mappings', mappings],
    ['odcs', odcs],
    ['editing', edits],
  ] as const) {
    if (process.env.SW_ONLY && process.env.SW_ONLY !== name) continue;
    await page.goto(process.env.SW_BASE_URL ?? 'http://127.0.0.1:5190');
    await page.waitForTimeout(1200);
    await attempt(page, identity, name, 'stages', () => run(page, identity));
  }
}

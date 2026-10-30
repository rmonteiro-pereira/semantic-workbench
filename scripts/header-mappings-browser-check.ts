// Checks that the header, the tab row and the Mappings tab match the approved designs: structure,
// computed sizes, the Commit text and count, the account button only in server mode, no label that
// ends in an ellipsis, and a Mappings tab without a mapping picker that flows as one page. It covers
// the UBL, commerce and shopping center examples in local mode.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { editorValue, fillEditor } from './helpers/code-editor';
import { nestedScrollBoxes, sidewaysOverflowProblems } from './helpers/clipped-text';
import { showSidebar } from './helpers/screen-tour';
import { example } from './helpers/examples';

const ACCENT = 'rgb(36, 124, 102)';
const DANGER_TEXT = 'rgb(163, 57, 47)';
const LAYERS = ['Ontology', 'Mapping', 'Semantic model', 'Physical sources'];

const api = await startIsolatedApi();
const browser = await chromium.launch();
const errors: string[] = [];
let passed = 0;

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

async function newPage(width = 1280, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', error => errors.push(error.message));
  await routeApi(page, api);
  return page;
}

/** Opens a file of a project from the sidebar tree. */
async function openFile(page: Page, project: string, file: string) {
  await showSidebar(page);
  const tree = page.getByRole('treeitem', { name: project, exact: true });
  if ((await tree.getAttribute('aria-expanded')) === 'false') await tree.getByRole('button', { name: project, exact: true }).click();
  await tree.getByRole('button', { name: file, exact: true }).click();
  await expect(page.locator('.workspace-title h1')).toHaveText(file);
}

const tab = (page: Page, name: string) => page.locator('.tabs').getByRole('button', { name, exact: true });

/** Reads a computed style value of the first element that matches. */
function style(page: Page, selector: string, property: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

/** Lists the visible texts, placeholders, labels and tooltips under `within` that end in an ellipsis or carry one. */
async function ellipsisProblems(page: Page, within = 'body') {
  return page.evaluate(root => {
    const found: string[] = [];
    const scope = document.querySelector(root)!;
    const isEllipsis = (text: string) => /…|\.\.\./.test(text);
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest('.cm-editor, pre, code, textarea, script, style')) continue;
      const box = parent.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && isEllipsis(node.textContent ?? '')) found.push(`text "${node.textContent!.trim().slice(0, 40)}"`);
    }
    for (const element of scope.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title]')) {
      if (element.closest('.cm-editor')) continue;
      for (const attribute of ['placeholder', 'aria-label', 'title']) {
        const value = element.getAttribute(attribute) ?? '';
        if (isEllipsis(value)) found.push(`${attribute} "${value.slice(0, 40)}"`);
      }
    }
    return found;
  }, within);
}

/** Opens a menu, reads every item, and closes it again. */
async function menuItemTexts(page: Page, open: () => Promise<void>) {
  await open();
  const items = await page.getByRole('menuitem').allTextContents();
  await page.keyboard.press('Escape');
  return items;
}

async function headerChecks(page: Page) {
  const header = page.locator('header.workspace-header');
  await check('the header is 60 px with the toggle, a title block, Commit and More actions', async () => {
    expect((await header.boundingBox())!.height).toBe(60);
    const toggle = page.locator('.workspace-toggle');
    expect(await toggle.boundingBox()).toMatchObject({ width: 36, height: 36 });
    expect(await style(page, '.workspace-toggle', 'border-top-color')).toBe('rgba(0, 0, 0, 0)');
    expect(await style(page, '.workspace-title h1', 'font-size')).toBe('16px');
    expect(await style(page, '.workspace-title h1', 'font-weight')).toBe('600');
    expect(await style(page, '.header-meta', 'font-size')).toBe('12.5px');
    await expect(page.locator('.header-meta')).toHaveText(/^Apache Ossie ontology\s*·\s*Saved$|^Ossie ontology\s*·\s*Saved$/);
  });
  await check('Commit is the plain dimmed button with exactly the text Commit while there is nothing to commit', async () => {
    const commit = header.getByRole('button', { name: 'Commit', exact: true });
    await expect(commit).toHaveText(/^Commit$/);
    await expect(commit).toHaveAttribute('aria-disabled', 'true');
    expect(await commit.evaluate(button => getComputedStyle(button).opacity)).toBe('0.55');
    expect(await commit.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe(ACCENT);
    expect(await commit.boundingBox()).toMatchObject({ height: 36 });
    await expect(page.locator('.commit-count')).toHaveCount(0);
    await commit.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Nothing to commit. Edit a file first.');
    await page.mouse.move(0, 0);
  });
  await check('More actions is a borderless 36 px icon button and there is no account button in local mode', async () => {
    const more = header.getByRole('button', { name: 'More actions', exact: true });
    expect(await more.boundingBox()).toMatchObject({ width: 36, height: 36 });
    expect(await more.evaluate(button => getComputedStyle(button).borderTopColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await more.evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await expect(page.getByRole('button', { name: 'Account and Admin', exact: true })).toHaveCount(0);
  });
  await check('the tab row is 48 px with 32 px tabs and a 240 px search field on the right', async () => {
    expect((await page.locator('.toolbar').boundingBox())!.height).toBe(48);
    expect(await tab(page, 'Overview').boundingBox()).toMatchObject({ height: 32 });
    expect(await style(page, '.tabs button', 'font-size')).toBe('14px');
    const search = page.locator('.toolbar .search');
    expect(await search.boundingBox()).toMatchObject({ width: 240, height: 34 });
    await expect(page.getByPlaceholder('Find an entity', { exact: true })).toBeVisible();
    const right = (await search.boundingBox())!.x + 240;
    const row = (await page.locator('.toolbar').boundingBox())!;
    expect(row.x + row.width - right).toBeLessThanOrEqual(13);
  });
}

async function editingChecks(page: Page) {
  await tab(page, 'Source').click();
  const editor = page.getByLabel('Definition source');
  const original = await editorValue(editor);
  await check('Commit turns green with a count badge once a file has changed', async () => {
    await fillEditor(editor, `${original}\n# reviewed\n`);
    const commit = page.locator('header.workspace-header').getByRole('button', { name: 'Commit', exact: true });
    await expect(page.locator('.commit-count')).toHaveText('1', { timeout: 10_000 });
    await expect(commit).toHaveText(/^Commit\s*1$/);
    expect(await commit.evaluate(button => getComputedStyle(button).backgroundColor)).toBe(ACCENT);
    expect(await commit.evaluate(button => getComputedStyle(button).fontSize)).toBe('14px');
    expect(await commit.evaluate(button => getComputedStyle(button).fontWeight)).toBe('500');
    expect(await commit.boundingBox()).toMatchObject({ height: 36 });
    expect(await style(page, '.commit-count', 'font-size')).toBe('12px');
    expect(await page.locator('.commit-count').boundingBox()).toMatchObject({ height: 20 });
  });
  await check('a failed save shows "Not saved: N errors" as a red underlined link and dims Commit', async () => {
    await fillEditor(editor, `${original}\nunclosed: [\n`);
    const link = page.locator('.header-meta .save-state');
    await expect(link).toHaveText(/^Not saved: \d+ errors?$/, { timeout: 20_000 });
    expect(await link.evaluate(element => getComputedStyle(element).color)).toBe(DANGER_TEXT);
    expect(await link.evaluate(element => getComputedStyle(element).textDecorationLine)).toContain('underline');
    const commit = page.locator('header.workspace-header').getByRole('button', { name: 'Commit', exact: true });
    await expect(commit).toHaveText(/^Commit$/);
    expect(await commit.evaluate(button => getComputedStyle(button).opacity)).toBe('0.55');
    await fillEditor(editor, original);
    await expect(link).toHaveText('Saved', { timeout: 20_000 });
  });
}

/** Opens Mappings on the open file and waits for the first card. */
async function showMappings(page: Page) {
  await tab(page, 'Mappings').click();
  await expect(page.locator('.mapping-detail .mapping-card').first()).toBeVisible({ timeout: 60_000 });
}

async function mappingStructureChecks(page: Page, label: string, expectedProject: string, mappingFile: string) {
  await check(`${label}: Mappings has no mapping picker and shows the strip, two columns and four cards`, async () => {
    await expect(page.locator('.mapping-explorer select')).toHaveCount(0);
    await expect(page.getByLabel('Mapping document')).toHaveCount(0);
    await expect(page.locator('.mapping-page h2').first()).not.toHaveText('');
    expect(await style(page, '.mapping-page h2', 'font-size')).toBe('22px');
    await expect(page.locator('.mapping-page .mapping-top p').first()).toHaveText(new RegExp(`^The mapping of the ${expectedProject} project( for .+)? · ${mappingFile.replace('.', '\\.')}$`));
    await expect(page.getByRole('button', { name: 'Show query', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export agent context', exact: true }).first()).toBeVisible();
    await expect(page.locator('.mapping-layers .mapping-layer-label')).toHaveText(LAYERS);
    const columns = await page
      .locator('.mapping-columns')
      .first()
      .evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
    expect((await page.locator('.mapping-concepts').first().boundingBox())!.width).toBe(300);
    await expect(page.locator('.mapping-detail .mapping-card')).toHaveCount(4);
    await expect(page.getByPlaceholder('Find a concept', { exact: true })).toBeVisible();
    await expect(page.locator('.mapping-concepts .mapping-concept').first()).toContainText('All concepts');
    expect(await page.locator('.mapping-concepts .mapping-concept').count()).toBeLessThanOrEqual(8);
    await expect(page.locator('.mapping-concepts .mapping-show-more button').first()).toHaveText(/^Show all \d+ concepts$/);
    const headings = await page.locator('.mapping-detail .mapping-card h3').allTextContents();
    expect(headings[0]).toMatch(/Concept/);
    expect(headings[1]).toMatch(/^Where .+ lives\d+ bindings? in \d+ datasets?$/);
    expect(headings[2]).toMatch(/^Metrics bound to /);
    expect(headings[3]).toMatch(/^AI contextwhat an agent receives for /);
  });
  await check(`${label}: the tab scrolls as one page, nothing in it scrolls on its own and no label ends in an ellipsis`, async () => {
    expect(await nestedScrollBoxes(page, '.mapping-explorer')).toEqual([]);
    expect(await ellipsisProblems(page, '.mapping-explorer')).toEqual([]);
    expect(await sidewaysOverflowProblems(page, '.mapping-explorer')).toEqual([]);
  });
}

async function mappingDataChecks(page: Page, label: string, expectations: { definition: boolean; datasets: boolean; metrics: boolean }) {
  await check(`${label}: a concept has its definition, datasets with fields, metrics and a full AI context from the agent API`, async () => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    const first = page
      .locator('.mapping-concepts .mapping-concept[aria-pressed="false"]')
      .filter({ hasText: /[1-9]\d* bindings?$/ })
      .first();
    const name = ((await first.textContent()) ?? '').replace(/\d+ bindings?$/, '').trim();
    await first.click();
    await expect(page.locator('.mapping-detail .mapping-card h3').first()).toContainText(name);
    await expect(page.locator('.mapping-ai div')).toHaveCount(4);
    for (const line of await page.locator('.mapping-ai div').allTextContents()) expect(line.trim().length).toBeGreaterThan(8);
    const contextRequests = requests.filter(url => url.includes('/api/agent/context'));
    expect(
      contextRequests.some(url => new URL(url).searchParams.get('concept') === name),
      `concept ${name} in ${contextRequests.join(' ')}`,
    ).toBe(true);
    if (expectations.definition) await expect(page.locator('.mapping-definition')).not.toContainText('gives this concept no definition');
    if (expectations.datasets) {
      await expect(page.locator('.mapping-dataset-row').first()).toBeVisible();
      expect(await page.locator('.mapping-dataset-row').count()).toBeLessThanOrEqual(3);
      await expect(page.locator('.mapping-dataset-row .mapping-binding .mapping-expression').first()).not.toHaveText('');
    }
    if (expectations.metrics) await expect(page.locator('.mapping-chip').first()).toBeVisible();
    await expect(page.locator('.mapping-ai')).not.toContainText('No datasets are bound');
  });
}

/** Checks the lineage of the first binding of the selected concept, its provenance link and the sideways overflow of the card. */
async function bindingLineageChecks(page: Page, label: string, concept: RegExp, mappingFile: string) {
  await check(`${label}: a binding shows its chain, expression and provenance, and Open in Source lands on the mapping file`, async () => {
    await page.locator('.mapping-concepts .mapping-concept', { hasText: concept }).click();
    const block = page.locator('.mapping-dataset-row').first();
    const binding = block.locator('.mapping-binding').first();
    await expect(binding).toBeVisible();
    expect(await block.locator('.mapping-binding').count()).toBeLessThanOrEqual(2);
    expect(await page.locator('.mapping-dataset-row').count()).toBeLessThanOrEqual(3);
    const labels = await binding.locator('.mapping-chain-step small').allTextContents();
    expect(labels.slice(0, 1)).toEqual(['Concept']);
    expect(labels.slice(-3)).toEqual(['Field', 'Dataset', 'Physical source']);
    for (const value of await binding.locator('.mapping-chain-step span').allTextContents()) expect(value.trim()).not.toBe('');
    await expect(binding.locator('.mapping-expression')).not.toHaveText('');
    await expect(binding.locator('.mapping-provenance')).toContainText(new RegExp(`${mappingFile.replaceAll('.', '\\.')} · /concept_mappings/\\d+/.+ ·\\s*Open in Source$`));
    expect(await sidewaysOverflowProblems(page, '.mapping-detail')).toEqual([]);
    expect(await ellipsisProblems(page, '.mapping-detail')).toEqual([]);
    await binding.getByRole('button', { name: 'Open in Source', exact: true }).click();
    await expect(page.locator('.workspace-title h1')).toHaveText(mappingFile);
    await expect(page.getByLabel('Definition source')).toBeVisible();
    await expect(page.locator('.cm-activeLine')).toContainText('expression');
    await tab(page, 'Mappings').click();
    await expect(page.locator('.mapping-detail .mapping-card').first()).toBeVisible();
  });
}

/** Checks that Show all reveals every binding of a dataset and Show fewer folds them back. */
async function showAllBindingsChecks(page: Page, concept: RegExp) {
  await check('UBL: Show all bindings expands one dataset, keeps the card inside its column and folds back', async () => {
    await page.locator('.mapping-concepts .mapping-concept', { hasText: concept }).click();
    const block = page.locator('.mapping-dataset-row').first();
    const showAll = block.getByRole('button', { name: /^Show all \d+ bindings in .+$/ });
    const total = Number(/^Show all (\d+) bindings/.exec((await showAll.textContent()) ?? '')![1]);
    expect(total).toBeGreaterThan(2);
    await expect(block.locator('.mapping-dataset-name')).toContainText(`${total} bindings`);
    await showAll.click();
    await expect(block.locator('.mapping-binding')).toHaveCount(total);
    expect(await sidewaysOverflowProblems(page, '.mapping-detail')).toEqual([]);
    expect(await nestedScrollBoxes(page, '.mapping-explorer')).toEqual([]);
    await expect(page.locator('.mapping-detail')).not.toContainText('Conditional population mapping');
    await block.getByRole('button', { name: 'Show fewer', exact: true }).click();
    await expect(block.locator('.mapping-binding')).toHaveCount(2);
  });
}

try {
  await check('the header with no file open shows the prompt, More actions and no Commit', async () => {
    const empty = await newPage();
    await empty.goto(appUrl());
    await expect(empty.locator('.workspace-title h1')).toHaveText('Open a file from Projects');
    await expect(empty.getByRole('button', { name: 'Commit', exact: true })).toHaveCount(0);
    await expect(empty.getByRole('button', { name: 'More actions', exact: true })).toBeVisible();
    await expect(empty.getByRole('button', { name: 'Account and Admin', exact: true })).toHaveCount(0);
    expect((await empty.locator('header.workspace-header').boundingBox())!.height).toBe(60);
    expect(await style(empty, '.workspace-title h1', 'font-weight')).toBe('500');
    expect(await style(empty, '.workspace-title h1', 'color')).toBe('rgb(86, 108, 101)');
    expect(await ellipsisProblems(empty)).toEqual([]);
    await empty.close();
  });

  await api.ws.loadExample('ubl');
  const page = await newPage();
  await page.goto(appUrl());
  await openFile(page, 'UBL business model', 'ubl.ontology.yaml');
  await headerChecks(page);
  await check('no menu item, label or placeholder ends in an ellipsis in the header, the sidebar and their menus', async () => {
    const found = [...(await ellipsisProblems(page))];
    const menus: [string, () => Promise<void>][] = [
      ['More actions', () => page.getByRole('button', { name: 'More actions', exact: true }).click()],
      ['Add project', async () => void (await showSidebar(page), await page.getByRole('button', { name: 'Add project', exact: true }).click())],
    ];
    for (const [name, open] of menus) {
      for (const text of await menuItemTexts(page, open)) if (/…|\.\.\./.test(text)) found.push(`${name} menu item "${text}"`);
    }
    await (await example(page, /UBL business model/)).hover();
    found.push(...(await ellipsisProblems(page)));
    await page.keyboard.press('Escape');
    expect(found).toEqual([]);
  });
  await editingChecks(page);
  await openFile(page, 'UBL business model', 'ubl.ontology.yaml');
  await showMappings(page);
  await mappingStructureChecks(page, 'UBL (ontology open)', 'UBL business model', 'ubl.semantic-mapping.yaml');
  await mappingDataChecks(page, 'UBL', { definition: true, datasets: true, metrics: false });
  await check('UBL: Order shows its governed metric and a non-empty AI context', async () => {
    await page.locator('.mapping-concepts .mapping-concept', { hasText: /^Order\s*\d/ }).click();
    await expect(page.locator('.mapping-detail .mapping-card h3').nth(1)).toContainText('Where Order lives');
    await expect(page.locator('.mapping-chip').first()).toBeVisible();
    await expect(page.locator('.mapping-ai')).toContainText('governed metric');
  });
  await bindingLineageChecks(page, 'UBL Order', /^Order\s*\d/, 'ubl.semantic-mapping.yaml');
  await showAllBindingsChecks(page, /^Order\s*\d/);
  await openFile(page, 'UBL business model', 'ubl.semantic-mapping.yaml');
  await showMappings(page);
  await mappingStructureChecks(page, 'UBL (mapping open)', 'UBL business model', 'ubl.semantic-mapping.yaml');
  await expect(page.locator('.mapping-page .mapping-top p').first()).not.toContainText(' for ');

  await api.ws.loadExample('commerce');
  await page.reload();
  await openFile(page, 'Commerce workspace', 'sales.ossie.yaml');
  await showMappings(page);
  await mappingStructureChecks(page, 'commerce (semantic model open)', 'Commerce workspace', 'sales.mapping.yaml');
  await mappingDataChecks(page, 'commerce', { definition: true, datasets: false, metrics: false });
  await bindingLineageChecks(page, 'commerce Customer', /^Customer\s*\d/, 'sales.mapping.yaml');
  await openFile(page, 'Commerce workspace', 'sales.mapping.yaml');
  await showMappings(page);
  await mappingStructureChecks(page, 'commerce (mapping open)', 'Commerce workspace', 'sales.mapping.yaml');

  await api.ws.loadExample('mall');
  await page.reload();
  await openFile(page, 'Shopping center administration', 'mall.ontology.yaml');
  await showMappings(page);
  await mappingStructureChecks(page, 'mall (ontology open)', 'Shopping center administration', 'mall.mapping.yaml');
  await mappingDataChecks(page, 'mall', { definition: true, datasets: true, metrics: false });
  await bindingLineageChecks(page, 'mall Organization', /^Organization\s*\d/, 'mall.mapping.yaml');
  await openFile(page, 'Shopping center administration', 'mall.mapping.yaml');
  await showMappings(page);
  await mappingStructureChecks(page, 'mall (mapping open)', 'Shopping center administration', 'mall.mapping.yaml');

  await check('a data contract that a mapping reads as a physical source shows that mapping', async () => {
    await openFile(page, 'Shopping center administration', 'mall.odcs.yaml');
    await showSidebar(page);
    await tab(page, 'Mappings').click();
    await expect(page.locator('.mapping-page')).toHaveCount(1);
    await expect(page.locator('.mapping-explorer .empty-state')).toHaveCount(0);
    await expect(page.locator('.mapping-page .mapping-top p').first()).toContainText('for mall.odcs.yaml');
  });
  await api.ws.loadExample('ubl');
  await page.reload();
  await check('opening ubl.odcs.yaml shows the UBL mapping and not the empty message', async () => {
    await openFile(page, 'UBL business model', 'ubl.odcs.yaml');
    await showSidebar(page);
    await tab(page, 'Mappings').click();
    await expect(page.locator('.mapping-page')).not.toHaveCount(0);
    await expect(page.locator('.mapping-explorer .empty-state')).toHaveCount(0);
  });
  await check('no browser runtime errors', async () => expect(errors).toEqual([]));
  console.log(JSON.stringify({ passed, errors }));
} finally {
  await browser.close();
  await api.stop();
}

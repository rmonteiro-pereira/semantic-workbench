// Checks that nothing is cut on the Mappings tab, the header and the entity details panel at 1280
// and 390 px, that Commit explains itself while it is off, and that the details panel has no
// sideways scroll and no nested scroll box. The Admin screens are covered by tests/admin-clipping.test.tsx.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { clippedTextProblems, nestedScrollBoxes, sidewaysOverflowProblems, verticallyCutBoxes } from './helpers/clipped-text';
import { showSidebar } from './helpers/screen-tour';

const VIEWPORTS: [number, number][] = [
  [1280, 800],
  [390, 844],
];
const NOTHING_TO_COMMIT = 'Nothing to commit. Edit a file first.';

const api = await startIsolatedApi();
await api.ws.loadExample('ubl');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
await routeApi(page, api);
let passed = 0;

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

async function openUblFile(target: Page) {
  await target.goto(appUrl());
  await showSidebar(target);
  const project = target.getByRole('treeitem', { name: 'UBL business model', exact: true });
  if ((await project.getAttribute('aria-expanded')) === 'false') await project.getByRole('button', { name: 'UBL business model', exact: true }).click();
  await project.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
}

const tabButton = (name: string) => page.locator('.tabs').getByRole('button', { name, exact: true });

for (const [width, height] of VIEWPORTS) {
  await page.setViewportSize({ width, height });
  await openUblFile(page);
  await expect(page.locator('header.workspace-header')).toBeVisible();

  await check(`${width}px: the header has nothing cut and Commit explains why it is off`, async () => {
    expect(await clippedTextProblems(page, 'header.workspace-header')).toEqual([]);
    const commit = page.locator('header.workspace-header').getByRole('button', { name: 'Commit', exact: true });
    await expect(commit).toHaveAttribute('aria-disabled', 'true');
    const border = await commit.evaluate(button => getComputedStyle(button).borderTopStyle);
    expect(border).toBe('solid');
    await commit.hover();
    await expect(page.getByRole('tooltip')).toHaveText(NOTHING_TO_COMMIT);
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toBeHidden();
    await commit.focus();
    await expect(page.getByRole('tooltip')).toHaveText(NOTHING_TO_COMMIT);
  });

  await check(`${width}px: Mappings shows Show query whole and cuts nothing`, async () => {
    await tabButton('Mappings').click();
    const showQuery = page.getByRole('button', { name: 'Show query', exact: true });
    await expect(showQuery).toBeEnabled();
    expect(await clippedTextProblems(page, '.mapping-explorer')).toEqual([]);
    expect(await nestedScrollBoxes(page, '.mapping-explorer')).toEqual([]);
    expect(await verticallyCutBoxes(page, '.mapping-explorer')).toEqual([]);
    expect(await sidewaysOverflowProblems(page, '.mapping-explorer')).toEqual([]);
    await expect(page.locator('.mapping-ai')).toContainText('Order');
    // The concept list and the detail stack on a phone, and the detail stays reachable by the page's scroll.
    const listBottom = await page.locator('.mapping-concepts').evaluate(element => element.getBoundingClientRect().bottom);
    const detailTop = await page.locator('.mapping-detail').evaluate(element => element.getBoundingClientRect().top);
    if (width < 760) expect(detailTop).toBeGreaterThanOrEqual(listBottom - 1);
    else expect(await page.locator('.mapping-concepts').evaluate(element => element.clientHeight === element.scrollHeight)).toBe(true);
  });

  await check(`${width}px: entity details has no sideways scroll and no nested scroll box`, async () => {
    await tabButton('Catalog').click();
    await page
      .locator('.catalog-card')
      .filter({ hasText: /^EntityType.*Invoice/ })
      .locator('button')
      .first()
      .click();
    await expect(page.locator('.inspector .related-edges button').first()).toBeVisible();
    expect(await sidewaysOverflowProblems(page, '.inspector')).toEqual([]);
    expect(await nestedScrollBoxes(page, '.inspector')).toEqual([]);
    expect(await clippedTextProblems(page, '.inspector')).toEqual([]);
  });
}

await browser.close();
await api.stop();
console.log(JSON.stringify({ passed, errors }));
if (errors.length) throw Error(errors.join('\n'));

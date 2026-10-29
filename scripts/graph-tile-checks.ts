import { expect, type Browser, type Page } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { revealGraphControls } from './helpers/graph-options';
import { routeApi, type IsolatedApi } from './helpers/isolated-api';
import { groupRelationships } from '../src/app/graph/graph-view';
import { inspect } from '../src/shared/core/model';

// The whole-model graph groups the UBL example into area tiles. These checks read the real layout
// in the browser: whole names, tiles that do not overlap, links between areas drawn only for the
// selected entity, a toolbar whose controls are never cut off, and centred toggles.

type Box = { left: number; top: number; right: number; bottom: number };

async function openUblGraph(page: Page, api: IsolatedApi) {
  await routeApi(page, api);
  await page.goto(appUrl());
  const workspace = page.getByRole('button', { name: 'Open workspace', exact: true });
  if ((page.viewportSize()?.width ?? 0) < 1100) await workspace.click();
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: 'ubl.ontology.yaml', exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await expect(page.locator('.full-graph .react-flow__node-entity')).toHaveCount(45);
}

async function nameProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const card of document.querySelectorAll<HTMLElement>('.full-graph .full-entity')) {
      const name = card.querySelector<HTMLElement>('strong')!;
      const cardBox = card.getBoundingClientRect();
      const nameBox = name.getBoundingClientRect();
      const text = name.textContent ?? '';
      if (text.includes('…') || text.includes('...')) problems.push(`${text} ends with an ellipsis`);
      if (getComputedStyle(name).textOverflow === 'ellipsis') problems.push(`${text} uses text-overflow ellipsis`);
      if (name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1) problems.push(`${text} is clipped by its own box`);
      const outside = nameBox.left < cardBox.left - 1 || nameBox.right > cardBox.right + 1 || nameBox.top < cardBox.top - 1 || nameBox.bottom > cardBox.bottom + 1;
      if (outside) problems.push(`${text} overflows its card`);
    }
    return problems;
  });
}

async function areaBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.full-graph .react-flow__node-businessArea')].map(area => {
      const box = area.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    }),
  );
}

function overlapping(first: Box, second: Box) {
  return first.left < second.right - 1 && first.right > second.left + 1 && first.top < second.bottom - 1 && first.bottom > second.top + 1;
}

/** Ids of the drawn links whose two ends sit in different area tiles. */
async function crossAreaLinks(page: Page, connections: { id: string; source: string; target: string }[]) {
  return page.evaluate(links => {
    const areas = [...document.querySelectorAll('.full-graph .react-flow__node-businessArea')].map(area => area.getBoundingClientRect());
    const areaOfEntity = (id: string) => {
      const box = document.querySelector(`.full-graph .react-flow__node[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
      if (!box) return -1;
      const centerX = (box.left + box.right) / 2;
      const centerY = (box.top + box.bottom) / 2;
      return areas.findIndex(area => centerX >= area.left && centerX <= area.right && centerY >= area.top && centerY <= area.bottom);
    };
    const drawn = new Set([...document.querySelectorAll('.full-graph .react-flow__edge')].map(edge => edge.getAttribute('data-id')));
    return links.filter(link => drawn.has(link.id) && areaOfEntity(link.source) !== areaOfEntity(link.target)).map(link => link.id);
  }, connections);
}

export async function checkTiles(page: Page, api: IsolatedApi) {
  const ubl = inspect(await Bun.file('public/examples/ubl/ubl.ontology.yaml').text(), 'ubl.ontology.yaml');
  const connections = groupRelationships(ubl.edges);
  await openUblGraph(page, api);
  expect(await nameProblems(page)).toEqual([]);
  const boxes = await areaBoxes(page);
  expect(boxes.length).toBeGreaterThan(3);
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) expect(overlapping(boxes[first], boxes[second])).toBe(false);
  }
  await expect(page.locator('.full-graph .area-links')).toHaveCount(boxes.length);
  await expect(page.locator('.full-graph .area-links').first()).toHaveText(/^(links to \d+ areas?|no links to other areas)$/);
  expect(await crossAreaLinks(page, connections)).toEqual([]);
  const drawnBefore = await page.locator('.full-graph .react-flow__edge').count();
  expect(drawnBefore).toBeGreaterThan(0);
  const invoice = ubl.entities.find(entity => entity.name === 'Invoice')!;
  await page.locator(`.full-graph .react-flow__node[data-id="${invoice.id}"]`).click();
  await expect.poll(() => crossAreaLinks(page, connections)).not.toEqual([]);
  const around = connections.filter(connection => connection.source === invoice.id || connection.target === invoice.id).map(connection => connection.id);
  for (const id of await crossAreaLinks(page, connections)) expect(around).toContain(id);
  expect(await page.locator('.full-graph .react-flow__edge').count()).toBeGreaterThan(drawnBefore);
}

// The drop-down arrow of a select takes about this much of its width.
const SELECT_ARROW_WIDTH = 18;

async function toolbarProblems(page: Page) {
  return page.evaluate(SELECT_ARROW_WIDTH => {
    const problems: string[] = [];
    const toolbar = document.querySelector<HTMLElement>('.full-graph-tools')!;
    const frame = toolbar.getBoundingClientRect();
    if (toolbar.scrollWidth > toolbar.clientWidth + 1) problems.push('the toolbar scrolls sideways');
    for (const control of toolbar.querySelectorAll<HTMLElement>('button, select')) {
      const box = control.getBoundingClientRect();
      const label = control.textContent?.trim() || control.getAttribute('aria-label') || control.tagName;
      if (box.width === 0) continue;
      if (box.left < frame.left - 1 || box.right > frame.right + 1 || box.right > window.innerWidth + 1) problems.push(`${label} is cut off by the toolbar`);
      if (control.scrollWidth > control.clientWidth + 1) problems.push(`${label} has a clipped label`);
      if (control instanceof HTMLSelectElement) {
        // A select hides the end of its text without any overflow, so measure the chosen option.
        const style = getComputedStyle(control);
        const ruler = document.createElement('span');
        ruler.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${style.font}`;
        ruler.textContent = control.selectedOptions[0]?.textContent ?? '';
        document.body.append(ruler);
        const textWidth = ruler.getBoundingClientRect().width;
        ruler.remove();
        const room = control.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - SELECT_ARROW_WIDTH;
        if (textWidth > room + 1) problems.push(`${ruler.textContent} is cut off inside its select`);
      }
    }
    return problems;
  }, SELECT_ARROW_WIDTH);
}

export async function checkToolbar(page: Page, api: IsolatedApi) {
  await openUblGraph(page, api);
  expect(await toolbarProblems(page)).toEqual([]);
  await revealGraphControls(page);
  expect(await toolbarProblems(page)).toEqual([]);
}

export async function checkToggleCentring(page: Page, api: IsolatedApi) {
  await openUblGraph(page, api);
  await revealGraphControls(page);
  const gaps = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.full-graph-tools .show-toggle[aria-pressed="false"]')].map(toggle => {
      const walker = document.createTreeWalker(toggle, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode()!;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const text = range.getBoundingClientRect();
      const box = toggle.getBoundingClientRect();
      return { label: textNode.textContent, left: text.left - box.left, right: box.right - text.right };
    }),
  );
  expect(gaps.length).toBeGreaterThan(0);
  for (const gap of gaps) expect(Math.abs(gap.left - gap.right), `${gap.label} sits off-centre`).toBeLessThanOrEqual(1);
}

/** Runs the tile, name, toolbar and toggle checks at laptop and phone widths. */
export async function checkGraphTiles(browser: Browser, api: IsolatedApi) {
  const sizes = [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ];
  for (const viewport of sizes) {
    const page = await browser.newPage({ viewport });
    try {
      await checkToolbar(page, api);
      await checkToggleCentring(page, api);
      if (viewport.width >= 1100) await checkTiles(page, api);
    } finally {
      await page.close();
    }
  }
  console.log('PASS graph area tiles: whole names, no overlap, cross-area links on selection, wrapping toolbar, centred toggles');
}

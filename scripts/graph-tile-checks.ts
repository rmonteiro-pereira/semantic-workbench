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

async function openGraph(page: Page, api: IsolatedApi, filename = 'ubl.ontology.yaml') {
  await routeApi(page, api);
  await page.goto(appUrl());
  const workspace = page.getByRole('button', { name: 'Open workspace', exact: true });
  if ((page.viewportSize()?.width ?? 0) < 1100) await workspace.click();
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: filename, exact: true }).click();
  await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await expect(page.locator('.full-graph .react-flow__node-entity').first()).toBeVisible();
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
      const nodeWidth = card.closest<HTMLElement>('.react-flow__node')!.getBoundingClientRect().width;
      if (Math.abs(cardBox.width - nodeWidth) > 1) problems.push(`${text} card is ${cardBox.width}px inside a ${nodeWidth}px node`);
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
  await openGraph(page, api);
  await expect(page.locator('.full-graph .react-flow__node-entity')).toHaveCount(45);
  expect(await nameProblems(page)).toEqual([]);
  const boxes = await areaBoxes(page);
  expect(boxes.length).toBeGreaterThan(3);
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) expect(overlapping(boxes[first], boxes[second])).toBe(false);
  }
  await expect(page.locator('.full-graph .area-links')).toHaveCount(boxes.length);
  await expect(page.locator('.full-graph .area-links').first()).toHaveText(/^(links to \d+ areas?|no links to other areas)$/);
  expect(await crossAreaLinks(page, connections)).toEqual([]);
  // Edges are drawn once the first fit has moved the view, so wait for them instead of counting at once.
  await expect.poll(() => page.locator('.full-graph .react-flow__edge').count()).toBeGreaterThan(0);
  const drawnBefore = await page.locator('.full-graph .react-flow__edge').count();
  const invoice = ubl.entities.find(entity => entity.name === 'Invoice')!;
  await page.locator(`.full-graph .react-flow__node[data-id="${invoice.id}"]`).click();
  const around = connections.filter(connection => connection.source === invoice.id || connection.target === invoice.id).map(connection => connection.id);
  // The links drawn for the previous selection leave a moment after the click, so wait for the settled set.
  const strayLinks = async () => (await crossAreaLinks(page, connections)).filter(id => !around.includes(id));
  await expect.poll(() => crossAreaLinks(page, connections)).not.toEqual([]);
  await expect.poll(strayLinks).toEqual([]);
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
  await openGraph(page, api);
  expect(await toolbarProblems(page)).toEqual([]);
  await revealGraphControls(page);
  expect(await toolbarProblems(page)).toEqual([]);
}

export async function checkToggleCentring(page: Page, api: IsolatedApi) {
  await openGraph(page, api);
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

// Names and titles smaller than this on screen are too small to read.
const SMALLEST_READABLE_PX = 10;

/** The smallest on-screen size, in pixels, of the entity names, area titles and area link summaries. */
async function shownTextSizes(page: Page) {
  return page.evaluate(() => {
    const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform).a;
    const smallest = (selector: string) => Math.min(...[...document.querySelectorAll<HTMLElement>(selector)].map(element => parseFloat(getComputedStyle(element).fontSize) * zoom));
    return {
      entityName: smallest('.full-graph .full-entity strong'),
      areaTitle: smallest('.full-graph .full-area-title strong'),
      areaLinks: smallest('.full-graph .area-links'),
    };
  });
}

/** After Fit model, entity names at laptop width and area titles at phone width stay readable. */
export async function checkFittedTextSizes(browser: Browser, api: IsolatedApi) {
  const laptop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await openGraph(laptop, api);
    const sizes = await shownTextSizes(laptop);
    expect(sizes.entityName, 'the smallest entity name at 1440 px').toBeGreaterThanOrEqual(SMALLEST_READABLE_PX);
    expect(sizes.areaTitle, 'the smallest area title at 1440 px').toBeGreaterThanOrEqual(SMALLEST_READABLE_PX);
  } finally {
    await laptop.close();
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await openGraph(phone, api, 'commerce-scale.ttl');
    const sizes = await shownTextSizes(phone);
    expect(sizes.areaTitle, 'the smallest area title at 390 px').toBeGreaterThanOrEqual(SMALLEST_READABLE_PX);
  } finally {
    await phone.close();
  }
  console.log('PASS graph text sizes: entity names and area titles stay at 10 px or more after Fit model');
}

/** The position, inside its area, that a card is laid out at, read from the card's own transform. */
async function cardPosition(page: Page, cardIndex: number) {
  return page
    .locator('.full-graph .react-flow__node-entity')
    .nth(cardIndex)
    .evaluate(card => new DOMMatrix(getComputedStyle(card).transform).toString());
}

/** A card dragged by hand stays where it was dropped when the sidebar is hidden and shown again. */
export async function checkDragSurvivesResize(browser: Browser, api: IsolatedApi) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await openGraph(page, api);
    const card = page.locator('.full-graph .react-flow__node-entity').first();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    const dropped = await cardPosition(page, 0);
    await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
    await page.getByRole('button', { name: 'Show sidebar', exact: true }).click();
    await page.waitForTimeout(600);
    expect(await cardPosition(page, 0), 'the dragged card moved when the sidebar was toggled').toBe(dropped);
  } finally {
    await page.close();
  }
  console.log('PASS graph resize: a dragged card keeps its position when the sidebar is toggled');
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
  await checkFittedTextSizes(browser, api);
  await checkDragSurvivesResize(browser, api);
  console.log('PASS graph area tiles: whole names, no overlap, cross-area links on selection, wrapping toolbar, centred toggles');
}

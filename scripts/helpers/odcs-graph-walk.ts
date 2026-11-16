/** Exercises readable card targets and fitted-card selection through native canvas gestures. */
import { expect, type Locator, type Page } from '@playwright/test';
import { NAME_MIN_PX } from '../../src/app/odcs/lineage-view';

/** Zooms around a compact card until its detailed rows and actions return. */
export async function showCardDetails(page: Page, card: Locator) {
  if (await card.evaluate(element => element.classList.contains('lineage-card-overview'))) {
    const cardBox = (await card.boundingBox())!;
    const pane = page.locator('.lineage-view .react-flow');
    const pan = await pane.evaluate(element => {
      const box = element.getBoundingClientRect();
      for (const vertical of [0.5, 0.1, 0.9]) {
        for (const horizontal of [0.5, 0.1, 0.9]) {
          const x = box.left + box.width * horizontal;
          const y = box.top + box.height * vertical;
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y, centerX: box.left + box.width / 2, centerY: box.top + box.height / 2 };
        }
      }
      return null;
    });
    expect(pan).not.toBeNull();
    await page.mouse.move(pan!.x, pan!.y);
    await page.mouse.down();
    await page.mouse.move(pan!.x + pan!.centerX - cardBox.x - cardBox.width / 2, pan!.y + pan!.centerY - cardBox.y - cardBox.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  for (let step = 0; step < 20 && (await card.evaluate(element => element.classList.contains('lineage-card-overview'))); step++) {
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);
  }
  await expect(card).not.toHaveClass(/lineage-card-overview/);
  await expect(page.locator('.lineage-toolbar')).toBeEnabled();
}

/** Requires each drawn card to be whole, with a compensated name at least nine screen pixels. */
async function overviewReport(page: Page) {
  return page.locator('.lineage-view').evaluate(view => {
    const pane = view.querySelector('.react-flow')!.getBoundingClientRect();
    const viewport = view.querySelector('.react-flow__viewport')!;
    const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a;
    return [...view.querySelectorAll('.lineage-card')].map(card => {
      const rect = card.getBoundingClientRect();
      const name = card.querySelector('strong')!;
      return {
        name: card.getAttribute('aria-label'),
        pixels: parseFloat(getComputedStyle(name).fontSize) * zoom,
        whole: rect.left >= pane.left - 1 && rect.right <= pane.right + 1 && rect.top >= pane.top - 1 && rect.bottom <= pane.bottom + 1,
      };
    });
  });
}

/** Requires each drawn card to be whole, with a compensated name at least nine screen pixels. */
export async function checkOverviewNames(page: Page) {
  const report = await overviewReport(page);
  expect(report.length).toBeGreaterThan(0);
  for (const card of report) {
    expect(card.whole, card.name ?? 'card').toBe(true);
    expect(card.pixels, card.name ?? 'card').toBeGreaterThanOrEqual(NAME_MIN_PX - 0.01);
  }
}

/** Fits the current reach and waits for the compact layout, handles and viewport. */
export async function fitOverview(page: Page) {
  const view = page.locator('.lineage-view');
  await view.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(view.locator('.lineage-card-overview').first()).toBeVisible();
  await expect(view.locator('.lineage-toolbar')).toBeEnabled();
  await page.waitForTimeout(300);
  await expect
    .poll(async () => {
      const cards = await overviewReport(page);
      return cards.length > 0 && cards.every(card => card.whole && card.pixels >= NAME_MIN_PX - 0.01);
    })
    .toBe(true);
  await checkOverviewNames(page);
}

/** Proves four contained readable Walk targets without scrolling the page. */
export async function checkReadableWalks(page: Page, capture?: (stage: string) => Promise<void>) {
  await fitOverview(page);
  const view = page.locator('.lineage-view');
  const original = await view.locator('.lineage-card.center').getAttribute('data-id');
  const targets = await view.locator('.lineage-card:not(.center):not(.group)[aria-label^="Table "]').evaluateAll(cards => cards.slice(0, 4).map(card => card.getAttribute('data-id')!));
  expect(targets).toHaveLength(4);
  const scroll = await page.evaluate(() => scrollY);
  for (const [index, id] of targets.entries()) {
    await fitOverview(page);
    const card = view.locator(`.lineage-card[data-id=${JSON.stringify(id)}]`);
    await showCardDetails(page, card);
    const button = card.getByRole('button', { name: 'Walk here', exact: true });
    const target = await button.evaluate(element => {
      const box = element.getBoundingClientRect();
      const pane = element.closest('.react-flow')!.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return {
        width: box.width,
        height: box.height,
        inside: box.left >= pane.left && box.right <= pane.right && box.top >= pane.top && box.bottom <= pane.bottom,
        uncovered: !!hit && element.contains(hit),
      };
    });
    expect(target.width).toBeGreaterThanOrEqual(24);
    expect(target.height).toBeGreaterThanOrEqual(24);
    expect(target.inside).toBe(true);
    expect(target.uncovered).toBe(true);
    await capture?.(`readable-${index + 1}-before`);
    await button.click();
    await expect(view.locator('.lineage-card.center')).toHaveAttribute('data-id', id);
    await page.waitForTimeout(700);
    await expect(view.locator('.lineage-toolbar')).toBeEnabled();
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await capture?.(`readable-${index + 1}-after`);
    console.log(`PASS readable Walk ${index + 1}/4: ${id}; ${target.width.toFixed(2)}×${target.height.toFixed(2)} px`);
    await view.getByLabel('Walk', { exact: true }).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(view.locator('.lineage-card.center')).toHaveAttribute('data-id', original!);
    await page.waitForTimeout(700);
  }
}

/** Proves that a selectable fitted card offers a native-size Walk action. */
export async function checkFittedWalk(page: Page, capture?: (stage: string) => Promise<void>) {
  await fitOverview(page);
  const view = page.locator('.lineage-view');
  const card = view.locator('.lineage-card:not(.center):not(.group)').first();
  const id = await card.getAttribute('data-id');
  await capture?.('fitted-selection-before');
  await card.locator('.lineage-card-title').click();
  const panel = page.getByRole('region', { name: 'Selected path', exact: true });
  const action = panel.getByRole('button', { name: 'Walk here', exact: true });
  await expect(action).toBeEnabled();
  const box = await action.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);
  await capture?.('fitted-selection-after');
  await action.click();
  await expect(view.locator('.lineage-card.center')).toHaveAttribute('data-id', id!);
}

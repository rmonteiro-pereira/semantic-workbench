// Authentication captures must show loaded branding and settled workspace content.
import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import { headerProblems } from './header';
import { graphCanvasProblems } from './graph-canvas-geometry';

const browserErrors = new WeakMap<Page, string[]>();

/** Retains uncaught browser errors across captures of the same authentication page. */
export function authPageErrors(page: Page): string[] {
  const existing = browserErrors.get(page);
  if (existing) return existing;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  browserErrors.set(page, errors);
  return errors;
}

async function graphBoundsProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pane = document.querySelector('.full-graph .react-flow')?.getBoundingClientRect();
    if (!pane) return [];
    const problems: string[] = [];
    const cards = [...document.querySelectorAll('.full-graph .react-flow__node')].map(node => ({
      id: node.getAttribute('data-id'),
      bounds: node.getBoundingClientRect(),
    }));
    for (const { id, bounds } of cards) {
      const outside =
        bounds.left < pane.left - 1 ||
        bounds.right > pane.right + 1 ||
        bounds.top < pane.top - 1 ||
        bounds.bottom > pane.bottom + 1;
      if (outside) problems.push(`graph card ${id} leaves its pane`);
    }
    if (cards.length) {
      const left = Math.min(...cards.map(card => card.bounds.left));
      const right = Math.max(...cards.map(card => card.bounds.right));
      const top = Math.min(...cards.map(card => card.bounds.top));
      const bottom = Math.max(...cards.map(card => card.bounds.bottom));
      const offCenterX = Math.abs(left + right - pane.left - pane.right) / 2;
      const offCenterY = Math.abs(top + bottom - pane.top - pane.bottom) / 2;
      if (offCenterX > 2 || offCenterY > 2) problems.push('the model graph is not centered');
    }
    return problems;
  });
}

/** Waits for calculation content and a fully fitted model graph before capturing a viewport. */
export async function assertAuthContentSettled(page: Page): Promise<void> {
  await expect(page.locator('.full-graph-loading')).toHaveCount(0);
  await expect(
    page.locator('.metrics-empty[role=status]').filter({ hasText: /^Explaining / }),
  ).toHaveCount(0);
  if (!(await page.locator('.full-graph').count())) return;
  await expect(page.locator('.full-graph .react-flow__node').first()).toBeVisible();
  await expect.poll(() => graphBoundsProblems(page)).toEqual([]);
  assert.deepEqual(await graphCanvasProblems(page, 'model'), []);
}

/** Requires the script-free identity page to show a decoded, visible brand image. */
export async function assertAuthBrandLoaded(page: Page): Promise<void> {
  const logo = page.locator('main .brand img');
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
}

/** Rejects a collapsed title or a header that consumes the workspace after a refusal. */
export async function assertAuthHeaderGeometry(page: Page): Promise<void> {
  if (!(await page.locator('.workspace-header').count())) return;
  assert.deepEqual(await headerProblems(page), []);
  const header = await page.locator('.workspace-header').boundingBox();
  const title = await page.locator('.workspace-title h1').boundingBox();
  assert(header && title, 'The workspace header and document title are drawn');
  assert(title.width >= 80, `The document title has only ${title.width}px of width`);
  const phone = (page.viewportSize()?.width ?? 0) < 700;
  assert(header.height <= (phone ? 180 : 120), `The header consumes ${header.height}px`);
}

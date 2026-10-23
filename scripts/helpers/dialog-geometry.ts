import { expect, type Page } from '@playwright/test';
import { geometryProblems } from './screen-tour';

/** The open dialog stays in the window and holds no small, covered or colliding text. */
export async function expectDialogGeometry(page: Page, name: string) {
  const width = page.viewportSize()!.width;
  const box = (await page.locator('dialog[open] .workbench-dialog').last().boundingBox())!;
  expect(box.x, `${name}: dialog starts inside the window`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name}: dialog ends inside the window`).toBeLessThanOrEqual(width);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `${name}: the page does not scroll sideways`,
  ).toBe(true);
  expect(await geometryProblems(page, 'dialog[open]'), `${name}: geometry`).toEqual([]);
}

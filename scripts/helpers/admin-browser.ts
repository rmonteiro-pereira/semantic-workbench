import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import { authViewports } from './sign-in';
import { layoutProblems } from './layout-geometry';
import { smallTextProblems, textCollisionProblems } from './text-geometry';
import { screenshotPath } from './screenshots';
import { ADMIN_SECTIONS } from '../../src/app/admin/admin-sections';
import { adminPageProblems } from './admin-page-geometry';

/** The sections the Admin page lists, in its navigation order. */
export const ADMIN_AREAS = ADMIN_SECTIONS.map(section => section.label);
/** The longest the scripted domain, grant and access-check steps may take together. */
export const ADMINISTRATION_TIME_LIMIT_MS = 180_000;
/** Turns an area or dialog name into the screenshot name used for it. */
export function screenshotName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');
}
/** Says whether the scripted administration steps finished inside the time limit. */
export function withinAdministrationTime(startMs: number, endMs: number): boolean {
  return endMs - startMs < ADMINISTRATION_TIME_LIMIT_MS;
}
/** Opens the Admin page from the header when it is not already shown. */
export async function openAdminPage(page: Page) {
  if (!(await page.locator('.admin-page').isVisible())) {
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
  }
  await expect(page.locator('.admin-page')).toBeVisible();
}
/** Opens a section through the real header button and the section navigation. */
export async function adminArea(page: Page, name: string) {
  await openAdminPage(page);
  await page
    .getByRole('navigation', { name: 'Admin sections', exact: true })
    .getByRole('link', { name, exact: true })
    .click();
  const area = page.getByRole('region', { name, exact: true });
  await expect(area).toBeVisible();
  await expect(area.getByRole('alert')).toHaveCount(0);
  return area;
}
/** Returns to the workspace from the Admin page, as a person does with the Back button. */
export async function leaveAdmin(page: Page) {
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await expect(page.locator('.admin-page')).toHaveCount(0);
}
/** Closes the dialog on top (a confirmation or a dry-run preview) with its cancel button. */
export async function cancelAdminDialog(page: Page, label = 'Cancel') {
  await page
    .locator('dialog[open]')
    .last()
    .getByRole('button', { name: label, exact: true })
    .click();
}
type Box = { x: number; y: number; width: number; height: number };
function insideViewport(box: Box | null, width: number, height: number): box is Box {
  return (
    !!box &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= width + 1 &&
    box.y + box.height <= height + 1
  );
}
/** Checks that the navigation, content and Back button fit the viewport without page scroll. */
async function adminPageFits(page: Page, name: string, width: number, height: number) {
  const where = `${name} at ${width}×${height}`;
  const nav = await page.locator('.admin-nav').boundingBox();
  const content = await page.locator('.admin-content').boundingBox();
  const back = await page
    .getByRole('button', { name: 'Back to workspace', exact: true })
    .boundingBox();
  assert(insideViewport(nav, width, height), `${where}: navigation leaves the viewport`);
  assert(insideViewport(content, width, height), `${where}: content leaves the viewport`);
  assert(insideViewport(back, width, height), `${where}: Back to workspace is not reachable`);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(scrollWidth <= width + 1, `${where}: page scrolls sideways (${scrollWidth})`);
  if (width <= 760) {
    assert(nav.y + nav.height <= content.y + 1, `${where}: section strip should sit above content`);
    return;
  }
  assert(nav.x + nav.width <= content.x + 1, `${where}: navigation should sit left of content`);
  assert(content.width > width / 2, `${where}: content should use the width beside the navigation`);
}
/** Checks that a confirmation or preview dialog fits the viewport with its footer in view. */
async function adminDialogFits(page: Page, name: string, width: number, height: number) {
  const dialog = page.locator('dialog[open]').last();
  const box = await dialog.locator('.workbench-dialog').first().boundingBox();
  assert(insideViewport(box, width, height), `${name}: dialog exceeds ${width}×${height}`);
  const footer = await dialog.locator('.dialog-footer').last().boundingBox();
  assert(
    footer && footer.y >= 0 && footer.y + footer.height <= height + 1,
    `${name}: footer clipped`,
  );
}
/**
 * Checks the Admin page, or the dialog open over it, at every supported viewport: layout,
 * text size, text collisions, containment and the way back to the workspace.
 */
export async function adminGeometry(page: Page, name: string) {
  for (const [width, height] of authViewports) {
    await page.setViewportSize({ width, height });
    const dialogOpen = (await page.locator('dialog[open]').count()) > 0;
    const scope = dialogOpen ? 'dialog[open]' : '.admin-page';
    if (dialogOpen) await adminDialogFits(page, name, width, height);
    else {
      await adminPageFits(page, name, width, height);
      assert.deepEqual(await adminPageProblems(page), [], name);
    }
    assert.deepEqual(await layoutProblems(page), [], `${name} at ${width}×${height}`);
    assert.deepEqual(
      await smallTextProblems(page, scope),
      [],
      `${name} text size at ${width}×${height}`,
    );
    assert.deepEqual(
      await textCollisionProblems(page, scope),
      [],
      `${name} text collisions at ${width}×${height}`,
    );
    await page.screenshot({ path: screenshotPath(`/tmp/workbench-admin-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

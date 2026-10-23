import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import { authViewports } from './sign-in';
import { layoutProblems } from './layout-geometry';
import { smallTextProblems, textCollisionProblems } from './text-geometry';
import { screenshotPath } from './screenshots';

/** The areas the launcher lists, in its order. */
export const ADMIN_AREAS = [
  'Users & groups',
  'Roles & access',
  'Policies',
  'Access check',
  'Projects',
  'Audit',
  'Settings',
] as const;
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
/** Opens an area through the actual header and launcher. */
export async function adminArea(page: Page, name: string) {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Admin', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  return dialog;
}
/** Closes the current area and launcher, restoring the header trigger. */
export async function closeAdminArea(page: Page, name: string) {
  await page
    .getByRole('dialog', { name, exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Admin', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
}
/** Checks all supported dialog sizes, focus containment and persistent footer geometry. */
export async function adminGeometry(page: Page, name: string) {
  for (const [width, height] of authViewports) {
    await page.setViewportSize({ width, height });
    // A dialog opened from another one replaces it on screen: one panel, one Close button.
    await expect(page.locator('dialog[open] .workbench-dialog:visible')).toHaveCount(1);
    const dialog = page.locator('dialog').last();
    const box = await dialog.locator('.workbench-dialog').first().boundingBox();
    assert(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1,
      `${name}: dialog exceeds ${width}×${height}`,
    );
    const footer = await dialog.locator('.dialog-footer').last().boundingBox();
    assert(
      footer && footer.y >= 0 && footer.y + footer.height <= height + 1,
      `${name}: footer clipped`,
    );
    assert.deepEqual(
      await layoutProblems(page, { ignore: 'dialog:not(:last-of-type) *' }),
      [],
      `${name} at ${width}×${height}`,
    );
    assert.deepEqual(
      await smallTextProblems(page, 'dialog[open]'),
      [],
      `${name} text size at ${width}×${height}`,
    );
    assert.deepEqual(
      await textCollisionProblems(page, 'dialog[open]'),
      [],
      `${name} text collisions at ${width}×${height}`,
    );
    await page.screenshot({ path: screenshotPath(`/tmp/workbench-admin-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

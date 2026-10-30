// Checks that no Admin button, label or chosen select value is cut at 1280 and 390 px, using the same canned API as the geometry test.
import { afterAll, beforeAll, test } from 'bun:test';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { adminMockState, openAdminHarness } from './helpers/admin-api-mock';
import { ADMIN_AREAS, adminArea, openAdminPage } from '../scripts/helpers/admin-browser';
import { clippedTextProblems } from '../scripts/helpers/clipped-text';

const WIDTHS: [number, number][] = [
  [1280, 800],
  [390, 844],
];
let browser: Browser | undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

/** A fresh page at one width, since the harness drops the Admin page when the window is resized. */
async function openAdminAt(width: number, height: number): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width, height } });
  await openAdminHarness(page, adminMockState());
  await openAdminPage(page);
  return page;
}

test('every Admin section cuts nothing at 1280 and 390 px', async () => {
  for (const [width, height] of WIDTHS) {
    const page = await openAdminAt(width, height);
    for (const area of ADMIN_AREAS) {
      await adminArea(page, area);
      expect({ width, area, problems: await clippedTextProblems(page, '.admin-page') }).toEqual({ width, area, problems: [] });
    }
    await page.close();
  }
}, 180_000);

test('the Applies to select of a grant shows its whole value at both widths', async () => {
  for (const [width, height] of WIDTHS) {
    const page = await openAdminAt(width, height);
    const grants = await adminArea(page, 'Access grants');
    await grants.getByRole('button', { name: 'Add grant', exact: true }).click();
    const pane = page.getByRole('region', { name: 'Add grant', exact: true });
    const appliesTo = pane.getByLabel('Applies to', { exact: true });
    await expect(appliesTo).toBeVisible();
    const fit = await appliesTo.evaluate(select => {
      const probe = document.createElement('canvas').getContext('2d')!;
      const style = getComputedStyle(select);
      probe.font = style.font;
      const longest = Math.max(...[...(select as HTMLSelectElement).options].map(option => probe.measureText(option.text).width));
      return { width: select.getBoundingClientRect().width, longest };
    });
    expect(fit.width).toBeGreaterThanOrEqual(fit.longest);
    expect(await clippedTextProblems(page, '.admin-page')).toEqual([]);
    await page.close();
  }
}, 120_000);

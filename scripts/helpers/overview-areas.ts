// Reads the Overview area cards for the browser suites.
import { expect, type Page } from '@playwright/test';

/** How many entities the area cards report in all. A card lists at most eight, so this reads the counts in the card headers. */
export async function areaEntityTotal(page: Page): Promise<number> {
  const counts = await page.locator('.area-count').allTextContents();
  return counts.reduce((total, text) => total + Number.parseInt(text, 10), 0);
}

/** Waits until the area cards report this many entities in all. */
export async function expectAreaEntityTotal(page: Page, total: number, timeout = 5000): Promise<void> {
  await expect.poll(() => areaEntityTotal(page), { timeout }).toBe(total);
}

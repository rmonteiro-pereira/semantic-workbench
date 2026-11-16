/** Exercises graph opening decisions with real rendered names and delayed layout publication. */
import { expect } from 'bun:test';
import { chromium } from '@playwright/test';

const [candidate, category] = process.argv.slice(2);
const module = await import(candidate);
if (category === 'graph-capacity') {
  expect(module.startsCollapsed(45, 8.9)).toBe(true);
  expect(module.startsCollapsed(45, 9)).toBe(false);
  expect(module.startsCollapsed(195, 9.5)).toBe(false);
} else {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent('<strong style="font:16px sans-serif">Document reference</strong>');
    let publication: Promise<void> | undefined;
    const afterPaint = () => {
      publication = page.waitForTimeout(20).then(() =>
        page.locator('strong').evaluate(element => {
          element.style.transform = 'scale(0.4)';
          element.style.display = 'block';
        }),
      );
      return publication;
    };
    const measure = () => page.locator('strong').evaluate(element => element.getBoundingClientRect().height);
    const decision = await module.measureGraphOpening(45, measure, afterPaint);
    await publication;
    expect(decision.minimumName).toBeLessThan(9);
    expect(decision.collapsed).toBe(true);
  } finally {
    await browser.close();
  }
}

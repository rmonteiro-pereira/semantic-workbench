import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, expect as browserExpect, type Browser } from '@playwright/test';
import { recordResizeErrors } from '../scripts/helpers/resize-errors';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test('resize-loop reports are recorded without cancelling the original error event', async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  try {
    await recordResizeErrors(page, message => errors.push(message));
    await page.goto('data:text/html,<main>Resize reporting</main>');
    const prevented = await page.evaluate(() => {
      const event = new ErrorEvent('error', {
        message: 'ResizeObserver loop completed with undelivered notifications.',
        cancelable: true,
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    await browserExpect.poll(() => errors).toEqual(['ResizeObserver loop completed with undelivered notifications.']);
    expect(prevented).toBe(false);
  } finally {
    await page.close();
  }
});

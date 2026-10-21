import { test, expect, beforeAll, afterAll } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
// Dialog conventions (T012): the shared Modal in a real browser. Escape closes it through onCancel,
// focus returns to the opener, the footer slot renders after the body and size variants set a class.
let browser: Browser;
let page: Page;
beforeAll(async () => {
  const built = await Bun.build({
    entrypoints: ['tests/harness/modal-harness.tsx'],
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  if (!built.success) throw Error(built.logs.map(String).join('\n'));
  const js = await built.outputs[0].text();
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: js });
}, 30_000);
afterAll(async () => {
  await browser?.close();
});
test('Escape closes the dialog through onCancel and focus returns to the opener', async () => {
  const opener = page.getByRole('button', { name: 'Open dialog' });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Example' });
  expect(await dialog.isVisible()).toBe(true);
  expect(await dialog.getAttribute('aria-modal')).toBe('true');
  await page.keyboard.press('Escape');
  expect(await dialog.count()).toBe(0);
  expect(await page.getByLabel('Log').textContent()).toBe('cancel');
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Open dialog');
}, 20_000);
test('size variant and footer slot', async () => {
  await page.getByRole('button', { name: 'Open dialog' }).click();
  const section = page.locator('dialog section.workbench-dialog');
  expect(await section.getAttribute('class')).toContain('size-large');
  const footer = section.locator('footer.dialog-footer');
  expect(await footer.getByRole('button', { name: 'Done' }).count()).toBe(1);
  // the footer comes after the body
  expect(await section.evaluate(s => s.lastElementChild?.tagName)).toBe('FOOTER');
  await footer.getByRole('button', { name: 'Done' }).click();
  expect(await page.getByRole('dialog').count()).toBe(0);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Open dialog');
}, 20_000);

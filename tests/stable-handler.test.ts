/** Verifies stable callback identity and fresh handlers after React commits. */
import { expect, test } from 'bun:test';
import { chromium } from '@playwright/test';

test('A retained hook callback calls the newest handler after the parent re-renders', async () => {
  const built = await Bun.build({
    entrypoints: ['tests/harness/StableHandlerHarness.tsx'],
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  if (!built.success) throw new Error(built.logs.map(String).join('\n'));
  const script = await built.outputs[0].text();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: script });
    const callHandler = page.getByRole('button', { name: 'Call original handler' });
    await callHandler.click();
    expect(await page.getByLabel('Result').textContent()).toBe('Orders: 2');
    expect(await page.getByLabel('Stable identity').textContent()).toBe('true');

    await page.getByRole('button', { name: 'Replace handler' }).click();
    expect(await page.getByLabel('Handler version').textContent()).toBe('2');
    expect(await page.getByLabel('Stable identity').textContent()).toBe('true');
    await callHandler.click();
    expect(await page.getByLabel('Result').textContent()).toBe('Orders: 4');
  } finally {
    await browser.close();
  }
}, 30_000);

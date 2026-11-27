/** Verifies that a file which starts to declare the Ossie 0.3 draft after it was opened is checked once the draft checks load. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { chromium, expect as expectPage } from '@playwright/test';

test('a file edited to declare the draft is checked again when the draft checks arrive, instead of waiting for good', async () => {
  // Bundled in a child process: inside the test runner the bundler cannot resolve the shared Tessera modules.
  const built = Bun.spawnSync([process.execPath, 'build', 'tests/harness/draft-validation-harness.tsx', '--target=browser', '--define', 'process.env.NODE_ENV="development"']);
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
  const script = built.stdout.toString();
  const after = readFileSync('tests/fixtures/ossie-0.3/sales.semantic.yaml', 'utf8');
  const before = after.replace('version: 0.3.0.dev0', 'version: 0.2.0.dev0');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.evaluate(sources => Object.assign(window, { sources }), { before, after });
    await page.addScriptTag({ content: script });
    const codes = page.getByLabel('Codes');
    await expectPage(codes).not.toBeEmpty();
    expect(await codes.textContent()).not.toContain('draft-checks-loading');
    await page.getByRole('button', { name: 'Declare the draft' }).click();
    await expectPage(codes).toHaveText('none', { timeout: 10_000 });
  } finally {
    await browser.close();
  }
}, 60_000);

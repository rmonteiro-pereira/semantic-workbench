/** Verifies that Escape cannot dismiss a conversion while its save is in flight, and that a finished conversion reopens only the file still in the editor. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { chromium, expect as expectPage } from '@playwright/test';
import { reopenConverted } from '../../src/app/compile/use-convert';

test('Escape during the save leaves the dialog open until the save answers', async () => {
  // Bundled in a child process: inside the test runner the bundler cannot resolve the shared Tessera modules.
  const built = Bun.spawnSync([process.execPath, 'build', 'tests/harness/base-convert-escape-harness.tsx', '--target=browser', '--define', 'process.env.NODE_ENV="development"']);
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
  const source = readFileSync('public/examples/billing/billing.mapping.yaml', 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.evaluate(sources => Object.assign(window, { sources }), { source });
    await page.addScriptTag({ content: built.stdout.toString() });
    const dialog = page.getByRole('dialog', { name: 'Convert billing.mapping.yaml to the Ossie 0.3.0 draft' });
    await page.getByLabel('I have reviewed every change.').check();
    await page.getByRole('button', { name: 'Convert to Ossie 0.3.0 draft' }).click();
    await expectPage(page.getByRole('button', { name: 'Converting' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expectPage(dialog).toBeVisible();
    await expectPage(page.getByLabel('Closed')).toHaveText('0');
    await page.evaluate(() => (window as unknown as { finishSave: () => void }).finishSave());
    await expectPage(dialog.getByText('Converted.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectPage(page.getByLabel('Closed')).toHaveText('1');
  } finally {
    await browser.close();
  }
}, 60_000);

test('a conversion that finishes after the person moved to another file does not reopen the converted file', async () => {
  const converted = { project: 'billing', path: 'billing.mapping.yaml', source: 'converted' };
  const other = { project: 'billing', path: 'billing.semantic.yaml', source: 'other' };
  let active = { project: converted.project, path: converted.path };
  let finishRefresh: (docs: (typeof converted)[]) => void = () => {};
  const opened: string[] = [];
  const pending = reopenConverted(converted, {
    refresh: () => new Promise<(typeof converted)[]>(resolve => (finishRefresh = resolve)),
    active: () => active,
    open: doc => opened.push(doc.path),
  });
  active = { project: other.project, path: other.path };
  finishRefresh([converted, other]);
  await pending;
  expect(opened).toEqual([]);
  await reopenConverted(converted, { refresh: async () => [converted, other], active: () => ({ project: converted.project, path: converted.path }), open: doc => opened.push(doc.path) });
  expect(opened).toEqual(['billing.mapping.yaml']);
});

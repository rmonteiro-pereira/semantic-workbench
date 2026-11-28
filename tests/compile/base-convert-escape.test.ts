/** Verifies that Escape cannot dismiss a conversion while its save is in flight, and that a finished conversion reopens only the file still in the editor. */
import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect as expectPage } from '@playwright/test';
import { reopenConverted } from '../../src/app/compile/use-convert';

test('Escape during the save leaves the dialog open until the save answers', async () => {
  // Bundled in a child process: inside the test runner the bundler cannot resolve the shared Tessera modules.
  // The dialog imports a stylesheet, so the bundle goes to a folder and only its script is used.
  const outdir = mkdtempSync(join(tmpdir(), 'base-convert-escape-'));
  const build = ['build', 'tests/harness/base-convert-escape-harness.tsx', '--target=browser', '--outdir', outdir, '--define', 'process.env.NODE_ENV="development"'];
  const built = Bun.spawnSync([process.execPath, ...build]);
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
  const script = readFileSync(join(outdir, 'base-convert-escape-harness.js'), 'utf8');
  rmSync(outdir, { recursive: true, force: true });
  const source = readFileSync('public/examples/billing/billing.mapping.yaml', 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.evaluate(sources => Object.assign(window, { sources }), { source });
    await page.addScriptTag({ content: script });
    const dialog = page.getByRole('dialog', { name: 'Convert billing.mapping.yaml' });
    const status = page.getByLabel('Status');
    await expectPage(status).toHaveText('review');
    await page.getByRole('button', { name: 'Convert' }).click();
    await expectPage(status).toHaveText('converting');
    await page.keyboard.press('Escape');
    await expectPage(dialog).toBeVisible();
    await expectPage(page.getByLabel('Closed')).toHaveText('0');
    await page.evaluate(() => (window as unknown as { finishSave: () => void }).finishSave());
    await expectPage(status).toHaveText('done');
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

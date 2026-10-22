// Checks automatic saves, stale drafts and commits using an isolated workspace and local remote.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { projectDir, projectFile } from '../server/projects/paths';
import { expectEditorValue, fillEditor } from './helpers/code-editor';
// Invalid edits must remain drafts across reloads; stale saves must show both versions. Valid
// saves must change only the edited lines.
const api = await startIsolatedApi();
const commerce = await api.ws.loadExample('commerce');
const dir = projectDir(api.ws.layout, commerce.slug);
const file = 'commerce-business.ossie.yaml';
const sh = (cwd: string, args: string[]) => {
  const r = Bun.spawnSync(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.toString();
};
const read = (path: string) =>
  readFileSync(projectFile(api.ws.layout, commerce.slug, path), 'utf8');
const extra = mkdtempSync(join(tmpdir(), 'workbench-remote-'));
const bare = join(extra, 'remote.git');
sh(extra, ['init', '-q', '--bare', '-b', 'main', bare]);
const browser = await chromium.launch();
const errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
await routeApi(page, api);
await page.goto(appUrl());
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  const t = Date.now();
  await run();
  passed++;
  console.log('PASS', name, `(${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
const tree = (p: Page = page) => p.getByRole('tree', { name: 'Projects' });
const saveState = () => page.getByRole('status', { name: 'Save state' });
const editor = () => page.getByRole('textbox', { name: 'Definition source' });
const putDone = () =>
  page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/files/'), {
    timeout: 6000,
  });
async function openSource(path: string) {
  await tree().getByRole('button', { name: path, exact: true }).first().click();
  await page.locator('.tabs').getByRole('button', { name: 'Source' }).click();
  await expect(editor()).toBeVisible();
}
try {
  await check(
    'a valid edit is written to the file after the pause; git diff shows only that line',
    async () => {
      await openSource(file);
      const before = read(file);
      const saved = putDone();
      await fillEditor(
        editor(),
        before.replace('Customer in the order-to-cash process.', 'Buyer of record.'),
      );
      await expect(saveState()).toHaveText('Editing…');
      const started = Date.now();
      await saved;
      const waited = Date.now() - started;
      expect(waited).toBeGreaterThan(700);
      await expect(saveState()).toHaveText('Saved to file · 1 uncommitted change', {
        timeout: 5000,
      });
      expect(read(file)).toBe(
        before.replace('Customer in the order-to-cash process.', 'Buyer of record.'),
      );
      const diff = sh(dir, ['diff', '-U0', '--', file])
        .split('\n')
        .filter(l => /^[-+](?![-+])/.test(l));
      expect(diff).toEqual([
        `-${before.split('\n').find(l => l.includes('Customer in the order-to-cash process.'))}`,
        `+${before
          .split('\n')
          .find(l => l.includes('Customer in the order-to-cash process.'))!
          .replace('Customer in the order-to-cash process.', 'Buyer of record.')}`,
      ]);
      // The editor keeps its text and cursor: nothing was replaced.
      await expectEditorValue(editor(), read(file));
    },
  );
  await check(
    'invalid text is never written; it stays a draft, survives a reload and the indicator opens the findings',
    async () => {
      const disk = read(file);
      await fillEditor(editor(), disk.replace('Buyer of record.', '"Broken quote'));
      await expect(saveState()).toHaveText(/^Not saved: \d+ errors?$/, { timeout: 5000 });
      expect(read(file)).toBe(disk);
      await expect
        .poll(() => api.ws.state.drafts().map(d => d.path), { timeout: 5000 })
        .toEqual([file]);
      await saveState().click();
      await expect(page.locator('.validation-details')).toBeVisible();
      await page.reload();
      await openSource(file);
      await expectEditorValue(editor(), disk.replace('Buyer of record.', '"Broken quote'), {
        timeout: 5000,
      });
      await expect(saveState()).toHaveText(/^Not saved: \d+ errors?$/, { timeout: 5000 });
      expect(read(file)).toBe(disk);
      await fillEditor(editor(), disk);
      await expect(saveState()).toHaveText(/^Saved to file/, { timeout: 5000 });
      await expect.poll(() => api.ws.state.drafts().length, { timeout: 5000 }).toBe(0);
    },
  );
  await check(
    'a file changed on disk meanwhile: the save is refused, the diff opens and autosave waits for the choice',
    async () => {
      const disk = read(file);
      await page.route(
        `**/api/projects/${commerce.slug}/files/${file}`,
        async route => {
          if (route.request().method() === 'PUT')
            writeFileSync(
              projectFile(api.ws.layout, commerce.slug, file),
              disk.replace('Buyer of record.', 'Changed in a terminal.'),
            );
          await route.fallback();
        },
        { times: 1 },
      );
      await fillEditor(editor(), disk.replace('Buyer of record.', 'My wording.'));
      const dialog = page.getByRole('dialog', {
        name: new RegExp(`${file.replace(/\./g, '\\.')} changed since you opened it`),
      });
      await expect(dialog).toBeVisible({ timeout: 6000 });
      await expect(
        dialog.getByRole('group', { name: 'Your version and the current file' }),
      ).toContainText('Changed in a terminal.');
      await page.screenshot({ path: '/tmp/workbench-autosave-stale.png' });
      await dialog.getByRole('button', { name: 'Keep my version and save over it' }).click();
      await expect(saveState()).toHaveText(/^Saved to file/, { timeout: 5000 });
      expect(read(file)).toBe(disk.replace('Buyer of record.', 'My wording.'));
    },
  );
  await check('Commit… commits only the ticked files in two actions after typing', async () => {
    writeFileSync(
      join(dir, 'notes.ossie.yaml'),
      'name: Notes\nontology:\n  - concept: Note\n    type: EntityType\n',
    );
    await expect(tree().getByRole('button', { name: 'notes.ossie.yaml', exact: true })).toBeVisible(
      { timeout: 5000 },
    );
    await page.getByRole('button', { name: 'Commit…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Commit' });
    await expect(dialog).toBeVisible();
    const files = dialog.getByRole('list', { name: 'Changed files' });
    await expect(files.getByRole('checkbox', { name: file })).toBeChecked();
    await expect(files.getByRole('checkbox', { name: 'notes.ossie.yaml' })).toBeChecked();
    await expect(dialog.getByRole('region', { name: `Diff of ${file}` })).toContainText(
      'My wording.',
    );
    await expect(dialog.getByRole('textbox', { name: 'Commit message' })).toHaveValue(
      'Update 2 files',
    );
    await files.getByRole('checkbox', { name: 'notes.ossie.yaml' }).uncheck();
    await expect(dialog.getByRole('textbox', { name: 'Commit message' })).toHaveValue(
      `Update ${file}`,
    );
    for (const [w, h] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
      [2560, 1440],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(150);
      await page.screenshot({ path: `/tmp/workbench-autosave-commit-${w}.png` });
      const box = await dialog.locator('section.workbench-dialog').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(w + 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(h + 0.5);
      const commit = await dialog
        .getByRole('button', { name: 'Commit', exact: true })
        .boundingBox();
      expect(commit!.y + commit!.height).toBeLessThanOrEqual(h);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await dialog.getByRole('button', { name: 'Commit', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('main > .status')).toContainText(/^Committed [0-9a-f]{7} \(1 file\)/);
    expect(
      sh(dir, ['show', '--name-only', '--format=%s', 'HEAD']).trim().split('\n').filter(Boolean),
    ).toEqual([`Update ${file}`, file]);
    expect(sh(dir, ['status', '--porcelain']).trim()).toBe('?? notes.ossie.yaml');
    await expect(saveState()).toHaveText('Saved to file · 1 uncommitted change', {
      timeout: 5000,
    });
  });
  await check(
    'Commit & push without a remote commits and explains; with a remote it pushes',
    async () => {
      await page.getByRole('button', { name: 'Commit…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Commit' });
      await dialog.getByRole('button', { name: 'Commit & push' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('main > .status')).toContainText(
        'push failed: This project has no remote',
      );
      sh(dir, ['remote', 'add', 'origin', bare]);
      writeFileSync(
        join(dir, 'notes.ossie.yaml'),
        'name: Notes\nontology:\n  - concept: Note\n    type: EntityType\n    description: Second.\n',
      );
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Commit…' }).click();
      await expect(dialog.getByRole('textbox', { name: 'Commit message' })).toHaveValue(
        'Update notes.ossie.yaml',
      );
      await dialog.getByRole('button', { name: 'Commit & push' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('main > .status')).toContainText('and pushed', { timeout: 20000 });
      expect(sh(bare, ['log', '-1', '--format=%s', 'main']).trim()).toBe('Update notes.ossie.yaml');
    },
  );
  await check(
    'Revert to last commit restores the committed bytes; the replaced version is in the trash',
    async () => {
      const committed = read(file);
      const saved = putDone();
      await fillEditor(editor(), committed.replace('My wording.', 'Temporary wording.'));
      await saved;
      await expect(saveState()).toHaveText(/^Saved to file/, { timeout: 5000 });
      await page.getByRole('button', { name: 'Commit…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Commit' });
      await dialog.getByRole('button', { name: `Revert ${file} to last commit` }).click();
      await dialog
        .getByRole('group', { name: 'Confirm revert' })
        .getByRole('button', { name: 'Revert' })
        .click();
      await expect(dialog.getByText('No changes. The files match the last commit.')).toBeVisible({
        timeout: 5000,
      });
      await page.keyboard.press('Escape');
      expect(read(file)).toBe(committed);
      await expectEditorValue(editor(), committed, { timeout: 5000 });
      expect((await api.ws.trash.list()).some(e => e.path === file)).toBe(true);
    },
  );
  await check('an import is committed with exactly its files', async () => {
    await page.locator('input[type=file]').setInputFiles({
      name: 'imported.ossie.yaml',
      mimeType: 'text/yaml',
      buffer: Buffer.from('name: Imported\nontology:\n  - concept: Thing\n    type: EntityType\n'),
    });
    await expect(page.locator('main > .status')).toContainText('Imported 1 file', {
      timeout: 8000,
    });
    const slug = (await api.ws.listProjects()).find(p =>
      p.files.some(f => f.path === 'imported.ossie.yaml'),
    )!.slug;
    const d = projectDir(api.ws.layout, slug);
    expect(sh(d, ['log', '--format=%s']).trim()).toBe('Import imported.ossie.yaml');
    expect(sh(d, ['status', '--porcelain']).trim()).toBe('');
  });
  await check(
    'the header fits: Commit… and the indicator are visible and do not overlap at four viewports',
    async () => {
      await tree().getByRole('button', { name: file, exact: true }).first().click();
      for (const [w, h] of [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(200);
        const header = page.locator('.workspace-header');
        const commit = header.getByRole('button', { name: 'Commit…' });
        const state = saveState();
        await expect(commit).toBeVisible();
        await expect(state).toBeVisible();
        const a = (await commit.boundingBox())!;
        const b = (await state.boundingBox())!;
        const hb = (await header.boundingBox())!;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap).toBe(false);
        for (const r of [a, b]) {
          expect(r.x).toBeGreaterThanOrEqual(hb.x - 0.5);
          expect(r.x + r.width).toBeLessThanOrEqual(hb.x + hb.width + 0.5);
        }
        await page.screenshot({ path: `/tmp/workbench-autosave-header-${w}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  );
  await check('no browser errors', async () => {
    expect(errors).toEqual([]);
  });
  console.log(`${passed} autosave and commit checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
  rmSync(extra, { recursive: true, force: true });
}

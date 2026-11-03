// Checks the real Commit dialog's diff layouts, wrapping, actions and focus.
import { chromium, expect } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appUrl } from './helpers/base-url';
import { startIsolatedApi } from './helpers/isolated-api';
import { routeApi } from './helpers/isolated-api';
import { openFile } from './helpers/screen-tour';
import { projectDir, projectFile } from '../src/server/projects/paths';

const output = process.argv[2];
if (!output) throw new Error('Pass a screenshot directory for the Commit check.');
mkdirSync(output, { recursive: true });
const root = resolve(`.commit-browser-${process.pid}`);
mkdirSync(root);
const config = join(root, 'gitconfig');
writeFileSync(config, '[user]\n\tname = Commit Browser Test\n\temail = commit@example.invalid\n[init]\n\tdefaultBranch = main\n');
process.env.GIT_CONFIG_GLOBAL = config;
process.env.GIT_CONFIG_NOSYSTEM = '1';
const api = await startIsolatedApi({ root: join(root, 'data') });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const project = await api.ws.loadExample('ubl');
  const directory = projectDir(api.ws.layout, project.slug);
  const filename = 'ubl.ontology.yaml';
  const source = projectFile(api.ws.layout, project.slug, filename);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], { cwd: directory });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString();
  };
  appendFileSync(source, '\n# Before review\n');
  writeFileSync(join(directory, 'empty.txt'), '');
  writeFileSync(join(directory, 'deleted.txt'), 'Removed content\n');
  git('add', '.');
  git('commit', '-qm', 'Commit review baseline');
  const modified = readFileSync(source, 'utf8').replace('# Before review', '# After review');
  writeFileSync(source, modified);
  writeFileSync(join(directory, 'empty.txt'), 'Previously empty, but already tracked\n');
  rmSync(join(directory, 'deleted.txt'));
  writeFileSync(join(directory, 'review-notes.txt'), `New file for review\n${'A long description that must wrap without losing addition highlighting. '.repeat(8)}\n`);

  browser = await chromium.launch({ channel: process.env.SW_BROWSER_CHANNEL });
  const errors: string[] = [];
  for (const [width, height] of [
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [2560, 1440],
    [1024, 768],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => errors.push(error.message));
    try {
      await routeApi(page, api);
      await page.goto(appUrl());
      await openFile(page, filename);
      const trigger = page.locator('.workspace-header').getByRole('button', { name: /^Commit/ });
      await expect(trigger.locator('svg')).toHaveClass(/lucide-git-commit/);
      await expect(trigger.locator('.action-label')).toHaveText('Commit');
      if (width >= 1100) expect(await trigger.locator('.action-label').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Commit', exact: true });
      await expect(dialog).toBeVisible();
      expect(
        await dialog
          .locator('.commit-path')
          .evaluateAll(elements => elements.every(element => getComputedStyle(element).textOverflow !== 'ellipsis' && element.scrollWidth <= element.clientWidth + 1)),
      ).toBe(true);
      const select = (name: string) => dialog.locator('.commit-file').filter({ hasText: name }).click();
      await select(filename);
      const diff = dialog.locator('.diff-view');
      const checkDiffMarks = async () => {
        const marks = await diff.locator('.cm-changedText, .cm-insertedLine, .cm-deletedLine, .cm-deletedText').evaluateAll(elements =>
          elements.map(element => {
            const style = getComputedStyle(element);
            return { className: element.className, decoration: style.textDecorationLine, image: style.backgroundImage, color: style.backgroundColor };
          }),
        );
        expect(marks.length).toBeGreaterThan(0);
        for (const mark of marks) {
          expect(mark.decoration).toBe('none');
          if (mark.className.includes('cm-changedText')) {
            expect(mark.image).toBe('none');
            expect(mark.color).not.toBe('rgba(0, 0, 0, 0)');
          }
        }
        const gutters = await diff.locator('.cm-changedLineGutter').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
        expect(gutters.length).toBeGreaterThan(0);
        expect(gutters).not.toContain('rgba(0, 0, 0, 0)');
      };
      await expect(diff.locator('.cm-editor')).toHaveCount(2);
      await expect(diff.locator('.cm-merge-a .cm-changedLine')).toContainText(['# Before review']);
      await expect(diff.locator('.cm-merge-b .cm-changedLine')).toContainText(['# After review']);
      const colors = await diff.evaluate(element => ['.cm-merge-a .cm-changedLine', '.cm-merge-b .cm-changedLine'].map(selector => getComputedStyle(element.querySelector(selector)!).backgroundColor));
      expect(colors[0]).not.toBe(colors[1]);
      expect(colors).not.toContain('rgba(0, 0, 0, 0)');
      await checkDiffMarks();
      if ([1440, 390].includes(width)) await page.screenshot({ path: join(output, `commit-modified-${width}.png`) });
      await select('review-notes.txt');
      await expect(diff.locator('.cm-editor')).toHaveCount(1);
      await expect(diff.locator('.cm-changedLine').first()).toContainText('New file for review');
      await expect(diff.locator('.diff-labels')).toHaveText('File now · New file');
      await expect(diff.locator('[contenteditable=true]')).toHaveCount(0);
      await checkDiffMarks();
      const wrapping = await diff.locator('.cm-content').evaluate(element => ({
        whiteSpace: getComputedStyle(element).whiteSpace,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(['pre-wrap', 'break-spaces']).toContain(wrapping.whiteSpace);
      expect(wrapping.scrollWidth).toBeLessThanOrEqual(wrapping.width + 1);
      const geometry = await dialog.locator('.commit-dialog').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, overflow: element.scrollWidth - element.clientWidth };
      });
      expect(geometry.x).toBeGreaterThanOrEqual(0);
      expect(geometry.y).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width + 1);
      expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      if (width >= 1024 && width <= 1440) expect(geometry.width).toBeGreaterThan(width * 0.85);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      }
      if ([1440, 390].includes(width)) await page.screenshot({ path: join(output, `commit-new-${width}.png`) });
      await select('empty.txt');
      await expect(diff.locator('.cm-editor')).toHaveCount(2);
      await expect(diff.locator('.cm-merge-b .cm-changedLine')).toContainText(['Previously empty, but already tracked']);
      await select('deleted.txt');
      await expect(diff.locator('.cm-editor')).toHaveCount(2);
      await expect(diff.locator('.cm-merge-a .cm-changedLine')).toContainText(['Removed content']);
      await select(filename);
      await dialog.getByRole('button', { name: `Revert ${filename} to last commit`, exact: true }).click();
      await expect(dialog.getByRole('group', { name: 'Confirm revert' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Keep it', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Commit & push', exact: true })).toBeEnabled();
      await expect(dialog.getByRole('button', { name: 'Commit', exact: true })).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(readFileSync(source, 'utf8')).toBe(modified);
      if (width === 390) {
        await trigger.click();
        await expect(dialog).toBeVisible();
        for (const name of [filename, 'empty.txt', 'deleted.txt']) await dialog.getByRole('checkbox', { name, exact: true }).uncheck();
        await dialog.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Review new file only');
        await dialog.getByRole('button', { name: 'Commit', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect.poll(() => git('show', '--name-only', '--format=', 'HEAD').trim()).toBe('review-notes.txt');
        expect(readFileSync(source, 'utf8')).toBe(modified);
        expect(git('status', '--porcelain')).toContain(filename);
        await trigger.click();
        await expect(dialog).toBeVisible();
        await select(filename);
        await dialog.getByRole('button', { name: `Revert ${filename} to last commit`, exact: true }).click();
        const reverted = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/git/revert'));
        await dialog.getByRole('group', { name: 'Confirm revert' }).getByRole('button', { name: 'Revert', exact: true }).click();
        expect((await reverted).ok()).toBe(true);
        await expect.poll(() => readFileSync(source, 'utf8')).toBe(modified.replace('# After review', '# Before review'));
        await expect(dialog.locator('.commit-file').filter({ hasText: filename })).toHaveCount(0);
        await dialog.getByRole('textbox', { name: 'Commit message', exact: true }).fill('Review remaining changes');
        const pushed = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/git/commit'));
        await dialog.getByRole('button', { name: 'Commit & push', exact: true }).click();
        const outcome = await (await pushed).json();
        expect(outcome.pushed.ok).toBe(false);
        expect(outcome.pushed.message).toMatch(/no remote/i);
        await expect(dialog).toBeHidden();
        expect(git('status', '--porcelain').trim()).toBe('');
        console.log('PASS Commit Git actions: selected commit preserves other edits; confirmed revert restores content; missing remote is reported after commit');
      }
      console.log(`PASS Commit ${width}: fit, real additions/removals, single-column new file, wrapping, actions and focus`);
    } catch (error) {
      await page.screenshot({ path: join(output, `commit-failure-${width}.png`) });
      console.error(errors, (await page.locator('body').innerText()).slice(0, 1200));
      throw error;
    } finally {
      await page.close();
    }
  }
  expect(errors).toEqual([]);
} finally {
  await browser?.close();
  await api.stop();
  rmSync(root, { recursive: true, force: true });
}

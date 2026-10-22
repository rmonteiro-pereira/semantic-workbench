// Checks embedded SQL highlighting, warning locations and unchanged export bytes in the browser.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { projectFile } from '../server/projects/paths';
import { exportFile } from './helpers/header';
// SQL warnings must identify the exact source location within 500 ms of a typing pause.
// Highlighting and previews must leave export bytes unchanged.
const api = await startIsolatedApi();
const fixture = (name: string) => readFileSync(`tests/fixtures/sql/${name}`, 'utf8');
const names = [
  'case-when.ossie.yaml',
  'case-when-broken.ossie.yaml',
  'escaped.semantic.json',
  'folded.ossie.yaml',
  'quality.odcs.yaml',
  'dax.ossie.yaml',
];
const sql = await api.ws.importBatch({
  name: 'Sql',
  files: names.map(path => ({ path, source: fixture(path) })),
});
const mall = await api.ws.loadExample('mall');
// The CASE WHEN file padded past 500,000 characters, so the editor opens it in large file mode.
const padding = Array.from(
  { length: 8000 },
  (_, index) => `# Padding line ${index} keeps this file above the large file threshold.`,
).join('\n');
const large = await api.ws.importBatch({
  name: 'Large sql',
  files: [
    {
      path: 'large-case-when.ossie.yaml',
      source: `${fixture('case-when.ossie.yaml')}\n${padding}\n`,
    },
  ],
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
await routeApi(page, api);
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const editor = (p: Page = page) => p.getByRole('textbox', { name: 'Definition source' });
const tab = (name: string | RegExp) =>
  page.locator('.tabs').getByRole('button', { name, exact: typeof name === 'string' });
async function open(path: string, project = sql.name) {
  await page
    .getByRole('tree', { name: 'Projects' })
    .getByRole('treeitem', { name: project })
    .getByRole('button', { name: path, exact: true })
    .click();
}
async function openSource(path: string, project = sql.name) {
  await open(path, project);
  await tab('Source').click();
  await expect(editor()).toBeVisible();
}
const rgb = (hex: string) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
// Color of the first text node exactly `text` inside `root`.
const colorOf = (text: string, root = '.cm-content') =>
  page.evaluate(
    ([t, r]) => {
      const walker = document.createTreeWalker(document.querySelector(r)!, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode()))
        if (n.textContent === t) return getComputedStyle(n.parentElement!).color;
      return null;
    },
    [text, root] as const,
  );
// Line and column (1-based) of the first warning range in the Source editor.
const warningAt = () =>
  page.evaluate(() => {
    const w = document.querySelector('.cm-content .cm-lintRange-warning');
    if (!w) return null;
    const line = w.closest('.cm-line')!;
    const lines = [...document.querySelectorAll('.cm-content .cm-line')];
    const range = document.createRange();
    range.setStart(line, 0);
    range.setEndBefore(w);
    return {
      line: lines.indexOf(line) + 1,
      column: range.toString().length + 1,
      text: w.textContent,
    };
  });
try {
  await page.goto(appUrl());
  await check(
    'SQL in YAML is colored as SQL: CASE WHEN keywords and the string literal, beside YAML keys and values',
    async () => {
      await openSource('case-when.ossie.yaml');
      await expect.poll(() => colorOf("'occupied'")).toBe(rgb('#a31515'));
      expect(await colorOf('CASE')).toBe(rgb('#0000ff'));
      expect(await colorOf('WHEN')).toBe(rgb('#0000ff'));
      expect(await colorOf('metrics')).toBe(rgb('#800000'));
      await page.screenshot({ path: '/tmp/workbench-sql-colors.png' });
    },
  );
  await check(
    'the broken CASE WHEN shows one warning at line 23 column 77 (the ")" closing SUM(CASE …), and it never blocks saving',
    async () => {
      await openSource('case-when-broken.ossie.yaml');
      await expect(page.locator('.cm-content .cm-lintRange-warning')).toHaveCount(1, {
        timeout: 5000,
      });
      expect(await warningAt()).toEqual({ line: 23, column: 77, text: ')' });
      await expect(page.locator('.cm-content .cm-lintRange-error')).toHaveCount(0);
    },
  );
  await check(
    'typing the error into the clean file shows the warning within 500 ms of the pause; the edit saves',
    async () => {
      await openSource('case-when.ossie.yaml');
      await page.getByRole('spinbutton', { name: 'Go to line' }).fill('23');
      await page.getByRole('spinbutton', { name: 'Go to line' }).press('Enter');
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft'); // Before the ")" closing SUM(CASE …; then delete " END".
      const typed = Date.now();
      await page.keyboard.press('Backspace', { delay: 5 });
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      const paused = Date.now();
      await expect(page.locator('.cm-content .cm-lintRange-warning')).toBeVisible({
        timeout: 3000,
      });
      const shown = Date.now() - paused;
      console.log(`  warning ${shown} ms after the last keystroke (typed in ${paused - typed} ms)`);
      expect(shown).toBeLessThanOrEqual(500);
      await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(/^Saved to file/, {
        timeout: 8000,
      });
      const saved = readFileSync(
        projectFile(api.ws.layout, sql.slug, 'case-when.ossie.yaml'),
        'utf8',
      );
      expect(saved).not.toBe(fixture('case-when.ossie.yaml'));
      expect(saved.length).toBe(fixture('case-when.ossie.yaml').length - 4);
    },
  );
  await check(
    'JSON: SQL inside strings is colored, and the escaped-quote error points at the backslash (line 15 column 143)',
    async () => {
      await openSource('escaped.semantic.json');
      await expect(page.locator('.cm-content .cm-lintRange-warning')).toHaveCount(1, {
        timeout: 5000,
      });
      const at = await warningAt();
      expect([at?.line, at?.column]).toEqual([15, 143]);
      expect(at?.text?.startsWith('\\"x')).toBe(true);
      expect(await colorOf('CASE')).toBe(rgb('#0000ff'));
    },
  );
  await check(
    'a DAX expression stays plain and gets no warning; the ANSI expression beside it is colored',
    async () => {
      await openSource('dax.ossie.yaml');
      await page.waitForTimeout(800);
      await expect(page.locator('.cm-content .cm-lintRange-warning')).toHaveCount(0);
      expect(await colorOf('SUM')).toBe(rgb('#0000ff'));
    },
  );
  await check(
    'item editor: the metric expression is a SQL field with colors and the same warning',
    async () => {
      await open('case-when-broken.ossie.yaml');
      await tab(/^Metrics/).click();
      // The clean and the broken fixture both define occupancy_rate: group by file and pick the
      // broken one.
      await page.getByRole('combobox', { name: 'Group metrics by' }).selectOption('file');
      await page
        .locator('.metrics-table tbody')
        .filter({ hasText: 'case-when-broken.ossie.yaml' })
        .getByRole('button', { name: 'occupancy_rate: explain' })
        .click();
      await page.getByRole('button', { name: 'Edit occupancy_rate' }).click();
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();
      const field = drawer.locator('.sql-field').first();
      await expect(field).toBeVisible();
      await expect(field.getByRole('list', { name: 'SQL findings' })).toContainText('near ")"', {
        timeout: 5000,
      });
      expect(await colorOf('CASE', '.sql-field .cm-content')).toBe(rgb('#0000ff'));
      await page.screenshot({ path: '/tmp/workbench-sql-item-editor.png' });
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
    },
  );
  await check(
    'metric wizard: the expression input is a SQL field; a broken expression shows a warning and does not block Next',
    async () => {
      await open('mall.semantic.yaml', mall.name);
      await tab(/^Metrics/).click();
      await page.locator('.metrics-new').click();
      const w = page.getByRole('dialog', { name: 'New metric' });
      await w.getByRole('button', { name: 'Next' }).click();
      await w.getByRole('button', { name: 'Next' }).click();
      await w.getByLabel('Label').fill('Spend per visitor');
      await w.getByLabel('Metric type').selectOption('derived');
      await w.getByLabel('Input metrics').fill('purchase_spend, visitors');
      const field = w.getByRole('textbox', { name: 'Expression' });
      await field.click();
      await page.keyboard.type('purchase_spend / NULLIF(visitors, 0');
      await expect(w.getByRole('list', { name: 'SQL findings' })).toContainText('syntax error', {
        timeout: 5000,
      });
      await expect(w.getByRole('button', { name: 'Next' })).toBeEnabled();
      await page.keyboard.type(')');
      await expect(w.getByRole('list', { name: 'SQL findings' })).toHaveCount(0, { timeout: 5000 });
      expect(await colorOf('0', '.kpi-wizard .sql-field .cm-content')).toBe(rgb('#098658'));
      await page.screenshot({ path: '/tmp/workbench-sql-wizard.png' });
      await w.getByRole('button', { name: 'Cancel' }).click();
    },
  );
  await check(
    'SQL previews are colored: the metric explanation preview has keyword spans and its text is exactly the SQL',
    async () => {
      await open('mall.semantic.yaml', mall.name);
      await tab(/^Metrics/).click();
      await page.getByRole('button', { name: 'Occupancy rate: explain' }).click();
      const pre = page.getByLabel('SQL preview, not executed');
      await expect(pre).toBeVisible();
      await expect(pre.locator('span').first()).toBeVisible();
      const text = await pre.textContent();
      expect(text).toMatch(/^SELECT/);
      expect(
        await page.evaluate(() => {
          const s = [...document.querySelectorAll('.preview-sql span')].find(
            x => x.textContent === 'SELECT',
          );
          return s ? getComputedStyle(s).color : null;
        }),
      ).toBe(rgb('#0000ff'));
    },
  );
  await check(
    'a file over 500,000 characters opens in large file mode, still colors SQL on screen, and can switch to full parsing',
    async () => {
      await openSource('large-case-when.ossie.yaml', large.name);
      const bar = page.locator('.code-editor-bar');
      await expect(bar).toContainText('Large file mode');
      await expect(bar.getByText('Large file mode')).toHaveAttribute('title', /500,000 characters/);
      await expect.poll(() => colorOf('CASE')).toBe(rgb('#0000ff'));
      expect(await colorOf('metrics')).toBe(rgb('#800000'));
      await page.screenshot({ path: '/tmp/workbench-sql-large-mode.png' });
      await bar.getByRole('button', { name: 'Full parsing', exact: true }).click();
      await expect(bar.getByRole('button', { name: 'Large file mode', exact: true })).toBeVisible();
      await expect.poll(() => colorOf('CASE')).toBe(rgb('#0000ff'));
      await bar.getByRole('button', { name: 'Large file mode', exact: true }).click();
      await expect(bar.getByRole('button', { name: 'Full parsing', exact: true })).toBeVisible();
    },
  );
  await check('lint never changes bytes: exported files equal the files on disk', async () => {
    for (const path of [
      'case-when-broken.ossie.yaml',
      'escaped.semantic.json',
      'folded.ossie.yaml',
    ]) {
      await open(path);
      const [download] = await Promise.all([page.waitForEvent('download'), exportFile(page)]);
      const file = await download.path();
      expect(readFileSync(file!, 'utf8')).toBe(fixture(path));
      expect(readFileSync(projectFile(api.ws.layout, sql.slug, path), 'utf8')).toBe(fixture(path));
    }
  });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`${passed} SQL checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}

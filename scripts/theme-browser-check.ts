// Checks the theme in a real browser: one token drives the accent, dark follows the Theme control
// and the system setting, and the main screens stay readable in both themes.
import { appUrl } from './helpers/base-url';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { tourGroups } from './helpers/all-tours';
import { openFile, showScreen } from './helpers/screen-tour';
import { chooseTheme, themedScreenProblems, tokenContrast, tokenValue } from './helpers/theme-tour';
import { luminance, parseColor } from './helpers/color-literals';
import { showEveryEntity } from './helpers/graph-options';
import { openSettings } from './helpers/sidebar-menus';

const api = await startIsolatedApi();
for (const id of ['ubl', 'commerce', 'mall']) await api.ws.loadExample(id);
const browser = await chromium.launch();
const errors: string[] = [];
let passed = 0;

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

async function openApp(colorScheme: 'light' | 'dark', width = 1280, height = 720) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme });
  page.on('pageerror', error => errors.push(error.message));
  await routeApi(page, api);
  await page.goto(appUrl());
  await page.waitForTimeout(1200);
  return page;
}

// The brightness of the page behind everything else, from 0 (black) to 1 (white).
async function pageBrightness(page: Page): Promise<number> {
  const background = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );
  const color = parseColor(background);
  if (!color) throw new Error(`The page background is not a plain colour: ${background}`);
  return luminance(color);
}

const ACCENT_SWAP = '#c2185b';
const SWAPPED = 'rgb(194, 24, 91)';

async function accentCheck() {
  const page = await openApp('light');
  await openFile(page, 'ubl.ontology.yaml');
  await page
    .locator('.tabs')
    .getByRole('button', { name: /^Graph/ })
    .click();
  await showEveryEntity(page);
  await page.locator('.react-flow__node[data-id="ontology/0"] .full-entity').click();
  const focused = page.locator('.full-entity.focused').first();
  await expect(focused).toBeVisible();
  const primary = page.locator('button.primary').first();
  const selectedTab = page.locator('.tabs .selected').first();
  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
  );
  await page.evaluate(
    value => document.documentElement.style.setProperty('--color-accent', value),
    ACCENT_SWAP,
  );
  await expect(primary).toHaveCSS('background-color', SWAPPED);
  await expect(primary).toHaveCSS('border-color', SWAPPED);
  await expect(selectedTab).toHaveCSS('color', SWAPPED);
  await expect(focused).toHaveCSS('border-top-color', SWAPPED);
  // Selected and connected edges follow the same token through the edge colour.
  expect(await tokenValue(page, '--color-edge-active')).toBe(ACCENT_SWAP);
  await expect(page.locator('.react-flow__edge-path').first()).toBeVisible();
  const arrow = page.locator('marker polyline').first();
  expect(await arrow.count()).toBeGreaterThan(0);
  await page.evaluate(() => document.documentElement.style.removeProperty('--color-accent'));
  expect(await tokenValue(page, '--color-accent')).toBe(before);
  await page.close();
}

async function controlCheck() {
  const page = await openApp('light');
  expect(await pageBrightness(page)).toBeGreaterThan(0.8);
  await chooseTheme(page, 'Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await pageBrightness(page)).toBeLessThan(0.1);
  expect(await page.evaluate(() => localStorage.getItem('workbench.theme'))).toBe('dark');
  const settings = await openSettings(page);
  await expect(settings.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await pageBrightness(page)).toBeLessThan(0.1);
  await chooseTheme(page, 'Light');
  expect(await pageBrightness(page)).toBeGreaterThan(0.8);
  await chooseTheme(page, 'System');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await page.evaluate(() => localStorage.getItem('workbench.theme'))).toBeNull();
  await page.close();
}

async function systemCheck() {
  const dark = await openApp('dark');
  expect(await pageBrightness(dark)).toBeLessThan(0.1);
  // A person who chose light keeps light while the system is dark.
  await chooseTheme(dark, 'Light');
  expect(await pageBrightness(dark)).toBeGreaterThan(0.8);
  await dark.emulateMedia({ colorScheme: 'light' });
  await chooseTheme(dark, 'System');
  expect(await pageBrightness(dark)).toBeGreaterThan(0.8);
  await dark.emulateMedia({ colorScheme: 'dark' });
  expect(await pageBrightness(dark)).toBeLessThan(0.1);
  await dark.close();
}

// The stored choice is applied by a plain script in the page head, before the app loads.
async function firstPaintCheck() {
  const page = await browser.newPage({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('workbench.theme', 'dark'));
  await page.route(/\.(tsx?|jsx?|mjs)(\?.*)?$/, route => {
    if (route.request().url().includes('theme-init.js')) return route.continue();
    return route.abort();
  });
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const script = page.locator('head script[src="/theme-init.js"]');
  await expect(script).toHaveCount(1);
  expect(
    await script.evaluate(
      element =>
        (element as HTMLScriptElement).async ||
        (element as HTMLScriptElement).defer ||
        (element as HTMLScriptElement).type === 'module',
    ),
  ).toBe(false);
  await page.close();
}

async function contrastCheck(scheme: 'light' | 'dark') {
  const page = await openApp(scheme);
  const surfaces = [
    '--color-surface',
    '--color-surface-page',
    '--color-surface-sunken',
    '--color-surface-hover',
    '--color-accent-soft',
  ];
  for (const surface of surfaces) {
    expect(
      await tokenContrast(page, '--color-text-muted', surface),
      `muted text on ${surface}`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await tokenContrast(page, '--color-text', surface),
      `text on ${surface}`,
    ).toBeGreaterThanOrEqual(7);
  }
  if (scheme === 'dark') {
    expect(
      await tokenContrast(page, '--color-border-strong', '--color-surface'),
    ).toBeGreaterThanOrEqual(3);
  }
  await page.close();
}

// Every screen of the main tour, in the given theme, with readable text and no overlaps.
async function tourCheck(scheme: 'light' | 'dark', groupTitles: string[]) {
  const page = await openApp(scheme);
  const groups = tourGroups({
    ontology: 'ubl.ontology.yaml',
    contract: 'commerce.odcs.yaml',
    metricsModel: 'mall.semantic.yaml',
  });
  for (const group of groups.filter(item => groupTitles.includes(item.title))) {
    for (const screen of group.screens) {
      await showScreen(page, screen);
      expect(await themedScreenProblems(page, screen), `${scheme} ${screen.name}`).toEqual([]);
    }
  }
  await page.close();
}

try {
  await check(
    'the accent token drives the primary button, the selected tab and the graph selection',
    accentCheck,
  );
  await check('the Theme control sets, stores and clears dark', controlCheck);
  await check('System follows the browser and an explicit choice overrides it', systemCheck);
  await check(
    'the stored theme is applied by a blocking script before the app loads',
    firstPaintCheck,
  );
  await check('muted text keeps 4.5:1 on its surfaces in the light theme', () =>
    contrastCheck('light'),
  );
  await check('muted text keeps 4.5:1 on its surfaces in the dark theme', () =>
    contrastCheck('dark'),
  );
  await check('the main tour is readable and free of overlaps in the light theme at 1280×720', () =>
    tourCheck('light', ['screens']),
  );
  await check('every tour is readable and free of overlaps in the dark theme at 1280×720', () =>
    tourCheck('dark', [
      'screens',
      'edit screens',
      'ODCS screens',
      'project dialogs',
      'export dialog',
      'folder dialogs',
    ]),
  );
  await check('no uncaught browser errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} theme checks passed`);
} finally {
  await browser.close();
  await api.stop();
}

// Checks white-labelling in a real browser: a brand folder given to the built server changes the
// header logo, the page title, the favicon and the accent token, the sign-in pages show the same
// brand, and a hostile logo cannot run script. A second server with no brand folder shows the
// shipped defaults. The suite serves the built frontend itself, so it needs `bun run build`.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, type Browser } from '@playwright/test';
import { freeAuthPort, startAuthApi } from './auth-environment';
import { check } from './helpers/sign-in';
import { setActiveBrand } from '../server/brand/active-brand';
import { loadBrandBundle } from '../server/brand/bundle';
import { createAuthRoutes } from '../server/routes/auth';
import { serveStatic } from '../server/static';

const BRAND_NAME = 'Acme Models';
const ACCENT = '#c2185b';
const ACCENT_RGB = 'rgb(194, 24, 91)';
const CUSTOM_LOGO_WIDTH = 200;
const CUSTOM_MARK_WIDTH = 36;
const DEFAULT_LOGO_WIDTH = 168;
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';

function writeBrandFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-brand-check-'));
  const files: Record<string, string> = {
    'logo.svg':
      `${SVG_OPEN} width="${CUSTOM_LOGO_WIDTH}" height="40">` +
      `<rect width="${CUSTOM_LOGO_WIDTH}" height="40" fill="${ACCENT}"/></svg>`,
    'logo-mark.svg':
      `${SVG_OPEN} width="${CUSTOM_MARK_WIDTH}" height="36" onload="alert('mark')">` +
      `<script>alert('mark')</script><rect width="36" height="36" fill="${ACCENT}"/></svg>`,
    'favicon.svg': `${SVG_OPEN} width="16" height="16"><circle r="8" fill="${ACCENT}"/></svg>`,
    'brand.json': JSON.stringify({ productName: BRAND_NAME, shortName: 'Acme' }),
    'brand.css': `:root { --color-accent: ${ACCENT}; } body { display: none; }`,
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content);
  return folder;
}

async function customBrandChecks(browser: Browser, url: string) {
  const page = await browser.newPage();
  const dialogs: string[] = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  try {
    await page.goto(url);
    await page.locator('.workspace-header').waitFor();
    await check('the header, title and favicon come from the brand folder', async () => {
      await expect(page).toHaveTitle(BRAND_NAME);
      await expect(page.locator('.workspace-title h1')).toHaveText(BRAND_NAME);
      const logo = page.locator('.workspace-sidebar .brand img');
      await expect(logo).toHaveAttribute('alt', BRAND_NAME);
      const width = await logo.evaluate((image: HTMLImageElement) =>
        image.decode().then(() => image.naturalWidth),
      );
      assert.equal(width, CUSTOM_LOGO_WIDTH);
      const icon = await page.locator('link[rel="icon"]').getAttribute('href');
      assert.equal(icon, '/brand/favicon.svg');
      const favicon = await page.request.get(url + icon!);
      assert.match(await favicon.text(), new RegExp(ACCENT));
    });
    await check('brand.css overrides the accent token and nothing else', async () => {
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
      );
      assert.equal(accent, ACCENT);
      assert.equal(await page.locator('.workspace-header').isVisible(), true);
    });
    await check('a script in a brand SVG is removed and the file is sandboxed', async () => {
      const response = await page.request.get(url + '/brand/logo-mark.svg');
      assert.equal(response.headers()['content-type'], 'image/svg+xml');
      assert.equal(response.headers()['x-content-type-options'], 'nosniff');
      assert.equal(
        response.headers()['content-security-policy'],
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
      const body = await response.text();
      assert(!/script|onload|alert/.test(body), body);
      await page.goto(url + '/brand/logo-mark.svg');
      assert.deepEqual(dialogs, []);
    });
  } finally {
    await page.close();
  }
}

async function defaultBrandChecks(browser: Browser, url: string) {
  await check('without a brand folder the shipped brand is shown', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(url);
      await page.locator('.workspace-header').waitFor();
      await expect(page).toHaveTitle('Semantic Workbench');
      const logo = page.locator('.workspace-sidebar .brand img');
      await logo.waitFor();
      const width = await logo.evaluate((image: HTMLImageElement) =>
        image.decode().then(() => image.naturalWidth),
      );
      assert.equal(width, DEFAULT_LOGO_WIDTH);
    } finally {
      await page.close();
    }
  });
}

// The sign-in pages need no identity provider to render, so a plain server answers them.
async function signInPageChecks(browser: Browser, folder: string) {
  setActiveBrand(loadBrandBundle({ directory: folder, warn: () => {} }));
  const never = async () => {
    throw new Error('not used by this check');
  };
  const routes = createAuthRoutes({
    session: async () => null,
    login: never,
    callback: never,
    logout: never,
    frontChannelLogout: never,
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async request => (await routes(request)) ?? (await serveStatic(request))!,
  });
  const url = `http://127.0.0.1:${server.port}`;
  try {
    await check('the sign-in pages show the brand folder logo, name and accent', async () => {
      const page = await browser.newPage();
      try {
        await page.goto(url + '/auth/signed-out');
        assert.equal(await page.title(), `Signed out · ${BRAND_NAME}`);
        assert.equal(await page.locator('.brand span').innerText(), BRAND_NAME);
        const mark = page.locator('.brand img');
        const width = await mark.evaluate((image: HTMLImageElement) =>
          image.decode().then(() => image.naturalWidth),
        );
        assert.equal(width, CUSTOM_MARK_WIDTH);
        const color = await page
          .locator('.brand')
          .evaluate(element => getComputedStyle(element).color);
        assert.equal(color, ACCENT_RGB);
        assert.equal(
          await page.locator('link[rel="icon"]').getAttribute('href'),
          '/brand/favicon.svg',
        );
      } finally {
        await page.close();
      }
    });
  } finally {
    await server.stop(true);
  }
}

export async function brandBrowserCheck() {
  const folder = writeBrandFolder();
  const browser = await chromium.launch({ headless: true });
  const customUrl = `http://127.0.0.1:${freeAuthPort()}`;
  const custom = await startAuthApi(
    customUrl,
    { mode: 'local' },
    { env: { SW_BRAND_DIR: folder } },
  );
  try {
    await customBrandChecks(browser, customUrl);
    await signInPageChecks(browser, folder);
  } finally {
    await custom.stop();
  }
  const defaultUrl = `http://127.0.0.1:${freeAuthPort()}`;
  const shipped = await startAuthApi(defaultUrl, { mode: 'local' });
  try {
    await defaultBrandChecks(browser, defaultUrl);
  } finally {
    await shipped.stop();
    await browser.close();
    rmSync(folder, { recursive: true, force: true });
  }
}

if (import.meta.main) await brandBrowserCheck();

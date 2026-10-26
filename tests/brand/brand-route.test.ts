// Tests the /brand route and the sign-in pages against a custom bundle: content types, the
// strict policy on every file, and the brand on pages rendered without a browser.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activeBrand,
  loadBrandBundle,
  resetActiveBrand,
  setActiveBrand,
} from '../../src/server/brand/bundle';
import { authPage } from '../../src/server/routes/auth';
import { useDefaultBrand } from '../helpers/brand-fixture';
import { serveStatic } from '../../src/server/static';

const folders: string[] = [];

beforeEach(useDefaultBrand);

afterEach(() => {
  resetActiveBrand();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function useBrandFolder(files: Record<string, string>) {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-brand-route-'));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content);
  setActiveBrand(loadBrandBundle({ directory: folder, warn: () => {} }));
}

const request = (path: string, method = 'GET') =>
  new Request(`http://localhost${path}`, { method });

test('brand files are served with their type and a strict policy', async () => {
  for (const name of ['logo.svg', 'logo-mark.svg', 'favicon.svg']) {
    const response = (await serveStatic(request(`/brand/${name}`)))!;
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  }
  const manifest = (await serveStatic(request('/brand/brand.json')))!;
  expect(manifest.headers.get('Content-Type')).toContain('application/json');
  expect(manifest.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
  const stylesheet = (await serveStatic(request('/brand/brand.css')))!;
  expect(stylesheet.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
  expect((await manifest.json()).productName).toBe('Semantic Workbench');
  expect((await serveStatic(request('/brand/brand.css')))!.headers.get('Content-Type')).toContain(
    'text/css',
  );
});

test('only the known names exist under /brand', async () => {
  for (const path of ['/brand/', '/brand/secret.txt', '/brand/logo.png', '/brand/%5Clogo.svg']) {
    expect((await serveStatic(request(path)))!.status).toBeOneOf([403, 404]);
  }
  expect((await serveStatic(request('/brand/logo.svg', 'POST')))!.status).toBe(405);
  const head = (await serveStatic(request('/brand/logo.svg', 'HEAD')))!;
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
});

test('a custom bundle is what the route serves', async () => {
  useBrandFolder({
    'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="3"/></svg>',
    'brand.json': '{"productName":"Acme Models","shortName":"Acme"}',
  });
  expect(await (await serveStatic(request('/brand/logo.svg')))!.text()).toContain('<rect');
  expect((await (await serveStatic(request('/brand/brand.json')))!.json()).productName).toBe(
    'Acme Models',
  );
});

test('sign-in pages carry the brand name, mark, favicon and stylesheet', async () => {
  useBrandFolder({ 'brand.json': '{"productName":"Acme <Models>","shortName":"Acme"}' });
  const page = await authPage('signed-out').text();
  expect(page).toContain('<title>Signed out · Acme &lt;Models&gt;</title>');
  expect(page).toContain('<img src="/brand/logo-mark.svg"');
  expect(page).toContain('<span>Acme &lt;Models&gt;</span>');
  expect(page).toContain('href="/brand/favicon.svg"');
  expect(page.indexOf('/auth/style.css')).toBeLessThan(page.indexOf('/brand/brand.css'));
  expect(page).not.toContain('Semantic Workbench');
});

test('reading the active brand before start-up has set it is an error', () => {
  resetActiveBrand();
  expect(() => activeBrand()).toThrow('has not been loaded');
});

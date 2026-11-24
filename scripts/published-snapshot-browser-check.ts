// Checks publication controls using isolated definitions and mocked publication responses.
import { chromium, expect, type Page, type Locator } from '@playwright/test';
import { publishLocalCopy } from './helpers/sync-dialog';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { appUrl } from './helpers/base-url';
import { routeApi, startIsolatedApi } from './helpers/isolated-api';
import { readZip } from '../tests/helpers/zip-reader';
import { LOCAL_READER } from '../src/server/projects/reader';
import type { PublishedStatus } from '../src/shared/scm/published-status';

const screenshotDirectory = process.env.SW_SCREENSHOT_DIR;
if (screenshotDirectory) mkdirSync(screenshotDirectory, { recursive: true });
async function capture(page: Page, name: string) {
  if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, `${name}-${page.viewportSize()!.width}.png`) });
}

const sizes = [
  [390, 844],
  [1024, 768],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];
async function assertPublicationGeometry(page: Page, publication: Locator, name: string) {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const geometry = await publication.evaluate(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, overflow: element.scrollWidth > element.clientWidth + 1, viewport: innerWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.overflow).toBe(false);
    await capture(page, name);
  }
}

const commit = 'a'.repeat(40);
const next = 'b'.repeat(40);
const api = await startIsolatedApi({ watch: false });
const project = await api.ws.loadExample('commerce');
const mapped = await api.ws.loadExample('mapped-commerce');
await api.ws.publish(mapped.slug, LOCAL_READER);
const model = api.ws.documents().find(document => document.project === mapped.slug && document.filename === 'commerce.mapped-semantic.yaml')!;
await api.ws.saveFile(mapped.slug, model.path, { baseHash: model.hash, source: model.source.replace('SUM(orders.amount)', 'SUM(orders.amount) + 17') }, LOCAL_READER);
const browser = await chromium.launch();
let passed = 0;
try {
  for (const mode of ['local', 'server'] as const) {
    const page = await browser.newPage();
    let published: PublishedStatus = { state: 'in-sync', branch: 'main', commit, ahead: 1, behind: 0, notice: true };
    const actions: string[] = [];
    let withoutHistory = false;
    await routeApi(page, api, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/me' || path === '/api/projects') {
        const response = await route.fetch({ url: api.url + path });
        const value = await response.json();
        const json =
          path === '/api/me'
            ? { ...value, mode }
            : value.map((item: object) => ({
                ...item,
                published: published.state === 'none' ? null : { branch: published.branch, commit: published.commit },
                actions: ['publish', 'commit', 'branch', 'setRemote', 'export', ...(withoutHistory ? [] : ['history'])],
              }));
        await route.fulfill({ response, json });
        return true;
      }
      if (path.endsWith('/git/status')) {
        if (withoutHistory) {
          await route.fulfill({ status: 403, json: { error: 'History is not granted.' } });
          return true;
        }
        const response = await route.fetch({ url: api.url + path });
        await route.fulfill({ response, json: { ...(await response.json()), published } });
        return true;
      }
      const action = path.split('/').at(-1)!;
      if (['publish', 'adopt', 'acknowledge-publication'].includes(action)) {
        actions.push(action);
        if (action === 'acknowledge-publication') published = { ...published, notice: false };
        else published = { state: 'in-sync', branch: 'main', commit: next, ahead: 0, behind: 0, notice: false };
        await route.fulfill({ json: { acknowledged: true, published: 'main', commit: next } });
        return true;
      }
      return false;
    });
    await page.goto(appUrl());
    await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: 'commerce-business.ossie.yaml', exact: true }).first().click();
    await page.getByRole('button', { name: /^Source control/ }).click();
    const publication = page.getByLabel('Published snapshot');
    await expect(publication).toContainText('Published: main @ aaaaaaa');
    await expect(publication).toContainText('1 ahead');
    await assertPublicationGeometry(page, publication, `${mode}-snapshot-notice`);
    await publication.getByRole('button', { name: 'Got it' }).click();
    await expect(publication.getByRole('button', { name: 'Got it' })).toHaveCount(0);
    expect(actions).toContain('acknowledge-publication');
    if (mode === 'local') {
      await publishLocalCopy(page);
      await expect(publication).toContainText('Published: main @ bbbbbbb');
      expect(actions).toContain('publish');
    } else await expect(publication.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    published = { state: 'pending', branch: 'main', commit, ahead: 1, behind: 0, notice: false, pending: { next, commits: 1, move: 'fast-forward' } };
    await page.reload();
    await page.getByRole('button', { name: /^Source control/ }).click();
    await expect(publication).toContainText('Outside move: fast-forward');
    await assertPublicationGeometry(page, publication, `${mode}-snapshot-adopt`);
    await publication.getByRole('button', { name: 'Adopt', exact: true }).click();
    await expect(publication).toContainText('Published: main @ bbbbbbb');
    expect(actions).toContain('adopt');
    await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: 'commerce.mapping.yaml', exact: true }).first().click();
    await page.getByRole('button', { name: 'Mappings', exact: true }).click();
    await expect(page.locator('.mapping-heading-note')).toContainText('Preview of your working copy · Published: main @ bbbbbbb');
    await capture(page, `${mode}-mappings-preview`);
    await page.getByRole('button', { name: 'Show query', exact: true }).click();
    const composer = page.getByRole('dialog', { name: 'Compose a query' });
    await composer.getByRole('checkbox', { name: 'Metric gross_revenue', exact: true }).check();
    const planned = page.waitForResponse(response => response.url().includes('/api/preview/plan'));
    await composer.getByRole('button', { name: 'Preview governed query', exact: true }).click();
    const plan = await planned;
    expect(plan.status(), await plan.text()).toBe(200);
    expect(await plan.text()).toContain('+ 17');
    await composer.getByRole('button', { name: 'Close', exact: true }).click();
    withoutHistory = true;
    const projectName = api.ws.project(mapped.slug).name;
    async function openExport() {
      await page.getByRole('button', { name: `Actions for ${projectName}`, exact: true }).click();
      await page.getByRole('menuitem', { name: 'Export project…' }).click();
      return page.getByRole('dialog', { name: `Export ${projectName}`, exact: true });
    }
    const dialog = await openExport();
    await expect(dialog.getByRole('option', { name: 'Published', exact: true })).toHaveCount(1);
    await dialog.getByLabel('Files to export').selectOption('published');
    await expect(dialog.getByRole('checkbox')).toBeDisabled();
    await capture(page, `${mode}-published-export`);
    const exported = page.waitForResponse(response => response.url().includes('/export?source=published'));
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const exportResponse = await exported;
    expect(exportResponse.status()).toBe(200);
    const archive = readZip(new Uint8Array(await Bun.file((await (await downloaded).path())!).arrayBuffer()));
    expect(new TextDecoder().decode(archive.get(model.path)!)).not.toContain('+ 17');
    await expect(dialog).toHaveCount(0);
    published = { state: 'none', reason: 'no-commit', notice: false };
    const unavailableDialog = await openExport();
    await expect(unavailableDialog.getByRole('option', { name: 'Published', exact: true })).toHaveCount(0);
    await unavailableDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (mode === 'local') {
      withoutHistory = false;
      published = { state: 'none', reason: 'no-commit', notice: true };
      await page.reload();
      await page.getByRole('button', { name: /^Source control/ }).click();
      await expect(publication).toContainText('Choose the default branch with git config workbench.defaultBranch');
      await assertPublicationGeometry(page, publication, 'local-unknown-default-notice');
      await publication.getByRole('button', { name: 'Got it' }).click();
      await expect(publication.getByRole('button', { name: 'Got it' })).toHaveCount(0);
    }
    await page.close();
    passed++;
    console.log(`PASS ${mode} publication controls and six viewport geometries (${project.slug})`);
  }
  console.log(`${passed} published snapshot browser checks passed.`);
} finally {
  await browser.close();
  await api.stop();
}

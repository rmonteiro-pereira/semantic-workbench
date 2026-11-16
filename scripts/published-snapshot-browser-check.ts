// Checks publication controls using isolated definitions and mocked publication responses.
import { chromium, expect } from '@playwright/test';
import { appUrl } from './helpers/base-url';
import { routeApi, startIsolatedApi } from './helpers/isolated-api';
import type { PublishedStatus } from '../src/shared/scm/published-status';

const sizes = [
  [390, 844],
  [1024, 768],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];
const commit = 'a'.repeat(40);
const next = 'b'.repeat(40);
const api = await startIsolatedApi({ watch: false });
const project = await api.ws.loadExample('commerce');
const browser = await chromium.launch();
let passed = 0;
try {
  for (const mode of ['local', 'server'] as const) {
    const page = await browser.newPage();
    let published: PublishedStatus = { state: 'in-sync', branch: 'main', commit, ahead: 1, behind: 0, notice: true };
    const actions: string[] = [];
    await routeApi(page, api, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/me' || path === '/api/projects') {
        const response = await route.fetch({ url: api.url + path });
        const value = await response.json();
        const json = path === '/api/me' ? { ...value, mode } : value.map((item: object) => ({ ...item, actions: ['publish', 'commit', 'branch', 'setRemote'] }));
        await route.fulfill({ response, json });
        return true;
      }
      if (path.endsWith('/git/status')) {
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
    await publication.getByRole('button', { name: 'Got it' }).click();
    await expect(publication.getByRole('button', { name: 'Got it' })).toHaveCount(0);
    expect(actions).toContain('acknowledge-publication');
    if (mode === 'local') {
      await publication.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(publication).toContainText('Published: main @ bbbbbbb');
      expect(actions).toContain('publish');
    } else await expect(publication.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    published = { state: 'pending', branch: 'main', commit, ahead: 1, behind: 0, notice: false, pending: { next, commits: 1, move: 'fast-forward' } };
    await page.reload();
    await page.getByRole('button', { name: /^Source control/ }).click();
    await expect(publication).toContainText('Outside move: fast-forward');
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const geometry = await publication.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, overflow: element.scrollWidth > element.clientWidth + 1, viewport: innerWidth };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.overflow).toBe(false);
    }
    await publication.getByRole('button', { name: 'Adopt', exact: true }).click();
    await expect(publication).toContainText('Published: main @ bbbbbbb');
    expect(actions).toContain('adopt');
    await page.close();
    passed++;
    console.log(`PASS ${mode} publication controls and six viewport geometries (${project.slug})`);
  }
  console.log(`${passed} published snapshot browser checks passed.`);
} finally {
  await browser.close();
  await api.stop();
}

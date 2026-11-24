// Checks, in a real browser, that an agent's save through the local endpoint refreshes an open editor and keeps the person's unsaved draft, and that the Admin audit view shows agent records with their tool.
import { chromium, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { appUrl } from './helpers/base-url';
import { adminArea } from './helpers/admin-browser';
import { expectEditorValue, fillEditor } from './helpers/code-editor';
import { projectFile } from '../src/server/projects/paths';
import { startLocalServer } from '../tests/mcp/helpers/local-server';

const server = await startLocalServer({ examples: ['commerce'] });
const client = await server.connect('browser-check');
const commerce = (await server.ws.loadExample('commerce')).slug;
const file = 'commerce-business.ossie.yaml';
const diskText = () => readFileSync(projectFile(server.ws.layout, commerce, file), 'utf8');
const call = async (name: string, args: Record<string, unknown>): Promise<any> => ((await client.callTool({ name, arguments: args })) as any).structuredContent;

// The page's requests go to the isolated server with an origin that server accepts.
async function routeToServer(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const target = new URL(route.request().url());
    const url = server.url + target.pathname + target.search;
    if (route.request().method() === 'GET') return route.continue({ url });
    const original = await route.request().allHeaders();
    const response = await route.fetch({ url, headers: { ...original, origin: server.url, 'sec-fetch-site': 'same-origin' }, maxRedirects: 0 });
    return route.fulfill({ response });
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const editor = () => page.getByRole('textbox', { name: 'Definition source' });
try {
  await routeToServer(page);
  await page.goto(appUrl());
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: file, exact: true }).first().click();
  await page.locator('.tabs').getByRole('button', { name: 'Source' }).click();
  await expect(editor()).toBeVisible();
  await check("an agent's save refreshes the open editor", async () => {
    const before = diskText();
    const saved = await call('save_file', {
      project: commerce,
      path: file,
      baseVersion: (await call('read_file', { project: commerce, path: file, length: 1 })).data.version,
      patches: [{ from: 0, to: 0, insert: '# edited by an agent\n' }],
    });
    expect(saved.ok).toBe(true);
    await expectEditorValue(editor(), '# edited by an agent\n' + before, { timeout: 15_000 });
  });
  await check("an agent's save keeps the person's unsaved draft", async () => {
    const disk = diskText();
    const draft = disk.replace('# edited by an agent', '"Broken quote');
    await fillEditor(editor(), draft);
    await expect(page.getByRole('status', { name: 'Save state' })).toHaveText(/^Not saved: \d+ errors?$/, { timeout: 8000 });
    await expect.poll(() => server.ws.state.drafts().map(entry => entry.path), { timeout: 8000 }).toEqual([file]);
    const version = (await call('read_file', { project: commerce, path: file, length: 1 })).data.version;
    const saved = await call('save_file', { project: commerce, path: file, baseVersion: version, patches: [{ from: 0, to: 0, insert: '# second agent edit\n' }] });
    expect(saved.ok).toBe(true);
    await expect.poll(() => server.ws.state.drafts().map(entry => entry.path)).toEqual([file]);
    await expectEditorValue(editor(), draft, { timeout: 5000 });
  });
  await check('the Admin audit view shows the agent records with their tool', async () => {
    const audit = await adminArea(page, 'Audit');
    await expect(audit.getByText('files.save').first()).toBeVisible();
    await expect(audit.getByText('documents.list', { exact: false }).or(audit.getByText('files.read')).first()).toBeVisible();
  });
  if (errors.length) throw Error(`Page errors: ${errors.join('; ')}`);
  console.log(`MCP browser check passed: ${passed} checks.`);
} finally {
  await browser.close();
  await server.close();
}

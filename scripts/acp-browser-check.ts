// Usage: bun scripts/acp-browser-check.ts [--closed-only]. Serves the built app against an isolated workspace and a person-run reference relay.
import { chromium, expect, type Page } from '@playwright/test';
import { loadBrandBundle, setActiveBrand } from '../src/server/brand/bundle';
import { resolve } from 'node:path';
import { startPanelServer } from '../tests/acp/helpers/panel-server';
import { startRelay, type RelayProcess } from '../tests/acp/helpers/relay-process';
import { END_REASONS } from '../src/server/acp/panel-session';

setActiveBrand(loadBrandBundle());
const server = await startPanelServer({ examples: ['mapped-commerce'], port: 5418, staticRoot: resolve('dist') });
const browser = await chromium.launch({ headless: true });
const virtual = '/workbench/mapped-commerce/commerce.mapped-ontology.yaml';
let relay: RelayProcess | undefined;
let passed = 0;
const panelEvents = /\/api\/acp\/sessions\/[^/]+\/events(?:\?|$)/;

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Agent panel', exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message to your agent' }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}
async function simulateConnectionFailures(page: Page) {
  let failSetup = true;
  let failStream = true;
  // One persistent handler avoids racing a one-shot route's removal against registration of the next route.
  await page.route('**/api/acp/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/acp/sessions' && request.method() === 'POST' && failSetup) {
      failSetup = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Connection setup unavailable.' }) });
      return;
    }
    if (panelEvents.test(request.url()) && failStream) {
      await route.fulfill({ status: 503, body: '{}' });
      return;
    }
    await route.continue();
  });
  return () => {
    failStream = false;
  };
}

async function contained(page: Page) {
  const geometry = await page.locator('.agent-panel').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, width: innerWidth, scroll: document.documentElement.scrollWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  const clipping = await page.locator('.agent-panel').evaluate(element =>
    [...element.querySelectorAll('p,li,button,h3,.agent-text')].some(child => {
      const style = getComputedStyle(child);
      return style.textOverflow === 'ellipsis' || (style.getPropertyValue('-webkit-line-clamp') !== 'none' && style.getPropertyValue('-webkit-line-clamp') !== '');
    }),
  );
  expect(clipping).toBe(false);
}

try {
  for (const width of [360, 768, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
      const errors: string[] = [];
      const writes: string[] = [];
      const panelRequests: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (request.url().includes('/api/acp/')) panelRequests.push(request.url());
        if (request.url().includes('/api/acp/') && request.method() !== 'GET') writes.push(request.headers()['x-sw-request'] ?? 'missing');
      });
      try {
        await page.goto(server.url);
        await expect(page.getByRole('button', { name: 'Person menu', exact: true })).toBeVisible();
        const before = await page.locator('.canvas-row').boundingBox();
        expect(panelRequests).toEqual([]);
        if (process.argv.includes('--closed-only')) {
          passed++;
          continue;
        }
        await openPanel(page);
        await expect(page.getByRole('dialog', { name: 'Connect your agent' })).toBeVisible();
        await expect(page.getByText(/does not call a language model/)).toBeVisible();
        expect(panelRequests).toEqual([]);
        const recoverStream = await simulateConnectionFailures(page);
        await page.getByRole('button', { name: 'Start session', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'Connection setup unavailable.' })).toBeVisible();
        const disconnected = page.waitForResponse(response => panelEvents.test(response.url()) && response.status() === 503);
        const creating = page.waitForResponse(response => response.url().endsWith('/api/acp/sessions') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Start session', exact: true }).click();
        const created = await (await creating).json();
        await disconnected;
        await expect(page.getByText(/Waiting for your agent/)).toBeVisible();
        await expect(page.getByText('Disconnected from the event stream. Reconnecting…', { exact: true })).toBeVisible();
        recoverStream();
        await contained(page);
        const session = server.service.store.findForRelay(created.id)!;
        relay = await startRelay(server, { id: session.id, code: session.code! }, [
          [
            { say: '<script>never execute</script>' },
            { say: '/workbench/example/' + 'long-path/'.repeat(60) },
            { huge: 200_000 },
            { tool: 'Review definitions' },
            { plan: [{ content: 'task/'.repeat(1000) }] },
            { read: virtual, as: 'original' },
            { write: virtual, from: 'original', append: '# browser agent change\n' },
          ],
          [
            { ask: { title: 'Permission to continue?', options: Array.from({ length: 8 }, (_, index) => ({ id: String(index), name: `Choice ${index} ${'long/'.repeat(120)}` })) } },
            { say: 'Answered.' },
            { read: virtual, as: 'again' },
            { write: virtual, from: 'again', append: '# second agent change\n' },
          ],
          [{ sleep: 1500 }, { say: 'Finished after cancel.' }],
        ]);
        await expect(page.getByText('reference-agent · Connected', { exact: true })).toBeVisible({ timeout: 30_000 });
        await send(page, 'Review this definition');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByLabel("The agent's task list")).toContainText('task/');
        await expect(page.getByLabel('Conversation')).toContainText('<script>never execute</script>');
        expect(await page.locator('.agent-panel script').count()).toBe(0);
        await contained(page);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByText('Earlier text restored.', { exact: true })).toBeVisible();
        await send(page, 'Ask permission');
        const question = page.getByRole('alert', { name: 'Agent permission question' });
        await expect(question).toBeVisible();
        await expect(question.getByRole('button').first()).toBeFocused();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        const outline = await question
          .getByRole('button')
          .first()
          .evaluate(element => {
            return getComputedStyle(element).outlineStyle;
          });
        expect(outline).not.toBe('none');
        await contained(page);
        await question.getByRole('button').first().click();
        await expect(question).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
        const currentResponse = await server.browser('/api/projects/mapped-commerce/files/commerce.mapped-ontology.yaml');
        const current = await currentResponse.json();
        const external = await server.browser('/api/projects/mapped-commerce/files/commerce.mapped-ontology.yaml', {
          method: 'PUT',
          json: { baseHash: current.hash, source: current.source + '# outside change\n' },
        });
        expect(external.status).toBe(200);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByText('The file changed since this edit. Undo did not save anything.', { exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Message to your agent' })).toBeEnabled();
        await send(page, 'Wait');
        await page.getByRole('button', { name: 'Cancel turn', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Message to your agent' })).toBeEnabled({ timeout: 15_000 });
        await page.getByRole('button', { name: 'Close agent panel', exact: true }).click();
        await expect(page.getByRole('complementary', { name: 'Agent panel' })).toHaveCount(0);
        const after = await page.locator('.canvas-row').boundingBox();
        expect(after).toEqual(before);
        expect(writes.length).toBeGreaterThan(0);
        expect(writes.every(marker => marker === '1')).toBe(true);
        expect(errors).toEqual([]);
        passed++;
      } finally {
        await relay?.stop();
        relay = undefined;
        await page.close();
      }
    }
  }
  if (!process.argv.includes('--closed-only')) {
    const page = await browser.newPage();
    try {
      for (const reason of END_REASONS) {
        await page.goto(server.url);
        await openPanel(page);
        if (reason === 'server-restarted') await page.route(panelEvents, route => route.fulfill({ status: 404, body: '{}' }));
        const creating = page.waitForResponse(response => response.url().endsWith('/api/acp/sessions') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Start session', exact: true }).click();
        const created = await (await creating).json();
        if (reason !== 'server-restarted') {
          await expect(page.getByText(/Waiting for your agent/)).toBeVisible();
          server.service.end(server.service.store.findForRelay(created.id)!, reason);
        }
        await expect(page.getByRole('button', { name: 'Start a new session', exact: true })).toBeVisible();
        if (reason === 'server-restarted') await expect(page.getByText(/The server no longer holds this session/)).toBeVisible();
        else expect(server.service.store.findForRelay(created.id)!.timing.endReason).toBe(reason);
        await page.getByRole('button', { name: 'Close agent panel', exact: true }).click();
        await page.unroute(panelEvents);
        server.service.end(server.service.store.findForRelay(created.id)!, 'closed');
      }
    } finally {
      await page.close();
    }
  }
  console.log(`Agent panel browser check passed: ${passed} viewport/theme conversations; closed screens sent no panel requests.`);
} finally {
  await relay?.stop();
  await browser.close();
  await server.close();
}

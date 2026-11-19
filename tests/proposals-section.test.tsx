// The Proposals section exists in server mode only, asks for nothing in local mode, and refreshes
// when a proposal event arrives from another browser.
import { afterAll, beforeAll, test } from 'bun:test';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { openProposalsHarness, proposalView, proposalsMock } from './helpers/proposals-harness';

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function open(mock = proposalsMock()): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
  await openProposalsHarness(page, mock);
  return page;
}

test('local mode renders nothing and sends no proposal request', async () => {
  const mock = proposalsMock({ mode: 'local' });
  const page = await open(mock);
  await page.waitForRequest(request => request.url().endsWith('/api/me'));
  await page.waitForTimeout(300);
  await expect(page.getByRole('region', { name: 'Proposals' })).toHaveCount(0);
  expect(mock.requests.some(request => request.path.includes('/proposals'))).toBe(false);
  await page.close();
});

test('server mode lists the proposals of the project with their status and projects', async () => {
  const page = await open();
  const section = page.getByRole('region', { name: 'Proposals' });
  await expect(section.getByRole('button', { name: /Rename the customer concept/ })).toBeVisible();
  await expect(section).toContainText('Open');
  await expect(section).toContainText('Sales');
  await expect(section).toContainText('never pushed');
  await page.close();
});

test('a proposal event from another browser refreshes the list', async () => {
  const mock = proposalsMock();
  const page = await open(mock);
  const section = page.getByRole('region', { name: 'Proposals' });
  await expect(section.getByRole('button', { name: /Rename the customer concept/ })).toBeVisible();
  mock.views.unshift(proposalView({ id: 'second', name: 'A second proposal', contributors: [] }));
  await page.evaluate(() => window.dispatchEvent(new Event('proposal-event')));
  await expect(section.getByRole('button', { name: /A second proposal/ })).toBeVisible();
  await page.close();
});

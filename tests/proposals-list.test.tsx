// The proposals list and the dialog that starts one, in every state: loading, empty, failed, long
// text, and the choice of projects limited to what the person may edit.
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

async function open(mock = proposalsMock(), width = 1280): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width, height: 800 } });
  await openProposalsHarness(page, mock);
  return page;
}
const section = (page: Page) => page.getByRole('region', { name: 'Proposals' });

test('while the list loads the section says so, then shows the proposals', async () => {
  const page = await open(proposalsMock({ listDelayMs: 600 }));
  await expect(section(page).getByRole('status')).toContainText('Loading proposals');
  await expect(section(page).getByRole('button', { name: /Rename the customer concept/ })).toBeVisible();
  await page.close();
});

test('an empty list explains what a proposal is and still offers a new one', async () => {
  const page = await open(proposalsMock({ views: [] }));
  await expect(section(page)).toContainText('No proposals yet');
  await expect(section(page).getByRole('button', { name: 'New proposal' })).toBeEnabled();
  await page.close();
});

test('a failed list shows the reason and tries again on request', async () => {
  const mock = proposalsMock({ listStatus: 500 });
  const page = await open(mock);
  await expect(section(page).getByRole('alert')).toContainText('could not list proposals');
  mock.listStatus = 200;
  await section(page).getByRole('button', { name: 'Try again' }).click();
  await expect(section(page).getByRole('button', { name: /Rename the customer concept/ })).toBeVisible();
  await page.close();
});

test('a long name and many contributors wrap instead of being cut', async () => {
  const longName = 'Rename the customer concept across the sales, billing and reporting definitions and keep every mapping in step with it';
  const mock = proposalsMock({ views: [proposalView({ name: longName, contributors: ['Alice Andrade', 'Bob Barros', 'Carol Costa', 'Dave Dias', 'Frank Freitas'] })] });
  const page = await open(mock, 390);
  const row = section(page).getByRole('button', { name: new RegExp(longName.slice(0, 30)) });
  await expect(row).toBeVisible();
  const overflow = await row.evaluate(element => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.close();
});

test('the new proposal dialog offers only projects the person may edit and creates the proposal', async () => {
  const mock = proposalsMock({ views: [] });
  const page = await open(mock);
  await section(page).getByRole('button', { name: 'New proposal' }).click();
  const dialog = page.getByRole('dialog', { name: 'New proposal' });
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await expect(dialog.getByRole('checkbox', { name: 'People' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Create proposal' })).toBeDisabled();
  await dialog.getByLabel('Name').fill('Add billing terms');
  await dialog.getByRole('checkbox', { name: 'Billing' }).check();
  await dialog.getByRole('button', { name: 'Create proposal' }).click();
  await expect(page.getByRole('dialog', { name: 'Add billing terms' })).toBeVisible();
  const created = mock.requests.find(request => request.method === 'POST' && request.path.endsWith('/proposals'));
  expect(created?.body).toEqual({ name: 'Add billing terms', projects: ['sales', 'billing'] });
  await page.close();
});

test('a refused creation shows the reason and keeps the dialog open', async () => {
  const page = await open(proposalsMock({ views: [] }));
  await section(page).getByRole('button', { name: 'New proposal' }).click();
  const dialog = page.getByRole('dialog', { name: 'New proposal' });
  await dialog.getByLabel('Name').fill('Too many');
  await page.route('**/api/projects/sales/proposals', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 409, json: { error: 'limit', message: 'A repository holds at most 50 open proposals. Close or promote one first.' } });
    return route.fallback();
  });
  await dialog.getByRole('button', { name: 'Create proposal' }).click();
  await expect(dialog.getByRole('alert')).toContainText('at most 50 open proposals');
  await expect(dialog).toBeVisible();
  await page.close();
});

// One proposal in its dialog: the actions follow the person's authority, the promotion check shows
// each reason in plain words, publishing waits for a passing check, and a stale view heals.
import { afterAll, beforeAll, test } from 'bun:test';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { openProposalsHarness, proposalView, proposalsMock, type ProposalsMock } from './helpers/proposals-harness';

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function openDetail(mock: ProposalsMock, name = /Rename the customer concept/): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } });
  await openProposalsHarness(page, mock);
  await page.getByRole('region', { name: 'Proposals' }).getByRole('button', { name }).click();
  return page;
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Rename the customer concept' });

test('a contributor sees work, synchronize and contribute, and nothing that publishes', async () => {
  const mock = proposalsMock({ views: [proposalView({ mine: { branch: 'work/alice.rename-customer', behind: true } })] });
  const page = await openDetail(mock);
  for (const name of ['Work on this proposal', 'Synchronize', 'Contribute']) await expect(dialog(page).getByRole('button', { name })).toBeVisible();
  for (const name of ['Check promotion', 'Close proposal', 'Restore proposal', 'Promote proposal']) await expect(dialog(page).getByRole('button', { name })).toHaveCount(0);
  await expect(dialog(page)).toContainText('lacks the latest contribution');
  await page.close();
});

test('the changed files list per project and a chosen file shows its comparison', async () => {
  const page = await openDetail(proposalsMock());
  await expect(dialog(page).getByRole('region', { name: 'Changes in Sales' })).toBeVisible();
  await dialog(page)
    .getByRole('button', { name: /sales.ontology.yaml/ })
    .click();
  await expect(dialog(page).getByLabel('Comparison of sales.ontology.yaml')).toBeVisible();
  await page.close();
});

test('a promoter checks first, sees every reason in plain words, and publishes only after a pass', async () => {
  const mock = proposalsMock({
    views: [proposalView({ may: { contribute: true, promote: true, close: true, restore: false } })],
    check: { ok: false, reasons: ['not-descendant', 'guard'], files: ['orders.odcs.yaml'] },
  });
  const page = await openDetail(mock);
  const promote = dialog(page).getByRole('button', { name: 'Promote proposal' });
  await expect(promote).toBeDisabled();
  await expect(dialog(page)).toContainText('Check the promotion before publishing');
  await dialog(page).getByRole('button', { name: 'Check promotion' }).click();
  await expect(dialog(page)).toContainText('The published version moved on');
  await expect(dialog(page)).toContainText('only a Steward may publish');
  await expect(dialog(page).getByText('orders.odcs.yaml')).toBeVisible();
  await expect(promote).toBeDisabled();
  mock.check = { ok: true, reasons: [], files: [] };
  await dialog(page).getByRole('button', { name: 'Check promotion' }).click();
  await expect(dialog(page)).toContainText('Publishing would work now');
  await expect(promote).toBeEnabled();
  await promote.click();
  await expect(dialog(page).getByText('Published', { exact: true }).first()).toBeVisible();
  await expect(promote).toHaveCount(0);
  const sent = mock.requests.find(request => request.path.endsWith('/promote'));
  expect(sent?.body).toEqual({ expectedTip: 'a'.repeat(40) });
  await page.close();
});

test('a closed proposal offers restore and no other action', async () => {
  const mock = proposalsMock({ views: [proposalView({ status: 'closed', may: { contribute: false, promote: false, close: false, restore: true } })] });
  const page = await openDetail(mock);
  await expect(dialog(page).getByRole('button', { name: 'Restore proposal' })).toBeVisible();
  for (const name of ['Work on this proposal', 'Check promotion', 'Close proposal']) await expect(dialog(page).getByRole('button', { name })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Restore proposal' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Close proposal' })).toBeVisible();
  await page.close();
});

test('a refusal is shown in words and the proposal is read again', async () => {
  const mock = proposalsMock({
    views: [proposalView({ mine: { branch: 'work/alice.rename-customer', behind: false } })],
    refuse: { status: 409, error: 'stale-tip', message: 'Someone else changed this proposal. Synchronize it and review it again.' },
  });
  const page = await openDetail(mock);
  const reads = () => mock.requests.filter(request => request.method === 'GET' && request.path.endsWith('/rename-customer')).length;
  const before = reads();
  await dialog(page).getByRole('button', { name: 'Contribute' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Someone else changed this proposal');
  await expect.poll(reads).toBeGreaterThan(before);
  await page.close();
});

test('a proposal that is no longer available says so', async () => {
  const mock = proposalsMock();
  const page = await openDetail(mock);
  mock.views.length = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('proposal-event')));
  await expect(dialog(page).getByRole('alert')).toContainText('not available');
  await page.close();
});

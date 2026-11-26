// Shared proposals: the list and detail in three viewports, then the check, promote, close and restore steps
// and the empty, loading, error and long-text states.
import { expect, type Page } from '@playwright/test';
import { openProposalsHarness, proposalView, proposalsMock } from '../../../tests/helpers/proposals-harness';
import { attempt, capture, newPage, type CaptureSession, type Viewport } from './session';

const VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
];
const SINGLE_STATES = ['empty', 'loading', 'error', 'long-text', 'create', 'close', 'restore'] as const;
type SingleState = (typeof SINGLE_STATES)[number];
const MAY_ALL = { contribute: true, promote: true, close: true, restore: false };

async function openDetail(page: Page, name: string | RegExp) {
  await page
    .getByRole('region', { name: 'Proposals' })
    .getByRole('button', { name: typeof name === 'string' ? new RegExp(name) : name })
    .click();
}

async function captureViewport(session: CaptureSession, [width, theme]: Viewport) {
  const view = proposalView({ may: MAY_ALL });
  const page = await newPage(session, width, theme);
  await openProposalsHarness(page, proposalsMock({ views: [view] }));
  await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
  await expect(page.getByText(view.name).first()).toBeVisible();
  await capture(session, page, 'list', 'main', theme);
  await openDetail(page, view.name);
  await capture(session, page, 'detail', 'dialog[open]', theme);
  if (width === 1280 && theme === 'light') {
    await page.getByRole('button', { name: 'Check promotion' }).click();
    await expect(page.getByText('Publishing would work now')).toBeVisible();
    await capture(session, page, 'check', 'dialog[open]');
    await page.getByRole('button', { name: 'Promote proposal' }).click();
    await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
    await capture(session, page, 'promote', 'dialog[open]');
  }
  await page.close();
}

function proposalName(state: SingleState) {
  if (state === 'long-text') return 'Rename the customer concept across sales, billing and reporting definitions '.repeat(5);
  return 'Rename customer';
}

async function waitForListState(page: Page, state: SingleState, name: string) {
  if (state === 'loading') return page.getByText('Loading proposals').waitFor();
  if (state === 'error') return page.getByRole('alert').waitFor();
  if (state === 'empty') return page.getByText('No proposals yet').waitFor();
  return page.getByText(name).first().waitFor();
}

/** Opens the dialog the state is about and returns what to crop. */
async function openStateDialog(page: Page, state: SingleState) {
  if (state === 'create') {
    await page.getByRole('button', { name: 'New proposal' }).click();
    return 'dialog[open]';
  }
  if (state === 'close' || state === 'restore') {
    await openDetail(page, /Rename customer/);
    await page.getByRole('button', { name: 'Close proposal' }).click();
    await page.getByRole('button', { name: 'Restore proposal' }).waitFor();
    if (state === 'restore') await page.getByRole('button', { name: 'Restore proposal' }).click();
    return 'dialog[open]';
  }
  return 'main';
}

async function captureSingleState(session: CaptureSession, state: SingleState) {
  const view = proposalView({ name: proposalName(state), may: MAY_ALL });
  const mock = proposalsMock({ views: state === 'empty' ? [] : [view], listStatus: state === 'error' ? 500 : 200, listDelayMs: state === 'loading' ? 30000 : 0 });
  const page = await newPage(session);
  await openProposalsHarness(page, mock);
  await waitForListState(page, state, view.name);
  const selector = await openStateDialog(page, state);
  await capture(session, page, state, selector);
  await page.close();
}

export async function captureProposals(session: CaptureSession) {
  for (const viewport of VIEWPORTS) await captureViewport(session, viewport);
  for (const state of SINGLE_STATES) {
    await attempt(session, state, () => captureSingleState(session, state));
  }
}

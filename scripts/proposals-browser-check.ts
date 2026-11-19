// Walks every state of the proposals interface (list, create, detail, check, promote, close,
// restore, and the empty, loading, error and long-text states) at 1280, 768 and 390 pixels in light
// and dark, against a mocked API, asserting that no text is cut and nothing scrolls sideways.
// Screenshots go to the folder this script prints.
import { chromium, expect, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProposalsHarness, proposalView, proposalsMock, type ProposalsMock } from '../tests/helpers/proposals-harness';
import { clippedTextProblems, sidewaysOverflowProblems } from './helpers/clipped-text';
import { expectDialogGeometry } from './helpers/dialog-geometry';
import { geometryProblems } from './helpers/screen-tour';
import { screenshotPath } from './helpers/screenshots';

const WIDTHS: [number, number][] = [
  [1280, 800],
  [768, 900],
  [390, 844],
];
const THEMES = ['light', 'dark'] as const;
const LONG_NAME = 'Rename the customer concept across the sales, billing and reporting definitions and keep every mapping in step with it';
const LONG_PATH = 'domains/sales/very-long-folder-name/another-long-folder-name/customer-and-order-reference-definitions.ontology.yaml';
const folder = process.env.SW_SCREENSHOT_DIR ?? mkdtempSync(join(tmpdir(), 'proposals-screens-'));
console.log(`Screenshots: ${folder}`);

const everyAction = () =>
  proposalView({
    name: LONG_NAME,
    contributors: ['Alice Andrade', 'Bob Barros', 'Carol Costa', 'Dave Dias'],
    projects: [
      { slug: 'sales', name: 'Sales' },
      { slug: 'billing', name: 'Billing' },
    ],
    changes: [{ project: 'sales', files: [{ path: LONG_PATH, status: 'changed' }] }],
    may: { contribute: true, promote: true, close: true, restore: false },
    mine: { branch: 'work/alice.rename-customer', behind: true },
  });

const browser = await chromium.launch();
let checked = 0;

async function inspect(page: Page, scope: string, label: string) {
  expect(await clippedTextProblems(page, scope), `${label}: cut text`).toEqual([]);
  expect(await sidewaysOverflowProblems(page, scope), `${label}: sideways overflow`).toEqual([]);
  expect(await geometryProblems(page, scope), `${label}: geometry`).toEqual([]);
  await page.screenshot({ path: screenshotPath(join(folder, `${label.replace(/\W+/g, '-')}.png`)) });
  checked++;
}

async function visit(width: number, height: number, theme: (typeof THEMES)[number], mock: ProposalsMock) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
  await openProposalsHarness(page, mock);
  await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
  return page;
}

async function walk(width: number, height: number, theme: (typeof THEMES)[number]) {
  const tag = `${width}-${theme}`;
  const loading = await visit(width, height, theme, proposalsMock({ views: [everyAction()], listDelayMs: 1500 }));
  await expect(loading.getByText('Loading proposals')).toBeVisible();
  await inspect(loading, 'main', `${tag} loading`);
  await loading.close();

  const empty = await visit(width, height, theme, proposalsMock({ views: [] }));
  await expect(empty.getByText('No proposals yet')).toBeVisible();
  await inspect(empty, 'main', `${tag} empty`);
  await empty.close();

  const failed = await visit(width, height, theme, proposalsMock({ listStatus: 500 }));
  await expect(failed.getByRole('alert')).toBeVisible();
  await inspect(failed, 'main', `${tag} error`);
  await failed.close();

  const mock = proposalsMock({ views: [everyAction()], check: { ok: false, reasons: ['not-descendant', 'guard', 'authority'], files: [LONG_PATH] } });
  const page = await visit(width, height, theme, mock);
  const section = page.getByRole('region', { name: 'Proposals' });
  await inspect(page, 'main', `${tag} list long text`);
  await section.getByRole('button', { name: 'New proposal' }).click();
  await page.getByLabel('Name').fill(LONG_NAME);
  await expectDialogGeometry(page, `${tag} create`);
  await inspect(page, 'dialog[open]', `${tag} create dialog`);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await section.getByRole('button', { name: new RegExp(LONG_NAME.slice(0, 20)) }).click();
  await inspect(page, 'dialog[open]', `${tag} detail`);
  await page
    .getByRole('button', { name: new RegExp(LONG_PATH.slice(-30)) })
    .first()
    .click();
  await expect(page.getByLabel(/Comparison of/)).toBeVisible();
  await inspect(page, 'dialog[open]', `${tag} comparison`);
  await page.getByRole('button', { name: 'Check promotion' }).click();
  await expect(page.getByText('Files involved:')).toBeVisible();
  await expectDialogGeometry(page, `${tag} check refused`);
  await inspect(page, 'dialog[open]', `${tag} check refused`);
  mock.check = { ok: true, reasons: [], files: [] };
  await page.getByRole('button', { name: 'Check promotion' }).click();
  await expect(page.getByText('Publishing would work now')).toBeVisible();
  await inspect(page, 'dialog[open]', `${tag} check passed`);
  await page.getByRole('button', { name: 'Promote proposal' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  await inspect(page, 'dialog[open]', `${tag} promoted`);
  await page.close();

  const lifecycle = proposalsMock({ views: [everyAction()] });
  const closing = await visit(width, height, theme, lifecycle);
  await closing
    .getByRole('region', { name: 'Proposals' })
    .getByRole('button', { name: new RegExp(LONG_NAME.slice(0, 20)) })
    .click();
  await closing.getByRole('button', { name: 'Close proposal' }).click();
  await expect(closing.getByRole('button', { name: 'Restore proposal' })).toBeVisible();
  await inspect(closing, 'dialog[open]', `${tag} closed`);
  await closing.getByRole('button', { name: 'Restore proposal' }).click();
  await expect(closing.getByRole('button', { name: 'Close proposal' })).toBeVisible();
  await inspect(closing, 'dialog[open]', `${tag} restored`);
  await closing.close();
}

try {
  for (const [width, height] of WIDTHS) for (const theme of THEMES) await walk(width, height, theme);
  console.log(`Proposals browser check passed: ${checked} states inspected.`);
} finally {
  await browser.close();
}

// Measures every state of the proposals interface at three widths in both themes: no text is cut,
// nothing scrolls sideways, and dialogs stay inside the window.
import { afterAll, beforeAll, test } from 'bun:test';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { clippedTextProblems, sidewaysOverflowProblems } from '../scripts/helpers/clipped-text';
import { expectDialogGeometry } from '../scripts/helpers/dialog-geometry';
import { openProposalsHarness, proposalView, proposalsMock } from './helpers/proposals-harness';

const WIDTHS: [number, number][] = [
  [1280, 800],
  [768, 900],
  [390, 844],
];
const THEMES = ['light', 'dark'] as const;
const LONG_NAME = 'Rename the customer concept across the sales, billing and reporting definitions and keep every mapping in step with it';
const LONG_PATH = 'domains/sales/very-long-folder-name/another-long-folder-name/customer-and-order-reference-definitions.ontology.yaml';

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const longProposal = () =>
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

async function visit(width: number, height: number, theme: (typeof THEMES)[number], mock = proposalsMock({ views: [longProposal()] })): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width, height }, colorScheme: theme });
  await openProposalsHarness(page, mock);
  await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
  return page;
}

async function expectNothingCut(page: Page, within: string, label: string) {
  expect(await clippedTextProblems(page, within), `${label}: cut text`).toEqual([]);
  expect(await sidewaysOverflowProblems(page, within), `${label}: sideways overflow`).toEqual([]);
}

for (const [width, height] of WIDTHS) {
  for (const theme of THEMES) {
    const label = `${width}px ${theme}`;
    test(`the list in every state fits at ${label}`, async () => {
      const page = await visit(width, height, theme);
      await expect(page.getByRole('region', { name: 'Proposals' }).getByRole('button', { name: new RegExp(LONG_NAME.slice(0, 20)) })).toBeVisible();
      await expectNothingCut(page, 'main', `${label} list`);
      await page.close();
      const empty = await visit(width, height, theme, proposalsMock({ views: [] }));
      await expect(empty.getByText('No proposals yet')).toBeVisible();
      await expectNothingCut(empty, 'main', `${label} empty`);
      await empty.close();
      const failed = await visit(width, height, theme, proposalsMock({ listStatus: 500 }));
      await expect(failed.getByRole('alert')).toBeVisible();
      await expectNothingCut(failed, 'main', `${label} error`);
      await failed.close();
    }, 60_000);

    test(`the dialogs fit at ${label}`, async () => {
      const mock = proposalsMock({ views: [longProposal()], check: { ok: false, reasons: ['not-descendant', 'guard', 'authority'], files: [LONG_PATH] } });
      const page = await visit(width, height, theme, mock);
      const section = page.getByRole('region', { name: 'Proposals' });
      await section.getByRole('button', { name: 'New proposal' }).click();
      await page.getByLabel('Name').fill(LONG_NAME);
      await expectDialogGeometry(page, `${label} new proposal`);
      await expectNothingCut(page, 'dialog[open]', `${label} new proposal`);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await section.getByRole('button', { name: new RegExp(LONG_NAME.slice(0, 20)) }).click();
      await page.getByRole('button', { name: 'Check promotion' }).click();
      await page
        .getByRole('button', { name: new RegExp(LONG_PATH.slice(-30)) })
        .first()
        .click();
      await expect(page.getByText('Files involved:')).toBeVisible();
      await expectDialogGeometry(page, `${label} detail`);
      await expectNothingCut(page, 'dialog[open]', `${label} detail`);
      await page.close();
    }, 60_000);
  }
}

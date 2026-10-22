// Checks metric approval and classification guards in signed-in browser sessions: an Editor
// proposes and is refused approvals and classification changes, a Steward approves.
import assert from 'node:assert/strict';
import { expect, type Browser, type Page } from '@playwright/test';
import type { TestUserName } from '../tests/helpers/auth-identities';
import { check, signIn, type SignInTarget } from './helpers/sign-in';

const METRICS = { project: 'sales-metrics', path: 'sales.semantic.yaml' };
const CONTRACT = { project: 'sales-contracts', path: 'orders.odcs.yaml' };

type File = { project: string; path: string };

/** Opens a file from the project tree, expanding its project first. */
async function openTreeFile(page: Page, target: SignInTarget, file: File) {
  const projects = await (await page.request.get(target.url + '/api/projects')).json();
  const name = projects.find((project: { slug: string }) => project.slug === file.project).name;
  const tree = page.getByRole('treeitem', { name, exact: true });
  if ((await tree.getAttribute('aria-expanded')) === 'false') {
    await tree.getByRole('button', { name, exact: true }).click();
  }
  await tree.getByRole('button', { name: file.path, exact: true }).click();
}

/** Opens one metric's detail on the Metrics tab of the sales model. */
async function openMetric(page: Page, target: SignInTarget, metric: string) {
  await openTreeFile(page, target, METRICS);
  await page
    .locator('.tabs')
    .getByRole('button', { name: /^Metrics/ })
    .click();
  await page.getByRole('button', { name: `${metric}: explain`, exact: true }).click();
  return page.getByRole('region', { name: `Metric ${metric}` });
}

/** Saves a whole file through the API as the signed-in person, as a crafted request would. */
async function forgeSave(
  page: Page,
  target: SignInTarget,
  file: File,
  edit: (text: string) => string,
) {
  const url = `${target.url}/api/projects/${file.project}/files/${file.path}`;
  const current = await (await page.request.get(url)).json();
  const response = await page.request.put(url, {
    headers: { Origin: target.url, 'X-SW-Request': '1' },
    data: { baseHash: current.hash, source: edit(current.source) },
  });
  return { status: response.status(), body: await response.json() };
}

async function editorRefusals(page: Page, target: SignInTarget) {
  const detail = await openMetric(page, target, 'order_count');
  const approve = detail.getByRole('button', { name: 'Approve', exact: true });
  await expect(approve).toBeDisabled();
  await expect(approve).toHaveAttribute('title', /Steward/);
  const approval = await forgeSave(page, target, METRICS, text =>
    text.replace(/("owner": "alice@example.org", "status": )"proposed"/, '$1"approved"'),
  );
  assert.equal(approval.status, 403, 'An Editor approved a metric');
  assert.equal(approval.body.guarded[0].kind, 'metric-status');
  const classification = await forgeSave(page, target, CONTRACT, text =>
    text.replace('classification: internal', 'classification: public'),
  );
  assert.equal(classification.status, 403, 'An Editor changed a classification');
  assert.deepEqual(classification.body.guarded, [
    { file: CONTRACT.path, pointer: '/schema/0/properties/2', kind: 'classification' },
  ]);
  await openTreeFile(page, target, CONTRACT);
  await page.locator('.tabs').getByRole('button', { name: 'Contract' }).click();
  await page.getByRole('button', { name: 'Open orders', exact: true }).click();
  const table = page.getByRole('region', { name: 'Dataset orders' });
  await table.getByRole('tab', { name: /^Properties/ }).click();
  await expect(table.getByLabel('Classification of amount')).toBeDisabled();
  await expect(table.getByLabel('Description of amount')).toBeEditable();
  // A confidential property stays read-only for an Editor.
  await expect(table.getByLabel('Description of customer_email')).toHaveCount(0);
}

async function stewardApproves(page: Page, target: SignInTarget) {
  const own = await openMetric(page, target, 'gross_revenue');
  const deprecate = own.getByRole('button', { name: 'Deprecate', exact: true });
  await expect(deprecate).toBeDisabled();
  await expect(deprecate).toHaveAttribute('title', /You own this metric/);
  const detail = await openMetric(page, target, 'order_count');
  await detail.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(detail.getByRole('status').filter({ hasText: 'Approved.' })).toBeVisible();
  await expect(detail.locator('.kpi-status')).toHaveText('approved');
}

async function editorDemotion(page: Page, target: SignInTarget) {
  const saved = await forgeSave(page, target, METRICS, text =>
    text.replace("'COUNT(DISTINCT orders.order_id)'", "'COUNT(orders.order_id)'"),
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.demoted, [
    { file: METRICS.path, pointer: '/metrics/1', metric: 'order_count' },
  ]);
  const detail = await openMetric(page, target, 'order_count');
  await expect(detail.locator('.kpi-status')).toHaveText('proposed');
}

async function asPerson(
  browser: Browser,
  target: SignInTarget,
  username: TestUserName,
  run: (page: Page, target: SignInTarget) => Promise<void>,
) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, target, username);
    await run(page, target);
  } finally {
    await context.close();
  }
}

/** Runs the metric lifecycle as alice (Editor) and bob (Steward), and the classification guard. */
export async function governanceChecks(browser: Browser, target: SignInTarget) {
  await check('Editor refused approval and classification changes', () =>
    asPerson(browser, target, 'alice', editorRefusals),
  );
  await check('Steward approves a proposed metric, not their own', () =>
    asPerson(browser, target, 'bob', stewardApproves),
  );
  await check('Editor change to an approved metric is stored as proposed', () =>
    asPerson(browser, target, 'alice', editorDemotion),
  );
}

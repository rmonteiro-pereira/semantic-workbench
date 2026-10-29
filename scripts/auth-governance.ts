// Checks metric approval and classification guards in signed-in browser sessions: an Editor
// proposes and is refused approvals and classification changes, a Steward approves.
import assert from 'node:assert/strict';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { TestUserName } from '../tests/helpers/auth-identities';
import { authGeometry, authViewports, check, signIn, type SignInTarget } from './helpers/sign-in';

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
async function forgeSave(page: Page, target: SignInTarget, file: File, edit: (text: string) => string) {
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
  // A tooltip is not seen on a touch screen, so the reason is also written beside the button.
  await expect(detail.locator('.kpi-approval-reason')).toContainText('Requires Steward');
  await authGeometry(page, 'metric-approve-disabled');
  const approval = await forgeSave(page, target, METRICS, text => text.replace(/("owner": "alice@example.org", "status": )"proposed"/, '$1"approved"'));
  assert.equal(approval.status, 403, 'An Editor approved a metric');
  assert.equal(approval.body.guarded[0].kind, 'metric-status');
  const classification = await forgeSave(page, target, CONTRACT, text => text.replace('classification: internal', 'classification: public'));
  assert.equal(classification.status, 403, 'An Editor changed a classification');
  assert.deepEqual(classification.body.guarded, [{ file: CONTRACT.path, pointer: '/schema/0/properties/2', kind: 'classification' }]);
  await openTreeFile(page, target, CONTRACT);
  await page.locator('.tabs').getByRole('button', { name: 'Contract' }).click();
  await page.getByRole('button', { name: 'Open orders', exact: true }).click();
  const table = page.getByRole('region', { name: 'Table orders' });
  await table.getByRole('tab', { name: /^Properties/ }).click();
  // The edit dialog is where classification looks disabled for an Editor, with the reason beside it.
  await table.getByRole('button', { name: 'Edit amount', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit orders.amount', exact: true });
  await expect(dialog.getByLabel('Classification')).toBeDisabled();
  await expect(dialog.getByLabel('Description')).toBeEditable();
  await expect(dialog).toContainText('Only a Steward or Admin changes a classification');
  await authGeometry(page, 'property-editors-dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // A confidential property stays read-only for an Editor.
  await expect(table.getByRole('button', { name: 'Edit customer_email', exact: true })).toHaveCount(0);
  await expect(table).toContainText('Only a Steward or Admin changes a classification');
  await authGeometry(page, 'property-editors-editor');
}

/** An Editor's Source edit of a classification is refused with a plain sentence. */
async function sourceRefusalMessage(page: Page, target: SignInTarget) {
  await openTreeFile(page, target, CONTRACT);
  await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
  await page.locator('.cm-line', { hasText: 'classification: internal' }).first().click();
  await page.keyboard.press('End');
  for (let count = 0; count < 'internal'.length; count++) await page.keyboard.press('Backspace');
  await page.keyboard.type('public');
  const sentence = /Not saved: this would include changing a classification/;
  await expect(page.getByText(sentence).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Not saved: Refused/)).toHaveCount(0);
  // A refusal is a warning, not a success bar.
  await expect(page.locator('main > .status')).toHaveClass(/error/);
  await authGeometry(page, 'guarded-refusal', 'main > .status');
}

/** The form takes the whole row, and the outcome of the approval before it is gone. */
async function expectDeprecateFormOnItsOwnRow(detail: Locator) {
  await expect(detail.getByRole('status')).toHaveCount(0);
  const area = await detail.locator('.kpi-approval').boundingBox();
  const form = await detail.locator('.kpi-deprecate').boundingBox();
  assert(area && form, 'The approval area and its form are drawn');
  assert(form.width >= area.width - 2, `The form is ${form.width}px of ${area.width}px`);
}

async function expectDeprecateLayout(page: Page, detail: Locator) {
  const original = page.viewportSize();
  try {
    for (const [width, height] of authViewports) {
      await page.setViewportSize({ width, height });
      const form = detail.locator('.kpi-deprecate');
      await expect(form.getByRole('textbox')).toHaveAttribute('rows', '2');
      const boxes = await form.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
      assert.equal(boxes.length, 2);
      assert(Math.abs(boxes[0].top - boxes[1].top) < 1, `Actions wrap at ${width}px`);
      const placeholderFits = await form.locator('textarea').evaluate(input => {
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = style.font;
        const available = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return context.measureText(input.placeholder).width <= available;
      });
      assert(placeholderFits, `Reason placeholder is clipped at ${width}px`);
    }
  } finally {
    if (original) await page.setViewportSize(original);
  }
}

async function stewardApproves(page: Page, target: SignInTarget) {
  const own = await openMetric(page, target, 'gross_revenue');
  const deprecate = own.getByRole('button', { name: 'Deprecate', exact: true });
  await expect(deprecate).toBeDisabled();
  await expect(deprecate).toHaveAttribute('title', /You own this metric/);
  await expect(own.locator('.kpi-approval-reason')).toContainText('You own this metric');
  const detail = await openMetric(page, target, 'order_count');
  await authGeometry(page, 'metric-approve-steward');
  await detail.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(detail.getByRole('status').filter({ hasText: 'Approved.' })).toBeVisible();
  await expect(detail.locator('.kpi-status')).toHaveText('approved');
  await detail.getByRole('button', { name: 'Deprecate', exact: true }).click();
  await expect(detail.getByLabel('Reason for deprecating')).toBeVisible();
  await expectDeprecateFormOnItsOwnRow(detail);
  await expectDeprecateLayout(page, detail);
  await authGeometry(page, 'metric-deprecate-form');
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
  await publishApproval(page, target);
}

/** Steps a new ratio metric of the sales model forward to the owner step of the wizard. */
async function openWizardOwnerStep(page: Page) {
  await page.getByRole('button', { name: 'New metric', exact: true }).click();
  const wizard = page.getByRole('dialog', { name: 'New metric' });
  const next = () => wizard.getByRole('button', { name: 'Next', exact: true }).click();
  await next();
  await next();
  await wizard.getByLabel('Label').fill('Revenue per order');
  await wizard.getByLabel('Metric type').selectOption('ratio');
  await wizard.getByLabel('Numerator').selectOption('gross_revenue');
  await wizard.getByLabel('Denominator').selectOption('order_count');
  for (let step = 0; step < 3; step++) await next();
  return wizard;
}

/**
 * An owner nobody has signed in as shows the "unverified owner" badge, and the wizard offers the
 * people who may read the project as owners.
 */
async function ownerPickerAndBadge(page: Page, target: SignInTarget) {
  const saved = await forgeSave(page, target, METRICS, text => text.replace('frank@example.org', 'ghost@example.org'));
  assert.equal(saved.status, 200);
  const detail = await openMetric(page, target, 'average_order_value');
  await expect(detail.locator('.kpi-unverified')).toHaveText('unverified owner');
  await authGeometry(page, 'metric-unverified-owner');
  const wizard = await openWizardOwnerStep(page);
  const people = page.locator('#metric-owner-people option');
  await expect(people.filter({ hasText: 'Alice Andrade' })).toHaveAttribute('value', 'alice@example.org');
  await expect(wizard.getByLabel('Owner', { exact: true })).toBeVisible();
  await expect(wizard).toContainText('Suggestions are people who can read this project');
  await authGeometry(page, 'metric-wizard-owner');
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click();
}

/**
 * The approval is in the Steward's own working copy; committing and publishing it is what lets
 * every other reader see it.
 */
async function publishApproval(page: Page, target: SignInTarget) {
  const api = (action: string) => `${target.url}/api/projects/${METRICS.project}/git/${action}`;
  const headers = { Origin: target.url, 'X-SW-Request': '1' };
  const steps: [string, object][] = [
    ['stage', { paths: [METRICS.path] }],
    ['commit', { message: 'Approve order_count' }],
    ['publish', {}],
  ];
  for (const [action, data] of steps) {
    const response = await page.request.post(api(action), { headers, data });
    assert.equal(response.status(), 200, `${action}: ${await response.text()}`);
  }
}

async function editorDemotion(page: Page, target: SignInTarget) {
  const saved = await forgeSave(page, target, METRICS, text => text.replace("'COUNT(DISTINCT orders.order_id)'", "'COUNT(orders.order_id)'"));
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.demoted, [{ file: METRICS.path, pointer: '/metrics/1', metric: 'order_count' }]);
  const detail = await openMetric(page, target, 'order_count');
  await expect(detail.locator('.kpi-status')).toHaveText('proposed');
}

async function asPerson(browser: Browser, target: SignInTarget, username: TestUserName, run: (page: Page, target: SignInTarget) => Promise<void>) {
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
  await check('Editor refused approval and classification changes', () => asPerson(browser, target, 'alice', editorRefusals));
  await check('Editor sees a plain refusal for a classification edit in Source', () => asPerson(browser, target, 'alice', sourceRefusalMessage));
  await check('Steward approves a proposed metric, not their own', () => asPerson(browser, target, 'bob', stewardApproves));
  await check('Editor change to an approved metric is stored as proposed', () => asPerson(browser, target, 'alice', editorDemotion));
  // This save makes Alice's working copy, so it runs after the demotion check: a copy made before
  // the Steward's publish would not hold the approved metric.
  await check('unverified owner badge and the owner picker', () => asPerson(browser, target, 'alice', ownerPickerAndBadge));
}

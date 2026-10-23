// The metric screens of the shipped examples: the metric list and the detail of one metric broken
// down across tables, for the responsive suite and the example checks.
import { expect, type Locator, type Page } from '@playwright/test';
import { EXPECTED_EXAMPLE_METRICS, type ExpectedExampleMetrics } from '../example-metric-checks';
import { exampleSet } from '../../src/projects/examples';
import { showSidebar, type Screen } from './screen-tour';

/** Opens the Metrics tab of an example project, expanding the project in the sidebar first. */
export async function openExampleMetrics(page: Page, setId: string) {
  const name = exampleSet(setId)!.name;
  const project = page.getByRole('treeitem', { name, exact: true });
  // The app closes the phone drawer once while it finishes loading, so a click that lands in
  // that moment is repeated until the tree shows.
  await expect(async () => {
    await showSidebar(page);
    await expect(project).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  if ((await project.getAttribute('aria-expanded')) === 'false')
    await project.getByRole('button', { name, exact: true }).click();
  await project
    .getByRole('button', { name: EXPECTED_EXAMPLE_METRICS[setId].file, exact: true })
    .click();
  await page
    .locator('.tabs')
    .getByRole('button', { name: /^Metrics/ })
    .click();
  await expect(metricsList(page).getByRole('status')).toHaveText(
    `${EXPECTED_EXAMPLE_METRICS[setId].count} metrics`,
  );
}

/** The metrics list of the Metrics tab. */
export const metricsList = (page: Page) => page.getByRole('region', { name: 'Metrics' });

/** The detail of the metric now selected. */
export const metricDetail = (page: Page) => page.getByRole('region', { name: /^Metric / });

/** Selects a metric by its identifier, going back to the list first when a detail is open. */
export async function selectMetric(page: Page, name: string) {
  const back = page.getByRole('button', { name: 'All metrics' });
  if (await back.isVisible()) await back.click();
  const identifier = new RegExp(`^${name}$`);
  await metricsList(page)
    .locator('button.metrics-name')
    .filter({ has: page.locator('code', { hasText: identifier }) })
    .click();
  await expect(metricDetail(page)).toBeVisible();
}

/** Opens one of the detail's closed sections: the rules or the SQL preview. */
export async function openMetricSection(page: Page, title: 'Rules' | 'SQL preview') {
  const section = page.locator('details.on-demand').filter({ hasText: title }).first();
  if ((await section.getAttribute('open')) === null) await section.locator('summary').click();
  await expect(section).toHaveAttribute('open', '');
}

/** The joins the SQL preview lists, empty when the preview has no join. */
export async function previewJoins(page: Page): Promise<string[]> {
  const line: Locator = page.locator('.preview-head .muted');
  if ((await line.count()) === 0) return [];
  const text = (await line.first().innerText()).replace(/^Joins:\s*/, '');
  return text.split(',').map(join => join.trim());
}

// Opens the metric that is broken down across tables, with its rules and SQL preview showing.
function brokenDownMetric(setId: string): Screen['show'] {
  const { path } = EXPECTED_EXAMPLE_METRICS[setId];
  return async page => {
    await openExampleMetrics(page, setId);
    await selectMetric(page, path.name);
    await openMetricSection(page, 'Rules');
    await openMetricSection(page, 'SQL preview');
    await page.getByRole('checkbox', { name: path.dimension, exact: true }).check();
    await expect(page.getByLabel('SQL preview, not executed')).toBeVisible();
  };
}

// Shows the list with no metric selected, which on a phone is the whole screen.
function metricList(setId: string): Screen['show'] {
  return async page => {
    await openExampleMetrics(page, setId);
    const back = page.getByRole('button', { name: 'All metrics' });
    if (await back.isVisible()) await back.click();
  };
}

/** Lists the metric list and the broken-down metric detail of every example set. */
export function exampleMetricScreens(): Screen[] {
  return Object.keys(EXPECTED_EXAMPLE_METRICS).flatMap(setId => [
    { name: `examples-${setId}-metrics`, show: metricList(setId) },
    { name: `examples-${setId}-metric-detail`, show: brokenDownMetric(setId) },
  ]);
}

// The detail names an owner and a status, and the lineage ends in a contract for every input.
async function expectGovernedWithLineage(page: Page) {
  const detail = metricDetail(page);
  await expect(detail.locator('.kpi-status')).toBeVisible();
  const owner = detail.locator('.kpi-facts div').filter({ hasText: 'Owner' }).locator('dd');
  await expect(owner).not.toHaveText('—');
  const lineage = page.getByRole('region', { name: 'Where the data comes from' });
  await expect(lineage).toBeVisible();
  await expect(lineage).not.toContainText('No data contract declares this source');
  const rows = lineage.locator('.lineage-row');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);
  for (let row = 0; row < rowCount; row++) {
    await expect(rows.nth(row).locator('.odcs-object').first()).toBeVisible();
    await expect(rows.nth(row).locator('.odcs-property').first()).toBeVisible();
  }
}

// The rules list the dimensions the metric can be broken down by, and name the one asked for.
async function expectBreakdown(page: Page, dimension?: string) {
  await openMetricSection(page, 'Rules');
  const rule = page.locator('.rule').filter({ hasText: 'Break down by' });
  await expect(rule.locator('code').first()).toBeVisible();
  if (dimension) await expect(rule.locator('code', { hasText: dimension })).toBeVisible();
}

// The SQL preview shows a statement that is labelled as not executed.
async function expectSqlPreview(page: Page) {
  await openMetricSection(page, 'SQL preview');
  await expect(page.locator('.not-executed')).toHaveText('Preview · not executed');
  await expect(page.getByLabel('SQL preview, not executed')).toContainText('SELECT');
}

/** Checks a metric of one kind: governance, contract lineage, breakdown and SQL preview. */
export async function expectMetricPresented(
  page: Page,
  setId: string,
  kind: 'simple' | 'composed' | 'path',
) {
  const expected: ExpectedExampleMetrics = EXPECTED_EXAMPLE_METRICS[setId];
  const name =
    kind === 'simple' ? expected.simple : expected[kind === 'path' ? 'path' : 'composed'].name;
  await selectMetric(page, name);
  await expectGovernedWithLineage(page);
  await expectBreakdown(page, kind === 'path' ? expected.path.dimension : undefined);
  await expectSqlPreview(page);
  if (kind === 'composed')
    expect(await page.getByRole('treeitem').count()).toBeGreaterThanOrEqual(3);
  if (kind !== 'path') return;
  await page.getByRole('checkbox', { name: expected.path.dimension, exact: true }).check();
  await expect(page.getByLabel('SQL preview, not executed')).toContainText('JOIN');
  expect((await previewJoins(page)).length).toBeGreaterThanOrEqual(expected.path.joins);
}

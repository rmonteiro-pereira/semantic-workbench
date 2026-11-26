// Checks that the approved-metric rules cover a 0.3 draft dataset's own metrics, read from nonportable_extensions.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { guardedChanges } from '../../src/shared/governance/guards';

const settings = { aliases: {}, protectedLevel: 'confidential' as const };
const base = readFileSync(join(import.meta.dir, '../fixtures/ossie-0.3/sales.semantic.yaml'), 'utf8');
const attributes = (status: string) =>
  `    nonportable_extensions:\n      - vendor_name: SEMANTIC_WORKBENCH\n        data:\n          schema: semantic-workbench/metric/v1\n          type: simple\n          status: ${status}\n`;
/** The fixture with workbench attributes on the dataset metric total_revenue and the given expression. */
const withDatasetMetric = (status: string, expression = 'SUM(amount)') =>
  base.replace(
    '      - name: total_revenue\n        expression:\n          sql: SUM(amount)\n',
    `      - name: total_revenue\n        expression:\n          sql: ${expression}\n${attributes(status).replace(/^/gm, '    ')}`,
  );

function changes(before: string, after: string) {
  return guardedChanges({ project: 'sales', path: 'sales.semantic.yaml', before, after }, settings).map(change => ({ pointer: change.pointer, kind: change.kind }));
}

test('approving a dataset metric is a guarded status change at its own place', () => {
  expect(withDatasetMetric('proposed')).not.toBe(base);
  expect(changes(withDatasetMetric('proposed'), withDatasetMetric('approved'))).toEqual([{ pointer: '/datasets/0/metrics/0', kind: 'metric-status' }]);
});

test('changing the formula of an approved dataset metric is a guarded body change', () => {
  expect(changes(withDatasetMetric('approved'), withDatasetMetric('approved', 'SUM(amount) * 2'))).toEqual([{ pointer: '/datasets/0/metrics/0', kind: 'metric-body' }]);
});

test('a model metric and a dataset metric with the same name are guarded separately', () => {
  const twin = withDatasetMetric('approved').replace('  - name: revenue\n', '  - name: total_revenue\n').replace('sql: AGG(orders.total_revenue)', 'sql: SUM(orders.amount)');
  const edited = twin.replace('sql: SUM(amount)\n', 'sql: SUM(amount) * 2\n');
  expect(changes(twin, edited)).toEqual([{ pointer: '/datasets/0/metrics/0', kind: 'metric-body' }]);
});

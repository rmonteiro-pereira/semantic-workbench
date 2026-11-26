// Checks how a 0.3 draft model's metrics are governed: the Metrics view lists, opens and approves only model metrics, and a dataset metric's status is set through the item editor, under the guard.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openFragment, fragmentValue, setField, splice } from '../src/app/edit/fragment';
import { fieldsFor } from '../src/shared/edit/item-model';
import { itemValue } from '../src/shared/edit/yaml-patch';
import { guardedChanges } from '../src/shared/governance/guards';
import { metricPathIn, withMetricAttributes } from '../src/shared/metrics/metric-save';
import { projectMetrics } from '../src/server/agent/explain';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';

const fixture = readFileSync(join(import.meta.dir, 'fixtures/ossie-0.3/sales.semantic.yaml'), 'utf8');
const attributes =
  '        nonportable_extensions:\n          - vendor_name: SEMANTIC_WORKBENCH\n            data:\n              schema: semantic-workbench/metric/v1\n              type: simple\n              status: proposed\n';
/** The fixture where the model metric and the dataset metric share the name total_revenue, both proposed. */
const twins = fixture
  .replace('  - name: revenue\n    expression:\n      sql: AGG(orders.total_revenue)\n', '  - name: total_revenue\n    expression:\n      sql: SUM(orders.amount)\n')
  .replace('      - name: total_revenue\n        expression:\n          sql: SUM(amount)\n', `      - name: total_revenue\n        expression:\n          sql: SUM(amount)\n${attributes}`);
const statusAt = (source: string, path: (string | number)[]) => itemValue(source, path).nonportable_extensions[0].data.status;

beforeAll(async () => {
  await loadDraftValidators();
});

test('the Metrics view lists only the model metric of two metrics that share a name', () => {
  expect(twins).not.toBe(fixture);
  const summaries = projectMetrics([{ id: 'sales/sales.semantic.yaml', project: 'sales', filename: 'sales.semantic.yaml', revision: 1, source: twins }], 'sales');
  expect(summaries.filter(summary => summary.name === 'total_revenue').map(summary => summary.modelPath)).toEqual([[]]);
});

test('opening and approving from the Metrics view reaches the model metric and leaves the dataset metric as it was', () => {
  const path = metricPathIn(twins, [], 'total_revenue');
  expect(path).toEqual(['metrics', 0]);
  const approved = withMetricAttributes(twins, 'sales.semantic.yaml', path!, { status: 'approved' });
  expect(statusAt(approved, ['metrics', 0])).toBe('approved');
  expect(statusAt(approved, ['datasets', 0, 'metrics', 0])).toBe('proposed');
});

test('a dataset metric’s status is set in the item editor, and approving it is a guarded change at its place', () => {
  const fragment = openFragment(twins, ['datasets', 0, 'metrics', 0]);
  const status = fieldsFor('metric', { concepts: [], datasets: [], metrics: [] }).find(field => field.key === 'ext.status')!;
  const original = fragmentValue(fragment, fragment.text).value;
  const edit = setField(fragment.text, fragment, { filename: 'sales.semantic.yaml', kind: 'metric', spec: status, input: 'approved', original });
  const approved = splice(twins, fragment, edit.text);
  expect(statusAt(approved, ['datasets', 0, 'metrics', 0])).toBe('approved');
  expect(statusAt(approved, ['metrics', 0])).toBe('proposed');
  const guarded = guardedChanges({ project: 'sales', path: 'sales.semantic.yaml', before: twins, after: approved }, { aliases: {}, protectedLevel: 'confidential' });
  expect(guarded.map(change => ({ pointer: change.pointer, kind: change.kind }))).toEqual([{ pointer: '/datasets/0/metrics/0', kind: 'metric-status' }]);
});
